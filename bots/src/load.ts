// --load <n> --base <url>: n bots join through the PUBLIC path, ramp, play, report (bots/LOAD-REPORT.md).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type { StageSnap } from "../../contract/protocol.ts"
import { Bot, type BotEnv } from "./bot.ts"
import { world } from "./brain.ts"
import { fetchStats } from "./fill.ts"
import { botGhostId, log, max, ms, pct } from "./util.ts"

type Counters = StageSnap["counters"]
export interface LoadOpts {
  n: number
  rampMs: number
  playMs: number
  reportPath: string
  command: string
}
const TITLE = "# L8 load report (newest run first)"
const BAR = "connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%"

export function startLoad(o: LoadOpts, env: BotEnv) {
  const m = env.metrics
  const bots: Bot[] = []
  const starts: ReturnType<typeof setTimeout>[] = []
  let started = 0
  const peak = { online: 0, bots: 0, humans: 0 }
  let before: Counters | null = null
  let after: Counters | null = null

  // Event-loop lag of this driver: proves the client is not what makes the latencies.
  const lag: number[] = []
  let expect = performance.now() + 100
  const lagTimer = setInterval(() => {
    const now = performance.now()
    lag.push(Math.max(0, now - expect))
    expect = now + 100
  }, 100)

  let finish: (why: string | null) => void = () => {}
  const ended = new Promise<string | null>((r) => (finish = r))
  let t0 = Date.now()
  let playFrom = -1 // index into m.hideMs where the steady state (ramp + 10 s) begins

  const done = (async () => {
    before = await fetchStats(env.base).catch((e) => (m.errors.add("stats unavailable", String(e)), null))
    log(`load ${o.n} via ${env.base}: ramp ${o.rampMs / 1000} s, play ${o.playMs / 1000} s (token ${env.token ? "set" : "MISSING"})`)
    t0 = Date.now()
    for (let i = 0; i < o.n; i++) {
      const bot = new Bot(botGhostId("load", i), env)
      bots.push(bot)
      starts.push(setTimeout(() => (started++, bot.start()), (i * o.rampMs) / o.n))
    }
    const playTimer = setTimeout(() => finish(null), o.rampMs + o.playMs)
    const rampTimer = setTimeout(() => (playFrom = m.hideMs.length), o.rampMs + 10_000) // steady state starts here
    const statsTimer = setInterval(() => {
      fetchStats(env.base).then(
        (s) => {
          if (s.online > peak.online) Object.assign(peak, { online: s.online, bots: s.bots, humans: s.humans })
        },
        (e) => m.errors.add("stats unavailable", String(e)),
      )
    }, 2_000)
    let seen = 0
    const progress = setInterval(() => {
      const open = bots.filter((b) => b.open).length
      const win = m.hideMs.slice(seen)
      seen = m.hideMs.length
      log(
        `load t=${Math.round((Date.now() - t0) / 1000)} s: started ${started}/${o.n} open ${open} hides ${m.hides} phase ${world.phase ?? "?"}` +
          ` | last 5 s hide p50/p95 ${ms(pct(win, 0.5))}/${ms(pct(win, 0.95))} ms | disconnects ${m.disconnects} errors: ${m.errors.summary()}`,
      )
    }, 5_000)

    const why = await ended
    clearTimeout(playTimer)
    clearTimeout(rampTimer)
    clearInterval(statsTimer)
    clearInterval(progress)
    for (const t of starts) clearTimeout(t)
    const playedS = (Date.now() - t0) / 1000
    const openAtEnd = bots.filter((b) => b.open).length
    for (const b of bots) b.settle(2_000) // older than any reply we saw: refused or lost
    for (const b of bots) b.stop(why ? `load interrupted (${why})` : "load done")
    clearInterval(lagTimer)
    await new Promise((r) => setTimeout(r, 1_500)) // let the House count the closes
    after = await fetchStats(env.base).catch((e) => (m.errors.add("stats unavailable", String(e)), null))
    const steady = playFrom >= 0 ? m.hideMs.slice(playFrom) : []
    const report = render(o, env, { why, started, openAtEnd, playedS, before, after, peak, lag, steady })
    const old = existsSync(o.reportPath) ? readFileSync(o.reportPath, "utf8").replace(TITLE, "").trim() : ""
    writeFileSync(o.reportPath, `${TITLE}\n\n${report}\n${old ? `\n${old}\n` : ""}`)
    console.log(`\n${report}`)
    log(`report written: ${o.reportPath}`)
  })()

  return { done, stop: async (why: string) => (finish(why), done) }
}

interface RunFacts {
  why: string | null
  started: number
  openAtEnd: number
  playedS: number
  before: Counters | null
  after: Counters | null
  peak: { online: number; bots: number; humans: number }
  lag: number[]
  steady: number[] // move latencies from ramp + 10 s to the end
}

