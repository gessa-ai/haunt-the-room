// L13 hide latency under load: N bot sockets (bot:true; counted as bots) hide once per beat at a random moment of the
// hide phase; measures send -> {t:"you"} ack with that room, and send -> the stage snap showing that room.
//   bun qa/hide300.ts [--n 300] [--beats 3]
import { appendFileSync } from "node:fs"
import { BASE, H, ROOT, stageGrant, ts } from "./env.ts"
import { ROOMS } from "../contract/protocol.ts"

const arg = (k: string, d: number) => (process.argv.includes(`--${k}`) ? Number(process.argv[process.argv.indexOf(`--${k}`) + 1]) : d)
const N = arg("n", 300), BEATS = arg("beats", 3)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ack: number[] = [], seen: number[] = []
let unacked = 0, sent = 0, closes = 0
const pending = new Map<string, { room: string; at: number; acked: boolean; seen: boolean }>()
let beatsSeen = 0, phase = "", beat = -1

// stage: which room the House shows for each pending ghost
void (async () => {
  let ws: WebSocket
  try { ws = new WebSocket(await stageGrant()) } catch (e) { console.log(`stage grant failed: ${e}`); process.exit(1) }
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data))
    if (m.t !== "snap") return
    const now = Date.now()
    for (const g of m.s.ghosts) { const p = pending.get(g[0]); if (p && !p.seen && g[2] === p.room) { p.seen = true; seen.push(now - p.at) } }
    if (m.s.phase !== phase || m.s.beat !== beat) {
      if (phase === "hide") { for (const p of pending.values()) if (!p.acked) unacked++; pending.clear(); beatsSeen++ }
      phase = m.s.phase; beat = m.s.beat
    }
  }
})()

const socks: WebSocket[] = []
await Promise.all(Array.from({ length: N }, (_, i) => i).map(async (i) => {
  await wait(Math.floor(i / 25) * 250)
  const id = `00000000-0000-4000-9000-${String(800000000000 + i)}`
  const r = await fetch(`${BASE}/api/join`, { method: "POST", headers: H, body: JSON.stringify({ ghostId: id, bot: true }) })
  if (!r.ok) { console.log(`join ${i}: ${r.status}`); return }
  const ws = new WebSocket(((await r.json()) as any).websocketUrl)
  let hidBeat = -1
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data))
    if (m.t === "phase" && m.phase === "hide" && hidBeat !== m.beat) {
      hidBeat = m.beat
      setTimeout(() => {
        if (phase !== "hide") return
        const room = ROOMS[Math.floor(Math.random() * ROOMS.length)].id
        pending.set(id, { room, at: Date.now(), acked: false, seen: false })
        sent++
        ws.send(JSON.stringify({ t: "hide", room }))
      }, 300 + Math.random() * 4500)
    }
    if (m.t === "you") { const p = pending.get(id); if (p && !p.acked && m.room === p.room) { p.acked = true; ack.push(Date.now() - p.at) } }
  }
  ws.onclose = () => closes++
  socks.push(ws)
}))
console.log(`${ts()} ${socks.length} bot sockets open; waiting for ${BEATS} hide phases`)
const t0 = Date.now()
while (beatsSeen < BEATS && Date.now() - t0 < 150_000) await wait(250)
const q = (xs: number[], f: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))] }
const row = { at: new Date().toISOString(), n: socks.length, beats: beatsSeen, sent, acked: ack.length, unacked, ackP50: q(ack, 0.5), ackP95: q(ack, 0.95), ackMax: q(ack, 1), stageSeen: seen.length, stageP50: q(seen, 0.5), stageP95: q(seen, 0.95), stageMax: q(seen, 1), closes }
appendFileSync(`${ROOT}/qa/runs/hide300.jsonl`, JSON.stringify(row) + "\n")
console.log(`${ts()} ${JSON.stringify(row)}`)
for (const s of socks) s.close()
process.exit(0)
