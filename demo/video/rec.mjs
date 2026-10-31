// L11b VIDEO recorder: the stage (1920x1080) + N phones (/p, 390x844 @1.5x) recorded headless through the CDP
// screencast into H.264 (GPU, constant 30 fps locked to the wall clock), the stage's WebAudio tapped to a .webm,
// and every moment worth cutting to logged with absolute ms so the cut-list can find it.
//   node demo/video/rec.mjs --label cap1 [--base http://localhost:3300] [--phones 2] [--secs 600] [--feed]
//                           [--stage-url <full url, overrides base>] [--no-play] [--click <selector>] [--names kyle,maya]
// stdin while running (type + Return):  h|f|l|r|s|a|bots-on|bots-off = presenter command  ·  kill = kill -9 the
//   House executor (DEMO.md setup step 2 path, only with --allow-kill)  ·  m <note> = marker  ·  q = stop.
// Output: demo/video/raw/<label>/{stage,phone1,phone2,feed}.mp4, stage-audio.webm, clips.json, events.jsonl
// Stops itself when the disk has < 150 MB free. Uses the Playwright the QA lane installed (qa/node_modules).
import { createRequire } from "node:module"
import { spawn, execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

const ROOT = path.resolve(import.meta.dirname, "../..")
const require = createRequire(path.join(ROOT, "qa/x.js"))
const { chromium } = require("playwright")

const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1] }
const flag = (k) => argv.includes(`--${k}`)
const label = opt("label", `cap-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`)
const base = opt("base", "http://localhost:3300").replace(/\/$/, "")
const nPhones = Number(opt("phones", "2"))
const secs = Number(opt("secs", "900"))
const play = !flag("no-play")
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
const TOKEN = env.PRESENTER_TOKEN ?? ""
const stageUrl = opt("stage-url", `${base}/stage?token=${encodeURIComponent(TOKEN)}`)
const OUT = path.join(import.meta.dirname, "raw", label)
fs.mkdirSync(OUT, { recursive: true })

const freeMB = () => Number(execFileSync("df", ["-m", OUT]).toString().trim().split("\n").pop().split(/\s+/)[3])
if (freeMB() < 250) { console.error(`rec: only ${freeMB()} MB free; need 250 MB. Free disk first.`); process.exit(2) }

const evLog = fs.createWriteStream(path.join(OUT, "events.jsonl"), { flags: "a" })
const ev = (src, kind, data = {}) => { const e = { at: Date.now(), src, kind, ...data }; evLog.write(JSON.stringify(e) + "\n"); return e }
const say = (s) => console.log(`[rec ${new Date().toTimeString().slice(0, 8)}] ${s}`)
const clips = {}

// ---- one page -> one H.264 file at 30 fps CFR (latest screencast frame repeated on the wall clock) ----
async function recordPage(page, name, { w, h, kbps }) {
  const file = path.join(OUT, `${name}.mp4`)
  const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "-",
    "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-c:v", "h264_videotoolbox", "-b:v", `${kbps}k`, "-r", "30", "-movflags", "+frag_keyframe+empty_moov", file], { stdio: ["pipe", "inherit", "inherit"] })
  ff.on("exit", (c) => c && say(`ffmpeg ${name} exited ${c}`))
  const cdp = await page.context().newCDPSession(page)
  let latest = null, t0 = 0, written = 0
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    latest = Buffer.from(data, "base64")
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {})
    if (!t0) { t0 = Date.now(); clips[name] = { file: `${name}.mp4`, startMs: t0, fps: 30, w, h }; ev(name, "first-frame") ; saveClips() }
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: w, maxHeight: h, everyNthFrame: 1 })
  const tick = setInterval(() => {
    if (!latest || ff.stdin.destroyed) return
    const due = Math.floor((Date.now() - t0) / (1000 / 30)) + 1
    while (written < due) { ff.stdin.write(latest); written++ }
  }, 15)
  return async () => { clearInterval(tick); await cdp.send("Page.stopScreencast").catch(() => {}); ff.stdin.end(); await new Promise(r => ff.on("close", r)); clips[name].frames = written; saveClips() }
}
const saveClips = () => fs.writeFileSync(path.join(OUT, "clips.json"), JSON.stringify({ label, base, clips }, null, 1))

