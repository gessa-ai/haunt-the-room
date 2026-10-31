// On-palette placeholder art under the exact contract file names, so the stage and phone are never blocked.
// Run: bun art/placeholders.ts   (rsvg-convert + cwebp + magick from Homebrew; no network)
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { HUNTERS, ROOMS, ROOM_STYLE, type HunterId, type RoomId } from "../contract/protocol.ts"
import { PALETTE as P } from "./palette.ts"

const ART = import.meta.dir
const OUT = join(ART, "../web/public/art")
const BUILD = join(ART, "build/placeholders")
mkdirSync(OUT, { recursive: true })
mkdirSync(BUILD, { recursive: true })

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
let ids = 0
const f = (n: number) => n.toFixed(1)
type Stop = [number, string, number?]

class Svg {
  defs: string[] = []
  body: string[] = []
  constructor(
    readonly w: number,
    readonly h: number,
    readonly opaque = true, // screen blending only composites correctly over an opaque backdrop
  ) {}
  add(...s: string[]) {
    this.body.push(...s)
  }
  private grad(kind: "linear" | "radial", attrs: string, stops: Stop[]) {
    const id = `g${++ids}`
    const st = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")
    this.defs.push(`<${kind}Gradient id="${id}" ${attrs}>${st}</${kind}Gradient>`)
    return `url(#${id})`
  }
  v(stops: Stop[]) {
    return this.grad("linear", 'x1="0" y1="0" x2="0" y2="1"', stops)
  }
  hz(stops: Stop[]) {
    return this.grad("linear", 'x1="0" y1="0" x2="1" y2="0"', stops)
  }
  rad(stops: Stop[], attrs = "") {
    return this.grad("radial", attrs, stops)
  }
  filter(inner: string, region = 'x="-30%" y="-30%" width="160%" height="160%"') {
    const id = `f${++ids}`
    this.defs.push(`<filter id="${id}" ${region} color-interpolation-filters="sRGB">${inner}</filter>`)
    return `url(#${id})`
  }
  blur(sd: number) {
    return this.filter(`<feGaussianBlur stdDeviation="${sd}"/>`)
  }
  glow(cx: number, cy: number, r: number, color: string, a = 0.5) {
    const fill = this.rad([[0, color, a], [0.22, color, a * 0.5], [0.55, color, a * 0.14], [1, color, 0]])
    this.add(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${this.opaque ? 'style="mix-blend-mode:screen"' : ""}/>`)
  }
  doc(inner = this.body.join("")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"><defs>${this.defs.join("")}</defs>${inner}</svg>`
  }
}

const pts = (p: number[][]) => p.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")
const poly = (p: number[][], fill: string, extra = "") => `<polygon points="${pts(p)}" fill="${fill}" ${extra}/>`
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`
const circle = (cx: number, cy: number, r: number, fill: string, extra = "") =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${extra}/>`
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, extra = "") =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`

function render(name: string, svg: string, w: number, h: number) {
  const svgPath = join(BUILD, `${name}.svg`)
  const pngPath = join(BUILD, `${name}.png`)
  writeFileSync(svgPath, svg)
  execFileSync("rsvg-convert", ["--unlimited", "-w", String(w), "-h", String(h), "-o", pngPath, svgPath])
  return pngPath
}
const toWebp = (png: string, out: string) =>
  execFileSync("cwebp", ["-quiet", "-q", "85", "-m", "6", "-alpha_q", "100", png, "-o", join(OUT, out)])

// ---------- shared painting helpers ----------

function flame(s: Svg, x: number, y: number, k: number) {
  const fill = s.rad([[0, "#fff6dc"], [0.45, P.amberHi], [0.8, P.amber], [1, P.ember, 0.7]], 'cx="0.5" cy="0.72" r="0.62"')
  s.add(
    path(
      `M${f(x)} ${f(y - k * 2.4)} C${f(x + k)} ${f(y - k * 0.9)} ${f(x + k * 0.8)} ${f(y + k * 0.55)} ${f(x)} ${f(y + k * 0.6)} C${f(x - k * 0.8)} ${f(y + k * 0.55)} ${f(x - k)} ${f(y - k * 0.9)} ${f(x)} ${f(y - k * 2.4)}Z`,
      fill,
    ),
  )
}
function candle(s: Svg, x: number, base: number, h: number, w: number, glowR = h * 2.4 + 110) {
  s.glow(x, base - h - w * 0.6, glowR, P.amber, 0.38)
  s.add(rect(x - w / 2, base - h, w, h, s.hz([[0, "#4a3f3a"], [0.55, "#bfa985"], [1, "#6a5a4c"]]), `rx="${f(w * 0.2)}"`))
  flame(s, x, base - h - w * 0.3, Math.max(4, w * 0.32))
}
function shaft(s: Svg, p: number[][], a = 0.15, color: string = P.moon) {
  s.add(poly(p, s.v([[0, color, a], [1, color, 0]]), `filter="${s.blur(16)}" style="mix-blend-mode:screen"`))
}
function motes(s: Svg, r: () => number, x0: number, x1: number, y0: number, y1: number, n: number) {
  for (let i = 0; i < n; i++) {
    s.add(circle(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1 + r() * 2.2, P.moon, `opacity="${f(0.15 + r() * 0.45)}"`))
  }
}
const archD = (x: number, y: number, w: number, h: number, pointed = false) =>
  pointed
    ? `M${f(x)} ${f(y + h)} L${f(x)} ${f(y + w * 0.55)} Q${f(x)} ${f(y)} ${f(x + w / 2)} ${f(y)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + w * 0.55)} L${f(x + w)} ${f(y + h)}Z`
    : `M${f(x)} ${f(y + h)} L${f(x)} ${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} L${f(x + w)} ${f(y + h)}Z`
function moonGlass(s: Svg, d: string, a = 0.85) {
  s.add(path(d, s.rad([[0, "#eef4ff", a], [0.35, P.moon, a * 0.6], [1, P.indigo2, 0.9]], 'cx="0.62" cy="0.28" r="0.85"')))
}

// ---------- rooms (1536x1024 dollhouse cross-section) ----------

const W = 1536
const H = 1024
const BX0 = 170
const BX1 = 1366
const BY0 = 110
const BY1 = 760
const floorHalf = (y: number) => 598 + ((y - BY1) * 170) / (H - BY1)

interface Look {
  wall: [string, string]
  side: string
  ceil: string
  floor: [string, string]
  planks?: boolean
}
function frame(s: Svg, k: Look, r: () => number) {
  s.add(rect(BX0, BY0, BX1 - BX0, BY1 - BY0, s.v([[0, k.wall[0]], [1, k.wall[1]]])))
  const mottle = s.filter(
    '<feTurbulence type="fractalNoise" baseFrequency="0.005 0.011" numOctaves="4" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0.01 0 0 0 0 0.01 0 0 0 0 0.05 1.5 0 0 0 -0.5"/>',
    'x="0" y="0" width="100%" height="100%"',
  )
  s.add(rect(BX0, BY0, BX1 - BX0, BY1 - BY0, "#000", `filter="${mottle}" opacity="0.6"`))
  s.add(poly([[0, 0], [BX0, BY0], [BX0, BY1], [0, H]], s.hz([[0, P.ink], [1, k.side]])))
  s.add(poly([[W, 0], [BX1, BY0], [BX1, BY1], [W, H]], s.hz([[0, k.side], [1, P.ink]])))
  s.add(poly([[0, 0], [W, 0], [BX1, BY0], [BX0, BY0]], s.v([[0, P.ink], [1, k.ceil]])))
  s.add(poly([[0, H], [W, H], [BX1, BY1], [BX0, BY1]], s.v([[0, k.floor[0]], [1, k.floor[1]]])))
  if (k.planks) {
    for (let i = 1; i < 16; i++) {
      const t = i / 16
      s.add(line(BX0 + t * (BX1 - BX0), BY1, t * W, H, P.ink, 2.2, 'opacity="0.55"'))
    }
    for (let i = 0; i < 40; i++) {
      const y = BY1 + 8 + r() * (H - BY1 - 8)
      const hw = floorHalf(y)
      const x = W / 2 - hw + r() * hw * 2
      s.add(line(x, y, x + 40 + r() * 50, y, P.ink, 1.6, 'opacity="0.4"'))
    }
  }
  // the seam where wall meets floor catches a little shadow
  s.add(rect(BX0, BY1 - 26, BX1 - BX0, 26, s.v([[0, P.ink, 0], [1, P.ink, 0.6]])))
}
function cobweb(s: Svg, x: number, y: number, dir: 1 | -1, size: number) {
  const g: string[] = []
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2)
    g.push(line(x, y, x + dir * Math.cos(a) * size, y + Math.sin(a) * size, P.moon, 1.2))
  }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (ring / 4) * size
    let d = ""
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * (Math.PI / 2)
      const px = x + dir * Math.cos(a) * rr
      const py = y + Math.sin(a) * rr
      d += i === 0 ? `M${f(px)} ${f(py)}` : ` Q${f(x + dir * Math.cos(a - 0.15) * rr * 0.8)} ${f(y + Math.sin(a - 0.15) * rr * 0.8)} ${f(px)} ${f(py)}`
    }
    g.push(path(d, "none", `stroke="${P.moon}" stroke-width="1"`))
  }
  s.add(`<g opacity="0.22">${g.join("")}</g>`)
}

function attic(s: Svg, r: () => number) {
  frame(s, { wall: ["#2a2546", "#1b1a33"], side: "#1d1b33", ceil: "#1a1428", floor: ["#1d1a2a", "#2b2433"], planks: true }, r)
  const wood = "#24171a"
  s.add(poly([[0, 0], [768, 0], [768, 95], [BX0, 400], [0, 610]], s.v([[0, "#0c0a14"], [1, "#1f1720"]])))
  s.add(poly([[W, 0], [768, 0], [768, 95], [BX1, 400], [W, 610]], s.v([[0, "#0c0a14"], [1, "#1f1720"]])))
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    s.add(line(768 - t * (768 - BX0), 95 + t * 305, 768 - t * 768 - 60, -10 + t * 640, wood, 16))
    s.add(line(768 + t * (BX1 - 768), 95 + t * 305, 768 + t * 768 + 60, -10 + t * 640, wood, 16))
  }
  s.add(line(BX0, 400, 768, 95, wood, 26), line(BX1, 400, 768, 95, wood, 26))
  s.add(rect(300, 318, 936, 30, wood), rect(756, 95, 24, 230, wood))
  // round window and its moon shaft
  shaft(s, [[700, 430], [836, 430], [1040, H], [560, H]], 0.16)
  s.add(circle(768, 470, 98, "#0f0c18"))
  moonGlass(s, `M670 470 A98 98 0 1 1 866 470 A98 98 0 1 1 670 470Z`)
  s.add(circle(768, 470, 98, "none", `stroke="${wood}" stroke-width="14"`))
  s.add(line(768, 372, 768, 568, wood, 8), line(670, 470, 866, 470, wood, 8))
  motes(s, r, 600, 1000, 470, 980, 70)
  // trunks
  const trunk = (x: number, y: number, w: number, h: number) => {
    s.add(rect(x, y, w, h, s.v([[0, "#6a1a24"], [1, "#2a0a10"]]), 'rx="8"'))
    s.add(path(`M${x} ${y + 8} Q${x + w / 2} ${y - h * 0.32} ${x + w} ${y + 8}Z`, "#2c1c19"))
    for (const sx of [0.18, 0.82]) s.add(rect(x + w * sx - 7, y - h * 0.12, 14, h * 1.1, "#6e5634", 'opacity="0.8"'))
    s.add(rect(x + w / 2 - 14, y + 14, 28, 26, "#8a6a3a"))
  }
  trunk(220, 640, 340, 150)
  trunk(255, 540, 270, 100)
  candle(s, 470, 520, 46, 18)
  // rocking horse
  const hz = "#5a1420"
  s.add(path("M940 810 Q1110 870 1290 805", "none", `stroke="${hz}" stroke-width="16" stroke-linecap="round"`))
  for (const [x1, x2] of [[1010, 985], [1050, 1040], [1170, 1180], [1215, 1240]]) s.add(line(x1, 700, x2, 818, hz, 14))
  s.add(ellipse(1110, 690, 128, 46, hz))
  s.add(path("M1195 690 Q1215 610 1248 560 L1290 548 Q1318 560 1312 584 L1262 600 Q1240 650 1232 700Z", hz))
  s.add(path("M985 670 Q930 690 920 760", "none", `stroke="${hz}" stroke-width="12" stroke-linecap="round"`))
  s.add(path("M1205 600 Q1225 560 1255 552", "none", `stroke="${P.blood}" stroke-width="7" opacity="0.7"`))
  s.add(ellipse(1110, 676, 110, 24, "none", `stroke="${P.moon}" stroke-width="3" opacity="0.18"`))
  cobweb(s, BX0 + 30, 420, 1, 150)
  cobweb(s, BX1 - 30, 420, -1, 120)
}

function nursery(s: Svg, r: () => number) {
  frame(s, { wall: ["#28305e", "#1c2248"], side: "#191e40", ceil: "#141833", floor: ["#1a1b2c", "#2a2534"], planks: true }, r)
  for (let x = BX0; x < BX1; x += 64) s.add(rect(x, BY0, 30, BY1 - BY0, "#323c72", 'opacity="0.45"'))
  for (let y = BY0 + 30; y < BY1; y += 70)
    for (let x = BX0 + 47; x < BX1; x += 64) s.add(path(`M${x} ${y - 9} L${x + 7} ${y} L${x} ${y + 9} L${x - 7} ${y}Z`, P.moon, 'opacity="0.10"'))
  // peeling patches with curled edges
  for (const [x, y, w, h] of [[820, 150, 160, 120], [1150, 420, 140, 190], [230, 610, 120, 100], [610, 380, 90, 70]]) {
    const d = `M${x} ${y} L${x + w * 0.7} ${y + h * 0.1} L${x + w} ${y + h * 0.55} L${x + w * 0.6} ${y + h} L${x + w * 0.1} ${y + h * 0.8}Z`
    s.add(path(d, "#3f3b55", 'opacity="0.9"'))
    s.add(path(`M${x + w} ${y + h * 0.55} Q${x + w * 1.12} ${y + h * 0.75} ${x + w * 0.9} ${y + h * 0.95} L${x + w * 0.6} ${y + h}Z`, "#57527a", 'opacity="0.85"'))
  }
  shaft(s, [[260, 240], [470, 240], [820, H], [420, H]], 0.14)
  s.add(path(archD(250, 200, 230, 420), "#0f0f20"))
  moonGlass(s, archD(262, 212, 206, 400))
  for (const x of [330, 400]) s.add(line(x, 222, x, 612, "#151633", 7))
  for (const y of [360, 480]) s.add(line(262, y, 468, y, "#151633", 7))
  // crib
  const wood = "#2a1e24"
  s.add(rect(600, 560, 340, 20, wood), rect(600, 735, 340, 20, wood))
  for (let x = 626; x < 925; x += 24) s.add(rect(x, 575, 7, 162, wood))
  s.add(rect(588, 520, 24, 290, wood, 'rx="6"'), rect(928, 520, 24, 290, wood, 'rx="6"'))
  s.add(circle(600, 516, 16, wood), circle(940, 516, 16, wood))
  s.add(path("M640 735 Q700 690 780 710 Q860 690 910 735Z", "#4d4f7c", 'opacity="0.85"'))
  s.add(rect(600, 556, 340, 6, P.moon, 'opacity="0.16"'))
  // mobile
  s.add(line(770, BY0, 770, 330, "#3b3550", 3), line(680, 330, 860, 330, "#3b3550", 4))
  for (const [x, len] of [[690, 60], [770, 90], [850, 50]]) {
    s.add(line(x, 330, x, 330 + len, "#3b3550", 2))
    s.add(path(`M${x} ${330 + len - 14} L${x + 5} ${330 + len - 4} L${x + 16} ${330 + len - 4} L${x + 7} ${330 + len + 3} L${x + 11} ${330 + len + 14} L${x} ${330 + len + 7} L${x - 11} ${330 + len + 14} L${x - 7} ${330 + len + 3} L${x - 16} ${330 + len - 4} L${x - 5} ${330 + len - 4}Z`, P.cyan, 'opacity="0.55"'))
    s.glow(x, 330 + len, 50, P.cyan, 0.25)
  }
  // music box on a little table
  s.add(rect(1060, 650, 200, 18, wood), rect(1072, 668, 14, 130, wood), rect(1234, 668, 14, 130, wood))
  s.glow(1160, 600, 150, P.cyan, 0.32)
  s.add(rect(1110, 600, 100, 50, "#3a2430", 'rx="5"'))
  s.add(poly([[1110, 600], [1210, 600], [1225, 548], [1125, 548]], "#4a2e3a"))
  s.add(rect(1112, 596, 96, 6, P.cyan, 'opacity="0.6"'))
  s.add(line(1210, 625, 1236, 625, "#8a6a3a", 4), line(1236, 625, 1236, 640, "#8a6a3a", 4))
  candle(s, 1085, 650, 40, 16)
  // blocks on the floor
  for (const [x, y, k] of [[300, 880, 46], [352, 900, 40], [326, 838, 40]]) s.add(rect(x, y, k, k, k > 42 ? "#3a1a2a" : "#1f3a48", 'rx="4"'))
  cobweb(s, BX1 - 20, BY0 + 10, -1, 130)
}

function library(s: Svg, r: () => number) {
  frame(s, { wall: ["#1e1830", "#160f1e"], side: "#1a1324", ceil: "#120d1a", floor: ["#1b1524", "#2a1e28"], planks: true }, r)
  const books = ["#5a1a24", "#1f4a50", "#4a3a2a", "#2a2f5c", "#6b4a2a", "#17414a", "#3d1630", "#4e5a6a"]
  s.add(rect(BX0, BY0, BX1 - BX0, BY1 - BY0, "#1d1218"))
  const rows = 6
  for (let i = 0; i < rows; i++) {
    const y0 = BY0 + 14 + i * 106
    let x = BX0 + 12
    while (x < BX1 - 20) {
      if (i >= 4 && x > 548 && x < 988) {
        x = 988
        continue
      }
      const bw = 12 + r() * 20
      const bh = 62 + r() * 30
      const c = books[Math.floor(r() * books.length)]
      if (r() < 0.08) {
        s.add(rect(x, y0 + 92 - bh * 0.9, bh * 0.9, bw, c, `transform="rotate(-${f(10 + r() * 20)} ${f(x)} ${f(y0 + 92)})" opacity="0.9"`))
        x += bw + 30
      } else {
        s.add(rect(x, y0 + 92 - bh, bw, bh, c, 'opacity="0.9"'))
        if (r() < 0.5) s.add(rect(x + 2, y0 + 92 - bh + 10, bw - 4, 3, "#a88a4a", 'opacity="0.5"'))
        x += bw + 1.5
      }
    }
    s.add(rect(BX0, y0 + 92, BX1 - BX0, 14, "#2e1d1c"))
  }
  for (let x = BX0; x <= BX1; x += 299) s.add(rect(x - 9, BY0, 18, BY1 - BY0, "#2e1d1c"))
  // fireplace
  s.glow(768, 690, 560, P.amber, 0.42)
  s.add(rect(548, 520, 440, 240, "#3a404e"), rect(528, 498, 480, 30, "#4a5262"))
  s.add(path("M600 760 L600 600 Q768 540 936 600 L936 760Z", "#07070e"))
  s.glow(768, 720, 230, P.ember, 0.55)
  for (const [x, k] of [[700, 26], [760, 36], [820, 30], [735, 20], [800, 22]]) flame(s, x, 740, k)
  s.add(rect(640, 742, 256, 16, "#24140f", 'rx="6"'))
  // ladder
  const lw = "#3a2620"
  s.add(line(1000, 790, 1110, 140, lw, 12), line(1076, 790, 1186, 140, lw, 12))
  for (let i = 1; i < 12; i++) {
    const t = i / 12
    s.add(line(1000 + t * 110, 790 - t * 650, 1076 + t * 110, 790 - t * 650, lw, 8))
  }
  // rug and armchair
  s.add(poly([[470, 820], [1066, 820], [1200, 1004], [336, 1004]], "#8a6410", 'opacity="0.6"'))
  s.add(poly([[500, 840], [1036, 840], [1150, 984], [386, 984]], "none", `stroke="${P.amberHi}" stroke-width="3" opacity="0.25"`))
  s.add(path("M210 930 L220 760 Q230 690 300 700 L390 708 Q440 720 436 790 L430 930Z", "#2a1418"))
  s.add(path("M190 930 L196 820 Q200 790 240 800 L250 930Z", "#24101a"))
  s.add(path("M416 930 L420 820 Q430 790 470 802 L466 930Z", "#24101a"))
  motes(s, r, 500, 1040, 560, 900, 30)
}

function ballroom(s: Svg, r: () => number) {
  frame(s, { wall: ["#202650", "#161a3c"], side: "#181c40", ceil: "#11142e", floor: ["#11142a", "#191d36"] }, r)
  // checker floor in perspective
  const vy = BY1 - (598 * (H - BY1)) / 170
  const zb = 1
  const zf = (BY1 - vy) / (H - vy)
  const rowsN = 9
  const colsN = 16
  const ys: number[] = []
  for (let i = 0; i <= rowsN; i++) ys.push(vy + (BY1 - vy) / (zb + (zf - zb) * (i / rowsN)))
  for (let i = 0; i < rowsN; i++) {
    for (let j = 0; j < colsN; j++) {
      const a = ys[i]
      const b = ys[i + 1]
      const xa0 = W / 2 - floorHalf(a) + (j / colsN) * floorHalf(a) * 2
      const xa1 = W / 2 - floorHalf(a) + ((j + 1) / colsN) * floorHalf(a) * 2
      const xb0 = W / 2 - floorHalf(b) + (j / colsN) * floorHalf(b) * 2
      const xb1 = W / 2 - floorHalf(b) + ((j + 1) / colsN) * floorHalf(b) * 2
      const light = (i + j) % 2 === 0
      s.add(poly([[xa0, a], [xa1, a], [xb1, b], [xb0, b]], light ? "#5a5f78" : "#0c0e20", light ? 'opacity="0.85"' : ""))
    }
  }
  s.add(poly([[0, H], [W, H], [BX1, BY1], [BX0, BY1]], s.v([[0, P.ink, 0.55], [1, P.ink, 0.1]])))
  // tall windows between pilasters
  for (const cx of [520, 768, 1016]) {
    shaft(s, [[cx - 70, 300], [cx + 70, 300], [cx + 260, H], [cx - 60, H]], 0.1)
    s.add(path(archD(cx - 82, 210, 164, 520), "#0c0e22"))
    moonGlass(s, archD(cx - 72, 220, 144, 506), 0.7)
    s.add(line(cx, 230, cx, 726, "#151938", 6))
    for (const y of [380, 520, 640]) s.add(line(cx - 72, y, cx + 72, y, "#151938", 6))
  }
  for (const x of [396, 644, 892, 1140]) s.add(rect(x - 16, BY0, 32, BY1 - BY0, s.hz([[0, "#2a3266"], [1, "#161a3c"]])))
  // velvet curtains with folds and a swag valance
  const curtain = (x0: number, x1: number) => {
    const n = 9
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n
      const b = x0 + ((x1 - x0) * (i + 1)) / n
      s.add(rect(a, BY0 - 20, b - a + 1, H - BY0 + 20, s.hz([[0, "#04261a"], [0.5, i % 2 ? "#1a6a3e" : "#0f4a2c"], [1, "#04261a"]])))
    }
  }
  curtain(0, 330)
  curtain(1206, W)
  let swag = `M0 ${BY0 - 20}`
  for (let i = 0; i < 6; i++) swag += ` Q${f((i + 0.5) * 256)} ${BY0 + 120} ${f((i + 1) * 256)} ${BY0 - 20}`
  s.add(rect(0, 0, W, BY0 - 18, "#031a12"), path(`${swag} L${W} 0 L0 0Z`, s.v([[0, "#04261a"], [1, "#1a6a3e"]])))
  s.add(path(swag, "none", `stroke="${P.amberHi}" stroke-width="4" opacity="0.35"`))
  // the chandelier
  s.glow(768, 300, 640, P.amber, 0.34)
  s.add(line(768, 0, 768, 190, "#3a2e22", 6))
  s.add(ellipse(768, 300, 250, 44, "none", 'stroke="#8a6a3a" stroke-width="7"'))
  s.add(ellipse(768, 250, 160, 30, "none", 'stroke="#8a6a3a" stroke-width="6"'))
  s.add(path("M700 300 Q768 420 836 300", "none", 'stroke="#8a6a3a" stroke-width="6"'))
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    const x = 768 + Math.cos(a) * 160
    const y = 400 + Math.sin(a) * 30
    if (i % 2 === 0) s.add(line(x, y - 120, x + Math.cos(a) * 30, y - 80, P.moon, 1.5, 'opacity="0.35"'))
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 0.05 + (i / 13) * Math.PI * 0.9
    const x = 768 + Math.cos(a) * 250
    const y = 300 + Math.sin(a) * 44
    candle(s, x, y, 26, 10, 80)
    s.add(line(x, y + 4, x, y + 26, P.moon, 1.5, 'opacity="0.4"'), circle(x, y + 30, 4, P.moon, 'opacity="0.55"'))
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.1 + (i / 8) * Math.PI * 0.8
    candle(s, 768 + Math.cos(a) * 160, 250 + Math.sin(a) * 30, 22, 9, 70)
  }
  s.add(ellipse(768, 880, 330, 60, P.amber, `opacity="0.12" filter="${s.blur(20)}"`))
}

function chapel(s: Svg, r: () => number) {
  frame(s, { wall: ["#1c2240", "#141a30"], side: "#141a32", ceil: "#0f1228", floor: ["#141c28", "#1e2a36"] }, r)
  for (let y = BY0 + 40; y < BY1; y += 48) s.add(line(BX0, y, BX1, y, P.ink, 2, 'opacity="0.35"'))
  for (const cx of [360, 1176]) {
    s.add(path(archD(cx - 110, 220, 220, 540, true), "#0d1124"))
    s.add(rect(cx - 140, 210, 30, 550, "#262e50"), rect(cx + 110, 210, 30, 550, "#262e50"))
  }
  // stained glass
  const gx = 588
  const gw = 360
  const gy = 150
  const gh = 470
  s.add(path(archD(gx - 16, gy - 16, gw + 32, gh + 32, true), "#090b18"))
  const panes = ["#9b4dff", "#6a3ab8", "#b98cff", "#4a2a9a", P.cyan, "#9b4dff", P.amber, "#6a3ab8"]
  const clip = `cl${++ids}`
  s.defs.push(`<clipPath id="${clip}"><path d="${archD(gx, gy, gw, gh, true)}"/></clipPath>`)
  const cells: string[] = []
  for (let y = gy; y < gy + gh; y += 46)
    for (let x = gx; x < gx + gw; x += 45) {
      const c = panes[Math.floor(r() * panes.length)]
      cells.push(rect(x, y, 45, 46, c, `opacity="${f(0.55 + r() * 0.4)}"`))
    }
  s.add(`<g clip-path="url(#${clip})">${cells.join("")}</g>`)
  for (let x = gx; x <= gx + gw; x += 45) s.add(line(x, gy, x, gy + gh, "#07080f", 4))
  for (let y = gy; y <= gy + gh; y += 46) s.add(line(gx, y, gx + gw, y, "#07080f", 4))
  s.add(circle(768, 290, 92, "none", 'stroke="#07080f" stroke-width="12"'), circle(768, 290, 40, P.cyan, 'opacity="0.9"'))
  s.add(path(archD(gx, gy, gw, gh, true), "none", 'stroke="#2a3050" stroke-width="10"'))
  s.glow(768, 380, 520, P.cyan, 0.16)
  shaft(s, [[620, 560], [916, 560], [1080, H], [450, H]], 0.12, P.cyan)
  shaft(s, [[690, 560], [846, 560], [900, H], [640, H]], 0.08, P.bloodHi)
  // altar
  s.add(rect(560, 650, 416, 110, "#2a2236"), rect(540, 632, 456, 24, "#4a4664"))
  s.add(rect(700, 656, 136, 104, "#5a2a9a", 'opacity="0.85"'))
  s.add(line(768, 670, 768, 740, P.amberHi, 5, 'opacity="0.6"'), line(745, 692, 791, 692, P.amberHi, 5, 'opacity="0.6"'))
  for (const [x, h] of [[600, 90], [650, 120], [886, 120], [936, 90]]) candle(s, x, 632, h, 16)
  for (const [x, h] of [[300, 150], [1236, 150]]) {
    s.add(rect(x - 5, 790 - h, 10, h, "#3a2e22"), rect(x - 30, 790, 60, 10, "#3a2e22"))
    for (const dx of [-26, 0, 26]) candle(s, x + dx, 790 - h, 40, 12, 120)
  }
  // pews either side of the aisle
  for (const y of [800, 862, 934, 1016]) {
    const hw = floorHalf(y)
    const aisle = 80 + (y - BY1) * 0.35
    const hgt = 30 + (y - BY1) * 0.22
    for (const [a, b] of [[W / 2 - hw + 40, W / 2 - aisle], [W / 2 + aisle, W / 2 + hw - 40]]) {
      s.add(rect(a, y - hgt, b - a, hgt, s.v([[0, "#3a2820"], [1, "#1a1012"]]), 'rx="4"'))
      s.add(rect(a, y - hgt, b - a, 5, P.amberHi, 'opacity="0.18"'))
    }
  }
}

function crypt(s: Svg, r: () => number) {
  frame(s, { wall: ["#16303a", "#0f222a"], side: "#10252c", ceil: "#0a171c", floor: ["#0e1d22", "#18292e"] }, r)
  for (let row = 0, y = BY0; y < BY1; row++, y += 56) {
    for (let x = BX0 + (row % 2) * 60; x < BX1; x += 120) s.add(rect(x, y, 118, 54, "#1d3a44", `opacity="${f(0.35 + r() * 0.4)}"`))
  }
  for (const cx of [400, 768, 1136]) {
    s.add(path(archD(cx - 150, 240, 300, 520), "#2a4a52"))
    s.add(path(archD(cx - 128, 262, 256, 498), s.v([[0, "#04080c"], [1, "#0b161b"]])))
  }
  for (const x of [584, 952]) s.add(rect(x - 34, BY0, 68, BY1 - BY0, s.hz([[0, "#2c4c54"], [1, "#132a31"]])))
  // coffins in the side recesses and one in front
  const box = (x: number, y: number, w: number, h: number, d: number) => {
    s.add(poly([[x + d, y - d], [x + w - d, y - d], [x + w, y], [x, y]], "#4a6268"))
    s.add(rect(x, y, w, h, s.v([[0, "#34484e"], [1, "#1c2a2e"]])))
    s.add(rect(x + 12, y + 10, w - 24, h - 20, "none", 'stroke="#55707a" stroke-width="3" opacity="0.5"'))
  }
  box(300, 690, 200, 70, 18)
  box(1036, 690, 200, 70, 18)
  box(560, 800, 416, 110, 40)
  s.add(poly([[590, 748], [950, 742], [990, 790], [570, 800]], "#5a747a", `transform="rotate(-3 768 770)"`))
  // candles everywhere
  for (const [x, b, h, w] of [[600, 760, 60, 16], [626, 764, 40, 14], [930, 758, 70, 16], [955, 764, 44, 13], [330, 690, 50, 13], [470, 690, 36, 12], [1066, 690, 46, 13], [1206, 690, 58, 14], [250, 900, 80, 18], [290, 912, 50, 15], [1270, 904, 90, 18], [1240, 914, 50, 15], [768, 640, 50, 14]] as const)
    candle(s, x, b, h, w)
  s.add(rect(0, 880, W, 144, s.v([[0, P.teal2, 0], [1, P.teal2, 0.22]]), `filter="${s.blur(18)}"`))
  cobweb(s, 272, 262, 1, 110)
  cobweb(s, 1264, 262, -1, 110)
}

const ROOM_PAINTERS: Record<RoomId, (s: Svg, r: () => number) => void> = { attic, nursery, library, ballroom, chapel, crypt }

function finish(s: Svg, seed: number, displace = 9) {
  const paint = s.filter(
    `<feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${displace}" xChannelSelector="R" yChannelSelector="G"/>`,
    'x="0" y="0" width="100%" height="100%"',
  )
  const grain = s.filter(
    `<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${seed + 1}"/><feColorMatrix type="matrix" values="0 0 0 0 0.8 0 0 0 0 0.85 0 0 0 0 1 0.2 0 0 0 -0.06"/>`,
    'x="0" y="0" width="100%" height="100%"',
  )
  const vig = s.rad([[0, P.ink, 0], [0.62, P.ink, 0.12], [1, P.ink, 0.78]], 'cx="0.5" cy="0.48" r="0.72"')
  return s.doc(
    `${rect(0, 0, s.w, s.h, P.ink)}<g filter="${paint}">${s.body.join("")}</g>${rect(0, 0, s.w, s.h, "#fff", `filter="${grain}"`)}${rect(0, 0, s.w, s.h, vig)}`,
  )
}

