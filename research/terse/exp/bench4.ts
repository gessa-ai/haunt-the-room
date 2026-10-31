import { actors } from "./generated/index.js"
const N = Number(process.argv[2] ?? 200), HZ = 20, SECS = 10
const room = actors.Room.get("fan1")
const lat: number[] = []; let got = 0
const sockets: WebSocket[] = []
const t0 = Date.now()
await Promise.all(Array.from({ length: N }, async (_, i) => {
  const g: any = await actors.Room.prepareWebsocket({ actorId: "fan1", metadata: { i } })
  const ws = new WebSocket(g.websocketUrl)
  ws.onmessage = ev => { const m = JSON.parse(String(ev.data)); if (m.ts) { lat.push(Date.now() - m.ts); got++ } }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  sockets.push(ws)
}))
console.log(`connected ${sockets.length} in ${Date.now() - t0}ms; actor sees`, await room.count())
const rpc: number[] = []
for (let s = 0; s < HZ * SECS; s++) {
  const due = Date.now() + 1000 / HZ
  const ts = Date.now(); await room.send(s, ts); rpc.push(Date.now() - ts)
  const wait = due - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait))
}
await new Promise(r => setTimeout(r, 1000))
const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))] }
console.log(`N=${N} sent=${HZ * SECS} expected=${N * HZ * SECS} got=${got}`)
console.log(`send->recv ms p50=${q(lat, .5)} p95=${q(lat, .95)} p99=${q(lat, .99)} max=${q(lat, 1)} | rpc ms p50=${q(rpc, .5)} p95=${q(rpc, .95)}`)
sockets.forEach(s => s.close()); process.exit(0)
