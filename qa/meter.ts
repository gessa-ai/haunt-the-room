// L13 QA meter for THE LOOP (beats): joins as the stage (+ the Relay observer feed), measures every beat and round
// against the balance targets, and times every actors outage (kill -9) to recovery. Measurement tool, not a test.
//   bun qa/meter.ts [--secs 9000] [--kills 5 --kill-gap 25]
//   --kills N: kill -9 logs/actors.pid N times, mid-beat (during hide/hunting), --kill-gap s apart (only that pid).
// Output: stdout lines; qa/runs/beats.jsonl, rounds.jsonl, kills.jsonl; qa/runs/meter-latest.json every 10 s.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import type { GhostTuple, HouseEvent, StageSnap } from "../contract/protocol.ts"
import { ROOT, observerUrl, stageGrant, ts } from "./env.ts"

const arg = (k: string, d: number) => (process.argv.includes(`--${k}`) ? Number(process.argv[process.argv.indexOf(`--${k}`) + 1]) : d)
const SECS = arg("secs", 9000)
let killsLeft = arg("kills", 0)
const KILL_GAP_MS = arg("kill-gap", 25) * 1000
const RUNS = `${ROOT}/qa/runs`
const out = (line: string) => console.log(`${ts()} ${line}`)
const caughtSet = (s: StageSnap) => new Set(s.ghosts.filter((g: GhostTuple) => (g[3] & 1) === 1).map((g) => g[0]))
const possessedOf = (s: StageSnap) => s.rooms.filter((r) => r.possessed).map((r) => r.id)

let last: StageSnap | null = null
let lastAt = 0
let snapsWindow = 0
const seen = new Set<string>()
const seenOrder: string[] = []
const evKey = (e: HouseEvent) => `${e.at}|${e.kind}|${e.room ?? ""}|${e.hunter ?? ""}|${e.count ?? ""}|${e.ghostId ?? ""}|${e.text ?? ""}`

// ---------- per beat / per round ----------
interface Beat { beat: number; online: number; caught: number; share: number; swept: string; votesInTime: number; votes: string; possessed: number; newPossessed: number; revealAt: number }
let round: { round: number; mode: string; introAt: number; beats: Beat[]; firstPossessBeat: number | null; ev: Record<string, number>; feed: Record<string, number>; outages: number } | null = null
let lastHunting: StageSnap | null = null
const votes = new Map<string, Set<string>>() // "round.beat" -> hunters whose own vote arrived (House "vote" event or Relay sweep action)
const voteKey = () => (last ? `${last.round}.${last.beat}` : "?")
const addVote = (h: string | undefined) => { if (!h || !last || !["hide", "hunting"].includes(last.phase)) return; const k = voteKey(); if (!votes.has(k)) votes.set(k, new Set()); votes.get(k)!.add(h) }
let revealDone = -1

function finishRound(s: StageSnap) {
  if (!round || !round.beats.length) { round = null; return }
  const r = round
  const shares = r.beats.map((b) => b.share)
  const row = {
    at: new Date().toISOString(), round: r.round, mode: r.mode, winner: s.winner, beats: r.beats.length,
    roundS: r.introAt ? +((Date.now() - r.introAt) / 1000).toFixed(1) : null,
    caughtSharePerBeat: shares.map((x) => +x.toFixed(2)), meanCaughtShare: +(shares.reduce((a, b) => a + b, 0) / shares.length).toFixed(2),
    beatsIn25to40: shares.filter((x) => x >= 0.25 && x <= 0.4).length, firstPossessBeat: r.firstPossessBeat,
    possessedAtEnd: possessedOf(s).length, votesInTimePct: +(100 * r.beats.reduce((a, b) => a + b.votesInTime, 0) / (4 * r.beats.length)).toFixed(0),
    online: +(r.beats.reduce((a, b) => a + b.online, 0) / r.beats.length).toFixed(1), ev: r.ev, feed: r.feed, outages: r.outages,
  }
  appendFileSync(`${RUNS}/rounds.jsonl`, JSON.stringify(row) + "\n")
  out(`ROUND ${row.round} ${row.mode} winner=${row.winner} ${row.roundS}s ${row.beats} beats | caught/beat ${row.caughtSharePerBeat.join(" ")} (mean ${row.meanCaughtShare}, ${row.beatsIn25to40} in 25-40%) | first possession beat ${row.firstPossessBeat} | possessed at end ${row.possessedAtEnd} | votes in time ${row.votesInTimePct}% | online ${row.online} | lies ${row.ev.lie ?? 0}`)
  round = null
}