// ---- websocket frames worth cutting to (lines, whispers, sways, votes, phases, phone verdicts) ----
function watchSockets(page, src) {
  const seen = new Set()
  const hunters = {}
  let phase = "", lastSnap = 0
  page.on("websocket", (ws) => {
    ev(src, "ws-open", { url: ws.url().split("?")[0] })
    ws.on("close", () => ev(src, "ws-close"))
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string" || payload.length > 400_000) return
      let m; try { m = JSON.parse(payload) } catch { return }
      if (m?.t === "snap" && m.s) {
        const now = Date.now()
        if (lastSnap && now - lastSnap > 1500) ev(src, "snap-gap", { from: lastSnap, ms: now - lastSnap })
        lastSnap = now
        const s = m.s
        const p = `${s.phase}|${s.round}|${s.beat}`
        if (p !== phase) { phase = p; ev(src, "phase", { phase: s.phase, round: s.round, beat: s.beat, endsAt: s.endsAt, winner: s.winner }) }
        for (const hs of s.hunters ?? []) {
          const k = `${hs.lean}|${hs.swayedBy ?? ""}|${hs.vote ?? ""}`
          if (hunters[hs.id] !== k) { hunters[hs.id] = k; ev(src, "hunter", hs) }
        }
        for (const e of s.events ?? []) { const k = JSON.stringify(e); if (!seen.has(k)) { seen.add(k); ev(src, "event", { e }) } }
        if (s.restoredAt && !seen.has(`r${s.restoredAt}`)) { seen.add(`r${s.restoredAt}`); ev(src, "restored", { restoredAt: s.restoredAt, lastRecoveryMs: s.lastRecoveryMs }) }
        return
      }
      if (m?.t === "rooms" || m?.t === "pong") return
      if (m?.t === "you") { const k = `${m.score}|${m.room}|${m.caught}|${m.rank}`; if (seen.has(k)) return; seen.add(k) }
      if (m?.t) return void ev(src, `msg:${m.t}`, { m })
      // relay feed frames (observer): keep anything with text in it, truncated
      if (m?.message?.text) return void ev(src, "relay", { type: m.type, channel: m.channel ?? null, from: m.message.agent_name ?? m.message.from?.name ?? null, to: m.message.to?.name ?? m.recipient?.name ?? null, text: m.message.text })
      const txt = JSON.stringify(m)
      if (/"(text|body|action|name)"/.test(txt)) ev(src, "relay", { raw: txt.slice(0, 800) })
    })
  })
}

// ---- stage WebAudio tap: every connect() to a destination also feeds a MediaRecorder ----
const AUDIO_TAP = `(() => {
  const orig = AudioNode.prototype.connect; const taps = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = orig.call(this, dest, ...rest);
    try { if (dest instanceof AudioDestinationNode) { const ctx = dest.context; let t = taps.get(ctx);
      if (!t) { t = ctx.createMediaStreamDestination(); taps.set(ctx, t);
        const mr = new MediaRecorder(t.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 128000 });
        mr.ondataavailable = async (e) => { const b = new Uint8Array(await e.data.arrayBuffer()); let s = "";
          for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          window.__recAudio(btoa(s)); };
        mr.onstart = () => window.__recAudioStart(Date.now()); mr.start(1000); }
      orig.call(this, t); } } catch (e) { console.warn("audio tap", e) }
    return out; };
})()`

const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=metal", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] })
const stops = []

