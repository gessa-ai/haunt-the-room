// @ts-check
// L6 dev mock (never deployed): a fake server + House on :5361 speaking contract/protocol.ts (the beat loop) so
// the phone can be built and screenshotted on its own. Naive and in-memory by design.
//   bun web/src/play/dev/mock-server.js        then open http://localhost:5361/p
// Dev controls (POST): /dev/start (intro -> 8 beats -> finale)  /dev/lobby  /dev/hold/1|0 (freeze phase timers)
//   /dev/next (advance one phase)  /dev/sweep?rooms=attic,crypt (force the next reveal)  /dev/kill?downMs=2500
//   /dev/finale?winner=ghosts|hunters
import { existsSync } from "node:fs"
import path from "node:path"
import { roomCapacity, BEATS_PER_ROUND, GHOST_COLORS, HUNTERS, ROOMS, ROOMS_TO_WIN, SCORE, SWEEPS_PER_BEAT, TIMING, lureText, possessThreshold, safePoints } from "../../../../contract/protocol.ts"

/** @typedef {import("../../../../contract/protocol").RoomId} RoomId */
/** @typedef {import("../../../../contract/protocol").HunterId} HunterId */
/** @typedef {import("../../../../contract/protocol").Phase} Phase */
/** @typedef {import("../../../../contract/protocol").HouseToPhone} HouseToPhone */
/** @typedef {{ id: string, name: string, color: string, colorIndex: number, createdAt: number, score: number, room: RoomId | null, caught: boolean, outBeat: number, streak: number, bot: boolean, lureBeat: number }} Ghost */

const PORT = Number(process.env.PORT || 5361)
const DEV = import.meta.dir
const ART = path.resolve(DEV, "../../../public/art")
const ROOM_IDS = /** @type {RoomId[]} */ (ROOMS.map((r) => r.id))
const BOTS = Number(process.env.BOTS ?? 22)
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a)
const pick = (/** @type {any[]} */ xs) => xs[Math.floor(Math.random() * xs.length)]
const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}
const KINDS = ["Wraith", "Shade", "Wisp", "Phantom", "Specter", "Banshee", "Revenant", "Spirit"]
const LINES = ["The Attic is too quiet.", "They crowd where it's warm. Library.", "I sense them. So many. The Crypt!", "Skeptic, the numbers?", "Two rooms. Choose well.", "The Priest blessed the wrong door again."]

/** @type {Map<string, Ghost>} */
const ghosts = new Map()
/** @type {Map<string, Set<any>>} */
const socks = new Map()
const rooms = new Map(ROOM_IDS.map((id) => [id, { id, count: 0, cap: 3, possessed: false, swept: false }]))
let phase = /** @type {{ phase: Phase, endsAt: number, beat: number, round: number, winner: "ghosts" | "hunters" | null }} */ ({ phase: "lobby", endsAt: 0, beat: 0, round: 0, winner: null })
let hold = false
let forced = /** @type {RoomId[] | null} */ (null)
let downUntil = 0
/** @type {{ ghostId: string, room: RoomId, hunter: HunterId }[]} */
let lures = []

function ensureGhost(id, bot = false) {
  let g = ghosts.get(id)
  if (!g) {
    const h = hash(id)
    const colorIndex = h % GHOST_COLORS.length
    g = { id, name: `${KINDS[(h >>> 3) % KINDS.length]} #${100 + ((h >>> 7) % 900)}`, color: GHOST_COLORS[colorIndex] ?? "#e8e8ff", colorIndex, createdAt: Date.now(), score: 0, room: null, caught: false, outBeat: -1, streak: 0, bot, lureBeat: -1 }
    ghosts.set(id, g)
  }
  return g
}
for (let i = 0; i < BOTS; i++) ensureGhost(`bot-${i}`, true)
ensureGhost("bot-0", true).streak = 4 // one bot is on fire, so faces and the crackle show up
const online = () => [...ghosts.values()].filter((g) => g.bot || socks.has(g.id))
const publicOf = (id) => new Bun.CryptoHasher("sha256").update(`haunt:${id}`).digest("hex").slice(0, 10)
const tokenOf = (id) => `tok-${hash(`${id}:mock-secret`).toString(36)}`

