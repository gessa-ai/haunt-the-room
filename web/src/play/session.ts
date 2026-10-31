// One phone's link to the House: POST /api/join for a single-use grant, open the socket, keep it honest (ping
// every 20 s; if the house goes quiet, ping now and give it 2 s), and on any loss re-join with jittered backoff.
import type { GhostRecord, HouseToPhone, HunterId, Phase, PhoneToHouse, RoomId, RoomState } from "../../../contract/protocol"
import { HUNTERS, ROOMS } from "../../../contract/protocol"

export type LinkStatus = "joining" | "live" | "down"

export interface SessionHandlers {
  /** The house is at its player cap: we are a spectator; the session retries on its own. */
  full(retryInMs: number): void
  status(s: LinkStatus, detail: string): void
  joined(ghost: GhostRecord, ghostToken: string | null): void
  message(m: HouseToPhone): void
}

export interface Session {
  /** Hide in a room this beat (last one before the bell counts); false when the socket is not open. */
  hide(room: RoomId): boolean
  /** Light this ghost up with its name on the projector; false when the socket is not open. */
  wave(): boolean
  close(): void
}

const PING_EVERY_MS = 20_000
const QUIET_MS = 8_000
const PONG_WITHIN_MS = 8_000 // venue wifi with 300 phones: never call a slow pong a dead house
const OPEN_WITHIN_MS = 10_000
const JOIN_TIMEOUT_MS = 10_000
const PING = JSON.stringify({ t: "ping" } satisfies PhoneToHouse)
const ROOM_IDS: ReadonlySet<string> = new Set(ROOMS.map((r) => r.id))
const HUNTER_IDS: ReadonlySet<string> = new Set(HUNTERS.map((h) => h.id))

class HouseFull extends Error {}
const FULL_RETRY_MS = 20_000

class JoinRefused extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterS: number,
  ) {
    super(`join: HTTP ${status}`)
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
const isRoom = (v: unknown): v is RoomId => typeof v === "string" && ROOM_IDS.has(v)
const isHunter = (v: unknown): v is HunterId => typeof v === "string" && HUNTER_IDS.has(v)
type ResultKind = Extract<HouseToPhone, { t: "result" }>["kind"]
const RESULT_KINDS: ReadonlySet<string> = new Set<ResultKind>(["safe", "caught", "possessed", "lie"])
const PHASES: ReadonlySet<string> = new Set<Phase>(["lobby", "intro", "hide", "hunting", "reveal", "finale"])
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** Parse one frame from the house; anything off-contract is dropped, never half-trusted. */
function parse(raw: unknown): HouseToPhone | null {
  if (typeof raw !== "string") return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(m)) return null
  switch (m.t) {
    case "you": {
      const { room, name } = m
      if ((room !== null && !isRoom(room)) || typeof name !== "string") return null
      const you: Extract<HouseToPhone, { t: "you" }> = { t: "you", publicId: typeof m.publicId === "string" ? m.publicId : "", room, score: num(m.score), caught: m.caught === true, name, colorIndex: num(m.colorIndex), rank: num(m.rank), of: num(m.of), streak: num(m.streak) }
      // Optional (requested from L2): the name of the ghost you just overtook, for "You passed Wraith #212!".
      if (typeof m.passed === "string") Object.assign(you, { passed: m.passed.slice(0, 40) })
      return you
    }
    case "phase": {
      const { phase, winner } = m
      if (typeof phase !== "string" || !PHASES.has(phase)) return null
      return {
        t: "phase",
        phase: phase as Phase,
        endsAt: num(m.endsAt),
        beat: num(m.beat),
        round: num(m.round),
        winner: winner === "ghosts" || winner === "hunters" ? winner : null,
      }
    }
    case "rooms": {
      if (!Array.isArray(m.rooms)) return null
      const rooms = m.rooms.filter(isRecord).filter((r) => isRoom(r.id))
      const leans = Array.isArray(m.leans)
        ? m.leans.filter((x): x is [HunterId, RoomId] => Array.isArray(x) && isHunter(x[0]) && isRoom(x[1]))
        : undefined
      return {
        t: "rooms",
        ...(leans ? { leans } : {}),
        rooms: rooms.map((r) => {
          const room: RoomState = { id: r.id as RoomId, count: num(r.count), cap: num(r.cap), possessed: r.possessed === true, swept: r.swept === true }
          if (Array.isArray(r.seated))
            room.seated = r.seated
              .filter((x): x is [string, number, number] => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "number" && typeof x[2] === "number")
              .slice(0, 4)
          return room
        }),
      }
    }
    case "say": {
      const { hunter, text } = m
      return isHunter(hunter) && typeof text === "string" ? { t: "say", hunter, text: text.slice(0, 140) } : null
    }
    case "result": {
      const { kind, text, hunter } = m
      if (typeof kind !== "string" || !RESULT_KINDS.has(kind)) return null
      const r: Extract<HouseToPhone, { t: "result" }> = {
        t: "result",
        kind: kind as ResultKind,
        points: num(m.points),
        streak: num(m.streak),
        text: typeof text === "string" ? text.slice(0, 80) : "",
      }
      if (isHunter(hunter)) r.hunter = hunter
      return r
    }
    case "pong":
      return { t: "pong" }
    default:
      return null
  }
}

