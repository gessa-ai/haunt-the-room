// Procedural placeholder for the cabal table (until the Blender plate lands): a top-down round oak table in a dark
// room lit by one candle, ordered-dithered (Bayer 8x8) onto the project palette in 3 px cells.
import { bayer8 } from "../fx/palette"

export interface Layout {
  seats: { x: number; y: number }[] // HUNTERS order, 1920x1080 px
  map: { x: number; y: number; w: number; h: number } // the house map carved into the table
}
export const TABLE = { x: 960, y: 440, r: 400 }
export const CANDLE = { x: 960, y: 118 }
export const DEFAULT_LAYOUT: Layout = {
  seats: [
    { x: 565, y: 118 },
    { x: 1355, y: 118 },
    { x: 565, y: 475 },
    { x: 1355, y: 475 },
  ],
  // the map is the board (L23 r5: >= 2x); the outer sides stay free for L28's speaker busts
  map: { x: 690, y: 50, w: 540, h: 580 },
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const FLOOR = ["#040307", "#0d0816", "#1a1026", "#2b1838"].map(hex)
const WOOD = ["#040307", "#241208", "#4a2410", "#8a2c0c", "#6b4a0a", "#ffd27a"].map(hex)
const RIM = ["#040307", "#241208", "#4a2410", "#6b4a0a"].map(hex)

function ramp(r: [number, number, number][], v: number, x: number, y: number): [number, number, number] {
  const f = Math.max(0, Math.min(0.9999, v)) * (r.length - 1)
  const i = Math.floor(f)
  return f - i > bayer8(x, y) ? r[Math.min(r.length - 1, i + 1)] : r[i]
}

export function paintTable(c: HTMLCanvasElement, layout: Layout): void {
  const CELL = 3
  const w = Math.ceil(c.width / CELL)
  const h = Math.ceil(c.height / CELL)
  const small = document.createElement("canvas")
  small.width = w
  small.height = h
  const g = small.getContext("2d")!
  const img = g.createImageData(w, h)
  const cx = TABLE.x / CELL, cy = TABLE.y / CELL, R = TABLE.r / CELL
  const lx = CANDLE.x / CELL, ly = CANDLE.y / CELL
  const m = layout.map
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy
      const d = Math.hypot(dx, dy)
      const ld = Math.hypot(x - lx, y - ly)
      const light = Math.exp(-ld / 150) * 1.05
      let col: [number, number, number]
      if (d < R - 6) {
        // oak top: rings + plank grain, lit by the candle
        const grain = 0.5 + 0.5 * Math.sin(d * 0.9 + Math.sin(dy * 0.07) * 3) * 0.5 + 0.25 * Math.sin(x * 0.31 + y * 0.02)
        const edge = Math.min(1, (R - d) / 30)
        let v = (0.18 + grain * 0.16) * edge + light * 0.62
        // the carved map: a sunken frame (darker groove around it)
        const px = x * CELL, py = y * CELL
        const inMap = px > m.x - 18 && px < m.x + m.w + 18 && py > m.y - 18 && py < m.y + m.h + 18
        if (inMap) v *= 0.55
        col = ramp(WOOD, v, x, y)
      } else if (d < R + 4) col = ramp(RIM, 0.35 + light * 0.6, x, y)
      else {
        const shadow = d < R + 26 ? 0 : 1 // the table's shadow on the floor
        const v = (0.08 + Math.exp(-d / 260) * 0.5 + light * 0.25) * shadow
        col = ramp(FLOOR, v, x, y)
      }
      const o = (y * w + x) * 4
      img.data[o] = col[0]
      img.data[o + 1] = col[1]
      img.data[o + 2] = col[2]
      img.data[o + 3] = 255
    }
  g.putImageData(img, 0, 0)
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, w * CELL, h * CELL)
  // the candle: a pixel stub of wax and a flame (the flicker is CSS on top)
  ctx.fillStyle = "#efe6d2"
  ctx.fillRect(CANDLE.x - 15, CANDLE.y - 6, 30, 36)
  ctx.fillStyle = "#4a2410"
  ctx.fillRect(CANDLE.x - 24, CANDLE.y + 27, 48, 9)
  ctx.fillStyle = "#ff7a1a"
  ctx.fillRect(CANDLE.x - 6, CANDLE.y - 27, 12, 21)
  ctx.fillStyle = "#ffd27a"
  ctx.fillRect(CANDLE.x - 3, CANDLE.y - 21, 6, 12)
}
