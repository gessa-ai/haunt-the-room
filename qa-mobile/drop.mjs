// L17: airplane-mode drop on one phone (Chromium, iPhone 13 emulation) over the public URL.
// usage: node qa-mobile/drop.mjs [url] [offlineSecs]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium, devices } = require("../qa/node_modules/playwright")
const url = process.argv[2] ?? "https://haunt.gessa.ai/p"
const offSecs = Number(process.argv[3] ?? 10)
const shots = new URL("./shots/", import.meta.url).pathname
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()
const errs = []; page.on("pageerror", (e) => errs.push(String(e)))
let reloads = 0; page.on("framenavigated", (f) => { if (f === page.mainFrame()) reloads++ })
const state = () => page.evaluate(() => { const r = document.querySelector(".hr-root"); return { link: r?.dataset.link, phase: r?.dataset.phase, screen: r?.dataset.screen, dead: !!document.querySelector(".hr-dead.show"), name: document.querySelector(".hr-who-name")?.textContent } })
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => document.querySelector(".hr-root")?.dataset.link === "live", null, { timeout: 30000 })
const before = await state(); console.log(`live after ${Date.now() - t0} ms`, JSON.stringify(before))
await ctx.setOffline(true); const tOff = Date.now(); console.log("OFFLINE")
for (let i = 0; i < offSecs; i++) { await page.waitForTimeout(1000); console.log(`  +${i + 1}s`, JSON.stringify(await state())) }
await page.screenshot({ path: shots + "drop-offline.png" })
await ctx.setOffline(false); const tOn = Date.now(); console.log("ONLINE")
await page.waitForFunction(() => document.querySelector(".hr-root")?.dataset.link === "live", null, { timeout: 60000 }).catch(() => console.log("NOT LIVE after 60 s"))
const after = await state(); console.log(`live again ${Date.now() - tOn} ms after network back`, JSON.stringify(after), "same name:", after.name === before.name)
await page.waitForTimeout(1500); await page.screenshot({ path: shots + "drop-back.png" })
console.log("pageerrors", errs.length, errs.slice(0, 3), "navigations", reloads)
await b.close()