/** @param {string} id @param {HouseToPhone} msg */
function tell(id, msg) {
  for (const ws of socks.get(id) ?? []) ws.send(JSON.stringify(msg))
}
const tellAll = (/** @type {HouseToPhone} */ msg) => {
  for (const id of socks.keys()) tell(id, msg)
}
/** @type {Map<string, number>} */
const lastRank = new Map()
function you(/** @type {Ghost} */ g) {
  const board = online().sort((a, b) => b.score - a.score)
  const rank = board.indexOf(g) + 1
  const before = lastRank.get(g.id) ?? rank
  lastRank.set(g.id, rank)
  const passed = rank < before ? board[rank]?.name : undefined
  tell(g.id, { t: "you", publicId: publicOf(g.id), room: g.room, score: g.score, caught: g.caught, name: g.name, colorIndex: g.colorIndex, rank, of: board.length, streak: g.streak, ...(passed ? { passed } : {}) })
}
/** @type {[HunterId, RoomId][]} */
let leans = []
const roomsMsg = () => ({ t: /** @type {const} */ ("rooms"), rooms: [...rooms.values()], ...(phase.phase === "hide" ? { leans } : {}) })
let houseFull = false
function recount() {
  const cap = roomCapacity(online().length)
  for (const r of rooms.values()) Object.assign(r, { count: 0, cap })
  for (const r of rooms.values()) r.seated = []
  for (const g of online()) {
    if (!g.room || g.caught) continue
    const r = rooms.get(g.room)
    r.count += 1
    if (r.seated.length < 4) r.seated.push([publicOf(g.id), g.colorIndex, g.streak])
  }
}

