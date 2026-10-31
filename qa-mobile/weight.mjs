// L17: cold first-load weight of the phone page over a URL (phone-sized Chromium, cache disabled).
// usage: node qa-mobile/weight.mjs [url]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium, devices } = require("../qa/node_modules/playwright")
const url = process.argv[2] ?? "https://haunt.gessa.ai/p"
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
const reqs = new Map(); let total = 0
cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { url: e.response.url, status: e.response.status, type: e.type, bytes: 0 }))
cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; total += e.encodedDataLength } })
const t0 = Date.now()
await page.goto(url, { waitUntil: "load" })
const tLoad = Date.now() - t0
let tName = null
try { await page.waitForFunction(() => /#\d+/.test(document.body.innerText), null, { timeout: 15000 }); tName = Date.now() - t0 } catch {}
await page.waitForTimeout(4000)
const list = [...reqs.values()].sort((a, b) => b.bytes - a.bytes)
const byType = {}; for (const r of list) byType[r.type] = (byType[r.type] ?? 0) + r.bytes
console.log(JSON.stringify({ url, tLoad, tName, requests: list.length, totalKB: Math.round(total / 1024), byTypeKB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])), bad: list.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.url}`) }, null, 1))
console.log("top 15:"); for (const r of list.slice(0, 15)) console.log(String(Math.round(r.bytes / 1024)).padStart(6), "KB", r.status, r.url.replace(/^https?:\/\/[^/]+/, ""))
await page.screenshot({ path: new URL("./shots/weight-chromium.png", import.meta.url).pathname })
await b.close()
