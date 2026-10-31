// Voice lines (L10/L10b): pools from /audio/voice/index.json for the four hunters and the announcer, plus live lines.
// ONE GLOBAL VOICE BUS (owner 15:10): exactly one voice sounds at any time, hunters, announcer, ending and live lines
// alike. A new line waits for the bus (at most WAIT_MS from its request) or is dropped; nothing ever cuts or mixes.
// Beds and cues duck while the bus is busy. A random variant per event (never the same line twice running). A missing index or file is logged once and skipped; nothing throws.
import { duck, type Graph } from "./graph"

export interface VoiceLine {
  file: string // relative to /audio/voice/
  text: string
  engine?: string // which TTS made this file ("say", "elevenlabs:<model>", ...)
}
export interface VoiceIndex {
  engine: string // "say" (placeholders) or "openai:<model>"
  version: string // cache-buster: changes on every render
  rendered: string
  voices: Partial<Record<string, Partial<Record<string, VoiceLine[]>>>> // speaker -> event -> lines
}
export interface Voices {
  ready: Promise<VoiceIndex | null>
  play(speaker: string, event: string, n?: number): void
  /** A live-rendered line (CABAL table, ending last words): joins the one voice bus like every other line. */
  line(hunter: string, buf: AudioBuffer): void
  silence(): void
  stats(): { engine: string; loaded: number; missing: number; total: number }
}

const BASE = "/audio/voice/"
const URGENT: ReadonlySet<string> = new Set(["back", "win", "lose"]) // these queue even if that speaker is already talking
const ANNOUNCER = "announcer"
const WAIT_MS = 1500 // a line that cannot start within this of its request is dropped (late lines are worse than none)
const PAN: Record<string, number> = { exorcist: -0.2, medium: 0.25, skeptic: -0.32, priest: 0.32, announcer: 0 }

interface Talk {
  hunter: string
  asked: number
  src?: AudioBufferSourceNode
  gain?: GainNode
  dead: boolean
}

