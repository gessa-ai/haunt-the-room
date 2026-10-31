// @ts-check
// L6 smoke by real use (the lane's one script, not a test suite): two phones (isolated mobile contexts, 390x844)
// against the mock house, through one beat of the loop: lobby -> intro cards -> hide (+lure) -> hunting -> reveal
// (A caught, B safe) -> out -> outage -> finale. Screenshots of every screen go to dev/shots/.
//   PLAYWRIGHT_DIR=<dir with node_modules/playwright> node web/src/play/dev/qa.mjs
import { mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { INTRO_CARDS } from "../../../../contract/protocol.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "x.js") : import.meta.url)
const { chromium } = require("playwright")
const BASE = process.env.MOCK ?? "http://localhost:5361"
const SHOTS = path.join(here, "shots")
mkdirSync(SHOTS, { recursive: true })
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const dev = (cmd) => fetch(`${BASE}/dev/${cmd}`, { method: "POST" }).then((r) => r.json())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, what) => {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`)
}

const browser = await chromium.launch()
const errors = []
async function phone(label) {
  const page = await (await browser.newContext(PHONE)).newPage()
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${label}: ${m.text()}`))
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`))
  return { label, page }
}
const shot = async (p, name) => {
  const file = path.join(SHOTS, `${name}-${p.label}.png`)
  await p.page.screenshot({ path: file })
  return file
}
async function duo(name, a, b) {
  const files = [await shot(a, name), await shot(b, name)]
  const img = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`
  const page = await browser.newPage({ viewport: { width: 900, height: 940 }, deviceScaleFactor: 2 })
  await page.setContent(
    `<body style="margin:0;background:#120a1d;display:flex;gap:40px;justify-content:center;align-items:center;height:940px">` +
      files.map((f) => `<img src="${img(f)}" style="width:390px;height:844px;border-radius:44px;box-shadow:0 0 0 8px #241838,0 30px 60px -20px #000">`).join("") +
      `</body>`,
  )
  const out = path.join(SHOTS, `duo-${name}.png`)
  await page.screenshot({ path: out })
  await page.close()
  console.log(`     ${out}`)
}
const screen = (p) => p.page.evaluate(() => document.querySelector(".hr-root")?.getAttribute("data-screen"))

await dev("hold/1")
await dev("lobby")
const A = await phone("A")
const B = await phone("B")
const t0 = Date.now()
await A.page.goto(`${BASE}/p`)
await A.page.locator(".hr-splash.named").waitFor()
check(true, `A named on the splash ${Date.now() - t0} ms after load`)
await B.page.goto(`${BASE}/p`)
await A.page.locator(".hr-splash.out").waitFor()
await B.page.locator(".hr-splash.out").waitFor()
await wait(600)
await duo("01-lobby", A, B)

// Intro: WELCOME, then the cards, on the phase clock.
await dev("hold/0")
await dev("start")
await wait(1200)
await shot(A, "02-intro-welcome")
await wait(8000)
await shot(A, "03-intro-card2")
check((await A.page.locator(".hr-intro-title").innerText()).trim() === INTRO_CARDS[1]?.title, "intro shows the contract's card 2 at 9 s")
await A.page.waitForFunction(() => document.querySelector(".hr-root")?.getAttribute("data-screen") === "hide", null, { timeout: 15000 })
await dev("hold/1")

// Hide: A in the Attic, B in the Crypt; B lures a hunter to the Nursery.
const th = Date.now()
await A.page.locator('.hr-room[data-room="attic"]').tap()
await A.page.locator('.hr-room.mine[data-room="attic"]').waitFor()
check(true, `A's pick lit up ${Date.now() - th} ms after the tap`)
await B.page.locator('.hr-room[data-room="crypt"]').tap()
await wait(600)
await A.page.locator(".hr-lean.on").first().waitFor()
await wait(700)
check((await A.page.locator(".hr-lean.on").count()) >= 2, "hunters' leans show as eyes on the rooms")
await duo("04-hide", A, B)
const tl = Date.now()
await B.page.locator('.hr-lie-chip[data-room="nursery"]').tap()
await B.page.locator(".hr-lie-row.sent").waitFor()
check((await B.page.locator(".hr-lie-label").innerText()).startsWith("sent to"), `B's one-tap lie reached a hunter (${Date.now() - tl} ms)`)
await wait(300)
await shot(B, "05-lie-sent")

