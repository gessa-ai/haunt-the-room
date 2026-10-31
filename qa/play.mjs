// @ts-check
// L13 QA smoke by REAL USE (the lane's one script), THE LOOP (beats): the stage (1920x1080) and two phones (390x844)
// in headless Chromium against the integrated stack. Plays rounds like people would (hide, lure), watches every beat
// in the DOM, checks it against the House's own stage socket (expected vs actual), screenshots each beat to qa/shots/.
//   node qa/play.mjs [--secs 200] [--kill] [--start] [--headed]
//   --start: presenter "start" when the House is in the lobby; else it follows auto mode
//   --kill:  kill -9 $(cat logs/actors.pid) mid-beat in beat 3 and time every phone back (same beat, same deadline)
import { chromium } from "playwright"
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const ROOT = `${process.env.HOME}/haunted-hacks`
const BASE = process.env.QA_BASE ?? "http://localhost:3300"
const TOKEN = /^PRESENTER_TOKEN=(.*)$/m.exec(readFileSync(`${ROOT}/.env`, "utf8"))?.[1]?.trim() ?? ""
const argv = process.argv.slice(2)
const flag = (k) => argv.includes(`--${k}`)
const num = (k, d) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d)
const SECS = num("secs", 200)
const SHOTS = `${ROOT}/qa/shots`
const RUN = new Date().toTimeString().slice(0, 8).replaceAll(":", "")
mkdirSync(SHOTS, { recursive: true })
const LOG = `${ROOT}/qa/runs/play-${RUN}.log`
const t0 = Date.now()
const hms = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}` }
const log = (s) => { const line = `${hms()} ${s}`; console.log(line); appendFileSync(LOG, line + "\n") }
const results = []
const check = (ok, what) => { results.push({ ok, what }); log(`${ok ? "ok  " : "FAIL"} ${what}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const H = { "x-presenter-token": TOKEN, "content-type": "application/json" }
const presenter = async (cmd) => {
  const r = await fetch(`${BASE}/api/presenter/${cmd}`, { method: "POST", headers: H })
  log(`presenter ${cmd} -> ${r.status} ${(await r.text()).slice(0, 80)}`)
}

