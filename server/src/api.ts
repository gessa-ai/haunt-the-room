// Server HTTP API (contract/protocol.ts, "Server HTTP API"). Every response is no-store JSON.
import express, { type NextFunction, type Request, type Response, Router } from "express"
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { ghostIdentity } from "../../actors/src/identity.ts"
import { GHOST_COLORS, type GhostRecord, HUNTERS, type HouseSocketMeta, type HunterId, type JoinResponse, lureText, ROOMS } from "../../contract/protocol.ts"
import { voiceRoute } from "../../audio/voice-proxy.ts"
import { actors, HOUSE_ID } from "./actors.ts"
import { config, publicUrl, REPO } from "./config.ts"
import { errorMessage, HttpError, upstream } from "./errors.ts"
import { feedWatchers, observerFeedUrl, relayReady, watchFeed, whisperDm } from "./relay.ts"
import { bucket, ghostToken, presenterOnly, requireGhostToken, requirePresenterToken } from "./guard.ts"
import { cleanName } from "./names.ts"
import { notePerson, peopleCount } from "./people.ts"
import { cached, concurrency } from "./throttle.ts"
import { exposeGrant, getBotTarget, isBot, isOnline, liveCounts, releaseSeat, reserveSeat, reserveWatcher, setBotTarget, TOTAL_SOCKETS, MAX_STAGES } from "./wsProxy.ts"

const HUNTER_WEIGHTS: Record<HunterId, number> = { medium: 3, exorcist: 1, skeptic: 1, priest: 1 } // the Medium trusts whispers
const PRESENTER_COMMANDS = ["lobby", "start", "finale", "reset", "auto", "show", "bots-on", "bots-off", "kill"] as const
type PresenterCommand = (typeof PRESENTER_COMMANDS)[number]

const house = () => actors.House.get(HOUSE_ID)
// Owner 13:13: no join or per-IP limits (the venue is one IP). Only a generous global whisper cap.
const whispersAll = bucket("the dead are all whispering at once", 20, 20)
// Last known record per ghost: rejoins skip Ghost.ensure (each wakes an actor host); renames update it.
const records = new Map<string, GhostRecord>()
const rpc = concurrency(24) // join-path actor calls share one h2 connection
const background = concurrency(4) // Ghost creation after the response
const houseStats = cached(2_000, () => house().stats()) // /api/stats + /api/health pollers: one House call per 2 s
const houseView = cached(2_000, () => house().huntView())
let lures = 0 // rotates the lure template
let bots: { proc: ReturnType<typeof Bun.spawn>; fill: number } | null = null

function jsonBody(req: Request): Record<string, unknown> {
  const value: unknown = req.body
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(400, "invalid_body", "request body must be a JSON object")
  return value as Record<string, unknown>
}

function ghostIdOf(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value))
    throw new HttpError(400, "invalid_ghost", "ghostId must be 1 to 64 letters, digits, '-' or '_'")
  return value
}

function pickHunter(): HunterId {
  const total = HUNTERS.reduce((sum, h) => sum + HUNTER_WEIGHTS[h.id], 0)
  let roll = Math.random() * total
  for (const h of HUNTERS) if ((roll -= HUNTER_WEIGHTS[h.id]) < 0) return h.id
  return "medium"
}

// Bots survive unattended: the wanted state lives in logs/bots.json (restored at boot); a bots child that exits while
// wanted is restarted after 2 s.
const BOTS_FILE = resolve(config.logsDir, "bots.json")

function startBots(fill: number, base: string): void {
  if (!existsSync(config.botsMain)) throw new HttpError(503, "bots_missing", `${config.botsMain} missing (lane L8)`)
  stopBots()
  setBotTarget(fill)
  writeFileSync(BOTS_FILE, JSON.stringify({ fill, base }))
  spawnBots(fill, base)
}

function spawnBots(fill: number, base: string): void {
  const log = openSync(resolve(config.logsDir, "bots.log"), "a")
  const proc = Bun.spawn(["bun", config.botsMain, "--fill", String(fill), "--base", base], { stdout: log, stderr: log })
  closeSync(log)
  bots = { proc, fill }
  console.log(`[bots] started pid ${proc.pid} --fill ${fill} --base ${base} (logs/bots.log)`)
  void proc.exited.then(code => {
    console.log(`[bots] pid ${proc.pid} exited ${code}`)
    if (bots?.proc !== proc) return
    bots = null
    setTimeout(() => {
      if (!bots && existsSync(BOTS_FILE)) spawnBots(fill, base) // still wanted: bring them back
    }, 2_000)
  })
}

