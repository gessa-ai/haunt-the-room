// L19 AVATARS: hand-drawn 20x20 pixel ghost busts, one per seed, deterministic.
// Every hair, eye, mouth and accessory below is a pixel grid drawn by hand; rows are centred on the 20 px canvas
// unless they are already 20 wide. The outline is computed (any empty pixel touching paint turns ink).
import { GHOST_COLORS } from "../../../contract/protocol.ts"

export const AVATAR_PX = 20

// ---------- grids ----------

type Layer = { top: number; rows: string[] }
const L = (top: number, ...rows: string[]): Layer => ({ top, rows })

// H base hair, D hair shadow, L hair highlight
const HAIRS: Record<string, Layer> = {
  bowl: L(3, "HHHHHHHH", "HHLLHHHHHH", "HHHHHHHHHHHH", "HHHHHHHHHHHH", "DHHHHHHHHHHD", "D..........D"),
  spiky: L(1, "..H..H...H..", ".HH.HHL.HHH.", ".HHHHHLHHHH.", "HHHLHHHHHHHH", "HHHHHHHHHHHH", "DHH.HHH.HHHD", "D..........D"),
  curtains: L(
    3, "..HHHHHHHH..", ".HHLLHHHHHH.", "HHHHHHHHHHHH", "HHHHH..HHHHH", "HHH......HHH", "HH........HH",
    "HH........HH", "HH........HH", "HD........DH", "HD........DH", "DD........DD", "D..........D",
  ),
  bob: L(3, "...HHHHHH...", ".HHHHHHHLHH.", "HHHHHHHHHHHH", "HHH.HHHHHHHH", "HH....HHHHHH", "HH.......HHH", "HH........HH", "HD........DH", "DD........DD"),
  pigtails: L(
    3, "....HHHHHHHH....", "...HHLLHHHHHH...", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", ".DHH........HHD.",
    "DHD..........DHD", "HHH..........HHH", "HLH..........HLH", "DHD..........DHD", ".D............D.",
  ),
  mohawk: L(0, "HH", "HHHH", "HLHH", "HLHH", "HHHH", "DHHD"),
  afro: L(
    1, "....HHHHHH....", "..HHHHLHHHHH..", ".HHHLHHHHHHHH.", "HHHHHHHHHHLHHH", "HHDHHHHHHHHDHH",
    "HHHDHDHHDHDHHH", "HHH........HHH", "HHD........DHH", "DH..........HD", ".D..........D.",
  ),
  bun: L(0, ".HHHH.", "HHLHHH", ".DHHD.", "HHHHHHHH", "HHLHHHHHHH", "HHHHHHHHHHHH", "HH........HH", "HD........DH", "D..........D"),
  swoop: L(2, ".......HH...", "...HHHHHHHH.", ".HHHHHHLLHHH", "HHHHHHHHHHHH", "HHHHHHHHHH.H", "DHHHHHH....H", "D.HHH......D", "D..........D"),
  crew: L(2, ".....HH.....", "...HHHHHH...", "..HHHHHHHH..", ".HHHLHHHHHH.", ".DHHDHHDHHD.", ".D........D."),
  waves: L(
    3, "...HHHHHHHH...", "..HHLHHHHHHH..", ".HHHHHHHHHHHH.", ".HHHHHHHHHHHH.", ".HHH......HHH.", "HHH........HHH",
    ".HH........HH.", "HHD........DHH", ".HH........HH.", "HHD........DHH", ".DH........HD.", "..D........D..",
  ),
  braid: L(
    3, "...HHHHHHHH...", "..HHHHHLHHHH..", ".HHHHHHHHHHHH.", ".HHHHHHHHH..H.", ".HD.......D.H.", ".D..........HH",
    "............DH", "...........HH.", "............HD", "...........HH.", "............DH", "...........HH.", "............D.",
  ),
}

