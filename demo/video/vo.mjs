// L11b VIDEO voiceover. Renders every `vo` line in the cut-list to demo/video/vo/<hash>.m4a (+ manifest.json).
//   node demo/video/vo.mjs sample                 one ElevenLabs line -> vo/sample-eleven.mp3 (for the owner to hear)
//   node demo/video/vo.mjs [cut.json]             all lines with cut.voEngine: "say" (default, free placeholder)
//                                                 or "eleven" (only after the owner kept the sample)
// The key is read from ~/haunted-hacks/.env (ELEVENLABS_API_KEY) and never printed. Cached by text + engine.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const DIR = import.meta.dirname, ROOT = path.resolve(DIR, "../..")
const VO = path.join(DIR, "vo"); fs.mkdirSync(VO, { recursive: true })
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
const KEY = env.ELEVENLABS_API_KEY
const VOICE = process.env.VO_VOICE ?? "5gLuKtB16QIQv1vuSas1" // David - British Radio Host & Storyteller (shared library, added to the account): warm, dry, not trailer
const MODEL = process.env.VO_MODEL ?? "eleven_v3"
const voKey = (text) => createHash("sha1").update(text).digest("hex").slice(0, 12)
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim())

async function eleven(text, out) {
  if (!KEY) throw new Error("vo: ELEVENLABS_API_KEY missing in .env")
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: MODEL === "eleven_v3" ? { stability: 0.5 } : { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  })
  if (!r.ok) throw new Error(`vo: ElevenLabs ${r.status} ${(await r.text()).slice(0, 200)}`)
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()))
}
function say(text, out) {
  const aiff = out.replace(/\.\w+$/, ".aiff")
  execFileSync("say", ["-v", process.env.SAY_VOICE ?? "Daniel", "-r", "172", "-o", aiff, text])
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", aiff, "-c:a", "aac", "-b:a", "160k", "-ar", "48000", out])
  fs.rmSync(aiff)
}

if (process.argv[2] === "sample") {
  const text = process.argv[3] ?? "Someone hired four exorcists to clear this house. [dry] All four are A.I. agents. You are the ghosts."
  const out = path.join(VO, "sample-eleven.mp3")
  await eleven(text, out)
  console.log(`vo sample -> ${out} (${dur(out).toFixed(1)} s). Owner listens; if natural, set "voEngine": "eleven" in cut.json.`)
  process.exit(0)
}

const cutFile = path.resolve(process.argv[2] ?? path.join(DIR, "cut.json"))
const cut = JSON.parse(fs.readFileSync(cutFile, "utf8"))
const engine = cut.voEngine ?? "eleven"
const manPath = path.join(VO, "manifest.json")
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : {}
const texts = cut.segments.flatMap(s => [].concat(s.vo ?? []).map(v => v.text))
for (const text of texts) {
  const k = voKey(text)
  if (man[k]?.engine === engine && fs.existsSync(path.join(DIR, man[k].file))) continue
  let used = engine, file = `vo/${k}-${engine}.${engine === "eleven" ? "mp3" : "m4a"}`
  if (engine === "eleven") {
    try { await eleven(text, path.join(DIR, file)) } catch (e) {
      console.warn(`vo: ElevenLabs failed (${e.message.slice(0, 80)}); say placeholder for this line, re-run vo.mjs when ELEVEN BACK`)
      used = "say"; file = `vo/${k}-say.m4a`; say(text, path.join(DIR, file))
    }
  } else say(text, path.join(DIR, file))
  man[k] = { file, engine: used, text, dur: dur(path.join(DIR, file)) }
  console.log(`vo ${engine} ${man[k].dur.toFixed(1)}s  ${text}`)
}
fs.writeFileSync(manPath, JSON.stringify(man, null, 1))
console.log(`vo: ${texts.length} lines (${engine})`)
