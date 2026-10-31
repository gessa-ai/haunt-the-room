// Pooled additive particles: bursts (banish, sweep), rising ectoplasm (possessed rooms), rings.
import { Container, Sprite, Texture } from "pixi.js"
import { sparkTexture } from "./textures"

interface Particle {
  s: Sprite
  vx: number
  vy: number
  life: number
  max: number
  drag: number
  grav: number
  size: number
  grow: number
}

function ringTexture(size = 128): Texture {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const g = c.getContext("2d")
  if (!g) throw new Error("2d canvas unavailable")
  const r = size / 2
  const grad = g.createRadialGradient(r, r, r * 0.6, r, r, r)
  grad.addColorStop(0, "rgba(255,255,255,0)")
  grad.addColorStop(0.75, "rgba(255,255,255,0.9)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return Texture.from(c)
}

export class Fx {
  private live: Particle[] = []
  private pool: Particle[] = []
  private spark = sparkTexture(24)
  private ring = ringTexture()

  constructor(private layer: Container) {}

  private take(tex: Texture): Particle {
    const p = this.pool.pop()
    if (p) {
      p.s.texture = tex
      p.s.visible = true
      return p
    }
    const s = new Sprite(tex)
    s.anchor.set(0.5)
    s.blendMode = "add"
    this.layer.addChild(s)
    return { s, vx: 0, vy: 0, life: 0, max: 1, drag: 0, grav: 0, size: 1, grow: 0 }
  }

  burst(x: number, y: number, color: number, count = 14, speed = 220, life = 0.9): void {
    for (let i = 0; i < count; i++) {
      const p = this.take(this.spark)
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.35 + Math.random() * 0.65)
      p.s.position.set(x, y)
      p.s.tint = color
      p.vx = Math.cos(a) * v
      p.vy = Math.sin(a) * v
      p.max = p.life = life * (0.6 + Math.random() * 0.4)
      p.drag = 2.6
      p.grav = 60
      p.size = 0.5 + Math.random() * 0.6
      p.grow = 0
      this.live.push(p)
    }
    const r = this.take(this.ring)
    r.s.position.set(x, y)
    r.s.tint = color
    r.vx = r.vy = 0
    r.max = r.life = 0.5
    r.drag = 0
    r.grav = 0
    r.size = 0.15
    r.grow = 1.4
    this.live.push(r)
  }

  ring2(x: number, y: number, color: number, size: number, grow: number, life: number): void {
    const r = this.take(this.ring)
    r.s.position.set(x, y)
    r.s.tint = color
    r.vx = r.vy = 0
    r.max = r.life = life
    r.drag = 0
    r.grav = 0
    r.size = size
    r.grow = grow
    this.live.push(r)
  }

  /** Slow rising motes inside a rect (possessed rooms). */
  rise(x: number, y: number, w: number, h: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take(this.spark)
      p.s.position.set(x + Math.random() * w, y + h - Math.random() * h * 0.3)
      p.s.tint = color
      p.vx = (Math.random() - 0.5) * 20
      p.vy = -40 - Math.random() * 60
      p.max = p.life = 1.6 + Math.random() * 1.2
      p.drag = 0.2
      p.grav = 0
      p.size = 0.4 + Math.random() * 0.8
      p.grow = 0
      this.live.push(p)
    }
  }

  get count(): number {
    return this.live.length
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]
      p.life -= dt
      if (p.life <= 0) {
        p.s.visible = false
        this.live[i] = this.live[this.live.length - 1]
        this.live.pop()
        this.pool.push(p)
        continue
      }
      const k = Math.exp(-p.drag * dt)
      p.vx *= k
      p.vy = p.vy * k + p.grav * dt
      p.s.x += p.vx * dt
      p.s.y += p.vy * dt
      const f = p.life / p.max
      p.size += p.grow * dt
      p.s.scale.set(p.size * (p.grow > 0 ? 1 : 0.5 + f * 0.5))
      p.s.alpha = p.grow > 0 ? f : Math.min(1, f * 1.6)
    }
  }
}
