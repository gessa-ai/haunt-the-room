// The phones' only websocket door. A local actor grant says ws://127.0.0.1:7300/v1/socket?<token>; phones cannot
// reach that, so /api/join hands out <public origin>/ws?<token> and the upgrade handler pipes the connection to the
// actor gateway. This door also owns the seat count (humans, bots, watchers), the per-socket inbound frame limit,
// read-only watchers, idle and handshake timeouts, and the live upstream count.
import type { Request } from "express"
import type { IncomingMessage, Server } from "node:http"
import { connect, type Socket } from "node:net"
import type { Duplex } from "node:stream"
import { ROOMS, type RoomId } from "../../contract/protocol.ts"
import { config } from "./config.ts"

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"])
const UPSTREAM_PATH = "/v1/socket"
const IDLE_MS = 45_000 // phones ping every 20 s
const HANDSHAKE_MS = 10_000 // the gateway must answer the upgrade within this
const FRAMES_PER_SECOND = 20 // inbound data frames per socket; more are dropped
const MAX_FRAME_BYTES = 64 * 1024
const NEW_UPSTREAMS_PER_SECOND = 700 // a whole room at once passes; bounds churn (RST close keeps ports free)
const RESERVE_MS = 15_000
export const TOTAL_SOCKETS = 400 // the House saturates near 600 (L8): humans and bots together
export const MAX_WATCHERS = 20
export const MAX_STAGES = 3 // big stage frames: each projector socket costs the House

export type SocketRole = "ghost" | "bot" | "stage" | "watch"
interface Grant {
  ghostId: string // "" for stage/watch
  role: SocketRole
  connectByMs: number
}

let gateway: URL | null = null // learned from the grants this process hands out
const grants = new Map<string, Grant>() // grant query -> who it admits
const openSockets = new Map<string, number>() // ghostId -> open sockets
const botIds = new Set<string>()
const botClosers = new Map<string, () => void>() // open bot sockets, so a human can push one out
let botTarget = 120 // bots fill only up to max(0, botTarget - humans)
export const setBotTarget = (n: number): void => void (botTarget = n)
export const getBotTarget = (): number => botTarget
const reservations = new Map<string, { bot: boolean; until: number }>() // seats promised to joins in flight
let watchersOpen = 0
let stagesOpen = 0

// Hide taps are batched (L2): a phone's {"t":"hide","room"} never reaches the House as a socket frame; the door
// queues the latest room per ghost and flushes ONE House.hides() call every 100 ms (tap -> reply p95 4.4 s -> 129 ms).
const ROOM_IDS = new Set<string>(ROOMS.map(r => r.id))
const hideQueue = new Map<string, RoomId>()
let hideSink: ((hides: { ghostId: string; room: RoomId }[]) => Promise<unknown>) | null = null
export const setHideSink = (sink: typeof hideSink): void => void (hideSink = sink)
setInterval(() => {
  if (hideQueue.size === 0 || !hideSink) return
  const hides = [...hideQueue].map(([ghostId, room]) => ({ ghostId, room }))
  hideQueue.clear()
  hideSink(hides).catch(error => console.error(`[ws] House.hides (${hides.length}) failed: ${error instanceof Error ? error.message : error}`))
}, 100).unref()

/** A ghost's hide frame, unmasked: queue it and swallow the frame. Anything else passes. */
function takeHide(ghostId: string, frame: Buffer, offset: number, masked: boolean): boolean {
  const length = frame.length - offset
  if (!ghostId || length > 200) return false
  const payload = Buffer.from(frame.subarray(offset))
  if (masked) {
    const key = frame.subarray(offset - 4, offset)
    for (let i = 0; i < payload.length; i++) payload[i]! ^= key[i % 4]!
  }
  const text = payload.toString("utf8")
  if (!text.includes('"hide"')) return false
  let message: { t?: unknown; room?: unknown }
  try {
    message = JSON.parse(text) as { t?: unknown; room?: unknown }
  } catch {
    return false
  }
  if (message.t !== "hide" || typeof message.room !== "string" || !ROOM_IDS.has(message.room)) return false
  hideQueue.set(ghostId, message.room as RoomId)
  return true
}
let upstreams = 0
let upstreamWindow = { start: 0, count: 0 }

export const isOnline = (ghostId: string): boolean => (openSockets.get(ghostId) ?? 0) > 0
export const upstreamCount = (): number => upstreams

