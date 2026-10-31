// HAUNT THE ROOM audio (lane L10). Stage: synthesized cues + beds + hunter voices on one WebAudio graph.
// Phone: tiny blips in ./phone (its own small context; importing this file starts nothing).
//
//   initAudio()                  call once at stage mount; resolves when sound is running (the first click/key)
//   unlockAudio()                the same, fire-and-forget (the stage shell's name for it)
//   playCue(cue, { endsAt, room })  hide/hunting: endsAt = the phase's endsAt (epoch ms), so the hide loop stops
//                                on the bell and the hunting swell lands on the reveal; room pans a cue
//   playVoice(hunter, event, n?) random line per event; n (1-based) forces one (variant 1 of "back" is the
//                                Crypt-was-a-lie line for the kill beat)
//   speak(hunter, text)          CABAL (L10b): live ElevenLabs line via the server's POST /api/voice (key stays
//                                server-side); 600 ms or the line is skipped (subtitles still show). Resolves true if heard.
//   announce(event, room?)       the esports-caster announcer ("haunted" takes the room); cuts in over the hunters
//   setMaster(0..1)              final volume
//   playPhoneCue(kind, streak?)  phone juice (hide-tap, tick, safe, caught, possessed, lie, finale)
import type { HunterId, RoomId, VoiceEvent } from "../../../contract/protocol"
import { ROOM_GRID, TIMING } from "../../../contract/protocol"
import { playCueAt, startBeds, storyScore, tensionBed, type CueHandle, type CueParams, type StageCue, type Story, type Tension } from "./cues"
import { buildGraph, level, type Graph } from "./graph"
import { playbackSession } from "./phone"
import { createVoices, type Voices } from "./voices"

export { playPhoneCue, unlockPhoneAudio, type PhoneCue } from "./phone"
export type { StageCue } from "./cues"

export interface CueOptions {
  /** hide / hunting / onfire / ticker: epoch ms (Date.now() clock) the cue must end (hide/hunting: StageSnap.endsAt). */
  endsAt?: number
  /** tension: 1..5 (one more layer each; 0 = off). story: 0 stops the score, anything else (default) plays it. */
  level?: number
  /** Pans the cue toward the room's side of the house (left column left, right column right). */
  room?: RoomId
}

/** Per cue: at most `perSecond` plays in any second, at least `gapMs` apart. A burst (300 joins, 20 catches)
 *  becomes a short cascade instead of noise; anything that would start more than 450 ms late is dropped. */
const LIMITS: Record<Exclude<StageCue, "ambient" | "rain" | "tension" | "story">, readonly [perSecond: number, gapMs: number]> = {
  shutter: [3, 150],
  seat: [4, 120],
  full: [2, 400],
  tap: [12, 25],
  lead: [1, 1500],
  onfire: [2, 600],
  ticker: [1, 800],
  intro: [1, 3000],
  card: [1, 1000],
  join: [5, 110],
  "round-start": [1, 1500],
  hide: [1, 1000],
  tick: [3, 200],
  bell: [1, 1000],
  hunting: [1, 1000],
  reveal: [1, 1000],
  sweep: [3, 150],
  caught: [5, 75],
  safe: [1, 800],
  possessed: [2, 700],
  crash: [1, 1500],
  cleansed: [2, 500],
  whisper: [2, 450],
  static: [1, 2000],
  revive: [1, 2000],
  "finale-ghosts": [1, 6000],
  "finale-hunters": [1, 6000],
}
const LIGHT: ReadonlySet<StageCue> = new Set(["join", "caught", "whisper", "tap"]) // shed first when the mix is crowded
const MAX_LIVE = 22

let ctx: AudioContext | null = null
let graph: Graph | null = null
let voices: Voices | null = null
let ready: Promise<void> | null = null
let bedsOn = false
let master = 0.9
let live = 0
let staticCue: CueHandle | null = null
let tension: Tension | null = null
let story: Story | null = null
let bedsBack: ReturnType<typeof setTimeout> | undefined
const recent = new Map<StageCue, number[]>()
const loops = new Map<CueHandle, StageCue>() // hide loops and hunting swells still sounding
const warned = new Set<string>()
const meterBuf = new Float32Array(1024)

