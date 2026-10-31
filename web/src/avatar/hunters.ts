// L19 HUNTERS: four hand-drawn 24x24 pixel portraits of the AI hunters. Deliberately not cute: full-bleed dark
// frames, sallow skin, light from odd places. Each grid is 24 rows of 24; "." is the vignette background.
// `talk` rows replace rows on the second talking frame (a mouth/eye twitch).
import { HUNTERS, type HunterId } from "../../../contract/protocol.ts"

export const HUNTER_PX = 24

interface Portrait {
  rows: string[]
  talk: Record<number, string>
  pal: Record<string, string>
}

const P: Record<HunterId, Portrait> = {
  // tired old man: bald dome, grey side hair, deep sockets with pin glints, upturned coat collar, cigarette glow
  exorcist: {
    rows: [
      "........................",
      "...................g....",
      ".........kkkkkk...g.....",
      ".......kkhhhsssk...g....",
      "......khhssssssSk..g....",
      ".....kwhssssssssSk.g....",
      ".....kwwsssssssSwwk.....",
      "....kwwkkkssssskkkwk....",
      "....kwsSdddSssSdddSk....",
      "....kwsSdedSssSdedSk....",
      ".....ksSSddSssSddSSk....",
      ".....kssssSssssSsssk....",
      ".....kSsssSSsSSsssSk....",
      ".....kSSsskkkkktttoy....",
      "......kSsSssssSSk.y.....",
      "......kkSSSSSSSSk.......",
      "......cckkSSSSkkcc......",
      ".....cCCckSSSSkcCCc.....",
      "....cCCCCckxxkcCCCCc....",
      "...cccCCCcckkcccCCccc...",
      "..cccccCCccckcccCCcccc..",
      ".ccccccccccckccccccccccc",
      "cccccccccccckccccccccccc",
      "cccccccccccckccccccccccc",
    ],
    talk: { 9: "....kwsSdkdSssSdkdSk....", 13: ".....kSSskkkkkktttyo....", 14: "......kSsSkkkkSSk.y....." },
    pal: { k: "#0d0812", h: "#cdbba6", s: "#a8968a", S: "#75625c", d: "#2a1c22", e: "#ffe9a8", w: "#8c8790", c: "#2e2826", C: "#4d433b", x: "#d8d2c6", t: "#e8e0d0", o: "#ff5a1a", y: "#ffd27a", g: "#6f6878" },
  },
  // veiled, glassy white eyes, a smile far too wide, bead necklace
  medium: {
    rows: [
      "........vvvvvvvv........",
      "......vvVvvvvvvVvv......",
      ".....vvvvvvVvvvvvvv.....",
      "....vvVvvvvvvvvvvvVvv...",
      "....vvvvvkkkkkkvvvvvv...",
      "...vvVvvkppppppkvvVvv...",
      "...vvvvkppppppppkvvvv...",
      "...vvVkpPPppppPPpkvVv...",
      "...vvvkWWWqppWWWqkvvv...",
      "..vvvVkWWWWppWWWWkVvvv..",
      "..vvvvkpqqppppqqpkvvvv..",
      "..vvVvkpppppPppppkvVvv..",
      "..vvvvkkppppPppppkkvvv..",
      "..vvvvkTkkkkkkkkkTkvvv..",
      "..vvVvvkTTTTTTTTTkvVvv..",
      "..vvvvvkkkkkkkkkkkvvvv..",
      "...vvvvvkPppppPkvvvvv...",
      "..vvvvvVvkkkkkkvVvvvvv..",
      ".vvvvvvvnvvvvvvnvvvvvvv.",
      ".vvvVvvvvnvvvvnvvvVvvvv.",
      "vvvvvvvvvvnnnnvvvvvvvvvv",
      "vvvvVvvvvvvnnvvvvvVvvvvv",
      "vvvvvvvvvvvvvvvvvvvvvvvv",
      "vvvVvvvvvvvvvvvvvvvVvvvv",
    ],
    talk: { 8: "...vvvkWWWWppWWWWkvvv...", 9: "..vvvVkWWqWppWqWWkVvvv..", 14: "..vvVvvkTkkkkkkTkkvVvv..", 15: "..vvvvvkkTTTTTTkkkvvvv.." },
    pal: { k: "#0b0710", v: "#33264a", V: "#5e4a85", p: "#c9c4d6", P: "#8d86a3", W: "#f4f6ff", q: "#9aa3b8", T: "#efe9e0", n: "#b18cff" },
  },
  // cracked glasses full of glare (no eyes), side-parted hair, tie, a clipboard edge
  skeptic: {
    rows: [
      "........................",
      ".........kkkkkkk........",
      ".......kkrrrrrRrkk......",
      "......krrrrrrRRrrrk.....",
      ".....krrrrRRrrrrrrrk....",
      ".....krrkssssssrrrrk....",
      ".....krkssssssssssrk....",
      ".....kksSSssssssSSsk....",
      "....kkkkkkkkskkkkkkkk...",
      "....kkGLGGGkkkGGGLLkk...",
      "....ksGGLGGksskGkGGks...",
      "....ksGGGLGksskGGkGks...",
      ".....kkkkkkssskkkkkk....",
      ".....kssssSSsSSsssk.....",
      ".....kSsssssssssSSk.....",
      "......kSskkkkkksSk......",
      "......kSSssssssSSk......",
      ".......kkSSSSSSkk.......",
      "......xxxkSSSSkxxx......",
      "...bbxxxxxxkTkxxxxxxx...",
      "..bmmbxxxxxkTTkxxxxxxx..",
      "..bppbxxxxxkTTkxxxxxxxx.",
      ".bpppbxxxxxxkTkxxxxxxxx.",
      ".bpppbxxxxxxkTTkxxxxxxxx",
    ],
    talk: { 10: "....ksGLGGGksskGkGLks...", 15: "......kSkkkkkkksSk......", 16: "......kSSkkkkkkSSk......" },
    pal: { k: "#0a0c12", r: "#3b3330", R: "#5e534c", s: "#b8ab9e", S: "#857669", G: "#7ad7ff", L: "#f2fbff", x: "#cfd4da", T: "#6a2230", b: "#7a5a38", p: "#efe6cf", m: "#9aa0a8" },
  },
  // gaunt, slicked hair, high black collar with gold trim, face lit from below by a candle
  priest: {
    rows: [
      "........................",
      "........kkkkkkkk........",
      ".......krrrrrrrrk.......",
      "......krrrRrrrrrrk......",
      "......krrRrrrrrrrk......",
      "......krdddddddddk......",
      "......kdddddddddddk.....",
      "......kdkkdddddkkdk.....",
      "......kdkekdddkekdk.....",
      "......kddSddsddSddk.....",
      "......kdSkSdsdSkSdk.....",
      ".......kSkSsssSkSk......",
      ".......kSksshssksk......",
      ".......kSsskkksssk......",
      "........kshhhhhsk.......",
      "........kchhhhhck.......",
      ".......GccchhhcccG......",
      "......GcccckhkccccG.....",
      ".....GccccccxcccccccG...",
      "....GcccccccxccccccccG..",
      "...GccccccccxcccccccccG.",
      "..GccccccccyoyccccccccG.",
      ".Gcccccccccuxucccccccc.G",
      "Gcccccccccccucccccccccc.",
    ],
    talk: { 8: "......kdkkkdddkkkdk.....", 13: ".......kSskkkkkssk......", 21: "..GccccccccoycccccccccG." },
    pal: { k: "#07050a", r: "#1d1820", R: "#3a3140", d: "#3a2a2a", e: "#ff8a7a", S: "#6e554c", s: "#b0897a", h: "#ffcf9a", c: "#141016", G: "#d9a93a", x: "#efe3c8", u: "#bfae8a", o: "#fff1a0", y: "#ff8a1f" },
  },
}

