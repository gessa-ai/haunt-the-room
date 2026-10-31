// L16 smoke by real use (the lane's one script): opens /stage3d (dev entry) at 1920x1080 for each beat and
// saves web/src/stage3d/shots/<name>.png, printing fps and page errors.
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/stage3d/shots.mjs [name...]
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "x.js") : import.meta.url)
const { chromium } = require("playwright")
const BASE = process.env.BASE ?? "http://127.0.0.1:5370"
const ROUTE = process.env.ROUTE ?? "/src/stage3d/dev.html"
const SHOTS = path.join(here, "shots")
mkdirSync(SHOTS, { recursive: true })

// [name, query, [ms after load, ...]]
const PLAN = [
  ["intro", "shot=intro", [700, 2200, 3600, 4700, 5600, 6450]],
  ["finale", "shot=finale", [600, 2000, 3400, 5000, 6900]],
  ["finale-hunters", "shot=finale-hunters", [1500, 3200, 5200]],
  ["hide", "fake=hide", [4000]],
  ["hunting", "fake=hunting", [3000]],
  ["reveal", "fake=reveal", [1000, 2500, 3900]],
  ["stage-finale", "fake=finale", [7000]],
  ["lobby", "fake=lobby", [4000]],
]
// LIVE=1: the real House on the integration server (token read from .env, never printed)
if (process.env.LIVE) {
  const { readFileSync } = await import("node:fs")
  const tok = (readFileSync(path.join(here, "../../../.env"), "utf8").match(/^PRESENTER_TOKEN=(.*)$/m)?.[1] ?? "").trim()
  PLAN.splice(0, PLAN.length, ["live", `token=${encodeURIComponent(tok)}`, [6000, 14000]])
}
// PERF=1: HEADED Chromium on the Mac's own display, the loop with 400 ghosts for 30 s at 1080p and 4K;
// prints fps, p99 and worst frame overall and in the 400 ms after each kill-cam cut
if (process.env.PERF) {
  const browser = await chromium.launch({ channel: "chromium", headless: false, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] })
  // 3840x2160 two ways: a 4K CSS viewport, and 1920x1080 at device scale 2 (4K physical pixels)
  for (const [w, h, dpr] of [[1920, 1080, 1], [1920, 1080, 2], [3840, 2160, 1]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
    await page.goto(`${BASE}${ROUTE}?fake=loop&n=400&perf=1`, { waitUntil: "load" })
    await page.bringToFront()
    await page.waitForTimeout(32000)
    const r = await page.evaluate(() => {
      const f = window.__s3perf.filter((x) => x[0] > 4000) // skip boot
      const dts = f.map((x) => x[1]).sort((a, b) => a - b)
      const span = f[f.length - 1][0] - f[0][0]
      const cuts = []
      for (let i = 1; i < f.length; i++) if (f[i][3] !== f[i - 1][3] && f[i][3] >= 0) cuts.push(f[i][0])
      const cutWorst = Math.max(0, ...f.filter((x) => cuts.some((c) => x[0] >= c && x[0] < c + 400)).map((x) => x[1]))
      const over = (ms) => f.filter((x) => x[1] > ms).length
      return { frames: f.length, fps: (f.length * 1000) / span, p50: dts[Math.floor(dts.length * 0.5)], p99: dts[Math.floor(dts.length * 0.99)], worst: dts[dts.length - 1], cuts: cuts.length, cutWorst, over20: over(20), over34: over(34), first: window.__s3first }
    })
    console.log(`PERF ${w}x${h}@${dpr}x headed 400 ghosts: ${JSON.stringify(r, (k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v))}`)
    await page.screenshot({ path: path.join(SHOTS, `perf-${w}x${dpr}.png`) })
    await page.close()
  }
  await browser.close()
  process.exit(0)
}
const only = process.argv.slice(2)
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
})
for (const [name, query, times] of PLAN) {
  if (only.length && !only.includes(name)) continue
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const errors = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${BASE}${ROUTE}?${query}&fps=1`, { waitUntil: "load" })
  let last = 0
  for (let i = 0; i < times.length; i++) {
    await page.waitForTimeout(times[i] - last)
    last = times[i]
    const file = path.join(SHOTS, times.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`)
    await page.screenshot({ path: file })
    const [fps, st, ff] = await page.evaluate(() => [window.__s3fps ?? 0, window.__shotT ?? -1, window.__s3first ?? -1])
    console.log(`${name}: ${file} fps=${Number(fps).toFixed(0)} shotT=${Number(st).toFixed(2)} firstFrameMs=${Number(ff).toFixed(0)}`)
  }
  if (errors.length) console.log(`${name} ERRORS:\n  ${errors.slice(0, 6).join("\n  ")}`)
  await page.close()
}
await browser.close()