function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[audio] ${msg}`)
}

export function initAudio(): Promise<void> {
  if (ready) return ready
  ready = new Promise<void>((resolve) => {
    let c: AudioContext
    playbackSession()
    try {
      c = new AudioContext({ latencyHint: "interactive" })
    } catch (err) {
      console.error("[audio] WebAudio is unavailable; the show runs silent", err)
      resolve()
      return
    }
    const g = buildGraph(c)
    g.master.gain.value = master
    ctx = c
    graph = g
    voices = createVoices(g)
    const wake = () => {
      playbackSession()
      if (c.state !== "running") c.resume().catch((err: unknown) => warnOnce("resume", `resume refused: ${String(err)}`))
    }
    for (const type of ["pointerdown", "keydown", "touchend"] as const) window.addEventListener(type, wake, { capture: true, passive: true })
    const onState = () => {
      if (c.state !== "running") return
      if (!bedsOn) {
        bedsOn = true
        startBeds(g)
      }
      resolve()
    }
    c.addEventListener("statechange", onState)
    wake()
    onState()
    if (c.state !== "running") console.info("[audio] sound unlocks on the first click or key press")
  })
  return ready
}

export function unlockAudio(): void {
  void initAudio()
}

export function setMaster(v: number): void {
  master = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  if (graph) graph.master.gain.setTargetAtTime(master, graph.ctx.currentTime, 0.05)
}

export function playCue(cue: StageCue, opts: CueOptions = {}): void {
  try {
    const c = ctx
    const g = graph
    if (!c || !g) return warnOnce("init", `playCue("${cue}") before initAudio(); dropped`)
    if (c.state !== "running") return warnOnce("locked", "sound is locked until the first click or key; cues are dropped until then")
    if (cue === "ambient" || cue === "rain") return bedsUp(g, 1.5)
    if (cue === "tension") return (tension ??= tensionBed(g)).set(opts.level ?? 1)
    if (cue === "story") return (story ??= storyScore(g)).set((opts.level ?? 1) > 0)
    if (LIGHT.has(cue) && live > MAX_LIVE) return
    const now = performance.now()
    const [perSecond, gapMs] = LIMITS[cue]
    const times = (recent.get(cue) ?? []).filter((at) => at > now - 1000)
    recent.set(cue, times)
    if (times.length >= perSecond) return
    const at = Math.max(now, (times[times.length - 1] ?? -Infinity) + gapMs)
    if (at - now > 450) return
    times.push(at)
    const t = c.currentTime + (at - now) / 1000 + 0.005
    const k = times.length - 1
    const dense = cue === "join" ? 0.6 : cue === "tap" ? 0.35 : 0 // a dense burst plays softer, never louder
    const p: CueParams = { t, pan: panFor(opts.room), k, level: 1 / Math.sqrt(1 + k * dense), note: roomIndex(opts.room) }
    if (cue === "hide" || cue === "hunting") {
      // end on the phase change as heard: schedule against the speaker, not the audio thread
      const latency = (c.outputLatency || 0) + (c.baseLatency || 0)
      const fallback = Date.now() + (cue === "hide" ? TIMING.hideMs : TIMING.huntingMs)
      p.endsAt = c.currentTime + ((opts.endsAt ?? fallback) - Date.now()) / 1000 - latency
    } else if (opts.endsAt !== undefined) {
      p.endsAt = c.currentTime + (opts.endsAt - Date.now()) / 1000
    }
    if (cue === "bell") chokeNearest("hide", t)
    if (cue === "reveal" || cue === "sweep") chokeNearest("hunting", t)
    if (cue === "static") houseDied(g, t)
    if (cue === "intro") {
      // hold the silence: the house goes quiet under the title, the beds return with the sting
      g.bedMute.gain.setTargetAtTime(0.12, t, 0.25)
      g.bedMute.gain.setTargetAtTime(1, t + 3.4, 0.6)
    }
    if (cue === "revive") houseBack(g, t)
    const h = playCueAt(g, cue, p)
    if (cue === "hide" || cue === "hunting") loops.set(h, cue)
    if (cue === "static") staticCue = h
    live++
    setTimeout(() => {
      live--
      loops.delete(h)
      h.dispose?.()
    }, Math.max(0, h.end - c.currentTime) * 1000 + 250)
  } catch (err) {
    console.error(`[audio] cue "${cue}" failed`, err)
  }
}

/** Announcer moments; each maps to audio/lines.json "announcer" (haunted -> haunted-<room>). */
export type AnnounceEvent = "round-one" | "first-blood" | "hunters-choosing" | "haunted" | "shutdown" | "on-fire" | "house-yours" | "exorcised"

export function announce(event: AnnounceEvent, room?: RoomId): void {
  try {
    if (!ctx || !voices) return warnOnce("init-announce", `announce("${event}") before initAudio(); dropped`)
    if (ctx.state !== "running") return warnOnce("locked", "sound is locked until the first click or key; cues are dropped until then")
    if (event === "haunted" && !room) return warnOnce("haunted-room", 'announce("haunted") needs the room; dropped')
    voices.play("announcer", event === "haunted" ? `haunted-${room}` : event)
  } catch (err) {
    console.error(`[audio] announce ${event} failed`, err)
  }
}

export function playVoice(hunter: HunterId, event: VoiceEvent, n?: number): void {
  try {
    if (!ctx || !voices) return warnOnce("init-voice", `playVoice("${hunter}", "${event}") before initAudio(); dropped`)
    if (ctx.state !== "running") return warnOnce("locked", "sound is locked until the first click or key; cues are dropped until then")
    voices.play(hunter, event, n)
  } catch (err) {
    console.error(`[audio] voice ${hunter}/${event} failed`, err)
  }
}

const SPEAK_BUDGET_MS = 600 // a table line that is not playable by then is skipped: late speech is worse than none
let speakSeq = 0

export async function speak(hunter: HunterId, text: string): Promise<boolean> {
  const seq = ++speakSeq // a newer line at the table supersedes one still in flight
  try {
    if (!ctx || !voices) return (warnOnce("init-speak", `speak("${hunter}") before initAudio(); dropped`), false)
    if (ctx.state !== "running") return (warnOnce("locked", "sound is locked until the first click or key; cues are dropped until then"), false)
    const t0 = performance.now()
    const r = await fetch("/api/voice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hunter, text }),
      signal: AbortSignal.timeout(SPEAK_BUDGET_MS),
    })
    if (!r.ok) throw new Error(`/api/voice HTTP ${r.status}`)
    const buf = await ctx.decodeAudioData(await r.arrayBuffer())
    const ms = performance.now() - t0
    if (seq !== speakSeq || ms > SPEAK_BUDGET_MS + 150) return (console.info(`[audio] ${hunter} line skipped (${Math.round(ms)} ms or superseded)`), false)
    voices.line(hunter, buf)
    return true
  } catch (err) {
    console.warn(`[audio] ${hunter} line skipped: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** For meters and the audition page: unlock state, voice pool, output level (dBFS RMS). */
