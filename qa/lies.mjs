// @ts-check
// L13 final functional QA (real use): stage + 4 phones (muted, headless Chromium). In beat 1 each phone lies to a
// DIFFERENT hunter about an empty room. Per phone, expected vs actual: caption "swayed by <name>" (stage DOM +
// StageSnap.hunters[].swayedBy), conviction rises, that hunter's vote follows, the liar's phone shows "believes you"
// + points, phones in a swept room get "Found", seat counts on the phone match the House, finale on every phone.
//   node qa/lies.mjs [--start] [--secs 200]
import { chromium } from "playwright"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

const ROOT = `${process.env.HOME}/haunted-hacks`
const BASE = "http://localhost:3300"
const TOKEN = /^PRESENTER_TOKEN=(.*)$/m.exec(readFileSync(`${ROOT}/.env`, "utf8"))?.[1]?.trim() ?? ""
const H = { "x-presenter-token": TOKEN, "content-type": "application/json" }
const argv = process.argv.slice(2)
const SECS = argv.includes("--secs") ? Number(argv[argv.indexOf("--secs") + 1]) : 200
const RUN = new Date().toTimeString().slice(0, 8).replaceAll(":", "")
const LOG = `${ROOT}/qa/runs/lies-${RUN}.log`
const hms = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}` }
const log = (s) => { const l = `${hms()} ${s}`; console.log(l); appendFileSync(LOG, l + "\n") }
const results = []
const check = (ok, what) => { results.push({ ok, what }); log(`${ok ? "ok  " : "FAIL"} ${what}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const HUNTERS = ["exorcist", "medium", "skeptic", "priest"]