// ---------- sky (2560x1440) ----------

function sky() {
  const s = new Svg(2560, 1440)
  const r = rng(7)
  s.add(rect(0, 0, 2560, 1440, s.v([[0, "#080a1e"], [0.5, "#11163a"], [1, "#0b1d26"]])))
  for (let i = 0; i < 170; i++) {
    s.add(circle(r() * 2560, r() * 760, 0.8 + r() * 1.6, P.moon, `opacity="${f(0.2 + r() * 0.6)}"`))
  }
  s.glow(560, 330, 1100, "#8fb0e8", 0.28)
  s.glow(560, 330, 320, P.moon, 0.55)
  const moon = s.rad([[0, "#f6f8ff"], [0.7, P.moon], [1, "#9fb3dc"]], 'cx="0.4" cy="0.38" r="0.7"')
  s.add(circle(560, 330, 118, moon))
  for (const [x, y, k] of [[530, 300, 26], [600, 360, 18], [575, 290, 11], [520, 372, 14]]) s.add(circle(x, y, k, "#8fa3cc", 'opacity="0.35"'))
  const layer = (seed: number, rgb: [number, number, number], gain: number, cut: number, freq: string, opacity: number, extra = "") => {
    const id = s.filter(
      `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="5" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} ${gain} 0 0 0 ${-cut}"/>`,
      'x="0" y="0" width="100%" height="100%"',
    )
    s.add(rect(0, 0, 2560, 1440, "#000", `filter="${id}" opacity="${opacity}" ${extra}`))
  }
  // lit cloud edges near the moon (masked), then the dark torn body over them
  const mask = `m${++ids}`
  s.defs.push(
    `<mask id="${mask}"><rect width="2560" height="1440" fill="${s.rad([[0, "#fff", 1], [0.5, "#fff", 0.35], [1, "#fff", 0]], 'cx="560" cy="330" r="1300" gradientUnits="userSpaceOnUse"')}"/></mask>`,
  )
  layer(21, [0.55, 0.62, 0.85], 2.6, 1.1, "0.0011 0.0034", 0.9, `mask="url(#${mask})" transform="translate(-14 -18)"`)
  layer(21, [0.07, 0.08, 0.19], 2.6, 1.1, "0.0011 0.0034", 1)
  layer(5, [0.05, 0.07, 0.15], 2.2, 1.0, "0.0018 0.0055", 0.75)
  // rain
  for (let i = 0; i < 1100; i++) {
    const x = r() * 2800
    const y = r() * 1500 - 60
    const len = 50 + r() * 90
    s.add(line(x, y, x - len * 0.22, y + len, "#a9bde6", 1 + r() * 1.2, `opacity="${f(0.04 + r() * 0.1)}"`))
  }
  s.add(rect(0, 1040, 2560, 400, s.v([[0, P.teal1, 0], [1, P.teal1, 0.55]])))
  layer(9, [0.12, 0.3, 0.33], 1.6, 0.75, "0.002 0.012", 0.35, 'transform="translate(0 0)"')
  const vig = s.rad([[0, P.ink, 0], [0.7, P.ink, 0.2], [1, P.ink, 0.7]], 'cx="0.5" cy="0.5" r="0.75"')
  s.add(rect(0, 0, 2560, 1440, vig))
  toWebp(render("sky", s.doc(), 2560, 1440), "sky.webp")
}

