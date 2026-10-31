// L11b VIDEO: capture log -> demo/video/cut.json on the owner's timeline (SCRIPT.md, ~110 s).
//   node demo/video/moments.mjs <capture label> [--out demo/video/cut.json]
// Every caption comes from the log (real Relay lines, real whisperers, real recovery time). Each footage slot is one
// segment with "src" + "atMs": swap it for a newer clip by editing those two fields, then demo/video/build.sh.
// Audio: one continuous bed (a slice of the game's own lobby score), narrator on top; game audio only at hits
// (vote slam / reveal, kill static, finale) and under hunter lines (their voices).
import fs from "node:fs"
import path from "node:path"

const DIR = import.meta.dirname
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1] }
const cap = argv[0]
if (!cap) { console.error("usage: node demo/video/moments.mjs <capture label>"); process.exit(1) }
const RAW = path.join(DIR, "raw", cap)
const clips = JSON.parse(fs.readFileSync(path.join(RAW, "clips.json"), "utf8")).clips
const E = fs.readFileSync(path.join(RAW, "events.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l))
const out = path.resolve(opt("out", path.join(DIR, "cut.json")))
const ROOM = (r) => r ? `The ${r[0].toUpperCase()}${r.slice(1)}` : "?"
const t0 = clips.stage.startMs, tEnd = t0 + (clips.stage.frames ?? 0) / 30 * 1000
const inStage = (t, d) => t >= t0 && t + d * 1000 <= tEnd
const phases = E.filter(e => e.src === "stage" && e.kind === "phase")
const ph = (pred) => phases.filter(pred)
const next = (t, phase) => phases.find(p => p.at > t && p.phase === phase)
let gaps = E.filter(e => e.src === "stage" && e.kind === "snap-gap").map(e => [e.from, e.at])
// older captures (no snap-gap log): a stage socket that keeps reconnecting = the House is down ("The house is dead.")
if (!gaps.length) gaps = E.filter(e => e.src === "stage" && e.kind === "ws-close").map(e => [e.at - 7000, e.at + 2500])
const dead = (t, d) => gaps.some(([a, b]) => t < b && t + d * 1000 > a)
const ok = (t, d) => !!t && inStage(t, d) && !dead(t, d)
const missing = [], table = [], S = []
const mark = (name, t, note = "") => table.push(`${name.padEnd(13)} ${t ? new Date(t).toTimeString().slice(0, 8) : "--------"}  ${note}`)
const seg = (o) => S.push(o)
const stage = (note, at, dur, extra = {}, track = "stage") => {
  if (!ok(at, dur) && !note.startsWith("kill")) { missing.push(note); return false }
  if (note.startsWith("kill") && !inStage(at, dur)) { missing.push(note); return false }
  seg({ note, src: `${cap}/${track}`, atMs: Math.round(at), dur, ...extra }); return true
}
const nameOf = [...E].reverse().find(e => e.src === "phone1" && (e.kind === "named" || e.kind === "msg:you"))
const liar = nameOf?.name ?? nameOf?.m?.name ?? "kyle"

// Relay truth
const HUNTERS = ["exorcist", "medium", "skeptic", "priest"]
const lines = E.filter(e => e.src === "stage" && e.kind === "relay" && e.channel === "hunt" && HUNTERS.includes(e.from) && e.text)
const whispers = E.filter(e => e.src === "stage" && e.kind === "relay" && e.from === "the-dead" && e.text)
  .map(e => { const m = /^@(\w+) ([^:]+): (.*)$/.exec(e.text); return m && { at: e.at, to: m[1], who: m[2].trim(), text: m[3] } }).filter(Boolean)
const fooled = new Set(E.filter(e => e.kind === "event" && e.e?.kind === "lie").map(e => e.e.name?.toLowerCase()))
const score = (c) => 4 * (c.w.who === liar) + 3 * fooled.has(c.w.who) + 2 * /psst|everyone/i.test(c.w.text) + 2 * /honest|trust|believe|says the|told me/i.test(c.l.text) - (c.l.text.length > 70)
const chains = whispers.map(w => ({ w, l: lines.find(l => l.at > w.at && l.at < w.at + 25000 && l.from === w.to && l.text.toLowerCase().includes(w.who.toLowerCase())) }))
  .filter(c => c.l && ok(c.l.at - 300, 2.6)).sort((x, y) => score(y) - score(x) || y.w.at - x.w.at) // a stranger gets it: "Psst, everyone's in X" + the hunter swallowing it, newest first
const lineDur = (l) => Math.min(3.4, Math.max(2.4, l.text.length / 20))
const lineShot = (l, k, extra = {}) => stage(`line:${l.from}`, l.at - 250, lineDur(l), { gain: 0.8, zoom: { z: 1.25, x: k % 2 ? 0.85 : 0.15, y: 0.5, ramp: 0.01 }, captions: [{ t: 0, item: { kind: "line", who: l.from, text: l.text } }], ...extra })
const voteShot = (r, note, d = 3.2, extra = {}) => r && stage(note, r.at - 600, d, { gain: 1, ...extra }) // the slam lands on the reveal bell
const A = (f) => `art/${f}`

// OWNER 60 s TIMELINE (14:56 + notes 15:06): cold 5 · title 3 · story film 8 · join 6 · cabal 18 · kill 10 · finale 5 · end 5
// Every caption sits in the band under the footage (band: true); every narrator line has its pixel caption.
// Camera: static holds, punch-ins, one slow pan, whips between sections; no slow zoom drifts (they jittered).
const VOM = fs.existsSync(path.join(DIR, "vo/manifest.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "vo/manifest.json"), "utf8")) : {}
const voDur = (text) => Object.values(VOM).find(v => v.text === text && v.engine === "eleven")?.dur ?? text.split(/\s+/).length / 2.4
const narr = (text, t = 0.2) => ({ vo: { t, text }, cap: { t, d: voDur(text) + 0.3, item: { kind: "narr", text } } })
const withNarr = (n, extra = {}) => ({ ...extra, vo: n.vo, captions: [...(extra.captions ?? []), n.cap] })
const B = { band: true }
// 0:00-0:04 STING (L32, own audio)
if (fs.existsSync(path.join(DIR, "sting/sting.mp4"))) seg({ note: "sting", src: "sting/sting.mp4", in: 0, dur: 4, ownAudio: true, gain: 1 })
// 0:04-0:09 COLD OPEN: whisper (static hold) -> the hunter swallows it (punch-in) -> the vote slams (static)
const chain = chains[0]
let coldBeat = null
if (chain) {
  mark("cold open", chain.l.at, `${chain.w.who} -> ${chain.w.to}: "${chain.w.text}" | ${chain.l.from}: "${chain.l.text}"`)
  stage("cold:whisper", chain.l.at - 2100, 1.9, { ...B, gain: 0.6, captions: [{ t: 0, item: { kind: "whisper", who: chain.w.who, to: chain.w.to, text: chain.w.text } }] })
  lineShot(chain.l, 0, { ...B, dur: Math.min(4, Math.max(2.6, chain.l.text.length / 17)), zoom: { z: 1.35, x: 0.1, y: 0.55, ramp: 0.01 } })
  coldBeat = next(chain.l.at, "reveal")
  voteShot(coldBeat, "cold:vote", 1.6, { ...B })
} else missing.push("cold open (no hunter repeated a whisperer's name)")
// 0:05-0:08 TITLE (L25 flicker)
seg({ note: "title", src: A("06-title-flicker.mp4"), in: 0, dur: 3 })
// 0:08-0:16 STORY: the game's own story film (plane to SF, the billboards on the 101, the mansion, the hunters)
const story = "story"
if (fs.existsSync(path.join(DIR, "raw", story, "clips.json"))) {
  const mask = [[1690, 860, 230, 220], [0, 1040, 1920, 40]] // the dev page's QR placeholder + buttons
  const n = narr("Halloween in San Francisco. Four exorcists were hired. All four are A.I.", 0.1)
  seg({ note: "story:plane", src: `${story}/stage`, in: 5.6, dur: 2.0, mask, ...B, ...withNarr(n) })
  seg({ note: "story:billboards", src: `${story}/stage`, in: 13.8, dur: 2.8, mask, ...B, captions: [{ t: 0, d: 2.8, item: { kind: "narr", text: n.cap.item.text } }] })
  seg({ note: "story:mansion", src: `${story}/stage`, in: 18.0, dur: 2.2, mask, ...B, captions: [{ t: 0, d: 2.2, item: { kind: "narr", text: n.cap.item.text } }] })
  seg({ note: "story:hunters", src: `${story}/stage`, in: 22.2, dur: 2.6, mask, ...B, captions: [{ t: 0, d: 2.6, item: { kind: "narr", text: "Tonight, you are the ghosts." } }], vo: { t: 0, text: "Tonight, you are the ghosts." } })
} else missing.push("story film")
// 0:16-0:22 SCAN TO JOIN: slow pan across the lobby, phone PIP
const lobby = ph(p => p.phase === "lobby")[0] ?? ph(p => p.phase === "intro")[0]
let joinAt = lobby ? lobby.at + 300 : null
while (joinAt && !ok(joinAt, 6) && joinAt < lobby.at + 15000) joinAt += 1000
stage("join", joinAt, 4.5, { ...B, zoom: { z: 1.7, x: 0.97, y: 0.9, ramp: 0.01 }, pip: { src: `${cap}/phone2`, from: 0, h: 720 }, ...withNarr(narr("Scan the code. Your phone becomes a ghost in the house.")) })
// 0:22-0:40 THE CABAL: one beat. whip in, whisper, lines (punch-ins alternate), vote slam + burn (static), phone result
const beats = ph(p => p.phase === "hunting" && (!coldBeat || Math.abs(p.at - coldBeat.at) > 15000)).map(p => {
  const r = next(p.at, "reveal"); const end = r?.at ?? p.at + 12000
  const ls = lines.filter(l => l.at >= p.at - 3000 && l.at < end && ok(l.at - 250, lineDur(l)))
  const ws = whispers.filter(w => w.at >= p.at - 12000 && w.at < end && ok(w.at - 300, 2.4))
  return { p, r, ls, ws, sway: E.find(e => e.kind === "hunter" && e.swayedBy && e.at >= p.at - 8000 && e.at < end) }
}).filter(b => b.ls.length >= 2 && b.r && ok(b.r.at - 600, 4.4))
  .sort((x, y) => (!!y.sway - !!x.sway) || (y.ws.length > 0) - (x.ws.length > 0) || y.ls.length - x.ls.length)
let used = 0, first = true
const picked = beats.slice(0, 3).sort((x, y) => x.p.at - y.p.at)
for (const beat of picked) {
  if (used > 14) break
  const { p, r, ls, ws, sway } = beat
  mark("cabal", p.at, `round ${p.round} beat ${p.beat}, ${ls.length} lines, ${ws.length} whispers${sway ? `, ${sway.id} swayed by ${sway.swayedBy}` : ""}`)
  const w = (sway && ws.find(x => x.who.toLowerCase() === String(sway.swayedBy).toLowerCase())) ?? ws[0]
  const label = first ? [{ t: 0, item: { kind: "tag", text: "4 AI agents on Agent Relay" } }] : []
  if (w && stage("cabal:whisper", w.at - 300, 2.4, { ...B, whip: first, gain: 0.6, captions: [{ t: 0, item: { kind: "whisper", who: w.who, to: w.to, text: w.text } }, ...label] })) { used += 2.4; first = false }
  let last = 0
  for (const [j, l] of ls.filter(l => l.at > last + 2500 && (last = l.at)).entries()) {
    if (used > 13) break
    const lab = first ? [{ t: 0, item: { kind: "tag", text: "4 AI agents on Agent Relay" } }] : []
    if (lineShot(l, j, { ...B, whip: first, captions: [{ t: 0, item: { kind: "line", who: l.from, text: l.text } }, ...lab], ...(j % 3 === 2 ? { zoom: undefined } : {}) })) { used += lineDur(l); first = false }
  }
  if (voteShot(r, "cabal:vote", 3.4, { ...B, pip: { src: `${cap}/phone1`, from: 1.2, h: 720 } })) used += 3.4
}
if (!picked.length) missing.push("cabal beat")
// 0:40-0:50 KILL -9 live: whip in, static hold on the stage, terminal line + label in the band
const kill = E.find(e => e.src === "rec" && e.kind === "kill")
const back = kill ? E.find(e => e.src === "stage" && e.kind === "restored" && e.at > kill.at) : [...E].reverse().find(e => e.src === "stage" && e.kind === "restored" && e.restoredAt > t0 + 3000 && inStage(e.restoredAt - (e.lastRecoveryMs ?? 0) - 2000, 10))
const recS = back?.lastRecoveryMs ? (back.lastRecoveryMs / 1000).toFixed(1) : null
const killAt = kill?.at ?? (back ? back.restoredAt - (back.lastRecoveryMs ?? 0) : null)
mark("kill -9", killAt, kill ? `ours, pid ${kill.pid}, back ${recS ?? "?"} s` : back ? `executor restart in capture (not ours), back ${recS} s` : "none")
if (killAt) {
  // two takes: the death (terminal line) then the revived stage, never the stale "Gone for N s" frames in between
  const n = narr(kill ? "Now we kill the process running the game. Nobody moved." : "The process running the game dies. Nobody moved.", 0.2)
  const tag = { kind: "tag", text: `every ghost is a Terse Durable Actor${recS ? ` · back in ${recS} s` : ""}` }
  stage("kill:die", killAt - 400, 2.0, { ...B, whip: true, gain: 0.5, pip: { src: `${cap}/phone1`, from: 0, h: 720 },
    captions: [{ t: 0, d: 2.0, item: kill ? { kind: "term", text: `kill -9 ${kill.pid}` } : { kind: "narr", text: "the process running the game dies" } }] })
  const backAt = back ? back.at : killAt + 3000
  stage("kill:back", backAt - 200, 4.6, { ...B, gain: 0.5, pip: { src: `${cap}/phone1`, from: 0, h: 720 }, captions: [{ ...n.cap, t: 0, d: 4.6 }, { t: 0, d: 4.6, item: tag }], vo: { t: 0, text: n.vo.text } })
}
// 0:50-0:55 FINALE: whip in, push in on the red flood
const fin = ph(p => p.phase === "finale").find(f => inStage(f.at - 300, 5))
mark("finale", fin?.at, fin ? `winner ${fin.winner}` : "none")
if (fin) stage("finale", fin.at - 300, 6, { ...B, whip: true, gain: 1, zoom: { z: 1.15, x: 0.5, y: 0.5, ramp: 5.5 }, pip: { src: `${cap}/phone1`, from: 0.5, h: 720 }, captions: [{ t: 0.3, d: 4.6, item: { kind: "narr", text: fin.winner === "hunters" ? "This time the AI won." : "Three rooms haunted. The house is yours." } }] })
else missing.push("finale")
// 0:55-1:00 END CARD (L25 flicker, then hold >= 3 s)
seg({ note: "end", src: A("07-end-flicker.mp4"), in: 0, dur: 5, vo: { t: 0.5, text: "Haunt the Room. Scan to join." } }) // the card itself reads "Haunt the Room ... Scan to play": the VO is its caption


// the bed: the longest outage-free lobby stretch of the game's own score (up to 30 s), looped under everything
const bedAt = lobby ? lobby.at + 500 : t0 + 2000
const cut = { out: "haunt-the-room.mp4", voEngine: process.env.VO_ENGINE ?? "eleven", capture: cap, voGain: 1.5, gameGain: 0.8, bed: { src: `${cap}/stage`, atMs: Math.round(bedAt), dur: 20, gain: 0.55 }, segments: S }
fs.writeFileSync(out, JSON.stringify(cut, null, 1))
console.log(table.join("\n"))
console.log(`\n${S.length} segments, ${S.reduce((a, s) => a + s.dur, 0).toFixed(1)} s -> ${out}`)
if (missing.length) console.log(`MISSING: ${missing.join(", ")}`)
