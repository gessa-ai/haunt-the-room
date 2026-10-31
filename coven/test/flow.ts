// Smoke: the four hunters and the referee play beats (intro -> hide -> hunting -> reveal ...) against the REAL House
// actor on the local Relay engine (fresh workspace), with 24 bot ghosts on real House sockets that hide each beat
// (crowding and spreading). Two ghosts lure the Medium and the Priest to the emptiest room in beat 1 and one lures
// the Medium in beat 3; the liars stay out of the room they named. After beat 2 every House call the coven makes
// fails for 3 s (what it sees during a kill -9; the actor server itself is not touched). Prints the feed as the
// stage sees it (observer token, DMs included), then checks it.
//   DURABLE_ACTORS_CONTROL_PLANE_URL=http://127.0.0.1:7310 bun coven/test/flow.ts

import path from "node:path"
import { ROOMS, lureText, type HouseToPhone, type HunterId, type Phase, type RoomId } from "../../contract/protocol.ts"
import { actors } from "../generated/index.js"
import { startCoven } from "../src/coven.ts"
import { noEmoji, pg13, sanitize } from "../src/content.ts"
import { brainName } from "../src/think.ts"
import { house as realHouse } from "../src/house.ts"
import type { House } from "../src/referee.ts"
import { connectAgent, dmText, RELAY_BASE_URL as base } from "../src/relay.ts"

const BEATS = 3
const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(6)
const post = async (p: string, body: unknown, key?: string) =>
  (await (await fetch(base + p, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  })).json()) as { data: { api_key: string; token: string } }

const key = (await post("/v1/workspaces", { name: `hunt-flow-${Date.now()}` })).data.api_key
process.env.RELAY_WORKSPACE_KEY = key
const dir = path.resolve(import.meta.dir, "../var", `flow-${Date.now()}`)

// The stage's view: the raw observer feed, DMs included.
const feed: { from: string; text: string; dm: boolean; at: number }[] = []
const logs: string[] = []
const ot = await post("/v1/observer-tokens", { name: "flow", scopes: ["stream:read", "messages:read", "channels:read", "dms:read", "threads:read"], filters: { include_dms: true } }, key)
let ws!: WebSocket
let watching = true
const observe = () => {
  ws = new WebSocket(`${base.replace(/^http/, "ws")}/v1/ws?token=${ot.data.token}`)
  ws.onmessage = (e) => {
    const f = JSON.parse(String(e.data)) as { type: string; message?: { agent_name?: string; text?: string } }
    if ((f.type === "message.created" || f.type === "dm.received") && f.message?.text) {
      const row = { from: f.message.agent_name ?? "?", text: f.message.text, dm: f.type === "dm.received", at: Date.now() }
      feed.push(row)
      console.log(`${stamp()} FEED ${row.dm ? "PRIVATE " : ""}${row.from}: ${row.text}`)
    }
  }
  ws.onclose = () => watching && setTimeout(observe, 1_000) // the stage reconnects after a relay restart too
}
observe()

// The House as the coven sees it, with a blackout we can trigger.
let darkUntil = 0
const dark = <T>(fn: () => Promise<T>) => (Date.now() < darkUntil ? Promise.reject(new Error("House unreachable (blackout)")) : fn())
const house: House = {
  huntView: () => dark(() => realHouse.huntView()),
  sweep: (i) => dark(() => realHouse.sweep(i)),
  taunt: (i) => dark(() => realHouse.taunt(i)),
  lean: (i) => dark(() => realHouse.lean(i)),
}

