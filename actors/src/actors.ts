// HAUNT THE ROOM actors: House ("main", the authority: the beat loop, votes, sweeps, scoring, sockets) and Ghost
// (one per phone, lifetime stats). Wire shapes live in contract/protocol.ts. Live state is @Ephemeral; one
// @Persisted snapshot is written every TIMING.persistEveryMs and on every phase change. Deadlines are absolute
// timestamps, so a kill -9 resumes in the same beat. Helpers are ES #private: Terse exposes every prototype method.
import { Actor, Compute, Ephemeral, Persisted } from "durable-actors"
import type { ActorSocket } from "durable-actors"
import {
    GHOST_COLORS,
    HUNTERS,
    NAME_MAX,
    ROOMS,
    ROOMS_TO_WIN,
    SCORE,
    SWEEPS_PER_BEAT,
    TIMING,
    beatsFor,
    possessThreshold,
    roomCapacity,
    safePoints,
    type GhostRecord,
    type GhostTuple,
    type HouseEvent,
    type HouseSocketMeta,
    type HouseToPhone,
    type HouseToStage,
    type HunterId,
    type HunterState,
    type HuntView,
    type Mode,
    type Phase,
    type PhoneToHouse,
    type RoomId,
    type RoomState,
    type StageSnap,
} from "../../contract/protocol"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { fstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { ghostIdentity } from "./identity"

const BEAT_MS = 50 // requested heartbeat; the alarm poller makes it ~10 Hz
const GRACE_MS = 20_000 // a phone may drop (screen lock) this long before its ghost goes offline
const ROOMS_EVERY_MS = 500 // ranks + changed "you"s at 2 Hz
const ROOMS_BROADCAST_MS = 1_000 // live room counts to phones at 1 Hz (frame budget: the gateway's h2 link)
const SNAP_EVERY_MS = 150 // stage snapshots ~6 Hz: they are the House's biggest frames on the host's h2 link
const YOU_MIN_MS = 400 // at most ~2 "you" frames per phone per second
const SAY_EVERY_MS = 3_000 // per hunter: chatter reaches the phones at most this often
const FLUSH_PER_BEAT = 1 // Ghost.add calls per beat (~10/s): each wakes a Ghost actor (~70 MB for ~4 s locally)
const EVENTS_KEPT = 60
const WAVES_PER_BEAT = 6 // house-wide: waves never crowd sweeps out of the event ring
// Socket admission (red team): one phone script must never stall the house.
const RATE_PER_S = 4 // a human taps a few times per hide; every frame is a serialized actor call
const BURST = 8
const CLOSE_ABOVE_PER_S = 20
const MAX_FRAME_CHARS = 2_048
/** `<repo>/logs/house-executor-<port>.pid` = "<pid> <last beat ms>", rewritten every beat. The on-stage crash is
 *  `kill -9 <pid>` (only the House's JS executor dies; the gateway keeps every phone connected), and the next
 *  executor reads the dead one's last beat to measure the outage. */
const PID_FILE = join(dirname(process.cwd()), "logs", `house-executor-${new URL(process.env.DURABLE_ACTORS_CONTROL_PLANE_URL ?? "http://127.0.0.1:7100").port}.pid`)
let pidFileError = false
let holderPid = 0
function writePidFile(now: number): void {
    try {
        writeFileSync(PID_FILE, `${process.pid} ${now} ${holderPid}\n`)
    } catch (error) {
        if (!pidFileError) console.error(`[house] cannot write ${PID_FILE}`, error)
        pidFileError = true
    }
}
function deadExecutor(): { at: number; holder: number } | null {
    try {
        const [pid, at, holder] = readFileSync(PID_FILE, "utf8").trim().split(" ").map(Number)
        return pid !== process.pid && Number.isFinite(at) ? { at, holder: holder || 0 } : null
    } catch {
        return null
    }
}
/** Terse 0.14.6 workaround: when this executor is SIGKILLed, the native host races "executor socket closed" against
 *  "executor process exited"; if the socket branch wins the host panics without releasing its 30 s owner lease.
 *  A tiny holder shares this executor's sockets and outlives it by 200 ms, so the socket never closes first: the host
 *  always takes the clean "process exited" branch and the House is back in well under a second. */
function startHolder(previous: number): void {
    try {
        if (previous > 0) process.kill(previous, "SIGKILL")
    } catch {
        // already gone
    }
    try {
        const fds: number[] = []
        for (let fd = 3; fd < 128; fd++) {
            try {
                if (fstatSync(fd).isSocket()) fds.push(fd)
            } catch {
                // not open
            }
        }
        const stdio: ("ignore" | number)[] = ["ignore", "ignore", "ignore"]
        for (const fd of fds) stdio[fd] = fd
        for (let i = 3; i < stdio.length; i++) if (stdio[i] === undefined) stdio[i] = "ignore"
        // lives exactly as long as this executor, plus 200 ms: the socket closes only after the host saw the exit
        const watch = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.05; done; sleep 0.2`
        const holder = spawn("/bin/sh", ["-c", watch], { stdio, detached: true })
        holder.unref()
        holderPid = holder.pid ?? 0
        console.log(`[house] socket holder pid ${holderPid} shares fds ${fds.join(",")}`)
    } catch (error) {
        console.error("[house] socket holder failed", error)
    }
}
const PING = JSON.stringify({ t: "ping" })
const PONG = JSON.stringify({ t: "pong" })

type Winner = "ghosts" | "hunters" | null
type Counters = StageSnap["counters"]
type SavedCounters = Pick<Counters, "joinedToday" | "sweeps" | "caught" | "whispers" | "possessions" | "rounds">
type Outgoing = HouseToPhone | HouseToStage
type HouseSocket = ActorSocket<HouseSocketMeta, Outgoing>
type Result = Extract<HouseToPhone, { t: "result" }>
type You = Extract<HouseToPhone, { t: "you" }>
type RoundDelta = { ecto: number; banished: number; whispers: number; rounds: number }

interface SavedGhost {
    name: string // live name: generated from the id, or the guest's own (sanitized by the server)
    room: RoomId // where the wisp is (a ghost who never picks stays put)
    seated: boolean // holds one of the room's seats this beat (musical chairs: no seat at the bell = caught)
    seatedAt: number
    colorIndex: number
    bot: boolean
    online: boolean
    // this round (reset at intro; flushed to the Ghost actor at the finale)
    score: number
    streak: number // consecutive safe beats
    caughtBeat: number // 0 = never; caught at beat b = out for the rest of b and all of b + 1
    catches: number
    lures: number
    lureBeat: number
}
interface Lure {
    ghostId: string
    hunter: HunterId
    room: RoomId
    beat: number
    at: number
}
interface HouseSave {
    phase: Phase
    mode: Mode
    endsAt: number
    round: number
    beat: number
    winner: Winner
    ghosts: Record<string, SavedGhost>
    possessed: RoomId[]
    swept: RoomId[]
    hunters: HunterState[]
    lures: Lure[]
    beatResults: Record<string, Result[]>
    capOnline: number
    counters: SavedCounters
    events: HouseEvent[]
    restoredAt: number | null
    lastRecoveryMs?: number
    asleep: boolean // written when the heartbeat stopped cleanly; waking from a save without it = a crash
    savedAt: number
}
interface LiveGhost extends SavedGhost {
    id: string // a bearer secret: never sent to another phone
    publicId: string // what phones may see: first 10 hex of sha256("haunt:" + id)
}
const publicIdOf = (id: string): string => createHash("sha256").update(`haunt:${id}`).digest("hex").slice(0, 10)
interface Live {
    phase: Phase
    mode: Mode
    endsAt: number
    round: number
    beat: number
    winner: Winner
    ghosts: Map<string, LiveGhost>
    possessed: Set<RoomId>
    swept: RoomId[]
    hunters: HunterState[]
    lures: Lure[]
    counters: SavedCounters
    events: HouseEvent[]
    restoredAt: number | null
    lastRecoveryMs?: number
    offlineAt: Map<string, number> // ghostId -> grace deadline
    results: Map<string, Result[]> // reveal results waiting for the socket pass
    dirty: Set<string> // ghosts touched since the last beat: each gets one "you"
    sentYou: Map<string, string> // last "you" sent per ghost (send only on change)
    youAt: Map<string, number>
    beatResults: Record<string, Result[]> // this reveal's results per ghost (saved; resent on reconnect)
    capOnline: number // online ghosts when this beat started: seats per room and the possession bar freeze on it
    waves: number // wave events this beat
    lastSay: Map<HunterId, number>
    lastWave: Map<string, number>
    ranks: Map<string, number>
    leader: string | null // round #1, for the "lead" event
    passed: Map<string, string> // ghostId -> name of the ghost it just overtook (sent once in "you")
    flushQueue: [string, RoundDelta][] // round stats on their way to Ghost actors
    joins: number // arrivals since the last beat (one coalesced "join" event per beat)
    perf: { since: number; beats: number; ms: number; max: number } // logged every 10 s
    lastBeat: number
    lastRooms: number
    lastRoomsBroadcast: number
    lastSnap: number
    connected: number // sockets, refreshed every 2 s
    reconcile: boolean // first beat after a wake: phones the gateway kept connected are online again
    countedAt: number
    lastPersist: number
}
interface Bucket {
    tokens: number
    last: number
    windowStart: number
    windowCount: number
}

const ROOM_IDS = new Set<string>(ROOMS.map(r => r.id))
const HUNTER_IDS = new Set<string>(HUNTERS.map(h => h.id))
const PHASES = new Set<string>(["lobby", "intro", "hide", "hunting", "reveal", "finale"])
const isRoom = (value: unknown): value is RoomId => typeof value === "string" && ROOM_IDS.has(value)
const isHunter = (value: unknown): value is HunterId => typeof value === "string" && HUNTER_IDS.has(value)
const isPhase = (value: unknown): value is Phase => typeof value === "string" && PHASES.has(value)
const ghostTag = (ghostId: string): string => `g:${ghostId}`
const hunterName = (id: HunterId): string => HUNTERS.find(h => h.id === id)?.name ?? id
const randomRoom = (): RoomId => ROOMS[Math.floor(Math.random() * ROOMS.length)].id
const freshHunters = (): HunterState[] => HUNTERS.map(h => ({ id: h.id, vote: null, lean: null }))
const zeroCounters = (): SavedCounters => ({ joinedToday: 0, sweeps: 0, caught: 0, whispers: 0, possessions: 0, rounds: 0 })
const zeroRound = { score: 0, streak: 0, caughtBeat: 0, catches: 0, lures: 0, lureBeat: 0, seated: false, seatedAt: 0 }

/** Fire-and-forget Ghost.add, retried once: a call can race a Ghost host that is exiting idle ("actor host is unavailable"). */
async function addRound(id: string, delta: RoundDelta): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await Ghost.get(id).add(delta)
        } catch (error) {
            if (attempt >= 2) return console.error(`[house] Ghost.add(${id}) failed twice`, error)
            await new Promise(r => setTimeout(r, 300))
        }
    }
}

export class House extends Actor<HouseSocketMeta, PhoneToHouse, Outgoing> {
    @Persisted private save: HouseSave | null = null
    @Ephemeral private live: Live | null = null
    @Ephemeral private buckets = new Map<string, Bucket>()

    // ---------- sockets ----------

    async onConnect(socket: HouseSocket): Promise<void> {
        const meta = socket.metadata
        const L = this.#ensureLive()
        const now = Date.now()
        this.setWebSocketAutoResponse({ request: PING, response: PONG })
        L.connected++ // keep the heartbeat alive until the next real count
        if (meta.role === "stage") {
            socket.setTags("stage")
            socket.send({ t: "snap", s: this.#snap(L, now) })
        } else if ((meta.role === "ghost" || meta.role === "bot") && typeof meta.ghostId === "string" && meta.ghostId !== "") {
            const g = this.#arrive(L, meta.ghostId, meta.role === "bot")
            g.bot = meta.role === "bot" // the grant is the truth about bots (a rename can create a ghost first)
            socket.setTags("ghost", ghostTag(g.id))
            if (L.phase === "reveal") for (const r of L.beatResults[g.id] ?? []) socket.send(r) // reconnected mid-reveal
            const you = this.#you(L, g)
            const { of: _of, ...view } = you
            L.sentYou.set(g.id, JSON.stringify(view))
            L.youAt.set(g.id, now)
            L.passed.delete(g.id)
            socket.send(you)
            socket.send(this.#phaseMsg(L))
            socket.send(this.#roomsMsg(L))
        } else {
            socket.reject(4003, "bad socket metadata")
            return
        }
        this.#arm(now)
    }

    async onMessage(socket: HouseSocket, message: PhoneToHouse): Promise<void> {
        // Hot path (300 phones tap at once): record and return. No sends, no alarm, no persist here; the heartbeat
        // answers every touched ghost with one "you" per beat (a refused or dropped hide snaps the phone back).
        if (!this.#admit(socket, message)) {
            if (socket.state === "open" && socket.metadata.ghostId) this.live?.dirty.add(socket.metadata.ghostId)
            return
        }
        if (message.t === "ping") return socket.send({ t: "pong" })
        const meta = socket.metadata
        if (meta.role === "stage" || (message.t !== "hide" && message.t !== "wave")) return
        const L = this.#ensureLive()
        const now = Date.now()
        const g = L.ghosts.get(meta.ghostId) ?? this.#arrive(L, meta.ghostId, meta.role === "bot")
        if (message.t === "wave") {
            if (now - (L.lastWave.get(g.id) ?? 0) >= TIMING.waveCooldownMs && L.waves < WAVES_PER_BEAT) {
                L.lastWave.set(g.id, now)
                L.waves++
                this.#event(L, { at: now, kind: "wave", ghostId: g.id, name: g.name, room: g.room })
            }
            return
        }
        this.#hide(L, g, message.room, now)
    }

    /** Many hides in ONE call (the server batches phones' taps every ~100 ms): each socket frame is a serialized actor
     *  call with a fixed runtime cost, so 300 taps as frames queue for seconds; as one batch they cost one call. */
    async hides(input: { hides: { ghostId: string; room: RoomId }[] }): Promise<{ applied: number }> {
        const L = this.#ensureLive()
        const now = Date.now()
        let applied = 0
        for (const h of input.hides.slice(0, 2_000)) {
            const g = L.ghosts.get(h.ghostId)
            if (!g) continue
            this.#hide(L, g, h.room, now)
            applied++
        }
        this.#arm(now)
        return { applied }
    }

    async onDisconnect(socket: HouseSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
        this.buckets.delete(socket.id)
        const meta = socket.metadata
        if (meta.role === "stage" || !meta.ghostId) return
        const L = this.#ensureLive()
        const now = Date.now()
        const others = await this.getConnections(ghostTag(meta.ghostId))
        const g = L.ghosts.get(meta.ghostId)
        if (others.length > 0 || !g) return
        if (meta.role === "bot" && wasClean) g.online = false // a bot that leaves cleanly is gone now (no screen-lock grace)
        else L.offlineAt.set(meta.ghostId, now + GRACE_MS)
        this.#arm(now)
    }

    // ---------- heartbeat ----------

    async onAlarm(): Promise<void> {
        const L = this.#ensureLive()
        const now = Date.now()
        try {
            await this.#beat(L, now)
        } catch (error) {
            console.error("[house] beat failed", error) // keep the clock alive; the next beat retries
        }
        // the socket count is a control-plane round trip: ask every 2 s, not every beat (h2 frame budget)
        if (now - L.countedAt >= 2_000) {
            L.countedAt = now
            try {
                L.connected = await this.getConnectionCount()
            } catch (error) {
                console.error("[house] connection count failed", error)
            }
        }
        const connected = L.connected
        const took = Date.now() - now
        const perf = L.perf
        perf.beats++
        perf.ms += took
        perf.max = Math.max(perf.max, took)
        if (now - perf.since >= 10_000) {
            console.log(`[house] ${(perf.beats / ((now - perf.since) / 1000)).toFixed(1)} Hz, beat avg ${(perf.ms / perf.beats).toFixed(1)} ms max ${perf.max} ms, ${connected} sockets, ${this.#onlineCount(L)} ghosts online, ${L.phase} beat ${L.beat}`)
            L.perf = { since: now, beats: 0, ms: 0, max: 0 }
        }
        const clockRunning = L.endsAt > 0 && (L.mode === "auto" || L.phase !== "finale")
        if (connected > 0 || clockRunning || L.offlineAt.size > 0 || L.flushQueue.length > 0) {
            this.alarm.set(now + BEAT_MS)
            if (now - L.lastPersist >= TIMING.persistEveryMs) this.#persist(L, now)
        } else {
            this.#persist(L, now, true) // nobody here and no clock running: sleep cleanly
        }
    }

    // ---------- RPC (contract HouseRpc) ----------

    async setPhase(input: { phase: "lobby" | "intro" | "finale"; mode?: Mode }): Promise<void> {
        if (input.phase !== "lobby" && input.phase !== "intro" && input.phase !== "finale") throw new Error(`setPhase: ${String(input.phase)} is not lobby, intro or finale`)
        if (input.mode !== undefined && input.mode !== "show" && input.mode !== "auto") throw new Error(`unknown mode ${String(input.mode)}`)
        const L = this.#ensureLive()
        const now = Date.now()
        if (input.mode !== undefined) L.mode = input.mode
        this.#enter(L, input.phase, now)
        this.#arm(now)
    }

    async reset(): Promise<void> {
        const L = this.#ensureLive()
        const now = Date.now()
        L.events = []
        L.possessed = new Set()
        for (const g of L.ghosts.values()) Object.assign(g, zeroRound)
        this.#enter(L, "lobby", now)
        this.#arm(now)
    }

    /** A hunter's vote for this beat (hide or hunting; the last vote wins). */
    async sweep(input: { hunter: HunterId; room: RoomId }): Promise<{ ok: boolean; reason?: string }> {
        if (!isHunter(input.hunter)) return { ok: false, reason: `unknown hunter ${String(input.hunter)}` }
        if (!isRoom(input.room)) return { ok: false, reason: `unknown room ${String(input.room)}` }
        const L = this.#ensureLive()
        const now = Date.now()
        if (L.phase !== "hide" && L.phase !== "hunting") return { ok: false, reason: `votes are taken during hide and hunting (now ${L.phase})` }
        const h = L.hunters.find(x => x.id === input.hunter)!
        h.vote = input.room
        // during hide the room stays secret (the crowd can still move); from hunting on it is shown
        this.#event(L, { at: now, kind: "vote", hunter: h.id, ...(L.phase === "hunting" ? { room: input.room } : {}) })
        this.#arm(now)
        return { ok: true }
    }

    /** POKER: a hunter's open (maybe bluffing) leaning during hide; last wins; cleared each beat. The vote stays secret. */
    async lean(input: { hunter: HunterId; room: RoomId; conviction?: number; swayedBy?: string }): Promise<{ ok: boolean; reason?: string }> {
        if (!isHunter(input.hunter)) return { ok: false, reason: `unknown hunter ${String(input.hunter)}` }
        if (!isRoom(input.room)) return { ok: false, reason: `unknown room ${String(input.room)}` }
        const L = this.#ensureLive()
        if (L.phase !== "hide" && L.phase !== "hunting") return { ok: false, reason: `leans only during hide and hunting (now ${L.phase})` }
        const h = L.hunters.find(x => x.id === input.hunter)!
        h.lean = input.room
        if (input.conviction !== undefined) h.conviction = Math.round(Math.min(100, Math.max(0, Number(input.conviction) || 0)))
        if (input.swayedBy !== undefined) h.swayedBy = String(input.swayedBy).slice(0, NAME_MAX)
        this.#arm(Date.now())
        return { ok: true }
    }

    async taunt(input: { hunter: HunterId; text: string }): Promise<void> {
        if (!isHunter(input.hunter)) throw new Error(`unknown hunter ${String(input.hunter)}`)
        const L = this.#ensureLive()
        const now = Date.now()
        const text = String(input.text).slice(0, 80)
        this.#event(L, { at: now, kind: "taunt", hunter: input.hunter, text })
        if (now - (L.lastSay.get(input.hunter) ?? 0) >= SAY_EVERY_MS) {
            L.lastSay.set(input.hunter, now)
            this.broadcast({ t: "say", hunter: input.hunter, text }, { tags: ["ghost"] })
        }
        this.#arm(now)
    }

    async huntView(): Promise<HuntView> {
        const L = this.#ensureLive()
        const now = Date.now()
        this.#arm(now)
        return {
            phase: L.phase,
            beat: L.beat,
            msLeft: L.endsAt > 0 ? Math.max(0, L.endsAt - now) : 0,
            rooms: this.#roomStates(L),
            votes: L.hunters.map(h => ({ ...h })),
            possessedCount: L.possessed.size,
            roomsToWin: ROOMS_TO_WIN,
            recent: L.events.slice(-10),
        }
    }

    /** A lure: one per ghost per beat, during hide. Pays at reveal if the hunter took the bait into a near-empty room. */
    async recordWhisper(input: { ghostId: string; hunter: HunterId; room: RoomId }): Promise<{ ok: boolean; reason?: string }> {
        if (!isHunter(input.hunter)) return { ok: false, reason: `unknown hunter ${String(input.hunter)}` }
        if (!isRoom(input.room)) return { ok: false, reason: `unknown room ${String(input.room)}` }
        const L = this.#ensureLive()
        const now = Date.now()
        if (L.phase !== "hide" && L.phase !== "hunting") return { ok: false, reason: `lures only during hide and hunting (now ${L.phase})` }
        const g = L.ghosts.get(input.ghostId)
        if (g?.lureBeat === L.beat) return { ok: false, reason: "one lure per beat" }
        if (g) {
            g.lureBeat = L.beat
            g.lures++
        }
        L.counters.whispers++
        L.lures = [...L.lures, { ghostId: input.ghostId, hunter: input.hunter, room: input.room, beat: L.beat, at: now }]
        this.#arm(now)
        return { ok: true }
    }

    /** The guest's own name (already sanitized by the server): podium, events and the next "you". */
    async rename(input: { ghostId: string; name: string }): Promise<void> {
        const name = String(input.name).slice(0, NAME_MAX).toLowerCase()
        if (!input.ghostId || name.trim() === "") throw new Error("rename needs a ghostId and a name")
        const L = this.#ensureLive()
        const g = L.ghosts.get(input.ghostId) ?? this.#arrive(L, input.ghostId, false)
        g.name = name
    }

    /** Also the watchdog: any RPC re-arms the heartbeat (an alarm delivered into a dying executor is not redelivered). */
    async stats(): Promise<StageSnap["counters"]> {
        const L = this.#ensureLive()
        this.#arm(Date.now())
        return this.#counters(L)
    }

    // ---------- the loop ----------

    async #beat(L: Live, now: number): Promise<void> {
        L.lastBeat = now
        writePidFile(now)
        if (L.reconcile) {
            // after a crash the gateway kept every phone connected but no onConnect replays: rebuild presence from it
            L.reconcile = false
            const sockets = await this.getConnections("ghost")
            for (const socket of sockets) {
                const g = this.#arrive(L, socket.metadata.ghostId, socket.metadata.role === "bot")
                g.online = true
                g.bot = socket.metadata.role === "bot"
            }
            L.connected = sockets.length
            L.countedAt = now
        }
        for (const [id, at] of L.offlineAt) {
            if (at > now) continue
            L.offlineAt.delete(id)
            const g = L.ghosts.get(id)
            if (g) g.online = false
        }
        if (L.endsAt > 0 && now >= L.endsAt) {
            if (L.phase === "intro") this.#enter(L, "hide", now)
            else if (L.phase === "hide") this.#enter(L, "hunting", now)
            else if (L.phase === "hunting") this.#enter(L, "reveal", now)
            else if (L.phase === "reveal") this.#enter(L, L.beat < beatsFor(L.mode) ? "hide" : "finale", now)
            else if (L.mode === "auto") this.#enter(L, L.phase === "lobby" ? "intro" : "lobby", now)
        }
        for (const [id, delta] of L.flushQueue.splice(0, FLUSH_PER_BEAT)) void addRound(id, delta)
        if (L.joins > 0) {
            this.#event(L, { at: now, kind: "join", count: L.joins })
            L.joins = 0
        }
        // the stage first: its snapshot never waits behind the phones
        if (now - L.lastSnap >= SNAP_EVERY_MS || L.results.size > 0) {
            L.lastSnap = now
            this.broadcast({ t: "snap", s: this.#snap(L, now) }, { tags: ["stage"] })
        }
        const tick = now - L.lastRooms >= ROOMS_EVERY_MS
        const results = L.results
        L.results = new Map()
        if (tick || results.size > 0) this.#rank(L)
        if (tick) {
            L.lastRooms = now
            if (L.phase === "hide" && now - L.lastRoomsBroadcast >= ROOMS_BROADCAST_MS) {
                L.lastRoomsBroadcast = now
                this.broadcast(this.#roomsMsg(L), { tags: ["ghost"] })
            }
        }
        // phones: reveal results, then a "you" only to ghosts whose view changed (no socket listing, no 2 Hz storm)
        for (const [id, rs] of results) for (const r of rs) this.broadcast(r, { tags: [ghostTag(id)] })
        // every send is one frame on the host's control-plane link: send only real changes (`of` alone is not one: a
        // join wave would re-send everyone) and at most one "you" per phone per YOU_MIN_MS; the rest waits a tick
        const candidates = tick || results.size > 0 ? [...L.ghosts.keys()] : [...L.dirty]
        const later = new Set<string>()
        for (const id of candidates) {
            const g = L.ghosts.get(id)
            if (!g || !g.online) continue
            const you = this.#you(L, g)
            const { of: _of, ...view } = you
            const key = JSON.stringify(view)
            if (key === L.sentYou.get(id) && !L.dirty.has(id)) continue
            if (now - (L.youAt.get(id) ?? 0) < YOU_MIN_MS) {
                later.add(id)
                continue
            }
            L.sentYou.set(id, key)
            L.youAt.set(id, now)
            L.passed.delete(id)
            this.broadcast(you, { tags: [ghostTag(id)] })
        }
        L.dirty = later
    }

    #enter(L: Live, phase: Phase, now: number): void {
        L.phase = phase
        if (phase === "lobby") {
            L.endsAt = L.mode === "auto" ? now + TIMING.lobbyMs : 0
            L.beat = 0
            L.swept = []
            L.hunters = freshHunters()
        } else if (phase === "intro") {
            L.round++
            L.beat = 0
            L.beatResults = {}
            L.endsAt = now + TIMING.introMs
            L.winner = null
            L.possessed = new Set()
            L.swept = []
            L.lures = []
            L.leader = null
            L.hunters = freshHunters()
            for (const g of L.ghosts.values()) Object.assign(g, zeroRound)
        } else if (phase === "hide") {
            L.beat++
            L.endsAt = now + (L.beat === 1 ? TIMING.firstHideMs : TIMING.hideMs)
            L.capOnline = this.#onlineCount(L)
            const kept = new Map<RoomId, number>()
            for (const g of L.ghosts.values()) {
                // stay put and keep your seat, while the room still has one; the caught and the offline lose theirs
                if (!g.seated || !g.online || this.#out(L, g) || (kept.get(g.room) ?? 0) >= this.#cap(L)) g.seated = false
                else kept.set(g.room, (kept.get(g.room) ?? 0) + 1)
            }
            L.swept = []
            L.beatResults = {}
            L.waves = 0
            L.hunters = freshHunters()
            L.lures = L.lures.filter(l => l.beat === L.beat)
        } else if (phase === "hunting") {
            L.endsAt = now + TIMING.huntingMs
        } else if (phase === "reveal") {
            L.endsAt = now + TIMING.revealMs
            this.#reveal(L, now)
        } else {
            L.endsAt = now + TIMING.finaleMs
            L.winner = L.possessed.size >= ROOMS_TO_WIN ? "ghosts" : "hunters"
            L.counters.rounds++
            for (const g of L.ghosts.values()) {
                if (g.bot || !(g.online || g.score > 0 || g.catches > 0 || g.lures > 0)) continue
                L.flushQueue.push([g.id, { ecto: g.score, banished: g.catches, whispers: g.lures, rounds: 1 }])
            }
        }
        this.#event(L, { at: now, kind: "phase", text: phase, count: L.beat })
        this.broadcast(this.#phaseMsg(L), { tags: ["ghost"] })
        this.broadcast(this.#roomsMsg(L), { tags: ["ghost"] })
        this.#persist(L, now)
    }

    /** The Kahoot moment: two rooms swept, everyone else scores, crowded safe rooms are possessed, lies pay. */
    #reveal(L: Live, now: number): void {
        L.beatResults = {}
        const give = (g: LiveGhost, r: Result): void => {
            L.results.set(g.id, [...(L.results.get(g.id) ?? []), r])
            L.beatResults[g.id] = [...(L.beatResults[g.id] ?? []), r]
        }
        // musical chairs: in play but no seat at the bell = caught, out next beat
        let standing = 0
        for (const g of L.ghosts.values()) {
            if (!g.online || g.seated || this.#out(L, g)) continue
            g.caughtBeat = L.beat
            g.streak = 0
            g.catches++
            standing++
            give(g, { t: "result", kind: "caught", points: 0, streak: 0, text: "no seat" })
        }
        L.counters.caught += standing
        const counts = this.#counts(L)
        const online = this.#onlineCount(L)
        const crowded = (a: RoomId, b: RoomId): number => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
        // missing votes fall to the most crowded room nobody chose yet
        for (const h of L.hunters) {
            if (h.vote) continue
            const taken = new Set(L.hunters.map(x => x.vote).filter(v => v !== null))
            h.vote = ROOMS.map(r => r.id).filter(r => !taken.has(r)).sort(crowded)[0] ?? ROOMS[0].id
        }
        const tally = new Map<RoomId, number>()
        for (const h of L.hunters) if (h.vote) tally.set(h.vote, (tally.get(h.vote) ?? 0) + 1)
        L.swept = ROOMS.map(r => r.id)
            .sort((a, b) => (tally.get(b) ?? 0) - (tally.get(a) ?? 0) || crowded(a, b))
            .slice(0, SWEEPS_PER_BEAT)
        const sweepEvents: HouseEvent[] = [] // pushed last so nothing crowds them out of the ring
        const caughtIn = new Map<RoomId, number>()
        for (const room of L.swept) {
            const hunter = L.hunters.find(h => h.vote === room)?.id ?? "exorcist" // a crowd-filled second room has no voter
            const inside = this.#hiding(L).filter(g => g.room === room)
            for (const g of inside) {
                g.seated = false
                g.caughtBeat = L.beat
                g.streak = 0
                g.catches++
                give(g, { t: "result", kind: "caught", points: 0, streak: 0, text: "", hunter }) // the phone picks this hunter's line
            }
            caughtIn.set(room, inside.length)
            L.counters.sweeps++
            L.counters.caught += inside.length
            if (L.possessed.delete(room)) sweepEvents.push({ at: now, kind: "cleansed", room, hunter })
            sweepEvents.push({ at: now, kind: "sweep", room, hunter, count: inside.length })
            if (inside.length > 0) sweepEvents.push({ at: now, kind: "caught", room, hunter, count: inside.length })
        }
        const safe = this.#hiding(L).filter(g => !L.swept.includes(g.room))
        for (const g of safe) {
            const mult = Math.min(SCORE.streakMax, 1 + SCORE.streakStep * g.streak)
            const points = safePoints((counts.get(g.room) ?? 0) / Math.max(1, online), g.streak)
            g.streak++
            g.score += points
            give(g, { t: "result", kind: "safe", points, streak: g.streak, text: `SAFE +${points}${mult > 1 ? ` x${mult}` : ""}` })
        }
        const threshold = possessThreshold(L.capOnline || online)
        for (const r of ROOMS) {
            if (L.swept.includes(r.id) || L.possessed.has(r.id) || (counts.get(r.id) ?? 0) < threshold) continue
            L.possessed.add(r.id)
            L.counters.possessions++
            const inside = safe.filter(g => g.room === r.id)
            for (const g of inside) {
                g.score += SCORE.possessRoom
                give(g, { t: "result", kind: "possessed", points: SCORE.possessRoom, streak: g.streak, text: `${r.name} is haunted now. You helped.` })
            }
            this.#event(L, { at: now, kind: "possessed", room: r.id, count: inside.length })
        }
        // the lie: the hunter took the bait (voted the lured room), it was swept and held <= 1 ghost; first liar per room
        const paid = new Set<RoomId>()
        for (const lure of [...L.lures].sort((a, b) => a.at - b.at)) {
            if (lure.beat !== L.beat || paid.has(lure.room) || !L.swept.includes(lure.room) || (caughtIn.get(lure.room) ?? 0) > 1) continue
            if (L.hunters.find(h => h.id === lure.hunter)?.vote !== lure.room) continue
            paid.add(lure.room)
            const g = L.ghosts.get(lure.ghostId)
            if (g) {
                g.score += SCORE.lieWorked
                give(g, { t: "result", kind: "lie", points: SCORE.lieWorked, streak: g.streak, text: `${hunterName(lure.hunter)} believed you. Everyone saw.`, hunter: lure.hunter })
            }
            this.#event(L, { at: now, kind: "lie", room: lure.room, hunter: lure.hunter, ghostId: lure.ghostId, name: L.ghosts.get(lure.ghostId)?.name ?? ghostIdentity(lure.ghostId).name })
        }
        let lead: LiveGhost | null = null
        for (const g of L.ghosts.values()) if (g.score > 0 && (!lead || g.score > lead.score)) lead = g
        if (lead && lead.id !== L.leader) {
            L.leader = lead.id
            this.#event(L, { at: now, kind: "lead", ghostId: lead.id, name: lead.name, count: lead.score })
        }
        const onfire = safe.filter(g => g.streak === 3).sort((a, b) => b.score - a.score)
        if (onfire.length > 0) this.#event(L, { at: now, kind: "onfire", ghostId: onfire[0].id, name: onfire[0].name, room: onfire[0].room, count: onfire.length })
        for (const e of sweepEvents) this.#event(L, e)
    }

    /** hide: only during hide, not while sitting out, only into a room with a free seat; the last one before the bell counts.
     *  Every attempt marks the ghost dirty, so its phone gets the truth on the next beat. */
    #hide(L: Live, g: LiveGhost, room: unknown, now: number): void {
        if (L.phase === "hide" && isRoom(room) && !this.#out(L, g) && !(g.seated && g.room === room) && this.#seatedIn(L, room) < this.#cap(L)) {
            g.room = room
            g.seated = true
            g.seatedAt = now
        }
        L.dirty.add(g.id)
    }

    #arrive(L: Live, id: string, bot: boolean): LiveGhost {
        let g = L.ghosts.get(id)
        if (!g) {
            g = { id, publicId: publicIdOf(id), name: ghostIdentity(id).name, room: randomRoom(), colorIndex: ghostIdentity(id).colorIndex, bot, online: true, ...zeroRound }
            L.ghosts.set(id, g)
            if (!bot) L.counters.joinedToday++
            L.joins++
        } else if (!g.online) {
            g.online = true
            L.joins++
        }
        L.offlineAt.delete(id)
        return g
    }

    /** Caught at beat b: out for the rest of b and all of b + 1. */
    #out(L: Live, g: LiveGhost): boolean {
        return g.caughtBeat > 0 && L.beat <= g.caughtBeat + 1 && L.phase !== "lobby" && L.phase !== "intro"
    }

    /** In play this beat: online, not sitting out, and (from hide on) holding a seat. */
    #hiding(L: Live): LiveGhost[] {
        const seats = L.phase === "hide" || L.phase === "hunting" || L.phase === "reveal"
        return [...L.ghosts.values()].filter(g => g.online && !this.#out(L, g) && (!seats || g.seated))
    }

    #cap(L: Live): number {
        return roomCapacity(L.capOnline || this.#onlineCount(L))
    }

    #seatedIn(L: Live, room: RoomId): number {
        let n = 0
        for (const g of L.ghosts.values()) if (g.seated && g.online && g.room === room && !this.#out(L, g)) n++
        return n
    }

    /** Competition ranking (1, 2, 2, 4) by round score among online ghosts; notes who overtook whom (nearest passed). */
    #rank(L: Live): void {
        const online = [...L.ghosts.values()].filter(g => g.online).sort((a, b) => b.score - a.score)
        const prev = L.ranks
        L.ranks = new Map()
        online.forEach((g, i) => L.ranks.set(g.id, i > 0 && online[i - 1].score === g.score ? L.ranks.get(online[i - 1].id)! : i + 1))
        for (const g of online) {
            const was = prev.get(g.id)
            const now = L.ranks.get(g.id)!
            if (was === undefined || now >= was) continue
            let nearest: LiveGhost | null = null
            for (const o of online) {
                const oWas = prev.get(o.id)
                const oNow = L.ranks.get(o.id)!
                if (oWas !== undefined && oWas < was && oNow > now && (!nearest || oNow < L.ranks.get(nearest.id)!)) nearest = o
            }
            if (nearest) L.passed.set(g.id, nearest.name)
        }
    }

    #admit(socket: HouseSocket, message: unknown): boolean {
        const now = Date.now()
        let b = this.buckets.get(socket.id)
        if (!b) {
            b = { tokens: BURST, last: now, windowStart: now, windowCount: 0 }
            this.buckets.set(socket.id, b)
        }
        if (now - b.windowStart >= 1000) {
            b.windowStart = now
            b.windowCount = 0
        }
        b.windowCount++
        if (b.windowCount > CLOSE_ABOVE_PER_S) {
            console.warn(`[house] closing ${socket.metadata.ghostId || socket.id}: over ${CLOSE_ABOVE_PER_S} messages in 1 s`)
            this.buckets.delete(socket.id)
            socket.close(4029, "too many messages")
            return false
        }
        b.tokens = Math.min(BURST, b.tokens + ((now - b.last) * RATE_PER_S) / 1000)
        b.last = now
        if (b.tokens < 1) return false
        b.tokens -= 1
        return typeof message === "object" && message !== null && JSON.stringify(message).length <= MAX_FRAME_CHARS
    }

    #event(L: Live, e: HouseEvent): void {
        L.events = [...L.events.slice(-(EVENTS_KEPT - 1)), e]
    }

    #persist(L: Live, now: number, asleep = false): void {
        try {
            this.#write(L, now, asleep)
        } catch (error) {
            console.error("[house] persist failed (the clock keeps running on live state)", error) // e.g. disk full
        }
        L.lastPersist = now
    }

    #write(L: Live, now: number, asleep: boolean): void {
        const ghosts: Record<string, SavedGhost> = {}
        for (const { id, publicId: _derived, ...saved } of L.ghosts.values()) ghosts[id] = saved
        this.save = {
            phase: L.phase,
            mode: L.mode,
            endsAt: L.endsAt,
            round: L.round,
            beat: L.beat,
            winner: L.winner,
            ghosts,
            possessed: [...L.possessed],
            swept: L.swept.slice(),
            hunters: L.hunters.map(h => ({ ...h })),
            lures: L.lures.slice(),
            beatResults: L.beatResults,
            capOnline: L.capOnline,
            counters: { ...L.counters },
            events: L.events.slice(),
            restoredAt: L.restoredAt,
            ...(L.lastRecoveryMs !== undefined ? { lastRecoveryMs: L.lastRecoveryMs } : {}),
            asleep,
            savedAt: now,
        }
    }

    /** Live state for this wake: from the last snapshot, or fresh. A snapshot not written asleep means we crashed. */
    #ensureLive(): Live {
        if (this.live) return this.live
        const now = Date.now()
        const s = this.save && isPhase(this.save.phase) && Array.isArray(this.save.possessed) ? this.save : null // older shapes start fresh
        const L: Live = {
            phase: s?.phase ?? "lobby",
            mode: s?.mode ?? "show",
            endsAt: s?.endsAt ?? 0,
            round: s?.round ?? 0,
            beat: s?.beat ?? 0,
            winner: s?.winner ?? null,
            ghosts: new Map(Object.entries(s?.ghosts ?? {}).map(([id, g]) => [id, { ...zeroRound, ...g, name: g.name ?? ghostIdentity(id).name, id, publicId: publicIdOf(id) }])),
            possessed: new Set(s?.possessed ?? []),
            swept: s?.swept.slice() ?? [],
            hunters: s?.hunters.map(h => ({ ...h, lean: h.lean ?? null })) ?? freshHunters(),
            lures: s?.lures.slice() ?? [],
            counters: s ? { ...s.counters } : zeroCounters(),
            events: s?.events.slice() ?? [],
            restoredAt: s?.restoredAt ?? null,
            ...(s?.lastRecoveryMs !== undefined ? { lastRecoveryMs: s.lastRecoveryMs } : {}),
            offlineAt: new Map(),
            results: new Map(),
            dirty: new Set(),
            sentYou: new Map(),
            youAt: new Map(),
            beatResults: s?.beatResults ?? {},
            capOnline: s?.capOnline ?? 0,
            waves: 0,
            lastSay: new Map(),
            lastWave: new Map(),
            ranks: new Map(),
            leader: null,
            passed: new Map(),
            flushQueue: [],
            joins: 0,
            perf: { since: now, beats: 0, ms: 0, max: 0 },
            lastBeat: now,
            lastRooms: 0,
            lastRoomsBroadcast: 0,
            lastSnap: 0,
            connected: 1,
            countedAt: 0,
            reconcile: true,
            lastPersist: now,
        }
        for (const g of L.ghosts.values()) if (g.online) L.offlineAt.set(g.id, now + GRACE_MS)
        this.#rank(L)
        for (const g of L.ghosts.values()) if (g.score > 0 && (!L.leader || g.score > L.ghosts.get(L.leader)!.score)) L.leader = g.id
        console.log(`[house] awake in pid ${process.pid} (${PID_FILE})`)
        const dead = deadExecutor()
        const deadBeat = dead?.at ?? null
        startHolder(dead?.holder ?? 0)
        try {
            mkdirSync(dirname(PID_FILE), { recursive: true })
        } catch {
            // writePidFile reports it
        }
        writePidFile(now)
        if (s && !s.asleep) {
            L.restoredAt = now
            const outage = deadBeat !== null && now - deadBeat < 10 * 60_000 ? now - deadBeat : null
            this.#event(L, { at: now, kind: "revived", count: L.offlineAt.size, ...(outage !== null ? { text: `back in ${(outage / 1000).toFixed(2)} s` } : {}) })
            if (outage !== null) L.lastRecoveryMs = outage
            if (outage !== null) console.log(`[house] outage ${outage} ms (last beat of the dead executor -> this wake)`)
            console.log(`[house] revived from the ${new Date(s.savedAt).toISOString()} snapshot: ${s.phase} beat ${s.beat}, ${L.offlineAt.size} ghosts, ${Math.round((s.endsAt - now) / 1000)} s left in the phase`)
        }
        this.live = L
        return L
    }

    #arm(now: number): void {
        const at = this.alarm.get()
        if (at === null || at > now + BEAT_MS) this.alarm.set(now + BEAT_MS)
    }

    // ---------- views ----------

    #counts(L: Live): Map<RoomId, number> {
        const counts = new Map<RoomId, number>()
        for (const g of this.#hiding(L)) counts.set(g.room, (counts.get(g.room) ?? 0) + 1)
        return counts
    }

    #onlineCount(L: Live): number {
        let n = 0
        for (const g of L.ghosts.values()) if (g.online) n++
        return n
    }

    #roomStates(L: Live): RoomState[] {
        const counts = this.#counts(L)
        const cap = this.#cap(L)
        return ROOMS.map(r => ({ id: r.id, count: counts.get(r.id) ?? 0, cap, possessed: L.possessed.has(r.id), swept: L.swept.includes(r.id) }))
    }

    #counters(L: Live): Counters {
        let humans = 0
        let bots = 0
        for (const g of L.ghosts.values()) if (g.online) g.bot ? bots++ : humans++
        return { online: humans + bots, humans, bots, ...L.counters }
    }

    #snap(L: Live, now: number): StageSnap {
        const ghosts: GhostTuple[] = []
        const top: StageSnap["top"] = []
        let last: LiveGhost | null = null
        for (const g of L.ghosts.values()) {
            if (g.online && (!last || g.score < last.score)) last = g
            if (g.online) ghosts.push([g.id, g.colorIndex, g.room, (this.#out(L, g) ? 1 : 0) | (g.bot ? 2 : 0)])
            if (g.score <= 0 || (top.length === 10 && g.score <= top[9][3])) continue
            top.push([g.id, g.name, g.colorIndex, g.score, g.streak])
            top.sort((a, b) => b[3] - a[3])
            if (top.length > 10) top.pop()
        }
        return {
            phase: L.phase,
            mode: L.mode,
            endsAt: L.endsAt,
            now,
            round: L.round,
            beat: L.beat,
            ghosts,
            rooms: this.#roomStates(L),
            hunters: L.hunters.map(h => ({ ...h, vote: L.phase === "reveal" || L.phase === "finale" ? h.vote : null })), // votes stay secret until the reveal
            sweptRooms: L.swept,
            counters: this.#counters(L),
            events: L.events.slice(-20),
            winner: L.winner,
            top,
            rumors: this.#rumors(L),
            ...(last && L.round > 0 ? { last: [last.id, last.name, last.colorIndex, last.score, last.streak] as [string, string, number, number, number] } : {}),
            restoredAt: L.restoredAt,
            ...(L.lastRecoveryMs !== undefined ? { lastRecoveryMs: L.lastRecoveryMs } : {}),
        }
    }

    /** Room heat: lies told this beat per room (public); which ghost lied stays secret. */
    #rumors(L: Live): Partial<Record<RoomId, number>> {
        const heat: Partial<Record<RoomId, number>> = {}
        for (const l of L.lures) if (l.beat === L.beat) heat[l.room] = (heat[l.room] ?? 0) + 1
        return heat
    }

    #you(L: Live, g: LiveGhost): You {
        const of = L.ranks.size || this.#onlineCount(L)
        const out = this.#out(L, g)
        const passed = L.passed.get(g.id) // cleared when a "you" carrying it is actually sent
        const seats = L.phase === "hide" || L.phase === "hunting" || L.phase === "reveal"
        return { t: "you", publicId: g.publicId, room: out || (seats && !g.seated) ? null : g.room, score: g.score, caught: out, name: g.name, colorIndex: g.colorIndex, rank: L.ranks.get(g.id) ?? of, of, streak: g.streak, ...(passed ? { passed } : {}) }
    }

    #phaseMsg(L: Live): HouseToPhone {
        return { t: "phase", phase: L.phase, endsAt: L.endsAt, beat: L.beat, round: L.round, winner: L.winner }
    }

    /** Phones' 2 Hz room view: live counts plus up to 4 faces per room (on fire first, then the latest to sit). */
    #roomsMsg(L: Live): HouseToPhone {
        const faces = new Map<RoomId, LiveGhost[]>()
        for (const g of this.#hiding(L)) faces.set(g.room, [...(faces.get(g.room) ?? []), g])
        const leans = L.hunters.filter(h => h.lean !== null).map((h): [HunterId, RoomId] => [h.id, h.lean!])
        return {
            t: "rooms",
            leans,
            rooms: this.#roomStates(L).map(r => ({
                ...r,
                seated: (faces.get(r.id) ?? [])
                    .sort((a, b) => Math.min(b.streak, 3) - Math.min(a.streak, 3) || b.seatedAt - a.seatedAt)
                    .slice(0, 4)
                    .map((g): [string, number, number] => [g.publicId, g.colorIndex, g.streak]),
            })),
        }
    }
}

