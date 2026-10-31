// The story slides (lane L20): copy, Ken Burns moves and the source art for each panel.
// Art: lane L15's Blender renders in /3d/story/<name>.webp (or .png) when they exist; until then each slide paints
// its own placeholder (or uses existing stage art). Every slide is composed once into a 1920x1080 canvas.

import { drawQuad, streetSigns } from "./signs"
import { HIRE } from "./hire"

export const SRC_W = 1920
export const SRC_H = 1080

export interface Move {
  /** zoom (1 = the full frame) */
  s: number
  /** focus centre, 0..1 of the frame */
  x: number
  y: number
}

export interface Panel {
  id: string
  caption: string
  from: Move
  to: Move
  /** L15 render name in /3d/story/ */
  render?: string
  /** existing art used when the render is missing */
  fallback?: string
  /** placeholder painter when neither image loads */
  paint?: (g: CanvasRenderingContext2D) => void
  /** draws over the art (billboard copy, the hunters) */
  overlay?: (g: CanvasRenderingContext2D, meta: StoryMeta) => void | Promise<void>
  /** drawn every frame over the slide: plates into the dither buffer (l.g), copy onto the crisp overlay (l.hi).
   *  k = this shot's eased progress 0..1. */
  live?: (l: LiveLayers, meta: StoryMeta, map: MapPt, now: number, k: number, ms: number) => void
  /** this slide's length (default: the reel's beat) */
  ms?: number
  /** ease-in push with zoom blur: the camera rushes forward */
  rush?: boolean
  /** hard cuts inside the slide from `at` (0..1 of the slide): a run of stills sharing the rest of the slide by
   *  weight, each with the same push (a dolly in jumps) */
  cut?: { renders: readonly string[]; weights: readonly number[]; at: number; from: Move; to: Move }
}

/** g = the 480x270 dither buffer; hi = the crisp overlay, transformed so it takes the same buffer coordinates. */
export interface LiveLayers {
  g: CanvasRenderingContext2D
  hi: CanvasRenderingContext2D
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
/** Optional /3d/story/story.json from L15: the billboard face in sf-street-billboard pixels (1920x1080 space). */
export type Pt = readonly [number, number]
/** TL, TR, BR, BL */
export type Quad = readonly [Pt, Pt, Pt, Pt]
export interface StoryMeta {
  billboard?: Quad
  /** L15's blank blade signs on the street, nearest first */
  signs?: readonly Quad[]
}
/** source px (1920x1080) -> dither-buffer px for the current frame */
export type MapPt = (x: number, y: number) => Pt

const FONT = "GeistPixel"
export const BILLBOARD_LINES = ["THIS IS NOT AN AI AD.", "YOU ARE ALL DEAD."] as const

// ---------- placeholder painters ----------
function sky(g: CanvasRenderingContext2D, top: string, bottom: string): void {
  const gr = g.createLinearGradient(0, 0, 0, SRC_H)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bottom)
  g.fillStyle = gr
  g.fillRect(0, 0, SRC_W, SRC_H)
}

function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 3.2)
  halo.addColorStop(0, "rgba(159,196,255,0.45)")
  halo.addColorStop(1, "rgba(159,196,255,0)")
  g.fillStyle = halo
  g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8)
  const body = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  body.addColorStop(0, "#fffbe9")
  body.addColorStop(1, "#d9c8ff")
  g.fillStyle = body
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = "rgba(120,110,160,0.35)"
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.15], [0.35, -0.35, 0.08]]) {
    g.beginPath()
    g.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2)
    g.fill()
  }
}