// K ink, W glint, I iris (ghost tint, deep). Left eye; the right eye is its mirror.
const EYES: Record<string, Layer & { x: number }> = {
  button: { x: 7, ...L(9, "WK", "KK") },
  tall: { x: 7, ...L(8, "WK", "KK", "KK") },
  happy: { x: 6, ...L(9, ".K.", "K.K") },
  sleepy: { x: 6, ...L(10, "KKK", ".KK") },
  sparkle: { x: 6, ...L(8, "WKK", "KIK", "KKK") },
  cross: { x: 6, ...L(8, "K.K", ".K.", "K.K") },
  stern: { x: 6, ...L(8, "K..", ".KK", ".KK") },
}

// K ink, R tongue, W tooth
const MOUTHS: Record<string, Layer> = {
  smile: L(12, "K....K", ".KKKK."),
  ooh: L(12, ".KK.", "KRRK", ".KK."),
  flat: L(13, "KKKK"),
  fangs: L(12, "KKKKKK", "KWKKWK"),
  kitty: L(12, "K.KK.K", ".K..K."),
  tongue: L(12, "KKKK", "KRRK", ".RR."),
  wobble: L(12, ".K.K.K", "K.K.K."),
}

type Accessory = { face?: boolean; overEyes?: boolean; clearHairAbove?: number; layer: Layer; colors: Record<string, string> }
const ACCESSORIES: Record<string, Accessory> = {
  witchHat: {
    clearHairAbove: 5,
    layer: L(0, "...........PP.......", "..........PPP.......", ".........PPQP.......", "........PPPQPP......", "......YYYGGYYY......", "...PPPPPPPPPPPPPP..."),
    colors: { P: "#2b1f40", Q: "#4a3570", Y: "#ff9a1f", G: "#ffe07a" },
  },
  bandana: {
    layer: L(4, "......RRRRRRRR......", ".....RRWRRRRWRR.....", "....rRRRRRRRRRRr.RR.", "................RrR."),
    colors: { R: "#e0394f", r: "#9c2335", W: "#fff1f1" },
  },
  flowerCrown: {
    layer: L(3, "....F....B....F.....", "...FYF.GBYBG.FYF....", "....FGGGGGGGGGF....."),
    colors: { F: "#ff8fc8", B: "#8fb8ff", Y: "#ffe066", G: "#4fae5a" },
  },
  horns: {
    layer: L(1, "....N..........N....", "....NN........NN....", ".....Nn......nN.....", ".....nn......nn....."),
    colors: { N: "#f3e8d2", n: "#b9a582" },
  },
  glasses: {
    overEyes: true,
    layer: L(8, ".....MMMMMMMMMM.....", "....MM...MM...MM....", ".....M...MM...M.....", "......MMM..MMM......"),
    colors: { M: "#e0a63e" },
  },
  scar: {
    face: true,
    layer: L(9, "......S.............", ".....XSX............", "......S.............", ".....XSX............", "......S............."),
    colors: { S: "#b0425e", X: "#5a1a2c" },
  },
  halo: {
    layer: L(0, "......YYYYYYYY......", ".....Y........Y.....", "......yyyyyyyy......"),
    colors: { Y: "#ffe066", y: "#c9951a" },
  },
  bow: {
    layer: L(2, "............BB.BB...", "...........BBBbBBB..", "............BB.BB..."),
    colors: { B: "#ff5fa2", b: "#b8326c" },
  },
  catEars: {
    layer: L(1, ".....H........H.....", ".....HH......HH.....", ".....HPH....HPH.....", "....HHPHH..HHPHH...."),
    colors: { P: "#ff9fc4" },
  },
}

// flame tops (y) for columns x2..17, three frames
const FLAME_TOPS = [
  [6, 4, 2, 3, 5, 1, 3, 4, 2, 0, 3, 5, 2, 4, 3, 6],
  [5, 3, 4, 1, 4, 3, 2, 5, 0, 3, 4, 2, 5, 1, 4, 5],
  [6, 2, 3, 4, 2, 4, 1, 3, 4, 2, 1, 4, 3, 3, 2, 6],
]