// stage
const sctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const audioFile = fs.createWriteStream(path.join(OUT, "stage-audio.webm"))
await sctx.exposeFunction("__recAudio", (b64) => { audioFile.write(Buffer.from(b64, "base64")) })
await sctx.exposeFunction("__recAudioStart", (ms) => { clips.stageAudio = { file: "stage-audio.webm", startMs: ms }; ev("stage", "audio-start"); saveClips() })
await sctx.addInitScript(AUDIO_TAP)
const stage = await sctx.newPage()
stage.on("pageerror", (e) => ev("stage", "pageerror", { msg: e.message }))
watchSockets(stage, "stage")
stops.push(await recordPage(stage, "stage", { w: 1920, h: 1080, kbps: 4000 }))
await stage.goto(stageUrl, { waitUntil: "load" })
await stage.mouse.click(960, 540).catch(() => {}) // audio unlock
if (opt("click")) { await stage.waitForTimeout(800); await stage.locator(opt("click")).first().click({ timeout: 5000 }).catch(e => say(`--click: ${e.message}`)) }
say(`stage up: ${stageUrl.replace(/token=[^&]+/, "token=*")}`)

// feed (optional): the raw Agent Relay wire
if (flag("feed")) {
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const feed = await fctx.newPage()
  stops.push(await recordPage(feed, "feed", { w: 1280, h: 720, kbps: 1500 }))
  await feed.goto(`${base}/feed?token=${encodeURIComponent(TOKEN)}`, { waitUntil: "load" })
}

// phones: phone1 = the liar (lies every hide beat), others hide in the least-crowded visible room
const phones = []
for (let i = 1; i <= nPhones; i++) {
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
  const p = await pctx.newPage()
  watchSockets(p, `phone${i}`)
  stops.push(await recordPage(p, `phone${i}`, { w: 584, h: 1266, kbps: 1500 }))
  await p.goto(`${base}/p`, { waitUntil: "load" })
  phones.push(p)
}
say(`${nPhones} phones joined`)
// --names kyle,maya: type each phone's name into the lobby field (the stage and the hunters use it); lobby only
const names = (opt("names", "") || "").split(",").filter(Boolean)
phones.forEach((p, i) => names[i] && (async () => {
  for (let k = 0; k < 120; k++) {
    const f = p.locator(".hr-lobby-name").first()
    if (await f.isVisible().catch(() => false)) { await f.fill(names[i]); await f.press("Enter"); ev(`phone${i + 1}`, "named", { name: names[i] }); return say(`phone${i + 1} named ${names[i]}`) }
    await p.waitForTimeout(1000)
  }
  say(`phone${i + 1}: no lobby name field in 120 s (name it in the lobby: press l)`)
})())

let lastBeat = phones.map(() => "")
const drive = setInterval(async () => {
  if (!play) return
  for (const [i, p] of phones.entries()) {
    try {
      const st = await p.evaluate(() => {
        const r = document.querySelector("[data-phase]")
        const tiles = [...document.querySelectorAll(".hr-room:not(.full)")].map(e => e.dataset.room)
        const chips = [...document.querySelectorAll(".hr-lie-chip")].map(e => e.dataset.room)
        return { phase: r?.dataset.phase, tiles, chips, name: document.querySelector(".hr-splash-name")?.textContent ?? "" }
      })
      const was = lastBeat[i]; lastBeat[i] = st.phase ?? ""
      // phone1 also lies DURING the debate (2.9: whispers land mid-hunting and can flip a hunter)
      if (i === 0 && st.phase === "hunting" && was !== "hunting" && st.chips.length) {
        await p.waitForTimeout(1500 + Math.random() * 1500)
        const lie = st.chips[Math.floor(Math.random() * st.chips.length)]
        await p.locator(`.hr-lie-chip[data-room="${lie}"]`).first().click({ timeout: 2000 }).catch(() => {})
        ev("phone1", "lie", { room: lie, during: "hunting" })
        continue
      }
      if (st.phase !== "hide" || was === "hide") continue
      await p.waitForTimeout(800 + Math.random() * 1500)
      const room = st.tiles[(i * 2 + Math.floor(Math.random() * 3)) % Math.max(1, st.tiles.length)]
      if (room) { await p.locator(`.hr-room[data-room="${room}"]`).first().click({ timeout: 2000 }).catch(() => {}); ev(`phone${i + 1}`, "hide", { room }) }
      if (i === 0) {
        const lie = st.chips.find(c => c !== room && !st.tiles.slice(0, 1).includes(c)) ?? st.chips[0]
        await p.waitForTimeout(600)
        if (lie) { await p.locator(`.hr-lie-chip[data-room="${lie}"]`).first().click({ timeout: 2000 }).catch(() => {}); ev("phone1", "lie", { room: lie }) }
      }
    } catch { /* page navigating */ }
  }
}, 700)