function paintWindowMoon(g: CanvasRenderingContext2D): void {
  // cabin wall
  sky(g, "#2b1838", "#0d0816")
  const cx = SRC_W / 2
  const cy = SRC_H / 2
  // window bezel
  g.fillStyle = "#42245a"
  roundRect(g, cx - 330, cy - 430, 660, 860, 300)
  g.fill()
  g.save()
  roundRect(g, cx - 270, cy - 370, 540, 740, 250)
  g.clip()
  sky(g, "#0c1f2a", "#1b2a52")
  // clouds
  g.fillStyle = "rgba(27,42,82,0.9)"
  for (let i = 0; i < 9; i++) {
    g.beginPath()
    g.ellipse(cx - 400 + i * 110, cy + 260 + (i % 3) * 30, 160, 50, 0, 0, Math.PI * 2)
    g.fill()
  }
  moon(g, cx + 40, cy - 90, 120)
  // wing tip
  g.fillStyle = "#0d0816"
  g.beginPath()
  g.moveTo(cx - 300, cy + 220)
  g.lineTo(cx + 300, cy + 120)
  g.lineTo(cx + 300, cy + 170)
  g.lineTo(cx - 300, cy + 300)
  g.fill()
  g.fillStyle = "#ff3b3b"
  g.beginPath()
  g.arc(cx + 250, cy + 135, 10, 0, Math.PI * 2)
  g.fill()
  g.restore()
  // window shade edge
  g.fillStyle = "#1a1026"
  roundRect(g, cx - 270, cy - 370, 540, 110, 60)
  g.fill()
}

function paintCabin(g: CanvasRenderingContext2D): void {
  sky(g, "#1a1026", "#040307")
  const vx = SRC_W / 2
  const vy = SRC_H * 0.42
  // aisle floor
  g.fillStyle = "#0d0816"
  g.beginPath()
  g.moveTo(vx - 40, vy)
  g.lineTo(vx + 40, vy)
  g.lineTo(vx + 520, SRC_H)
  g.lineTo(vx - 520, SRC_H)
  g.fill()
  // reading lights strip
  for (let i = 0; i < 9; i++) {
    const t = i / 9
    const y = vy - 300 * (1 - t) ** 1.2 - 40
    const sx = 40 + 900 * (1 - t)
    g.fillStyle = `rgba(255,210,122,${0.25 + 0.5 * (1 - t)})`
    g.fillRect(vx - sx, y, 14 * (1 - t) + 4, 6 * (1 - t) + 2)
    g.fillRect(vx + sx - 14 * (1 - t), y, 14 * (1 - t) + 4, 6 * (1 - t) + 2)
  }
  // seat rows
  for (let i = 8; i >= 0; i--) {
    const t = i / 9
    const k = 1 - t
    const w = 90 + 420 * k
    const h = 120 + 520 * k
    const y = vy + 40 + 600 * k ** 1.6
    g.fillStyle = i % 2 ? "#2b1838" : "#42245a"
    roundRect(g, vx - 60 - 520 * k - w, y - h, w, h, 30 * k + 6)
    g.fill()
    roundRect(g, vx + 60 + 520 * k, y - h, w, h, 30 * k + 6)
    g.fill()
  }
  // the attendant: tall silhouette in the aisle, two lit eyes that never close
  const ax = vx
  const ay = vy + 230
  g.fillStyle = "#040307"
  roundRect(g, ax - 70, ay - 330, 140, 420, 50)
  g.fill()
  g.beginPath()
  g.arc(ax, ay - 380, 58, 0, Math.PI * 2)
  g.fill()
  // cart
  g.fillStyle = "#4a2410"
  g.fillRect(ax - 110, ay + 20, 220, 150)
  g.fillStyle = "#ffffff"
  for (const dx of [-20, 20]) {
    g.beginPath()
    g.arc(ax + dx, ay - 388, 9, 0, Math.PI * 2)
    g.fill()
  }
}