// ---------- hunters (640x1024, transparent) ----------

type Part = string
interface HunterLook {
  body: Part[]
  light: (s: Svg, color: string) => void
  lightSide: number // 0 left .. 1 right
}
const HUNTER_LOOKS: Record<HunterId, HunterLook> = {
  exorcist: {
    lightSide: 1,
    body: [
      "M250 300 L392 300 L455 985 L185 985Z",
      "M215 336 Q320 268 425 336 L445 470 L195 470Z",
      "M255 950 h52 v50 h-52Z M333 950 h52 v50 h-52Z",
      "M278 235 a42 42 0 1 1 84 0 a42 42 0 1 1 -84 0Z",
      "M200 205 Q320 180 440 205 Q320 228 200 205Z M268 206 L280 138 Q320 122 360 138 L372 206Z",
      "M392 318 L420 300 L515 182 L540 198 L452 336Z",
      "M232 335 L262 345 L232 585 L204 580Z",
    ],
    light: (s, c) => {
      s.glow(520, 222, 300, c, 0.55)
      s.add(path("M500 168 Q522 136 544 168", "none", 'stroke="#6e5634" stroke-width="5"'))
      s.add(rect(496, 170, 52, 78, "#3a2a1a", 'rx="6"'), rect(504, 180, 36, 58, s.rad([[0, "#fff6dc"], [0.5, c], [1, P.ember]]), 'rx="4"'))
      s.add(rect(492, 244, 60, 10, "#6e5634", 'rx="3"'))
    },
  },
  medium: {
    lightSide: 0.5,
    body: [
      "M262 300 Q320 282 378 300 Q470 600 505 990 Q320 1012 135 990 Q170 600 262 300Z",
      "M228 322 Q320 384 412 322 L476 530 Q320 612 164 530Z",
      "M280 240 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0Z",
      "M268 252 Q266 178 320 172 Q374 178 372 252 L400 336 Q320 304 240 336Z",
      "M252 330 L282 340 L308 470 L284 476Z M388 330 L358 340 L332 470 L356 476Z",
    ],
    light: (s, c) => {
      s.glow(320, 468, 320, c, 0.6)
      s.add(circle(320, 462, 44, s.rad([[0, "#ffffff"], [0.35, "#e6dcff"], [0.8, c], [1, "#4a2a8a"]], 'cx="0.4" cy="0.35" r="0.7"')))
      s.add(ellipse(320, 512, 40, 10, "#2a1a3a"))
    },
  },
  skeptic: {
    lightSide: 1,
    body: [
      "M287 288 L353 288 L388 900 L252 900Z",
      "M266 880 h36 v110 h-36Z M338 880 h36 v110 h-36Z M252 984 h56 v16 h-56Z M332 984 h56 v16 h-56Z",
      "M284 225 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0Z",
      "M282 214 Q320 170 358 214 L352 196 Q320 166 288 196Z",
      "M350 318 L372 304 L466 432 L446 448Z",
      "M290 318 L268 312 L246 528 L268 532Z",
      "M360 560 h66 v74 h-66Z",
    ],
    light: (s, c) => {
      s.add(poly([[470, 424], [640, 300], [640, 600], [478, 446]], s.hz([[0, c, 0.55], [1, c, 0]]), `filter="${s.blur(6)}"`))
      s.glow(474, 434, 120, c, 0.7)
      s.add(rect(440, 420, 44, 22, "#2a3240", `transform="rotate(-35 460 431)" rx="5"`))
      s.add(circle(306, 205, 11, "#8a6a3a"), circle(334, 205, 11, "#8a6a3a"), circle(306, 205, 6, c, 'opacity="0.8"'), circle(334, 205, 6, c, 'opacity="0.8"'))
      s.add(rect(236, 520, 34, 46, "#2a3240", 'rx="4"'), circle(253, 535, 6, c), line(262, 520, 274, 486, "#5a6a7a", 3))
    },
  },
  priest: {
    lightSide: 1,
    body: [
      "M272 300 L368 300 L412 992 L228 992Z",
      "M280 240 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0Z",
      "M222 212 Q320 186 418 212 Q320 236 222 212Z M268 212 Q320 132 372 212Z",
      "M368 320 L392 330 L430 560 L408 566Z",
      "M272 320 L248 330 L268 470 L300 452Z",
      "M244 420 L320 404 L330 494 L254 510Z",
    ],
    light: (s, c) => {
      for (const dx of [-10, 0, 10]) s.add(line(420, 562, 440 + dx, 700, "#8a6a3a", 2))
      s.glow(440, 732, 230, c, 0.6)
      s.add(path("M408 718 Q440 690 472 718 Z", "#6e5634"))
      s.add(circle(440, 738, 32, s.rad([[0, "#ffe2d6"], [0.4, c], [1, "#5a1a14"]])))
      for (const [x, y] of [[428, 732], [446, 744], [452, 726]]) s.add(circle(x, y, 4, "#fff2cc"))
      s.add(path("M440 700 Q410 620 452 560 Q480 510 446 450", "none", `stroke="#c8c0e0" stroke-width="10" opacity="0.18" filter="${s.blur(5)}"`))
      s.add(rect(310, 290, 20, 12, "#d8dcea", 'rx="3"'))
      for (let y = 330; y < 980; y += 34) s.add(circle(320 + (y - 300) * 0.005, y, 3.5, "#3a1a1a"))
    },
  },
}

