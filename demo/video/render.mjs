// L11b VIDEO: render every caption overlay and full-frame card a cut-list needs as 1920x1080 PNGs, in the game's
// fonts (Pirata One, IM FELL English, Geist Pixel) with the game's ordered-dither look, through headless chromium.
//   node demo/video/render.mjs [demo/video/cut.json]   -> demo/video/build/png/<hash>.png + manifest.json
// Item kinds (see SCRIPT.md / cut.example.json):
//   card    {title, sub?, bg?, style: "title" | "story" | "end"}       opaque full frame
//   line    {who: hunter id, text}                                    huge subtitle, name tag in the hunter colour
//   whisper {who: player name, to: hunter id, text}                   big italic whisper card (top)
//   big     {text, sub?, color?}                                      punch text (e.g. +200)
//   tag     {text}                                                    small lower-third label (top-left)
//   term    {text}                                                    terminal box (bottom-left), the real command
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const DIR = import.meta.dirname
const ROOT = path.resolve(DIR, "../..")
const require = createRequire(path.join(ROOT, "qa/x.js"))
const { chromium } = require("playwright")
const cutFile = path.resolve(process.argv[2] ?? path.join(DIR, "cut.json"))
const cut = JSON.parse(fs.readFileSync(cutFile, "utf8"))
const OUT = path.join(DIR, "build/png")
fs.mkdirSync(OUT, { recursive: true })

export const itemKey = (it) => createHash("sha1").update(JSON.stringify(it)).digest("hex").slice(0, 12)
const items = []
for (const s of cut.segments) {
  if (s.card) items.push({ kind: "card", ...s.card })
  for (const c of s.captions ?? []) items.push(c.item)
}

