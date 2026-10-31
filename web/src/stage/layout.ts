// Stage geometry: one 1920x1080 frame; the mansion cross-section fills the left 68%, the relay feed the rest.
// Every position on the stage derives from these numbers (rooms from contract ROOM_GRID).
import { ROOM_GRID, type RoomId } from "../../../contract/protocol"

export const STAGE_W = 1920
export const STAGE_H = 1080
export const MANSION_W = 1306 // 68%
export const FEED_X = MANSION_W

export const HOUSE_L = 96 // outer wall, left
export const HOUSE_R = 1210 // outer wall, right
export const HOUSE_CX = (HOUSE_L + HOUSE_R) / 2
export const WALL = 32
export const EAVES_Y = 300 // top of the attic floor
export const FLOOR_H = 240
export const GROUND_Y = EAVES_Y + FLOOR_H * 3 // 1020
export const SHAFT_L = 590
export const SHAFT_R = 716
export const SHAFT_CX = (SHAFT_L + SHAFT_R) / 2
export const BEAM = 16
export const CLOCK = { cx: HOUSE_CX, cy: 150, r: 86 }
export const DOOR = { x: SHAFT_CX, y: GROUND_Y, w: 78, h: 128 }

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface RoomBox {
  id: RoomId
  floor: number // 0 = attic floor (top)
  side: 0 | 1 // 0 = left of the shaft
  outer: Rect // the room including its frame
  inner: Rect // the painting
  door: { x: number; y: number } // on the shaft wall, at floor level
  center: { x: number; y: number }
}

export const ROOM_BOXES: Record<RoomId, RoomBox> = (() => {
  const out = {} as Record<RoomId, RoomBox>
  ROOM_GRID.forEach((row, floor) => {
    row.forEach((id, i) => {
      const side = i === 0 ? 0 : 1
      const x = side === 0 ? HOUSE_L + WALL : SHAFT_R
      const w = side === 0 ? SHAFT_L - x : HOUSE_R - WALL - SHAFT_R
      const y = EAVES_Y + floor * FLOOR_H + BEAM / 2
      const h = FLOOR_H - BEAM
      const inner = { x: x + 10, y: y + 10, w: w - 20, h: h - 18 }
      out[id] = {
        id,
        floor,
        side,
        outer: { x, y, w, h },
        inner,
        door: { x: side === 0 ? SHAFT_L : SHAFT_R, y: inner.y + inner.h - 46 },
        center: { x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 },
      }
    })
  })
  return out
})()

export const ROOM_IDS = Object.keys(ROOM_BOXES) as RoomId[]

/** A random point inside a room's painting, kept off the frame. */
export function roomPoint(id: RoomId, rnd: () => number, margin = 22): { x: number; y: number } {
  const r = ROOM_BOXES[id].inner
  return { x: r.x + margin + rnd() * (r.w - margin * 2), y: r.y + margin + 8 + rnd() * (r.h - margin * 2 - 8) }
}

/** Cubic bezier control points from a point to a point through the central stairwell (the "river"). */
export function shaftPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  jitter: number,
): [number, number, number, number, number, number, number, number] {
  const sx = SHAFT_CX + jitter
  return [from.x, from.y, sx, from.y + (to.y - from.y) * 0.08, sx, to.y - (to.y - from.y) * 0.08, to.x, to.y]
}

export function bezier(p: readonly number[], t: number, out: { x: number; y: number }): void {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  out.x = a * p[0] + b * p[2] + c * p[4] + d * p[6]
  out.y = a * p[1] + b * p[3] + c * p[5] + d * p[7]
}

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Deterministic per-string random (ghost ids -> stable anchors and phases). */
export function seeded(str: string): () => number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}
