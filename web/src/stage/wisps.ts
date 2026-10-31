// One glowing wisp per GhostTuple. Drifts inside its room; on a room change it streams through the stairwell
// with a light trail; joins pour in through the front door; banished = burst then dark; respawn = fade in.
import { Container, Sprite, Texture } from "pixi.js"
import { GHOST_COLORS, type GhostTuple, type RoomId } from "../../../contract/protocol"
import type { Fx } from "./fx"
import { DOOR, GROUND_Y, ROOM_BOXES, bezier, easeInOut, hexToNum, roomPoint, seeded, shaftPath } from "./layout"
import { glowTexture } from "./textures"

const TRAIL = 16
const COLORS = GHOST_COLORS.map(hexToNum)

interface Wisp {
  id: string
  s: Sprite
  color: number
  room: RoomId
  bot: boolean
  banished: boolean
  rnd: () => number
  x: number
  y: number
  ax: number
  ay: number
  tx: number
  ty: number
  retarget: number
  ph1: number
  ph2: number
  f1: number
  f2: number
  amp: number
  // travel
  path: number[] | null
  t: number
  dur: number
  delay: number
  // fades
  alpha: number
  alphaTo: number
  dying: boolean
  trail: Sprite[] | null
  hist: Float32Array
  histLen: number
  histHead: number
  tail: number // frames the trail keeps collapsing after arrival
  hl: number // seconds of "that's me" highlight left
}

export class Wisps {
  private wisps = new Map<string, Wisp>()
  private trailPool: Sprite[] = []
  private tex: Texture = glowTexture(64)
  private trailLayer = new Container()
  private headLayer = new Container()
  private seen = new Set<string>()
  private time = 0
  private tmp = { x: 0, y: 0 }

  constructor(
    layer: Container,
    private fx: Fx,
    private onJoinPour: () => void,
  ) {
    layer.addChild(this.trailLayer, this.headLayer)
  }

  get size(): number {
    return this.wisps.size
  }

  /** Apply a snapshot. `instant` places everyone without travel (first snapshot after a (re)connect). */
  apply(ghosts: GhostTuple[], instant: boolean): void {
    this.seen.clear()
    let poured = 0
    let sparks = 360 // a sweep of 150 ghosts must not become 2,500 particles
    for (const [id, colorIndex, room, flags] of ghosts) {
      this.seen.add(id)
      const banished = (flags & 1) === 1
      const bot = (flags & 2) === 2
      let w = this.wisps.get(id)
      if (!w) {
        w = this.create(id, colorIndex, room, bot)
        if (banished) {
          w.banished = true
          w.alpha = w.alphaTo = 0
        } else if (instant) {
          w.alpha = 0
          w.alphaTo = 1
        } else {
          // pour in through the front door
          const from = { x: DOOR.x + (w.rnd() - 0.5) * 50, y: GROUND_Y + 30 }
          w.x = from.x
          w.y = from.y
          this.travel(w, 1.6 + w.rnd() * 0.8, w.rnd() * 0.6)
          w.alpha = 0
          w.alphaTo = 1
          poured++
        }
        continue
      }
      if (w.dying) {
        w.dying = false
        w.alphaTo = 1
      }
      w.bot = bot
      if (banished && !w.banished) {
        w.banished = true
        w.alphaTo = 0
        w.path = null
        const n = sparks > 0 ? 12 : 2
        sparks -= n
        this.fx.burst(w.x, w.y, w.color, n, 260, 1)
      } else if (!banished && w.banished) {
        w.banished = false
        w.room = room
        const p = roomPoint(room, w.rnd)
        w.ax = w.tx = w.x = p.x
        w.ay = w.ty = w.y = p.y
        w.alpha = 0
        w.alphaTo = 1
        this.fx.ring2(p.x, p.y, w.color, 0.1, 0.9, 0.6)
      } else if (room !== w.room) {
        w.room = room
        if (banished || instant) {
          const p = roomPoint(room, w.rnd)
          w.ax = w.tx = w.x = p.x
          w.ay = w.ty = w.y = p.y
        } else this.travel(w, 0.9 + w.rnd() * 0.6, w.rnd() * 0.3)
      }
    }
    for (const w of this.wisps.values()) {
      if (!this.seen.has(w.id) && !w.dying) {
        w.dying = true
        w.alphaTo = 0
      }
    }
    if (poured > 0) this.onJoinPour()
  }

