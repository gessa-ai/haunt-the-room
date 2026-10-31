// L11b VIDEO: run the whole capture with no human. Waits for "2.5 LIVE" in lanes/QA.md, then drives rec.mjs's
// stdin: lobby (phones take names) -> show -> reset -> bots 120 -> start; kill -9 the executor 1.5 s into beat 3
// HIDE (once); after the finale, a second round if phone1's lie never landed; then stop and build the video.
//   node demo/video/drive.mjs [--label cap1] [--no-wait] [--no-build]
import { spawn, execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const DIR = import.meta.dirname, ROOT = path.resolve(DIR, "../..")
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1] }
const label = opt("label", "cap1")
const say = (s) => console.log(`[drive ${new Date().toTimeString().slice(0, 8)}] ${s}`)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

if (!argv.includes("--no-wait")) {
  say(`waiting for /${opt("wait-for", "2.5 LIVE")}/ in lanes/QA.md${opt("start-by") ? ` (or ${opt("start-by")})` : ""}`)
  // a real announcement: "2.5 LIVE" not inside quotes, on a line that is not about waiting for it; then /api/health 200
  const want = new RegExp(opt("wait-for", "(^|[^'\"`])2\\.5 LIVE(?!['\"`])"), "i")
  const deadline = opt("start-by") // HH:MM: start anyway then, unless the newest QA.md line asks to hold
  const live = () => {
    const ls = fs.readFileSync(path.join(ROOT, "lanes/QA.md"), "utf8").split("\n").filter(Boolean)
    if (ls.some(l => want.test(l) && (want.source.startsWith("^") || !/until|wait|before|after|will|when|no windows|hold|L11b/i.test(l)))) return true
    return !!deadline && new Date().toTimeString().slice(0, 5) >= deadline && !/hold/i.test(ls.at(-1) ?? "")
  }
  const healthy = async () => (await fetch("http://localhost:3300/api/health").catch(() => null))?.ok === true
  // never inside another lane's posted window: "HH:MM-HH:MM ... Hold" with now before its end
  const held = () => {
    const now = new Date().toTimeString().slice(0, 5)
    return fs.readFileSync(path.join(ROOT, "lanes/QA.md"), "utf8").split("\n").some(l => { const m = /(\d\d:\d\d)-(\d\d:\d\d)/.exec(l); return m && /hold/i.test(l) && !/L11b/.test(l) && now >= m[1] && now < m[2] })
  }
  while (!(live() && !held() && (await healthy()))) await sleep(3000)
  say("go signal seen")
}
const rec = spawn("node", [path.join(DIR, "rec.mjs"), "--label", label, "--phones", "2", "--names", "kyle,maya", "--feed", "--allow-kill", "--secs", opt("secs", "420")], { stdio: ["pipe", "inherit", "inherit"] })
const send = (s) => { say(`> ${s}`); rec.stdin.write(s + "\n") }
const done = new Promise(r => rec.on("exit", r))
const evFile = path.join(DIR, "raw", label, "events.jsonl")
const events = () => (fs.existsSync(evFile) ? fs.readFileSync(evFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [])
const waitFor = async (pred, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const e = events().find(pred); if (e) return e; await sleep(250) } return null }

await sleep(6000)
send("l"); await sleep(12000)
send("s"); await sleep(1500)
send("r"); await sleep(2000)
send(`bots-on?n=${opt("bots", "40")}`); await sleep(6000)
let killed = false
for (let round = 1; round <= Number(opt("rounds", "2")); round++) {
  const t0 = Date.now()
  send("h")
  send(`m round ${round} start`)
  const intro = await waitFor(e => e.at > t0 && e.src === "stage" && e.kind === "phase" && (e.phase === "intro" || e.phase === "hide"), 15000)
  if (!intro) { say("no intro after H; pressing again"); send("h") }
  const r = intro?.round
  if (!killed) {
    const hide3 = await waitFor(e => e.at > t0 && e.src === "stage" && e.kind === "phase" && e.phase === "hide" && e.beat === 3, 150000)
    if (hide3) { await sleep(1500); send("kill"); killed = true }
  }
  const fin = await waitFor(e => e.at > t0 && e.src === "stage" && e.kind === "phase" && e.phase === "finale", 240000)
  say(fin ? `finale round ${fin.round} winner ${fin.winner}` : "no finale in 4 min")
  await sleep(9000)
  const landed = events().some(e => e.at > t0 && e.src === "phone1" && e.kind === "msg:result" && e.m.kind === "lie")
  say(`round ${round} (house round ${r}): phone1 lie landed = ${landed}`)
  if (landed) break
  if (round === 1) { send("r"); await sleep(4000) }
}
send("q")
await done
if (argv.includes("--no-build")) process.exit(0)
execFileSync("node", [path.join(DIR, "moments.mjs"), label], { stdio: "inherit" })
execFileSync(path.join(DIR, "build.sh"), [], { stdio: "inherit" })
say(`video: ${path.join(DIR, "out/haunt-the-room.mp4")}`)