for (const [id, p] of Object.entries(P)) {
  const all = [...p.rows, ...Object.values(p.talk)]
  if (p.rows.length !== HUNTER_PX) throw new Error(`hunter ${id}: ${p.rows.length} rows`)
  all.forEach((r) => {
    if (r.length !== HUNTER_PX) throw new Error(`hunter ${id}: row "${r}" is ${r.length} wide`)
    for (const ch of r) if (ch !== "." && !p.pal[ch]) throw new Error(`hunter ${id}: no colour for "${ch}"`)
  })
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function compose(id: HunterId, frame: number): ImageData {
  const p = P[id]
  const accent = rgb(HUNTERS.find((h) => h.id === id)!.color)
  const img = new ImageData(HUNTER_PX, HUNTER_PX)
  for (let y = 0; y < HUNTER_PX; y++) {
    const row = (frame === 1 && p.talk[y]) || p.rows[y]!
    for (let x = 0; x < HUNTER_PX; x++) {
      const ch = row[x]!
      let c: [number, number, number]
      if (ch === ".") {
        // dithered vignette in the hunter's colour, darkest at the corners
        const d = Math.hypot(x - 11.5, y - 9) / 16
        const t = Math.max(0, 0.32 - d * 0.3) + ((x + y) % 2 === 0 && d > 0.55 ? 0 : 0.03)
        c = [10 + accent[0] * t, 6 + accent[1] * t, 14 + accent[2] * t]
      } else c = rgb(p.pal[ch]!)
      const i = (y * HUNTER_PX + x) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = 255
    }
  }
  return img
}

const tiles = new Map<string, HTMLCanvasElement>()
function tile(id: HunterId, frame: number): HTMLCanvasElement {
  const key = `${id}|${frame}`
  let c = tiles.get(key)
  if (!c) {
    c = document.createElement("canvas")
    c.width = c.height = HUNTER_PX
    c.getContext("2d")!.putImageData(compose(id, frame), 0, 0)
    tiles.set(key, c)
  }
  return c
}

export interface HunterOpts {
  /** alternate a mouth/eye twitch; follows the clock (180 ms) unless frame is given */
  talking?: boolean
  frame?: number
  x?: number
  y?: number
}

/** Draw a hunter portrait: canvas target is resized to sizePx; ctx target draws at (x, y). Integer scale, crisp. */
export function drawHunter(target: HTMLCanvasElement | CanvasRenderingContext2D, hunterId: HunterId, sizePx: number, opts: HunterOpts = {}): void {
  if (!P[hunterId]) throw new Error(`drawHunter: unknown hunter "${hunterId}"`)
  let ctx: CanvasRenderingContext2D
  if (target instanceof HTMLCanvasElement) {
    if (target.width !== sizePx || target.height !== sizePx) target.width = target.height = sizePx
    ctx = target.getContext("2d")!
    ctx.clearRect(0, 0, sizePx, sizePx)
  } else ctx = target
  const frame = opts.talking ? (opts.frame ?? Math.floor(performance.now() / 180)) % 2 : 0
  const scale = Math.max(1, Math.floor(sizePx / HUNTER_PX))
  const s = HUNTER_PX * scale
  const off = Math.floor((sizePx - s) / 2)
  const prev = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tile(hunterId, frame), (opts.x ?? 0) + off, (opts.y ?? 0) + off, s, s)
  ctx.imageSmoothingEnabled = prev
}

const urls = new Map<string, string>()
/** Cached PNG data URL (resting frame, or frame 0/1 of the talk twitch). */
export function hunterDataUrl(hunterId: HunterId, size = 96, frame = 0): string {
  const key = `${hunterId}|${size}|${frame}`
  let u = urls.get(key)
  if (!u) {
    const c = document.createElement("canvas")
    drawHunter(c, hunterId, size, { talking: frame === 1, frame })
    u = c.toDataURL("image/png")
    urls.set(key, u)
  }
  return u
}
