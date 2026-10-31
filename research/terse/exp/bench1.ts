import { actors } from "./generated/index.js"
const log = (...a: unknown[]) => console.log(...a)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- 2. QuickJS ---
const sb = actors.Sandbox.get("sb1")
try {
  log("quickjs first", await sb.apply({ by: 2 }))
  const lat: number[] = []; const inner: number[] = []
  for (let i = 0; i < 50; i++) { const t = performance.now(); const r = await sb.apply({ by: 1 }); lat.push(performance.now() - t); inner.push(r.us) }
  lat.sort((a, b) => a - b); inner.sort((a, b) => a - b)
  log("quickjs 50 calls: rpc p50 ms", lat[25].toFixed(2), "p95", lat[47].toFixed(2), "| in-actor eval us p50", inner[25], "p95", inner[47])
  await sb.setReducer("function reduce(s,a){ while(true){} }")
  try { await sb.apply({ by: 1 }); log("infinite loop NOT interrupted") } catch (e) { log("infinite loop interrupted:", String(e).slice(0, 160)) }
  await sb.setReducer("function reduce(s,a){ return { n: s.n * 10, hp: (s.hp??100) - a.by } }")
  log("after new reducer", await sb.apply({ by: 7 }))
  log("newFunction", await sb.applyNewFunction({ by: 3 }))
} catch (e) { log("QUICKJS FAILED", e) }

// --- actor-to-actor ---
try { log("caller->ticker", await actors.Caller.get("c1").callTicker("t1")) } catch (e) { log("A2A ticker FAILED", String(e)) }
try { log("caller->sandbox", await actors.Caller.get("c1").callSandbox("sb1")) } catch (e) { log("A2A sandbox FAILED", String(e)) }

// --- 1. alarm ticks ---
for (const period of [250, 100, 50]) {
  const id = "tick" + period
  await actors.Ticker.get(id).start(period, 40)
  await sleep(period * 40 + 800)
  log(`alarm period ${period}ms`, await actors.Ticker.get(id).stats())
}

// --- 3. interleave streaming ---
const st = actors.Streamer.get("s1")
const grant = await actors.Streamer.prepareWebsocket({ actorId: "s1", metadata: { name: "x" } })
log("grant shape", Object.keys(grant), String((grant as any).websocketUrl).replace(/[?#].*/, "?..."))
const ws = new WebSocket((grant as any).websocketUrl)
const recv: { i?: number; at: number; t: number }[] = []
ws.onmessage = ev => { const m = JSON.parse(String(ev.data)); recv.push({ ...m, at: Date.now() }) }
await new Promise(r => (ws.onopen = r))
const t0 = Date.now()
const streamP = st.stream(10, 100).then(r => ({ r, ms: Date.now() - t0 }))
const pings: string[] = []
for (let i = 0; i < 5; i++) { await sleep(150); const pt = Date.now(); const p = await st.ping(); pings.push(`ping${i} at +${pt - t0}ms took ${Date.now() - pt}ms`) }
const sres = await streamP
await sleep(200)
log("stream result", sres.ms, "ms; pings during stream:", pings.join(" | "))
log("chunk arrivals (+ms since start, lag vs broadcast t):", recv.map(m => `${m.i ?? "done"}@${m.at - t0}(${m.at - m.t})`).join(" "))
ws.close()
process.exit(0)
