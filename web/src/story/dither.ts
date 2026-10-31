// Per-frame CPU ordered dither for the story slides (lane L20). The slide is drawn into a small canvas (one texel
// per dither cell), each pixel is pushed by the 8x8 Bayer threshold and snapped to the shared Halloween palette
// through a 32^3 lookup table, then the canvas is shown upscaled with image-rendering: pixelated.
import { bayer8, DITHER_PALETTE } from "../fx/palette"

const BITS = 5
const N = 1 << BITS

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const PAL = DITHER_PALETTE.map(hexRgb)
const PAL_R = new Uint8Array(PAL.map((c) => c[0]))
const PAL_G = new Uint8Array(PAL.map((c) => c[1]))
const PAL_B = new Uint8Array(PAL.map((c) => c[2]))

/** rgb bin -> palette index (nearest, luma-weighted distance). */
const LUT = (() => {
  const lut = new Uint8Array(N * N * N)
  for (let r = 0; r < N; r++)
    for (let g = 0; g < N; g++)
      for (let b = 0; b < N; b++) {
        const R = (r + 0.5) * (256 / N)
        const G = (g + 0.5) * (256 / N)
        const B = (b + 0.5) * (256 / N)
        let best = 0
        let bestD = Infinity
        for (let i = 0; i < PAL.length; i++) {
          const dr = R - PAL[i][0]
          const dg = G - PAL[i][1]
          const db = B - PAL[i][2]
          const d = dr * dr + dg * dg + db * db
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        lut[(r << (2 * BITS)) | (g << BITS) | b] = best
      }
  return lut
})()

const BAYER = (() => {
  const t = new Float32Array(64)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) t[y * 8 + x] = bayer8(x, y) - 0.5
  return t
})()

export interface DitherLook {
  /** Threshold swing in 0..255 units. */
  spread: number
  /** Exposure multiplier before the palette snap (the renders are night scenes). */
  gain: number
  /** S-curve amount, 0..1. */
  contrast: number
}

export const STORY_LOOK: DitherLook = { spread: 40, gain: 1.1, contrast: 0.3 }

/** Tone curve as a 256 table (gain, then a smoothstep blend for contrast). */
function toneTable(look: DitherLook): Float32Array {
  const t = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = Math.min(1, (i / 255) * look.gain)
    const s = x * x * (3 - 2 * x)
    t[i] = (x + (s - x) * look.contrast) * 255
  }
  return t
}

let toneKey = ""
let tone: Float32Array = new Float32Array(256)

/** Dither the canvas in place. `frame` steps the threshold offset so the grain breathes. */
export function ditherCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, look: DitherLook = STORY_LOOK): void {
  const key = `${look.spread}|${look.gain}|${look.contrast}`
  if (key !== toneKey) {
    tone = toneTable(look)
    toneKey = key
  }
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const ox = (frame * 3) & 7
  const oy = (frame * 5) & 7
  const sp = look.spread
  const shift = 8 - BITS
  for (let y = 0; y < h; y++) {
    const row = ((y + oy) & 7) * 8
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const th = BAYER[row + ((x + ox) & 7)] * sp
      let r = tone[d[p]] + th
      let g = tone[d[p + 1]] + th
      let b = tone[d[p + 2]] + th
      r = r < 0 ? 0 : r > 255 ? 255 : r
      g = g < 0 ? 0 : g > 255 ? 255 : g
      b = b < 0 ? 0 : b > 255 ? 255 : b
      const i = LUT[((r >> shift) << (2 * BITS)) | ((g >> shift) << BITS) | (b >> shift)]
      d[p] = PAL_R[i]
      d[p + 1] = PAL_G[i]
      d[p + 2] = PAL_B[i]
    }
  }
  ctx.putImageData(img, 0, 0)
}
