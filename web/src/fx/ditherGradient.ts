// Pre-dithered gradients for big DOM fields (lane L14): the finale blood flood, the intro scrim, the phone's
// FLEE red, any full-screen backdrop the stage filter never sees because it is DOM.
// A CSS gradient is smooth; this one is a real 8x8 ordered dither between YOUR stops (two crisp colours per
// cell, no in-between mud), drawn once to a tiny canvas (1 texel per cell) and upscaled pixelated by CSS.
//
//   import { ditherBackground } from "../fx/ditherGradient"
//   ditherBackground(floodEl, { shape: "radial", at: [0.5, 0.4], stops: [["#ff3b3b", 0], ["#9e1b2a", 0.35], ["#5c0f1a", 0.7], ["#040307", 1]] })
//
// Cheap: one canvas draw at call time (~600x340 texels for a 1920x1080 frame at cell 3), then a static image.
import { bayer8 } from "./palette"

export type Stop = readonly [color: string, at: number]

export interface DitherGradientOptions {
  stops: readonly Stop[]
  /** "linear" (along `angle`) or "radial" (ellipse fitted to the box, centred at `at`). Default "linear". */
  shape?: "linear" | "radial"
  /** Linear direction in degrees, CSS convention (180 = top to bottom). Default 180. */
  angle?: number
  /** Radial centre, 0..1 of the box. Default [0.5, 0.5]. */
  at?: readonly [number, number]
  /** Radial reach: 1 = the farthest corner. Default 1. */
  radius?: number
  /** CSS px per dither cell. Default 3. */
  cell?: number
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`ditherGradient: colour is not #rrggbb: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Data URL of the dithered gradient for a box of `width` x `height` CSS px. */
export function ditherGradientUrl(width: number, height: number, o: DitherGradientOptions): string {
  if (o.stops.length < 2) throw new Error("ditherGradient: needs at least two stops")
  const stops = [...o.stops].sort((a, b) => a[1] - b[1]).map(([c, at]) => ({ c: rgb(c), at }))
  const cell = Math.max(1, o.cell ?? 3)
  const w = Math.max(1, Math.ceil(width / cell))
  const h = Math.max(1, Math.ceil(height / cell))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext("2d")
  if (!g) throw new Error("ditherGradient: 2d canvas unavailable")
  const img = g.createImageData(w, h)

  const ang = (((o.angle ?? 180) - 90) * Math.PI) / 180 // CSS 0deg = up; 180deg = down
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const half = Math.abs(dx) * 0.5 * w + Math.abs(dy) * 0.5 * h
  const [cx, cy] = o.at ?? [0.5, 0.5]
  const rx = Math.max(cx, 1 - cx) * w
  const ry = Math.max(cy, 1 - cy) * h
  const reach = Math.hypot(1, 1) * (o.radius ?? 1)

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let p: number
      if (o.shape === "radial") p = Math.hypot((x + 0.5 - cx * w) / rx, (y + 0.5 - cy * h) / ry) / reach
      else p = ((x + 0.5 - w / 2) * dx + (y + 0.5 - h / 2) * dy) / (2 * half) + 0.5
      p = Math.min(1, Math.max(0, p))
      let i = 0
      while (i < stops.length - 2 && p > stops[i + 1].at) i++
      const a = stops[i]
      const b = stops[i + 1]
      const f = b.at > a.at ? Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at))) : 1
      const c = bayer8(x, y) < f ? b.c : a.c
      const k = (y * w + x) * 4
      img.data[k] = c[0]
      img.data[k + 1] = c[1]
      img.data[k + 2] = c[2]
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return canvas.toDataURL("image/png")
}

/** Paint `el`'s background with the dithered gradient at its current size (re-run on resize if it changes). */
export function ditherBackground(el: HTMLElement, o: DitherGradientOptions): void {
  const r = el.getBoundingClientRect()
  // the stage frame is CSS-scaled; size by layout px so one cell stays `cell` stage units
  const w = el.offsetWidth || r.width || window.innerWidth
  const h = el.offsetHeight || r.height || window.innerHeight
  el.style.backgroundImage = `url(${ditherGradientUrl(w, h, o)})`
  el.style.backgroundSize = "100% 100%"
  el.style.backgroundRepeat = "no-repeat"
  el.style.imageRendering = "pixelated"
}

/** Ready-made floods in the palette (owner look: bright accents over deep darks). */
export const FLOODS = {
  blood: { shape: "radial", at: [0.5, 0.4], stops: [["#ff3b3b", 0], ["#9e1b2a", 0.3], ["#5c0f1a", 0.62], ["#040307", 1]] },
  dawn: { shape: "radial", at: [0.5, 1.05], stops: [["#ffffff", 0], ["#ffd27a", 0.25], ["#9fc4ff", 0.6], ["#1b2a52", 1]] },
  night: { shape: "radial", at: [0.5, 0.42], stops: [["#42245a", 0], ["#1a1026", 0.45], ["#0d0816", 0.75], ["#040307", 1]] },
} as const satisfies Record<string, DitherGradientOptions>
