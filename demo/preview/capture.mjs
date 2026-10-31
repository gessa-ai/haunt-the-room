// L11 preview capture: records /stage?fake=loop (fake data, no actors) at 1920x1080 for N seconds and takes a
// screenshot every second, so the lobby and reveal stills can be picked afterwards.
//   node demo/preview/capture.mjs <out dir> [seconds=32] [url]
// Uses the Playwright that the QA lane installed (qa/node_modules); nothing is installed here.
import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
const require = createRequire(path.resolve(import.meta.dirname, "../../qa/x.js"))
const { chromium } = require("playwright")
const out = process.argv[2]
const secs = Number(process.argv[3] ?? 32)
const url = process.argv[4] ?? "http://127.0.0.1:5370/stage?fake=loop"
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=metal", "--autoplay-policy=no-user-gesture-required"] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: out, size: { width: 1920, height: 1080 } } })
const page = await ctx.newPage()
page.on("pageerror", (e) => console.error("[page]", e.message))
const t0 = Date.now()
await page.goto(url, { waitUntil: "load" })
for (let i = 0; i < secs; i++) {
  await page.screenshot({ path: path.join(out, `s${String(i).padStart(2, "0")}.jpg`), type: "jpeg", quality: 80 })
  await page.waitForTimeout(Math.max(0, t0 + (i + 1) * 1000 - Date.now()))
}
const video = page.video()
await ctx.close()
await browser.close()
console.log("video", await video.path())