// 24 bot ghosts on real sockets: each hide, tap a room (40% follow the crowd), re-tap now and then; liars avoid their lie.
const roomIds = ROOMS.map((r) => r.id) as RoomId[]
let lie: { room: RoomId; until: number } | null = null
let counts: { id: RoomId; count: number }[] = []
const bots: WebSocket[] = []
for (let i = 0; i < 24; i++) {
  const ghostId = `flow-bot-${i}`
  await actors.Ghost.get(ghostId).ensure({ id: ghostId, bot: true })
  const grant = await actors.House.prepareWebsocket({ actorId: "main", metadata: { role: "bot", ghostId, colorIndex: i % 8 } })
  const sock = new WebSocket(grant.websocketUrl)
  let phase: Phase = "lobby"
  const tap = () => {
    if (phase !== "hide" || sock.readyState !== WebSocket.OPEN) return
    const crowd = [...counts].sort((a, b) => b.count - a.count)[0]?.id
    let room = Math.random() < 0.4 && crowd ? crowd : roomIds[Math.floor(Math.random() * roomIds.length)]!
    if (lie && lie.until > Date.now() && room === lie.room) room = roomIds.find((r) => r !== lie!.room)!
    sock.send(JSON.stringify({ t: "hide", room }))
  }
  sock.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as HouseToPhone
    if (m.t === "phase") (phase = m.phase), phase === "hide" && setTimeout(tap, Math.random() * 2_000)
    if (m.t === "rooms") counts = m.rooms
  }
  const again = setInterval(() => Math.random() < 0.3 && tap(), 1_500)
  sock.onclose = () => clearInterval(again)
  bots.push(sock)
}

const coven = await startCoven({ house, dir, log: (l) => (logs.push(l), console.log(`${stamp()} ${l}`)) })
const dead = await connectAgent("the-dead", { dir })
const lure = async (to: HunterId[], n: number, name: string) => {
  const v = await house.huntView()
  const emptiest = [...v.rooms].sort((a, b) => a.count - b.count)[0]!.id
  lie = { room: emptiest, until: Date.now() + 12_000 }
  for (const hunter of to) await dead.me.sendMessage({ to: hunter, text: dmText(hunter, `${name}: ${lureText(emptiest, n)}`), metadata: { kind: "lure", room: emptiest, name } })
}

await realHouse.reset()
await realHouse.setPhase({ phase: "intro", mode: "show" })
let killAt = 0
const seen = new Set<string>()
const phases: { at: number; phase: string }[] = [] // when this script saw each phase begin (polled every 200 ms)
while (true) {
  const v = await house.huntView().catch(() => null)
  if (v) {
    const k = `${v.beat}:${v.phase}`
    if (!seen.has(k)) {
      seen.add(k)
      phases.push({ at: Date.now(), phase: v.phase })
      console.log(`${stamp()} ---- beat ${v.beat} ${v.phase} ----`)
      // THE CABAL moments: beat 1 a named lie sways the Medium (sweep empty); beat 2 the Priest; beat 3 fooled again
      if (v.phase === "hide" && v.beat === 1) setTimeout(async () => { for (const [i, n] of ["kyle", "mo", "sana", "priya", "dan"].entries()) await lure(i < 3 ? ["medium", "skeptic"] : ["medium"], i, n) }, 300) // lies aggregate
      if (v.phase === "hide" && v.beat === 2) setTimeout(() => void lure(["priest"], 1, "priya"), 300)
      if (v.phase === "hide" && v.beat === 3) setTimeout(() => void lure(["medium"], 2, "jdog"), 300)
      if (v.phase === "hunting" && v.beat === 2) setTimeout(() => (console.log(`${stamp()} ---- jdog lies to the medium at hunting+1.2 s (= +3 s of 9 s; this House runs 4 s hunting) ----`), void lure(["medium"], 3, "jdog")), 1_200) // a late lie flips a vote
      if (v.phase === "reveal" && v.beat === BEATS) break
    }
  }
  await new Promise((r) => setTimeout(r, 200))
}
await new Promise((r) => setTimeout(r, 5_000)) // let the last reveal and its reaction reach the feed
coven.stop()
watching = false
ws.close()
for (const b of bots) b.close()
await realHouse.setPhase({ phase: "lobby", mode: "show" }) // leave the shared dev House as we found it

