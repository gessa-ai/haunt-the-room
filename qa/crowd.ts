// L13 acceptance crowd: N NON-bot phones (no bot flag, no presenter token) joining like the real phone does
// (POST /api/join -> websocket, ping every 20 s, re-join with the phone's own backoff 0.7 s doubling to 4 s + jitter,
// Retry-After honoured), all from ONE client IP (cf-connecting-ip / x-forwarded-for header, like the venue NAT
// behind the tunnel). Each phone hides once per beat. Optional kill -9 mid-beat, then per-phone recovery:
// back < 6 s, same beat, same score.
//   bun qa/crowd.ts [--n 300] [--ramp 30] [--kill] [--secs 150] [--ip 203.0.113.7] [--base http://127.0.0.1:3300]
import { appendFileSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { ROOMS } from "../contract/protocol.ts"
import { ROOT, ts } from "./env.ts"

const arg = (k: string, d: string) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d)
const N = Number(arg("n", "300")), RAMP = Number(arg("ramp", "30")), SECS = Number(arg("secs", "150"))
const BASE = arg("base", "http://127.0.0.1:3300"), IP = arg("ip", "203.0.113.7"), XKILL = process.argv.includes("--xkill"), KILL = XKILL || process.argv.includes("--kill")
const out = (s: string) => console.log(`${ts()} ${s}`)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const backoff = (a: number) => Math.min(4_000, 700 * 2 ** a) + Math.round(Math.random() * 600)
const joinCodes: Record<string, number> = {}

interface Phone { i: number; id: string; ws: WebSocket | null; live: boolean; phase: string; beat: number; round: number; score: number; scoreAt: number; firstLive: number; downAt: number; backAt: number; joins: number; hid: string }
const phones: Phone[] = []
let kill: { at: number; pre: Map<number, { phase: string; beat: number; round: number; score: number }> } | null = null

async function join(p: Phone): Promise<string> {
  const r = await fetch(`${BASE}/api/join`, {
    method: "POST", signal: AbortSignal.timeout(8_000),
    headers: { "content-type": "application/json", "cf-connecting-ip": IP, "x-forwarded-for": IP },
    body: JSON.stringify({ ghostId: p.id }),
  })
  joinCodes[r.status] = (joinCodes[r.status] ?? 0) + 1
  if (!r.ok) {
    const ra = Number(r.headers.get("retry-after") ?? 0)
    throw Object.assign(new Error(`join ${r.status}`), { retryMs: ra > 0 ? ra * 1000 + Math.random() * 600 : 0 })
  }
  const b = (await r.json()) as { websocketUrl: string }
  return b.websocketUrl
}

async function run(p: Phone) {
  let attempt = 0
  for (;;) {
    let url: string
    try { url = await join(p); p.joins++ } catch (e: any) { await wait(Math.max(e?.retryMs ?? 0, backoff(attempt++))); continue }
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(url)
      p.ws = ws
      const pinger = setInterval(() => { try { ws.send(JSON.stringify({ t: "ping" })) } catch {} }, 20_000)
      ws.onmessage = (e) => {
        let m: any
        try { m = JSON.parse(String(e.data)) } catch { return }
        if (!p.live) {
          p.live = true
          attempt = 0
          if (!p.firstLive) p.firstLive = Date.now()
          if (kill && p.downAt >= kill.at && !p.backAt) p.backAt = Date.now()
        }
        if (m.t === "phase") {
          const fresh = m.phase !== p.phase || m.beat !== p.beat
          p.phase = m.phase; p.beat = m.beat; p.round = m.round
          if (fresh && m.phase === "hide") setTimeout(() => {
            if (p.phase !== "hide" || !p.live) return
            p.hid = ROOMS[Math.floor(Math.random() * ROOMS.length)].id
            try { ws.send(JSON.stringify({ t: "hide", room: p.hid })) } catch {}
          }, 500 + Math.random() * 4000)
        }
        if (m.t === "you") { p.score = m.score; p.scoreAt = Date.now() }
      }
      ws.onclose = () => { clearInterval(pinger); if (p.live) p.downAt = Date.now(); p.live = false; p.ws = null; resolve() }
      ws.onerror = () => {}
    })
    await wait(backoff(attempt++))
  }
}

out(`crowd ${N} non-bot phones from IP ${IP} via ${BASE}, ramp ${RAMP}/s, kill ${KILL}`)
const t0 = Date.now()
for (let i = 0; i < N; i++) {
  const p: Phone = { i, id: `00000000-0000-4000-a000-${String(700000000000 + i)}`, ws: null, live: false, phase: "", beat: 0, round: 0, score: 0, scoreAt: 0, firstLive: 0, downAt: 0, backAt: 0, joins: 0, hid: "" }
  phones.push(p)
  void run(p)
  if (i % RAMP === RAMP - 1) await wait(1000)
}
const status = () => {
  const live = phones.filter((p) => p.live).length
  const by: Record<string, number> = {}
  for (const p of phones) if (p.live) by[`${p.phase}.${p.beat}`] = (by[`${p.phase}.${p.beat}`] ?? 0) + 1
  return `live ${live}/${N} joins ${JSON.stringify(joinCodes)} phases ${JSON.stringify(by)}`
}
const ticker = setInterval(() => out(status()), 5_000)
for (;;) {
  await wait(250)
  const live = phones.filter((p) => p.live)
  if (live.length === N || Date.now() - t0 > 60_000) break
}
const lv = phones.filter((p) => p.firstLive).map((p) => p.firstLive - t0).sort((a, b) => a - b)
out(`ALL JOINED: ${lv.length}/${N} live; first-live p50 ${lv[Math.floor(lv.length / 2)]} ms max ${lv[lv.length - 1]} ms; join codes ${JSON.stringify(joinCodes)}`)

