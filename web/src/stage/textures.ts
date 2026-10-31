// Generated textures (no art dependency): wisp glow, spark, flashlight cone, light wipe, room placeholders.
import { Texture } from "pixi.js"
import type { RoomId } from "../../../contract/protocol"

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (!ctx) throw new Error("2d canvas unavailable")
  return [c, ctx]
}

/** Soft halo with a hot core; tinted per ghost, drawn additive. */
export function glowTexture(size = 64): Texture {
  const [c, g] = canvas(size, size)
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.12, "rgba(255,255,255,0.95)")
  grad.addColorStop(0.28, "rgba(255,255,255,0.45)")
  grad.addColorStop(0.55, "rgba(255,255,255,0.12)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return Texture.from(c)
}

export function sparkTexture(size = 16): Texture {
  const [c, g] = canvas(size, size)
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.4, "rgba(255,255,255,0.6)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return Texture.from(c)
}

/** A flashlight beam: apex at the left middle, opening to the right, soft edges, fading with distance. */
export function coneTexture(w = 512, h = 300): Texture {
  const [c, g] = canvas(w, h)
  g.filter = "blur(10px)"
  const lin = g.createLinearGradient(0, 0, w, 0)
  lin.addColorStop(0, "rgba(255,255,255,0.95)")
  lin.addColorStop(0.25, "rgba(255,255,255,0.55)")
  lin.addColorStop(0.7, "rgba(255,255,255,0.18)")
  lin.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = lin
  g.beginPath()
  g.moveTo(14, h / 2 - 6)
  g.lineTo(w - 20, 18)
  g.quadraticCurveTo(w + 30, h / 2, w - 20, h - 18)
  g.lineTo(14, h / 2 + 6)
  g.closePath()
  g.fill()
  // a hotter inner beam
  g.filter = "blur(6px)"
  const core = g.createLinearGradient(0, 0, w * 0.8, 0)
  core.addColorStop(0, "rgba(255,255,255,0.9)")
  core.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = core
  g.beginPath()
  g.moveTo(14, h / 2 - 3)
  g.lineTo(w * 0.8, h / 2 - 50)
  g.lineTo(w * 0.8, h / 2 + 50)
  g.lineTo(14, h / 2 + 3)
  g.closePath()
  g.fill()
  return Texture.from(c)
}

/** A vertical band of light for the cleanse wipe and sweep flashes. */
export function bandTexture(w = 128, h = 8): Texture {
  const [c, g] = canvas(w, h)
  const lin = g.createLinearGradient(0, 0, w, 0)
  lin.addColorStop(0, "rgba(255,255,255,0)")
  lin.addColorStop(0.5, "rgba(255,255,255,1)")
  lin.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = lin
  g.fillRect(0, 0, w, h)
  return Texture.from(c)
}

const PLACEHOLDER_TONES: Record<RoomId, [string, string]> = {
  attic: ["#2a2036", "#0d0912"],
  nursery: ["#33203a", "#100a14"],
  library: ["#2b2218", "#0e0a07"],
  ballroom: ["#3a2420", "#120a09"],
  chapel: ["#1f2433", "#090b12"],
  crypt: ["#1d2a24", "#080d0b"],
}

