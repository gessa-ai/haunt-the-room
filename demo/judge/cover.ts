// L11: judge cover art. The projector shot and a phone shot side by side in pixel frames (orange = projector,
// cyan = phone), labels in Geist Pixel, the title small, the whole thing lightly ordered-dithered like the game.
//   bun demo/judge/cover.ts <projector image> <phone image>   -> demo/judge/cover.jpg (2800 px wide)
// Fonts: demo/cards.ts converts the stage fonts to TTF in demo/build/fonts; this adds Geist Pixel from
// web/node_modules/geist. Rendering: SVG -> rsvg-convert (fontconfig backend), then ImageMagick dither.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const [stageArg, phoneArg] = process.argv.slice(2)
if (!stageArg || !phoneArg) throw new Error("usage: bun demo/judge/cover.ts <projector image> <phone image>")
const STAGE = resolve(stageArg)
const PHONE = resolve(phoneArg)
const DIR = import.meta.dir
const BUILD = join(DIR, "..", "build")
const FONTS = join(BUILD, "fonts")
mkdirSync(FONTS, { recursive: true })
const py = (src: string, out: string) =>
  execFileSync("python3", ["-I", "-c", "import sys\nfrom fontTools.ttLib import TTFont\nf=TTFont(sys.argv[1]); f.flavor=None; f.save(sys.argv[2])", src, out])
const WEB = join(DIR, "..", "..", "web", "node_modules")
if (!existsSync(join(FONTS, "GeistPixel-Square.ttf"))) py(join(WEB, "geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2"), join(FONTS, "GeistPixel-Square.ttf"))
if (!existsSync(join(FONTS, "pirata-one-latin-400-normal.ttf"))) py(join(WEB, "@fontsource/pirata-one/files/pirata-one-latin-400-normal.woff"), join(FONTS, "pirata-one-latin-400-normal.ttf"))
const CONF = join(BUILD, "fonts.conf")
writeFileSync(CONF, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/opt/homebrew/etc/fonts/fonts.conf</include><dir>${FONTS}</dir><cachedir>${join(BUILD, "fc-cache")}</cachedir></fontconfig>`)

const size = (f: string): [number, number] => execFileSync("magick", ["identify", "-format", "%w %h", f + "[0]"]).toString().trim().split(" ").map(Number) as [number, number]
const W = 2800, H = 1500, PX = 10 // canvas; PX = one "pixel" of the frames
const INK = "#05060f", ORANGE = "#ff7a2f", CYAN = "#7af0ff", MOON = "#cfe0ff"

// layout: projector left (16:9), phone right, bottoms aligned
const [sw, sh] = size(STAGE)
const [pw, ph] = size(PHONE)
const sW = 1880, sH = Math.round((sW * sh) / sw)
const pH = sH + 0, pW = Math.round((pH * pw) / ph)
const gap = 150
const x0 = Math.round((W - (sW + gap + pW)) / 2), y0 = 300
const px1 = x0 + sW + gap

/** A chunky pixel frame: a PX-stepped border with notched (stair) corners, two pixels thick. */
function frame(x: number, y: number, w: number, h: number, color: string): string {
  const t = PX * 2, n = PX * 2 // thickness, corner notch
  const r = (rx: number, ry: number, rw: number, rh: number) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${color}"/>`
  const X = x - t - PX, Y = y - t - PX, Wd = w + 2 * (t + PX), Hd = h + 2 * (t + PX)
  return [
    r(X + n, Y, Wd - 2 * n, t), r(X + n, Y + Hd - t, Wd - 2 * n, t), // top, bottom
    r(X, Y + n, t, Hd - 2 * n), r(X + Wd - t, Y + n, t, Hd - 2 * n), // left, right
    r(X + PX, Y + PX, PX * 2, PX * 2), r(X + Wd - PX * 3, Y + PX, PX * 2, PX * 2), // stair corners
    r(X + PX, Y + Hd - PX * 3, PX * 2, PX * 2), r(X + Wd - PX * 3, Y + Hd - PX * 3, PX * 2, PX * 2),
    // a pixel shadow under the frame
    `<rect x="${X + PX * 2}" y="${Y + Hd}" width="${Wd - PX * 2}" height="${PX}" fill="${color}" opacity="0.35"/>`,
  ].join("")
}
const label = (x: number, y: number, text: string, color: string) =>
  `<text x="${x}" y="${y}" font-family="Geist Pixel Square" font-size="64" fill="${color}">${text}</text>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#161a3f"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<text x="${x0 - PX * 3}" y="150" font-family="Pirata One" font-size="96" fill="${MOON}">Haunt the Room</text>
<text x="${x0 - PX * 3 + 640}" y="150" font-family="Geist Pixel Square" font-size="40" fill="${MOON}" opacity="0.6">you are the ghosts. they are AI.</text>
${label(x0 - PX * 3, y0 - 70, "the projector", ORANGE)}
${label(px1 - PX * 3, y0 - 70, "your phone", CYAN)}
${frame(x0, y0, sW, sH, ORANGE)}
${frame(px1, y0, pW, pH, CYAN)}
</svg>`
const svgPath = join(BUILD, "cover.svg")
writeFileSync(svgPath, svg)
const png = join(BUILD, "cover.png")
execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), svgPath, "-o", png], { env: { ...process.env, PANGOCAIRO_BACKEND: "fc", FONTCONFIG_FILE: CONF } })
// light dither: an 8x8 ordered dither at 24 levels per channel, blended 45% over the clean render
const out = join(DIR, "cover.jpg")
// the two shots go in with ImageMagick (librsvg refuses absolute file hrefs)
execFileSync("magick", [png, "(", STAGE + "[0]", "-resize", `${sW}x${sH}!`, ")", "-geometry", `+${x0}+${y0}`, "-composite",
  "(", PHONE + "[0]", "-resize", `${pW}x${pH}!`, ")", "-geometry", `+${px1}+${y0}`, "-composite", png])
execFileSync("magick", [png, "(", "+clone", "-ordered-dither", "o8x8,24", ")", "-compose", "blend", "-define", "compose:args=45", "-composite", "-quality", "86", out])
console.log(`cover: ${out} (${W}x${H}) from ${STAGE} + ${PHONE}`)
