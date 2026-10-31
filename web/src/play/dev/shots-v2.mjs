// L6b v2 shots (real use vs the mock house, 390x844): hide, join, lie sheet 1+2, lie sent, hunting (no room), reveal, safe/believed, found.
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, "x.js"))
const { chromium } = require("playwright")
const BASE = process.env.MOCK ?? "http://localhost:5362"
const dev = (cmd) => fetch(`${BASE}/dev/${cmd}`, { method: "POST" }).then((r) => r.json())
const state = () => fetch(`${BASE}/dev/state`).then((r) => r.json())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const browser = await chromium.launch({ args: ["--mute-audio"] })
const errors = []
const phone = async (l) => {
  const page = await (await browser.newContext(PHONE)).newPage()
  page.on("pageerror", (e) => errors.push(`${l}: ${e.message}`))
  await page.goto(`${BASE}/p`)
  return page
}
const GAME = /GeistPixel|IM Fell|Pirata|Cinzel/
const audit = (p, n) => p.evaluate((src) => {
  const re = new RegExp(src)
  const bad = new Set()
  for (const el of document.querySelectorAll(".hr-root *")) {
    if (!el.offsetParent || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue
    const ff = getComputedStyle(el).fontFamily
    if (!re.test(ff.split(",")[0])) bad.add(`${el.className}: ${ff.split(",")[0]}`)
  }
  return [...bad]
}, GAME.source).then((b) => b.length && console.log(`FONT ${n}:`, b.join(" | ")))
const shot = (p, n) => audit(p, n).then(() => p.screenshot({ path: path.join(here, "shots", `v2-${n}.png`) }).then(() => console.log(`v2-${n}.png`)))
const toPhase = async (want) => { for (let i = 0; i < 12 && (await state()).phase.phase !== want; i++) await dev("next"), await wait(150) }
await dev("hold/1"); await dev("lobby")
const A = await phone("A"), B = await phone("B"), C = await phone("C")
await wait(2500)
await dev("start"); await toPhase("hide"); await wait(800)
await A.click('.hr-room[data-room="attic"]'); await wait(700)
await shot(A, "01-hide")
await B.click('.hr-room[data-room="attic"]'); await wait(250)
await shot(A, "02-someone-joins")
await B.click('.hr-room[data-room="nursery"]'); await wait(400)
await A.click(".hr-lie-btn"); await wait(300); await shot(A, "03-lie-step1")
await A.click('.hr-lie-hunter[data-hunter="medium"]'); await wait(300); await shot(A, "04-lie-step2")
await A.click('.hr-lie-chip[data-room="chapel"]'); await wait(900); await shot(A, "05-lie-sent")
await dev("sweep?rooms=chapel,nursery")
await dev("next"); await wait(2400)
await shot(C, "06-hunting-no-room")
await C.click(".hr-lie-btn"); await wait(250); await C.click('.hr-lie-hunter[data-hunter="priest"]'); await wait(250)
await shot(C, "06b-hunting-lie-step2")
await C.click('.hr-lie-chip[data-room="crypt"]'); await wait(800); await shot(C, "06c-hunting-lie-weighing")
await wait(1800); await shot(C, "06d-hunting-lie-heard"); await shot(A, "06e-hunting-in-room-sent")
await dev("next"); await wait(450)
await shot(A, "07-reveal-moment-A"); await shot(B, "08-found-moment")
await wait(2600)
await shot(A, "09-believed-safe-summary"); await shot(B, "10-found-summary")
await dev("finale?winner=ghosts"); await wait(1500); await shot(A, "11-finale")
await dev("hold/0"); await wait(16500); await shot(A, "12-after-finale")
console.log("fonts loaded:", await A.evaluate(() => ["GeistPixel", "IM Fell English", "Pirata One"].map((f) => `${f}=${document.fonts.check(`16px "${f}"`)}`).join(" ")))
console.log(errors.length ? errors : "0 page errors")
await browser.close()