// Hunting, then the reveal: the Attic is swept.
await dev("sweep?rooms=attic,library")
await dev("next")
await wait(2400)
await duo("07-hunting", A, B)
await dev("next")
await A.page.locator('.hr-scr-reveal[data-kind="caught"]').waitFor()
await B.page.locator('.hr-scr-reveal[data-kind="safe"], .hr-scr-reveal[data-kind="possessed"]').waitFor()
await wait(650)
await duo("08a-moment", A, B)
await A.page.locator(".hr-scr-reveal.summary").waitFor()
await wait(900)
check(true, "reveal: A caught in the Attic, B safe in the Crypt")
await duo("08-reveal", A, B)

// Next beat: A sits out.
await dev("next")
await wait(500)
check((await screen(A)) === "out" && (await screen(B)) === "hide", "beat 2: A sits out, B hides")
await duo("09-beat2", A, B)

// No seat at the bell: B skips beat 2 and lands in the hallway scene.
await dev("next")
await dev("next")
await B.page.locator('.hr-moment[data-m="noseat"]').waitFor()
await wait(900)
check(true, "B without a seat at the bell: the no-seat scene")
await shot(B, "09a-no-seat")

// Competitive: A climbs past someone and catches fire.
await dev(`boost/${await A.page.evaluate(() => localStorage.getItem("haunt.ghostId"))}?streak=3&score=5000`)
await A.page.locator(".hr-climb.show").waitFor()
await wait(400)
check((await A.page.locator(".hr-climb").innerText()).startsWith("you passed"), "A climbed: 'you passed ...' callout")
await shot(A, "09b-on-fire-climb")

// A third phone when the house is full: it waits at the gate.
await dev("full/1")
const C = await phone("C")
await C.page.goto(`${BASE}/p`)
await C.page.locator(".hr-fullhouse.show").waitFor()
await wait(500)
check(true, "over the cap: the house-is-full gate")
await shot(C, "09d-house-full")
await dev("full/0")

// Landscape phone: one clear "turn your phone" card.
await B.page.setViewportSize({ width: 844, height: 390 })
await wait(300)
check(await B.page.locator(".hr-turn").isVisible(), "landscape shows the turn-your-phone card")
await shot(B, "09c-landscape")
await B.page.setViewportSize({ width: 390, height: 844 })

// Outage: the house dies for 2.5 s; both come back.
await dev("kill?downMs=2500")
await B.page.locator(".hr-dead.show").waitFor()
await wait(600)
await duo("10-house-died", A, B)
const tk = Date.now()
await A.page.waitForFunction(() => !document.querySelector(".hr-dead")?.classList.contains("show"), null, { timeout: 15000 })
await B.page.waitForFunction(() => !document.querySelector(".hr-dead")?.classList.contains("show"), null, { timeout: 15000 })
check(true, `both phones back ${Date.now() - tk} ms after the outage screen (house down 2.5 s)`)

// Finale.
await dev("finale?winner=ghosts")
await wait(1100)
await duo("11-finale-ghosts", A, B)
await dev("finale?winner=hunters")
await wait(1100)
await shot(A, "12-finale-hunters")

await dev("hold/0")
await dev("lobby")
check(errors.length === 0, `no page errors (${errors.length})`)
for (const e of errors) console.log(`     ${e}`)
await browser.close()
console.log(failures ? `${failures} FAILED` : "ALL OK")
process.exit(failures ? 1 : 0)