function stopBots(): void {
  setBotTarget(0) // bots off: no bot gets a seat until bots-on
  if (existsSync(BOTS_FILE)) renameSync(BOTS_FILE, `${BOTS_FILE}.off`)
  if (!bots) return
  console.log(`[bots] stopping pid ${bots.proc.pid}`)
  const proc = bots.proc
  bots = null
  proc.kill()
}

/** At boot: bring back the bots the presenter left on. */
export function restoreBots(): void {
  if (!existsSync(BOTS_FILE)) return
  const { fill, base } = JSON.parse(readFileSync(BOTS_FILE, "utf8")) as { fill: number; base: string }
  setBotTarget(fill)
  if (existsSync(config.botsMain)) spawnBots(fill, base)
}

/** The on-stage crash: kill -9 the live House executor (freshest pid file, dev or release layout). */
function killExecutor(): { pid: number; at: number } {
  const port = new URL(process.env.DURABLE_ACTORS_CONTROL_PLANE_URL ?? "http://127.0.0.1:7300").port
  const files = [resolve(config.logsDir, `house-executor-${port}.pid`), resolve(REPO, "logs", `house-executor-${port}.pid`)]
  const freshest = files.filter(f => existsSync(f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!freshest) throw new HttpError(503, "no_executor", `no house-executor-${port}.pid in ${files.join(" or ")}`)
  const pid = Number(readFileSync(freshest, "utf8").trim().split(/\s+/)[0])
  if (!Number.isInteger(pid) || pid <= 1) throw new HttpError(503, "no_executor", `${freshest} holds no pid`)
  process.kill(pid, "SIGKILL")
  console.log(`[presenter] kill -9 ${pid} (${freshest})`)
  return { pid, at: Date.now() }
}

async function presenter(cmd: PresenterCommand, fill: number, base: string): Promise<void> {
  if (cmd === "lobby" || cmd === "finale") await upstream("actors", "House.setPhase", house().setPhase({ phase: cmd }))
  else if (cmd === "start") await upstream("actors", "House.setPhase", house().setPhase({ phase: "intro" }))
  else if (cmd === "reset") await upstream("actors", "House.reset", house().reset())
  else if (cmd === "auto" || cmd === "show") {
    // Switch the mode, keep the phase; setPhase only takes lobby | intro | finale, so mid-round switches are refused.
    const { phase } = await upstream("actors", "House.huntView", houseView())
    if (phase !== "lobby" && phase !== "intro" && phase !== "finale")
      throw new HttpError(409, "mid_round", `switch mode between rounds (phase is ${phase})`)
    await upstream("actors", "House.setPhase", house().setPhase({ phase, mode: cmd }))
  } else if (cmd === "bots-on") startBots(fill, base)
  else stopBots()
}

/** Apply a player-chosen name; a name that breaks the rules keeps the old one. */
async function applyName(ghost: GhostRecord, raw: unknown): Promise<GhostRecord> {
  const name = cleanName(raw)
  if (!name || name === ghost.name) return ghost
  const renamed = await upstream("actors", "Ghost.rename", actors.Ghost.get(ghost.id).rename({ name }))
  await upstream("actors", "House.rename", house().rename({ ghostId: ghost.id, name }))
  records.set(ghost.id, renamed)
  return renamed
}

export function api(): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store")
    next()
  })
  router.use(express.json({ limit: "8kb" }))
  router.post("/voice", voiceRoute) // L10b: ElevenLabs lines; the key stays in this process

  router.post("/join", async (req, res) => {
    const input = jsonBody(req)
    const ghostId = ghostIdOf(input.ghostId)
    const signed = ghostToken(ghostId) // before any side effect: needs PRESENTER_TOKEN
    const bot = input.bot === true
    if (bot) requirePresenterToken(req) // bots (lane L8) carry the presenter token, locally or through the tunnel
    // The one join seam: a seat is promised synchronously (no await before it), so the caps cannot be overshot.
    const seat = reserveSeat(ghostId, bot)
    if (seat === "full") {
      res.json({ spectator: true, retryAfterMs: 20_000 }) // L6 shows "The house is full. Watch the big screen."
      return
    }
    if (seat === "ceiling") throw new HttpError(503, "bots_full", `no seat for a bot (bots fill to ${getBotTarget()} minus humans, ${TOTAL_SOCKETS} sockets max)`, { "Retry-After": "10" })
    try {
    let ghost = records.get(ghostId)
    if (!ghost) {
      // First join: answer from the pure identity and create the Ghost actor after responding (300 new phones at the
      // QR must not queue behind 300 actor creations).
      const identity = ghostIdentity(ghostId)
      const now = Date.now()
      ghost = { id: ghostId, name: identity.name, color: GHOST_COLORS[identity.colorIndex]!, createdAt: now, ecto: 0, banished: 0, whispers: 0, rounds: 0, lastSeen: now }
      records.set(ghostId, ghost)
      const wanted = input.name
      void background(() => actors.Ghost.get(ghostId).ensure({ id: ghostId, bot })).then(
        async record => {
          records.set(ghostId, record)
          if (wanted !== undefined) await applyName(record, wanted)
        },
        error => {
          records.delete(ghostId) // the next join retries the creation
          console.error(`[join] Ghost.ensure ${ghostId} failed: ${errorMessage(error)}`)
        },
      )
      const name = input.name !== undefined ? cleanName(input.name) : null
      if (name) ghost = { ...ghost, name }
    } else if (input.name !== undefined) ghost = await applyName(ghost, input.name)
    const metadata: HouseSocketMeta = { role: bot ? "bot" : "ghost", ghostId, colorIndex: ghostIdentity(ghostId).colorIndex }
    const grant = await upstream("actors", "House.prepareWebsocket", rpc(() => actors.House.prepareWebsocket({ actorId: HOUSE_ID, metadata })))
    const websocketUrl = exposeGrant(grant.websocketUrl, req, { ghostId, role: bot ? "bot" : "ghost", connectByMs: grant.connectByMs })
    notePerson(req, ghostId, bot)
    res.json({ ghost, ghostToken: signed, websocketUrl, connectByMs: grant.connectByMs } satisfies JoinResponse)
    } catch (error) {
      releaseSeat(ghostId)
      throw error
    }
  })

  router.post("/name", async (req, res) => {
    const input = jsonBody(req)
    const ghostId = ghostIdOf(input.ghostId)
    requireGhostToken(ghostId, input.ghostToken)
    const ghost = records.get(ghostId) ?? (await upstream("actors", "Ghost.get", actors.Ghost.get(ghostId).get()))
    res.json({ ghost: await applyName(ghost, input.name) })
  })

  router.post("/whisper", async (req, res) => {
    const input = jsonBody(req)
    const ghostId = ghostIdOf(input.ghostId)
    requireGhostToken(ghostId, input.ghostToken)
    const room = ROOMS.find(r => r.id === input.room)?.id
    if (!room) throw new HttpError(400, "invalid_room", `room must be one of ${ROOMS.map(r => r.id).join(", ")}`)
    if (!isOnline(ghostId)) throw new HttpError(409, "ghost_offline", "only a ghost in the house can whisper (its socket is closed)")
    whispersAll.check("all")
    whispersAll.take("all")
    // The House owns the lure rule (one per ghost per beat, during hide only): record first, DM only if it says ok.
    const hunter = HUNTERS.find(h => h.id === input.hunter)?.id ?? pickHunter() // the player picks who to lie to
    const verdict = await upstream("actors", "House.recordWhisper", house().recordWhisper({ ghostId, hunter, room }))
    if (verdict?.ok !== true) throw new HttpError(409, "lure_refused", `the house refused the lure: ${verdict?.reason ?? "no reason given"}`)
    const liar = await upstream("actors", "Ghost.ensure", actors.Ghost.get(ghostId).ensure({ id: ghostId }))
    const by = liar.name // the liar's public name: the hunter repeats it, swayedBy shows it
    await whisperDm(hunter, `@${hunter} ${by}: ${lureText(room, lures++)}`, room, by, isBot(ghostId)) // "@hunter " lets the stage feed name the recipient
    await upstream("actors", "Ghost.add", actors.Ghost.get(ghostId).add({ whispers: 1 }))
    res.json({ ok: true, hunter })
  })

  router.post("/stage/grant", async (req, res) => {
    presenterOnly(req)
    if (liveCounts().stages >= MAX_STAGES) throw new HttpError(409, "stages_full", `at most ${MAX_STAGES} stage screens may be open; close one first`)
    const metadata: HouseSocketMeta = { role: "stage", ghostId: "", colorIndex: 0 }
    const grant = await upstream("actors", "House.prepareWebsocket", actors.House.prepareWebsocket({ actorId: HOUSE_ID, metadata }))
    res.json({ websocketUrl: exposeGrant(grant.websocketUrl, req, { ghostId: "", role: "stage", connectByMs: grant.connectByMs }), connectByMs: grant.connectByMs })
  })

  router.post("/presenter/:cmd", async (req, res) => {
    presenterOnly(req)
    const cmd = req.params.cmd as PresenterCommand
    if (!PRESENTER_COMMANDS.includes(cmd)) throw new HttpError(404, "unknown_command", `presenter commands: ${PRESENTER_COMMANDS.join(", ")}`)
    const fill = Number(req.query.n ?? 120)
    if (!Number.isInteger(fill) || fill < 1 || fill > 600) throw new HttpError(400, "invalid_fill", "n must be an integer 1..600")
    const base = typeof req.query.base === "string" && /^https?:\/\/[^\s]+$/.test(req.query.base) ? req.query.base : (publicUrl() ?? `http://localhost:${config.port}`)
    if (cmd === "kill") {
      res.json({ ok: true, cmd, ...killExecutor() })
      return
    }
    await presenter(cmd, fill, base)
    res.json({ ok: true, cmd, bots: bots ? { pid: bots.proc.pid, fill: bots.fill } : null })
  })

  router.get("/relay/observer", async (req, res) => {
    presenterOnly(req)
    res.json({ wsUrl: await observerFeedUrl() })
  })

  // Public, read-only /watch (judges without us): a stage socket whose inbound frames the door drops, max 20.
  router.post("/watch/grant", async (req, res) => {
    if (!reserveWatcher()) throw new HttpError(503, "watchers_full", "the gallery is full: try again soon", { "Retry-After": "30" })
    const metadata: HouseSocketMeta = { role: "stage", ghostId: "", colorIndex: 0 }
    const grant = await upstream("actors", "House.prepareWebsocket", rpc(() => actors.House.prepareWebsocket({ actorId: HOUSE_ID, metadata })))
    res.json({ websocketUrl: exposeGrant(grant.websocketUrl, req, { ghostId: "", role: "watch", connectByMs: grant.connectByMs }), connectByMs: grant.connectByMs })
  })

  router.get("/watch/feed", (req, res) => {
    if (feedWatchers() >= 20) throw new HttpError(503, "watchers_full", "the gallery is full: try again soon", { "Retry-After": "30" })
    res.set({ "Content-Type": "text/event-stream", Connection: "keep-alive" })
    res.flushHeaders()
    const stop = watchFeed(frame => res.write(`data: ${frame}\n\n`))
    const beat = setInterval(() => res.write(": keepalive\n\n"), 15_000)
    req.on("close", () => (clearInterval(beat), stop()))
  })

  router.get("/stats", async (_req, res) => {
    res.json(await upstream("actors", "House.stats", houseStats()))
  })

  router.get("/people", (_req, res) => {
    res.json({ people: peopleCount() })
  })

  router.get("/config", (_req, res) => {
    res.json({ publicUrl: publicUrl() })
  })

  router.get("/health", async (_req, res) => {
    const [actorsCheck, relayCheck] = await Promise.allSettled([houseStats(), relayReady()])
    const report = (check: PromiseSettledResult<unknown>) => (check.status === "fulfilled" ? "ok" : errorMessage(check.reason))
    const ok = actorsCheck.status === "fulfilled" && relayCheck.status === "fulfilled"
    res.status(ok ? 200 : 503).json({ ok, actors: report(actorsCheck), relay: report(relayCheck), live: liveCounts(), humanCap: config.humanCap, totalSockets: TOTAL_SOCKETS, botTarget: getBotTarget(), bots: bots ? { pid: bots.proc.pid, fill: bots.fill } : null })
  })

  router.use((req, _res, next) => next(new HttpError(404, "not_found", `no route ${req.method} /api${req.path}`)))
  router.use(apiErrors)
  return router
}

function apiErrors(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    if (error.status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} -> ${error.status} ${error.message}`)
    res.status(error.status).set(error.headers).json({ error: error.message, code: error.code })
    return
  }
  const parse = error as { type?: string; status?: number }
  if (parse.type === "entity.parse.failed" || parse.type === "entity.too.large") {
    res.status(parse.status ?? 400).json({ error: `invalid request body: ${errorMessage(error)}`, code: "invalid_body" })
    return
  }
  console.error(`[api] ${req.method} ${req.originalUrl} -> 500`, error)
  res.status(500).json({ error: `internal error: ${errorMessage(error)}`, code: "internal" })
}
