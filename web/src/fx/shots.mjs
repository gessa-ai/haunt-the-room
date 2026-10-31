// L14 smoke by real use (the lane's one script): screenshots of the dither lab, before/after.
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/fx/shots.mjs [name...]     (BASE default http://localhost:3300)
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? here, "x.js"))
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://localhost:3300"
const SHOTS = path.join(here, "shots")
mkdirSync(SHOTS, { recursive: true })

// [name, query, viewport, wait ms]: each shoots <name>-before.png (fx off) then <name>-after.png in the SAME
// page and moment (key D toggles), so the live state is identical in both.
const PLAN = [
  ["stage-hide", "fake=hide", [1920, 1080], 4000],
  ["stage-intro", "fake=intro", [1920, 1080], 1500],
  ["stage-reveal", "fake=reveal", [1920, 1080], 2300],
  ["stage-finale", "fake=finale", [1920, 1080], 4000],
  ["stage-intro-floods", "fake=intro&floods=1", [1920, 1080], 1500],
  ["stage-finale-floods", "fake=finale&floods=1", [1920, 1080], 4000],
  ["phone", "view=phone", [390, 844], 16000],
  ["phone-house", "view=phone", [390, 844], 30000],
]
const only = process.argv.slice(2)
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
})
let bad = 0
for (const [name, query, [w, h], wait] of PLAN) {
  if (only.length && !only.includes(name)) continue
  const phone = w < 600
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone })
  const page = await ctx.newPage()
  const errs = []
  page.on("pageerror", (e) => errs.push(String(e)))
  page.on("console", (m) => m.type() === "error" && !/^(Failed to load resource|Blocked call to navigator.vibrate)/.test(m.text()) && errs.push(m.text()))
  await page.goto(`${BASE}/src/fx/dev.html?${query}&fx=0&lab=0`)
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(SHOTS, `${name}-before.png`) })
  await page.keyboard.press("d")
  await page.waitForTimeout(120)
  const file = path.join(SHOTS, `${name}-after.png`)
  await page.screenshot({ path: file })
  const fx = await page.evaluate(() => window.__fx)
  console.log(name, JSON.stringify(fx), errs.length ? `ERRORS ${errs.slice(0, 3).join(" | ")}` : "ok", file)
  if (errs.length) bad++
  await ctx.close()
}
await browser.close()
process.exit(bad ? 1 : 0)