const DUR = { lobby: TIMING.lobbyMs, intro: TIMING.introMs, hide: TIMING.hideMs, hunting: TIMING.huntingMs, reveal: TIMING.revealMs, finale: TIMING.finaleMs }
function setPhase(/** @type {Phase} */ p, extra = {}) {
  phase = { ...phase, phase: p, endsAt: Date.now() + DUR[p], winner: null, ...extra }
  if (p === "hide") {
    for (const r of rooms.values()) r.swept = false
    for (const g of ghosts.values()) {
      if (g.caught && g.outBeat < phase.beat) g.caught = false
      g.room = g.bot && !g.caught && Math.random() < 0.85 ? pick(ROOM_IDS) : null
    }
    recount()
  }
  if (p === "hunting" || p === "hide") say()
  if (p === "reveal") resolve()
  tellAll({ t: "phase", ...phase })
  tellAll(roomsMsg())
  for (const id of socks.keys()) you(ensureGhost(id))
  log(`phase ${p}${phase.beat ? ` beat ${phase.beat}` : ""}`)
}
function say() {
  setTimeout(() => tellAll({ t: "say", hunter: pick(HUNTERS).id, text: pick(LINES) }), 600)
  setTimeout(() => tellAll({ t: "say", hunter: pick(HUNTERS).id, text: pick(LINES) }), 2000)
}
function resolve() {
  recount()
  const swept = forced ?? [...rooms.values()].sort((a, b) => b.count - a.count + (Math.random() - 0.5) * 3).slice(0, SWEEPS_PER_BEAT).map((r) => r.id)
  forced = null
  const n = online().length
  for (const id of swept) Object.assign(rooms.get(id), { swept: true, possessed: false })
  for (const g of online()) {
    if (g.caught) continue
    if (!g.room) {
      // no seat at the bell = caught
      Object.assign(g, { caught: true, outBeat: phase.beat + 1, streak: 0 })
      tell(g.id, { t: "result", kind: "caught", points: 0, streak: 0, text: "" })
      continue
    }
    if (swept.includes(g.room)) {
      const hunter = pick(HUNTERS).id
      Object.assign(g, { caught: true, outBeat: phase.beat + 1, streak: 0 })
      tell(g.id, { t: "result", kind: "caught", points: 0, streak: 0, text: "", hunter })
    } else {
      const pts = safePoints(rooms.get(g.room).count / n, g.streak)
      g.score += pts
      tell(g.id, { t: "result", kind: "safe", points: pts, streak: g.streak, text: "" })
      g.streak += 1
    }
  }
  for (const r of rooms.values()) {
    if (r.swept || r.possessed || r.count < possessThreshold(n)) continue
    r.possessed = true
    for (const g of online()) if (g.room === r.id && !g.caught) (g.score += SCORE.possessRoom), tell(g.id, { t: "result", kind: "possessed", points: SCORE.possessRoom, streak: g.streak, text: `${ROOMS.find((x) => x.id === r.id)?.name} is yours.` })
  }
  for (const l of lures) {
    const r = rooms.get(l.room)
    if (!swept.includes(l.room) || r.count > 1) continue
    const g = ghosts.get(l.ghostId)
    if (g) (g.score += SCORE.lieWorked), tell(g.id, { t: "result", kind: "lie", points: SCORE.lieWorked, streak: g.streak, text: `${HUNTERS.find((h) => h.id === l.hunter)?.name} swept an empty room.` })
  }
  lures = []
}
function next() {
  const p = phase.phase
  if (p === "lobby") setPhase("intro", { beat: 0, round: phase.round + 1 })
  else if (p === "intro") setPhase("hide", { beat: 1 })
  else if (p === "hide") setPhase("hunting")
  else if (p === "hunting") setPhase("reveal")
  else if (p === "reveal") phase.beat >= BEATS_PER_ROUND ? setPhase("finale", { winner: [...rooms.values()].filter((r) => r.possessed).length >= ROOMS_TO_WIN ? "ghosts" : "hunters" }) : setPhase("hide", { beat: phase.beat + 1 })
  else setPhase("lobby", { beat: 0 })
}
setInterval(() => {
  if (Date.now() < downUntil || hold || phase.phase === "lobby" || Date.now() < phase.endsAt) return
  next()
}, 100)
setInterval(() => {
  if (Date.now() < downUntil) return
  if (phase.phase !== "hide") return tellAll(roomsMsg()) // the live House keeps sending rooms at 2 Hz in every phase
  for (const g of ghosts.values()) if (g.bot && !g.caught && Math.random() < 0.15) g.room = pick(ROOM_IDS)
  if (leans.length === 0 || Math.random() < 0.25) leans = HUNTERS.map((h) => [h.id, pick(ROOM_IDS)])
  recount()
  tellAll(roomsMsg())
}, 500)

