// @ts-check
// L22 SHOWRUN: one full rehearsal of the real event, like the presenter and a room would do it.
//   node showrun/rehearse.mjs [--bots 280] [--secs 150]
// Stage 1920x1080 on localhost:3300/stage?token=..., QR decoded from a screenshot, 6 browser phones through the
// decoded public URL, bots through the public URL, DEMO.md keys (S, R, H, kill at beat 3 hide if the House
// executor pid exists), then a proof set + metrics under showrun/runs/<HHMMSS>/.
import { chromium } from "playwright"
import jsQR from "jsqr"
import { PNG } from "pngjs"
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { spawn, execFileSync } from "node:child_process"

const ROOT = `${process.env.HOME}/haunted-hacks`
const LOCAL = "http://localhost:3300"
const EXPECT_QR = "https://haunt.gessa.ai/p"
const SPEC = { intro: 16000, hide1: 9000, hide: 6000, hunting: 9000, reveal: 4000 } // contract TIMING (show mode, SHOW_BEATS 4)
const TOKEN = /^PRESENTER_TOKEN=(.*)$/m.exec(readFileSync(`${ROOT}/.env`, "utf8"))?.[1]?.trim() ?? ""
if (!TOKEN) throw new Error("PRESENTER_TOKEN missing in .env")
const argv = process.argv.slice(2)
const num = (k, d) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d)
const BOTS = num("bots", 280)
const SECS = num("secs", 150)
const RUN = new Date().toTimeString().slice(0, 8).replaceAll(":", "")
const DIR = `${ROOT}/showrun/runs/${RUN}`
mkdirSync(DIR, { recursive: true })
const hms = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}` }
const log = (s) => { const l = `${hms()} ${s}`; console.log(l); appendFileSync(`${DIR}/run.log`, l + "\n") }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const fail = (lane, what) => { fails.push({ lane, what }); log(`FAIL [${lane}] ${what}`) }
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null }

// ---------- House truth: our own stage socket ----------
/** @type {any} */ let snap = null
let H0 = 0
let showStarted = false
let maxPoss = 0
const swayed = new Map()
let convSeen = 0
/** @type {any} */ let kill = null
const shotPlan = new Set()
const housePhaseAt = new Map() // "round.beat.phase" -> ms
const truth = new Map() // "round.beat" -> Map(ghostId -> caught)
let stopTruth = false
// House truth = the snapshots the ONE projector page receives (MAX_STAGES is 3; no second stage socket of our own)
function onSnap(s0) {
  snap = s0
  const k = `${snap.round}.${snap.beat}.${snap.phase}`
  maxPoss = Math.max(maxPoss, snap.rooms.filter((x) => x.possessed).length)
  for (const h of snap.hunters ?? []) { if (h.swayedBy && !swayed.has(`${snap.round}.${snap.beat}.${h.id}`)) { swayed.set(`${snap.round}.${snap.beat}.${h.id}`, h.swayedBy); log(`HOUSE ${h.id} swayedBy ${h.swayedBy} (conviction ${h.conviction}, lean ${h.lean})`) } if (typeof h.conviction === "number") convSeen++ }
  if (!housePhaseAt.has(k)) { housePhaseAt.set(k, Date.now()); log(`HOUSE ${k} online ${snap.counters.online} (h ${snap.counters.humans} b ${snap.counters.bots}) possessed ${snap.rooms.filter((x) => x.possessed).length}${snap.phase === "reveal" ? " votes " + snap.hunters.map((h) => h.id + ":" + h.vote).join(",") + " swept " + (snap.sweptRooms ?? []).join(",") : ""}`); onHouse(snap) }
  if (snap.phase === "reveal") {
    const tk = `${snap.round}.${snap.beat}`
    if (!truth.has(tk)) truth.set(tk, new Map())
    for (const g of snap.ghosts) truth.get(tk).set(g[0], { caught: (g[3] & 1) === 1, room: g[2] })
    votesAt.set(tk, snap.hunters.map((h) => h.vote))
  }
}
const votesAt = new Map()

// ---------- browsers ----------
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const AND = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const PHONES = [
  { who: "SE", w: 375, h: 667, ua: IOS }, { who: "i390", w: 390, h: 844, ua: IOS }, { who: "i430", w: 430, h: 932, ua: IOS },
  { who: "A412", w: 412, h: 915, ua: AND }, { who: "A360", w: 360, h: 800, ua: AND }, { who: "A393", w: 393, h: 873, ua: AND },
]
const audioErr = []
const isAudio = (t) => /audio|AudioContext|decodeAudioData|\.mp3|\.ogg|\.wav|NotAllowedError|play\(\)/i.test(t)
let shots = 0
async function shot(page, name) {
  if (!page || shots >= 15) return
  shots++
  try { await page.screenshot({ path: `${DIR}/${String(shots).padStart(2, "0")}-${name}.jpg`, type: "jpeg", quality: 50, scale: "css" }) } catch (e) { log(`shot ${name} failed ${String(e).slice(0, 80)}`) }
}

// stage
const stageCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await stageCtx.addInitScript(() => {
  // record when the stage page itself receives each phase (what the projector renders from)
  const W = window.WebSocket
  // @ts-ignore
  window.__ph = []
  // @ts-ignore
  window.WebSocket = class extends W { constructor(u, p) { super(u, p); this.addEventListener("message", (e) => { try { const m = JSON.parse(String(e.data)); if (m.t === "snap") { try { window.__truth(m.s) } catch {} const k = `${m.s.round}.${m.s.beat}.${m.s.phase}`; const a = window.__ph; if (!a.length || a[a.length - 1][0] !== k) a.push([k, Date.now()]) } } catch {} }) } }
})
const stage = await stageCtx.newPage()
await stage.exposeFunction("__truth", (s0) => onSnap(s0))
let stageErrors = 0
stage.on("console", (m) => { if (m.type() === "error") { stageErrors++; const t = m.text(); if (isAudio(t)) audioErr.push(`stage: ${t.slice(0, 160)}`); log(`[stage console.error] ${t.slice(0, 200)}`) } })
stage.on("pageerror", (e) => { stageErrors++; log(`[stage pageerror] ${String(e).slice(0, 200)}`) })
log(`rehearsal ${RUN}: bots ${BOTS}, secs ${SECS}`)
await stage.goto(`${LOCAL}/stage?token=${TOKEN}`)
await wait(4000)
await stage.mouse.click(960, 540) // audio unlock, like the presenter

// show mode + reset like DEMO setup step 4
await stage.keyboard.press("s"); await wait(600)
await stage.keyboard.press("r"); await wait(1500)

// (1) QR
let qrUrl = ""
for (let i = 0; i < 6 && !qrUrl; i++) {
  const buf = await stage.screenshot({ type: "png" })
  const png = PNG.sync.read(buf)
  const code = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
  qrUrl = code?.data ?? ""
  if (!qrUrl) await wait(1000)
}
log(`QR decoded from 1920x1080 screenshot: ${qrUrl || "NONE"}`)
await shot(stage, "stage-lobby-qr")
if (qrUrl !== EXPECT_QR) fail("L7/L12", `stage QR decodes to "${qrUrl || "nothing"}", expected ${EXPECT_QR}`)
const JOIN_URL = qrUrl.startsWith("https://") ? qrUrl : EXPECT_QR



// (2) bots through the public URL
const botLog = `${DIR}/bots.log`
const bots = spawn("bun", [`${ROOT}/bots/src/main.ts`, "--load", String(BOTS), "--base", "https://haunt.gessa.ai", "--ramp", "20", "--play", String(SECS + 30), "--report", `${DIR}/bots-report.md`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] })
bots.stdout.on("data", (d) => appendFileSync(botLog, d)); bots.stderr.on("data", (d) => appendFileSync(botLog, d))
log(`bots pid ${bots.pid}`)

// phones
/** @type {any[]} */ const phones = []
async function openPhone(spec) {
  const ctx = await browser.newContext({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: spec.ua })
  // synthetic phone: tag the join so the House's "real people" count stays real (people.ts skips any x-presenter-token)
  await ctx.route("**/api/join", (route) => route.continue({ headers: { ...route.request().headers(), "x-presenter-token": "showrun-synthetic" } }))
  const page = await ctx.newPage()
  const p = { ...spec, page, id: "", name: "", st: {}, ph: [], joinMs: null, finaleAt: 0, verdicts: [], errors: [], picks: 0 }
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); p.errors.push(t.slice(0, 160)); if (isAudio(t)) audioErr.push(`${p.who}: ${t.slice(0, 160)}`) } })
  page.on("pageerror", (e) => p.errors.push(`pageerror ${String(e).slice(0, 160)}`))
  page.on("response", async (r) => {
    if (r.url().endsWith("/api/join") && r.request().method() === "POST" && r.ok()) { try { const b = await r.json(); p.id = b.ghost.id; p.name = b.ghost.name } catch {} }
  })
  await page.exposeFunction("__qa", (k, v) => onPhone(p, k, v))
  await page.addInitScript(() => {
    const q = (s) => document.querySelector(s)
    const read = () => {
      const root = q(".hr-root"); const rev = q(".hr-scr-reveal")
      return { link: root?.dataset.link ?? "", phase: root?.dataset.phase ?? "", screen: root?.dataset.screen ?? "", name: q(".hr-who-name")?.textContent ?? "",
        reveal: rev ? rev.dataset.kind ?? "" : "", finale: q(".hr-scr-finale")?.dataset.winner ?? "", vite: q("vite-error-overlay") ? "overlay" : "", believe: /believes you/i.test(document.body.textContent ?? "") ? "yes" : "" }
    }
    let prev = {}
    const tick = () => { const s = read(); for (const k of Object.keys(s)) if (s[k] !== prev[k]) window.__qa(k, s[k]); prev = s }
    const go = () => { new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setInterval(tick, 100); tick() }
    document.body ? go() : document.addEventListener("DOMContentLoaded", go)
  })
  p.t0 = Date.now()
  await page.goto(JOIN_URL)
  phones.push(p)
  return p
}
function onPhone(p, k, v) {
  p.st[k] = v
  const now = Date.now()
  if (k === "name" && v && v !== "…" && p.joinMs === null) { p.joinMs = now - p.t0; log(`[${p.who}] joined as "${v}" in ${p.joinMs} ms`) }
  if (k === "phase" && v && snap) p.ph.push([`${snap.round}.${snap.beat}.${v}`, now])
  if (k === "screen" && v === "finale") p.finaleAt = now
  if (k === "believe" && v) { p.believed = (p.believed ?? 0) + 1; log(`[${p.who}] phone: "...believes you" shown`); void shot(p.page, `${p.who}-believes-you`) }
  if (k === "vite" && v) fail("L5/L12", `${p.who}: Vite error overlay on the phone`)
  if (k === "link" && v && v !== "live") { log(`[${p.who}] link ${v}`); if (kill?.at && now - kill.at < 30000) (p.drops ??= []).push(now - kill.at) }
  if (k === "screen" && v === "reveal" && snap) {
    const key = `${snap.round}.${snap.beat}`
    const rAt = now
    const lt = setInterval(() => { if (p.st.reveal && p.st.reveal !== "none") { p.vLat = (p.vLat ?? []); p.vLat.push(Date.now() - rAt); clearInterval(lt) } }, 20)
    setTimeout(() => clearInterval(lt), 3000)
    setTimeout(() => {
      const kind = p.st.reveal
      const t = truth.get(key)?.get(p.id)
      p.lastKind = kind
      p.verdicts.push({ key, kind, house: t ? (t.caught ? "caught" : "not caught") : "?" })
    }, 2500)
  }
}
let tapShot = false
async function hide(p, lure) {
  await wait(600 + Math.random() * 3000)
  if (!snap || snap.phase !== "hide" || p.st.screen === "out" || p.lastKind === "caught") { p.lastKind = ""; return }
  const rs = snap.rooms.slice().sort(() => Math.random() - 0.5)
  try {
    if (lure) try {
      const pg = p.page; const target = snap.rooms.slice().sort((a, b) => a.count - b.count)[0].id
      const vis = async (sel) => pg.locator(sel).first().isVisible().catch(() => false)
      if (await vis(".hr-lie-btn")) { await pg.locator(".hr-lie-btn").first().tap({ timeout: 1500 }); await wait(350) }
      else if (await vis(".hr-lure-chip")) { await pg.locator(".hr-lure-chip").first().tap({ timeout: 1500 }); await wait(350) }
      if (await vis(".hr-lie-hunter")) { await pg.locator(".hr-lie-hunter").nth(Math.floor(Math.random() * 4)).tap({ timeout: 1500 }); await wait(350) }
      const chip = (await vis(`.hr-lie-chip[data-room="${target}"]`)) ? `.hr-lie-chip[data-room="${target}"]` : `.hr-room[data-room="${target}"]`
      await pg.locator(chip).first().tap({ timeout: 1500 }); log(`[${p.who}] LIE -> ${target} via ${chip.split("[")[0]}`); await wait(900)
      void shot(pg, `${p.who}-after-lie-b${snap?.beat}`)
      if (await vis(".hr-lie-close")) { await pg.locator(".hr-lie-close").first().tap({ timeout: 800 }).catch(() => {}); await wait(200) }
    } catch (e) { void shot(p.page, `${p.who}-lie-failed`); fail("L6", `${p.who}: lie flow failed b${snap?.beat}: ${String(e).split("\n")[0].slice(0, 90)}`) }
    await p.page.locator(`.hr-room[data-room="${rs[0].id}"]`).first().tap({ timeout: 1500 }); p.picks++
  } catch (e) { if (!tapShot) { tapShot = true; void p.page.screenshot({ path: `${DIR}/tapfail-${p.who}.jpg`, type: "jpeg", quality: 50, scale: "css" }).catch(() => {}) } fail("L6", `${p.who}: tap a room failed in hide b${snap?.beat} (screen ${p.st.screen}, mode lure=${lure}): ${String(e).split("\n")[0].slice(0, 100)}`) }
}

// 2.9: lie DURING the debate (hunting + 3 s) and check the vote follows
let debate = null
async function debateLie(p) {
  if (!p || snap?.phase !== "hunting") return
  const pg = p.page; const target = snap.rooms.slice().sort((a, b) => a.count - b.count)[0].id
  const vis = async (sel) => pg.locator(sel).first().isVisible().catch(() => false)
  debate = { who: p.name, target, at: Date.now(), key: `${snap.round}.${snap.beat}`, ok: false }
  try {
    if (await vis(".hr-lie-btn")) { await pg.locator(".hr-lie-btn").first().tap({ timeout: 1500 }); await wait(300) }
    if (await vis(".hr-lie-hunter")) { await pg.locator(".hr-lie-hunter").first().tap({ timeout: 1500 }); await wait(300) }
    await pg.locator(`.hr-lie-chip[data-room="${target}"]`).first().tap({ timeout: 1500 })
    debate.ok = true; log(`[${p.who}] DEBATE LIE (hunting+3 s) -> ${target}`)
  } catch (e) { log(`[${p.who}] debate lie not possible: ${String(e).split("\n")[0].slice(0, 90)}`) }
  await wait(700); void shot(pg, `${p.who}-debate-lie`)
}

// ---------- the show ----------
function onHouse(s) {
  if (!showStarted) return
  if (s.phase === "intro" && !shotPlan.has("intro")) { shotPlan.add("intro"); setTimeout(() => void shot(stage, "stage-intro"), 4000) }
  if (s.phase === "hide") { for (const p of phones) void hide(p, (s.beat === 1 || s.beat === 2) && p.who === "i390"); if (s.beat === 1) setTimeout(() => void shot(phones[0].page, "SE-hide-b1"), 3500) }
  if (s.phase === "hunting" && s.beat === 1) setTimeout(() => void shot(stage, "stage-cabal-b1-3s"), 3000)
  if (argv.includes("--debate") && s.phase === "hunting" && s.beat === 2) setTimeout(() => void debateLie(phones.find((p) => p.who === "i390")), 3000)
  if (s.phase === "hunting" && s.beat === 2) { setTimeout(() => void shot(stage, "stage-cabal-b2-5s"), 5000); setTimeout(() => void shot(stage, "stage-cabal-b2-8s-votes"), 8300) }
  if (s.phase === "reveal" && s.beat === 2) setTimeout(() => void shot(phones[1].page, "i390-reveal-b2-lure"), 2600)
  if (s.phase === "reveal" && s.beat === 1) setTimeout(() => void shot(phones[3].page, "A412-reveal-b1"), 1200)
  if (s.phase === "hide" && s.beat === 3 && !kill) setTimeout(doKill, 300)
  if (s.phase === "finale") { setTimeout(() => { void shot(stage, "stage-finale-1s"); void shot(phones[1].page, "i390-finale") }, 1500); setTimeout(() => { void shot(stage, "stage-finale-6s"); void shot(phones[4].page, "A360-finale") }, 6000) }
}
function doKill() {
  const f = [`${ROOT}/release/current/logs/house-executor-7300.pid`, `${ROOT}/logs/house-executor-7300.pid`, `${ROOT}/logs/house-executor.pid`].find((x) => existsSync(x)) ?? "none"
  if (!existsSync(f)) { kill = { skipped: "logs/house-executor-7300.pid missing" }; log("KILL skipped: logs/house-executor.pid missing (DEMO: skip the kill beat)"); return }
  const pid = readFileSync(f, "utf8").trim().split(/\s+/)[0]
  let cmd = ""
  try { cmd = execFileSync("ps", ["-o", "command=", "-p", pid]).toString().trim() } catch {}
  if (!/^\d+$/.test(pid) || !cmd) { kill = { skipped: `pid ${pid} not alive` }; fail("L2/L5", `house-executor.pid ${pid} is not a live process`); return }
  kill = { pid, file: f, at: Date.now(), cmd: cmd.slice(0, 80), pre: { beat: snap.beat, phase: snap.phase, endsAt: snap.endsAt } }
  log(`KILL -9 ${pid} (${kill.cmd})`)
  try { process.kill(Number(pid), "SIGKILL") } catch (e) { log(`kill failed ${e}`) }
  setTimeout(() => void shot(stage, "stage-kill"), 900)
  const w = setInterval(() => {
    if (snap?.restoredAt && snap.restoredAt >= kill.at - 50) { clearInterval(w); kill.backMs = Date.now() - kill.at; kill.lastRecoveryMs = snap.lastRecoveryMs; kill.post = { beat: snap.beat, phase: snap.phase, endsAt: snap.endsAt }; log(`HOUSE BACK ${kill.backMs} ms (lastRecoveryMs ${snap.lastRecoveryMs})`) }
    if (Date.now() - kill.at > 30000) { clearInterval(w); kill.backMs ??= null }
  }, 50)
}

// ramp: bots first (20 s), phones "scan" during it
await wait(4000)
for (const spec of PHONES) { void openPhone(spec); await wait(700) }
await wait(14000)
await shot(phones[0]?.page, "SE-joined")
for (const p of phones) if (p.joinMs === null) fail("L6/L5", `${p.who} (${p.w}x${p.h}) never showed its name within ~14 s`)
log(`before H: online ${snap?.counters.online} humans ${snap?.counters.humans} bots ${snap?.counters.bots} phase ${snap?.phase}`)
if (snap?.phase !== "lobby") fail("L2", `House not in lobby after S,R (phase ${snap?.phase})`)
showStarted = true
H0 = Date.now()
await stage.keyboard.press("h")
log("KEY H (start)")

// fps sampling
const fps = []
const fpsTimer = setInterval(async () => { try { const t = await stage.locator(".st-fps").textContent({ timeout: 500 }); const n = Number(/(\d+) fps/.exec(t ?? "")?.[1]); if (n) fps.push(n) } catch {} }, 2000)
// stage visuals the show relies on: #hunt chat, hunter leans, revive card, finale title
const vis = { cabal: {}, swayOnStage: false, feedMax: 0, feedAtH: -1, leansMax: 0, revive: "", finaleText: "", finaleClass: "" }
const visTimer = setInterval(async () => {
  try {
    const v = await stage.evaluate(() => ({
      feed: document.querySelectorAll(".fd-list > *").length,
      leans: document.querySelectorAll(".st-leans > *").length,
      revive: document.querySelector(".st-revive.show")?.textContent ?? "",
      finText: (document.querySelector(".st-finale")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      finClass: document.querySelector(".st-finale")?.className ?? "",
      big: [...document.querySelectorAll("body *")].filter((e) => { const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3); if (!own) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return parseFloat(cs.fontSize) >= 56 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) }).map((e) => e.textContent.trim().slice(0, 90)),
      swayText: /swayed by/i.test(document.body.textContent ?? ""),
    }))
    if (vis.feedAtH < 0) vis.feedAtH = v.feed
    if (snap?.phase === "hunting") { const bk = `${snap.round}.${snap.beat}`; const set = (vis.cabal[bk] ??= new Set()); for (const t of v.big) set.add(t); if (v.swayText) vis.swayOnStage = true }
    vis.feedMax = Math.max(vis.feedMax, v.feed); vis.leansMax = Math.max(vis.leansMax, v.leans)
    if (v.revive && !vis.revive) { vis.revive = v.revive; log(`stage revive card: "${v.revive}"`); void shot(stage, "stage-revive") }
    if (snap?.phase === "finale" && v.finText && !vis.finaleText) { vis.finaleText = v.finText; vis.finaleClass = v.finClass; log(`stage finale: "${v.finText}" (${v.finClass})`) }
  } catch {}
}, 400)
// stage error toasts
const toasts = new Set()
const toastTimer = setInterval(async () => { try { const t = await stage.locator(".st-toast.err.show").textContent({ timeout: 300 }); if (t) toasts.add(t) } catch {} }, 1000)

const deadline = H0 + SECS * 1000
let F = false
while (Date.now() < deadline) {
  await wait(250)
  if (!F && Date.now() - H0 > 125000 && snap?.phase === "reveal") { F = true; log("running late: KEY F"); await stage.keyboard.press("f") }
  if (snap?.phase === "finale" && phones.every((p) => p.finaleAt) && Date.now() - Math.max(...phones.map((p) => p.finaleAt)) > 7000) break
}
clearInterval(fpsTimer); clearInterval(toastTimer); clearInterval(visTimer)
const finalWinner = snap?.winner
const finaleAtHouse = [...housePhaseAt.entries()].find(([k, t]) => k.endsWith(".finale") && t >= H0)?.[1]

// ---------- metrics ----------
const stagePh = new Map(await stage.evaluate(() => window.__ph))
const skews = []
const stageList = [...stagePh.entries()]
const skewBad = {}
for (const p of phones) for (const [k, at] of p.ph) { const name = k.split(".")[2]; if (name === "lobby") continue; let best = null; for (const [sk, st] of stageList) if (sk.endsWith("." + name) && (best === null || Math.abs(at - st) < Math.abs(best))) best = at - st; if (best !== null && Math.abs(best) < 20000) { skews.push(best); if (Math.abs(best) > 500) (skewBad[k] ??= []).push(`${p.who}:${best}`) } else (p.miss ??= []).push(name) }
for (const p of phones) if (p.miss?.length) fail("L7", `${p.who}: ${p.miss.length} phone phases (${p.miss.join(",")}) never reached the stage page within 20 s`)
const absSkew = skews.map(Math.abs)
const verdicts = phones.flatMap((p) => p.verdicts.map((v) => ({ who: p.who, ...v })))
const checked = verdicts.filter((v) => v.house !== "?" && v.kind)
// "none" = sitting out after a catch: the House still flags the ghost out (bit0), so none <-> caught is a match
const wrong = checked.filter((v) => (v.kind === "caught" || v.kind === "none" || v.kind === "noseat") !== (v.house === "caught"))
for (const w of wrong) fail("L2/L6", `${w.who} beat ${w.key}: phone says ${w.kind}, House says ${w.house}`)
const finTimes = phones.map((p) => p.finaleAt).filter(Boolean)
const finSkew = finTimes.length ? Math.max(...finTimes) - Math.min(...finTimes) : null
if (finTimes.length < phones.length) fail("L6", `finale reached ${finTimes.length}/${phones.length} phones`)
if (finSkew !== null && finSkew > 500) fail("L6/L2", `finale skew across phones ${finSkew} ms (> 500)`)
const finKey = [...housePhaseAt.keys()].find((k) => k.endsWith(".finale") && housePhaseAt.get(k) >= H0)
const stageFin = finKey ? stagePh.get(finKey) : undefined
if (finKey && !stageFin) fail("L7", "the stage page never received the finale snapshot")
const beatsSeen = [...housePhaseAt.keys()].filter((k) => k.endsWith(".reveal")).length
if (!finaleAtHouse) fail("L2", `no finale within ${SECS} s of H (reveals seen ${beatsSeen})`)
if (pct(absSkew, 0.95) > 500) fail("L7/L6", `phase skew stage vs phones p95 ${pct(absSkew, 0.95)} ms (> 500)`)
for (const p of phones) { const e = p.errors.filter((t) => !/favicon/.test(t)); if (e.length) log(`[${p.who}] console errors ${e.length}: ${e.slice(0, 3).join(" | ")}`) }
if (audioErr.length) fail("L10", `audio console errors x${audioErr.length}: ${audioErr[0]}`)
for (const t of toasts) fail("L7", `stage error toast: ${t}`)
const med = (a) => pct(a, 0.5)
const joins = phones.map((p) => `${p.who}:${p.joinMs ?? "x"}`).join(" ")
const end = finaleAtHouse ? Math.round((finaleAtHouse - H0) / 100) / 10 : null
const peak = { online: snap?.counters.online, humans: snap?.counters.humans, bots: snap?.counters.bots }
await wait(2000)
try { bots.kill("SIGTERM") } catch {}
stopTruth = true
await browser.close()

const killCell = kill?.skipped ? `skipped (${kill.skipped})` : kill?.backMs != null ? `${(kill.backMs / 1000).toFixed(1)} s` : kill ? "NOT BACK 30 s" : "not reached"
if (kill && !kill.skipped && (kill.backMs == null || kill.backMs > 5000)) fail("L2/L5", `kill -9 recovery ${killCell} (target < 5 s)`)
for (const p of phones) if (p.drops?.length) fail("L2/L5/L6", `${p.who}: link dropped after the executor kill (+${p.drops[0]} ms); phones should stay connected`)
if (finalWinner !== "ghosts") fail("L2/BALANCE", `finale winner ${finalWinner} (possessed max ${maxPoss}); DEMO close wants the red ghosts finale`)
if (kill && !kill.skipped && !/Back in [\d.]+ s/.test(vis.revive)) fail("L7", `revive card "${vis.revive || "never shown"}" has no "Back in X s"`)
if (finaleAtHouse && !vis.finaleText) fail("L7", "stage finale shows no title text")
if (vis.feedMax - Math.max(0, vis.feedAtH) < 4) fail("L3/L7", `#hunt chat barely filled: ${vis.feedAtH} -> ${vis.feedMax} lines`)
if (vis.leansMax === 0) fail("L7/L3", "no hunter lean eyes seen on any room during hide")
// contract timing: each phase's House duration vs TIMING
const seq = [...housePhaseAt.entries()].filter(([, t]) => t >= H0 - 500).sort((a, b) => a[1] - b[1])
const timing = []
for (let i = 0; i + 1 < seq.length; i++) {
  const [k, t] = seq[i]; const [, , ph] = k.split("."); const beat = Number(k.split(".")[1])
  const want = ph === "intro" ? SPEC.intro : ph === "hide" ? (beat === 1 ? SPEC.hide1 : SPEC.hide) : ph === "hunting" ? SPEC.hunting : ph === "reveal" ? SPEC.reveal : null
  if (want === null) continue
  const got = seq[i + 1][1] - t
  timing.push(`${k} ${(got / 1000).toFixed(1)}/${want / 1000}`)
  if (Math.abs(got - want) > 1000 && !(kill?.at && Math.abs(kill.at - t) < want + 2000) && !(F && seq[i + 1][0].endsWith(".finale"))) fail("L2", `phase ${k} lasted ${(got / 1000).toFixed(1)} s, contract ${want / 1000} s`)
}
log(`timing (got/spec s): ${timing.join(" | ")}`)
const huntKeys = [...housePhaseAt.keys()].filter((k) => k.endsWith(".hunting") && housePhaseAt.get(k) >= H0).map((k) => k.split(".").slice(0, 2).join("."))
for (const bk of huntKeys) { const n = vis.cabal[bk]?.size ?? 0; log(`cabal ${bk}: ${n} big (>=56px) lines: ${[...(vis.cabal[bk] ?? [])].slice(0, 6).join(" / ")}`); if (n < 2) fail("L7/CABAL", `beat ${bk} hunting: ${n} big (>=56 px) text lines on stage, cabal expects 3-4 readable lines`) }
if (!swayed.size) fail("L2/L3/CABAL", "no hunter swayedBy in the House snapshot (i390 lied in beats 1-2)")
if (swayed.size && !vis.swayOnStage) fail("L7/CABAL", `House says swayed (${[...swayed.values()].join(",")}) but the stage never showed "swayed by"`)
const liar = phones.find((p) => p.who === "i390")
if (swayed.size && liar && ![...swayed.values()].includes(liar.name) ) log(`note: swayed names ${[...swayed.values()].join(",")} != liar ${liar.name}`)
if (liar && swayed.size && [...swayed.values()].includes(liar.name) && !liar.believed) fail("L6/CABAL", `${liar.name} swayed a hunter but the phone never said "... believes you"`)
if (!convSeen) fail("L2/CABAL", "no hunter conviction in any snapshot (meters have no data)")
if (debate) {
  const v = votesAt.get(debate.key) ?? []
  const followed = v.includes(debate.target)
  const swayedLiar = [...swayed.entries()].some(([k, n]) => k.startsWith(debate.key) && String(n).includes(debate.who))
  log(`debate lie ${debate.ok ? "sent" : "NOT SENT"} by ${debate.who} -> ${debate.target}; reveal votes ${v.join(",")}; vote followed ${followed}; swayedBy names liar ${swayedLiar}`)
  if (!debate.ok) fail("L6/2.9", "phone could not lie during the debate (hunting+3 s)")
  else if (!followed) fail("L2/L3/2.9", `debate lie -> ${debate.target} at hunting+3 s; no hunter voted ${debate.target} (votes ${v.join(",")})`)
}
const verdict = fails.length ? "FAIL" : "PASS"
const row = `| ${RUN} | ${verdict} | QR ${qrUrl === EXPECT_QR ? "ok" : "BAD"} | join ms ${joins} | skew p50/p95/max ${med(absSkew)}/${pct(absSkew, 0.95)}/${absSkew.length ? Math.max(...absSkew) : "-"} ms (n ${absSkew.length}) | verdicts ${checked.length - wrong.length}/${checked.length} | verdict lat p50/max ${med(phones.flatMap((p) => p.vLat ?? []))}/${Math.max(0, ...phones.flatMap((p) => p.vLat ?? []))} ms | audio err ${audioErr.length} | stage fps med/min ${med(fps)}/${fps.length ? Math.min(...fps) : "-"} (headless swiftshader) | kill ${killCell} | finale ${finTimes.length}/6 skew ${finSkew} ms, house ${stageFin && finaleAtHouse ? stageFin - finaleAtHouse : "-"} ms | H->finale ${end} s | winner house ${finalWinner} phones ${[...new Set(phones.map((p) => p.st.finale))].join("/")} | possessed max ${maxPoss} | revive "${vis.revive}" | finale "${vis.finaleText.slice(0, 40)}" | cabal lines ${huntKeys.map((k) => vis.cabal[k]?.size ?? 0).join("/")} | swayed ${swayed.size} stage ${vis.swayOnStage} phone ${liar?.believed ?? 0} | chat ${vis.feedAtH}->${vis.feedMax} | leans max ${vis.leansMax} | peak online ${peak.online} (h ${peak.humans} b ${peak.bots}) | stage errors ${stageErrors} |`
writeFileSync(`${DIR}/metrics.md`, row + "\n\n" + fails.map((f) => `- [${f.lane}] ${f.what}`).join("\n") + "\n")
for (const [k, v] of Object.entries(skewBad)) log(`skew > 500 ms at ${k}: ${v.join(" ")}`)
writeFileSync(`${DIR}/data.json`, JSON.stringify({ skewBad, fails, kill, joins, fps, skews, verdicts, audioErr, stagePh: [...stagePh], house: [...housePhaseAt] }, null, 1))
log(row)
log(`${verdict}: ${fails.length} failures`)
// keep only the last 3 runs
const runs = readdirSync(`${ROOT}/showrun/runs`).filter((d) => /^\d{6}$/.test(d)).sort()
for (const d of runs.slice(0, -3)) rmSync(`${ROOT}/showrun/runs/${d}`, { recursive: true, force: true })
process.exit(0)