function hunter(id: HunterId, color: string) {
  const s = new Svg(640, 1024, false)
  const look = HUNTER_LOOKS[id]
  s.add(ellipse(320, 996, 190, 20, P.ink, `opacity="0.55" filter="${s.blur(8)}"`))
  const d = look.body.join(" ")
  s.add(path(d, color, `opacity="0.7" filter="${s.blur(7)}" transform="translate(${f((look.lightSide - 0.5) * 10)} -2)"`))
  const fill = s.hz(
    look.lightSide > 0.6
      ? [[0, P.ink], [0.65, P.indigo1], [1, "#2a2a5a"]]
      : [[0, "#1c1d48"], [0.5, P.indigo1], [1, "#1c1d48"]],
  )
  // rim first, then the fill over it: only the outer half of the stroke survives, so no inner seams show
  s.add(path(d, "none", `stroke="${color}" stroke-width="6" stroke-linejoin="round" opacity="0.6"`))
  s.add(path(d, fill))
  look.light(s, color)
  render(`hunter-${id}`, s.doc(), 640, 1024)
  execFileSync("cp", [join(BUILD, `hunter-${id}.png`), join(OUT, `hunter-${id}.png`)])
}

// ---------- wisp, title, social ----------

function wisp() {
  const s = new Svg(256, 256, false)
  s.add(circle(128, 128, 128, s.rad([[0, "#ffffff", 1], [0.12, "#ffffff", 0.95], [0.3, "#f2fbff", 0.45], [0.6, "#e8f7ff", 0.12], [1, "#e8f7ff", 0]])))
  render("wisp", s.doc(), 256, 256)
  execFileSync("cp", [join(BUILD, "wisp.png"), join(OUT, "wisp.png")])
}