function paintStreet(g: CanvasRenderingContext2D): void {
  sky(g, "#0d0816", "#1b2a52")
  moon(g, 1650, 170, 70)
  // skyline
  g.fillStyle = "#040307"
  let x = 0
  let i = 0
  while (x < SRC_W) {
    const w = 80 + ((i * 53) % 120)
    const h = 260 + ((i * 97) % 380)
    g.fillRect(x, SRC_H - h, w, h)
    g.fillStyle = "rgba(255,210,122,0.5)"
    for (let wy = SRC_H - h + 20; wy < SRC_H - 140; wy += 34)
      for (let wx = x + 12; wx < x + w - 12; wx += 26) if ((wx * 7 + wy * 3 + i) % 5 === 0) g.fillRect(wx, wy, 10, 14)
    g.fillStyle = "#040307"
    x += w + 6
    i++
  }
  // a cable car line + hill street
  g.fillStyle = "#0d0816"
  g.beginPath()
  g.moveTo(0, SRC_H)
  g.lineTo(0, SRC_H - 120)
  g.lineTo(SRC_W, SRC_H - 260)
  g.lineTo(SRC_W, SRC_H)
  g.fill()
  // billboard frame + legs
  const b = PLACEHOLDER_BILLBOARD
  g.fillStyle = "#1a1026"
  g.fillRect(b.x + b.w * 0.2, b.y + b.h, 26, 380)
  g.fillRect(b.x + b.w * 0.8 - 26, b.y + b.h, 26, 380)
  g.fillStyle = "#2b1838"
  g.fillRect(b.x - 24, b.y - 24, b.w + 48, b.h + 48)
  g.fillStyle = "#0d0816"
  g.fillRect(b.x, b.y, b.w, b.h)
  // lamps
  g.fillStyle = "rgba(239,230,210,0.9)"
  for (let k = 0; k < 4; k++) g.fillRect(b.x + 60 + k * ((b.w - 120) / 3) - 14, b.y + b.h + 24, 28, 10)
}

const PLACEHOLDER_BILLBOARD: Rect = { x: 360, y: 150, w: 1200, h: 440 }

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

// ---------- overlays ----------
const rectQuad = (b: Rect): Quad => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]

/** The billboard copy as two face textures (lit face + line 1, line 2 alone) so line 2 can fail on its own. */
const TEX_W = 1024
const TEX_H = 356
let tex: { face: HTMLCanvasElement; dead: HTMLCanvasElement } | null = null
function billboardTex(): { face: HTMLCanvasElement; dead: HTMLCanvasElement } {
  if (tex) return tex
  const mk = () => {
    const c = document.createElement("canvas")
    c.width = TEX_W
    c.height = TEX_H
    const g = c.getContext("2d")
    if (!g) throw new Error("story: 2d canvas unavailable")
    g.textAlign = "center"
    g.textBaseline = "middle"
    return [c, g] as const
  }
  const [face, fg] = mk()
  const [dead, dg] = mk()
  let size = TEX_H * 0.3
  fg.font = `${size}px ${FONT}`
  const widest = Math.max(...BILLBOARD_LINES.map((l) => fg.measureText(l).width))
  if (widest > TEX_W * 0.92) size *= (TEX_W * 0.92) / widest
  fg.font = dg.font = `${size}px ${FONT}`
  fg.fillStyle = "#040307"
  fg.fillText(BILLBOARD_LINES[0], TEX_W / 2, TEX_H * 0.32)
  dg.fillStyle = "#ff3b3b"
  dg.fillText(BILLBOARD_LINES[1], TEX_W / 2, TEX_H * 0.7)
  tex = { face, dead }
  return tex
}

/** Sodium-lamp flicker: steady with a soft buzz, a dip every few seconds; line 2 sometimes drops out alone. */
function flicker(now: number, seed: number): number {
  const buzz = 0.93 + 0.07 * Math.sin(now / 37 + seed) * Math.sin(now / 13 + seed * 2)
  const phase = (now / 1000 + seed) % 2.7
  const dip = phase > 2.35 && phase < 2.5 ? (Math.random() < 0.5 ? 0.25 : 0.6) : 1
  return buzz * dip
}