export function audioStatus(): { state: string; levelDb: number; voices: { engine: string; loaded: number; missing: number; total: number } } {
  const v = voices?.stats() ?? { engine: "none", loaded: 0, missing: 0, total: 0 }
  return { state: ctx?.state ?? "off", levelDb: graph ? level(graph, meterBuf) : -120, voices: v }
}

function roomIndex(room?: RoomId): number | undefined {
  const i = room ? ROOM_GRID.flat().indexOf(room) : -1
  return i >= 0 ? i : undefined
}

function panFor(room?: RoomId): number {
  if (!room) return 0
  for (const row of ROOM_GRID) {
    const col = row.indexOf(room)
    if (col >= 0) return col === 0 ? -0.45 : 0.45
  }
  return 0
}

/** The bell cuts the hide loop, the reveal cuts the hunting swell: the nearest one due within 1.5 s. */
function chokeNearest(kind: StageCue, t: number): void {
  let best: CueHandle | null = null
  for (const [h, k] of loops) {
    if (k !== kind || h.landsAt === undefined || Math.abs(h.landsAt - t) > 1.5) continue
    if (!best || Math.abs(h.landsAt - t) < Math.abs((best.landsAt ?? 0) - t)) best = h
  }
  if (!best) return
  best.choke?.(t)
  loops.delete(best)
}

/** kill -9: everything cuts under the static; the beds stay dead until revive (or 9 s, whichever first). */
function houseDied(g: Graph, t: number): void {
  g.world.gain.setTargetAtTime(0, t, 0.004)
  g.world.gain.setTargetAtTime(1, t + 1.75, 0.02) // cues and voices may speak again after the burst
  g.bedMute.gain.setTargetAtTime(0, t, 0.004)
  voices?.silence()
  clearTimeout(bedsBack)
  bedsBack = setTimeout(() => {
    console.warn("[audio] no revive cue 9 s after static; bringing the house sound back anyway")
    bedsUp(g, 3)
  }, 9000)
}

/** The house is back: the static stops dead, the reverse swell plays, the beds bloom back in on its landing. */
function houseBack(g: Graph, t: number): void {
  staticCue?.choke?.(t)
  staticCue = null
  g.world.gain.cancelScheduledValues(t)
  g.world.gain.setTargetAtTime(1, t, 0.02)
  clearTimeout(bedsBack)
  g.bedMute.gain.setTargetAtTime(1, t + 1.5, 0.9)
}

function bedsUp(g: Graph, seconds: number): void {
  if (!bedsOn) {
    bedsOn = true
    startBeds(g)
  }
  clearTimeout(bedsBack)
  g.bedMute.gain.setTargetAtTime(1, g.ctx.currentTime, seconds / 3)
}