function title() {
  const s = new Svg(512, 512, false)
  const silver = s.v([[0, "#c9d2ec"], [0.5, "#7d86ad"], [1, "#3a4064"]])
  s.glow(256, 256, 250, P.cyan, 0.28)
  s.add(path("M256 96 A160 160 0 1 0 256 416 A120 120 0 1 1 256 96Z", P.moon, 'opacity="0.28" transform="rotate(-30 256 256)"'))
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const x = 256 + Math.cos(a) * 206
    const y = 256 + Math.sin(a) * 206
    const tx = 256 + Math.cos(a) * 246
    const ty = 256 + Math.sin(a) * 246
    const nx = Math.cos(a + Math.PI / 2) * 9
    const ny = Math.sin(a + Math.PI / 2) * 9
    s.add(poly([[x + nx, y + ny], [tx, ty], [x - nx, y - ny]], silver))
  }
  s.add(circle(256, 256, 206, "none", `stroke="${silver}" stroke-width="18"`))
  s.add(circle(256, 256, 180, "none", 'stroke="#5a6288" stroke-width="4"'))
  s.glow(256, 236, 140, P.cyan, 0.7)
  s.add(path("M256 150 a52 52 0 0 1 30 94 L310 360 L202 360 L226 244 A52 52 0 0 1 256 150Z", s.v([[0, "#ffffff"], [0.4, P.cyan], [1, "#2a8aa0"]])))
  s.add(path("M256 150 a52 52 0 0 1 30 94 L310 360 L202 360 L226 244 A52 52 0 0 1 256 150Z", "none", 'stroke="#1a2a40" stroke-width="5"'))
  s.add(path("M256 396 L276 422 L256 448 L236 422Z", s.v([[0, "#ff8a9a"], [0.5, P.bloodHi], [1, "#5a0614"]])))
  render("title", s.doc(), 512, 512)
  toWebp(join(BUILD, "title.png"), "title.webp")
}

