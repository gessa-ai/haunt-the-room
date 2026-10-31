#!/usr/bin/env bun
// L10 voice renderer: audio/lines.json -> web/public/audio/voice/<hunter>/<event>-<n>.mp3 + voice/index.json.
//   bun audio/render-voices.ts say      placeholders: one macOS system voice per hunter (`say`)
//   bun audio/render-voices.ts openai   OpenAI TTS: newest TTS model, a voice + style instructions per hunter
//   bun audio/render-voices.ts elevenlabs  ElevenLabs eleven_v3, voices from audio/cabal-cast.ts
//   add --sample to render only a preview: 2 lines per hunter + 4 announcer lines (spend credits after a "go")
// Speakers: the four hunters (VOICE_EVENTS pools) and the announcer (one line per event, audio/lines.json "announcer").
// Keys are read from ~/haunted-hacks/.env and never printed. Every file takes the same ffmpeg pass:
// trim silence, loudness -16 LUFS, mono 44.1 kHz mp3, so placeholders and real voices sit at one level.
import { existsSync, readFileSync, statSync } from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BANK_MODEL, bankSpeak } from "./cabal-cast"
import { HUNTERS, VOICE_EVENTS, type HunterId, type VoiceEvent } from "../contract/protocol"

interface Cast {
  say: { voice: string; rate: number; semitones: number }
  openai: { voice: string; instructions: string }
}
type Speaker = HunterId | "announcer"
interface Sheet {
  cast: Record<Speaker, Cast>
  lines: Record<HunterId, Record<VoiceEvent, string[]>>
  announcer: Record<string, string[]>
}
interface Job {
  hunter: Speaker
  event: string
  text: string
  file: string // relative to web/public/audio/voice/
}

const ROOT = new URL("..", import.meta.url).pathname
const OUT = `${ROOT}web/public/audio/voice`
const engine = process.argv[2]
const sample = process.argv.includes("--sample")
if (engine !== "say" && engine !== "openai" && engine !== "elevenlabs") die("usage: bun audio/render-voices.ts say|openai|elevenlabs [--sample]")
const SPEAKERS: { id: Speaker; name: string }[] = [...HUNTERS.map((h) => ({ id: h.id as Speaker, name: h.name })), { id: "announcer", name: "The Announcer" }]
/** The preview: each hunter's first arrive + first back line, and four announcer moments. */
const SAMPLE = new Set([
  ...HUNTERS.flatMap((h) => [`${h.id}/arrive-1.mp3`, `${h.id}/back-1.mp3`]),
  "announcer/round-one-1.mp3", "announcer/first-blood-1.mp3", "announcer/haunted-ballroom-1.mp3", "announcer/house-yours-1.mp3",
])

const sheet = (await Bun.file(`${ROOT}audio/lines.json`).json()) as Sheet
const all = validate(sheet)
const PRIORITY = new Set<string>(process.argv.includes("--priority") ? JSON.parse(readFileSync(`${ROOT}audio/cabal-priority.json`, "utf8")).files : [])
const jobs = sample ? all.filter((j) => SAMPLE.has(j.file)) : PRIORITY.size ? all.filter((j) => PRIORITY.has(j.file)) : engine === "elevenlabs" ? all.filter((j) => !fresh(j.file)) : all
/** ElevenLabs: a file newer than audio/cast.json is already in the current cast; never pay for it twice. */
function fresh(file: string): boolean {
  const f = `${ROOT}web/public/audio/voice/${file}`
  return existsSync(f) && statSync(f).mtimeMs > statSync(`${ROOT}audio/cast.json`).mtimeMs
}
const tmp = await mkdtemp(join(tmpdir(), "l10-voices-"))
for (const { id } of SPEAKERS) await mkdir(`${OUT}/${id}`, { recursive: true })

