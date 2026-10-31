// Writes pre-dithered room art for the phone: web/public/fx/rooms/<id>.webp (lane L14).
// Same palette and Bayer matrix as the stage filter (fx/palette.ts). Decoding and webp encoding run in headless
// Chromium (canvas), so no native image dependency is needed.
//   PLAYWRIGHT_DIR=~/haunted-hacks/qa bun web/src/fx/predither.ts      (reads http://localhost:3300/art/*)
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ROOMS } from "../../../contract/protocol"
import { DITHER_PALETTE, bayer8, paletteRgb } from "./palette"

const CELLS_W = 120 // dither cells across a room painting (phone tile ~180 css px -> ~1.5 css px per cell)
const UPSCALE = 4 // stored nearest-neighbour upscaled, so it stays crisp even without image-rendering: pixelated
const SPREAD = 0.13
const GAMMA = 0.9
const CONTRAST = 0.45

const BASE = process.env.BASE ?? "http://localhost:3300"
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, "../../public/fx/rooms")
mkdirSync(OUT, { recursive: true })
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? HERE, "x.js"))
const { chromium } = require("playwright")

interface PrepArgs {
  src: string
  pal: number[]
  cellsW: number
  up: number
  spread: number
  gamma: number
  contrast: number
  bayer: number[]
}

const browser = await chromium.launch({ channel: "chromium", headless: true })
const page = await browser.newPage()
await page.goto(`${BASE}/art/`).catch(() => undefined) // same origin for canvas reads
for (const room of ROOMS) {
  const src = `${BASE}/art/room-${room.id}.webp`
  const dataUrl: string = await page.evaluate(
    async ({ src, pal, cellsW, up, spread, gamma, contrast, bayer }: PrepArgs) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = src
      await img.decode()
      const w = cellsW
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w)
      const small = document.createElement("canvas")
      small.width = w
      small.height = h
      const g = small.getContext("2d")!
      g.imageSmoothingQuality = "high"
      g.drawImage(img, 0, 0, w, h)
      const d = g.getImageData(0, 0, w, h)
      const n = pal.length / 3
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const t = bayer[(y & 7) * 8 + (x & 7)] - 0.5
          const c = [0, 1, 2].map((k) => {
            let v = Math.pow(d.data[i + k] / 255, gamma)
            v = v + (v * v * (3 - 2 * v) - v) * contrast
            return v + t * spread
          })
          let best = 1e9
          let pick = 0
          for (let p = 0; p < n; p++) {
            const dr = c[0] - pal[p * 3], dg = c[1] - pal[p * 3 + 1], db = c[2] - pal[p * 3 + 2]
            const rm = 0.5 * (c[0] + pal[p * 3])
            const e = (2 + rm) * dr * dr + 4 * dg * dg + (3 - rm) * db * db
            if (e < best) { best = e; pick = p }
          }
          d.data[i] = Math.round(pal[pick * 3] * 255)
          d.data[i + 1] = Math.round(pal[pick * 3 + 1] * 255)
          d.data[i + 2] = Math.round(pal[pick * 3 + 2] * 255)
          d.data[i + 3] = 255
        }
      g.putImageData(d, 0, 0)
      const big = document.createElement("canvas")
      big.width = w * up
      big.height = h * up
      const b = big.getContext("2d")!
      b.imageSmoothingEnabled = false
      b.drawImage(small, 0, 0, w * up, h * up)
      return big.toDataURL("image/webp", 1)
    },
    {
      src,
      pal: Array.from(paletteRgb(DITHER_PALETTE)),
      cellsW: CELLS_W,
      up: UPSCALE,
      spread: SPREAD,
      gamma: GAMMA,
      contrast: CONTRAST,
      bayer: Array.from({ length: 64 }, (_, k) => bayer8(k % 8, Math.floor(k / 8))),
    },
  )
  const m = /^data:image\/webp;base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error(`predither: ${room.id} did not encode as webp`)
  const file = path.join(OUT, `${room.id}.webp`)
  writeFileSync(file, Buffer.from(m[1], "base64"))
  console.log(room.id, file, `${Math.round(Buffer.byteLength(m[1], "base64") / 1024)} KB`)
}
await browser.close()