const dataUri = (file: string) => `data:image/png;base64,${readFileSync(file).toString("base64")}`

function social() {
  const s = new Svg(1200, 630)
  s.add(`<image href="${dataUri(join(BUILD, "sky.png"))}" x="0" y="-30" width="1200" height="675"/>`)
  // the mansion: gabled roof over a 2x3 cross-section of the rooms
  const x0 = 330
  const cw = 270
  const ch = 180
  const y0 = 118
  s.add(poly([[x0 - 40, y0 + 6], [x0 + cw, y0 - 96], [x0 + cw * 2 + 40, y0 + 6]], "#07081a"))
  s.add(rect(x0 - 14, y0 - 6, cw * 2 + 28, ch * 3 + 26, "#07081a"))
  ROOMS.forEach((room, i) => {
    const cx = x0 + (i % 2) * cw
    const cy = y0 + Math.floor(i / 2) * ch
    s.add(`<image href="${dataUri(join(BUILD, `room-${room.id}.png`))}" x="${cx + 4}" y="${cy + 4}" width="${cw - 8}" height="${ch - 8}" preserveAspectRatio="xMidYMid slice"/>`)
  })
  const r = rng(3)
  for (let i = 0; i < 60; i++) {
    const x = x0 + r() * cw * 2
    const y = y0 + r() * ch * 3
    s.glow(x, y, 14 + r() * 10, P.cyan, 0.9)
  }
  HUNTERS.forEach((h, i) => {
    s.add(`<image href="${dataUri(join(BUILD, `hunter-${h.id}.png`))}" x="${i < 2 ? 60 + i * 110 : 900 + (i - 2) * 110}" y="330" width="180" height="288"/>`)
  })
  s.add(`<image href="${dataUri(join(BUILD, "title.png"))}" x="40" y="30" width="120" height="120"/>`)
  render("social", s.doc(), 1200, 630)
  execFileSync("cp", [join(BUILD, "social.png"), join(OUT, "social.png")])
}