/** On-palette stand-in painting until the art lane delivers /art/room-<id>.webp. */
export function roomPlaceholder(id: RoomId, w = 884, h = 428): Texture {
  const [c, g] = canvas(w, h)
  const [hi, lo] = PLACEHOLDER_TONES[id]
  const bg = g.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, w * 0.7)
  bg.addColorStop(0, hi)
  bg.addColorStop(1, lo)
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.fillStyle = "rgba(0,0,0,0.55)"
  g.strokeStyle = "rgba(0,0,0,0.6)"
  g.lineWidth = 10
  const floorY = h * 0.84
  g.fillRect(0, floorY, w, h - floorY)
  if (id === "attic") {
    for (let i = 0; i < 7; i++) {
      g.beginPath()
      g.moveTo(w * 0.5, -10)
      g.lineTo(i * (w / 6), floorY)
      g.stroke()
    }
    g.fillRect(w * 0.12, floorY - 70, 90, 70)
    g.fillRect(w * 0.7, floorY - 110, 60, 110)
  } else if (id === "nursery") {
    g.fillRect(w * 0.15, floorY - 90, 160, 12)
    for (let i = 0; i < 9; i++) g.fillRect(w * 0.15 + i * 19, floorY - 90, 6, 90)
    g.beginPath()
    g.arc(w * 0.68, floorY - 40, 46, Math.PI, 0)
    g.fill()
    g.fillRect(w * 0.68 - 50, floorY - 10, 100, 10)
    g.beginPath()
    g.arc(w * 0.45, h * 0.3, 40, 0, Math.PI * 2)
    g.fillStyle = "rgba(255,240,210,0.08)"
    g.fill()
  } else if (id === "library") {
    for (let s = 0; s < 3; s++) {
      const x = w * 0.06 + s * w * 0.32
      g.fillRect(x, h * 0.08, w * 0.24, 10)
      for (let r = 1; r < 5; r++) {
        g.fillRect(x, h * 0.08 + r * 70, w * 0.24, 8)
        for (let b = 0; b < 14; b++) g.fillRect(x + 6 + b * 14, h * 0.08 + r * 70 - 52, 9, 52)
      }
    }
  } else if (id === "ballroom") {
    g.fillStyle = "rgba(255,220,160,0.10)"
    g.beginPath()
    g.ellipse(w * 0.5, h * 0.28, 120, 44, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = "rgba(0,0,0,0.7)"
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(w * 0.5, 0)
    g.lineTo(w * 0.5, h * 0.2)
    g.stroke()
    for (let i = 0; i < 7; i++) {
      g.beginPath()
      g.arc(w * 0.5, h * 0.2, 30 + i * 12, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    }
    g.fillStyle = "rgba(0,0,0,0.5)"
    for (let i = 0; i < 5; i++) g.fillRect(w * 0.08 + i * w * 0.2, h * 0.1, 22, floorY - h * 0.1)
  } else if (id === "chapel") {
    for (let i = 0; i < 3; i++) {
      const x = w * 0.2 + i * w * 0.3
      g.fillStyle = "rgba(160,190,255,0.10)"
      g.beginPath()
      g.moveTo(x - 40, floorY - 60)
      g.lineTo(x - 40, h * 0.3)
      g.quadraticCurveTo(x, h * 0.02, x + 40, h * 0.3)
      g.lineTo(x + 40, floorY - 60)
      g.fill()
    }
    g.fillStyle = "rgba(0,0,0,0.6)"
    for (let i = 0; i < 4; i++) g.fillRect(w * 0.1 + i * w * 0.22, floorY - 36, w * 0.16, 36)
  } else {
    for (let i = 0; i < 4; i++) {
      const x = w * 0.05 + i * w * 0.25
      g.beginPath()
      g.moveTo(x, floorY)
      g.lineTo(x, h * 0.35)
      g.quadraticCurveTo(x + w * 0.125, h * 0.02, x + w * 0.25, h * 0.35)
      g.stroke()
    }
    g.fillRect(w * 0.3, floorY - 40, 200, 40)
    g.fillRect(w * 0.62, floorY - 30, 170, 30)
  }
  // vignette
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62)
  v.addColorStop(0, "rgba(0,0,0,0)")
  v.addColorStop(1, "rgba(0,0,0,0.7)")
  g.fillStyle = v
  g.fillRect(0, 0, w, h)
  return Texture.from(c)
}

/** Night sky fallback: deep violet gradient, moon, stars. */
export function skyPlaceholder(w: number, h: number): Texture {
  const [c, g] = canvas(w, h)
  const bg = g.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, "#0a0716")
  bg.addColorStop(0.5, "#1a1030")
  bg.addColorStop(1, "#05040a")
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(255,255,255,${(Math.random() * 0.6 + 0.1).toFixed(2)})`
    g.fillRect(Math.random() * w, Math.random() * h * 0.5, Math.random() < 0.1 ? 2 : 1, Math.random() < 0.1 ? 2 : 1)
  }
  const mx = w * 0.2
  const my = h * 0.17
  const halo = g.createRadialGradient(mx, my, 10, mx, my, 260)
  halo.addColorStop(0, "rgba(220,215,255,0.35)")
  halo.addColorStop(1, "rgba(220,215,255,0)")
  g.fillStyle = halo
  g.fillRect(0, 0, w, h)
  g.fillStyle = "#e9e4ff"
  g.beginPath()
  g.arc(mx, my, 62, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = "rgba(160,150,200,0.35)"
  g.beginPath()
  g.arc(mx - 18, my - 10, 12, 0, Math.PI * 2)
  g.arc(mx + 20, my + 16, 8, 0, Math.PI * 2)
  g.fill()
  return Texture.from(c)
}

/** Rain streaks for a scrolling tiling sprite. */
export function rainTexture(w = 256, h = 256): Texture {
  const [c, g] = canvas(w, h)
  g.strokeStyle = "rgba(190,200,255,0.22)"
  g.lineWidth = 1
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const len = 10 + Math.random() * 18
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x - len * 0.25, y + len)
    g.stroke()
  }
  return Texture.from(c)
}
