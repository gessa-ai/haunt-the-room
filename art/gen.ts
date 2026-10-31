// Final art from the OpenAI Images API (newest gpt-image model, high quality), post-processed into web/public/art.
//   bun art/gen.ts models        image models on the key, newest first, and the one this script uses
//   bun art/gen.ts candidates    the two ballroom style candidates (art/STYLES) + art/contact-sheet.html
//   bun art/gen.ts all           the full set in the chosen style (art/CHOICE = 1 or 2; default 1)
//   bun art/gen.ts one <name>    regenerate one file: sky | room-<id> | hunter-<id> | title | social
//   bun art/gen.ts sheet         rewrite art/contact-sheet.html from what exists
// The key is read from ~/haunted-hacks/.env and never printed.
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { HUNTERS, ROOMS, type HunterId, type RoomId } from "../contract/protocol.ts"
import {
  STYLES,
  hunterPrompt,
  roomFromReferencePrompt,
  roomPrompt,
  skyPrompt,
  socialPrompt,
  titlePrompt,
  type StyleId,
} from "./prompts.ts"

const ART = import.meta.dir
const ROOT = join(ART, "..")
const OUT = join(ROOT, "web/public/art")
const RAW = join(ART, "build/raw")
const CAND = join(ART, "build/candidates")
const PLACE = join(ART, "build/placeholders")
const TMP = join(ART, "build/tmp")
for (const d of [OUT, RAW, CAND, TMP]) mkdirSync(d, { recursive: true })
const API = "https://api.openai.com/v1"
const BUDGET_BYTES = 8 * 1024 * 1024

const log = (...a: unknown[]) => console.log(new Date().toTimeString().slice(0, 8), ...a)
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