  private create(id: string, colorIndex: number, room: RoomId, bot: boolean): Wisp {
    const rnd = seeded(id)
    const p = roomPoint(room, rnd)
    const s = new Sprite(this.tex)
    s.anchor.set(0.5)
    s.blendMode = "add"
    const color = COLORS[((colorIndex % COLORS.length) + COLORS.length) % COLORS.length]
    s.tint = color
    this.headLayer.addChild(s)
    const w: Wisp = {
      id,
      s,
      color,
      room,
      bot,
      banished: false,
      rnd,
      x: p.x,
      y: p.y,
      ax: p.x,
      ay: p.y,
      tx: p.x,
      ty: p.y,
      retarget: 1 + rnd() * 4,
      ph1: rnd() * 6.28,
      ph2: rnd() * 6.28,
      f1: 0.5 + rnd() * 0.9,
      f2: 0.4 + rnd() * 0.8,
      amp: 4 + rnd() * 7,
      path: null,
      t: 0,
      dur: 1,
      delay: 0,
      alpha: 0,
      alphaTo: 1,
      dying: false,
      trail: null,
      hist: new Float32Array(TRAIL * 2 * 2),
      histLen: 0,
      histHead: 0,
      tail: 0,
      hl: 0,
    }
    this.wisps.set(id, w)
    return w
  }

  private travel(w: Wisp, dur: number, delay: number): void {
    const to = roomPoint(w.room, w.rnd)
    w.path = shaftPath({ x: w.x, y: w.y }, to, (w.rnd() - 0.5) * 84)
    w.ax = w.tx = to.x
    w.ay = w.ty = to.y
    w.t = 0
    w.dur = dur + Math.abs(to.y - w.y) / 1400
    w.delay = delay
    if (!w.trail) {
      w.trail = []
      for (let i = 0; i < TRAIL; i++) {
        const t = this.trailPool.pop() ?? this.newTrail()
        t.visible = true
        t.tint = w.color
        w.trail.push(t)
      }
      w.histLen = 0
    }
    w.tail = TRAIL * 2
  }

  private newTrail(): Sprite {
    const t = new Sprite(this.tex)
    t.anchor.set(0.5)
    t.blendMode = "add"
    this.trailLayer.addChild(t)
    return t
  }

  private releaseTrail(w: Wisp): void {
    if (!w.trail) return
    for (const t of w.trail) {
      t.visible = false
      this.trailPool.push(t)
    }
    w.trail = null
  }

  /** "That's me": the wisp swells and burns bright for a moment. */
  highlight(id: string, seconds: number): boolean {
    const w = this.wisps.get(id)
    if (!w || w.banished || w.dying) return false
    w.hl = seconds
    this.fx.ring2(w.x, w.y, w.color, 0.15, 1.8, 0.7)
    this.fx.burst(w.x, w.y, w.color, 10, 160, 0.7)
    return true
  }

  /** A sweep lands: everyone left in the room is thrown away from its centre. */
  scatter(room: RoomId): void {
    const b = ROOM_BOXES[room].inner
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    for (const w of this.wisps.values()) {
      if (w.room !== room || w.banished || w.dying || w.path) continue
      const dx = w.x - cx || w.rnd() - 0.5
      const dy = w.y - cy || w.rnd() - 0.5
      const d = Math.hypot(dx, dy) || 1
      const k = 40 + w.rnd() * 50
      w.x = Math.min(b.x + b.w - 10, Math.max(b.x + 10, w.x + (dx / d) * k))
      w.y = Math.min(b.y + b.h - 10, Math.max(b.y + 10, w.y + (dy / d) * k * 0.7))
      w.ax = w.tx = w.x
      w.ay = w.ty = w.y
    }
  }

  isBot(id: string): boolean {
    return this.wisps.get(id)?.bot ?? true
  }

  colorOf(id: string): string {
    const w = this.wisps.get(id)
    return w ? `#${w.color.toString(16).padStart(6, "0")}` : "#ffffff"
  }

