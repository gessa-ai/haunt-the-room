// Tiny fake House + server for building bots before L2/L5 land the beat loop. Speaks contract/protocol.ts
// (THE LOOP: intro -> 8 x [hide, hunting, reveal] -> finale -> lobby, auto); not the real rules.
//   PORT=7340 bun bots/dev/fakeHouse.ts
//   curl -XPOST 'localhost:7340/dev/humans?n=10'   pretend 10 humans are online (exercise --fill retirement)
import type { ServerWebSocket } from "bun"
import {
  BEATS_PER_ROUND, HUNTERS, ROOMS, SWEEPS_PER_BEAT, TIMING, possessThreshold, roomCapacity,
  type HouseToPhone, type Phase, type RoomId, type RoomState,
} from "../../contract/protocol.ts"
import { presenterToken } from "../src/util.ts"

const PORT = Number(process.env.PORT ?? 7340)
const TOKEN = presenterToken() ?? "dev"
const IDS = ROOMS.map((r) => r.id) as RoomId[]
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!
const log = (s: string) => console.log(`[fake ${new Date().toTimeString().slice(0, 8)}] ${s}`)

type Sock = ServerWebSocket<{ id: string }>
interface G { id: string; bot: boolean; room: RoomId | null; caught: boolean; caughtBeat: number; score: number; ws: Sock | null; colorIndex: number }
const ghosts = new Map<string, G>()
let fakeHumans = 0
let phase: Phase = "lobby"
let endsAt = Date.now() + TIMING.lobbyMs / 4
let beat = 0
let round = 1
const rooms = new Map<RoomId, RoomState>(IDS.map((id) => [id, { id, count: 0, cap: 3, possessed: false, swept: false }]))
const tally = { joinedToday: 0, sweeps: 0, caught: 0, whispers: 0, possessions: 0 }
const lured = new Set<string>()

const send = (g: G, m: HouseToPhone) => g.ws?.send(JSON.stringify(m))
const you = (g: G) => send(g, { t: "you", publicId: g.id.slice(0, 8), room: g.room, score: g.score, caught: g.caught, name: `Wraith ${g.id.slice(0, 4)}`, colorIndex: g.colorIndex, rank: 0, of: 0, streak: 0 })
const online = () => [...ghosts.values()].filter((g) => g.ws)
const json = (x: unknown, status = 200) => Response.json(x, { status, headers: { "cache-control": "no-store" } })
function stats() {
  const on = online()
  const bots = on.filter((g) => g.bot).length
  const humans = on.length - bots + fakeHumans
  return { online: bots + humans, humans, bots, ...tally, rounds: round }
}
const phaseMsg = (): HouseToPhone => ({ t: "phase", phase, endsAt, beat, round, winner: phase === "finale" ? ([...rooms.values()].filter((r) => r.possessed).length >= 2 ? "ghosts" : "hunters") : null })
function enter(p: Phase, ms: number) {
  phase = p
  endsAt = Date.now() + ms
  for (const g of online()) send(g, phaseMsg())
}
function next() {
  const now = Date.now()
  if (phase === "lobby") { round++; beat = 0; for (const g of ghosts.values()) g.caught = false; for (const r of rooms.values()) r.possessed = false; return enter("intro", TIMING.introMs) }
  if (phase === "intro" || phase === "reveal") {
    if (beat === BEATS_PER_ROUND) return enter("finale", TIMING.finaleMs)
    beat++
    for (const g of ghosts.values()) if (g.caught && beat > g.caughtBeat + 1) g.caught = false // caught = out for the next beat
    for (const r of rooms.values()) r.swept = false
    lured.clear()
    enter("hide", TIMING.hideMs)
    for (const g of online()) you(g)
    return
  }
  if (phase === "hide") return enter("hunting", TIMING.huntingMs)
  if (phase === "hunting") {
    const on = online()
    const counts = (id: RoomId) => on.filter((g) => g.room === id && !g.caught).length
    const swept = [...IDS].sort((a, b) => counts(b) - counts(a) + (Math.random() - 0.5)).slice(0, SWEEPS_PER_BEAT)
    const need = possessThreshold(on.length + fakeHumans)
    for (const r of rooms.values()) {
      r.swept = swept.includes(r.id)
      if (r.swept) r.possessed = false
      else if (counts(r.id) >= need && !r.possessed) { r.possessed = true; tally.possessions++ }
    }
    tally.sweeps += swept.length
    for (const g of on) {
      if (g.caught || !g.room) continue
      const hit = swept.includes(g.room)
      if (hit) { g.caught = true; g.caughtBeat = beat; tally.caught++ } else g.score += 100
      send(g, { t: "result", kind: hit ? "caught" : rooms.get(g.room)!.possessed ? "possessed" : "safe", points: hit ? 0 : 100, streak: 0, text: hit ? "CAUGHT" : "SAFE" })
      you(g)
    }
    log(`reveal beat ${beat}: swept ${swept.join("+")} | ${IDS.map((id) => `${id} ${counts(id)}${rooms.get(id)!.possessed ? "*" : ""}`).join(" ")}`)
    return enter("reveal", TIMING.revealMs)
  }
  if (phase === "finale") return enter("lobby", 5_000)
  void now
}