function onSnap(s: StageSnap) {
  const now = Date.now()
  const prev = last
  last = s
  lastAt = now
  snapsWindow++
  if (recovery) recoveryTick(s, now)
  if (s.phase === "intro" && (!round || round.round !== s.round)) {
    if (round && prev) finishRound(prev)
    round = { round: s.round, mode: s.mode, introAt: now, beats: [], firstPossessBeat: null, ev: {}, feed: {}, outages: 0 }
  }
  if (!round && ["hide", "hunting", "reveal"].includes(s.phase)) round = { round: s.round, mode: s.mode, introAt: 0, beats: [], firstPossessBeat: null, ev: {}, feed: {}, outages: 0 }
  if (s.phase === "hunting") lastHunting = s
  if (s.phase === "reveal" && round && revealDone !== s.round * 100 + s.beat) {
    revealDone = s.round * 100 + s.beat
    const before = lastHunting && lastHunting.beat === s.beat ? caughtSet(lastHunting) : new Set<string>()
    const nowCaught = caughtSet(s)
    const caught = [...nowCaught].filter((id) => !before.has(id)).length
    const online = s.ghosts.length || s.counters.online
    const prevPoss = prev ? possessedOf(prev).length : 0
    const b: Beat = {
      beat: s.beat, online, caught, share: online ? caught / online : 0, swept: s.sweptRooms.join(","),
      votesInTime: votes.get(`${s.round}.${s.beat}`)?.size ?? 0,
      votes: s.hunters.map((h) => `${h.id.slice(0, 2)}:${h.vote ?? "-"}`).join(" "), possessed: possessedOf(s).length,
      newPossessed: Math.max(0, possessedOf(s).length - prevPoss), revealAt: now,
    }
    round.beats.push(b)
    if (b.possessed > 0 && round.firstPossessBeat === null) round.firstPossessBeat = s.beat
    appendFileSync(`${RUNS}/beats.jsonl`, JSON.stringify({ round: s.round, ...b }) + "\n")
    out(`BEAT r${s.round}.${s.beat} swept ${b.swept} caught ${caught}/${online} (${Math.round(b.share * 100)}%) votes in time ${b.votesInTime}/4 [${b.votes}] possessed ${b.possessed}`)
  }
  // reveal may need a moment to apply the catches: refresh the last beat's count from later reveal snaps
  if (s.phase === "reveal" && round?.beats.length) {
    const b = round.beats[round.beats.length - 1]
    if (b.beat === s.beat) {
      const before = lastHunting && lastHunting.beat === s.beat ? caughtSet(lastHunting) : new Set<string>()
      const c = [...caughtSet(s)].filter((id) => !before.has(id)).length
      if (c > b.caught) { b.caught = c; b.share = b.online ? c / b.online : 0 }
      b.possessed = possessedOf(s).length
      if (b.possessed > 0 && round.firstPossessBeat === null) round.firstPossessBeat = s.beat
    }
  }
  if (s.phase === "finale" && prev?.phase !== "finale" && round) finishRound(s)
  for (const e of s.events) {
    const k = evKey(e)
    if (seen.has(k)) continue
    seen.add(k)
    seenOrder.push(k)
    if (seenOrder.length > 4000) seen.delete(seenOrder.shift()!)
    if (prev && round) round.ev[e.kind] = (round.ev[e.kind] ?? 0) + 1
    if (prev && e.kind === "vote") addVote(e.hunter)
  }
}