  positionOf(id: string): { x: number; y: number } | null {
    const w = this.wisps.get(id)
    return w && !w.banished ? { x: w.x, y: w.y } : null
  }

  /** Positions of live (not banished) wisps in a room: sweeps burst them. */
  positionsIn(room: RoomId): { x: number; y: number; color: number }[] {
    const out: { x: number; y: number; color: number }[] = []
    for (const w of this.wisps.values()) if (w.room === room && !w.banished && !w.dying) out.push({ x: w.x, y: w.y, color: w.color })
    return out
  }

  update(dt: number): void {
    this.time += dt
    const t = this.time
    for (const w of this.wisps.values()) {
      // fade
      w.alpha += (w.alphaTo - w.alpha) * Math.min(1, dt * (w.alphaTo > w.alpha ? 3 : 5))
      if (w.dying && w.alpha < 0.02) {
        this.releaseTrail(w)
        w.s.destroy()
        this.wisps.delete(w.id)
        continue
      }
      if (w.path) {
        if (w.delay > 0) w.delay -= dt
        else {
          w.t += dt / w.dur
          if (w.t >= 1) {
            w.t = 1
            bezier(w.path, 1, this.tmp)
            w.path = null
          } else bezier(w.path, easeInOut(w.t), this.tmp)
          w.x = this.tmp.x
          w.y = this.tmp.y
        }
      } else if (!w.banished) {
        // drift around a slowly wandering anchor
        w.retarget -= dt
        if (w.retarget <= 0) {
          const b = ROOM_BOXES[w.room].inner
          const nx = w.ax + (w.rnd() - 0.5) * 70
          const ny = w.ay + (w.rnd() - 0.5) * 40
          w.tx = Math.min(b.x + b.w - 22, Math.max(b.x + 22, nx))
          w.ty = Math.min(b.y + b.h - 18, Math.max(b.y + 30, ny))
          w.retarget = 2 + w.rnd() * 4
        }
        w.ax += (w.tx - w.ax) * Math.min(1, dt * 0.6)
        w.ay += (w.ty - w.ay) * Math.min(1, dt * 0.6)
        const tx = w.ax + Math.sin(t * w.f1 + w.ph1) * w.amp
        const ty = w.ay + Math.sin(t * w.f2 + w.ph2) * w.amp * 0.7
        w.x += (tx - w.x) * Math.min(1, dt * 3)
        w.y += (ty - w.y) * Math.min(1, dt * 3)
      }
      const flicker = 0.86 + 0.14 * Math.sin(t * (2.3 + w.f1) + w.ph2)
      if (w.hl > 0) w.hl = Math.max(0, w.hl - dt)
      const hl = w.hl > 0 ? Math.min(1, w.hl * 2) : 0
      const base = (w.bot ? 0.5 : 0.95) + hl * 0.4
      const scale = (w.bot ? 0.42 : 0.56) * (1 + hl * 1.4 * (0.85 + 0.15 * Math.sin(t * 14)))
      w.s.position.set(w.x, w.y)
      w.s.alpha = w.alpha * base * flicker
      w.s.scale.set(scale * (0.92 + 0.08 * Math.sin(t * 3 + w.ph1)))

      if (w.trail) {
        // ring buffer of recent positions
        w.histHead = (w.histHead + 1) % (TRAIL * 2)
        w.hist[w.histHead * 2] = w.x
        w.hist[w.histHead * 2 + 1] = w.y
        w.histLen = Math.min(TRAIL * 2, w.histLen + 1)
        if (!w.path) w.tail--
        for (let k = 0; k < TRAIL; k++) {
          const sp = w.trail[k]
          const back = k + 1
          if (back >= w.histLen || w.tail <= 0) {
            sp.alpha = 0
            continue
          }
          const idx = (w.histHead - back + TRAIL * 4) % (TRAIL * 2)
          sp.position.set(w.hist[idx * 2], w.hist[idx * 2 + 1])
          const f = 1 - (k + 1) / (TRAIL + 1)
          sp.alpha = w.s.alpha * f * f * 0.75 * Math.min(1, w.tail / TRAIL)
          sp.scale.set(scale * (0.35 + 0.6 * f))
        }
        if (w.tail <= 0) this.releaseTrail(w)
      }
    }
  }
}