// ---------- the House's truth: our own stage socket ----------
/** @type {any} */ let snap = null
/** @type {any} */ let kill = null
let lured = false
/** @type {any} */ let stage = null
const ready = { on: false, sawHide: false }
const phaseAt = new Map() // "round.beat.phase" -> first time our stage socket saw it
async function stageSocket() {
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/stage/grant`, { method: "POST", headers: H })
      if (!r.ok) throw new Error(`grant ${r.status}`)
      const ws = new WebSocket((await r.json()).websocketUrl)
      await new Promise((resolve) => {
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data))
          if (m.t !== "snap") return
          snap = m.s
          const k = `${snap.round}.${snap.beat}.${snap.phase}`
          if (!phaseAt.has(k)) { phaseAt.set(k, Date.now()); onHousePhase(snap) }
        }
        ws.onclose = resolve
        ws.onerror = () => {}
      })
    } catch { /* actors restarting */ }
    await wait(150)
  }
}
void stageSocket()
const ghostOf = (id) => snap?.ghosts.find((g) => g[0] === id)
const rooms = () => (snap?.rooms ?? []).slice()

// ---------- browser ----------
const browser = await chromium.launch({
  channel: "chromium", headless: !flag("headed"),
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
})
const PHONE = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}
const shotCount = new Map()
async function shot(page, beat, who, max = 1) {
  const k = `${beat}-${who}`
  const n = (shotCount.get(k) ?? 0) + 1
  shotCount.set(k, n)
  if (n > max || !page) return
  const file = `${SHOTS}/${hms().replaceAll(":", "").replace(".", "-")}-${beat}-${who}.jpg`
  try { await page.screenshot({ path: file, type: "jpeg", quality: 45, scale: "css" }); log(`shot ${file.split("/").pop()}`) } catch (e) { log(`shot failed ${k}: ${String(e).slice(0, 80)}`) }
}

/** @type {Record<string, any>} */
const phones = {}
const resLat = [] // phone verdict shown minus our stage socket's reveal (negative = phone first)
const latencies = [] // reveal seen on our stage socket -> result screen on the phone
async function openPhone(who) {
  const ctx = await browser.newContext(PHONE)
  const page = await ctx.newPage()
  const p = { who, page, id: "", name: "", state: {}, dead: [], live: [], finaleAt: 0, reveals: [], results: [], toasts: [], picks: 0 }
  phones[who] = p
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`[${who} console.${m.type()}] ${m.text().slice(0, 200)}`) })
  page.on("pageerror", (e) => log(`[${who} pageerror] ${String(e).slice(0, 200)}`))
  page.on("response", async (r) => {
    if (r.status() >= 400) log(`[${who}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`)
    if (r.url().includes("/api/join") && r.request().method() === "POST") {
      try { const b = await r.json(); if (b?.ghost?.id) { p.id = b.ghost.id; p.name = b.ghost.name } } catch {}
    }
    if (r.url().includes("/api/whisper")) log(`[${who}] whisper -> ${r.status()} ${(await r.text().catch(() => "")).slice(0, 120)}`)
  })
  await page.exposeFunction("__qa", (k, v) => onPhone(p, k, v))
  await page.addInitScript(() => {
    const read = () => {
      const q = (s) => document.querySelector(s)
      const root = q(".hr-root")
      const rev = q(".hr-scr-reveal")
      return {
        link: root?.getAttribute("data-link") ?? "", phase: root?.getAttribute("data-phase") ?? "", screen: root?.getAttribute("data-screen") ?? "",
        mode: root?.getAttribute("data-mode") ?? "", mine: q(".hr-room.mine")?.getAttribute("data-room") ?? "",
        splash: q(".hr-splash")?.className ?? "", name: q(".hr-who-name")?.textContent ?? "",
        reveal: rev ? `${rev.getAttribute("data-kind") ?? ""}|${q(".hr-rev-word")?.textContent ?? ""}|${q(".hr-rev-points")?.textContent ?? ""}` : "",
        dead: q(".hr-dead.show") ? "dead" : "",
        finale: root?.getAttribute("data-screen") === "finale" ? (q(".hr-scr-finale")?.getAttribute("data-winner") ?? "?") : "",
        toast: q(".hr-toast.show")?.textContent ?? "", score: q(".hr-score")?.textContent ?? "",
      }
    }
    let prev = {}
    const tick = () => {
      const s = read()
      for (const k of Object.keys(s)) if (s[k] !== prev[k]) window.__qa(k, s[k])
      prev = s
    }
    const start = () => { new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setInterval(tick, 100); tick() }
    if (document.body) start()
    else document.addEventListener("DOMContentLoaded", start)
  })
  await page.goto(`${BASE}/p`)
  return p
}

function onPhone(p, k, v) {
  const prev = p.state[k]
  p.state[k] = v
  const now = Date.now()
  if (["toast", "screen", "mine", "dead", "finale", "link", "reveal"].includes(k)) log(`[${p.who}] ${k}: ${JSON.stringify(prev ?? "")} -> ${JSON.stringify(v)}`)
  if (k === "splash" && String(v).includes("named")) void shot(p.page, "01-splash", p.who, 1)
  if (k === "screen" && v === "reveal" && snap) {
    const sAt = phaseAt.get(`${snap.round}.${snap.beat}.reveal`)
    const lat = sAt ? now - sAt : null
    if (lat !== null) latencies.push(lat)
    setTimeout(() => {
      const kind = String(p.state.reveal).split("|")[0]
      p.reveals.push({ beat: snap?.beat, kind, text: p.state.reveal, lat })
      log(`[${p.who}] REVEAL beat ${snap?.beat}: ${p.state.reveal} (stage socket -> phone ${lat} ms)`)
      void shot(p.page, `06-reveal-${kind || "none"}`, p.who, 2)
      const g = ghostOf(p.id)
      if (g && kind !== "none" && kind !== "") check(((g[3] & 1) === 1) === (kind === "caught"), `${p.who} beat ${snap?.beat}: phone says ${kind}, House says ${(g[3] & 1) ? "caught" : "not caught"} in ${g[2]}`)
    }, 150)
  }
  if (k === "reveal" && v && snap && !["none", ""].includes(String(v).split("|")[0]) && !p.results.some((r) => r.key === `${snap.round}.${snap.beat}`)) p.results.push({ key: `${snap.round}.${snap.beat}`, at: now, kind: String(v).split("|")[0] })
  if (k === "screen" && v && v !== "reveal") void shot(p.page, `04-screen-${v}`, p.who, 1)
  if (k === "toast" && v) { p.toasts.push({ at: now, v }); void shot(p.page, "09-toast", p.who, 3) }
  if (k === "dead" && v) { p.dead.push(now); void shot(p.page, "13-house-died", p.who, 3) }
  if (k === "link" && v && v !== "live") (p.downs ??= []).push(now)
  if (k === "link" && v === "live") { p.live.push(now); if (p.dead.length) setTimeout(() => void shot(p.page, "14-back", p.who, 3), 400) }
  if (k === "finale" && v && ready.sawHide) { p.finaleAt = now; void shot(p.page, `12-finale-${v}`, p.who, 2) }
}

// ---------- play: hide like people ----------
async function tap(p, sel) {
  try { await p.page.locator(sel).first().tap({ timeout: 1500 }); return true } catch (e) { log(`[${p.who}] tap ${sel} failed: ${String(e).split("\n")[0].slice(0, 100)}`); return false }
}
async function hide(p, how) {
  await wait(500 + Math.random() * 2500)
  if (!snap || snap.phase !== "hide" || p.state.screen === "out") return
  const rs = rooms().sort((a, b) => (how === "crowd" ? b.count - a.count : a.count - b.count))
  const room = rs[0]?.id
  if (!room) return
  const ok = await tap(p, `.hr-room[data-room="${room}"]`)
  p.picks++
  if (ok) {
    for (let i = 0; i < 20; i++) { await wait(50); if (ghostOf(p.id)?.[2] === room) break }
    const g = ghostOf(p.id)
    if (p.picks <= 3) check(g?.[2] === room && p.state.mine === room, `${p.who} hid in ${room}: DOM mine=${p.state.mine}, House room=${g?.[2]}`)
  }
  if (p.who === "A" && !lured && snap?.beat >= 2 && snap?.phase === "hide") {
    lured = true
    const empty = rooms().filter((r) => r.id !== room).sort((a, b) => a.count - b.count)[0]?.id
    log(`[A] LURE -> ${empty}`)
    if (await tap(p, ".hr-lure-chip")) { await wait(300); await shot(p.page, "08-lure-mode", "A", 1); await tap(p, `.hr-room[data-room="${empty}"]`) }
    await wait(1200)
    await shot(stage, "08-stage-lure-dm", "stage", 1)
  }
}
function onHousePhase(s) {
  log(`HOUSE ${s.phase} r${s.round}.${s.beat} (${Math.round((s.endsAt - Date.now()) / 100) / 10} s) online ${s.counters.online} possessed ${s.rooms.filter((r) => r.possessed).map((r) => r.id).join(",") || "-"}${s.sweptRooms?.length ? " swept " + s.sweptRooms.join(",") : ""}`)
  if (!ready.on) return
  if (s.phase === "hide") ready.sawHide = true
  if (s.phase === "hide") { for (const p of Object.values(phones)) void hide(p, p.who === "A" ? "crowd" : "quiet") }
  const shotPhase = { intro: "03-stage-intro", hide: "05-stage-hide", hunting: "05-stage-hunting", reveal: "06-stage-reveal", finale: "12-stage-finale" }[s.phase]
  if (shotPhase) setTimeout(() => void shot(stage, shotPhase, "stage", s.phase === "reveal" ? 3 : 1), s.phase === "reveal" ? 700 : 300)
  if (s.phase === "hunting") for (const p of Object.values(phones)) void shot(p.page, "05-hunting", p.who, 1)
  if ((flag("kill") || flag("xkill")) && !kill && s.beat >= 2 && s.phase === "hide") setTimeout(doKill, 2500)
}
function doKill() {
  const x = flag("xkill")
  const pid = readFileSync(`${ROOT}/logs/${x ? "house-executor-7300.pid" : "actors.pid"}`, "utf8").trim().split(" ")[0]
  const cmd = /^\d+$/.test(pid) ? execFileSync("ps", ["-o", "command=", "-p", pid]).toString() : ""
  if (!cmd.includes(x ? "runActorHost" : "durable-actors")) return log(`kill skipped: pid ${pid} not the target`)
  kill = { pid, at: Date.now(), pre: { phase: snap.phase, beat: snap.beat, round: snap.round, endsAt: snap.endsAt, A: ghostOf(phones.A.id)?.[2], B: ghostOf(phones.B.id)?.[2], possessed: snap.rooms.filter((r) => r.possessed).map((r) => r.id).join(",") } }
  log(`KILL -9 ${pid} pre ${JSON.stringify(kill.pre)}`)
  process.kill(Number(pid), "SIGKILL")
  setTimeout(() => void shot(stage, "13-stage-static", "stage", 1), 700)
  const watch = setInterval(() => {
    if (snap && snap.restoredAt && snap.restoredAt >= kill.at - 50) {
      clearInterval(watch)
      kill.post = { phase: snap.phase, beat: snap.beat, round: snap.round, endsAt: snap.endsAt, A: ghostOf(phones.A.id)?.[2], B: ghostOf(phones.B.id)?.[2], ms: Date.now() - kill.at }
      log(`HOUSE BACK ${kill.post.ms} ms after kill: ${JSON.stringify(kill.post)}`)
      void shot(stage, "14-stage-back", "stage", 1)
    }
  }, 50)
}

// ---------- run ----------
log(`play run ${RUN}: base ${BASE}, secs ${SECS}, kill ${flag("kill")}, start ${flag("start")}`)
const stageCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await stageCtx.addInitScript((tok) => { try { localStorage.setItem("haunt.presenterToken", tok) } catch {} }, TOKEN)
stage = await stageCtx.newPage()
let stageErrors = 0
stage.on("console", (m) => { if (m.type() === "error") { stageErrors++; log(`[stage console.error] ${m.text().slice(0, 200)}`) } })
stage.on("pageerror", (e) => log(`[stage pageerror] ${String(e).slice(0, 200)}`))
stage.on("response", (r) => { if (r.status() >= 400) log(`[stage] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`) })
await stage.goto(`${BASE}/stage`)
await wait(2500)
await shot(stage, "00-stage-open", "stage", 1)
const A = await openPhone("A")
const B = await openPhone("B")
await wait(3500)
check(Boolean(A.id && B.id), `both phones joined (A ${A.name || "?"}, B ${B.name || "?"})`)
check(A.state.name === A.name, `A shows its name: DOM "${A.state.name}" vs join "${A.name}"`)
await shot(A.page, "02-joined", "A", 1)
await shot(B.page, "02-joined", "B", 1)
ready.on = true
if (flag("start")) { for (let i = 0; i < 40 && snap?.phase !== "lobby"; i++) await wait(250); await presenter("start") }

const deadline = t0 + SECS * 1000
while (Date.now() < deadline) {
  await wait(250)
  if (A.finaleAt && B.finaleAt && Date.now() - Math.max(A.finaleAt, B.finaleAt) > 3000) break
}

// ---------- verdicts ----------
if (kill && flag("xkill")) {
  for (const p of [A, B]) {
    const d = p.dead.find((t) => t >= kill.at)
    const down = p.downs?.find((t) => t >= kill.at)
    check(!d && !down, `${p.who}: executor kill: no outage screen and link stayed live (dead ${d ? d - kill.at : "-"}, down ${down ? down - kill.at : "-"})`)
  }
}
if (kill && !flag("xkill")) {
  for (const p of [A, B]) {
    const d = p.dead.find((t) => t >= kill.at)
    const l = p.live.find((t) => t >= kill.at && (!d || t > d))
    check(Boolean(d), `${p.who}: outage screen ${d ? d - kill.at : "never"} ms after kill -9`)
    check(Boolean(l) && l - kill.at < 4000, `${p.who}: back (link live) ${l ? l - kill.at : "never"} ms after kill -9 (target < 4000)`)
  }
  if (kill.post) {
    check(kill.post.round === kill.pre.round && kill.post.beat === kill.pre.beat, `same beat after kill: pre r${kill.pre.round}.${kill.pre.beat} ${kill.pre.phase}, post r${kill.post.round}.${kill.post.beat} ${kill.post.phase}`)
    check(kill.post.phase !== kill.pre.phase || kill.post.endsAt === kill.pre.endsAt, `same deadline after kill: endsAt delta ${kill.post.endsAt - kill.pre.endsAt} ms (phase ${kill.pre.phase} -> ${kill.post.phase})`)
    check(kill.post.A === kill.pre.A && kill.post.B === kill.pre.B, `same rooms after kill: A ${kill.pre.A}->${kill.post.A}, B ${kill.pre.B}->${kill.post.B}`)
  } else check(false, "House never reported restoredAt after the kill")
}
for (const p of [A, B]) for (const r of p.results) { const sAt = phaseAt.get(`${r.key}.reveal`); if (sAt) resLat.push(r.at - sAt) }
const lat = resLat.slice().sort((a, b) => a - b)
if (lat.length) check(lat[Math.floor(lat.length * 0.9)] < 300, `reveal (stage socket) -> phone verdict: n ${lat.length}, p50 ${lat[Math.floor(lat.length / 2)]} ms, p90 ${lat[Math.floor(lat.length * 0.9)]} ms, max ${lat[lat.length - 1]} ms (target < 300)`)
for (const p of [A, B]) log(`[${p.who}] ${p.name}: reveals ${p.reveals.map((r) => `b${r.beat}:${r.kind}`).join(" ")} | toasts ${p.toasts.map((x) => x.v).join(" / ")}`)
if (A.finaleAt && B.finaleAt) check(Math.abs(A.finaleAt - B.finaleAt) < 300, `finale on both phones at once: skew ${Math.abs(A.finaleAt - B.finaleAt)} ms`)
log(`stage console errors: ${stageErrors}`)
writeFileSync(`${ROOT}/qa/runs/play-${RUN}.json`, JSON.stringify({ results, kill, latencies, A: { ...A, page: undefined }, B: { ...B, page: undefined } }, null, 1))
log(`DONE ${results.filter((r) => r.ok).length}/${results.length} ok`)
await browser.close()
process.exit(0)