// ---------- run ----------

const t0 = Date.now()
sky()
ROOMS.forEach((room, i) => {
  const s = new Svg(W, H)
  ROOM_PAINTERS[room.id](s, rng(100 + i))
  // the room's signature colour (contract ROOM_STYLE) washes its light so the coloured frames feel designed
  s.glow(W / 2, H * 0.45, W * 0.75, ROOM_STYLE[room.id].color, 0.22)
  const png = render(`room-${room.id}`, finish(s, 30 + i), W, H)
  execFileSync("magick", [png, "-kuwahara", "4", png]) // edge-preserving smear: reads as gouache, not vector
  toWebp(png, `room-${room.id}.webp`)
  // phone grid cell: thumb/room-<id>.webp 480x320 q70, so 300 phones stay light on venue wifi
  const thumb = join(BUILD, `room-${room.id}-thumb.png`)
  mkdirSync(join(OUT, "thumb"), { recursive: true })
  execFileSync("magick", [png, "-filter", "Lanczos", "-resize", "480x320", thumb])
  execFileSync("cwebp", ["-quiet", "-q", "70", "-m", "6", thumb, "-o", join(OUT, "thumb", `room-${room.id}.webp`)])
})
for (const h of HUNTERS) hunter(h.id, h.color)
wisp()
title()
social()
console.log(`placeholders written to ${OUT} in ${Date.now() - t0} ms`)