const HAIR_COLORS = ["#2b1d3a", "#6e4026", "#d9652b", "#f2c94c", "#f1ecff", "#5fd8b0", "#ff7ab8", "#4f7dff", "#b8324a", "#9a7aff"]

for (const [name, g] of Object.entries({ ...HAIRS, ...MOUTHS, ...EYES, ...Object.fromEntries(Object.entries(ACCESSORIES).map(([k, a]) => [k, a.layer])) })) {
  for (const r of g.rows) if (r.length > AVATAR_PX) throw new Error(`avatar grid ${name}: row wider than ${AVATAR_PX}: ${r}`)
}

// ---------- spec ----------

export type HairStyle = keyof typeof HAIRS
export type EyeStyle = keyof typeof EYES
export type MouthStyle = keyof typeof MOUTHS
export type AccessoryStyle = keyof typeof ACCESSORIES
export const HAIR_STYLES = Object.keys(HAIRS) as HairStyle[]
export const EYE_STYLES = Object.keys(EYES) as EyeStyle[]
export const MOUTH_STYLES = Object.keys(MOUTHS) as MouthStyle[]
export const ACCESSORY_STYLES = Object.keys(ACCESSORIES) as AccessoryStyle[]

export interface AvatarSpec {
  seed: string
  colorIndex: number
  tint: string
  hair: HairStyle
  hairColor: string
  eyes: EyeStyle
  mouth: MouthStyle
  accessory: AccessoryStyle
  blush: boolean
}

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

/** Deterministic look for a ghost. seed = the ghost's publicId (contract: 10 hex of sha256("haunt:"+ghostId), server-side); NEVER the raw ghostId. Pass the ghost's colorIndex (from the house state) so the face matches its colour. */
export function avatarFor(seed: string, colorIndex?: number): AvatarSpec {
  const h = hash(seed)
  const r = rng(h)
  const ci = (((colorIndex ?? h % GHOST_COLORS.length) % GHOST_COLORS.length) + GHOST_COLORS.length) % GHOST_COLORS.length
  return {
    seed,
    colorIndex: ci,
    tint: GHOST_COLORS[ci]!,
    hair: pick(r, HAIR_STYLES),
    hairColor: pick(r, HAIR_COLORS),
    eyes: pick(r, EYE_STYLES),
    mouth: pick(r, MOUTH_STYLES),
    accessory: pick(r, ACCESSORY_STYLES),
    blush: r() < 0.6,
  }
}

// ---------- colour ----------

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const WHITE: RGB = [255, 255, 255]
const INK: RGB = rgb("#1c1228")
const DIM: RGB = rgb("#5d566b")

// ---------- compose ----------

export interface AvatarOpts {
  fire?: boolean
  dim?: boolean
  colorIndex?: number
  /** flame frame 0..2; default follows the clock (call drawAvatar each frame to animate) */
  frame?: number
}

