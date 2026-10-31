// Phone juice (L10): tiny WebAudio blips for the ghost's phone. Its own small context (no reverbs, no beds),
// opened by the player's first tap, quiet by default, never throws. Importing this file starts nothing.
//   unlockPhoneAudio()           call once at phone mount: the first tap anywhere opens sound
//   playPhoneCue(kind, streak?)  streak (from the "result" message) climbs the safe ping up a scale
import type { HouseToPhone } from "../../../contract/protocol"

/** The reveal results ("result".kind) plus the phone's own moments. */
export type PhoneCue = Extract<HouseToPhone, { t: "result" }>["kind"] | "hide-tap" | "tick" | "fire" | "climb" | "crackle" | "finale"

const VOLUME = 0.35
const LADDER = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4] // major pentatonic: every streak rings higher

let ctx: AudioContext | null = null
let out: GainNode | null = null
let echo: GainNode | null = null
let noise: AudioBuffer | null = null
let armed = false
const lastAt = new Map<PhoneCue, number>()
const warned = new Set<string>()

function warnOnce(key: string, msg: string, err?: unknown): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[audio] ${msg}`, err ?? "")
}

/** iOS Safari mutes WebAudio when the ring/silent switch is on unless the page's audio session is "playback".
 *  Feature-detected; set before every resume. Shared by the stage (index.ts). */
export function playbackSession(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback"
  } catch (err) {
    warnOnce("audio-session", "audioSession.type = playback refused", err)
  }
}

export function unlockPhoneAudio(): void {
  if (armed) return
  armed = true
  const wake = () => {
    try {
      playbackSession()
      const c = ctx ?? build()
      if (c.state === "running") return
      c.resume().catch((err: unknown) => warnOnce("phone-resume", "phone sound: resume refused", err))
      const s = c.createBufferSource() // iOS: a silent sample played inside the gesture opens the output
      s.buffer = c.createBuffer(1, 1, c.sampleRate)
      s.connect(c.destination)
      s.start()
    } catch (err) {
      warnOnce("phone-build", "phone sound is unavailable on this device", err)
    }
  }
  for (const type of ["pointerdown", "touchend", "click", "keydown"] as const) window.addEventListener(type, wake, { capture: true, passive: true })
}

export function playPhoneCue(kind: PhoneCue, streak = 0): void {
  try {
    unlockPhoneAudio()
    playbackSession()
    const c = ctx ?? build()
    if (c.state !== "running") {
      c.resume().catch(() => undefined)
      return warnOnce("phone-locked", "phone sound opens on the first tap; cues before that are dropped")
    }
    const now = performance.now()
    if (now - (lastAt.get(kind) ?? -1e9) < (kind === "hide-tap" ? 50 : 120)) return // never machine-gun a blip
    lastAt.set(kind, now)
    const t = c.currentTime + 0.005
    RECIPES[kind](c, t, Math.max(0, Math.floor(streak)))
  } catch (err) {
    warnOnce(`phone-${kind}`, `phone cue ${kind} failed`, err)
  }
}

function build(): AudioContext {
  const c = new AudioContext({ latencyHint: "interactive" })
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -12
  comp.ratio.value = 6
  comp.attack.value = 0.002
  comp.release.value = 0.15
  comp.connect(c.destination)
  const o = c.createGain()
  o.gain.value = VOLUME
  o.connect(comp)
  // sparkle: a short, dark feedback echo every blip can send into
  const send = c.createGain()
  send.gain.value = 0.22
  const delay = c.createDelay(0.5)
  delay.delayTime.value = 0.12
  const damp = c.createBiquadFilter()
  damp.type = "lowpass"
  damp.frequency.value = 3200
  const fb = c.createGain()
  fb.gain.value = 0.28
  send.connect(delay)
  delay.connect(damp)
  damp.connect(fb)
  fb.connect(delay)
  damp.connect(o)
  const n = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate)
  const d = n.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  ctx = c
  out = o
  echo = send
  noise = n
  return c
}

// ---------- tiny instruments ----------

function voice(c: AudioContext, t: number, peak: number, decay: number, wet: boolean, to?: AudioNode): GainNode {
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  g.connect(to ?? out!)
  if (wet && !to) g.connect(echo!)
  return g
}

/** A pitched blip that glides from f0 to f1. */
function ping(c: AudioContext, t: number, f0: number, f1: number, peak: number, decay: number, type: OscillatorType = "sine", to?: AudioNode): void {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(0.09, decay * 0.5))
  o.connect(voice(c, t, peak, decay, true, to))
  o.start(t)
  o.stop(t + decay + 0.02)
}

/** A body thump: falling sine plus its octave so a phone speaker can actually reproduce it. */
function thump(c: AudioContext, t: number, f0: number, peak: number, decay: number, to?: AudioNode): void {
  for (const [mult, type, gain] of [[1, "sine", 1], [2, "triangle", 0.45]] as const) {
    const o = c.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0 * mult, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * mult * 0.4), t + decay * 0.6)
    o.connect(voice(c, t, peak * gain, decay, false, to))
    o.start(t)
    o.stop(t + decay + 0.02)
  }
}

/** A short click of filtered noise (the transient that makes a hit feel physical). */
function tick(c: AudioContext, t: number, f: number, peak: number, decay: number, to?: AudioNode): void {
  const s = c.createBufferSource()
  s.buffer = noise
  const bp = c.createBiquadFilter()
  bp.type = "bandpass"
  bp.frequency.value = f
  bp.Q.value = 0.9
  s.connect(bp)
  bp.connect(voice(c, t, peak, decay, false, to))
  s.start(t, Math.random() * 0.4)
  s.stop(t + decay + 0.02)
}

const TAP = [587.33, 659.25, 783.99, 880, 987.77, 1174.66] // each tap lands on a random pentatonic note
let tickTock = false

const RECIPES: Record<PhoneCue, (c: AudioContext, t: number, streak: number) => void> = {
  // you picked a room: a soft, round pop
  "hide-tap": (c, t) => {
    const f = TAP[Math.floor(Math.random() * TAP.length)]
    ping(c, t, f * 1.5, f, 0.4, 0.16)
    tick(c, t, 3000, 0.06, 0.015)
  },
  // the last seconds of hiding: a woody clock tick, then tock
  tick: (c, t) => {
    tickTock = !tickTock
    const k = tickTock ? 1 : 0.84
    tick(c, t, 2400 * k, 0.3, 0.02)
    ping(c, t, 1150 * k, 850 * k, 0.18, 0.06)
  },
  // survived the sweep: a bright rising major arpeggio, a step higher every streak
  safe: (c, t, streak) => {
    const f = 660 * LADDER[Math.min(streak, LADDER.length - 1)]
    ping(c, t, f * 0.75, f, 0.42, 0.25, "triangle")
    ping(c, t + 0.07, f * 1.25, f * 1.25, 0.38, 0.3, "triangle")
    ping(c, t + 0.14, f * 1.5, f * 1.5, 0.42, 0.55, "triangle")
    ping(c, t + 0.14, f * 3, f * 3, 0.06, 0.6)
    tick(c, t, 6000, 0.08, 0.03)
  },
  // caught: a scare stab, a thud and a sad little fall
  caught: (c, t) => {
    thump(c, t, 210, 0.9, 0.38)
    tick(c, t, 700, 0.35, 0.06)
    ping(c, t, 1318.51, 1174.66, 0.14, 0.25, "sawtooth")
    ping(c, t, 1864.66, 1661.22, 0.1, 0.25, "sawtooth")
    ping(c, t + 0.08, 440, 196, 0.16, 0.55, "triangle")
  },
  // on fire (streak >= 3): a whoomph of air catching, then a burst of crackles
  fire: (c, t) => {
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
    g.connect(out!)
    const bp = c.createBiquadFilter()
    bp.type = "bandpass"
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(2800, t + 0.2)
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.8)
    bp.Q.value = 0.8
    bp.connect(g)
    const s = c.createBufferSource()
    s.buffer = noise
    s.loop = true
    s.connect(bp)
    s.start(t)
    s.stop(t + 0.85)
    thump(c, t, 160, 0.6, 0.3)
    for (let at = t + 0.12; at < t + 1.2; at += 0.03 + Math.random() * 0.09) tick(c, at, 1500 + Math.random() * 4500, 0.05 + Math.random() * 0.2, 0.01)
  },
  // someone on fire is in your room: a soft second of crackle
  crackle: (c, t) => {
    for (let at = t; at < t + 1; at += 0.04 + Math.random() * 0.1) tick(c, at, 1500 + Math.random() * 4000, 0.03 + Math.random() * 0.08, 0.01)
  },
  // you overtook someone: a quick run up the scale and a sparkle on top
  climb: (c, t) => {
    ;[880, 987.77, 1174.66, 1318.51, 1567.98].forEach((f, i) => ping(c, t + i * 0.045, f, f, 0.28, 0.18, "triangle"))
    ping(c, t + 0.22, 3135.96, 3135.96, 0.07, 0.45)
    tick(c, t + 0.22, 7000, 0.06, 0.03)
  },
  // your lie worked: a sly three-note chime whose last note winks down
  lie: (c, t) => {
    ping(c, t, 1174.66, 1174.66, 0.3, 0.35)
    ping(c, t + 0.11, 1396.91, 1396.91, 0.3, 0.35)
    ping(c, t + 0.22, 1661.22, 1567.98, 0.34, 0.75)
    ping(c, t + 0.22, 1661.22 * 2.76, 1567.98 * 2.76, 0.04, 0.3)
  },
  // your room fell to the ghosts: a quick dark arpeggio over a low swell
  possessed: (c, t) => {
    ;[587.33, 698.46, 880, 1174.66].forEach((f, i) => ping(c, t + i * 0.055, f, f, 0.32, 0.5, "triangle"))
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.18)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    g.connect(out!)
    const o = c.createOscillator()
    o.type = "triangle"
    o.frequency.value = 293.66
    o.connect(g)
    o.start(t)
    o.stop(t + 0.95)
  },
  // the house falls: a big hit and a chord stab for every phone at once
  finale: (c, t) => {
    thump(c, t, 180, 1, 0.65)
    tick(c, t, 1200, 0.4, 0.12)
    ;[587.33, 698.46, 880, 1318.51].forEach((f) => ping(c, t, f, f, 0.2, 1.1, "triangle"))
    ;[1760, 2093, 2637, 3520].forEach((f, i) => ping(c, t + 0.12 + i * 0.07, f, f, 0.07, 0.6))
  },
}
