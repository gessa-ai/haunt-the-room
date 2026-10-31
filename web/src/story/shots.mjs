// L20 smoke by real use (the lane's one script): plays the full reel at 1920x1080 and grabs one frame per slide
// (mid-slide, caption typed) into web/src/story/shots/, plus the 12 s cut and a skip check.
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/story/shots.mjs
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "x.js") : import.meta.url)
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://127.0.0.1:5370"
const SHOTS = path.join(here, "shots")
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ channel: "chromium", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const logs = []
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))

const ONLY_EPILOGUE = process.argv[2] === "epilogue"
// L20b prelude: the short cut ends with it (slides 05-10 of 10): ad, four hires, the table
if (process.argv[2] === "ending") {
  for (const [w, marks] of [["ghosts", [1900, 4000, 6100, 8200, 10800, 15000]], ["hunters", [3800, 6200, 10000]]]) {
    await page.goto(`${BASE}/src/story/dev.html?play=${w}`)
    await page.waitForSelector(".end", { timeout: 60_000 }) // time from the ending's first frame, not the page load
    const s0 = Date.now()
    for (const m of marks) {
      await page.waitForTimeout(Math.max(0, m - (Date.now() - s0)))
      await page.screenshot({ path: path.join(SHOTS, `ending-${w}-${m}.png`) })
    }
    await page.waitForFunction(() => document.getElementById("log")?.textContent?.includes("onDone"), null, { timeout: 20_000, polling: 50 })
    console.log(`ending ${w} ms:`, Date.now() - s0)
  }
  console.log(logs.filter((l) => /error|story/i.test(l)).join("\n"))
  await browser.close()
  process.exit(0)
}
if (process.argv[2] === "hire") {
  await page.goto(`${BASE}/src/story/dev.html?play=short`)
  const at = { 5: [1500], 6: [300, 800], 7: [800], 8: [800], 9: [800], 10: [250, 1350] }
  const t0 = Date.now()
  let started = 0
  for (const [n, waits] of Object.entries(at)) {
    await page.waitForFunction((k) => document.querySelector(".story .slide")?.textContent?.startsWith(String(k).padStart(2, "0") + " / 10"), Number(n), { timeout: 30_000 })
    const s0 = Date.now()
    if (n === "5") started = s0
    for (const w of waits) {
      await page.waitForTimeout(Math.max(0, w - (Date.now() - s0)))
      await page.screenshot({ path: path.join(SHOTS, `hire-${n}-${w}.png`) })
    }
  }
  await page.waitForFunction(() => document.getElementById("log")?.textContent?.includes("onDone"), null, { timeout: 10_000 })
  console.log("prelude ms (ad start -> onDone):", Date.now() - started, "total", Date.now() - t0)
  console.log(logs.filter((l) => /error|story/i.test(l)).join("\n"))
  await browser.close()
  process.exit(0)
}
if (!ONLY_EPILOGUE) {
await page.goto(`${BASE}/src/story/dev.html?play=full`)
await page.waitForFunction(() => document.querySelector(".story .slide")?.textContent?.startsWith("01"))
for (let i = 1; i <= 7; i++) {
  await page.waitForFunction((n) => document.querySelector(".story .slide")?.textContent?.startsWith(String(n).padStart(2, "0")), i)
  await page.waitForTimeout(2700)
  await page.screenshot({ path: path.join(SHOTS, `slide-${i}.png`) })
}
await page.waitForFunction(() => document.getElementById("log")?.textContent?.includes("onDone"), null, { timeout: 6000 }).catch(() => {})
const fullEnded = await page.evaluate(() => !document.querySelector(".story") && document.getElementById("log")?.textContent)
console.log("full reel ended by itself:", fullEnded)

// skip: any key ends it at once and calls onDone
await page.goto(`${BASE}/src/story/dev.html?play=full`)
await page.waitForTimeout(2000)
await page.keyboard.press("Escape")
await page.waitForTimeout(100)
console.log("skip:", await page.evaluate(() => (document.querySelector(".story") ? "STILL PLAYING" : document.getElementById("log")?.textContent)))

// lobby loop: survives past the end, H cuts it
await page.goto(`${BASE}/src/story/dev.html?play=loop`)
await page.waitForTimeout(26_500)
console.log("loop alive at 26.5 s:", await page.evaluate(() => document.querySelector(".story .slide")?.textContent))
await page.screenshot({ path: path.join(SHOTS, "loop-with-qr.png") })
await page.keyboard.press("h")
await page.waitForTimeout(100)
console.log("H:", await page.evaluate(() => (document.querySelector(".story") ? "STILL PLAYING" : document.getElementById("log")?.textContent)))

// 12 s cut
await page.goto(`${BASE}/src/story/dev.html?play=short`)
const s0 = Date.now()
await page.waitForFunction(() => document.getElementById("log")?.textContent?.includes("onDone"), null, { timeout: 20_000 })
console.log("short cut length ms (incl. load):", Date.now() - s0)
}

// epilogues: two slides each, then onDone
for (const w of ["ghosts", "hunters"]) {
  await page.goto(`${BASE}/src/story/dev.html?play=${w}`)
  await page.waitForFunction(() => document.querySelector(".story .slide")?.textContent?.startsWith("01"))
  const e0 = Date.now()
  for (let i = 1; i <= 2; i++) {
    await page.waitForFunction((n) => document.querySelector(".story .slide")?.textContent?.startsWith(String(n).padStart(2, "0")), i)
    await page.waitForTimeout(2300)
    await page.screenshot({ path: path.join(SHOTS, `epilogue-${w}-${i}.png`) })
  }
  await page.waitForFunction(() => document.getElementById("log")?.textContent?.includes("onDone"), null, { timeout: 8000 })
  console.log(`epilogue ${w}: onDone after ${Date.now() - e0} ms`)
}

console.log(logs.filter((l) => l.includes("story") || l.includes("error")).join("\n"))
await browser.close()