function compose(spec: AvatarSpec, dim: boolean, flameFrame: number | null): ImageData {
  const N = AVATAR_PX
  const px: (RGB | null)[] = new Array(N * N).fill(null)
  const set = (x: number, y: number, c: RGB) => {
    if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c
  }
  const stamp = (layer: Layer, pal: Record<string, RGB>, x0?: number, mirror = false) => {
    layer.rows.forEach((row, i) => {
      const left = x0 ?? Math.floor((N - row.length) / 2)
      for (let j = 0; j < row.length; j++) {
        const c = pal[row[j]!]
        if (!c) continue
        set(mirror ? N - 1 - (left + j) : left + j, layer.top + i, c)
      }
    })
  }
  const tint = rgb(spec.tint)
  const hair = rgb(spec.hairColor)
  const hairPal = { H: hair, D: mix(hair, INK, 0.38), L: mix(hair, WHITE, 0.4) }

  // flame crown sits behind everything
  if (flameFrame !== null) {
    const tops = FLAME_TOPS[flameFrame % 3]!
    const R = rgb("#e0362a"), O = rgb("#ff7a1a"), Y = rgb("#ffd23a"), C = rgb("#fff3b0")
    tops.forEach((top, i) => {
      for (let y = top; y <= 9; y++) {
        const d = y - top
        set(2 + i, y, d === 0 ? R : d < 3 ? O : d < 5 ? Y : C)
      }
    })
  }

  // sheet shoulders
  const sheet = mix(tint, WHITE, 0.25), fold = mix(tint, INK, 0.22)
  const sheetRows: [number, number, number][] = [[15, 4, 15], [16, 3, 16], [17, 2, 17], [18, 2, 17], [19, 2, 17]]
  for (const [y, a, b] of sheetRows) for (let x = a; x <= b; x++) set(x, y, sheet)
  for (const [x, y] of [[5, 17], [5, 18], [6, 19], [14, 17], [14, 18], [13, 19], [9, 18], [10, 19]] as const) set(x, y, fold)

  // head
  const face = mix(tint, WHITE, 0.62), shade = mix(tint, WHITE, 0.3)
  for (let y = 5; y <= 14; y++) for (let x = 5; x <= 14; x++) {
    if ((y === 5 || y === 14) && (x === 5 || x === 14)) continue
    set(x, y, x === 14 || y === 14 ? shade : face)
  }
  if (spec.blush) {
    const b = mix(face, rgb("#ff6f9f"), 0.5)
    for (const x of [5, 6, 13, 14]) set(x, 11, b)
  }

  const acc = ACCESSORIES[spec.accessory]!
  const accPal: Record<string, RGB> = { ...hairPal }
  for (const [k, v] of Object.entries(acc.colors)) accPal[k] = rgb(v)
  if (acc.face) stamp(acc.layer, accPal)

  const eye = EYES[spec.eyes]!
  const eyePal = { K: INK, W: WHITE, I: mix(tint, INK, 0.45) }
  stamp(eye, eyePal, eye.x)
  stamp(eye, eyePal, eye.x, true)
  stamp(MOUTHS[spec.mouth]!, { K: INK, R: rgb("#ff5a7a"), W: WHITE })

  if (acc.overEyes) stamp(acc.layer, accPal)

  const hl = HAIRS[spec.hair]!
  const clear = acc.clearHairAbove ?? 0
  stamp({ top: hl.top, rows: hl.rows.map((r, i) => (hl.top + i < clear ? "" : r)) }, hairPal)
  if (!acc.face && !acc.overEyes) stamp(acc.layer, accPal)

  // outline
  const out = px.slice()
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (px[y * N + x]) continue
    const n = (dx: number, dy: number) => {
      const xx = x + dx, yy = y + dy
      return xx >= 0 && yy >= 0 && xx < N && yy < N && px[yy * N + xx] !== null
    }
    if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) out[y * N + x] = INK
  }

  const img = new ImageData(N, N)
  out.forEach((c, i) => {
    if (!c) return
    const v = dim ? mix(c, DIM, 0.55) : c
    img.data[i * 4] = v[0]
    img.data[i * 4 + 1] = v[1]
    img.data[i * 4 + 2] = v[2]
    img.data[i * 4 + 3] = dim ? 200 : 255
  })
  return img
}

const tiles = new Map<string, HTMLCanvasElement>()
function tile(seed: string, opts: AvatarOpts): HTMLCanvasElement {
  const frame = opts.fire ? (opts.frame ?? Math.floor(performance.now() / 140)) % 3 : null
  const key = `${seed}|${opts.colorIndex ?? ""}|${opts.dim ? 1 : 0}|${frame ?? "-"}`
  let c = tiles.get(key)
  if (!c) {
    c = document.createElement("canvas")
    c.width = c.height = AVATAR_PX
    c.getContext("2d")!.putImageData(compose(avatarFor(seed, opts.colorIndex), !!opts.dim, frame), 0, 0)
    tiles.set(key, c)
  }
  return c
}

/**
 * Draw a crisp avatar. Given a canvas, it is resized to sizePx and filled; given a 2D context, the avatar is drawn
 * at (x, y) in that context. The face is scaled by an integer factor and centred in the sizePx box.
 */
