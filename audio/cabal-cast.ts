// L10b CABAL VOICES: one ElevenLabs voice + delivery per hunter. Single source for the sample render
// (audio/cabal-voices.ts) and the live proxy (audio/voice-proxy.ts). Premade voices: no library add, no credits.
import { readFileSync, statSync } from "node:fs"
import type { HunterId } from "../contract/protocol"

export const CABAL_MODEL = "eleven_flash_v2_5" // live LLM lines: ~75 ms model latency; the stage gives a line 600 ms or skips it
export const BANK_MODEL = "eleven_v3" // pre-rendered fallback bank + video VO: most expressive, takes [sighs] [whispers] [scoffs] tags
export type CabalSpeaker = HunterId | "announcer"
export interface CabalVoice { voice: string; name: string; stability: number; similarity: number; style: number; speed: number }
// SWAP A VOICE = edit one `voice` id in audio/cast.json (single source; re-read on every line, so no restart).
const CAST_FILE = new URL("./cast.json", import.meta.url).pathname
let castCache: { mtime: number; cast: Record<CabalSpeaker, CabalVoice> } | null = null
export function cast(): Record<CabalSpeaker, CabalVoice> {
  const mtime = statSync(CAST_FILE).mtimeMs
  if (castCache?.mtime !== mtime) castCache = { mtime, cast: JSON.parse(readFileSync(CAST_FILE, "utf8")) }
  return castCache.cast
}

export function elevenKey(): string {
  const env = readFileSync(new URL("../.env", import.meta.url).pathname, "utf8")
  const m = /^ELEVENLABS_API_KEY=["']?([^"'\s]+)/m.exec(env) ?? (process.env.ELEVENLABS_API_KEY ? [, process.env.ELEVENLABS_API_KEY] : null)
  if (!m?.[1]) throw new Error("ELEVENLABS_API_KEY is not set in ~/haunted-hacks/.env")
  return m[1]
}

/** Streams mp3 for one line. Throws with the HTTP status on refusal (the key is never in the message). */
export async function cabalSpeak(hunter: CabalSpeaker, text: string, signal?: AbortSignal): Promise<Response> {
  const c = cast()[hunter]
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voice}/stream?output_format=mp3_44100_64&optimize_streaming_latency=3`, {
    method: "POST",
    signal,
    headers: { "xi-api-key": elevenKey(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text, model_id: CABAL_MODEL,
      voice_settings: { stability: c.stability, similarity_boost: c.similarity, style: c.style, use_speaker_boost: true, speed: c.speed },
    }),
  })
  if (!r.ok) throw new Error(`ElevenLabs TTS HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r
}

/** One bank line in eleven_v3 (v3 takes stability 0 / 0.5 / 1 only and ignores style/speed). Bounded retry on 429/5xx. */
export async function bankSpeak(speaker: CabalSpeaker, text: string): Promise<ArrayBuffer> {
  const c = cast()[speaker]
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey(), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: BANK_MODEL, voice_settings: { stability: Math.round(c.stability * 2) / 2, similarity_boost: c.similarity } }),
    })
    if (r.ok) return r.arrayBuffer()
    const msg = (await r.text()).slice(0, 200)
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await Bun.sleep(1500 * attempt); continue }
    throw new Error(`ElevenLabs v3 HTTP ${r.status}: ${msg}`)
  }
}
