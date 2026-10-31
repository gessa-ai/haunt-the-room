// DOM dither for the phone (and the stage's DOM feed/HUD) - lane L14.
// A real per-pixel quantize of live DOM is not affordable on a phone, so the look is built from two cheap layers:
//   1. a fixed 8x8 Bayer threshold tile (1 texel per dither cell, upscaled with image-rendering: pixelated) blended
//      with mix-blend-mode: overlay (on the root, so the group blends with the page). Overlay leaves pure white and pure black untouched, so text stays legible,
//      and breaks every midtone and gradient into the ordered cross-hatch.
//   2. a "shadow" tile (mix-blend-mode: lighten): plum cells on part of the Bayer thresholds, so near-black areas
//      break into the same two-step dither as the stage instead of staying flat (anything brighter is untouched).
//   3. a sparse "drift" tile of random thresholds that steps across the screen one cell at a time on a compositor
//      transform animation (no JS per frame), so the grain breathes like the stage filter.
// Pair it with the pre-dithered room art (web/public/fx/rooms/<id>.webp, written by fx/predither.mjs).
//
// ATTACH (L6, web/src/play/index.ts, at the end of mountPlay):
//   import { attachPhoneDither } from "../fx/phoneDither"
//   attachPhoneDither(root)                       // returns { el, setStrength, flash, destroy }
// It never takes a tap (pointer-events: none), adds no listeners and costs one composited layer.
import { bayer8 } from "./palette"

export interface PhoneDitherOptions {
  /** CSS px per dither cell. Default 3 (2 under 360 px wide). */
  cell?: number
  /** 0..1. Default 1. */
  strength?: number
  /** Overlay contrast of the Bayer layer, 0..1 (how far the tile swings from mid grey). Default 0.45 (text on midtone colours stays readable). */
  contrast?: number
  /** Animate the drift layer. Default true (always off under prefers-reduced-motion). */
  drift?: boolean
  /** Dither the near-black areas too (plum grain in the darks). Default true. */
  shadows?: boolean
  /** z-index of the overlay. Default 2147483000 (on top of everything). */
  zIndex?: number
}

export interface PhoneDither {
  el: HTMLDivElement
  setStrength(v: number): void
  /** A short bloom: the grain lifts for `ms` so a flash or reveal punches through, then settles back. */
  flash(ms?: number): void
  destroy(): void
}

const STYLE_ID = "haunt-dither-style"
const DRIFT_TILE = 32 // cells

function shadowTileUrl(): string {
  const c = document.createElement("canvas")
  c.width = 8
  c.height = 8
  const g = c.getContext("2d")
  if (!g) throw new Error("phoneDither: 2d canvas unavailable")
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const t = bayer8(x, y)
      if (t >= 0.34) continue
      g.fillStyle = t < 0.1 ? "#2b1838" : "#1a1026" // bruise / plum shadow from the dither palette
      g.fillRect(x, y, 1, 1)
    }
  return c.toDataURL("image/png")
}

function tileUrl(size: number, value: (x: number, y: number) => number, contrast: number): string {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const g = c.getContext("2d")
  if (!g) throw new Error("phoneDither: 2d canvas unavailable")
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = Math.round(255 * (0.5 + (value(x, y) - 0.5) * contrast))
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return c.toDataURL("image/png")
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement("style")
  s.id = STYLE_ID
  s.textContent = `
.hd-root,.hd-shadow{position:fixed;inset:0;pointer-events:none;overflow:hidden;transition:opacity .5s ease}
.hd-root{mix-blend-mode:overlay}
.hd-shadow{mix-blend-mode:lighten;image-rendering:pixelated;image-rendering:crisp-edges}
.hd-root>i{position:absolute;display:block;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges}
.hd-drift{mix-blend-mode:overlay}
.hd-bayer{inset:0}
.hd-drift{left:0;top:0;width:calc(100% + var(--hd-t));height:calc(100% + var(--hd-t));will-change:transform;
  animation:hd-drift 19s steps(32) infinite}
@keyframes hd-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-1 * var(--hd-t)),calc(-1 * var(--hd-t)),0)}}
@media (prefers-reduced-motion: reduce){.hd-drift{animation:none}}
.hd-root.hd-flash,.hd-shadow.hd-flash{opacity:.25 !important;transition:opacity .06s linear}
`
  document.head.append(s)
}

export function attachPhoneDither(root: HTMLElement, opts: PhoneDitherOptions = {}): PhoneDither {
  installStyle()
  const cell = opts.cell ?? (window.innerWidth < 360 ? 2 : 3)
  const contrast = opts.contrast ?? 0.45
  let strength = Math.min(1, Math.max(0, opts.strength ?? 1))

  const el = document.createElement("div")
  el.className = "hd-root"
  el.setAttribute("aria-hidden", "true")
  el.style.zIndex = String(opts.zIndex ?? 2147483000)
  el.style.setProperty("--hd-t", `${DRIFT_TILE * cell}px`)
  if (root !== document.body && getComputedStyle(root).position !== "static") el.style.position = "absolute"

  const bayer = document.createElement("i")
  bayer.className = "hd-bayer"
  bayer.style.backgroundImage = `url(${tileUrl(8, bayer8, contrast)})`
  bayer.style.backgroundSize = `${8 * cell}px ${8 * cell}px`

  // drift: mostly mid grey (no effect), ~1 cell in 9 nudged up or down, so thresholds near the edge flicker
  const drift = document.createElement("i")
  drift.className = "hd-drift"
  let seed = 0x9e3779b9
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  drift.style.backgroundImage = `url(${tileUrl(DRIFT_TILE, () => (rnd() < 0.11 ? (rnd() < 0.5 ? 0.15 : 0.85) : 0.5), 0.5)})`
  drift.style.backgroundSize = `${DRIFT_TILE * cell}px ${DRIFT_TILE * cell}px`
  if (opts.drift === false) drift.style.animation = "none"

  el.append(bayer, drift)
  // the shadow layer is a sibling: lighten must blend with the page, not inside the overlay group
  const shadow = document.createElement("div")
  shadow.className = "hd-shadow"
  shadow.setAttribute("aria-hidden", "true")
  shadow.style.zIndex = el.style.zIndex
  shadow.style.position = el.style.position
  shadow.style.backgroundImage = `url(${shadowTileUrl()})`
  shadow.style.backgroundSize = `${8 * cell}px ${8 * cell}px`
  const layers = opts.shadows === false ? [el] : [shadow, el]
  root.append(...layers)

  const apply = () => {
    for (const l of layers) {
      l.style.opacity = String(strength)
      l.style.display = strength > 0 ? "" : "none"
    }
  }
  apply()

  let flashTimer = 0
  return {
    el,
    setStrength(v: number) {
      strength = Math.min(1, Math.max(0, v))
      apply()
    },
    flash(ms = 220) {
      for (const l of layers) l.classList.add("hd-flash")
      clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => layers.forEach((l) => l.classList.remove("hd-flash")), ms)
    },
    destroy() {
      clearTimeout(flashTimer)
      layers.forEach((l) => l.remove())
    },
  }
}