function billboardLive({ g, hi }: LiveLayers, meta: StoryMeta, map: MapPt, now: number): void {
  const t = billboardTex()
  const q = (meta.billboard ?? rectQuad(PLACEHOLDER_BILLBOARD)).map(([x, y]) => map(x, y))
  const f = flicker(now, 0)
  const cx = (q[0][0] + q[2][0]) / 2
  const cy = (q[0][1] + q[2][1]) / 2
  const span = Math.abs(q[1][0] - q[0][0])
  // light spill on the fog around the board
  const glow = g.createRadialGradient(cx, cy, span * 0.2, cx, cy, span * 1.1)
  glow.addColorStop(0, `rgba(239,230,210,${0.28 * f})`)
  glow.addColorStop(1, "rgba(239,230,210,0)")
  g.fillStyle = glow
  g.fillRect(cx - span * 1.2, cy - span * 1.2, span * 2.4, span * 2.4)
  g.fillStyle = "#0d0816"
  g.beginPath()
  g.moveTo(q[0][0], q[0][1])
  for (const p of q.slice(1)) g.lineTo(p[0], p[1])
  g.closePath()
  g.fill()
  // the lit face (dithered), then the copy (crisp)
  g.fillStyle = `rgba(239,230,210,${f.toFixed(3)})`
  g.fill()
  hi.save()
  hi.globalAlpha = f
  drawQuad(hi, t.face, q)
  hi.globalAlpha = f * flicker(now, 1.3)
  drawQuad(hi, t.dead, q)
  hi.restore()
}

function streetLive(l: LiveLayers, meta: StoryMeta, map: MapPt, now: number): void {
  streetSigns(l, meta.signs, map, now)
  billboardLive(l, meta, map, now)
}

const HUNTERS = ["hunter-priest", "hunter-medium", "hunter-skeptic", "hunter-exorcist"] as const

async function hunterLineup(g: CanvasRenderingContext2D): Promise<void> {
  g.fillStyle = "rgba(4,3,7,0.55)"
  g.fillRect(0, 0, SRC_W, SRC_H)
  const imgs = await Promise.all(HUNTERS.map((h) => loadImage(`/art/${h}.png`)))
  const slot = SRC_W / 4.4
  imgs.forEach((img, i) => {
    if (!img) return
    const h = SRC_H * 0.78
    const w = (img.width / img.height) * h
    const cx = SRC_W / 2 + (i - 1.5) * slot
    // each leans toward the middle: they are arguing
    g.save()
    g.translate(cx, SRC_H * 0.98)
    g.rotate((i < 2 ? 1 : -1) * 0.04)
    g.drawImage(img, -w / 2, -h, w, h)
    g.restore()
  })
}

// ---------- the reel ----------
export const PANELS: readonly Panel[] = [
  {
    id: "window",
    caption: "Halloween. You fly to SF to pitch.",
    render: "plane-window-moon",
    paint: paintWindowMoon,
    from: { s: 1.0, x: 0.5, y: 0.5 },
    to: { s: 1.12, x: 0.5, y: 0.47 },
  },
  {
    id: "attendant",
    caption: "The flight attendant hasn't blinked since Denver.",
    render: "plane-interior",
    paint: paintCabin,
    from: { s: 1.05, x: 0.5, y: 0.55 },
    to: { s: 1.3, x: 0.5, y: 0.32 },
  },
  {
    id: "moon",
    caption: "Full moon. It keeps pace with the plane.",
    render: "plane-window-moon",
    paint: paintWindowMoon,
    from: { s: 1.15, x: 0.5, y: 0.45 },
    to: { s: 1.4, x: 0.5, y: 0.42 },
  },
  {
    id: "billboard",
    caption: "Then the billboard on the 101.",
    render: "sf-street-billboard",
    paint: paintStreet,
    live: streetLive,
    from: { s: 1.0, x: 0.5, y: 0.5 },
    to: { s: 2.3, x: 0.5, y: 0.32 },
  },
  {
    id: "gate",
    caption: "Your Uber stops at a Victorian. Then vanishes.",
    // the street again, the camera floors it down the road, hard cut: the house is waiting at the end
    render: "sf-street-billboard",
    paint: paintStreet,
    rush: true,
    live: streetLive,
    from: { s: 1.0, x: 0.5, y: 0.57 },
    to: { s: 2.6, x: 0.5, y: 0.57 },
    // L15 street-to-house-1/2/3: the camera at 90, 60, 34 m from the house; the last frame lingers
    cut: { renders: ["street-to-house-1", "street-to-house-2", "street-to-house-3"], weights: [1, 1, 3.2], at: 0.3, from: { s: 1.0, x: 0.5, y: 0.5 }, to: { s: 1.14, x: 0.5, y: 0.5 } },
  },
  {
    id: "house",
    caption: "Inside, four exorcists are already arguing about you.",
    fallback: "/3d/stage/overview.webp", // L15: no separate house-overview render; the stage overview is it
    from: { s: 1.0, x: 0.5, y: 0.5 },
    to: { s: 1.35, x: 0.4, y: 0.55 },
  },
  {
    id: "hunters",
    caption: "Good news: you're early. Bad news: you're dead.",
    fallback: "/3d/stage/killcam-ballroom-dark.webp",
    overlay: hunterLineup,
    from: { s: 1.12, x: 0.5, y: 0.45 },
    to: { s: 1.0, x: 0.5, y: 0.5 },
  },
  // the prelude (L20b): the landlord's ad, four hires, fast-forward to the table; then the stage's "Welcome, YC."
  ...HIRE,
]