// ---------- outages ----------
interface Recovery { tDown: number; tKill: number | null; pidBefore: string; pre: StageSnap; preIds: Set<string>; tStage?: number; checks?: Record<string, unknown>; back: Set<string>; t90?: number; tAll?: number }
let recovery: Recovery | null = null
let lastKillAt = 0
const pidNow = () => { try { return readFileSync(`${ROOT}/logs/actors.pid`, "utf8").trim() } catch { return "" } }
function startRecovery(why: string, tKill: number | null) {
  if (recovery || !last) return
  const pre = last
  recovery = { tDown: tKill ?? lastAt, tKill, pidBefore: pidNow(), pre, preIds: new Set(pre.ghosts.map((g) => g[0])), back: new Set() }
  if (round) round.outages++
  out(`OUTAGE (${why}) pre: ${pre.phase} r${pre.round}.${pre.beat} ${Math.round((pre.endsAt - Date.now()) / 1000)} s left, online ${pre.counters.online}, possessed ${possessedOf(pre).join(",") || "-"}`)
}
function recoveryTick(s: StageSnap, now: number) {
  const r = recovery!
  if (!r.tStage) {
    r.tStage = now
    const c0 = r.pre.counters, c1 = s.counters
    r.checks = {
      prePhase: `${r.pre.phase} r${r.pre.round}.${r.pre.beat}`, postPhase: `${s.phase} r${s.round}.${s.beat}`,
      sameBeatOrNext: s.round === r.pre.round && (s.beat === r.pre.beat || s.beat === r.pre.beat + 1),
      endsAtDeltaMs: s.phase === r.pre.phase && s.beat === r.pre.beat ? s.endsAt - r.pre.endsAt : null,
      possessedPre: possessedOf(r.pre).join(","), possessedPost: possessedOf(s).join(","),
      regressed: (["sweeps", "caught", "whispers", "possessions", "rounds", "joinedToday"] as const).filter((k) => c1[k] < c0[k]).map((k) => `${k} ${c0[k]}->${c1[k]}`),
      restoredAt: s.restoredAt, pidAfter: pidNow(),
    }
  }
  const ids = new Set(s.ghosts.map((g) => g[0]))
  for (const id of r.preIds) if (ids.has(id)) r.back.add(id)
  const frac = r.preIds.size ? r.back.size / r.preIds.size : 1
  if (!r.t90 && frac >= 0.9) r.t90 = now
  if (!r.tAll && frac >= 1) r.tAll = now
  if (r.tAll || now - r.tDown > 30_000) finishRecovery()
}
function finishRecovery() {
  const r = recovery!
  recovery = null
  const rel = (t?: number) => (t ? t - r.tDown : null)
  const row = { at: new Date().toISOString(), killedByMeter: r.tKill !== null, pidBefore: r.pidBefore, preOnline: r.preIds.size, stageBackMs: rel(r.tStage), ghosts90Ms: rel(r.t90), ghostsAllMs: rel(r.tAll), back: r.back.size, ...r.checks }
  appendFileSync(`${RUNS}/kills.jsonl`, JSON.stringify(row) + "\n")
  out(`RECOVERY stage ${row.stageBackMs} ms, 90% ${row.ghosts90Ms} ms, all ${row.ghostsAllMs} ms (${row.back}/${row.preOnline}) | ${JSON.stringify(r.checks)}`)
  lastKillAt = Date.now()
}
function maybeKill() {
  if (killsLeft <= 0 || recovery || !last || !["hide", "hunting"].includes(last.phase)) return
  const now = Date.now()
  if (now - lastKillAt < KILL_GAP_MS || last.endsAt - now < 1200) return
  const pid = pidNow()
  if (!/^\d+$/.test(pid)) return
  let cmd = ""
  try { cmd = execFileSync("ps", ["-o", "command=", "-p", pid]).toString() } catch {}
  if (!cmd.includes("durable-actors")) return out(`kill skipped: pid ${pid} is not durable-actors`)
  killsLeft--
  startRecovery(`kill -9 ${pid} by meter`, now)
  process.kill(Number(pid), "SIGKILL")
}