export function drawAvatar(
  target: HTMLCanvasElement | CanvasRenderingContext2D,
  seed: string,
  sizePx: number,
  opts: AvatarOpts & { x?: number; y?: number } = {},
): void {
  let ctx: CanvasRenderingContext2D
  if (target instanceof HTMLCanvasElement) {
    if (target.width !== sizePx || target.height !== sizePx) target.width = target.height = sizePx
    ctx = target.getContext("2d")!
    ctx.clearRect(0, 0, sizePx, sizePx)
  } else ctx = target
  const scale = Math.max(1, Math.floor(sizePx / AVATAR_PX))
  const s = AVATAR_PX * scale
  const off = Math.floor((sizePx - s) / 2)
  const prev = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tile(seed, opts), (opts.x ?? 0) + off, (opts.y ?? 0) + off, s, s)
  ctx.imageSmoothingEnabled = prev
}

const urls = new Map<string, string>()
/** PNG data URL for <img>; cached per id/size/options. Use CSS `image-rendering: pixelated` if the img is scaled. */
export function avatarDataUrl(seed: string, size = 80, opts: AvatarOpts = {}): string {
  const key = `${seed}|${size}|${opts.colorIndex ?? ""}|${opts.dim ? 1 : 0}|${opts.fire ? opts.frame ?? 0 : "-"}`
  let u = urls.get(key)
  if (!u) {
    const c = document.createElement("canvas")
    drawAvatar(c, seed, size, { ...opts, frame: opts.frame ?? 0 })
    u = c.toDataURL("image/png")
    urls.set(key, u)
  }
  return u
}

// ---------- atlas (3D stage) ----------

export interface AvatarUV {
  u0: number
  v0: number
  u1: number
  v1: number
}
export interface AvatarAtlas {
  /** 2560x2560 canvas, 32x32 = 1024 cells of 80 px (each avatar at 4x); when full the least recently used cell is repainted. Use NearestFilter, no mipmaps. */
  canvas: HTMLCanvasElement
  cell: number
  /** Bumps whenever a new avatar is painted in; set texture.needsUpdate when it changes. */
  version: number
  /** UVs (three.js convention: v grows upward, flipY true) of the cell for this ghost, painting it on first use. Call it every frame you show a face (cheap) so live faces stay most recently used; a UV may change after eviction. */
  uv(seed: string, opts?: AvatarOpts): AvatarUV
}

let atlas: AvatarAtlas | null = null
export function avatarAtlas(): AvatarAtlas {
  if (atlas) return atlas
  const COLS = 32, CELL = AVATAR_PX * 4, SIZE = COLS * CELL // 2560x2560, 1024 cells, LRU eviction
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext("2d")!
  const slots = new Map<string, number>()
  const a: AvatarAtlas = {
    canvas,
    cell: CELL,
    version: 0,
    uv(seed, opts = {}) {
      const frame = opts.fire ? (opts.frame ?? Math.floor(performance.now() / 140)) % 3 : "-"
      const key = `${seed}|${opts.colorIndex ?? ""}|${opts.dim ? 1 : 0}|${frame}`
      let i = slots.get(key)
      if (i !== undefined) {
        // touch: Map keeps insertion order, so re-inserting makes this the most recently used
        slots.delete(key)
        slots.set(key, i)
      } else {
        if (slots.size >= COLS * COLS) {
          const [lru, slot] = slots.entries().next().value!
          slots.delete(lru)
          i = slot
        } else i = slots.size
        slots.set(key, i)
        const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL
        ctx.clearRect(x, y, CELL, CELL)
        drawAvatar(ctx, seed, CELL, { ...opts, frame: typeof frame === "number" ? frame : undefined, x, y })
        a.version++
      }
      const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL
      return { u0: x / SIZE, u1: (x + CELL) / SIZE, v0: 1 - (y + CELL) / SIZE, v1: 1 - y / SIZE }
    },
  }
  atlas = a
  return a
}

export { drawHunter, hunterDataUrl, HUNTER_PX, type HunterOpts } from "./hunters.ts"
