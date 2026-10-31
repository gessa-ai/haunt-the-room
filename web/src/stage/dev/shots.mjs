// L7 smoke by real use (the lane's one script): opens the projector at 1920x1080 for each state and saves a
// screenshot to dev/shots/<name>.png. Fake House by default; LIVE=1 shoots the real stack at BASE.
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/stage/dev/shots.mjs [name...]
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "x.js") : import.meta.url)
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://127.0.0.1:5370"
// the presenter token for the live stack, read from .env (never printed)
let TOKEN = ""
if (process.env.LIVE) {
  const { readFileSync } = await import("node:fs")
  const env = readFileSync(path.join(here, "../../../../.env"), "utf8")
  TOKEN = (env.match(/^PRESENTER_TOKEN=(.*)$/m)?.[1] ?? "").trim()
}
const SHOTS = path.join(here, "shots")
mkdirSync(SHOTS, { recursive: true })

// [name, query, [ms after load, ...shots]]
const PLAN = [
  ["lobby", "fake=lobby", [9000]],
  ["intro", "fake=intro", [2500, 6000, 9000, 15000]],
  ["hide", "fake=hide", [3500]],
  ["hunting", "fake=hunting", [2500]],
  ["reveal", "fake=reveal", [2300]],
  ["outage", "fake=outage", [6500, 13600]],
  ["finale", "fake=finale", [3500, 9500]],
  ["finale-hunters", "fake=finale-hunters", [3500, 9500]],
  ["feed", "fake=1", [3000], "/feed"],
]
const only = process.argv.slice(2)
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
})
let failed = 0
for (const [name, query, times, route = "/stage"] of process.env.LIVE ? [["live", "", Array.from({ length: 16 }, (_, i) => 4000 + i * 2500)]] : PLAN) {
  if (only.length && !only.includes(name)) continue
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const errors = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(String(e)))
  const url = process.env.LIVE ? `${BASE}${route}?token=${encodeURIComponent(TOKEN)}` : `${BASE}${route}?${query}`
  await page.goto(url, { waitUntil: "load" })
  let last = 0
  for (let i = 0; i < times.length; i++) {
    await page.waitForTimeout(times[i] - last)
    last = times[i]
    const safe = async (fn) => {
      try {
        return await page.evaluate(fn)
      } catch (err) {
        errors.push(`page reloaded mid-shot (another lane's HMR?): ${String(err).slice(0, 80)}`)
        await page.waitForLoadState("load").catch(() => undefined)
        return ""
      }
    }
    const overlay = await safe(() => {
      const o = document.querySelector("vite-error-overlay")
      const msg = o?.shadowRoot?.querySelector(".message")?.textContent ?? ""
      o?.remove()
      return msg
    })
    if (overlay) errors.push(`vite overlay (removed for the shot): ${overlay.slice(0, 160)}`)
    const file = path.join(SHOTS, `${name}${times.length > 1 ? `-${i + 1}` : ""}.png`)
    await page.screenshot({ path: file })
    const fps = await safe(() => `${document.querySelector(".st-fps")?.textContent ?? ""} · ${document.querySelector(".st-clock .digits b")?.textContent ?? ""} ${document.querySelector(".st-big")?.className ?? ""}`)
    console.log(`${name}: ${file} ${fps}`)
  }
  const real = errors.filter((e) => !e.includes("/api/config") && !e.includes("art/"))
  if (real.length) {
    failed++
    console.log(`${name}: console errors:\n  ${real.slice(0, 6).join("\n  ")}`)
  }
  await page.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