// ---------- sockets ----------
let ws: WebSocket | null = null
let fails = 0
async function connectStage(): Promise<void> {
  try { ws = new WebSocket(await stageGrant()) } catch (err) {
    if (fails++ % 20 === 0) out(`stage grant failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`)
    setTimeout(connectStage, 150)
    return
  }
  const sock = ws
  sock.onmessage = (e) => {
    let m: { t: string; s: StageSnap }
    try { m = JSON.parse(String(e.data)) } catch { return out(`bad frame ${String(e.data).slice(0, 80)}`) }
    if (m.t === "snap") { fails = 0; onSnap(m.s) }
  }
  sock.onclose = (e) => {
    if (ws !== sock) return
    ws = null
    startRecovery(`stage socket closed ${e.code}`, null)
    setTimeout(connectStage, 100)
  }
}
setInterval(() => {
  if (ws && lastAt && Date.now() - lastAt > 1500 && !recovery) { startRecovery("no snaps 1.5 s", null); ws.close() }
  maybeKill()
}, 200)

const feedLog: string[] = []
async function connectFeed(): Promise<void> {
  let o: WebSocket
  try { o = new WebSocket(await observerUrl()) } catch (err) { setTimeout(connectFeed, 2000); return }
  o.onmessage = (e) => {
    let f: any
    try { f = JSON.parse(String(e.data)) } catch { return }
    const m = f.message ?? f.data?.message ?? null
    if (!m || typeof m.text !== "string") return
    const from: string = m.agent_name ?? m.from?.name ?? "?"
    const md = m.metadata ?? {}
    const kind: string = md.kind ?? (from === "the-dead" ? "whisper" : "say")
    if (round) round.feed[kind] = (round.feed[kind] ?? 0) + 1
    if (kind === "action" && (md.action === "sweep" || md.action === "vote")) addVote(md.hunter)
    const line = `${ts()} [${kind}${md.voice ? ":" + md.voice : ""}${md.fallback ? ":FALLBACK" : ""}] ${from}: ${m.text.slice(0, 110)}`
    feedLog.push(line)
    appendFileSync(`${RUNS}/feed.log`, line + (md.kind || md.voice || md.action ? `  ${JSON.stringify(md).slice(0, 160)}` : "") + "\n")
    if (feedLog.length > 60) feedLog.shift()
    if (md.voice === "back") out(`FEED back line: ${line}`)
  }
  o.onclose = () => setTimeout(connectFeed, 1000)
}

setInterval(() => {
  const s = last
  if (!s) return
  const hz = (snapsWindow / 10).toFixed(1)
  snapsWindow = 0
  const c = s.counters
  out(`${s.phase} r${s.round}.${s.beat} ${s.mode} ${((s.endsAt - Date.now()) / 1000).toFixed(1)}s ${hz}Hz | online ${c.online} (h${c.humans} b${c.bots}) caught ${c.caught} poss ${c.possessions} [${possessedOf(s).join(",") || "-"}] whispers ${c.whispers}${recovery ? " | RECOVERING" : ""}`)
  writeFileSync(`${RUNS}/meter-latest.json`, JSON.stringify({ at: new Date().toISOString(), snap: { ...s, ghosts: s.ghosts.length }, round, feed: feedLog.slice(-25) }, null, 1))
}, 10_000)

out(`meter up (beat loop): ${SECS} s, kills ${killsLeft} every ${KILL_GAP_MS / 1000} s mid-beat`)
void connectStage()
void connectFeed()
setTimeout(() => { out("meter done"); process.exit(0) }, SECS * 1000)
