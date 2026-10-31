// L28 speaker busts: when an AI hunter talks, a big visual-novel bust slides in from its side (punch-in, bob,
// 2-frame mouth flap while the line types, rim light in the hunter's colour) and dims when another speaks.
//   showBust("medium", "left", 4200, host?)   hideBust()
// Stage: fixed to the viewport sides (never over the cabal table centre). Phone: a smaller bust in the given host.
import { HUNTERS, type HunterId } from "../../../contract/protocol"

const FLAP_MS = 110
let layer: HTMLElement | null = null
const els = new Map<HunterId, { el: HTMLElement; open: HTMLImageElement; flap: number; hide: number }>()

function ensureLayer(host?: HTMLElement): HTMLElement {
  const parent = host ?? document.body
  if (layer && layer.parentElement === parent) return layer
  layer?.remove()
  els.clear()
  layer = document.createElement("div")
  layer.className = host ? "bust-layer bust-in-host" : "bust-layer"
  parent.prepend(layer)
  return layer
}

/** Show `hunter`'s bust on `side`, talking (mouth flap) for `durationMs`, then it stays dimmed until hideBust(). */
/** Scenes that draw their own hunter lineup (L20b's ending crew). Never two art styles in one frame: no bust then. */
const OWN_LINEUP = ".end-crew"
const lineupOnScreen = () => [...document.querySelectorAll<HTMLElement>(OWN_LINEUP)].some((e) => e.getClientRects().length > 0)

export function showBust(hunter: HunterId, side: "left" | "right", durationMs: number, host?: HTMLElement, avoid?: HTMLElement): void {
  if (lineupOnScreen()) {
    hideBust()
    return
  }
  const root = ensureLayer(host)
  const color = HUNTERS.find((h) => h.id === hunter)?.color ?? "#fff"
  let b = els.get(hunter)
  if (!b) {
    const el = document.createElement("div")
    el.className = "bust"
    el.style.setProperty("--bc", color)
    const closed = Object.assign(document.createElement("img"), { src: `/art/bust/${hunter}-closed.png`, alt: "", className: "bust-img" })
    const open = Object.assign(document.createElement("img"), { src: `/art/bust/${hunter}-open.png`, alt: "", className: "bust-img bust-open" })
    closed.onerror = () => console.error(`[bust] missing /art/bust/${hunter}-closed.png`)
    el.append(closed, open)
    root.append(el)
    b = { el, open, flap: 0, hide: 0 }
    els.set(hunter, b)
  }
  for (const [id, o] of els) if (id !== hunter) o.el.classList.add("bust-dim")
  const { el } = b
  el.classList.remove("bust-left", "bust-right", "bust-dim", "bust-gone")
  el.classList.add(`bust-${side}`)
  if (!host) fitBeside(el, side, avoid)
  // restart the punch-in
  el.classList.remove("bust-punch")
  void el.offsetWidth
  el.classList.add("bust-punch", "bust-talk")
  window.clearInterval(b.flap)
  window.clearTimeout(b.hide)
  const open = b.open
  let on = false
  b.flap = window.setInterval(() => open.classList.toggle("bust-show", (on = !on)), FLAP_MS)
  b.hide = window.setTimeout(() => {
    window.clearInterval(b!.flap)
    open.classList.remove("bust-show")
    el.classList.remove("bust-talk")
    el.classList.add("bust-dim")
    b!.hide = window.setTimeout(() => el.classList.add("bust-gone"), 350)
  }, Math.max(600, durationMs))
}

/** Slide every bust out. */
export function hideBust(): void {
  for (const o of els.values()) {
    window.clearInterval(o.flap)
    window.clearTimeout(o.hide)
    o.open.classList.remove("bust-show")
    o.el.classList.remove("bust-talk")
    o.el.classList.add("bust-gone")
  }
}

/** Fixed side per hunter so each always enters from the same place. */
export const BUST_SIDE: Record<HunterId, "left" | "right"> = { exorcist: "left", medium: "left", skeptic: "right", priest: "right" } as Record<HunterId, "left" | "right">

/** Law: a stage bust never overlaps the caption stack. It fits beside the boxes (narrowed if needed), else sits in the
 *  larger free band above or below them. */
function fitBeside(el: HTMLElement, side: "left" | "right", avoid?: HTMLElement): void {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const pad = 16
  let h = 0.45 * vh
  let bottom = 0.22 * vh
  const boxes = avoid ? [...avoid.querySelectorAll<HTMLElement>(".cap-box:not(.cap-out)")].map((b) => b.getBoundingClientRect()).filter((r) => r.width) : []
  if (boxes.length) {
    const u = { top: Math.min(...boxes.map((r) => r.top)), bottom: Math.max(...boxes.map((r) => r.bottom)), left: Math.min(...boxes.map((r) => r.left)), right: Math.max(...boxes.map((r) => r.right)) }
    const avail = side === "left" ? u.left - pad - 0.015 * vw : vw - u.right - pad - 0.015 * vw
    const w = (h * 900) / 1100
    const overlapsY = vh - bottom > u.top && vh - bottom - h < u.bottom
    if (overlapsY && avail < w) {
      if (avail >= 0.6 * w) h = (avail * 1100) / 900
      else {
        const above = u.top - pad - 0.03 * vh
        const below = vh - u.bottom - pad - 0.03 * vh
        if (above >= below) {
          h = Math.min(h, above)
          bottom = vh - u.top + pad
        } else {
          h = Math.min(h, below)
          bottom = vh - (u.bottom + pad + h)
        }
      }
    }
  }
  el.style.height = `${Math.max(0, h)}px`
  el.style.bottom = `${bottom}px`
}