let label: string = "say"
let render: (job: Job, out: string) => Promise<void>
if (engine === "elevenlabs") {
  // voices + model: audio/cabal-cast.ts (single source with the live /api/voice proxy)
  label = `elevenlabs:${BANK_MODEL}`
  render = async (job, out) => {
    const mp3 = join(tmp, job.file.replace(/\//g, "_"))
    await Bun.write(mp3, await bankSpeak(job.hunter, job.text))
    await normalize(mp3, out, 0)
  }
} else if (engine === "openai") {
  const key = envKey("OPENAI_API_KEY")
  const model = await newestTtsModel(key)
  label = `openai:${model}`
  render = async (job, out) => {
    const wav = join(tmp, job.file.replace(/\//g, "_") + ".wav")
    await Bun.write(wav, await speak(key, model, sheet.cast[job.hunter], job.text))
    await normalize(wav, out, 0)
  }
} else {
  render = async (job, out) => {
    const cast = sheet.cast[job.hunter].say
    const aiff = join(tmp, job.file.replace(/\//g, "_") + ".aiff")
    await run(["say", "-v", cast.voice, "-r", String(cast.rate), "-o", aiff, job.text])
    await normalize(aiff, out, cast.semitones)
  }
}

console.log(`rendering ${jobs.length} lines with ${label} ...`)
const started = Date.now()
const failed: string[] = []
await pool(jobs, engine === "openai" ? 8 : engine === "elevenlabs" ? 5 : 6, async (job) => {
  try {
    await render(job, `${OUT}/${job.file}`)
  } catch (err) {
    failed.push(`${job.file}: ${(err as Error).message}`)
  }
})
await rm(tmp, { recursive: true, force: true })

// The index lists every line whose file exists (a partial re-render never silences a speaker) and which engine made
// each one, so a sample render sits beside the placeholders and the audition can tell them apart.
const prev = existsSync(`${OUT}/index.json`) ? (JSON.parse(readFileSync(`${OUT}/index.json`, "utf8")) as { voices?: Record<string, Record<string, { file: string; engine?: string }[]>>; engine?: string }) : {}
const madeBy = new Map<string, string>()
for (const events of Object.values(prev.voices ?? {})) for (const lines of Object.values(events)) for (const l of lines) madeBy.set(l.file, l.engine ?? prev.engine ?? "say")
const done = new Set(jobs.map((j) => j.file).filter((f) => !failed.some((x) => x.startsWith(`${f}:`))))
const voices: Record<string, Record<string, { file: string; text: string; engine: string }[]>> = {}
for (const job of all) {
  if (!existsSync(`${OUT}/${job.file}`)) continue
  const by = done.has(job.file) ? label : (madeBy.get(job.file) ?? "say")
  ;((voices[job.hunter] ??= {})[job.event] ??= []).push({ file: job.file, text: job.text, engine: by })
}
const engines = [...new Set(Object.values(voices).flatMap((e) => Object.values(e).flatMap((ls) => ls.map((l) => l.engine))))]
const version = String(Date.now())
await Bun.write(
  `${OUT}/index.json`,
  JSON.stringify({ engine: engines.join(" + "), version, rendered: new Date().toISOString(), voices }, null, 1),
)
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s: ${jobs.length - failed.length}/${jobs.length} with ${label}; index ${OUT}/index.json`)
if (failed.length) {
  console.error(`FAILED ${failed.length}:\n  ${failed.slice(0, 20).join("\n  ")}`)
  process.exit(1)
}

// ---------- helpers ----------

function validate(s: Sheet): Job[] {
  const out: Job[] = []
  const problems: string[] = []
  for (const { id } of HUNTERS) {
    if (!s.cast?.[id]) problems.push(`no cast for ${id}`)
    for (const event of VOICE_EVENTS) {
      const lines = s.lines?.[id]?.[event] ?? []
      if (lines.length < 3 || lines.length > 4) problems.push(`${id}/${event}: ${lines.length} lines (want 3-4)`)
      lines.forEach((text, i) => {
        const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
        if (words > 8) problems.push(`${id}/${event}-${i + 1}: ${words} words (max 8): ${text}`)
        out.push({ hunter: id, event, text, file: `${id}/${event}-${i + 1}.mp3` })
      })
    }
  }
  if (!s.cast?.announcer) problems.push("no cast for announcer")
  for (const [event, lines] of Object.entries(s.announcer ?? {})) {
    lines.forEach((text, i) => {
      if (text.split(/\s+/).length > 8) problems.push(`announcer/${event}-${i + 1}: more than 8 words: ${text}`)
      out.push({ hunter: "announcer", event, text, file: `announcer/${event}-${i + 1}.mp3` })
    })
  }
  // L10b CABAL bank: audio/cabal-lines.json, keyed like coven/src/lines.ts SITUATIONS (+ new moments); a key that is
  // also a VOICE_EVENT ("possessed") joins that pool, numbered after its lines, so one event = one pool.
  const cabal = JSON.parse(readFileSync(`${ROOT}audio/cabal-lines.json`, "utf8")) as Record<string, Record<string, string[]>>
  for (const [who, events] of Object.entries(cabal)) {
    if (who === "_") continue
    for (const [event, lines] of Object.entries(events)) {
      const taken = out.filter((j) => j.hunter === who && j.event === event).length
      lines.forEach((text, i) => {
        if (text.split(/\s+/).length > 16) problems.push(`cabal ${who}/${event}-${i + 1}: more than 16 words: ${text}`)
        out.push({ hunter: who as Speaker, event, text, file: `${who}/${event}-${taken + i + 1}.mp3` })
      })
    }
  }
  if (problems.length) die(`audio/lines.json is invalid:\n  ${problems.join("\n  ")}`)
  return out
}

function envKey(name: string): string {
  const envPath = `${ROOT}.env`
  if (!existsSync(envPath)) die(`no ${envPath} yet (the owner adds ${name} there)`)
  const m = readFileSync(envPath, "utf8").match(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*["']?([^"'\\s#]+)`, "m"))
  if (!m) die(`${name} is not set in ${envPath}`)
  return m[1]
}

/** Newest TTS model visible to the key; models that take style instructions beat the legacy tts-1 family. */
async function newestTtsModel(key: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } })
  if (!r.ok) die(`GET /v1/models: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
  const { data } = (await r.json()) as { data: { id: string; created: number }[] }
  const legacy = (id: string) => (/^tts-1/.test(id) ? 1 : 0)
  const tts = data
    .filter((m) => /tts/i.test(m.id) && !/realtime|transcribe|audio-preview/i.test(m.id))
    .sort((a, b) => legacy(a.id) - legacy(b.id) || b.created - a.created)
  console.log(`TTS models: ${tts.map((m) => `${m.id} (${new Date(m.created * 1000).toISOString().slice(0, 10)})`).join(", ")}`)
  if (!tts.length) die("no TTS model is visible to this key")
  return tts[0].id
}

async function speak(key: string, model: string, cast: Cast, text: string): Promise<ArrayBuffer> {
  const body: Record<string, string> = { model, voice: cast.openai.voice, input: text, response_format: "wav" }
  if (!/^tts-1/.test(model)) body.instructions = cast.openai.instructions
  for (let attempt = 1; ; attempt++) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (r.ok) return r.arrayBuffer()
    const msg = (await r.text()).slice(0, 300)
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      await Bun.sleep(1500 * attempt)
      continue
    }
    throw new Error(`POST /v1/audio/speech HTTP ${r.status}: ${msg}`)
  }
}

/** One mastering pass for every engine: optional pitch shift, trim head/tail silence, -16 LUFS, mono mp3. */
async function normalize(input: string, out: string, semitones: number): Promise<void> {
  const f = Math.pow(2, semitones / 12)
  const pitch = semitones ? `aresample=44100,asetrate=${Math.round(44100 * f)},aresample=44100,atempo=${(1 / f).toFixed(5)},` : ""
  const trim = "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03"
  const af = `${pitch}${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11`
  await run(["ffmpeg", "-y", "-loglevel", "error", "-i", input, "-af", af, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", out])
}

async function run(cmd: string[]): Promise<void> {
  const p = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" })
  const code = await p.exited
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${(await new Response(p.stderr).text()).slice(0, 300)}`)
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await fn(items[next++])
    }),
  )
}

function die(msg: string): never {
  console.error(`render-voices: ${msg}`)
  process.exit(1)
}
