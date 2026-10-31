// L13 kill rehearsal, two forms:
//   bun qa/kill.ts                       kill -9 logs/actors.pid (whole actor server) once; time each recovery step
//   bun qa/kill.ts --executor [--times 10] [--probes 20]
//       kill -9 only the House executor (last "[house] awake in pid N" in logs/actors.log), mid-beat, N times.
//       Probes: our own stage socket + P bot sockets (bot:true). Expected: no socket closes, same beat, same deadline,
//       the stage snap gap stays short. One row per kill in qa/runs/kill-steps.jsonl.
import { appendFileSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { BASE, H, ROOT, stageGrant, ts } from "./env.ts"

const arg = (k: string, d: number) => (process.argv.includes(`--${k}`) ? Number(process.argv[process.argv.indexOf(`--${k}`) + 1]) : d)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cmdOf = (pid: string) => { try { return execFileSync("ps", ["-o", "command=", "-p", pid]).toString().trim() } catch { return "" } }

if (!process.argv.includes("--executor")) {
  const pid = readFileSync(`${ROOT}/logs/actors.pid`, "utf8").trim()
  if (!/^\d+$/.test(pid) || !cmdOf(pid).includes("durable-actors")) throw new Error(`logs/actors.pid ${pid} is not durable-actors`)
  const stats0 = await (await fetch(`${BASE}/api/stats`)).json()
  const t0 = Date.now()
  process.kill(Number(pid), "SIGKILL")
  console.log(`${ts()} kill -9 ${pid} (online ${stats0.online})`)
  const steps: Record<string, number> = {}
  const mark = (k: string) => { if (!(k in steps)) { steps[k] = Date.now() - t0; console.log(`${ts()} +${steps[k]} ms ${k}`) } }
  while (Date.now() - t0 < 60_000 && !("houseAnswers" in steps && "online90" in steps)) {
    if (readFileSync(`${ROOT}/logs/actors.pid`, "utf8").trim() !== pid) mark("newPid")
    try { await fetch("http://127.0.0.1:7300/", { signal: AbortSignal.timeout(300) }); mark("portOpen") } catch {}
    try {
      const r = await fetch(`${BASE}/api/stats`, { signal: AbortSignal.timeout(1000) })
      if (r.ok) { mark("houseAnswers"); if ((await r.json()).online >= stats0.online * 0.9) mark("online90") }
    } catch {}
    await wait(100)
  }
  appendFileSync(`${ROOT}/qa/runs/kill-steps.jsonl`, JSON.stringify({ at: new Date().toISOString(), form: "server", pid, onlineBefore: stats0.online, ...steps }) + "\n")
  process.exit(0)
}

// ---------- executor-only form ----------
const TIMES = arg("times", 10), PROBES = arg("probes", 20)
let snap: any = null, lastSnapAt = 0, stageClosed = 0
const gaps: number[] = []
async function stage() {
  for (;;) {
    try {
      const ws = new WebSocket(await stageGrant())
      await new Promise<void>((res) => {
        ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === "snap") { const now = Date.now(); if (lastSnapAt) gaps.push(now - lastSnapAt); lastSnapAt = now; snap = m.s } }
        ws.onclose = () => { stageClosed++; res() }
      })
    } catch {}
    await wait(150)
  }
}
void stage()
let probeCloses = 0
const probes: WebSocket[] = []
for (let i = 0; i < PROBES; i++) {
  const r = await fetch(`${BASE}/api/join`, { method: "POST", headers: H, body: JSON.stringify({ ghostId: `00000000-0000-4000-8000-${String(900000000000 + i)}`, bot: true }) })
  if (!r.ok) { console.log(`probe join ${r.status} ${(await r.text()).slice(0, 120)}`); continue }
  const ws = new WebSocket(((await r.json()) as any).websocketUrl)
  ws.onclose = () => probeCloses++
  probes.push(ws)
}
await wait(2000)
console.log(`${ts()} executor kill x${TIMES}: ${probes.length} probe sockets + stage`)
/** The House executor of THIS stack: a runActorHost process whose env names House "main" on control plane :7300. */
const housePid = (): string => {
  try {
    const p = readFileSync(`${ROOT}/logs/house-executor-7300.pid`, "utf8").trim().split(" ")[0]
    if (/^\d+$/.test(p) && cmdOf(p).includes("runActorHost")) return p
  } catch {}
  let pids: string[] = []
  try { pids = execFileSync("pgrep", ["-f", "runActorHost"]).toString().trim().split("\n") } catch { return "" }
  for (const p of pids) {
    let env = ""
    try { env = execFileSync("ps", ["eww", "-o", "command=", "-p", p]).toString() } catch { continue }
    if (env.includes('"actor_name":"House","actor_id":"main"') && env.includes("DURABLE_ACTORS_CONTROL_PLANE_URL=http://127.0.0.1:7300 ")) return p
  }
  return ""
}
for (let k = 1; k <= TIMES; k++) {
  for (;;) { await wait(50); if (snap && ["hide", "hunting"].includes(snap.phase) && snap.endsAt - Date.now() > 1500) break }
  const pid = housePid()
  const cmd = cmdOf(pid)
  if (!pid || !cmd.includes("runActorHost")) { console.log(`kill ${k}: no live house executor (pid "${pid}" cmd "${cmd.slice(0, 80)}")`); await wait(3000); continue }
  const pre = { phase: snap.phase, round: snap.round, beat: snap.beat, endsAt: snap.endsAt, possessed: snap.rooms.filter((r: any) => r.possessed).map((r: any) => r.id).join(",") }
  const c0 = probeCloses, s0 = stageClosed
  gaps.length = 0
  const t0 = Date.now()
  process.kill(Number(pid), "SIGKILL")
  let newPidMs = 0
  while (Date.now() - t0 < 8000) { await wait(50); if (!newPidMs && housePid() !== pid) newPidMs = Date.now() - t0 }
  const post = { phase: snap.phase, round: snap.round, beat: snap.beat, endsAt: snap.endsAt }
  const row = {
    at: new Date().toISOString(), form: "executor", kill: k, pid, newHousePidMs: newPidMs || null, maxSnapGapMs: Math.max(0, ...gaps),
    probeClosed: probeCloses - c0, probes: probes.length, stageClosed: stageClosed - s0,
    sameBeat: post.round === pre.round && (post.beat === pre.beat || post.phase !== pre.phase), sameDeadline: post.phase !== pre.phase || post.endsAt === pre.endsAt, pre, post,
  }
  appendFileSync(`${ROOT}/qa/runs/kill-steps.jsonl`, JSON.stringify(row) + "\n")
  console.log(`${ts()} kill ${k} pid ${pid} (${pre.phase} r${pre.round}.${pre.beat}): new house pid +${row.newHousePidMs} ms, max snap gap ${row.maxSnapGapMs} ms, sockets closed ${row.probeClosed}/${row.probes} + stage ${row.stageClosed}, same beat ${row.sameBeat}, same deadline ${row.sameDeadline}`)
  await wait(4000)
}
for (const ws of probes) ws.close()
process.exit(0)