/** Distinct ghosts holding a socket, an unexpired grant or a reservation; plus watchers. */
export function liveCounts(): { humans: number; bots: number; watchers: number; stages: number; upstreams: number } {
  const now = Date.now()
  const live = new Set(openSockets.keys())
  let watchers = watchersOpen
  let stages = stagesOpen
  for (const grant of grants.values()) {
    if (grant.connectByMs < now) continue
    if (grant.role === "watch") watchers++
    else if (grant.role === "stage") stages++
    else if (grant.ghostId) live.add(grant.ghostId)
  }
  for (const [id, r] of reservations) if (r.until >= now) live.add(id)
  let bots = 0
  for (const id of live) if (botIds.has(id) || reservations.get(id)?.bot) bots++
  return { humans: live.size - bots, bots, watchers, stages, upstreams }
}

/**
 * The one join seam: synchronously promise a seat (no await between the check and the promise, so concurrent joins
 * can never overshoot). "full" = past the human cap, "ceiling" = past TOTAL_SOCKETS.
 */
/** Whether this ghost joined as a bot (owner 15:18: a human lie must outrank a bot lie). */
export function isBot(ghostId: string): boolean {
  return botIds.has(ghostId)
}

export function reserveSeat(ghostId: string, bot: boolean): "ok" | "full" | "ceiling" {
  const now = Date.now()
  if (isOnline(ghostId) || reservations.has(ghostId) || [...grants.values()].some(g => g.ghostId === ghostId && g.connectByMs >= now)) return "ok"
  const live = liveCounts()
  if (bot) {
    if (live.bots >= Math.max(0, botTarget - live.humans) || live.humans + live.bots >= TOTAL_SOCKETS) return "ceiling"
  } else {
    if (live.humans >= config.humanCap) return "full"
    // Real players push bots out: over the bot budget or the socket ceiling, close one bot socket for this human.
    if (live.bots > Math.max(0, botTarget - live.humans - 1) || live.humans + live.bots >= TOTAL_SOCKETS) evictOneBot()
    if (live.humans + liveCounts().bots >= TOTAL_SOCKETS) return "full"
  }
  reservations.set(ghostId, { bot, until: now + RESERVE_MS })
  if (bot) botIds.add(ghostId)
  return "ok"
}
function evictOneBot(): void {
  const first = botClosers.entries().next()
  if (first.done) return
  const [id, close] = first.value
  botClosers.delete(id)
  close()
}

export const releaseSeat = (ghostId: string): void => void reservations.delete(ghostId)

export function reserveWatcher(): boolean {
  return liveCounts().watchers < MAX_WATCHERS
}

setInterval(() => {
  const now = Date.now()
  for (const [query, grant] of grants) if (grant.connectByMs < now) grants.delete(query)
  for (const [id, r] of reservations) if (r.until < now) reservations.delete(id)
}, 5_000).unref()
let loggedUpstreams = -1
setInterval(() => {
  if (upstreams === loggedUpstreams) return
  loggedUpstreams = upstreams
  const live = liveCounts()
  console.log(`[ws] upstreams ${upstreams} | online humans ${live.humans} bots ${live.bots} watchers ${live.watchers}`)
}, 10_000).unref()

/** The ws(s) origin the client reached us on ("trust proxy" is loopback, so cloudflared's X-Forwarded-* count). */
const publicWsOrigin = (req: Request) => `${req.protocol === "https" ? "wss" : "ws"}://${req.host}`

/** Rewrite an actor grant to this server's /ws door and remember whom it admits. */
export function exposeGrant(grantUrl: string, req: Request, grant: Grant): string {
  const target = new URL(grantUrl)
  if (target.protocol !== "ws:" || !LOOPBACK.has(target.hostname) || target.pathname !== UPSTREAM_PATH)
    throw new Error(`unexpected actor grant ${target.origin}${target.pathname} (expected a local ws://.../v1/socket)`)
  gateway = new URL(target.origin)
  grants.set(target.search, grant)
  if (grant.ghostId) reservations.delete(grant.ghostId)
  return `${publicWsOrigin(req)}/ws${target.search}`
}

const refuse = (socket: Duplex, status: string) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
const DROP_HEADERS = new Set(["host", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "cf-connecting-ip", "cf-ray", "cf-visitor", "cf-ipcountry", "cdn-loop"])

/** Close a loopback connection with RST when possible (no TIME_WAIT port held after churn). */
function hardClose(socket: Socket): void {
  const reset = (socket as Socket & { resetAndDestroy?: () => void }).resetAndDestroy
  if (typeof reset === "function" && !socket.destroyed) reset.call(socket)
  else socket.destroy()
}

/**
 * Client -> gateway frames, parsed so whole frames can be dropped: data frames over FRAMES_PER_SECOND (or any data
 * frame from a read-only watcher) never reach the House. Control frames (close, ping, pong) always pass.
 */