// ---------- bundle ----------
/** @type {Promise<{ js: string, css: string, assets: Map<string, Blob> }> | null} */
let bundle = null
function getBundle() {
  bundle ??= (async () => {
    const out = await Bun.build({ entrypoints: [path.join(DEV, "mock-entry.ts")], target: "browser", sourcemap: "inline", publicPath: "/dev/" })
    if (!out.success) throw new Error(out.logs.map(String).join("\n"))
    let js = ""
    let css = ""
    const assets = new Map()
    for (const o of out.outputs) {
      if (o.path.endsWith(".css")) css += await o.text()
      else if (o.kind === "entry-point") js = await o.text()
      else assets.set(path.basename(o.path), o)
    }
    return { js, css, assets }
  })()
  bundle.catch(() => (bundle = null))
  return bundle
}
const { watch } = await import("node:fs")
watch(path.resolve(DEV, "../.."), { recursive: true }, () => (bundle = null))

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } })
const noStore = { "cache-control": "no-store" }
/** @type {Map<string, { ghostId: string, exp: number }>} */
const grants = new Map()

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, srv) {
    const url = new URL(req.url)
    const p = url.pathname
    const post = req.method === "POST"
    if (p === "/ws") {
      const token = url.searchParams.get("grant") ?? ""
      const g = grants.get(token)
      grants.delete(token)
      if (!g || Date.now() > g.exp || Date.now() < downUntil) return new Response("grant missing, used or expired", { status: 403 })
      return srv.upgrade(req, { data: { ghostId: g.ghostId } }) ? undefined : new Response("upgrade failed", { status: 400 })
    }
    if (p === "/api/join" && post) {
      if (Date.now() < downUntil) return json({ error: "the house is down" }, 503)
      const body = await req.json().catch(() => null)
      if (houseFull && !ghosts.has(String(body?.ghostId))) return json({ spectator: true })
      const ghostId = typeof body?.ghostId === "string" ? body.ghostId : ""
      if (!/^[0-9a-f-]{36}$/.test(ghostId)) return json({ error: "ghostId must be a uuid" }, 400)
      const g = ensureGhost(ghostId)
      const token = crypto.randomUUID()
      grants.set(token, { ghostId, exp: Date.now() + 10_000 })
      return json({
        ghost: { id: g.id, name: g.name, color: g.color, createdAt: g.createdAt, ecto: g.score, banished: 0, whispers: 0, rounds: 0, lastSeen: Date.now() },
        ghostToken: tokenOf(ghostId),
        websocketUrl: `ws://${req.headers.get("host")}/ws?grant=${token}`,
        connectByMs: Date.now() + 10_000,
      })
    }
    if (p === "/api/whisper" && post) {
      const body = await req.json().catch(() => null)
      const g = ghosts.get(String(body?.ghostId))
      const room = /** @type {RoomId} */ (body?.room)
      if (!g || !ROOM_IDS.includes(room)) return json({ error: "bad lure" }, 400)
      if (body?.ghostToken !== tokenOf(g.id)) return json({ error: "not your ghost" }, 403)
      if (phase.phase !== "hide" && phase.phase !== "hunting") return json({ error: "lures only during hide and hunting" }, 409)
      if (g.lureBeat === phase.beat) return json({ error: "one lure per beat" }, 429, { "Retry-After": "6" })
      g.lureBeat = phase.beat
      const hunter = /** @type {HunterId} */ (HUNTERS.some((x) => x.id === body?.hunter) ? body.hunter : Math.random() < 0.5 ? "medium" : pick(HUNTERS).id)
      lures.push({ ghostId: g.id, room, hunter })
      log(`lure from ${g.name} to ${hunter}: ${lureText(room, lures.length)}`)
      return json({ ok: true, hunter })
    }
    if (p === "/p" || p === "/p/") return new Response(Bun.file(path.join(DEV, "mock.html")), { headers: { "content-type": "text/html; charset=utf-8", ...noStore } })
    if (p === "/dev/mock.js" || p === "/dev/mock.css") {
      try {
        const b = await getBundle()
        const js = p.endsWith(".js")
        return new Response(js ? b.js : b.css, { headers: { "content-type": js ? "text/javascript" : "text/css", ...noStore } })
      } catch (err) {
        log(`bundle failed: ${err}`)
        return new Response(String(err), { status: 500 })
      }
    }
    // GeistPixel (web/src/feed/fonts.ts resolves it relative to the bundle at /dev/): serve it from web/node_modules
    const pixel = /^\/node_modules\/geist\/dist\/fonts\/geist-pixel\/([A-Za-z-]+\.woff2)$/.exec(p)
    if (pixel) return new Response(Bun.file(path.resolve(DEV, "../../../node_modules/geist/dist/fonts/geist-pixel", pixel[1] ?? "")), { headers: { "content-type": "font/woff2" } })
    const asset = /^\/dev\/([a-z0-9._-]+\.(woff2?|ttf))$/i.exec(p)
    if (asset) {
      const blob = (await getBundle()).assets.get(asset[1] ?? "")
      return blob ? new Response(blob, { headers: { "content-type": "font/woff2", "cache-control": "max-age=3600" } }) : new Response("no font", { status: 404 })
    }
    const art = /^\/(art|fx\/rooms)\/([a-z0-9._-]+)$/i.exec(p)
    if (art) {
      const file = path.join(ART, "..", art[1] ?? "art", art[2] ?? "")
      return existsSync(file) ? new Response(Bun.file(file)) : new Response("no art yet", { status: 404 })
    }
    if (post && p === "/dev/start") return setPhase("intro", { beat: 0, round: phase.round + 1 }), json({ ok: true })
    if (post && p.startsWith("/dev/boost/")) {
      // dev: give one phone a streak and a score jump (for the ON FIRE / climb screenshots)
      const g = ghosts.get(p.slice("/dev/boost/".length))
      if (g) Object.assign(g, { streak: Number(url.searchParams.get("streak") ?? 3), score: g.score + Number(url.searchParams.get("score") ?? 300) }), you(g)
      return json({ ok: Boolean(g) })
    }
    if (post && p.startsWith("/dev/full/")) return (houseFull = p.endsWith("/1")), json({ ok: true, houseFull })
    if (post && p === "/dev/lobby") return setPhase("lobby", { beat: 0 }), json({ ok: true })
    if (post && p === "/dev/next") return next(), json({ ok: true, phase: phase.phase })
    if (post && p.startsWith("/dev/hold/")) return (hold = p.endsWith("/1")), json({ ok: true, hold })
    if (post && p === "/dev/sweep") return (forced = /** @type {RoomId[]} */ ((url.searchParams.get("rooms") ?? "").split(",").filter((r) => ROOM_IDS.includes(/** @type {RoomId} */ (r))))), json({ ok: true, forced })
    if (post && p === "/dev/finale") return setPhase("finale", { winner: url.searchParams.get("winner") === "hunters" ? "hunters" : "ghosts" }), json({ ok: true })
    if (post && p === "/dev/kill") {
      downUntil = Date.now() + Number(url.searchParams.get("downMs") ?? 2500)
      for (const set of socks.values()) for (const ws of set) ws.close(1012, "house died")
      return json({ ok: true })
    }
    if (p === "/dev/state") return json({ phase, hold, rooms: [...rooms.values()], online: [...socks.keys()].map((id) => ghosts.get(id)) })
    if (p === "/dev/duo")
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>two phones</title><body style="margin:0;padding:24px;background:#120a1d;display:flex;gap:28px">` +
          [`http://localhost:${PORT}/p`, `http://127.0.0.1:${PORT}/p`].map((src) => `<iframe src="${src}" style="width:390px;height:844px;border:0;border-radius:44px"></iframe>`).join("") +
          `</body>`,
        { headers: { "content-type": "text/html; charset=utf-8", ...noStore } },
      )
    if (p === "/") return Response.redirect("/p", 302)
    return new Response("not found", { status: 404 })
  },
  websocket: {
    open(ws) {
      const id = ws.data.ghostId
      const g = ensureGhost(id)
      if (!socks.has(id)) socks.set(id, new Set())
      socks.get(id)?.add(ws)
      you(g)
      tell(id, { t: "phase", ...phase })
      tell(id, roomsMsg())
    },
    message(ws, raw) {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg?.t === "ping") return ws.send(JSON.stringify({ t: "pong" }))
      const g = ghosts.get(ws.data.ghostId)
      if (!g) return
      if (msg?.t === "wave") return log(`wave from ${g.name}`)
      if (msg?.t !== "hide" || phase.phase !== "hide" || g.caught || !ROOM_IDS.includes(msg.room)) return
      recount()
      if (g.room !== msg.room && (rooms.get(msg.room)?.count ?? 0) >= (rooms.get(msg.room)?.cap ?? 0)) return you(g)
      g.room = msg.room
      recount()
      you(g)
      tellAll(roomsMsg())
    },
    close(ws) {
      const set = socks.get(ws.data.ghostId)
      set?.delete(ws)
      if (set && set.size === 0) socks.delete(ws.data.ghostId)
    },
  },
})
log(`L6 mock house on http://localhost:${server.port}/p (${BOTS} bot ghosts)`)