interface Grant {
  ghost: GhostRecord
  /** Proves this phone owns the ghost on POST /api/whisper (L5, 12:50; not yet in contract/protocol.ts). */
  ghostToken: string | null
  websocketUrl: string
  connectByMs: number
}

function parseGrant(body: unknown): Grant {
  if (!isRecord(body) || !isRecord(body.ghost)) throw new Error("join: no ghost in the response")
  const { websocketUrl, connectByMs } = body
  if (typeof websocketUrl !== "string" || typeof connectByMs !== "number") throw new Error("join: no websocket grant")
  // Absolute ws(s) URL from the server, or a path on this origin (the server proxies the house).
  const url = new URL(websocketUrl, location.href)
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error(`join: bad websocket url ${websocketUrl}`)
  const ghostToken = typeof body.ghostToken === "string" ? body.ghostToken : null
  return { ghost: body.ghost as unknown as GhostRecord, ghostToken, websocketUrl: url.toString(), connectByMs }
}

/** Every retry waits. 0: 0.7 s + 0-0.6 s jitter (a room of phones never reconnects in lockstep), then doubling to ~4 s. */
function backoff(attempt: number): number {
  return Math.min(4_000, 700 * 2 ** attempt) + Math.round(Math.random() * 600)
}

export function openSession(ghostId: string, on: SessionHandlers): Session {
  let closed = false
  let ws: WebSocket | null = null
  let joinAbort: AbortController | null = null
  let wakeSleep: (() => void) | null = null
  let dropSocket: ((why: string) => void) | null = null
  let checkNow: (() => void) | null = null
  let lastWhy = ""

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        wakeSleep = null
        resolve()
      }
      wakeSleep = done
    })

  async function join(): Promise<Grant> {
    joinAbort = new AbortController()
    const timer = setTimeout(() => joinAbort?.abort(), JOIN_TIMEOUT_MS)
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ghostId }),
        cache: "no-store",
        signal: joinAbort.signal,
      })
      const body: unknown = await res.json().catch(() => null)
      // Over the player cap the server answers as a spectator (shape: spectator/full flag, per L5).
      if (isRecord(body) && (body.spectator === true || body.full === true)) throw new HouseFull()
      if (!res.ok) throw new JoinRefused(res.status, Number(res.headers.get("Retry-After")) || 0)
      return parseGrant(body)
    } finally {
      clearTimeout(timer)
      joinAbort = null
    }
  }

  /** Runs one socket until it closes or is abandoned. Resolves true if the house ever spoke on it. */
  function runSocket(grant: Grant): Promise<boolean> {
    return new Promise((resolve) => {
      let heard = false
      let settled = false
      const sock = new WebSocket(grant.websocketUrl)
      ws = sock
      let watchdog: ReturnType<typeof setTimeout> | undefined
      let quiet: ReturnType<typeof setTimeout> | undefined
      const openTimer = setTimeout(() => finish("socket did not open"), OPEN_WITHIN_MS)
      const pinger = setInterval(() => ping(), PING_EVERY_MS)

      function ping() {
        if (sock.readyState !== WebSocket.OPEN) return
        sock.send(PING)
        if (watchdog === undefined) watchdog = setTimeout(() => finish("no pong"), PONG_WITHIN_MS)
      }
      function heardNow() {
        clearTimeout(watchdog)
        watchdog = undefined
        clearTimeout(quiet)
        quiet = setTimeout(ping, QUIET_MS)
      }
      function finish(why: string) {
        if (settled) return
        settled = true
        clearTimeout(openTimer)
        clearInterval(pinger)
        clearTimeout(watchdog)
        clearTimeout(quiet)
        sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null
        // Abandon without waiting for a close handshake that a dead network never finishes.
        if (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN) {
          try {
            sock.close(1000, why.slice(0, 100))
          } catch {
            // already closing
          }
        }
        if (ws === sock) ws = null
        dropSocket = null
        checkNow = null
        lastWhy = why
        if (!closed) console.info(`[play] house link ended: ${why}`)
        resolve(heard)
      }
      dropSocket = finish
      checkNow = ping

      sock.onopen = () => {
        clearTimeout(openTimer)
        heardNow()
      }
      sock.onmessage = (e: MessageEvent) => {
        heardNow()
        const m = parse(e.data)
        if (!m) {
          console.debug("[play] ignored off-contract message", e.data)
          return
        }
        if (!heard) {
          heard = true
          on.status("live", "")
        }
        on.message(m)
      }
      sock.onerror = () => {
        // a close event always follows
      }
      sock.onclose = (e: CloseEvent) => finish(`closed ${e.code}${e.reason ? ` ${e.reason}` : ""}`)
    })
  }

  async function loop() {
    let attempt = 0
    while (!closed) {
      let grant: Grant
      try {
        grant = await join()
      } catch (err) {
        if (closed) return
        if (err instanceof HouseFull) {
          on.full(FULL_RETRY_MS)
          await sleep(FULL_RETRY_MS + Math.round(Math.random() * 2_000))
          continue
        }
        on.status(attempt === 0 ? "joining" : "down", err instanceof Error ? err.message : String(err))
        // 429/503 say when to come back: honour Retry-After (plus jitter), else back off.
        const retryMs = err instanceof JoinRefused && err.retryAfterS > 0 ? err.retryAfterS * 1000 + Math.round(Math.random() * 600) : 0
        await sleep(Math.max(retryMs, backoff(attempt++)))
        continue
      }
      if (closed) return
      on.joined(grant.ghost, grant.ghostToken)
      // No client-side connectByMs check: the phone clock is not the server clock. A refused grant closes the
      // socket (or misses the open timeout) and we come back here after a backoff.
      const heard = await runSocket(grant)
      if (closed) return
      attempt = heard ? 0 : attempt + 1
      on.status("down", lastWhy)
      await sleep(backoff(attempt))
    }
  }

  const wake = () => {
    if (closed) return
    if (ws && ws.readyState === WebSocket.OPEN) checkNow?.()
    else wakeSleep?.()
  }
  const onVisible = () => {
    if (document.visibilityState === "visible") wake()
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) dropSocket?.("restored from back-forward cache")
    wake()
  }
  document.addEventListener("visibilitychange", onVisible)
  window.addEventListener("online", wake)
  window.addEventListener("pageshow", onPageShow)

  function send(m: PhoneToHouse): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(m))
    return true
  }

  on.status("joining", "")
  void loop()

  return {
    hide(room) {
      return send({ t: "hide", room })
    },
    wave() {
      return send({ t: "wave" })
    },
    close() {
      if (closed) return
      closed = true
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", wake)
      window.removeEventListener("pageshow", onPageShow)
      joinAbort?.abort()
      dropSocket?.("left")
      wakeSleep?.()
    },
  }
}
