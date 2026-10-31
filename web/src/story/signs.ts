// The startup street (lane L20): text-only parody ads for well-known YC companies painted onto L15's 8 blank blade signs
// (story.json "sf-street-billboard.webp".signs, quads TL,TR,BR,BL in 1920x1080 px, nearest first). The plate is
// recoloured in the dither buffer; the copy is warped onto the crisp overlay so it stays readable.
import type { LiveLayers, MapPt, Pt, Quad } from "./panels"

interface Copy {
  /** the company, set large */
  name: string
  /** the joke, one or two short lines */
  lines: readonly string[]
  color: string
}

// Text-only parody ads for well-known YC companies (owner decision 13:5x: names yes, logos never), in our pixel
// font. Dry, never about real people. Nearest sign first (the two nearest are cut by the frame edge).
const COPY: readonly Copy[] = [
  { name: "AIRBNB", lines: ["BOOK A HAUNTED VICTORIAN.", "SUPERHOST: DECEASED."], color: "#ff3b3b" },
  { name: "STRIPE", lines: ["PAYMENTS FOR", "THE AFTERLIFE."], color: "#d9c8ff" },
  { name: "DOORDASH", lines: ["DELIVERING TO", "THE CRYPT. 6 MIN."], color: "#ff7a1a" },
  { name: "COINBASE", lines: ["HODL.", "EVEN AFTER DEATH."], color: "#9fc4ff" },
  { name: "INSTACART", lines: ["CANDLES, SALT, HOLY WATER.", "IN STOCK."], color: "#ffd27a" },
  { name: "DROPBOX", lines: ["YOUR SOUL,", "BACKED UP."], color: "#9fc4ff" },
  { name: "GUSTO", lines: ["PAYROLL FOR", "THE UNDEAD."], color: "#ff7a1a" },
  { name: "DEMO DAY", lines: ["TONIGHT."], color: "#ff3b3b" },
]

const texCache = new Map<string, HTMLCanvasElement>()
/** Transparent texture with the two lines, sized to the sign's aspect. */
function copyTex(c: Copy, aspect: number): HTMLCanvasElement {
  const key = `${c.name}@${aspect.toFixed(2)}`
  const hit = texCache.get(key)
  if (hit) return hit
  const w = 640
  const h = Math.round(w / aspect)
  const cv = document.createElement("canvas")
  cv.width = w
  cv.height = h
  const g = cv.getContext("2d")
  if (!g) throw new Error("story: 2d canvas unavailable")
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.font = "100px GeistPixel"
  // name on top (large), joke below (smaller); both fit the width
  const nameW = g.measureText(c.name).width
  const jokeW = Math.max(...c.lines.map((t) => g.measureText(t).width))
  const n = c.lines.length
  const nameSize = Math.min(h * 0.34, (w * 0.8 * 100) / nameW)
  const jokeSize = Math.min((h * 0.42) / n, (w * 0.88 * 100) / jokeW, nameSize * 0.7)
  g.fillStyle = c.color
  g.shadowColor = c.color
  g.shadowBlur = nameSize * 0.3
  g.font = `${nameSize}px GeistPixel`
  g.fillText(c.name, w / 2, h * 0.3)
  g.fillStyle = "#efe6d2"
  g.shadowBlur = jokeSize * 0.3
  g.font = `${jokeSize}px GeistPixel`
  c.lines.forEach((t, j) => g.fillText(t, w / 2, h * (n === 1 ? 0.7 : 0.62 + j * 0.2)))
  texCache.set(key, cv)
  return cv
}

/** Texture into a quad, strip by strip (rows), on any context. */
export function drawQuad(g: CanvasRenderingContext2D, src: HTMLCanvasElement, q: readonly Pt[], rowsPerUnit = 4): void {
  const [tl, tr, br, bl] = q
  const rows = Math.max(8, Math.ceil(rowsPerUnit * Math.max(bl[1] - tl[1], br[1] - tr[1])))
  for (let r = 0; r < rows; r++) {
    const v0 = r / rows
    const v1 = (r + 1) / rows
    const lx = tl[0] + (bl[0] - tl[0]) * v0
    const ly = tl[1] + (bl[1] - tl[1]) * v0
    const rx = tr[0] + (br[0] - tr[0]) * v0
    const ly1 = tl[1] + (bl[1] - tl[1]) * v1
    g.drawImage(src, 0, v0 * src.height, src.width, src.height / rows, lx, ly, rx - lx, ly1 - ly + 0.6)
  }
}

function flick(now: number, i: number): number {
  const buzz = 0.9 + 0.1 * Math.sin(now / (29 + i * 7) + i)
  const p = (now / 1000 + i * 0.83) % (3.1 + i * 0.4)
  return p > 2.9 && p < 3.02 ? 0.3 : buzz
}

function path(g: CanvasRenderingContext2D, q: readonly Pt[]): void {
  g.beginPath()
  g.moveTo(q[0][0], q[0][1])
  for (const p of q.slice(1)) g.lineTo(p[0], p[1])
  g.closePath()
}

export function streetSigns({ g, hi }: LiveLayers, signs: readonly Quad[] | undefined, map: MapPt, now: number): void {
  if (!signs) return
  // far to near, so the near ones overlap the far ones
  for (let i = Math.min(signs.length, COPY.length) - 1; i >= 0; i--) {
    const src = signs[i]
    const c = COPY[i]
    const q = src.map(([x, y]) => map(x, y))
    const f = flick(now, i)
    // plate: dark, with a lit rim in the sign's colour (the frame edge clips the near ones for free)
    path(g, q)
    g.fillStyle = "#0d0816"
    g.fill()
    g.strokeStyle = c.color
    g.globalAlpha = f
    g.lineWidth = Math.max(0.7, Math.abs(q[1][0] - q[0][0]) * 0.03)
    g.stroke()
    g.globalAlpha = 1
    const aspect = Math.hypot(src[1][0] - src[0][0], src[1][1] - src[0][1]) / Math.hypot(src[3][0] - src[0][0], src[3][1] - src[0][1])
    hi.save()
    hi.globalAlpha = f
    drawQuad(hi, copyTex(c, aspect), q)
    hi.restore()
  }
}
