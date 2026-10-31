// L12 smoke: prove the public origin end to end the way a phone uses it, and measure latency.
//   bun deploy/probe.ts [baseUrl] [pings]     (default https://haunt.gessa.ai, 20 pings)
// Steps: GET /p, /api/health x5, /api/config, POST /api/join {ghostId: "l12-probe"} -> open the returned
// websocketUrl, wait for the first "you" frame, then time ping -> pong round trips. Grants are never printed.
// One fixed probe ghost, so reruns never add ghosts to the house.

const base = (process.argv[2] ?? "https://haunt.gessa.ai").replace(/\/$/, "")
const pings = Number(process.argv[3] ?? 20)
const GHOST = "l12-probe"

const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]
const show = (detail: unknown) => (typeof detail === "string" ? detail : JSON.stringify(detail))
const fail = (step: string, detail: unknown): never => {
  console.error(`FAIL ${step}: ${show(detail)}`)
  process.exit(1)
}
const soft: string[] = [] // failures that do not stop the remaining steps
const softFail = (step: string, detail: unknown) => {
  soft.push(step)
  console.error(`FAIL ${step}: ${show(detail)}`)
}

async function timed(path: string, init?: RequestInit) {
  const t0 = performance.now()
  const res = await fetch(base + path, { redirect: "manual", ...init })
  const body = await res.text()
  return { status: res.status, ms: ms(t0), bytes: body.length, body, ray: res.headers.get("cf-ray") }
}

const page = await timed("/p")
if (page.status !== 200 || !/<html/i.test(page.body)) softFail("GET /p", { status: page.status, body: page.body.slice(0, 160) })
else console.log(`GET /p            ${page.status}  ${page.bytes} B  ${page.ms} ms (cold: DNS+TLS)  cf-ray ${page.ray ?? "-"}`)

const health: number[] = []
for (let i = 0; i < 5; i++) {
  const h = await timed("/api/health")
  if (h.status !== 200) fail("GET /api/health", { status: h.status, body: h.body.slice(0, 200) })
  health.push(h.ms)
}
console.log(`GET /api/health   200  warm median ${median(health)} ms  (${health.join(", ")})`)

const cfg = await timed("/api/config")
const publicUrl = JSON.parse(cfg.body).publicUrl
console.log(`GET /api/config   ${cfg.status}  publicUrl ${publicUrl}${publicUrl === base ? "  (matches base)" : "  (DIFFERS from base)"}`)

const join = await timed("/api/join", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ghostId: GHOST }),
})
if (join.status !== 200) fail("POST /api/join", { status: join.status, body: join.body.slice(0, 300) })
const joined = JSON.parse(join.body) as { ghost: { name: string }; websocketUrl: string }
const wsOrigin = joined.websocketUrl.split("?")[0]
console.log(`POST /api/join    200  ${join.ms} ms  ghost "${joined.ghost.name}"  websocketUrl ${wsOrigin}?<grant>`)
if (!wsOrigin.startsWith(base.replace(/^http/, "ws"))) fail("websocketUrl origin", `${wsOrigin} is not under ${base}`)

const t0 = performance.now()
const ws = new WebSocket(joined.websocketUrl)
const frames: string[] = []
let openMs = 0
let youMs = 0
const rtts: number[] = []
let pending: { t: number; done: () => void } | null = null

await new Promise<void>((resolve) => {
  const timer = setTimeout(() => fail("websocket", `no "you" frame within 10 s (frames: ${frames.join(",") || "none"})`), 10_000)
  ws.onopen = () => (openMs = ms(t0))
  ws.onerror = () => fail("websocket", "error event")
  ws.onclose = (e) => frames.length === 0 && fail("websocket", `closed ${e.code} before any frame`)
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as { t: string }
    if (frames.length < 8 && !frames.includes(msg.t)) frames.push(msg.t)
    if (msg.t === "you" && !youMs) {
      youMs = ms(t0)
      clearTimeout(timer)
      resolve()
    }
    if (msg.t === "pong" && pending) {
      rtts.push(ms(pending.t))
      const done = pending.done
      pending = null
      done()
    }
  }
})
console.log(`websocket         open ${openMs} ms  first "you" ${youMs} ms  frames ${frames.join(",")}`)

for (let i = 0; i < pings; i++) {
  await new Promise<void>((done) => {
    const mine = { t: performance.now(), done }
    pending = mine
    ws.send(JSON.stringify({ t: "ping" }))
    setTimeout(() => pending === mine && fail("ping", `no pong within 5 s (ping ${i + 1})`), 5_000)
  })
}
console.log(`ping -> pong      n=${rtts.length}  median ${median(rtts)} ms  p95 ${p95(rtts)} ms  max ${Math.max(...rtts)} ms`)
console.log(`frames seen       ${frames.join(",")}`)
ws.close(1000, "probe done")
if (soft.length) fail("probe", `${soft.join(", ")} failed (above); the rest passed`)
console.log(`PASS ${base} ${new Date().toTimeString().slice(0, 8)}`)
process.exit(0)
