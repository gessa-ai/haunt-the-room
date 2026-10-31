// L11b VIDEO editor: cut-list JSON -> demo/video/out/haunt-the-room.mp4 (1920x1080, 30 fps, H.264, AAC).
//   node demo/video/build.mjs [demo/video/cut.json]      (build.sh runs render.mjs + vo.mjs first)
// Per segment: source cut (clip src + in/atMs + dur, optional speed), punch-in zoom, phone PIP at the same
// wall-clock moment, PNG caption overlays (render.mjs), the stage's own recorded audio at the same moment.
// Then: concat (stream copy), voiceover lines placed on the timeline, game audio ducked under the VO, -16 LUFS.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const DIR = import.meta.dirname
const cutFile = path.resolve(process.argv[2] ?? path.join(DIR, "cut.json"))
const cut = JSON.parse(fs.readFileSync(cutFile, "utf8"))
const SEG = path.join(DIR, "build/seg"), OUT = path.join(DIR, "out")
fs.rmSync(SEG, { recursive: true, force: true }); fs.mkdirSync(SEG, { recursive: true }); fs.mkdirSync(OUT, { recursive: true })
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "build/png/manifest.json"), "utf8"))
const voMan = fs.existsSync(path.join(DIR, "vo/manifest.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "vo/manifest.json"), "utf8")) : {}
const itemKey = (it) => createHash("sha1").update(JSON.stringify(it)).digest("hex").slice(0, 12)
export const voKey = (text) => createHash("sha1").update(text).digest("hex").slice(0, 12)
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { stdio: "inherit" })
const r3 = (n) => Math.max(0, n).toFixed(3)

// "cap1/stage" -> { file, startMs, audio } using demo/video/raw/cap1/clips.json; anything else = a plain file path
function source(src) {
  const [cap, track] = src.split("/")
  const cj = path.join(DIR, "raw", cap, "clips.json")
  if (track && fs.existsSync(cj)) {
    const c = JSON.parse(fs.readFileSync(cj, "utf8")).clips
    if (!c[track]) throw new Error(`build: no track ${track} in ${cj}`)
    return { file: path.join(DIR, "raw", cap, c[track].file), startMs: c[track].startMs, audio: c.stageAudio ? { file: path.join(DIR, "raw", cap, c.stageAudio.file), startMs: c.stageAudio.startMs } : null }
  }
  const f = path.resolve(DIR, src)
  if (!fs.existsSync(f)) throw new Error(`build: source ${src} not found`)
  return { file: f, startMs: null, audio: null }
}

const FPS = 30, W = 1920, H = 1080
const ENC = ["-c:v", "h264_videotoolbox", "-b:v", "9M", "-r", String(FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
let t = 0
const voLines = []
const list = []
cut.segments.forEach((s, i) => {
  const out = path.join(SEG, `${String(i).padStart(3, "0")}.mp4`)
  const dur = s.dur
  const inputs = [], fc = []
  let v
  if (s.image) {
    // key art: {image, fg?, push: [bgGrow, fgGrow], x, y} slow push (and parallax when fg is given)
    const [gb, gf] = s.push ?? [0.03, 0.06]
    const px = s.x ?? 0.5, py = s.y ?? 0.5
    const mv = (g) => `scale=w='${W}*(1+${g}*t/${r3(dur)})':h=-2:eval=frame,crop=${W}:${H}:x='(in_w-${W})*${px}':y='(in_h-${H})*${py}'`
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", r3(dur), "-i", path.resolve(DIR, s.image))
    fc.push(`[0:v]${mv(gb)},fps=${FPS}[b0]`)
    let n = 1
    if (s.fg) { inputs.push("-loop", "1", "-framerate", String(FPS), "-t", r3(dur), "-i", path.resolve(DIR, s.fg)); fc.push(`[1:v]format=rgba,${mv(gf)}[f0]`, `[b0][f0]overlay=0:0[b1]`); n = 2 }
    fc.push(`[b${n - 1}]format=yuv420p[v0]`)
    v = "[v0]"
    inputs.push("-f", "lavfi", "-t", r3(dur), "-i", "anullsrc=r=48000:cl=stereo")
    fc.push(`[${n}:a]anull[a]`)
  } else if (s.card) {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", r3(dur), "-i", path.join(DIR, manifest[itemKey({ kind: "card", ...s.card })]))
    fc.push(`[0:v]scale=${W}:${H},fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=${r3(dur - 0.25)}:d=0.25[v0]`)
    v = "[v0]"
    inputs.push("-f", "lavfi", "-t", r3(dur), "-i", "anullsrc=r=48000:cl=stereo")
  } else {
    const src = source(s.src)
    const speed = s.speed ?? 1
    const inS = s.in ?? (s.atMs - src.startMs) / 1000
    if (!(inS >= 0)) throw new Error(`build: segment ${i} starts before its source (${s.src} in=${inS})`)
    inputs.push("-ss", r3(inS), "-t", r3(dur * speed), "-i", src.file)
    let chain = `[0:v]setpts=(PTS-STARTPTS)/${speed},fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=#07060b`
    if (s.zoom) {
      const { z = 1.5, x = 0.5, y = 0.5, ramp = 0.35, pan } = s.zoom // pan: [x0, x1] = slow pan across the shot
      const zx = `if(lte(on,${Math.round(ramp * FPS)}),1+(${z}-1)*on/${Math.max(1, Math.round(ramp * FPS))},${z})`
      chain += `,scale=${W * 2}:${H * 2}:flags=lanczos,zoompan=z='${zx}':x='(iw-iw/zoom)*${pan ? `(${pan[0]}+(${pan[1] - pan[0]})*on/${Math.round(dur * FPS)})` : x}':y='(ih-ih/zoom)*${y}':d=1:s=${W}x${H}:fps=${FPS}`
    }
    for (const [x, y, w, h] of s.mask ?? []) chain += `,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x07060b@1:t=fill` // hide dev chrome
    if (s.whip) chain += `,gblur=sigma=60:sigmaV=1:enable='lt(t,0.18)'` // whip into the shot
    if (s.band) chain += `,scale=1653:930,pad=${W}:${H}:(${W}-1653)/2:0:color=0x07060b` // caption band below the footage
    fc.push(`${chain},format=yuv420p[v0]`)
    v = "[v0]"
    let n = 1
    if (s.pip) {
      const ps = source(s.pip.src)
      const absMs = src.startMs + inS * 1000 + (s.pip.offset ?? 0) * 1000
      const pin = s.pip.in ?? (absMs - ps.startMs) / 1000
      inputs.push("-ss", r3(pin), "-t", r3(dur * speed), "-i", ps.file)
      const ph = Math.min(s.pip.h ?? 900, s.band ? 860 : 1000)
      fc.push(`[${n}:v]setpts=(PTS-STARTPTS)/${speed},fps=${FPS},scale=-2:${ph},pad=iw+16:ih+16:8:8:color=#ffd27a[p]`)
      const px = s.pip.side === "left" ? "70" : "W-w-70"
      fc.push(`${v}[p]overlay=x=${px}:y=${s.band ? "(930-h)/2" : "(H-h)/2-20"}:enable='gte(t,${r3(s.pip.from ?? 0)})'[v${n}]`)
      v = `[v${n}]`; n++
    }
    for (const c of s.captions ?? []) {
      const png = manifest[itemKey(c.item)]
      if (!png) throw new Error(`build: caption not rendered (run render.mjs): ${JSON.stringify(c.item)}`)
      const a = c.t ?? 0, d = c.d ?? dur - a
      inputs.push("-loop", "1", "-framerate", String(FPS), "-t", r3(dur), "-i", path.join(DIR, png))
      fc.push(`[${n}:v]format=rgba,fade=t=in:st=${r3(a)}:d=0.12:alpha=1,fade=t=out:st=${r3(a + d - 0.12)}:d=0.12:alpha=1[c${n}]`)
      fc.push(`${v}[c${n}]overlay=0:0:enable='between(t,${r3(a)},${r3(a + d)})'[v${n}]`)
      v = `[v${n}]`; n++
    }
    const gain = s.gain ?? 0 // game audio only where the cut-list asks (hits, hunter voices); the bed carries the rest
    if (s.ownAudio) fc.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${s.gain ?? 1},apad,atrim=0:${r3(dur)}[a]`) // e.g. L32's sting
    else if (src.audio && speed === 1 && gain > 0) {
      const aIn = (src.startMs + inS * 1000 - src.audio.startMs) / 1000
      if (aIn >= 0) inputs.push("-ss", r3(aIn), "-t", r3(dur), "-i", src.audio.file)
      else inputs.push("-f", "lavfi", "-t", r3(dur), "-i", "anullsrc=r=48000:cl=stereo")
      fc.push(`[${n}:a]aresample=48000,volume=${gain},apad,atrim=0:${r3(dur)}[a]`)
    } else {
      inputs.push("-f", "lavfi", "-t", r3(dur), "-i", "anullsrc=r=48000:cl=stereo")
      fc.push(`[${n}:a]anull[a]`)
    }
  }
  if (s.card && !s.image) fc.push(`[1:a]anull[a]`)
  ff([...inputs, "-filter_complex", fc.join(";"), "-map", v, "-map", "[a]", "-t", r3(dur), ...ENC, "-ac", "2", out])
  for (const vo of [].concat(s.vo ?? [])) {
    const k = voKey(vo.text)
    if (!voMan[k]) throw new Error(`build: VO not rendered (run vo.mjs): ${vo.text}`)
    voLines.push({ at: t + (vo.t ?? 0), file: path.join(DIR, voMan[k].file), text: vo.text, dur: voMan[k].dur })
  }
  console.log(`seg ${i} ${r3(t)} +${dur}s ${s.image ? s.image : s.card ? `card ${s.card.title ?? ""}` : s.src} ${s.note ?? ""}`)
  list.push(`file '${out}'`)
  t += dur
})
fs.writeFileSync(path.join(SEG, "list.txt"), list.join("\n") + "\n")
const prog = path.join(SEG, "program.mp4")
ff(["-f", "concat", "-safe", "0", "-i", path.join(SEG, "list.txt"), "-c", "copy", prog])

// VO overlaps: warn so the cut-list can be fixed
voLines.sort((a, b) => a.at - b.at).forEach((l, i, a) => { if (a[i + 1] && l.at + l.dur > a[i + 1].at) console.warn(`VO overlap at ${l.at.toFixed(1)}s: "${l.text.slice(0, 40)}"`) })

// one continuous music/ambience bed: a slice of the game's own score (cut.bed), looped with soft edges
let bedFile = null
if (cut.bed) {
  const b = source(cut.bed.src)
  if (b.audio) {
    const aIn = (cut.bed.atMs - b.audio.startMs) / 1000
    bedFile = path.join(SEG, "bed.wav")
    const one = path.join(SEG, "bed1.wav")
    ff(["-ss", r3(aIn), "-t", r3(cut.bed.dur), "-i", b.audio.file, "-af", "aresample=48000,aformat=channel_layouts=stereo", one])
    ff(["-i", one, "-i", one, "-i", one, "-i", one, "-filter_complex", "[0:a][1:a]acrossfade=d=1.5[x];[x][2:a]acrossfade=d=1.5[y];[y][3:a]acrossfade=d=1.5,afade=t=in:d=0.6", bedFile])
  }
}
const final = path.join(OUT, cut.out ?? "haunt-the-room.mp4")
const gameGain = cut.gameGain ?? 0.9, voGain = cut.voGain ?? 1.6
const ins = ["-i", prog]
const fc = [`[0:a]volume=${gameGain}[g0]`]
if (bedFile) { ins.push("-stream_loop", "-1", "-i", bedFile); fc.push(`[1:a]volume=${cut.bed.gain ?? 0.5},atrim=0:${r3(t)}[bed]`, `[g0][bed]amix=inputs=2:normalize=0:duration=first[g]`) } else fc.push(`[g0]anull[g]`)
const off = bedFile ? 2 : 1
if (voLines.length) {
  voLines.forEach((l, i) => { ins.push("-i", l.file); fc.push(`[${i + off}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${voGain},adelay=${Math.round(l.at * 1000)}:all=1[o${i}]`) })
  fc.push(`${voLines.map((_, i) => `[o${i}]`).join("")}amix=inputs=${voLines.length}:normalize=0:duration=longest,apad[vo]`, `[vo]asplit[vo1][vo2]`)
  fc.push(`[g][vo1]sidechaincompress=threshold=0.02:ratio=12:attack=10:release=400[duck]`, `[duck][vo2]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5[out]`)
} else fc.push(`[g]loudnorm=I=-16:TP=-1.5[out]`)
ff([...ins, "-filter_complex", fc.join(";"), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", r3(t), "-movflags", "+faststart", final])
fs.rmSync(SEG, { recursive: true, force: true })
console.log(`build: ${final} ${t.toFixed(1)} s, ${(fs.statSync(final).size / 1e6).toFixed(1)} MB, ${voLines.length} VO lines`)