function apiKey(): string {
  const env = readFileSync(join(ROOT, ".env"), "utf8")
  const m = env.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*["']?([^"'\s#]+)/m)
  if (!m) throw new Error("OPENAI_API_KEY is not set in ~/haunted-hacks/.env")
  return m[1]
}

interface Model {
  id: string
  created: number
}
async function imageModels(key: string): Promise<Model[]> {
  const res = await fetch(`${API}/models`, { headers: { authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`GET /models ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const { data } = (await res.json()) as { data: Model[] }
  return data.filter((m) => /image|dall-e/.test(m.id)).sort((a, b) => b.created - a.created)
}
/** Newest full-size gpt-image model (mini and nano variants trade quality for price). */
async function pickModel(key: string): Promise<string> {
  const models = await imageModels(key)
  const best = models.find((m) => /^gpt-image/.test(m.id) && !/mini|nano/.test(m.id))
  if (!best) throw new Error(`no gpt-image model on this key; image models: ${models.map((m) => m.id).join(", ") || "none"}`)
  return best.id
}

type Size = "1536x1024" | "1024x1536" | "1024x1024"
interface Job {
  name: string // raw file name, e.g. "room-attic"
  prompt: string
  size: Size
  transparent?: boolean
  refs?: string[] // reference images: sent to the edits endpoint
  dir?: string
}

async function generate(key: string, model: string, job: Job): Promise<string> {
  const file = join(job.dir ?? RAW, `${job.name}.png`)
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now()
    try {
      let res: Response
      if (job.refs?.length) {
        const form = new FormData()
        form.append("model", model)
        form.append("prompt", job.prompt)
        form.append("size", job.size)
        form.append("quality", "high")
        form.append("n", "1")
        if (job.transparent) form.append("background", "transparent")
        for (const r of job.refs) form.append("image[]", new Blob([readFileSync(r)], { type: "image/png" }), basename(r))
        res = await fetch(`${API}/images/edits`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(360_000),
        })
      } else {
        res = await fetch(`${API}/images/generations`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: job.prompt,
            size: job.size,
            quality: "high",
            n: 1,
            ...(job.transparent ? { background: "transparent", output_format: "png" } : {}),
          }),
          signal: AbortSignal.timeout(360_000),
        })
      }
      if (res.ok) {
        const body = (await res.json()) as { data?: { b64_json?: string }[] }
        const b64 = body.data?.[0]?.b64_json
        if (!b64) throw new Error(`${job.name}: response carried no image`)
        writeFileSync(file, Buffer.from(b64, "base64"))
        log(`${job.name}: ok in ${Math.round((Date.now() - t0) / 1000)} s`)
        return file
      }
      const text = (await res.text()).slice(0, 500)
      if (!(res.status === 429 || res.status >= 500) || attempt >= 4) throw new Error(`${job.name}: HTTP ${res.status} ${text}`)
      log(`${job.name}: HTTP ${res.status}, retry ${attempt} in ${attempt * 15} s`)
    } catch (e) {
      const err = e as Error
      if (err.message.startsWith(`${job.name}:`) || attempt >= 4) throw err
      log(`${job.name}: ${err.name} ${err.message}, retry ${attempt} in ${attempt * 15} s`)
    }
    await Bun.sleep(attempt * 15_000)
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    while (q.length) await fn(q.shift()!)
  }))
}

// ---------- post-processing into the contract files ----------

const webp = (png: string, out: string) =>
  sh("cwebp", ["-quiet", "-q", "85", "-m", "6", "-alpha_q", "90", png, "-o", join(OUT, out)])

/** Phone grid cell: thumb/room-<id>.webp, 480x320 at q70 (~20-30 KB), so 300 phones stay light on venue wifi. */
function thumb(png: string, name: string) {
  const t = join(TMP, `${name}-thumb.png`)
  mkdirSync(join(OUT, "thumb"), { recursive: true })
  sh("magick", [png, "-filter", "Lanczos", "-resize", "480x320", t])
  sh("cwebp", ["-quiet", "-q", "70", "-m", "6", t, "-o", join(OUT, "thumb", `${name}.webp`)])
}

/** Bounding box of the clearly opaque pixels, grown by a margin so soft glows are not cut. */
function opaqueCrop(raw: string): string {
  const [w, h] = sh("magick", ["identify", "-format", "%w %h", raw]).split(" ").map(Number)
  const g = sh("magick", [raw, "-alpha", "extract", "-threshold", "6%", "-format", "%@", "info:"]).trim()
  const m = g.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/)
  if (!m) throw new Error(`${raw}: no opaque pixels (${g})`)
  const [bw, bh, bx, by] = m.slice(1).map(Number)
  const pad = Math.round(Math.max(bw, bh) * 0.03)
  const x = Math.max(0, bx - pad)
  const y = Math.max(0, by - pad)
  return `${Math.min(w - x, bw + pad * 2)}x${Math.min(h - y, bh + pad * 2)}+${x}+${y}`
}

function finish(name: string) {
  const raw = join(RAW, `${name}.png`)
  const tmp = join(TMP, `${name}.png`)
  if (name === "sky") {
    sh("magick", [raw, "-filter", "Lanczos", "-resize", "2560x1440^", "-gravity", "center", "-extent", "2560x1440", "-unsharp", "0x1+0.35+0.02", tmp])
    webp(tmp, "sky.webp")
  } else if (name.startsWith("room-")) {
    sh("magick", [raw, "-resize", "1536x1024^", "-gravity", "center", "-extent", "1536x1024", tmp])
    webp(tmp, `${name}.webp`)
    thumb(tmp, name)
  } else if (name.startsWith("hunter-")) {
    // one canvas and scale for all four: 640x1024, centred, feet on the bottom edge (the stage anchors at 0.5, 1)
    sh("magick", [raw, "-crop", opaqueCrop(raw), "+repage", "-resize", "640x1008", "-background", "none", "-gravity", "south", "-extent", "640x1024", tmp])
    sh("pngquant", ["--quality", "70-98", "--speed", "1", "--force", "--output", join(OUT, `${name}.png`), tmp])
  } else if (name === "title") {
    sh("magick", [raw, "-crop", opaqueCrop(raw), "+repage", "-resize", "480x480", "-background", "none", "-gravity", "center", "-extent", "512x512", tmp])
    webp(tmp, "title.webp")
  } else if (name === "social") {
    sh("magick", [raw, "-resize", "1200x630^", "-gravity", "center", "-extent", "1200x630", tmp])
    sh("oxipng", ["-q", "-o", "2", "--strip", "safe", "--out", join(OUT, "social.png"), tmp])
  } else throw new Error(`unknown asset ${name}`)
  log(`${name}: finished`)
}

const CONTRACT_FILES = [
  "sky.webp",
  ...ROOMS.map((r) => `room-${r.id}.webp`),
  ...HUNTERS.map((h) => `hunter-${h.id}.png`),
  "wisp.png",
  "title.webp",
  "social.png",
]
const THUMBS = ROOMS.map((r) => `thumb/room-${r.id}.webp`)
function budget() {
  let total = 0
  for (const f of [...CONTRACT_FILES, ...THUMBS]) {
    const p = join(OUT, f)
    if (!existsSync(p)) throw new Error(`missing ${f}`)
    const n = statSync(p).size
    total += n
    log(`${f.padEnd(22)} ${(n / 1024).toFixed(0).padStart(6)} KB`)
  }
  log(`total ${(total / 1024 / 1024).toFixed(2)} MB (budget 8 MB)`)
  if (total > BUDGET_BYTES) throw new Error("art is over the 8 MB budget")
}

// ---------- jobs ----------

function chosenStyle(): StyleId {
  const p = join(ART, "CHOICE")
  if (!existsSync(p)) return 1
  const v = readFileSync(p, "utf8").trim()
  if (v !== "1" && v !== "2") throw new Error(`art/CHOICE must be 1 or 2, got "${v}"`)
  return Number(v) as StyleId
}
const ballroomRef = (style: StyleId) => {
  const p = join(CAND, `ballroom-${style}.png`)
  if (!existsSync(p)) throw new Error(`run "bun art/gen.ts candidates" first (${p} is missing)`)
  return p
}
function jobFor(name: string, style: StyleId): Job {
  if (name === "sky") return { name, prompt: skyPrompt(style), size: "1536x1024" }
  if (name === "title") return { name, prompt: titlePrompt(style), size: "1024x1024", transparent: true }
  if (name === "social")
    return {
      name,
      prompt: socialPrompt,
      size: "1536x1024",
      refs: [ballroomRef(style), ...HUNTERS.map((h) => join(RAW, `hunter-${h.id}.png`)).filter(existsSync)],
    }
  const room = ROOMS.find((r) => `room-${r.id}` === name)
  if (room) return { name, prompt: roomFromReferencePrompt(room.id as RoomId), size: "1536x1024", refs: [ballroomRef(style)] }
  const hunter = HUNTERS.find((h) => `hunter-${h.id}` === name)
  if (hunter) return { name, prompt: hunterPrompt(style, hunter.id as HunterId), size: "1024x1536", transparent: true }
  throw new Error(`unknown asset "${name}" (sky | room-<id> | hunter-<id> | title | social)`)
}

// ---------- contact sheet ----------

function sheet() {
  const v = Date.now()
  const style = existsSync(join(ART, "CHOICE")) ? chosenStyle() : null
  const fig = (src: string, cap: string, cls = "") =>
    `<figure class="${cls}"><img src="${src}?v=${v}" loading="lazy"><figcaption>${cap}</figcaption></figure>`
  const kb = (p: string) => (existsSync(p) ? `${(statSync(p).size / 1024).toFixed(0)} KB` : "missing")
  const cands = ([1, 2] as const)
    .filter((i) => existsSync(join(CAND, `ballroom-${i}.webp`)))
    .map((i) => fig(`build/candidates/ballroom-${i}.webp`, `<b>${i}</b> · ${STYLES[i].label}${i === 1 ? " (default)" : ""}${style === i ? " · CHOSEN" : ""}`))
    .join("")
  const finals = CONTRACT_FILES.map((f) =>
    fig(`../web/public/art/${f}`, `${f} · ${kb(join(OUT, f))}`, f.startsWith("hunter") || f === "wisp.png" || f === "title.webp" ? "cut" : ""),
  ).join("")
  const places = CONTRACT_FILES.map((f) => f.replace(/\.webp$/, ".png"))
    .filter((f) => existsSync(join(PLACE, f)))
    .map((f) => fig(`build/placeholders/${f}`, f, f.startsWith("hunter") || f === "wisp.png" || f === "title.png" ? "cut" : ""))
    .join("")
  const rooms = ROOMS.map((r) => `<img src="../web/public/art/room-${r.id}.webp?v=${v}">`).join("")
  const thumbs = ROOMS.map((r) => `<img src="../web/public/art/thumb/room-${r.id}.webp?v=${v}">`).join("")
  const smallCands = ([1, 2] as const)
    .filter((i) => existsSync(join(CAND, `ballroom-${i}.webp`)))
    .map((i) => `<figure class="tiny"><img src="build/candidates/ballroom-${i}.webp?v=${v}"><figcaption>${i} at phone size</figcaption></figure>`)
    .join("")
  const hunters = HUNTERS.map((h) => `<img src="../web/public/art/hunter-${h.id}.png?v=${v}">`).join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Art Contact Sheet</title><style>
:root{color-scheme:dark}body{margin:0;background:#07080f;color:#cfd6ee;font:15px/1.45 system-ui,sans-serif;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px;color:#7af0ff;letter-spacing:.04em;text-transform:uppercase}
p{margin:4px 0;color:#9aa3c4}code{background:#161a3f;padding:2px 6px;border-radius:4px;color:#ffd27a}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.cands{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}
figure{margin:0;background:#11142a;border-radius:8px;overflow:hidden}figure img{width:100%;display:block}
figure.cut img{background:repeating-conic-gradient(#1a1d36 0 25%,#232750 0 50%) 0 0/24px 24px;height:300px;object-fit:contain}
figcaption{padding:8px 10px;font-size:13px;color:#aab3d6}
.stage{position:relative;aspect-ratio:16/9;max-width:1280px;background:url(../web/public/art/sky.webp?v=${v}) center/cover;border-radius:10px;overflow:hidden}
.house{position:absolute;left:50%;top:9%;width:46%;transform:translateX(-50%);display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px;background:#05060f;box-shadow:0 0 60px #000}
.house img{width:100%;display:block}.hunters{position:absolute;bottom:3%;left:3%;right:3%;display:flex;justify-content:space-between}
.hunters img{height:170px}.title{position:absolute;top:3%;left:2%;width:9%}
.tinyrow{display:flex;gap:14px;margin-top:10px}.tiny{width:180px}.tiny img{width:180px}
.phone{width:390px;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;background:#05060f;border-radius:28px;border:2px solid #232a5c}
.phone img{width:100%;display:block;border-radius:6px}
</style></head><body>
<h1>Art contact sheet · L9</h1>
<p>Updated ${new Date().toTimeString().slice(0, 5)}. Style in use: <b>${style ? `${style} · ${STYLES[style].label}` : "1 · " + STYLES[1].label + " (default, no answer yet)"}</b>.</p>
<p>To choose candidate 2: <code>echo 2 &gt; ~/haunted-hacks/art/CHOICE</code> or tell the conductor "L9 style 2". No answer within 10 minutes keeps 1.</p>
${cands ? `<h2>Ballroom style candidates</h2><div class="row cands">${cands}</div><div class="tinyrow">${smallCands}</div>` : ""}
<h2>Stage preview (current files)</h2>
<div class="stage"><img class="title" src="../web/public/art/title.webp?v=${v}"><div class="house">${rooms}</div><div class="hunters">${hunters}</div></div>
<h2>Phone preview (thumbs, 390 px wide)</h2><div class="phone">${thumbs}</div>
<h2>Shipped files · web/public/art</h2><div class="row">${finals}</div>
${places ? `<h2>Placeholders</h2><div class="row">${places}</div>` : ""}
</body></html>`
  writeFileSync(join(ART, "contact-sheet.html"), html)
  log("contact sheet: art/contact-sheet.html")
}

// ---------- commands ----------

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === "sheet") return sheet()
  const key = apiKey()
  if (cmd === "models") {
    for (const m of await imageModels(key)) log(m.id, new Date(m.created * 1000).toISOString().slice(0, 10))
    log("using:", await pickModel(key))
    return
  }
  const model = await pickModel(key)
  log(`model ${model}`)
  if (cmd === "candidates") {
    const failures: string[] = []
    await pool([1, 2] as StyleId[], 2, async (style) => {
      try {
        const raw = await generate(key, model, { name: `ballroom-${style}`, prompt: roomPrompt(style, "ballroom"), size: "1536x1024", dir: CAND })
        sh("cwebp", ["-quiet", "-q", "85", raw, "-o", join(CAND, `ballroom-${style}.webp`)])
      } catch (e) {
        failures.push((e as Error).message)
      }
    })
    sheet()
    if (failures.length) throw new Error(failures.join("\n"))
    log("OWNER REVIEW NEEDED: art/contact-sheet.html")
    return
  }
  if (cmd === "one") {
    if (!arg) throw new Error("usage: bun art/gen.ts one <sky | room-<id> | hunter-<id> | title | social>")
    const style = chosenStyle()
    if (arg === "room-ballroom") copyFileSync(ballroomRef(style), join(RAW, "room-ballroom.png"))
    else await generate(key, model, jobFor(arg, style))
    finish(arg)
    sheet()
    budget()
    return
  }
  if (cmd === "all") {
    const style = chosenStyle()
    log(`style ${style} · ${STYLES[style].label}`)
    copyFileSync(ballroomRef(style), join(RAW, "room-ballroom.png"))
    finish("room-ballroom")
    const names = [
      ...HUNTERS.map((h) => `hunter-${h.id}`),
      ...ROOMS.filter((r) => r.id !== "ballroom").map((r) => `room-${r.id}`),
      "sky",
      "title",
    ]
    const failures: string[] = []
    await pool(names, 5, async (name) => {
      try {
        await generate(key, model, jobFor(name, style))
        finish(name)
      } catch (e) {
        failures.push((e as Error).message)
      }
    })
    try {
      await generate(key, model, jobFor("social", style))
      finish("social")
    } catch (e) {
      failures.push((e as Error).message)
    }
    sheet()
    budget()
    if (failures.length) throw new Error(`failed (placeholders stay for these):\n${failures.join("\n")}`)
    return
  }
  throw new Error("usage: bun art/gen.ts models | candidates | all | one <name> | sheet")
}

main().catch((e) => {
  console.error(`gen failed: ${(e as Error).message}`)
  process.exit(1)
})