/** One per phone (id = playerId). Lifetime stats in the ghost's own SQLite; the House adds each round at the finale.
 *  Every live actor is its own host + executor (~70 MB locally), so a Ghost sleeps 4 s after its last call (1 s raced host startup under load: "activation changed concurrently"). */
@Compute({ idleTimeoutMs: 4_000 })
export class Ghost extends Actor {
    @Persisted private record: GhostRecord | null = null

    async ensure(input: { id: string; bot?: boolean }): Promise<GhostRecord> {
        if (input.id !== this.id) throw new Error(`ensure(${input.id}) called on Ghost ${this.id}`)
        const now = Date.now()
        if (this.record) {
            this.record = { ...this.record, lastSeen: now }
            return this.record
        }
        const { name, colorIndex } = ghostIdentity(this.id)
        this.record = { id: this.id, name, color: GHOST_COLORS[colorIndex], createdAt: now, ecto: 0, banished: 0, whispers: 0, rounds: 0, lastSeen: now }
        return this.record
    }

    async get(): Promise<GhostRecord> {
        if (!this.record) throw new Error(`Ghost ${this.id} does not exist yet (call ensure first)`)
        return this.record
    }

    /** The guest's own name, already sanitized by the server. */
    async rename(input: { name: string }): Promise<GhostRecord> {
        const name = String(input.name).slice(0, NAME_MAX).toLowerCase()
        if (name.trim() === "") throw new Error("rename needs a name")
        const r = this.record ?? (await this.ensure({ id: this.id }))
        this.record = { ...r, name, lastSeen: Date.now() }
        return this.record
    }

    async add(input: { ecto?: number; banished?: number; whispers?: number; rounds?: number }): Promise<void> {
        const r = this.record ?? (await this.ensure({ id: this.id }))
        this.record = {
            ...r,
            ecto: r.ecto + (input.ecto ?? 0),
            banished: r.banished + (input.banished ?? 0),
            whispers: r.whispers + (input.whispers ?? 0),
            rounds: r.rounds + (input.rounds ?? 0),
            lastSeen: Date.now(),
        }
    }
}
