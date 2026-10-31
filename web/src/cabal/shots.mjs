// L7b smoke by real use: the cabal demo beat at 1920x1080, four moments -> web/src/cabal/shots/*.png
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/cabal/shots.mjs
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? here, "x.js"))
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://127.0.0.1:5370"
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)))
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(`${BASE}/stage?fake=lobby&cabal=demo`)
await page.waitForSelector(".cb.on", { timeout: 20000 })
await page.waitForTimeout(300)
// wait for a fresh loop start so the moments line up
await page.waitForSelector(".cb.on", { state: "hidden", timeout: 15000 })
await page.waitForSelector(".cb.on", { timeout: 15000 })
const line = (n) => (document.querySelector(".cb-line")?.textContent ?? "").length > n
for (const [name, ready] of [
  ["1-speaker", () => !!document.querySelector(".cb-seat.speaking") && (document.querySelector(".cap-box:last-child .cap-typed")?.textContent ?? "").length > 34],
  ["2-whisper", () => (document.querySelector(".cap-box.cap-whisper:last-child .cap-typed")?.textContent ?? "").length > 30],
  ["3-swing", () => !!document.querySelector(".cb-seat.swayed")],
  ["3b-stack", () => document.querySelectorAll(".cap-box:not(.cap-out)").length >= 2 && (document.querySelector(".cap-box:last-child .cap-typed")?.textContent ?? "").length > 40],
  ["3c-heat-whisper2", () => document.querySelectorAll(".cap-box.cap-whisper:not(.cap-out)").length >= 1 && /Chapel/.test(document.querySelector(".cap-box.cap-whisper:last-of-type .cap-typed")?.textContent ?? "") && (document.querySelector(".cap-box.cap-whisper:last-of-type .cap-typed")?.textContent ?? "").length > 20],
  ["4-vote", () => document.querySelectorAll(".cb.on .cb-seat.voted").length >= 4],
  ["5-burn", () => document.querySelectorAll(".cb.on .cb-mark").length >= 6],
]) {
  await page.waitForFunction(ready, null, { timeout: 30000, polling: 50 })
  if (name === "5-burn") await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(here, "shots", `${name}.png`) })
  console.log("shot", name)
}
void line
await browser.close()
