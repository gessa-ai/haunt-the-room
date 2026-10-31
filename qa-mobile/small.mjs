// L17: hide grid on small phones (iPhone SE, Galaxy S8 360x740) over the public URL: do all 6 rooms + lure fit?
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium, devices } = require("../qa/node_modules/playwright")
const url = process.argv[2] ?? "https://haunt.gessa.ai/p"
const shots = new URL("./shots/", import.meta.url).pathname
const b = await chromium.launch()
for (const name of ["iPhone SE", "Galaxy S8"]) {
  const ctx = await b.newContext({ ...devices[name] }); const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector(".hr-root")?.dataset.phase === "hide", null, { timeout: 120000 }).catch(() => console.log(name, "no hide in 120 s"))
  await page.waitForTimeout(600)
  const r = await page.evaluate(() => {
    const vh = innerHeight
    const rooms = [...document.querySelectorAll(".hr-room")].map((e) => { const b = e.getBoundingClientRect(); return { room: e.dataset.room, top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } })
    const lure = document.querySelector(".hr-lure-chip")?.getBoundingClientRect()
    return { vh, rooms, lureBottom: lure && Math.round(lure.bottom), scrollH: document.scrollingElement.scrollHeight }
  })
  const cut = r.rooms.filter((x) => x.bottom > r.vh || x.h < 44)
  console.log(name, `vh ${r.vh}`, "rooms h", r.rooms.map((x) => x.h).join(","), "lure bottom", r.lureBottom, cut.length ? "CUT: " + JSON.stringify(cut) : "all 6 rooms on screen, >= 44 px")
  await page.screenshot({ path: `${shots}small-${name.replace(/ /g, "")}.png` }); await ctx.close()
}
await b.close()