function render(o: LoadOpts, env: BotEnv, f: RunFacts): string {
  const m = env.metrics
  const n = Math.max(1, f.started)
  const rate = (k: number) => `${((100 * k) / n).toFixed(1)}%`
  const trio = (xs: number[]) => `${ms(pct(xs, 0.5))} / ${ms(pct(xs, 0.95))} / ${ms(max(xs))}`
  const frames = [...m.msgs].map(([t, k]) => `${t} ${k}`).join(", ") || "none"
  const totalFrames = [...m.msgs.values()].reduce((a, b) => a + b, 0)
  const codes = [...m.closeCodes].map(([c, k]) => `${c} x${k}`).join(", ") || "-"
  const c = (s: Counters | null) => (s ? `online ${s.online} (humans ${s.humans}, bots ${s.bots})` : "unavailable")
  const answered = m.hideMs.length
  const green =
    !f.why &&
    m.firstState >= 0.99 * n &&
    m.disconnects <= 0.01 * n &&
    m.unanswered <= 0.001 * Math.max(1, m.hides) &&
    (pct(m.hideMs, 0.95) <= 300 || (!m.hideMs.length && pct(m.pingMs, 0.95) <= 300))
  const stamp = new Date().toLocaleString("en-US", { hour12: false, timeZoneName: "short" })
  return [
    `## ${stamp} · ${f.started} bots · ${env.base}${f.why ? ` · INTERRUPTED (${f.why})` : ""}`,
    "",
    `- Command: \`${o.command}\``,
    `- Path: POST ${env.base}/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy).` +
      ` Bots hide once or twice per HIDE phase, taps spread over its first 70% (40% spread, 35% crowd into the fullest open room no hunter leans toward, 25% emptiest room; every bot taps every beat with a safety seat at 85% of the phase; never a full room, retry when refused; ~12% of seated bots switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).`,
    `- Ramp ${o.rampMs / 1000} s, play ${o.playMs / 1000} s, wall ${f.playedS.toFixed(0)} s.` +
      ` House phase ${world.phase ?? "unknown"}. House before: ${c(f.before)}; peak: ${f.peak.online ? `online ${f.peak.online} (humans ${f.peak.humans}, bots ${f.peak.bots})` : "unavailable"};` +
      ` 1.5 s after close: ${c(f.after)} (the House keeps a dropped ghost online for its reconnect grace).`,
    "",
    "| metric | value |",
    "|---|---|",
    `| **connect success** (first attempt: socket open + first {t:"you"}) | **${m.firstState}/${f.started} (${rate(m.firstState)})** |`,
    `| socket opened on first attempt / connected at end | ${m.firstOpen} / ${f.openAtEnd} |`,
    `| **connect time** (join POST -> socket open) p50 / p95 / max | **${trio(m.connectMs)} ms** |`,
    `| join POST p50 / p95 / max | ${trio(m.joinMs)} ms |`,
    `| first state (open -> first {t:"you"}) p50 / p95 / max | ${trio(m.stateMs)} ms |`,
    `| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **${trio(m.hideMs)} ms** (p99 ${ms(pct(m.hideMs, 0.99))} ms, n=${answered}) |`,
    `| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | ${ms(pct(f.steady, 0.5))} / ${ms(pct(f.steady, 0.95))} / ${ms(pct(f.steady, 0.99))} ms (n=${f.steady.length}) |`,
    `| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **${trio(m.pingMs)} ms** (n=${m.pingMs.length}, lost ${m.pingLost}) |`,
    `| hides sent / answered / refused (House kept another room) / unanswered (no reply) | ${m.hides} / ${answered} / ${m.refused} / ${m.unanswered} |`,
    `| HIDE phases seen (bot-beats) / sat out caught / last-second switches / seat rescues | ${m.beats} / ${m.satOut} / ${m.lastSecond} / ${m.seatRescues} |`,
    `| catches per in-play bot-beat (target 0.25-0.40) | ${((m.results.get("caught") ?? 0) / Math.max(1, m.beats - m.satOut)).toFixed(2)} |`,
    `| reveal results | ${[...m.results].map(([k, v]) => `${k} ${v}`).join(", ") || "none"} |`,
    `| **disconnects** after open / reconnects | **${m.disconnects}** / ${m.reconnects} (close codes: ${codes}) |`,
    `| **errors** | **${m.errors.summary()}** |`,
    `| frames received | ${frames} (${(totalFrames / Math.max(1, f.playedS)).toFixed(0)}/s avg) |`,
    `| driver event-loop lag p95 / max | ${ms(pct(f.lag, 0.95))} / ${ms(max(f.lag))} ms |`,
    "",
    `Verdict: **${green ? "GREEN" : "RED"}** against the L8 bar (${BAR}).`,
    "",
  ].join("\n")
}