function inboundFilter(readOnly: boolean, ghostId: string, forward: (bytes: Buffer) => void, fail: (why: string) => void) {
  let pending: Buffer = Buffer.alloc(0)
  let windowStart = 0
  let inWindow = 0
  let droppingMessage = false
  return (chunk: Buffer): void => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
    for (;;) {
      if (pending.length < 2) return
      const opcode = pending[0]! & 0x0f
      const fin = (pending[0]! & 0x80) !== 0
      let length = pending[1]! & 0x7f
      let offset = 2
      if (length === 126) {
        if (pending.length < 4) return
        length = pending.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (pending.length < 10) return
        const big = pending.readBigUInt64BE(2)
        if (big > BigInt(MAX_FRAME_BYTES)) return fail("frame too large")
        length = Number(big)
        offset = 10
      }
      if (length > MAX_FRAME_BYTES) return fail("frame too large")
      const masked = (pending[1]! & 0x80) !== 0
      if (masked) offset += 4 // client frames are masked
      if (pending.length < offset + length) return
      const frame = pending.subarray(0, offset + length)
      pending = pending.subarray(offset + length)
      if (opcode >= 0x8) {
        forward(frame)
        continue
      }
      const starts = opcode !== 0x0
      if (starts) {
        const now = Date.now()
        if (now - windowStart >= 1000) (windowStart = now), (inWindow = 0)
        droppingMessage = readOnly || ++inWindow > FRAMES_PER_SECOND
      }
      if (!droppingMessage && !(opcode === 0x1 && fin && takeHide(ghostId, frame, offset, masked))) forward(frame)
      if (fin) droppingMessage = false
    }
  }
}

/** Pipe /ws upgrades to the gateway. Other upgrades go to other listeners (Vite HMR) or are refused in production. */
export function attachWebSocketProxy(server: Server, othersHandleUpgrades: boolean): void {
  server.on("upgrade", (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://local")
    if (url.pathname !== "/ws") return void (othersHandleUpgrades || refuse(client, "404 Not Found"))
    const upstream = gateway
    const grant = grants.get(url.search)
    if (!upstream || !grant) return refuse(client, "403 Forbidden") // no grant from this server: join again
    grants.delete(url.search)
    const now = Date.now()
    if (now - upstreamWindow.start >= 1000) upstreamWindow = { start: now, count: 0 }
    if (++upstreamWindow.count > NEW_UPSTREAMS_PER_SECOND) return refuse(client, "503 Service Unavailable")

    const lines = [`GET ${UPSTREAM_PATH}${url.search} HTTP/1.1`, `Host: ${upstream.host}`]
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      if (!DROP_HEADERS.has(req.rawHeaders[i]!.toLowerCase())) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)

    const ghostId = grant.role === "ghost" || grant.role === "bot" ? grant.ghostId : ""
    if (ghostId) openSockets.set(ghostId, (openSockets.get(ghostId) ?? 0) + 1)
    if (grant.role === "watch") watchersOpen++
    if (grant.role === "stage") stagesOpen++
    upstreams++
    let closed = false
    let answered = false
    const isBot = grant.role === "bot"
    let lastInbound = Date.now()
    const actorSide = connect(Number(upstream.port || 80), upstream.hostname)
    const finish = () => {
      if (closed) return
      closed = true
      clearInterval(timers)
      if (isBot && botClosers.get(ghostId)) botClosers.delete(ghostId)
      upstreams--
      if (grant.role === "watch") watchersOpen--
      if (grant.role === "stage") stagesOpen--
      if (ghostId) {
        const left = (openSockets.get(ghostId) ?? 1) - 1
        if (left > 0) openSockets.set(ghostId, left)
        else openSockets.delete(ghostId)
      }
      hardClose(actorSide)
      client.destroy()
    }
    if (isBot) botClosers.set(ghostId, () => finish())
    const timers = setInterval(() => {
      const t = Date.now()
      if ((!answered && t - now > HANDSHAKE_MS) || t - lastInbound > IDLE_MS) finish()
    }, 1_000)
    const filter = inboundFilter(grant.role === "watch", ghostId, bytes => actorSide.write(bytes), why => {
      console.error(`[ws] closing ${grant.role} ${ghostId}: ${why}`)
      finish()
    })
    actorSide.setNoDelay(true)
    actorSide.on("connect", () => {
      actorSide.write(`${lines.join("\r\n")}\r\n\r\n`)
      if (head.length > 0) filter(head)
      client.on("data", (chunk: Buffer) => {
        lastInbound = Date.now()
        filter(chunk)
      })
    })
    actorSide.on("data", (chunk: Buffer) => {
      answered = true
      if (!client.write(chunk)) {
        actorSide.pause()
        client.once("drain", () => actorSide.resume())
      }
    })
    actorSide.on("error", error => {
      if (!answered && client.writable) refuse(client, "502 Bad Gateway")
      if (!closed) console.error(`[ws] actor gateway ${upstream.host}: ${error.message}`)
      finish()
    })
    actorSide.on("close", finish)
    client.on("error", finish)
    client.on("close", finish)
    client.on("end", finish)
  })
}