// presenter + kill + markers from stdin
async function presenter(cmd) {
  const r = await fetch(`${base}/api/presenter/${cmd}`, { method: "POST", headers: { "x-presenter-token": TOKEN } }).catch(e => ({ ok: false, status: String(e) }))
  ev("rec", "presenter", { cmd, ok: r.ok, status: r.status }); say(`presenter ${cmd}: ${r.status}`)
}
const KEYS = { h: "start", f: "finale", l: "lobby", r: "reset", s: "show", a: "auto" }
function killExecutor() {
  if (!flag("allow-kill")) return say("kill refused: start rec.mjs with --allow-kill (and post a window in lanes/QA.md)")
  for (const f of ["release/current/logs/house-executor-7300.pid", "logs/house-executor-7300.pid"]) {
    const fp = path.join(ROOT, f)
    if (!fs.existsSync(fp)) continue
    const age = (Date.now() - fs.statSync(fp).mtimeMs) / 1000
    const pid = Number(fs.readFileSync(fp, "utf8").trim().split(/\s+/)[0])
    let alive = false; try { process.kill(pid, 0); alive = true } catch {}
    if (!alive || age > 10) { say(`${f}: ${alive ? "alive" : "DEAD"}, age ${age.toFixed(0)} s, skip`); continue }
    process.kill(pid, "SIGKILL")
    ev("rec", "kill", { pid, file: f, cmd: `kill -9 $(cut -d' ' -f1 ~/haunted-hacks/${f})` }); say(`kill -9 ${pid} (${f})`)
    return
  }
  say("kill: no live executor pid under 10 s old; skipped")
}
const rl = readline.createInterface({ input: process.stdin })
rl.on("line", (line) => {
  const s = line.trim(); if (!s) return
  if (s === "q") return stop("stdin q")
  if (s === "kill") return killExecutor()
  if (s.startsWith("m ")) { ev("rec", "mark", { note: s.slice(2) }); return say(`mark: ${s.slice(2)}`) }
  if (KEYS[s]) return void presenter(KEYS[s])
  if (/^bots-(on|off)/.test(s)) return void presenter(s)
  say("? h f l r s a bots-on[?n=120] bots-off kill 'm <note>' q")
})

let stopping = false
async function stop(why) {
  if (stopping) return; stopping = true
  say(`stopping (${why})`); ev("rec", "stop", { why })
  clearInterval(drive); clearInterval(diskGuard); clearTimeout(timer)
  for (const s of stops) await s().catch(e => say(`stop: ${e.message}`))
  await new Promise(r => audioFile.end(r))
  await browser.close().catch(() => {})
  evLog.end()
  say(`done -> ${OUT}`)
  for (const f of fs.readdirSync(OUT)) say(`  ${f} ${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(1)} MB`)
  process.exit(0)
}
const diskGuard = setInterval(() => { if (freeMB() < 150) stop(`disk ${freeMB()} MB free`) }, 5000)
const timer = setTimeout(() => stop(`--secs ${secs}`), secs * 1000)
process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))
say(`recording ${label} for up to ${secs} s; type h/f/l/r/s/a, kill, 'm note', q`)