const server = Bun.serve<{ id: string }, {}>({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      const id = url.searchParams.get("g") ?? ""
      if (!ghosts.has(id)) return new Response("no grant", { status: 403 })
      return srv.upgrade(req, { data: { id } }) ? undefined : new Response("upgrade failed", { status: 400 })
    }
    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = (await req.json()) as { ghostId?: string; bot?: boolean }
      if (!body.ghostId) return json({ error: "ghostId required" }, 400)
      if (body.bot && req.headers.get("x-presenter-token") !== TOKEN) return json({ error: "bot joins need x-presenter-token" }, 403)
      let g = ghosts.get(body.ghostId)
      if (!g) {
        g = { id: body.ghostId, bot: !!body.bot, room: null, caught: false, caughtBeat: 0, score: 0, ws: null, colorIndex: ghosts.size % 8 }
        ghosts.set(g.id, g)
        if (!g.bot) tally.joinedToday++
      }
      return json({ ghost: { id: g.id, name: `Wraith ${g.id.slice(0, 4)}` }, ghostToken: `gt-${g.id}`, websocketUrl: `ws://127.0.0.1:${PORT}/ws?g=${g.id}`, connectByMs: Date.now() + 10_000 })
    }
    if (url.pathname === "/api/stats") return json(stats())
    if (req.method === "POST" && url.pathname === "/api/whisper") {
      const body = (await req.json()) as { ghostId: string; ghostToken: string; room: RoomId }
      if (body.ghostToken !== `gt-${body.ghostId}`) return json({ error: "bad ghostToken" }, 403)
      if (!rooms.has(body.room)) return json({ error: "room required" }, 400)
      if (phase !== "hide") return json({ error: "lures only during hide" }, 409)
      if (lured.has(body.ghostId)) return json({ error: "one lure per ghost per beat" }, 429)
      lured.add(body.ghostId)
      tally.whispers++
      const hunter = pick(HUNTERS).id
      log(`lure ${body.room} from ${body.ghostId.slice(0, 8)} -> ${hunter}`)
      return json({ ok: true, hunter })
    }
    if (req.method === "POST" && url.pathname === "/dev/humans") return json({ humans: (fakeHumans = Number(url.searchParams.get("n") ?? 0)) })
    return json({ error: "not found" }, 404)
  },
  websocket: {
    open(ws) {
      const g = ghosts.get(ws.data.id)!
      g.ws?.close(4000, "replaced")
      g.ws = ws
      you(g)
      send(g, phaseMsg())
    },
    message(ws, raw) {
      const g = ghosts.get(ws.data.id)!
      if (String(raw) === '{"t":"ping"}') return void ws.send('{"t":"pong"}')
      const m = JSON.parse(String(raw)) as { t: string; room?: RoomId }
      if (m.t !== "hide" || !m.room || !rooms.has(m.room)) return
      const r = rooms.get(m.room)!
      if (phase === "hide" && !g.caught && (g.room === m.room || r.count < r.cap)) { g.room = m.room; r.count = online().filter((x) => x.room === r.id && !x.caught).length }
      you(g) // refused hides answer with the unchanged room
    },
    close(ws) {
      const g = ghosts.get(ws.data.id)
      if (g?.ws === ws) g.ws = null
    },
  },
})

setInterval(() => {
  if (Date.now() >= endsAt) next()
  if (phase !== "hide") return
  const on = online()
  for (const r of rooms.values()) { r.count = on.filter((g) => g.room === r.id && !g.caught).length; r.cap = roomCapacity(on.length + fakeHumans) }
  const frame = JSON.stringify({ t: "rooms", rooms: [...rooms.values()] })
  for (const g of on) g.ws!.send(frame)
}, 500)

log(`fake House on :${server.port} (pid ${process.pid}), auto rounds`)