const hunters = ["exorcist", "medium", "skeptic", "priest"]
const said = feed.filter((f) => !f.dm && hunters.includes(f.from))
const votes = feed.filter((f) => f.from === "referee" && f.text.startsWith("vote · "))
const leans = feed.filter((f) => f.from === "referee" && f.text.startsWith("lean · "))
const reveals = feed.filter((f) => f.from === "referee" && f.text.startsWith("sweep · "))
const dms = feed.filter((f) => f.dm && hunters.includes(f.from))
const phaseAt = (t: number) => phases.findLast((p) => p.at <= t)
const earlyVotes = votes.filter((f) => {
  const p = phaseAt(f.at)
  const nextHunting = phases.find((x) => x.at > f.at && x.phase === "hunting")
  return p?.phase === "hide" && (!nextHunting || nextHunting.at - f.at > 400) // 400 ms covers this script's own poll
})
// the coven tags each line with its source; model lines carry the brain ("claude:haiku" / "openai:...")
const modelLines = logs.filter((l) => /\[(claude|openai)/.test(l)).map((l) => l.replace(/^\s+\S+\s+/, "").replace(/\s+\[.*$/, "").trim())
// per beat: the Medium's last lean before the bell must equal her vote
function mediumHonest(): boolean {
  const hides = phases.filter((p) => p.phase === "hide").map((p) => p.at)
  return hides.every((start, i) => {
    const end = hides[i + 1] ?? Infinity
    const lean = leans.filter((f) => f.at >= start && f.at < end && f.text.includes("The Medium")).at(-1)
    const vote = votes.filter((f) => f.at >= start && f.at < end && f.text.includes("The Medium")).at(-1)
    return !lean || !vote || lean.text.split("→")[1]?.trim() === vote.text.split("→")[1]?.trim()
  })
}
const rich = brainName().startsWith("openai") // with claude capped at 1 call / 8 s most lines are neutral vote lines
const checks: [string, boolean, boolean][] = [
  ["all four hunters spoke in #hunt", hunters.every((h) => said.some((f) => f.from === h)), true],
  [`every hunter swept every beat through the typed action (${votes.length} of ${BEATS * 4})`, votes.length >= BEATS * 4, true],
  [`the referee posted each reveal (${reveals.length} of ${BEATS})`, reveals.length >= BEATS, true],
  [`>= 7 table lines per beat (${said.length})`, said.length >= BEATS * 7, true],
  [`leans carry conviction (${leans.length})`, leans.some((f) => /\d+/.test(f.text)), true],
  ["a lean names the whisperer (swayed by)", leans.some((f) => f.text.includes("swayed by kyle")), true],
  ["the Medium names kyle at the table", said.some((f) => f.from === "medium" && f.text.includes("kyle")), true],
  ["a callback: kyle remembered in beat 3", logs.some((l) => /medium/.test(l) && /kyle/.test(l) && /jdog/.test(l)), false],
  [`every hunter line <= 70 chars`, said.every((f) => f.text.length <= 70), true],
  ["every line on the feed is PG-13", feed.every((f) => pg13(f.text)), true],
  ["no emoji anywhere on the feed", feed.every((f) => noEmoji(f.text) === f.text.replace(/\s+/g, " ").trim()), true],
]
console.log(`\n#hunt + DMs as the stage sees them: ${feed.length} messages (${said.length} said, ${dms.length} private, ${votes.length} votes, ${reveals.length} reveals)`)
console.log(`brain: ${brainName()}${rich ? "" : " (model-dependent checks are INFO until OpenAI is the brain)"}`)
for (const [name, ok, required] of checks) console.log(`${ok ? "PASS" : required ? "FAIL" : "INFO"} ${name}`)
process.exit(checks.every(([, ok, required]) => ok || !required) ? 0 : 1)
