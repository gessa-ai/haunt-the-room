// L2 smoke: real sockets against a dev server this script starts (and kill -9s) on :7311 with its own state dir.
// One full round (8 beats of hide -> hunting -> reveal) with 60 ghost sockets + a stage socket: hides, votes, sweeps,
// safe/caught/possessed/lie results, sitting out, a flood socket, waves, taunts; kill -9 the whole dev server mid-beat
// (restart, reconnect: same beat, same rooms and scores, restoredAt set); kill -9 only the House's JS executor mid-beat
// (no socket drops, same deadline); the finale and its throttled flush to the Ghost actors.
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { GHOST_COLORS, ROOMS, TIMING, beatsFor, roomCapacity, SCORE, possessThreshold, safePoints, type HouseToPhone, type Phase, type RoomId, type StageSnap } from "../../contract/protocol"

const PORT = 7311
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const STATE = join(ROOT, "var", `smoke-${Date.now()}`)
process.env.DURABLE_ACTORS_CONTROL_PLANE_URL = `http://127.0.0.1:${PORT}`
mkdirSync(STATE, { recursive: true })

const t0 = Date.now()
const log = (msg: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`)
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
function check(ok: boolean, what: string): void {
    if (!ok) throw new Error(`FAIL: ${what}`)
    log(`ok  ${what}`)
}
async function until(pred: () => boolean, ms: number, what: string): Promise<void> {
    const end = Date.now() + ms
    while (!pred()) {
        if (Date.now() > end) throw new Error(`FAIL (timeout ${ms} ms): ${what}`)
        await sleep(20)
    }
}

let server: ChildProcess | null = null
let watchdog: ReturnType<typeof setInterval> | undefined
let serverOut = ""
async function startServer(): Promise<number> {
    const started = Date.now()
    const child = spawn("bunx", ["durable-actors", "dev", "--port", String(PORT), "--no-watch"], {
        cwd: ROOT,
        env: { ...process.env, DURABLE_ACTORS_DATA_DIR: STATE },
        detached: true, // own process group: kill -9 takes the runtime and its workers, nothing else
        stdio: ["ignore", "pipe", "pipe"],
    })
    server = child
    serverOut = ""
    const sink = (d: Buffer): void => {
        serverOut += String(d)
        appendFileSync(join(STATE, "server.log"), d)
    }
    child.stdout?.on("data", sink)
    child.stderr?.on("data", sink)
    await until(() => serverOut.includes("Ready") || child.exitCode !== null, 60_000, "dev server Ready")
    if (!serverOut.includes("Ready")) throw new Error(`dev server failed:\n${serverOut}`)
    return Date.now() - started
}
function killServer(): void {
    try {
        if (server?.pid) process.kill(-server.pid, "SIGKILL")
    } catch {
        // already gone
    }
    server = null
}

/** The server's join retries once too: a call can race a Ghost host that is exiting idle ("actor host is unavailable"). */
let retries = 0
async function once<T>(call: () => Promise<T>): Promise<T> {
    try {
        return await call()
    } catch (error) {
        retries++
        log(`retry after: ${error instanceof Error ? error.message : String(error)}`)
        await sleep(300)
        return call()
    }
}

type Msg = HouseToPhone | { t: "snap"; s: StageSnap }
type Result = Extract<HouseToPhone, { t: "result" }>
interface Client {
    id: string
    ws: WebSocket
    msgs: Msg[]
    you: Extract<HouseToPhone, { t: "you" }> | null
    phase: Extract<HouseToPhone, { t: "phase" }> | null
    snap: StageSnap | null
    closed: number | null
}

async function main(): Promise<void> {
    log(`dev server :${PORT} started in ${await startServer()} ms (state ${STATE})`)
    const gen = spawnSync("bunx", ["durable-actors", "generate", join(ROOT, "src", "actors.ts")], { cwd: ROOT, env: process.env, encoding: "utf8" })
    if (gen.status !== 0) throw new Error(`generate failed: ${gen.stderr}`)
    const { actors } = await import("../generated/index.js")
    const house = actors.House.get("main")

    async function connect(role: "ghost" | "stage" | "bot", id: string): Promise<Client> {
        const grant = await actors.House.prepareWebsocket({ actorId: "main", metadata: { role, ghostId: id, colorIndex: 0 } })
        const c: Client = { id, ws: new WebSocket(grant.websocketUrl), msgs: [], you: null, phase: null, snap: null, closed: null }
        c.ws.onmessage = e => {
            const m = JSON.parse(String(e.data)) as Msg
            c.msgs.push(m)
            if (m.t === "you") c.you = m
            else if (m.t === "phase") c.phase = m
            else if (m.t === "snap") c.snap = m.s
        }
        c.ws.onclose = e => (c.closed = e.code)
        await new Promise<void>((resolve, reject) => {
            c.ws.onopen = () => resolve()
            c.ws.onerror = () => reject(new Error(`socket ${role} ${id} failed to open`))
        })
        return c
    }
    const count = (c: Client, t: Msg["t"]): number => c.msgs.filter(m => m.t === t).length
    const results = (c: Client, beat: number): Result[] => {
        // results arrive during the reveal of `beat` (after that beat's phase message)
        // after this beat's hunting bell and before the next beat (frames are unordered within one tick)
        const start = c.msgs.findIndex(m => m.t === "phase" && m.phase === "hunting" && m.beat === beat)
        if (start < 0) return []
        const end = c.msgs.findIndex((m, i) => i > start && m.t === "phase" && (m.phase === "hide" || m.phase === "finale" || m.phase === "lobby"))
        return c.msgs.slice(start, end < 0 ? undefined : end).filter((m): m is Result => m.t === "result")
    }
    const hide = (c: Client, room: RoomId): void => c.ws.send(JSON.stringify({ t: "hide", room }))
    const atPhase = (c: Client, phase: Phase, beat?: number): boolean => c.phase?.phase === phase && (beat === undefined || c.phase.beat === beat)

    // the server's watchdog: House.stats() once a second re-arms the heartbeat if an alarm was lost in a crash
    watchdog = setInterval(() => void house.stats().catch(() => undefined), 1_000)
    // ---------- setup ----------
    await house.reset()
    const ids = Array.from({ length: 60 }, () => crypto.randomUUID())
    const records = await Promise.all(ids.map(id => once(() => actors.Ghost.get(id).ensure({ id }))))
    check(records.every(r => /^[a-z.]+ [a-z]+$/.test(r.name) && GHOST_COLORS.includes(r.color as (typeof GHOST_COLORS)[number])), `60 Ghost actors ensured (e.g. "${records[0].name}" ${records[0].color})`)
    const again = await once(() => actors.Ghost.get(ids[0]).ensure({ id: ids[0] }))
    check(again.name === records[0].name && again.createdAt === records[0].createdAt, "ensure is idempotent (same name, same createdAt)")
    const stage = await connect("stage", "")
    let tc = Date.now()
    const ghosts = await Promise.all(ids.map(id => connect("ghost", id)))
    await until(() => ghosts.every(g => g.you && g.phase && count(g, "rooms") > 0), 5_000, "every ghost got you + phase + rooms")
    check(true, `60 ghost sockets + stage connected and greeted in ${Date.now() - tc} ms (${ghosts[0].you!.name}, rank ${ghosts[0].you!.rank} of ${ghosts[0].you!.of})`)
    const snaps0 = count(stage, "snap")
    const you0 = count(ghosts[0], "you")
    await sleep(2_000)
    check((count(stage, "snap") - snaps0) / 2 >= 2 && count(ghosts[0], "you") - you0 <= 1, `heartbeat: stage snaps ${(count(stage, "snap") - snaps0) / 2} Hz; an idle phone gets no frames (you only on change)`)

    // ---------- beat 1 ----------
    await house.setPhase({ phase: "intro", mode: "show" })
    await until(() => ghosts.every(g => atPhase(g, "intro")), 2_000, "intro")
    const intoRoom = ghosts[0].you!.room
    const other: RoomId = intoRoom === "crypt" ? "attic" : "crypt"
    hide(ghosts[0], other)
    await sleep(300)
    check(ghosts[0].you!.room === intoRoom, `a hide during the intro is refused (stays in the ${intoRoom})`)
    await until(() => ghosts.every(g => atPhase(g, "hide", 1)), 20_000, "beat 1 hide")
    const plan: RoomId[] = ids.map((_, i) => (i < 15 ? "attic" : i < 30 ? "library" : i < 42 ? "ballroom" : i < 51 ? "crypt" : "nursery"))
    tc = Date.now()
    ghosts.forEach((g, i) => hide(g, plan[i]))
    await until(() => ghosts.every((g, i) => g.you!.room === plan[i]), 3_000, "hides confirmed")
    await sleep(1_200) // rooms reach the phones at 1 Hz
    const faces = ghosts[0].msgs.filter((m): m is Extract<HouseToPhone, { t: "rooms" }> => m.t === "rooms").at(-1)!.rooms.find(x => x.id === "attic")!
    check(faces.seated?.length === 4 && faces.count === 15 && faces.cap === roomCapacity(60), `rooms to phones: attic ${faces.count}/${faces.cap} with 4 faces`)
    check(true, `beat 1 hide: 60 hides confirmed in ${Date.now() - tc} ms (seats per room: ${roomCapacity(60)})`)
    hide(ghosts[15], "attic")
    await sleep(400)
    check(ghosts[15].you!.room === "library", "musical chairs: a 16th ghost cannot get into the full attic (stays in the library)")
    await until(() => stage.snap?.rooms.find(r => r.id === "attic")?.count === 15, 1_000, "stage live counts")
    check(stage.snap!.rooms.map(r => `${r.id} ${r.count}`).join(", ") === "attic 15, nursery 9, library 15, ballroom 12, chapel 0, crypt 9", `live counts on the stage: ${stage.snap!.rooms.map(r => `${r.id} ${r.count}`).join(", ")}`)
    for (const [hunter, room] of [["exorcist", "chapel"], ["medium", "chapel"], ["skeptic", "library"], ["priest", "library"]] as const) {
        const v = await house.sweep({ hunter, room })
        if (!v.ok) throw new Error(`FAIL: vote ${hunter} ${room}: ${v.reason}`)
    }
    const leaned = await house.lean({ hunter: "medium", room: "crypt", conviction: 80, swayedBy: "aunt thistle" })
    await sleep(1_300)
    const lastRooms = ghosts[0].msgs.filter((m): m is Extract<HouseToPhone, { t: "rooms" }> => m.t === "rooms").at(-1)!
    check(leaned.ok && JSON.stringify(lastRooms.leans) === '[["medium","crypt"]]' && stage.snap!.hunters.find(h => h.id === "medium")!.lean === "crypt" && stage.snap!.hunters.find(h => h.id === "medium")!.conviction === 80 && stage.snap!.hunters.find(h => h.id === "medium")!.swayedBy === "aunt thistle", "lean: the medium openly leans crypt (phones + stage); her real vote is chapel")
    check(stage.snap!.hunters.every(h => h.vote === null), "4 votes in; the stage keeps them secret during hide")
    const lure58 = await house.recordWhisper({ ghostId: ids[58], hunter: "exorcist", room: "chapel" })
    const lure58b = await house.recordWhisper({ ghostId: ids[58], hunter: "medium", room: "chapel" })
    const lure59 = await house.recordWhisper({ ghostId: ids[59], hunter: "medium", room: "chapel" })
    await sleep(300)
    check(stage.snap!.rumors?.chapel === 2, `stage rumors this beat: ${JSON.stringify(stage.snap!.rumors)}`)
    check(lure58.ok && !lure58b.ok && lure59.ok, `lures: #58 -> exorcist/chapel ok, #58 again "${lure58b.reason}", #59 -> medium/chapel ok`)
    await house.taunt({ hunter: "priest", text: "I can hear you breathing in the library." })
    await house.taunt({ hunter: "priest", text: "And in the attic." })
    ghosts[1].ws.send(JSON.stringify({ t: "wave" }))
    ghosts[1].ws.send(JSON.stringify({ t: "wave" }))
    await until(() => ghosts.every(g => count(g, "say") === 1), 1_000, "say reached every phone")
    await sleep(300)
    const waves = stage.snap!.events.filter(e => e.kind === "wave")
    check(ghosts.every(g => count(g, "say") === 1) && waves.length === 1 && waves[0].name === ghosts[1].you!.name, `taunt -> one say per 3 s per hunter on every phone; wave -> one "wave" event naming ${waves[0]?.name}`)

    await house.rename({ ghostId: ids[2], name: "Spooky Sam" })
    const renamed = await once(() => actors.Ghost.get(ids[2]).rename({ name: "Spooky Sam" }))
    await until(() => ghosts[2].you!.name === "spooky sam", 1_500, "renamed you")
    check(renamed.name === "spooky sam", `rename: House + Ghost record; the next "you" says ${ghosts[2].you!.name}`)
    await until(() => ghosts.every(g => atPhase(g, "hunting", 1)), TIMING.firstHideMs + 2_000, "beat 1 hunting")
    const huntingLie = await house.recordWhisper({ ghostId: ids[57], hunter: "skeptic", room: "library" })
    check(huntingLie.ok, "a lie told during hunting is accepted (resolves at the reveal)")
    hide(ghosts[55], "attic")
    await sleep(300)
    check(ghosts[55].you!.room === "nursery" && stage.snap!.hunters.every(h => h.vote === null), "hunting: phones locked (a late hide snaps back), votes still secret")

    await until(() => ghosts.every(g => atPhase(g, "reveal", 1)) && ghosts.every(g => results(g, 1).length > 0), TIMING.huntingMs + 3_000, "beat 1 reveal results")
    const swept = stage.snap!.sweptRooms
    check(stage.snap!.hunters.every(h => h.vote !== null), "reveal: the four votes are shown")
    check(swept.join(",") === "library,chapel", `reveal: swept ${swept.join(" + ")} (2-2 tie, the crowded library first)`)
    const r = (i: number): string => results(ghosts[i], 1).map(x => x.text).sort().join(" | ") // sends may arrive in any order
    const safeAttic = safePoints(15 / 60, 0)
    check(ghosts.slice(15, 30).every(g => results(g, 1).map(x => `${x.kind}:${x.hunter}`).join() === "caught:skeptic"), `15 library ghosts: caught by the skeptic`)
    check(ghosts.slice(0, 15).every(g => r(ghosts.indexOf(g)) === [`SAFE +${safeAttic}`, "The Attic is haunted now. You helped."].sort().join(" | ")), `attic (15 of 60, threshold ${possessThreshold(60)}): "${r(0)}"`)
    const safeNursery = `SAFE +${safePoints(9 / 60, 0)}`
    const plannedCount = (room: RoomId): number => plan.filter(p => p === room).length
    const haunted = (room: RoomId): string[] => (plannedCount(room) >= possessThreshold(60) ? [`${ROOMS.find(x => x.id === room)!.name} is haunted now. You helped.`] : [])
    check(r(58) === [safeNursery, "The Exorcist believed you. Everyone saw.", ...haunted("nursery")].sort().join(" | ") && r(59) === [safeNursery, ...haunted("nursery")].sort().join(" | "), `#58 (nursery, first liar): "${r(58)}"; #59 (second liar): "${r(59)}"`)
    const lieEvent = stage.snap!.events.find(e => e.kind === "lie")
    const leadEvent = stage.snap!.events.find(e => e.kind === "lead")
    check(leadEvent?.ghostId === ids[58], `stage "lead" event: ${leadEvent?.name} takes #1`)
    check(lieEvent?.ghostId === ids[58] && lieEvent.name === ghosts[58].you!.name, `stage "lie" event names ${lieEvent?.name}`)
    const possessed1 = stage.snap!.rooms.filter(x => x.possessed).map(x => x.id)
    const expectPossessed = ROOMS.map(x => x.id).filter(id => id !== "library" && id !== "chapel" && plannedCount(id) >= possessThreshold(60))
    check(possessed1.join(",") === expectPossessed.join(","), `possessed after beat 1: ${possessed1.join(", ")}`)
    await sleep(700)
    const top = stage.snap!.top
    check(top[0][0] === ids[58] && ghosts[58].you!.rank === 1 && top.every((t, i) => i === 0 || top[i - 1][3] >= t[3]), `top 5: ${top.map(t => `${t[1]} ${t[3]}`).join(", ")}; #58 rank ${ghosts[58].you!.rank} of ${ghosts[58].you!.of}, streak ${ghosts[58].you!.streak}`)

    // ---------- beat 2: the caught sit out; kill -9 the whole dev server mid-beat ----------
    await until(() => ghosts.every(g => atPhase(g, "hide", 2)), 6_000, "beat 2 hide")
    hide(ghosts[15], "crypt")
    await sleep(300)
    check(ghosts.slice(15, 30).every(g => g.you!.caught && g.you!.room === null) && stage.snap!.rooms.find(x => x.id === "crypt")!.count === 9, "beat 2: the 15 caught sit out (caught, room null; their hides are refused)")
    for (const hunter of ["exorcist", "medium", "skeptic", "priest"] as const) await house.sweep({ hunter, room: "attic" })
    await sleep(1_200) // let a snapshot land (persistEveryMs = 1000)
    const before = new Map(ghosts.map(g => [g.id, g.you!.room]))
    const scores = new Map(ghosts.map(g => [g.id, g.you!.score]))
    const killAt = Date.now()
    killServer()
    await until(() => ghosts.every(g => g.closed !== null) && stage.closed !== null, 5_000, "all sockets dropped")
    check(true, `kill -9 the dev server in beat 2 hide: 61 sockets dropped`)
    const restartMs = await startServer()
    // phones retry with a fresh grant until the house answers (the runtime refuses activation while the dead owner lease lives)
    const greeted = (c: Client | undefined): boolean => !!c && (c.id === "" ? c.snap !== null : !!(c.you && c.phase))
    const live = new Map<string, Client>()
    const want = ["", ...ids]
    let attempts = 0
    while (!want.every(id => greeted(live.get(id)))) {
        if (Date.now() - killAt > 60_000) throw new Error("FAIL: house did not answer within 60 s of the kill")
        attempts++
        await Promise.all(want.filter(id => !greeted(live.get(id))).map(async id => live.set(id, await connect(id === "" ? "stage" : "ghost", id))))
        await until(() => want.every(id => greeted(live.get(id)) || live.get(id)!.closed !== null), 3_000, "greeted or closed").catch(() => undefined)
        if (!want.every(id => greeted(live.get(id)))) await sleep(500)
    }
    const stage2 = live.get("")!
    const back = ids.map(id => live.get(id)!)
    check(true, `server restarted in ${restartMs} ms; all 60 ghosts back ${Date.now() - killAt} ms after the kill (${attempts} reconnect rounds)`)
    check(back.every(g => g.phase!.beat === 2), `resumed in the same beat: ${back[0].phase!.phase} beat ${back[0].phase!.beat}`)
    check(back.every(g => g.you!.room === before.get(g.id) && g.you!.score === scores.get(g.id)), "every ghost is back in the same room with the same score")
    const s2 = stage2.snap!
    check(s2.restoredAt !== null && s2.restoredAt >= killAt && s2.events.some(e => e.kind === "revived"), `restoredAt set (+${s2.restoredAt! - killAt} ms after the kill), "revived" event`)
    check(s2.rooms.filter(x => x.possessed).map(x => x.id).join(",") === possessed1.join(",") && s2.counters.sweeps === 2 && s2.counters.caught === 15, `possession + counters survived: ${JSON.stringify(s2.counters)}`)
    await until(() => back.every(g => atPhase(g, "reveal", 2) && results(g, 2).length + (g.you!.caught ? 1 : 0) > 0), TIMING.hideMs + TIMING.huntingMs + 5_000, "beat 2 reveal")
    check(stage2.snap!.sweptRooms[0] === "attic" && back.slice(0, 15).every(g => results(g, 2).map(x => `${x.kind}:${x.hunter}`).join() === "caught:exorcist"), `beat 2 votes survived the kill: swept ${stage2.snap!.sweptRooms.join(" + ")}; the attic was cleansed: ${!stage2.snap!.rooms.find(x => x.id === "attic")!.possessed}`)

    // ---------- beat 3: kill -9 only the House's JS executor mid-beat ----------
    await until(() => back.every(g => atPhase(g, "hide", 3)), 6_000, "beat 3 hide")
    await until(() => back.slice(15, 30).every(g => !g.you!.caught && g.you!.room === null), 2_000, "beat-1 caught back in play")
    check(back.slice(0, 15).every(g => g.you!.caught), "beat 3: the beat-1 caught are back (no seat until they pick one: room null); the beat-2 caught (attic) sit out")
    // 10 consecutive executor kills, mid-beat: the pid comes from the House's own pid file (what the stage kill uses)
    const pidFile = join(ROOT, "..", "logs", `house-executor-${PORT}.pid`)
    const gaps: number[] = []
    for (let k = 1; k <= 10; k++) {
        await sleep(1_200) // a snapshot lands between kills (persistEveryMs = 1000)
        const pid = Number(readFileSync(pidFile, "utf8").split(" ")[0])
        const pre = stage2.snap!
        const rooms = new Map(pre.ghosts.map(t => [t[0], t[2]]))
        const killAt = Date.now()
        process.kill(pid, "SIGKILL")
        await until(() => (stage2.snap?.restoredAt ?? 0) > pre.restoredAt!, 40_000, `house revived after executor kill ${k}`)
        const gap = Date.now() - killAt
        gaps.push(gap)
        const post = stage2.snap!
        const revived = post.events.filter(e => e.kind === "revived").at(-1)
        const samePhase = post.phase === pre.phase && post.beat === pre.beat
        check(
            back.every(g => g.closed === null) && stage2.closed === null && (!samePhase || post.endsAt === pre.endsAt) && post.ghosts.every(t => rooms.get(t[0]) === t[2]),
            `executor kill ${k}/10 (pid ${pid}, ${pre.phase} beat ${pre.beat}): back in ${gap} ms, 0 of 61 sockets closed, ${samePhase ? "same deadline" : `now ${post.phase} beat ${post.beat}`}, same rooms; House says "${revived?.text}"`,
        )
    }
    await sleep(500)
    check(stage2.snap!.counters.online === 60, `after 10 executor kills the House still counts ${stage2.snap!.counters.online} online (presence rebuilt from the gateway's sockets)`)
    check((stage2.snap!.lastRecoveryMs ?? 0) > 0, `StageSnap.lastRecoveryMs = ${stage2.snap!.lastRecoveryMs} ms`)
    gaps.sort((a, b) => a - b)
    check(gaps[9] < 5_000, `10 executor kills: recovery p50 ${gaps[4]} ms, max ${gaps[9]} ms, no phone disconnected`)

    // ---------- the remaining beats run on their own (unvoted: the most crowded rooms are swept), then the finale ----------
    await until(() => back.every(g => atPhase(g, "finale")) && stage2.snap?.phase === "finale", beatsFor("show") * (TIMING.hideMs + TIMING.huntingMs + TIMING.revealMs + 2_000), "finale")
    const finale = stage2.snap!
    check(finale.beat === beatsFor("show") && finale.counters.rounds === 1, `finale after ${beatsFor("show")} beats (show mode): winner ${finale.winner} (${finale.rooms.filter(x => x.possessed).length} possessed), ${finale.counters.sweeps} sweeps, ${finale.counters.caught} caught`)
    // (this scripted round has no overtakes after beat 1: everyone starts tied at rank 1 and later beats sweep the crowd)
    log(`info: "you.passed" sent ${back.reduce((n, g) => n + g.msgs.filter(m => m.t === "you" && m.passed !== undefined).length, 0)} times`)
    const finaleAt = Date.now()
    await sleep(700)
    const finalScore = back[58].you!.score
    const roundsIn = async (): Promise<number> => (await Promise.all(ids.map(id => once(() => actors.Ghost.get(id).get())))).filter(x => x.rounds === 1).length
    let landed = 0
    while ((landed = await roundsIn()) < 60) {
        if (Date.now() - finaleAt > 30_000) throw new Error(`FAIL: only ${landed} of 60 Ghost actors got the round within 30 s`)
        await sleep(500)
    }
    const rec58 = await once(() => actors.Ghost.get(ids[58]).get())
    const rec16 = await once(() => actors.Ghost.get(ids[16]).get())
    check(rec58.ecto === finalScore && rec58.whispers === 1 && rec16.banished >= 1, `all 60 Ghost actors got the round in ${Date.now() - finaleAt} ms (throttled): ${rec58.name} ecto ${rec58.ecto} whispers ${rec58.whispers}; ${rec16.name} banished ${rec16.banished}`)

    const flood = await connect("bot", `flood-${crypto.randomUUID()}`)
    for (let i = 0; i < 100; i++) hide(flood, "attic")
    await until(() => flood.closed !== null, 3_000, "flood socket closed")
    check(flood.closed === 4029 && count(flood, "you") <= 20, `flood socket: ${count(flood, "you")} of 100 frames admitted, closed ${flood.closed}`)
    for (const c of [...back, stage2]) c.ws.close()
    log(`PASS (${((Date.now() - t0) / 1000).toFixed(1)} s, ${retries} Ghost call retries)`)
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(() => {
        clearInterval(watchdog)
        killServer()
    })