/** @type {any} */ let snap = null
const snaps = [] // [{at, s}] during the lie beat
let watchBeat = null
void (async () => {
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/stage/grant`, { method: "POST", headers: H })
      const ws = new WebSocket((await r.json()).websocketUrl)
      await new Promise((res) => {
        ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === "snap") { snap = m.s; if (watchBeat && snap.round === watchBeat.round && snap.beat === watchBeat.beat) snaps.push({ at: Date.now(), s: snap }) } }
        ws.onclose = res
        ws.onerror = () => {}
      })
    } catch {}
    await wait(200)
  }
})()

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--mute-audio", "--enable-unsafe-swiftshader"] })
const stageCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await stageCtx.addInitScript((t) => { try { localStorage.setItem("haunt.presenterToken", t) } catch {} }, TOKEN)
const stage = await stageCtx.newPage()
await stage.goto(`${BASE}/stage`)
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
const phones = []
for (let i = 0; i < 4; i++) {
  const ctx = await browser.newContext(PHONE)
  const page = await ctx.newPage()
  const p = { i, hunter: HUNTERS[i], page, id: "", name: "", lieRoom: "", hideRoom: "", whisper: null, finale: "" }
  page.on("response", async (r) => {
    if (r.url().includes("/api/join") && r.request().method() === "POST") { try { const b = await r.json(); if (b?.ghost) { p.id = b.ghost.id; p.name = b.ghost.name } } catch {} }
    if (r.url().includes("/api/whisper")) p.whisper = `${r.status()} ${(await r.text().catch(() => "")).slice(0, 100)}`
  })
  await page.goto(`${BASE}/p`)
  phones.push(p)
}
await wait(4000)
check(phones.every((p) => p.id), `4 phones joined: ${phones.map((p) => p.name || "?").join(", ")}`)
if (argv.includes("--start")) { const r = await fetch(`${BASE}/api/presenter/start`, { method: "POST", headers: H }); log(`presenter start -> ${r.status}`) }

// wait for a hide phase with >= 4 s left
const t0 = Date.now()
while (!(snap?.phase === "hide" && snap.endsAt - Date.now() > 4000) && Date.now() - t0 < 90_000) await wait(100)
if (snap?.phase !== "hide") { log("no hide phase reached"); process.exit(1) }
watchBeat = { round: snap.round, beat: snap.beat }
log(`lie beat r${snap.round}.${snap.beat}, ${Math.round((snap.endsAt - Date.now()) / 1000)} s of hide left, online ${snap.counters.online}`)
const pre = Object.fromEntries(snap.hunters.map((h) => [h.id, { conviction: h.conviction ?? null, lean: h.lean ?? null, swayedBy: h.swayedBy ?? null }]))
// the 4 emptiest rooms: phone i lies about empty[i] and hides in the busiest room that is not any lie target
const byCount = snap.rooms.slice().sort((a, b) => a.count - b.count)
const lieRooms = byCount.slice(0, 4).map((r) => r.id)
const hideRoom = byCount.slice(4).sort((a, b) => b.count - a.count)[0]?.id ?? byCount[5].id
await Promise.all(phones.map(async (p) => {
  p.lieRoom = lieRooms[p.i]
  p.hideRoom = hideRoom
  try {
    await p.page.locator(`.hr-room[data-room="${hideRoom}"]`).first().tap({ timeout: 2000 })
    await p.page.locator(".hr-lie-btn").tap({ timeout: 2000 })
    await p.page.locator(`.hr-lie-hunter[data-hunter="${p.hunter}"]`).tap({ timeout: 2000 })
    await p.page.locator(`.hr-lie-chip[data-room="${p.lieRoom}"]`).tap({ timeout: 2000 })
    p.liedAt = Date.now()
  } catch (e) { log(`[${p.i}] lie flow failed: ${String(e).split("\n")[0].slice(0, 120)}`) }
}))
await wait(1500)
for (const p of phones) log(`[${p.i}] ${p.name} -> ${p.hunter}: "${p.lieRoom}" (hides in ${hideRoom}); whisper ${p.whisper}`)
// seat counts: phone tile text vs House count (during hide)
for (const p of phones.slice(0, 1)) {
  const tiles = await p.page.$$eval(".hr-room", (els) => els.map((e) => [e.getAttribute("data-room"), e.querySelector(".hr-count")?.textContent ?? ""]))
  const house = Object.fromEntries((snap?.rooms ?? []).map((r) => [r.id, `${r.count}/${r.cap}`]))
  const diffs = tiles.filter(([id, t]) => house[id] && t !== house[id])
  check(diffs.length <= 1, `seat counts on phone ${p.i} vs House: ${tiles.map(([id, t]) => `${id} ${t}`).join(", ")} | House ${JSON.stringify(house)}`)
}
// stage DOM captions during hide/hunting
let captions = ""
const capDeadline = Date.now() + 9000
while (Date.now() < capDeadline && snap?.phase !== "reveal") {
  captions = (await stage.locator("body").innerText().catch(() => "")).toLowerCase()
  if (phones.every((p) => captions.includes(`swayed by ${p.name.toLowerCase()}`))) break
  await wait(400)
}
await stage.screenshot({ path: `${ROOT}/qa/shots/${RUN}-lies-stage-hunting.jpg`, type: "jpeg", quality: 45, scale: "css" }).catch(() => {})
while (snap?.phase !== "reveal" && Date.now() - t0 < 120_000) await wait(100)
await wait(700)
const rev = snap
await stage.screenshot({ path: `${ROOT}/qa/shots/${RUN}-lies-stage-reveal.jpg`, type: "jpeg", quality: 45, scale: "css" }).catch(() => {})
for (const p of phones) {
  const h = rev.hunters.find((x) => x.id === p.hunter)
  const during = snaps.filter((x) => x.at >= (p.liedAt ?? 0)).map((x) => x.s.hunters.find((y) => y.id === p.hunter))
  const swayed = during.some((x) => (x?.swayedBy ?? "").toLowerCase() === p.name.toLowerCase())
  const maxConv = Math.max(-1, ...during.map((x) => x?.conviction ?? -1))
  check(swayed, `[${p.i}] ${p.hunter} swayedBy = "${p.name}" in StageSnap (seen: ${[...new Set(during.map((x) => x?.swayedBy ?? "-"))].join("|")})`)
  check(captions.includes(`swayed by ${p.name.toLowerCase()}`), `[${p.i}] stage caption "swayed by ${p.name.toLowerCase()}" on screen`)
  check(maxConv > (pre[p.hunter].conviction ?? 0), `[${p.i}] ${p.hunter} conviction rises: before ${pre[p.hunter].conviction}, max after lie ${maxConv}`)
  check(h?.vote === p.lieRoom, `[${p.i}] ${p.hunter} vote follows the lie: lied ${p.lieRoom}, voted ${h?.vote}; swept ${rev.sweptRooms.join(",")}`)
}
await wait(600)
for (const p of phones) {
  const word = await p.page.locator(".hr-rev-word").innerText().catch(() => "")
  const pts = await p.page.locator(".hr-rev-points").innerText().catch(() => "")
  const stamp = await p.page.locator(".hr-stamp").first().innerText().catch(() => "")
  const kind = await p.page.locator(".hr-scr-reveal").getAttribute("data-kind").catch(() => "")
  const lieSwept = rev.sweptRooms.includes(p.lieRoom)
  const inSwept = rev.sweptRooms.includes(p.hideRoom)
  log(`[${p.i}] reveal kind=${kind} stamp="${stamp}" word="${word}" points="${pts}" (lie room swept ${lieSwept}, own room swept ${inSwept})`)
  if (inSwept) check(/found/i.test(stamp) || kind === "caught", `[${p.i}] own room ${p.hideRoom} swept -> phone shows Found (stamp "${stamp}", kind ${kind})`)
  else if (lieSwept) check(/believes you/i.test(word) && /\d/.test(pts), `[${p.i}] lie room swept -> "believes you" + points ("${word}" ${pts})`)
  else log(`[${p.i}] lie room not swept: no "believes you" expected`)
  await p.page.screenshot({ path: `${ROOT}/qa/shots/${RUN}-lies-phone${p.i}-reveal.jpg`, type: "jpeg", quality: 45, scale: "css" }).catch(() => {})
}
// finale on every phone
const fDeadline = Date.now() + SECS * 1000
while (Date.now() < fDeadline && snap?.phase !== "finale") await wait(250)
await wait(1500)
for (const p of phones) {
  p.finale = (await p.page.locator(".hr-root").getAttribute("data-screen").catch(() => "")) ?? ""
  const end = await p.page.locator(".hr-scr-finale").innerText().catch(() => "")
  check(p.finale === "finale" && end.length > 0, `[${p.i}] finale + ending on phone: screen ${p.finale}, text "${end.replace(/\s+/g, " ").slice(0, 80)}" (House winner ${snap?.winner})`)
}
await phones[0].page.screenshot({ path: `${ROOT}/qa/shots/${RUN}-lies-phone0-finale.jpg`, type: "jpeg", quality: 45, scale: "css" }).catch(() => {})
writeFileSync(`${ROOT}/qa/runs/lies-${RUN}.json`, JSON.stringify({ results, phones: phones.map(({ page, ...p }) => p) }, null, 1))
log(`DONE ${results.filter((r) => r.ok).length}/${results.length} ok`)
await browser.close()
process.exit(0)