if (KILL) {
  // wait for mid-beat (hide or hunting, >= 1.5 s left is unknowable here: kill 2 s after hide starts)
  for (;;) { await wait(100); const p = phones.find((x) => x.live); if (p && p.phase === "hide" && p.beat >= 1) break }
  await wait(2000)
  for (const k in joinCodes) delete joinCodes[k]
  const pid = readFileSync(`${ROOT}/logs/${XKILL ? "house-executor-7300.pid" : "actors.pid"}`, "utf8").trim().split(" ")[0]
  const cmd = /^\d+$/.test(pid) ? execFileSync("ps", ["-o", "command=", "-p", pid]).toString() : ""
  if (!cmd.includes(XKILL ? "runActorHost" : "durable-actors")) { out(`kill skipped: pid ${pid} not durable-actors`); process.exit(1) }
  const dropsBefore = phones.filter((p) => p.downAt).length
  const pre = new Map(phones.filter((p) => p.live).map((p) => [p.i, { phase: p.phase, beat: p.beat, round: p.round, score: p.score }]))
  kill = { at: Date.now(), pre }
  process.kill(Number(pid), "SIGKILL")
  out(`KILL -9 ${pid}: ${pre.size} live phones, pre ${[...pre.values()][0]?.phase} beat ${[...pre.values()][0]?.beat}`)
  if (XKILL) {
    await wait(10_000)
    const dropped = phones.filter((p) => kill!.pre.has(p.i) && p.downAt >= kill!.at)
    const back = dropped.filter((p) => p.backAt).map((p) => p.backAt - kill!.at).sort((a, b) => a - b)
    const row = { at: new Date().toISOString(), form: "executor", n: N, preLive: pre.size, droppedIn10s: dropped.length, backOfDropped: back.length, backMax: back[back.length - 1] ?? null, scoreKept: phones.filter((p) => kill!.pre.has(p.i) && p.score >= kill!.pre.get(p.i)!.score).length }
    appendFileSync(`${ROOT}/qa/runs/crowd.jsonl`, JSON.stringify(row) + "\n")
    out(`EXECUTOR KILL ${JSON.stringify(row)}`)
    out(`${row.droppedIn10s === 0 ? "PASS" : "FAIL"}: phones dropped ${row.droppedIn10s}/${row.preLive}`)
    process.exit(0)
  }
  const deadline = Date.now() + Math.max(30_000, SECS * 1000 - (Date.now() - t0))
  while (Date.now() < deadline) {
    await wait(250)
    if (phones.filter((p) => kill!.pre.has(p.i) && p.backAt).length === kill.pre.size) break
  }
  await wait(1500) // let the first `you` arrive
  const rows = phones.filter((p) => kill!.pre.has(p.i))
  const back = rows.filter((p) => p.backAt).map((p) => p.backAt - kill!.at).sort((a, b) => a - b)
  const q = (f: number) => back[Math.min(back.length - 1, Math.floor(back.length * f))]
  const sameBeat = rows.filter((p) => { const b = kill!.pre.get(p.i)!; return p.backAt && p.round === b.round && (p.beat === b.beat || p.beat === b.beat + 1) }).length
  const exactBeat = rows.filter((p) => { const b = kill!.pre.get(p.i)!; return p.backAt && p.round === b.round && p.beat === b.beat }).length
  const sameScore = rows.filter((p) => p.backAt && p.score >= kill!.pre.get(p.i)!.score).length
  const exactScore = rows.filter((p) => p.backAt && p.score === kill!.pre.get(p.i)!.score).length
  const row = {
    at: new Date().toISOString(), n: N, ip: IP, preLive: rows.length, back: back.length, under6s: back.filter((x) => x < 6000).length,
    p50: q(0.5), p90: q(0.9), max: back[back.length - 1], sameBeatOrNext: sameBeat, exactBeat, scoreKept: sameScore, exactScore,
    recoveryJoinCodes: { ...joinCodes }, joinsPerPhoneMax: Math.max(...rows.map((p) => p.joins)),
  }
  appendFileSync(`${ROOT}/qa/runs/crowd.jsonl`, JSON.stringify(row) + "\n")
  out(`RECOVERY ${JSON.stringify(row)}`)
  out(`${row.under6s === row.preLive && row.exactBeat === row.preLive && row.exactScore === row.preLive ? "PASS" : "FAIL"}: back<6s ${row.under6s}/${row.preLive}, same beat ${row.exactBeat}/${row.preLive}, same score ${row.exactScore}/${row.preLive}`)
} else {
  await wait(SECS * 1000 - (Date.now() - t0))
}
clearInterval(ticker)
out(status())
for (const p of phones) try { p.ws?.close() } catch {}
process.exit(0)