export function createVoices(g: Graph): Voices {
  const buffers = new Map<string, Promise<AudioBuffer | null>>()
  const talking = new Map<string, Talk>()
  const last = new Map<string, number>()
  const warned = new Set<string>()
  let index: VoiceIndex | null = null
  let sounding = 0
  let loaded = 0
  let missing = 0
  let total = 0

  const warnOnce = (key: string, msg: string, err?: unknown) => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`[audio] ${msg}`, err ?? "")
  }

  const ready = fetch(`${BASE}index.json`, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<VoiceIndex>
    })
    .then((j) => {
      index = j
      preload(j)
      return j
    })
    .catch((err: unknown) => {
      warnOnce("index", `no voice index at ${BASE}index.json; the hunters stay silent`, err)
      return null
    })

  function load(file: string): Promise<AudioBuffer | null> {
    let p = buffers.get(file)
    if (!p) {
      p = fetch(`${BASE}${file}?v=${index?.version ?? ""}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.arrayBuffer()
        })
        .then((b) => g.ctx.decodeAudioData(b))
        .then((buf) => {
          loaded++
          return buf
        })
        .catch((err: unknown) => {
          missing++
          warnOnce(file, `voice line ${file} is missing or unreadable; skipped`, err)
          return null
        })
      buffers.set(file, p)
    }
    return p
  }

  function preload(j: VoiceIndex): void {
    const files = Object.values(j.voices).flatMap((events) => Object.values(events ?? {}).flatMap((lines) => (lines ?? []).map((l) => l.file)))
    total = files.length
    let next = 0
    const worker = async () => {
      while (next < files.length) await load(files[next++])
    }
    for (let i = 0; i < 6; i++) void worker()
  }

  function stop(talk: Talk): void {
    talk.dead = true
    if (talking.get(talk.hunter) === talk) talking.delete(talk.hunter)
    if (talk.src && talk.gain) {
      const now = g.ctx.currentTime
      talk.gain.gain.setTargetAtTime(0, now, 0.025)
      talk.src.stop(now + 0.12)
    }
  }

  // ---- the bus: one playing line, a FIFO of decoded lines waiting for it ----
  let playing: Talk | null = null
  const queue: { talk: Talk; buf: AudioBuffer }[] = []
  const log = (globalThis as { __voiceBusLog?: string[] }).__voiceBusLog // offline test hook (audio/bus-test.ts)
  function enqueue(talk: Talk, buf: AudioBuffer): void {
    queue.push({ talk, buf })
    pump()
  }
  function pump(): void {
    if (playing) return
    while (queue.length) {
      const { talk, buf } = queue.shift()!
      if (talk.dead || performance.now() - talk.asked > WAIT_MS) {
        log?.push(`drop ${talk.hunter}`)
        if (talking.get(talk.hunter) === talk) talking.delete(talk.hunter)
        continue
      }
      start(talk, buf)
      return
    }
  }

  function start(talk: Talk, buf: AudioBuffer): void {
    playing = talk
    log?.push(`play ${talk.hunter}`)
    const ctx = g.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    const pan = ctx.createStereoPanner()
    pan.pan.value = PAN[talk.hunter] ?? 0
    if (talk.hunter === ANNOUNCER) gain.gain.value = 1.25 // the caster sits on top of the house
    src.connect(gain)
    gain.connect(pan)
    pan.connect(g.voice)
    const room = ctx.createGain()
    room.gain.value = 0.12 // the line lives in the house, not in a booth
    pan.connect(room)
    room.connect(g.hall)
    talk.src = src
    talk.gain = gain
    if (sounding++ === 0) duck(g, true)
    src.onended = () => {
      pan.disconnect()
      if (talking.get(talk.hunter) === talk) talking.delete(talk.hunter)
      if (--sounding === 0) duck(g, false)
      log?.push(`end ${talk.hunter}`)
      if (playing === talk) playing = null
      pump()
    }
    src.start(ctx.currentTime + 0.01)
  }

  async function speak(hunter: string, event: string, n?: number): Promise<void> {
    const asked = performance.now()
    const idx = index ?? (await ready)
    if (!idx) return
    const lines = idx.voices[hunter]?.[event] ?? []
    if (!lines.length) return warnOnce(`${hunter}/${event}`, `no voice lines for ${hunter}/${event}`)
    const caster = hunter === ANNOUNCER
    const urgent = caster || URGENT.has(event) || n !== undefined // the announcer and explicit picks always play
    const busy = talking.get(hunter)
    if (busy && !urgent) return // that speaker already has a line playing or waiting
    const talk: Talk = { hunter, asked, dead: false }
    talking.set(hunter, talk) // reserve the hunter's mouth before the await
    const key = `${hunter}/${event}`
    let i = n !== undefined ? Math.min(lines.length, Math.max(1, Math.round(n))) - 1 : Math.floor(Math.random() * lines.length)
    if (n === undefined && lines.length > 1 && i === last.get(key)) i = (i + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length
    last.set(key, i)
    let buf: AudioBuffer | null = null
    for (let j = 0; j < lines.length && !buf; j++) {
      buf = await load(lines[(i + j) % lines.length].file) // a missing file falls through to the next line
      if (n !== undefined) break
    }
    if (talk.dead) return
    if (!buf) {
      if (talking.get(hunter) === talk) talking.delete(hunter)
      return
    }
    enqueue(talk, buf)
  }

  return {
    ready,
    play(hunter, event, n) {
      speak(hunter, event, n).catch((err: unknown) => console.error(`[audio] voice ${hunter}/${event} failed`, err))
    },
    line(hunter, buf) {
      const talk: Talk = { hunter, asked: performance.now(), dead: false }
      talking.set(hunter, talk)
      enqueue(talk, buf)
    },
    silence() {
      queue.length = 0
      for (const talk of [...talking.values()]) stop(talk)
    },
    stats: () => ({ engine: index?.engine ?? "none", loaded, missing, total }),
  }
}