/** The 12-second finalist cut: four slides, 3 s each. */
export const SHORT_IDS = ["attendant", "billboard", "house", "hunters", ...HIRE.map((p) => p.id)] as const

// ---------- loading ----------
const cache = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    cache.set(url, p)
  }
  return p
}

/** L15's story.json: { "sf-street-billboard.webp": { "face": { x, y, w, h, quad } } } in 1920x1080 px. */
export async function loadMeta(): Promise<StoryMeta> {
  try {
    const r = await fetch("/3d/story/story.json")
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return {}
    const j = (await r.json()) as Record<string, { face?: { quad?: Pt[] }; signs?: Pt[][] } | undefined>
    const street = j["sf-street-billboard.webp"]
    const quad = (q: Pt[] | undefined): Quad | undefined => (q?.length === 4 ? [q[0], q[1], q[2], q[3]] : undefined)
    return {
      billboard: quad(street?.face?.quad),
      signs: street?.signs?.map(quad).filter((q): q is Quad => !!q),
    }
  } catch (err) {
    console.warn("[story] story.json unreadable", err)
    return {}
  }
}

async function renderImage(name: string): Promise<HTMLImageElement | null> {
  return (await loadImage(`/3d/story/${name}.webp`)) ?? (await loadImage(`/3d/story/${name}.png`))
}

function cover(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }): void {
  const s = Math.max(SRC_W / img.width, SRC_H / img.height)
  const w = img.width * s
  const h = img.height * s
  g.drawImage(img, (SRC_W - w) / 2, (SRC_H - h) / 2, w, h)
}

export interface Composed {
  canvas: HTMLCanvasElement
  /** which art it used, for the status file */
  source: string
}

/** Compose a slide once: render > existing art > painted placeholder, then its overlay. */
export async function compose(p: Panel, meta: StoryMeta): Promise<Composed> {
  const canvas = document.createElement("canvas")
  canvas.width = SRC_W
  canvas.height = SRC_H
  const g = canvas.getContext("2d")
  if (!g) throw new Error("story: 2d canvas unavailable")
  let source = "placeholder"
  const render = p.render ? await renderImage(p.render) : null
  const fb = !render && p.fallback ? await loadImage(p.fallback) : null
  if (render) {
    cover(g, render)
    source = `render:${p.render}`
  } else if (fb) {
    cover(g, fb)
    source = `art:${p.fallback}`
  } else if (p.paint) {
    p.paint(g)
  } else {
    g.fillStyle = "#0d0816"
    g.fillRect(0, 0, SRC_W, SRC_H)
  }
  if (p.overlay) await p.overlay(g, meta)
  return { canvas, source }
}
