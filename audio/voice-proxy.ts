// L10b: POST /api/voice {hunter, text} -> audio/mpeg. The browser never sees the ElevenLabs key.
// Lines are cached in memory (every stage tab asks for the same line); 4 s upstream budget, typed JSON errors.
import { HUNTERS, type HunterId } from "../contract/protocol"
import { cabalSpeak } from "./cabal-cast"

const cache = new Map<string, Promise<Uint8Array>>()
const IDS = new Set<string>(HUNTERS.map((h) => h.id))

interface Req { body?: unknown }
interface Res { status(n: number): Res; set(h: Record<string, string>): Res; send(b: unknown): unknown; json(b: unknown): unknown }

export async function voiceRoute(req: Req, res: Res): Promise<void> {
  const b = (req.body ?? {}) as { hunter?: unknown; text?: unknown }
  const hunter = String(b.hunter ?? "")
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 160) : ""
  if (!IDS.has(hunter) || !text) {
    res.status(400).json({ error: "invalid_voice", message: "need {hunter: HunterId, text: non-empty string}" })
    return
  }
  const k = `${hunter}\n${text}`
  let p = cache.get(k)
  if (!p) {
    p = cabalSpeak(hunter as HunterId, text, AbortSignal.timeout(4000)).then(async (r) => new Uint8Array(await r.arrayBuffer()))
    cache.set(k, p)
    p.catch(() => cache.delete(k))
    if (cache.size > 400) cache.delete(cache.keys().next().value!)
  }
  try {
    const mp3 = await p
    res.status(200).set({ "content-type": "audio/mpeg", "cache-control": "no-store" }).send(Buffer.from(mp3))
  } catch (e) {
    console.warn(`[voice] ${hunter}: ${(e as Error).message}`)
    res.status(502).json({ error: "voice_upstream", message: (e as Error).message })
  }
}
