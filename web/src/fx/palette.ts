// The one Halloween dither palette (lane L14). The stage filter, the phone overlay and the pre-dither script all
// read it from here. It keeps every ROOM_STYLE colour exact (rooms stay identifiable at a glance) and pure white
// (text stays legible), on a run of night darks.
import { ROOM_STYLE } from "../../../contract/protocol"

// Contrast first (owner 13:12): deep SATURATED darks per room hue and bright accents; no muddy midtones (no
// greys, no desaturated middles). The S-curve in the shader pushes midtones out to one side or the other before they reach this list.
const HALLOWEEN = [
  "#040307", // void
  "#0d0816", // midnight
  "#1a1026", // plum shadow
  "#2b1838", // bruise
  "#42245a", // night violet (the brightest dark)
  "#0c1f2a", // drowned teal
  "#1b2a52", // moonlit blue
  "#241208", // soot (wood interiors)
  "#4a2410", // dark oak
  "#6b4a0a", // old gold (library lamplight)
  "#5c0f1a", // dried blood
  "#8a2c0c", // ember
  "#123d1f", // deep moss
  "#0f4848", // deep teal (crypt)
  "#1d3f8a", // deep blue (nursery)
  "#3a1a6a", // deep violet (chapel)
  "#ff3b3b", // fresh blood
  "#ff7a1a", // pumpkin
  "#ffd27a", // candle
  "#9fc4ff", // moonlight
  "#d9c8ff", // ecto lilac
  "#efe6d2", // bone
  "#ffffff", // white (text)
]

export const DITHER_PALETTE: readonly string[] = [...HALLOWEEN, ...Object.values(ROOM_STYLE).map((s) => s.color)]

/** Palette as linear 0..1 RGB triples, flat (for a GLSL uniform array or a CPU loop). */
export function paletteRgb(hex: readonly string[] = DITHER_PALETTE): Float32Array {
  const out = new Float32Array(hex.length * 3)
  hex.forEach((h, i) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h)
    if (!m) throw new Error(`palette colour is not #rrggbb: ${h}`)
    const n = parseInt(m[1], 16)
    out[i * 3] = ((n >> 16) & 255) / 255
    out[i * 3 + 1] = ((n >> 8) & 255) / 255
    out[i * 3 + 2] = (n & 255) / 255
  })
  return out
}

/** 8x8 ordered (Bayer) threshold in [0,1), built by bit interleaving: the same matrix the shader computes. */
export function bayer8(x: number, y: number): number {
  let v = 0
  for (let bit = 0; bit < 3; bit++) {
    const xb = (x >> bit) & 1
    const yb = (y >> bit) & 1
    v |= ((xb ^ yb) << (5 - 2 * bit)) | (yb << (4 - 2 * bit))
  }
  return (v + 0.5) / 64
}