const FS = path.join(ROOT, "web/node_modules/@fontsource")
const data = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`
const font = (fam, f, style = "normal") => `@font-face{font-family:'${fam}';font-style:${style};src:url('${data(path.join(FS, f), "font/woff")}')}`
const geist = fs.readdirSync(path.join(ROOT, "web/dist/assets")).find(f => /^GeistPixel-Square.*\.woff2$/.test(f))
const art = (f) => { const p = path.isAbsolute(f) ? f : path.join(ROOT, "web/public/art", f); return data(p, p.endsWith(".png") ? "image/png" : p.endsWith(".jpg") ? "image/jpeg" : "image/webp") }
const HUNTER = { exorcist: ["The Exorcist", "#ffd27a"], medium: ["The Medium", "#b18cff"], skeptic: ["The Skeptic", "#7ad7ff"], priest: ["The Priest", "#ff8a7a"] }
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])

const CSS = `
${font("Pirata One", "pirata-one/files/pirata-one-latin-400-normal.woff")}
${font("IM Fell", "im-fell-english/files/im-fell-english-latin-400-normal.woff")}
${font("IM Fell", "im-fell-english/files/im-fell-english-latin-400-italic.woff", "italic")}
@font-face{font-family:'Geist Pixel';src:url('${data(path.join(ROOT, "demo/build/fonts/GeistPixel-Square.ttf"), "font/ttf")}') format('truetype')}
*{margin:0;box-sizing:border-box} html,body{width:1920px;height:1080px;background:transparent;overflow:hidden;color:#f3ead8}
.pix{font-family:'Geist Pixel',monospace;letter-spacing:.04em}
.fell{font-family:'IM Fell',serif} .pir{font-family:'Pirata One',serif}
canvas.dither{position:absolute;inset:0;width:1920px;height:1080px;image-rendering:pixelated}
.card{position:absolute;inset:0;background:#07060b;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.card h1{position:relative;font-family:'Pirata One';font-weight:400;font-size:220px;line-height:.9;text-shadow:0 0 40px #ff7a2f88,0 8px 0 #000}
.card h2{position:relative;font-family:'IM Fell';font-style:italic;font-size:64px;margin-top:36px;max-width:1500px;text-shadow:0 4px 0 #000}
.card .url{position:relative;font-family:'Geist Pixel';font-size:84px;color:#7af0ff;margin-top:56px;text-shadow:0 0 30px #7af0ff88}
.card .small{position:relative;font-family:'Geist Pixel';font-size:34px;color:#cbb;margin-top:28px;opacity:.9}
.story h2{font-size:92px;font-style:normal;font-family:'IM Fell';max-width:1600px}
/* BAND: every caption lives in the 150 px strip under the footage (build.mjs shrinks the shot above it), so no
   caption ever covers game text or UI. Row 1 (28 px): speaker / label. Row 2 (46 px, max 2 lines): the words. */
.sub,.wh,.narr,.term{position:absolute;left:96px;top:938px;width:1440px}
.who{font-family:'Geist Pixel';font-size:28px;letter-spacing:.08em;text-transform:uppercase;height:34px}
.t{font-family:'Geist Pixel';font-size:44px;line-height:52px;max-height:104px;overflow:hidden}
.sub .who{color:var(--c)} .sub .t{color:#f3ead8}
.wh .who{color:#9ff3ff} .wh .t{color:#c9f8ff}
.narr .who{color:#ff9a5c} .narr .t{color:#f3ead8}
.term .who{color:#7dff9a} .term .t{font-family:Menlo,monospace;color:#7dff9a;font-size:44px}
.tag{position:absolute;right:96px;top:938px;font-family:'Geist Pixel';font-size:28px;letter-spacing:.06em;color:#ffb27a;text-align:right;white-space:nowrap;max-width:1000px;overflow:hidden}
.big{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.big .t{font-family:'Pirata One';font-size:200px;color:var(--c);text-shadow:0 0 40px var(--c),0 8px 0 #000}
.big .s{font-family:'Geist Pixel';font-size:56px}`

// ordered dither over a background image, same 8x8 Bayer + warm palette feel as the stage (4 px cells)
const DITHER = `async function dither(src){const c=document.querySelector('canvas.dither');if(!c)return;const W=480,H=270;c.width=W;c.height=H;
const x=c.getContext('2d');x.fillStyle='#07060b';x.fillRect(0,0,W,H);
if(src){const im=new Image();im.src=src;await im.decode().catch(()=>{});const r=Math.max(W/im.width,H/im.height);x.drawImage(im,(W-im.width*r)/2,(H-im.height*r)/2,im.width*r,im.height*r)}
const g=x.createRadialGradient(W/2,H/2,40,W/2,H/2,300);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.6)');x.fillStyle=g;x.fillRect(0,0,W,H);
const d=x.getImageData(0,0,W,H),p=d.data;const B=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
const P=[[7,6,11],[34,22,48],[90,40,70],[255,122,47],[122,240,255],[243,234,216],[60,70,110],[150,60,40]];
for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){const i=(yy*W+xx)*4,t=(B[(yy&7)*8+(xx&7)]/64-.5)*70;let best=0,bd=1e9;
for(let k=0;k<P.length;k++){const dr=p[i]+t-P[k][0],dg=p[i+1]+t-P[k][1],db=p[i+2]+t-P[k][2],dd=dr*dr*.3+dg*dg*.59+db*db*.11;if(dd<bd){bd=dd;best=k}}
p[i]=P[best][0];p[i+1]=P[best][1];p[i+2]=P[best][2]}x.putImageData(d,0,0)}`

function html(it) {
  switch (it.kind) {
    case "card": return `<div class="card ${it.style ?? ""}"><canvas class="dither"></canvas>
      ${it.style === "story" ? "" : `<h1>${esc(it.title)}</h1>`}${it.style === "story" ? `<h2>${esc(it.title)}</h2>` : it.sub ? `<h2>${esc(it.sub)}</h2>` : ""}
      ${it.url ? `<div class="url">${esc(it.url)}</div>` : ""}${it.small ? `<div class="small">${esc(it.small)}</div>` : ""}</div>`
    case "line": { const [n, c] = HUNTER[it.who] ?? [it.who, "#f3ead8"]; return `<div class="sub" style="--c:${c}"><div class="who">${esc(n)} · AI agent</div><div class="t">${esc(it.text)}</div></div>` }
    case "narr": return `<div class="narr"><div class="who">narrator</div><div class="t">${esc(it.text)}</div></div>`
    case "whisper": { const to = HUNTER[it.to]?.[0] ?? it.to; return `<div class="wh"><div class="who">${esc(it.who)} (a player) whispers to ${esc(to)}</div><div class="t">${esc(it.text)}</div></div>` }
    case "big": return `<div class="big" style="--c:${it.color ?? "#ffd27a"}"><div class="t">${esc(it.text)}</div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ""}</div>`
    case "tag": return `<div class="tag">${esc(it.text)}</div>`
    case "term": return `<div class="term"><div class="who">terminal, live</div><div class="t">$ ${esc(it.text)}</div></div>`
    default: throw new Error(`render: unknown kind ${it.kind}`)
  }
}

const manifest = {}
const browser = await chromium.launch({ channel: "chromium" })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
for (const it of items) {
  const key = itemKey(it), file = path.join(OUT, `${key}.png`)
  manifest[key] = `build/png/${key}.png`
  if (fs.existsSync(file)) continue
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body>${html(it)}<script>${DITHER}</script></body></html>`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  if (it.kind === "card") await page.evaluate(`dither(${JSON.stringify(it.bg ? art(it.bg) : "")})`)
  await page.screenshot({ path: file, omitBackground: it.kind !== "card" })
  console.log(`render ${it.kind} ${key} ${(it.title ?? it.text ?? "").slice(0, 50)}`)
}
await browser.close()
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1))
console.log(`render: ${items.length} items -> ${OUT}`)
