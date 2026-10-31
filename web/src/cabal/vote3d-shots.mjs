// L26 smoke by real use: vote3d harness at 1920x1080 -> web/src/cabal/shots/vote3d-*.png
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/cabal/vote3d-shots.mjs
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? here, "x.js"))
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://127.0.0.1:5370"
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)))
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(`${BASE}/src/cabal/vote3d.html`)
await page.waitForFunction(() => window.__phase === "idle", null, { timeout: 20000 })
await page.waitForFunction(() => window.__phase === "slam", null, { timeout: 5000, polling: 10 })
await page.waitForTimeout(2*900 + 280)
await page.screenshot({ path: path.join(here, "shots", "vote3d-1-midarc.png") }); console.log("shot midarc")
await page.waitForFunction(() => window.__phase === "pile", null, { timeout: 8000, polling: 10 })
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(here, "shots", "vote3d-2-pile.png") }); console.log("shot pile")
await page.waitForFunction(() => window.__phase === "burn", null, { timeout: 8000, polling: 10 })
await page.waitForTimeout(1400)
await page.screenshot({ path: path.join(here, "shots", "vote3d-3-burn.png") }); console.log("shot burn")
console.log("fps", await page.evaluate(() => window.__fps))
await browser.close()
