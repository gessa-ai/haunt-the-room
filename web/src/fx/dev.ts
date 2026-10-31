// Dither lab (lane L14): the REAL stage or phone with the dither attached the way L7/L6 will attach it.
//   /src/fx/dev.html?fake=loop            stage (any L7 fake scenario: lobby intro hide hunting reveal finale ...)
//   /src/fx/dev.html?view=phone           phone (mountPlay against this origin's server)
//   &fx=0 starts with the effect off (before), &lab=0 hides the panel (for screenshots). Key D toggles before/after.
import { Application } from "pixi.js"
import { DitherFilter, createDitherFilter } from "./ditherFilter"
import { FLOODS, ditherBackground } from "./ditherGradient"
import { attachPhoneDither, type PhoneDither } from "./phoneDither"

const q = new URLSearchParams(location.search)
const view = q.get("view") ?? "stage"
const root = document.getElementById("app")!
const lab = document.getElementById("fxlab")!
if (q.get("lab") === "0") lab.classList.add("hide")
let on = q.get("fx") !== "0"
let strength = Number(q.get("strength") ?? 1)

let filter: DitherFilter | null = null
const overlays: PhoneDither[] = []

// overlays L6/L7 attached themselves are found by class; before/after hides them with one body class
const offStyle = document.createElement("style")
offStyle.textContent = "body.fx-off .hd-root, body.fx-off .hd-shadow { display: none !important }"
document.head.append(offStyle)

function sync(): void {
  if (filter) filter.strength = on ? strength : 0
  document.body.classList.toggle("fx-off", !on)
  for (const o of overlays) o.setStrength(strength)
  document.querySelectorAll<HTMLElement>(".hd-root, .hd-shadow").forEach((e) => (e.style.opacity = String(strength)))
  ;(window as unknown as { __fx: unknown }).__fx = { on, strength, cell: filter?.cell }
}

function slider(name: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): void {
  const l = document.createElement("label")
  const r = Object.assign(document.createElement("input"), { type: "range", min, max, step, value: String(get()) })
  const out = document.createElement("span")
  out.textContent = String(get())
  r.oninput = () => {
    set(Number(r.value))
    out.textContent = r.value
    sync()
  }
  l.append(name, r, out)
  lab.append(l)
}

function panel(): void {
  const b = document.createElement("button")
  const label = () => (b.textContent = on ? "AFTER (dither on) · D" : "BEFORE (dither off) · D")
  b.onclick = () => {
    on = !on
    label()
    sync()
  }
  label()
  window.addEventListener("keydown", (e) => {
    if (e.key === "d" || e.key === "D") b.click()
  })
  lab.append(b)
  slider("strength", 0, 1, 0.05, () => strength, (v) => (strength = v))
  if (filter) {
    const f = filter
    slider("cell", 1, 8, 1, () => f.cell, (v) => (f.cell = v))
    slider("spread", 0, 0.5, 0.01, () => f.spread, (v) => (f.spread = v))
    slider("drift", 0, 0.2, 0.01, () => f.drift, (v) => (f.drift = v))
    slider("bloom", 0, 3, 0.1, () => f.bloom, (v) => (f.bloom = v))
    slider("gamma", 0.5, 1.4, 0.05, () => f.gamma, (v) => (f.gamma = v))
    slider("contrast", 0, 1, 0.05, () => f.contrast, (v) => (f.contrast = v))
  }
}

async function stage(): Promise<void> {
  // capture the stage's Application without touching L7's files: wrap init once, for this page only
  const init = Application.prototype.init
  const captured = new Promise<Application>((resolve) => {
    Application.prototype.init = async function (this: Application, o) {
      await init.call(this, o)
      Application.prototype.init = init
      resolve(this)
    }
  })
  if (!q.get("fake")) history.replaceState(null, "", `${location.pathname}?${q.toString() ? q + "&" : ""}fake=loop`)
  const { mountStage } = await import("../stage/index")
  const mounting = mountStage(root)
  const app = await captured
  await mounting
  // L7 attaches the filter in mountStage; drive that instance (attach one only if the stage has none)
  const existing = ([] as unknown[]).concat(app.stage.filters ?? []).find((f): f is DitherFilter => f instanceof DitherFilter)
  if (existing) filter = existing
  else {
    filter = createDitherFilter()
    app.stage.filters = [...([] as never[]).concat((app.stage.filters ?? []) as never), filter]
    app.stage.filterArea = app.screen
  }
  // &floods=1: the DOM intro scrim and finale floods get pre-dithered gradients (what L7 would call once)
  if (q.get("floods") === "1") {
    const paint: [string, (typeof FLOODS)[keyof typeof FLOODS]][] = [
      [".st-intro", FLOODS.night],
      [".st-finale.ghosts .flood", FLOODS.blood],
      [".st-finale.hunters .flood", FLOODS.dawn],
    ]
    window.setInterval(() => {
      for (const [sel, look] of paint)
        root.querySelectorAll<HTMLElement>(sel).forEach((e) => {
          if (e.dataset.fx || !e.offsetWidth) return
          e.dataset.fx = "1"
          ditherBackground(e, look)
        })
    }, 100)
  }
  // the DOM feed + HUD get the overlay (unless L7 already attached it)
  const st = root.querySelector<HTMLElement>(".st")
  if (!st) throw new Error("dev: .st stage frame not found")
  if (!st.querySelector(".hd-root")) overlays.push(attachPhoneDither(st, { cell: 3, zIndex: 50 }))
}

async function phone(): Promise<void> {
  const { mountPlay } = await import("../play/index")
  mountPlay(root) // L6 attaches the phone overlay inside mountPlay
  if (!document.querySelector(".hd-root")) overlays.push(attachPhoneDither(document.body))
}

;(view === "phone" ? phone() : stage())
  .then(() => {
    panel()
    sync()
  })
  .catch((err: unknown) => {
    console.error("[fx dev]", err)
    lab.textContent = `fx dev failed: ${err instanceof Error ? err.message : String(err)}`
  })
