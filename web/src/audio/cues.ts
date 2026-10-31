// Cue recipes (L10): every stage sound is synthesized here from oscillators, noise and the graph's two
// reverbs; no sound files. Each recipe schedules itself at p.t and reports when its dry sound ends.
import type { Cue } from "../../../contract/protocol"
import type { Graph } from "./graph"

export interface CueParams {
  t: number // ctx time the cue starts
  pan: number // -1..1 (room side)
  k: number // position in the current burst of this cue (0 = first): cascades step through a scale
  level: number // gain scale (bursts play softer)
  endsAt?: number // hide / hunting / onfire / ticker: ctx time the cue must end
  note?: number // tap: room index (each room has its own note, so the crowd plays a chord)
}
export interface CueHandle {
  end: number // ctx time the dry sound is over (reverb tails live on in the shared reverbs)
  landsAt?: number // hunting: when the reveal lands
  choke?: (at: number) => void // cut it now (hunting by the reveal, static by the revive)
  dispose?: () => void // detach this cue's nodes once it has ended
}

/** The contract's cues plus the ones the owner asked for after it (NEEDS: add them to contract CUES). */
export type StageCue = Cue | "intro" | "card" | "tap" | "lead" | "onfire" | "ticker" | "tension" | "shutter" | "story" | "seat" | "full"
type SynthCue = Exclude<StageCue, "ambient" | "rain" | "tension" | "story">
type Recipe = (g: Graph, p: CueParams) => CueHandle
type Partial3 = readonly [ratio: number, gain: number, decay: number]

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const clampPan = (v: number) => Math.max(-1, Math.min(1, v))

// ---------- building blocks ----------

let outs: AudioNode[] = [] // outputs created by the recipe running now (disposed together)

function out(g: Graph, p: CueParams, s: { hall?: number; cath?: number; dest?: AudioNode } = {}) {
  const bus = g.ctx.createGain()
  bus.gain.value = p.level
  const pan = g.ctx.createStereoPanner()
  pan.pan.value = p.pan
  bus.connect(pan)
  pan.connect(s.dest ?? g.sfx)
  if (s.hall) send(g, pan, g.hall, s.hall)
  if (s.cath) send(g, pan, g.cathedral, s.cath)
  outs.push(pan)
  return { bus, pan }
}

function send(g: Graph, from: AudioNode, to: AudioNode, amount: number): void {
  const s = g.ctx.createGain()
  s.gain.value = amount
  from.connect(s)
  s.connect(to)
}

function amp(g: Graph, to: AudioNode, v = 0): GainNode {
  const n = g.ctx.createGain()
  n.gain.value = v
  n.connect(to)
  return n
}

function filt(g: Graph, type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode {
  const n = g.ctx.createBiquadFilter()
  n.type = type
  n.frequency.value = f
  n.Q.value = q
  n.connect(to)
  return n
}

function osc(g: Graph, type: OscillatorType, f: number, t: number, stop: number | null, to: AudioNode, detune = 0): OscillatorNode {
  const o = g.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.detune.value = detune
  o.connect(to)
  o.start(t)
  if (stop !== null) o.stop(stop)
  return o
}

/** Looping noise from a random offset (so two cues never share a waveform). */
function src(g: Graph, buf: AudioBuffer, t: number, stop: number | null, to: AudioNode, rate = 1): AudioBufferSourceNode {
  const s = g.ctx.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.playbackRate.value = rate
  s.connect(to)
  s.start(t, Math.random() * buf.duration)
  if (stop !== null) s.stop(stop)
  return s
}

/** A modulator: `osc -> depth -> param`. */
function lfo(g: Graph, f: number, depth: number, t: number, stop: number | null, param: AudioParam, type: OscillatorType = "sine"): OscillatorNode {
  const o = g.ctx.createOscillator()
  o.type = type
  o.frequency.value = f
  const d = g.ctx.createGain()
  d.gain.value = depth
  o.connect(d)
  d.connect(param)
  o.start(t)
  if (stop !== null) o.stop(stop)
  return o
}

/** Linear attack, exponential decay to silence. */
function hit(p: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + attack)
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  p.setValueAtTime(0, t + attack + decay)
}

/** A sine kick whose pitch falls (the body of every impact). */
function boom(g: Graph, to: AudioNode, t: number, f0: number, f1: number, drop: number, peak: number, decay: number): void {
  const a = amp(g, to)
  hit(a.gain, t, peak, 0.004, decay)
  const o = osc(g, "sine", f0, t, t + decay + 0.05, a)
  o.frequency.exponentialRampToValueAtTime(f1, t + drop)
}

/** Burst of filtered noise with a hit envelope. */
function burst(g: Graph, to: AudioNode, buf: AudioBuffer, t: number, type: BiquadFilterType, f: number, peak: number, attack: number, decay: number): void {
  const a = amp(g, to)
  hit(a.gain, t, peak, attack, decay)
  src(g, buf, t, t + attack + decay + 0.02, filt(g, type, f, 0.7, a))
}

/** Additive partials (glass, metal, bells): each a sine with its own gain and decay. */
function partials(g: Graph, to: AudioNode, t: number, f: number, list: readonly Partial3[], peak: number, beat = 0): void {
  for (const [ratio, gain, decay] of list) {
    const a = amp(g, to)
    hit(a.gain, t, gain * peak * (beat ? 0.5 : 1), 0.003, decay)
    osc(g, "sine", f * ratio, t, t + decay + 0.05, a)
    if (beat) osc(g, "sine", f * ratio + rnd(beat * 0.4, beat), t, t + decay + 0.05, a) // the warble of real bronze
  }
}

const VOWEL_OO = [[330, 1, 5], [780, 0.4, 7], [2600, 0.1, 9]] as const
const VOWEL_AH = [730, 1150, 2650] as const

/** A ghost choir: detuned saws with vibrato and breath through an "oo" formant bank that can open to "ah". */
function choir(g: Graph, to: AudioNode, t: number, notes: readonly number[], attack: number, hold: number, release: number, peak: number): number {
  const ctx = g.ctx
  const end = t + attack + hold + release
  const env = amp(g, to)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(peak, t + attack)
  env.gain.setValueAtTime(peak, t + attack + hold)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  const mix = ctx.createGain()
  mix.gain.value = 1 / Math.sqrt(notes.length)
  VOWEL_OO.forEach(([f, a, q], i) => {
    const bp = ctx.createBiquadFilter()
    bp.type = "bandpass"
    bp.Q.value = q
    bp.frequency.setValueAtTime(f, t)
    bp.frequency.exponentialRampToValueAtTime(VOWEL_AH[i], t + attack + hold * 0.6) // the choir opens its mouth
    mix.connect(bp)
    bp.connect(amp(g, env, a * 3.2))
  })
  for (const f of notes) {
    const vib = ctx.createGain()
    vib.gain.value = rnd(6, 11) // cents
    lfo(g, rnd(4.6, 5.8), 1, t, end, vib.gain) // vibrato rate wobbles a hair
    const v = ctx.createOscillator()
    v.frequency.value = rnd(4.8, 5.6)
    v.connect(vib)
    v.start(t)
    v.stop(end)
    for (const d of [-12, 1, 11]) {
      const o = osc(g, "sawtooth", f, t, end, mix, d + rnd(-3, 3))
      vib.connect(o.detune)
    }
  }
  src(g, g.pink, t, end, amp(g, mix, 0.35)) // breath
  return end
}

// ---------- cues ----------

const join: Recipe = (g, p) => {
  const t = p.t
  const dur = rnd(0.8, 1.15)
  const { bus, pan } = out(g, p, { hall: 0.45 })
  const dir = Math.random() < 0.5 ? -1 : 1
  pan.pan.setValueAtTime(clampPan(p.pan - 0.55 * dir), t)
  pan.pan.linearRampToValueAtTime(clampPan(p.pan + 0.45 * dir), t + dur)
  const a = amp(g, bus)
  a.gain.setValueAtTime(0.0001, t)
  a.gain.exponentialRampToValueAtTime(1.6, t + dur * 0.42)
  a.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const bp = filt(g, "bandpass", 400, 1.3, a)
  bp.frequency.setValueAtTime(rnd(300, 450), t)
  bp.frequency.exponentialRampToValueAtTime(rnd(1700, 2700), t + dur * 0.42)
  bp.frequency.exponentialRampToValueAtTime(rnd(600, 800), t + dur)
  src(g, g.pink, t, t + dur + 0.05, bp)
  // a faint pentatonic glint, so a river of joins shimmers instead of hissing
  const glint = amp(g, bus)
  glint.gain.setValueAtTime(0.0001, t + dur * 0.25)
  glint.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.5)
  glint.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7)
  osc(g, "sine", pick([1174.66, 1396.91, 1567.98, 1760, 2093]), t + dur * 0.25, t + dur + 0.75, glint)
  return { end: t + dur + 0.8 }
}

const roundStart: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.55, hall: 0.2 })
  boom(g, bus, t, 120, 36, 0.5, 0.95, 2.2)
  burst(g, bus, g.white, t, "lowpass", 2600, 0.5, 0.002, 0.25)
  // a dark brass cluster that blooms and closes: D2 A2 D3 + the E-flat that makes it wrong
  const horn = amp(g, bus)
  horn.gain.setValueAtTime(0, t)
  horn.gain.linearRampToValueAtTime(0.3, t + 0.06)
  horn.gain.setTargetAtTime(0.17, t + 0.3, 0.5)
  horn.gain.setTargetAtTime(0, t + 1.8, 0.7)
  const lp = filt(g, "lowpass", 180, 1.2, horn)
  lp.frequency.setValueAtTime(180, t)
  lp.frequency.exponentialRampToValueAtTime(1300, t + 0.35)
  lp.frequency.exponentialRampToValueAtTime(260, t + 3.6)
  for (const f of [73.42, 110, 146.83, 155.56]) for (const d of [-9, 8]) osc(g, "sawtooth", f, t, t + 4.5, lp, d)
  return { end: t + 4.5 }
}

const hunting: Recipe = (g, p) => {
  const t = p.t
  const lands = Math.max(t + 0.5, p.endsAt ?? t + 3.5)
  const stop = lands + 0.45
  const { bus } = out(g, p, { hall: 0.25 })
  const choke = amp(g, bus, 1)
  const env = amp(g, choke)
  env.gain.setValueAtTime(0.03, t)
  env.gain.exponentialRampToValueAtTime(1, lands)
  env.gain.setValueAtTime(1, lands + 0.22) // hold the peak a beat in case the reveal lands late
  env.gain.exponentialRampToValueAtTime(0.0001, lands + 0.4)
  const trem = amp(g, env, 1)
  const wob = lfo(g, 3, 0.35, t, stop, trem.gain)
  wob.frequency.exponentialRampToValueAtTime(16, lands) // the tremolo races while the hunters decide
  // dissonant cluster sliding up a fourth: A3, B-flat3, E4 (a tritone against B-flat), a thin F5 above
  const lp = filt(g, "lowpass", 500, 2, trem)
  lp.frequency.exponentialRampToValueAtTime(5200, lands)
  const tones = amp(g, lp, 0.16)
  for (const f of [220, 233.08, 329.63, 698.46]) {
    const o = osc(g, "sawtooth", f, t, stop, tones, rnd(-6, 6))
    o.frequency.exponentialRampToValueAtTime(f * 1.335, lands)
  }
  const hp = filt(g, "highpass", 300, 0.7, trem)
  hp.frequency.exponentialRampToValueAtTime(3500, lands)
  src(g, g.white, t, stop, amp(g, hp, 0.55))
  // a low pulse underneath that quickens toward the reveal
  for (let at = t + 0.1, gap = 0.62; at < lands - 0.12; at += gap, gap = Math.max(0.24, gap * 0.86)) {
    boom(g, choke, at, 95, 50, 0.08, 0.55, 0.22)
  }
  return {
    end: stop,
    landsAt: lands,
    choke: (at) => {
      choke.gain.setValueAtTime(1, at)
      choke.gain.linearRampToValueAtTime(0, at + 0.03)
    },
  }
}

const sweep: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.85, hall: 0.25 })
  // the swing of the beam: a falling whoosh into the hit
  const w = amp(g, bus)
  hit(w.gain, t, 0.6, 0.03, 0.3)
  const bp = filt(g, "bandpass", 4200, 1.1, w)
  bp.frequency.setValueAtTime(4200, t)
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.3)
  src(g, g.white, t, t + 0.4, bp)
  boom(g, bus, t, 150, 40, 0.35, 1, 1.6)
  burst(g, bus, g.white, t, "highpass", 1200, 0.55, 0.001, 0.09) // crack
  burst(g, bus, g.brown, t, "lowpass", 420, 0.7, 0.003, 0.45) // body
  // low metal so the cathedral tail sings
  for (const [f, a, d] of [[98, 0.12, 2.2], [148.3, 0.07, 1.8], [279.9, 0.05, 1.4]] as const) {
    const r = amp(g, bus)
    hit(r.gain, t, a, 0.004, d)
    osc(g, "triangle", f, t, t + d + 0.05, r)
  }
  return { end: t + 2.3 }
}

const CAUGHT_SCALE = [2349.32, 2093, 1760, 1567.98, 1396.91, 1174.66] // D7 C7 A6 G6 F6 D6: a burst steps down
const GLASS: readonly Partial3[] = [[1, 0.32, 2], [2.005, 0.08, 1.1], [2.76, 0.12, 0.8], [5.4, 0.04, 0.35]]

const caught: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.5, cath: 0.15 })
  partials(g, bus, t, CAUGHT_SCALE[p.k % CAUGHT_SCALE.length] * rnd(0.997, 1.003), GLASS, 1)
  burst(g, bus, g.white, t, "highpass", 6000, 0.12, 0.001, 0.02) // strike
  if (p.k === 0) {
    // the scare: a screeching dissonant stab and a slam (only the first catch of a burst; the rest chime)
    const stab = amp(g, bus)
    hit(stab.gain, t, 0.3, 0.004, 0.55)
    const hp = filt(g, "highpass", 600, 0.7, stab)
    for (const f of [1244.51, 1318.51, 1864.66, 2637.02]) osc(g, "sawtooth", f, t, t + 0.6, hp, rnd(-15, 15)).frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.55)
    boom(g, bus, t, 160, 50, 0.15, 0.8, 0.5)
    burst(g, bus, g.white, t, "lowpass", 3000, 0.5, 0.001, 0.12)
  }
  return { end: t + 2.1 }
}

const possessed: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.6, hall: 0.3 })
  // D minor with a major seventh: beautiful and wrong
  const end = choir(g, bus, t, [146.83, 220, 349.23, 554.37, 659.25], 1.6, 0.9, 2.6, 0.5)
  const lo = amp(g, bus)
  lo.gain.setValueAtTime(0.0001, t)
  lo.gain.exponentialRampToValueAtTime(0.3, t + 1.6)
  lo.gain.exponentialRampToValueAtTime(0.0001, end)
  osc(g, "sine", 73.42, t, end, lo)
  return { end }
}

const METAL: readonly Partial3[] = [[1, 0.07, 1.6], [1.65, 0.06, 1.3], [2.38, 0.05, 1.1], [3.5, 0.04, 0.9], [5.01, 0.035, 0.7]]

const crash: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.45, cath: 0.3 })
  boom(g, bus, t, 90, 30, 0.6, 1, 1.8)
  burst(g, bus, g.white, t, "highpass", 700, 0.7, 0.003, 0.55) // the smash
  burst(g, bus, g.brown, t, "lowpass", 600, 0.5, 0.005, 0.7) // the floor takes it
  partials(g, bus, t, 237, METAL, 1) // the iron frame rings
  // crystal: dense at the impact, thinning out, scattered across the room
  for (let i = 0; i < 46; i++) {
    const at = t + 0.01 + 1.9 * Math.pow(Math.random(), 2.4)
    const f = rnd(2600, 8800)
    const d = rnd(0.05, 0.32)
    const pn = g.ctx.createStereoPanner()
    pn.pan.value = rnd(-0.9, 0.9)
    pn.connect(bus)
    const s = amp(g, pn)
    hit(s.gain, at, rnd(0.015, 0.09) * (1 - (at - t) / 2.2), 0.001, d)
    osc(g, "sine", f, at, at + d + 0.02, s)
    osc(g, "sine", f * 2.71, at, at + d * 0.6 + 0.02, s)
  }
  return { end: t + 2.6 }
}

const cleansed: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.5, cath: 0.4 })
  // A major 9, high and quick: holy light
  ;[880, 1108.73, 1318.51, 1661.22, 1975.53].forEach((f, i) => {
    const at = t + i * 0.065
    const n = amp(g, bus)
    hit(n.gain, at, 0.12, 0.012, 2.6)
    const trem = amp(g, n, 1)
    lfo(g, rnd(6, 9), 0.3, at, at + 2.7, trem.gain)
    osc(g, "sine", f, at, at + 2.7, trem)
    osc(g, "triangle", f * 2, at, at + 2.7, amp(g, trem, 0.3))
  })
  const sp = amp(g, bus)
  sp.gain.setValueAtTime(0.0001, t)
  sp.gain.exponentialRampToValueAtTime(0.14, t + 0.25)
  sp.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
  src(g, g.white, t, t + 1.9, filt(g, "highpass", 6500, 0.7, sp))
  const rise = amp(g, bus)
  hit(rise.gain, t, 0.25, 0.35, 0.5)
  const bp = filt(g, "bandpass", 1500, 1.2, rise)
  bp.frequency.exponentialRampToValueAtTime(7000, t + 0.6)
  src(g, g.white, t, t + 0.9, bp)
  return { end: t + 3 }
}

const whisper: Recipe = (g, p) => {
  const t = p.t
  const dur = rnd(1.3, 1.9)
  const { bus, pan } = out(g, p, { hall: 0.55, cath: 0.2 })
  pan.pan.setValueAtTime(clampPan(p.pan + rnd(-0.6, 0.6)), t)
  pan.pan.linearRampToValueAtTime(clampPan(p.pan + rnd(-0.6, 0.6)), t + dur)
  const body = amp(g, bus)
  const f1 = filt(g, "bandpass", 1200, 5, body)
  const f2 = filt(g, "bandpass", 2400, 6, body)
  const hp = filt(g, "highpass", 700, 0.7, f1)
  hp.connect(f2)
  src(g, g.pink, t, t + dur + 0.1, hp)
  // unvoiced syllables: the mouth moves, nothing is voiced
  body.gain.setValueAtTime(0, t)
  let at = t
  while (at < t + dur - 0.15) {
    const len = rnd(0.12, 0.26)
    body.gain.linearRampToValueAtTime(rnd(2.2, 4.2), at + len * 0.3)
    body.gain.linearRampToValueAtTime(rnd(0.1, 0.5), at + len)
    f1.frequency.setTargetAtTime(rnd(700, 1800), at, 0.03)
    f2.frequency.setTargetAtTime(rnd(1900, 3400), at, 0.03)
    at += len
  }
  body.gain.linearRampToValueAtTime(0, t + dur)
  for (let i = 0; i < 2; i++) burst(g, bus, g.white, t + rnd(0.1, dur - 0.2), "highpass", 5200, rnd(0.12, 0.22), 0.02, rnd(0.08, 0.16))
  return { end: t + dur + 0.2 }
}

const staticBurst: Recipe = (g, p) => {
  const t = p.t
  const dur = 1.7
  const { bus } = out(g, p, { dest: g.direct }) // bypasses the world cut: this IS the cut
  const choke = amp(g, bus, 1)
  const env = amp(g, choke)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(0.5, t + 0.004)
  env.gain.setValueAtTime(0.5, t + dur - 0.03)
  env.gain.linearRampToValueAtTime(0, t + dur)
  // hiss with a TV speaker's bite, fluttering at random (noise played very slowly is a random LFO)
  const flutter = amp(g, env, 0.75)
  const depth = g.ctx.createGain()
  depth.gain.value = 0.6
  depth.connect(flutter.gain)
  src(g, g.white, t, t + dur, depth, 0.002)
  const bite = g.ctx.createBiquadFilter()
  bite.type = "peaking"
  bite.frequency.value = 4000
  bite.gain.value = 4
  bite.connect(flutter)
  src(g, g.white, t, t + dur, filt(g, "highpass", 180, 0.7, bite))
  osc(g, "sawtooth", 60, t, t + dur, filt(g, "lowpass", 500, 0.7, amp(g, env, 0.06))) // mains hum
  osc(g, "sine", 15734, t, t + dur, amp(g, env, 0.008)) // CRT whine
  boom(g, choke, t + dur - 0.02, 190, 38, 0.12, 0.6, 0.25) // power-off thunk
  return {
    end: t + dur + 0.3,
    choke: (at) => {
      choke.gain.setValueAtTime(1, at)
      choke.gain.linearRampToValueAtTime(0, at + 0.05)
    },
  }
}

const revive: Recipe = (g, p) => {
  const t = p.t
  const lands = t + 1.5
  const { bus } = out(g, p, { hall: 0.3 })
  // a decay played backwards: everything rises exponentially and stops dead
  const env = amp(g, bus)
  env.gain.setValueAtTime(0.002, t)
  env.gain.exponentialRampToValueAtTime(1, lands - 0.02)
  env.gain.linearRampToValueAtTime(0, lands + 0.015)
  for (const [f, type, a] of [[146.83, "triangle", 0.14], [293.66, "sine", 0.16], [440, "sine", 0.13], [659.25, "triangle", 0.08], [698.46, "sine", 0.06]] as const) {
    osc(g, type, f, t, lands + 0.03, amp(g, env, a))
  }
  const bp = filt(g, "bandpass", 700, 0.8, amp(g, env, 0.6))
  bp.frequency.exponentialRampToValueAtTime(7000, lands)
  src(g, g.white, t, lands + 0.03, bp)
  // the bloom it lands on, as the house comes back
  const bloom = amp(g, bus)
  bloom.gain.setValueAtTime(0.0001, lands)
  bloom.gain.exponentialRampToValueAtTime(0.22, lands + 0.08)
  bloom.gain.exponentialRampToValueAtTime(0.0001, lands + 2.2)
  osc(g, "sine", 73.42, lands, lands + 2.3, bloom)
  osc(g, "sine", 146.83, lands, lands + 2.3, amp(g, bloom, 0.5))
  return { end: lands + 2.3 }
}

const finaleGhosts: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.75, hall: 0.2 })
  boom(g, bus, t, 80, 27, 1.1, 1, 3.2)
  boom(g, bus, t, 160, 55, 0.25, 0.5, 0.6)
  burst(g, bus, g.white, t, "lowpass", 3500, 0.6, 0.002, 0.4)
  burst(g, bus, g.brown, t, "lowpass", 260, 0.5, 0.02, 2.5)
  const braam = amp(g, bus)
  braam.gain.setValueAtTime(0, t)
  braam.gain.linearRampToValueAtTime(0.3, t + 0.05)
  braam.gain.setTargetAtTime(0.12, t + 0.4, 0.8)
  braam.gain.setTargetAtTime(0, t + 3, 1.2)
  const lp = filt(g, "lowpass", 200, 1, braam)
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.3)
  lp.frequency.exponentialRampToValueAtTime(220, t + 5)
  for (const f of [73.42, 110, 146.83]) for (const d of [-8, 9]) osc(g, "sawtooth", f, t, t + 7, lp, d)
  const end = choir(g, bus, t + 0.05, [146.83, 220, 293.66, 349.23, 440, 587.33], 0.45, 3.4, 4.2, 0.55)
  return { end }
}

// church bell partials relative to the prime: hum, prime, tierce (minor third), quint, nominal, uppers
const BELL: readonly Partial3[] = [
  [0.5, 0.32, 9], [1, 0.42, 7], [1.183, 0.28, 5], [1.506, 0.13, 4], [2, 0.3, 4.5], [2.514, 0.1, 2.6],
  [2.662, 0.08, 2.2], [3.011, 0.08, 1.8], [4.166, 0.06, 1.2], [5.433, 0.04, 0.8], [6.796, 0.03, 0.5],
]

const finaleHunters: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.7, hall: 0.2 })
  for (let i = 0; i < 3; i++) {
    const at = t + i * 2.6
    const peak = i === 0 ? 1 : 0.85
    partials(g, bus, at, 146.83 * rnd(0.998, 1.002), BELL, peak, 1.1)
    burst(g, bus, g.white, at, "bandpass", 1800, 0.35 * peak, 0.001, 0.05) // the clapper
  }
  return { end: t + 5.2 + 9 }
}

/** HIDE: a "go" sting, then a spooky loop that runs until the bell and tightens in the last 3 s
 *  (hats double, the ostinato climbs an octave, the filter opens). The bell chokes it. */
const hide: Recipe = (g, p) => {
  const t = p.t
  const end = Math.max(t + 1, p.endsAt ?? t + 6)
  const { bus } = out(g, p, { hall: 0.35 })
  const choke = amp(g, bus, 1)
  // the sting: the ghosts scatter, a music-box flourish up and away
  const w = amp(g, choke)
  w.gain.setValueAtTime(0.0001, t)
  w.gain.exponentialRampToValueAtTime(0.5, t + 0.3)
  w.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
  const bp = filt(g, "bandpass", 300, 1.2, w)
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.45)
  src(g, g.pink, t, t + 0.85, bp)
  ;[587.33, 698.46, 880, 1174.66].forEach((f, i) => {
    const at = t + 0.05 + i * 0.07
    const n = amp(g, choke)
    hit(n.gain, at, 0.13, 0.003, 0.9)
    osc(g, "sine", f, at, at + 0.95, n)
    osc(g, "sine", f * 3.01, at, at + 0.4, amp(g, n, 0.25))
  })
  // the loop: 100 bpm, eighth notes; pizzicato ostinato in D minor over a low pulse and dry hats
  const eighth = 0.3
  const tight = end - 3
  const pluckLp = filt(g, "lowpass", 900, 1.5, choke)
  pluckLp.frequency.setValueAtTime(900, tight)
  pluckLp.frequency.exponentialRampToValueAtTime(3800, end)
  const riff = [146.83, 174.61, 220, 207.65, 146.83, 174.61, 233.08, 220]
  let i = 0
  for (let at = t + 0.6; at < end - 0.05; at += eighth, i++) {
    const late = at >= tight
    const f = riff[i % riff.length] * (late ? 2 : 1)
    const n = amp(g, pluckLp)
    hit(n.gain, at, late ? 0.2 : 0.16, 0.004, 0.22)
    osc(g, "triangle", f, at, at + 0.25, n)
    osc(g, "sawtooth", f * 1.003, at, at + 0.12, amp(g, n, 0.3))
    if (i % 2 === 0) boom(g, choke, at, 110, 48, 0.07, late ? 0.6 : 0.45, 0.2) // pulse on the beat
    const hats = late ? 2 : i % 2 === 1 ? 1 : 0 // offbeat hats, then sixteenths in the last 3 s
    for (let h = 0; h < hats; h++) burst(g, choke, g.white, at + (late ? h * eighth * 0.5 : 0), "highpass", 7000, late ? 0.16 : 0.12, 0.001, 0.03)
  }
  return {
    end: end + 0.3,
    landsAt: end,
    choke: (at) => {
      choke.gain.setValueAtTime(1, at)
      choke.gain.linearRampToValueAtTime(0, at + 0.04)
    },
  }
}

let tock = false

/** The grandfather clock in the hall: tick and tock alternate. */
const tick: Recipe = (g, p) => {
  const t = p.t
  tock = !tock
  const k = tock ? 0.84 : 1
  const { bus } = out(g, p, { hall: 0.35, cath: 0.1 })
  burst(g, bus, g.white, t, "bandpass", 2400 * k, 0.5, 0.0008, 0.018) // wood
  const s = amp(g, bus)
  hit(s.gain, t, 0.35, 0.001, 0.05)
  osc(g, "sine", 1150 * k, t, t + 0.07, s).frequency.exponentialRampToValueAtTime(850 * k, t + 0.04)
  const body = amp(g, bus)
  hit(body.gain, t, 0.3, 0.002, 0.09)
  osc(g, "triangle", 210 * k, t, t + 0.1, body)
  return { end: t + 0.15 }
}

/** Hiding is over: one bright tower-bell strike (the finale bell is the big low one). */
const bell: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.45, hall: 0.2 })
  partials(g, bus, t, 293.66, BELL.map(([r, a, d]) => [r, a, d * 0.45] as const), 0.9, 1.4)
  burst(g, bus, g.white, t, "bandpass", 2600, 0.3, 0.001, 0.04) // the clapper
  return { end: t + 4.2 }
}

/** The flashlights snap on: a breaker clack, a beam of light, a dark brass stab. */
const reveal: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { cath: 0.6, hall: 0.25 })
  burst(g, bus, g.white, t, "bandpass", 3200, 0.9, 0.0005, 0.035)
  burst(g, bus, g.white, t + 0.012, "highpass", 5000, 0.4, 0.0005, 0.06)
  boom(g, bus, t, 130, 45, 0.25, 0.9, 1.1)
  const beam = amp(g, bus)
  beam.gain.setValueAtTime(0.0001, t)
  beam.gain.exponentialRampToValueAtTime(0.18, t + 0.06)
  beam.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  src(g, g.pink, t, t + 1.7, filt(g, "bandpass", 2400, 0.9, beam))
  const stab = amp(g, bus)
  hit(stab.gain, t, 0.28, 0.01, 1.1)
  const lp = filt(g, "lowpass", 2400, 1, stab)
  lp.frequency.exponentialRampToValueAtTime(300, t + 1)
  for (const f of [73.42, 110, 155.56, 220]) for (const d of [-7, 7]) osc(g, "sawtooth", f, t, t + 1.2, lp, d)
  return { end: t + 1.7 }
}

/** The survivors breathe out: a warm D major add9, soft and quick. */
const safe: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.5, cath: 0.25 })
  ;[293.66, 369.99, 440, 659.25].forEach((f, i) => {
    const n = amp(g, bus)
    n.gain.setValueAtTime(0, t)
    n.gain.linearRampToValueAtTime(0.11, t + 0.06 + i * 0.02)
    n.gain.setTargetAtTime(0, t + 0.5, 0.45)
    osc(g, "triangle", f, t, t + 2.6, n, rnd(-4, 4))
    osc(g, "sine", f * 2, t, t + 2.6, amp(g, n, 0.3))
  })
  const air = amp(g, bus)
  air.gain.setValueAtTime(0.0001, t)
  air.gain.exponentialRampToValueAtTime(0.12, t + 0.1)
  air.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
  src(g, g.pink, t, t + 1.3, filt(g, "bandpass", 1400, 0.8, air))
  return { end: t + 2.7 }
}

/** The title sequence (4 s): held silence, a low swell, one sting as the title lands. Anticipation, not a jump. */
const intro: Recipe = (g, p) => {
  const t = p.t
  const lands = t + 3.4
  const { bus } = out(g, p, { cath: 0.7, hall: 0.2 })
  const sw = amp(g, bus)
  sw.gain.setValueAtTime(0.0001, t + 1.1)
  sw.gain.exponentialRampToValueAtTime(0.5, lands - 0.05)
  sw.gain.linearRampToValueAtTime(0, lands + 0.02)
  const lp = filt(g, "lowpass", 120, 0.9, sw)
  lp.frequency.setValueAtTime(120, t + 1.1)
  lp.frequency.exponentialRampToValueAtTime(900, lands)
  for (const [f, d] of [[36.71, 0], [73.42, -8], [73.42, 7], [77.78, 0], [110, 5]] as const) osc(g, "sawtooth", f, t + 1.1, lands + 0.05, lp, d)
  const air = amp(g, bus)
  air.gain.setValueAtTime(0.0001, t + 1.6)
  air.gain.exponentialRampToValueAtTime(0.18, lands - 0.02)
  air.gain.linearRampToValueAtTime(0, lands + 0.01)
  src(g, g.white, t + 1.6, lands + 0.05, filt(g, "bandpass", 1500, 0.7, air))
  // the sting
  boom(g, bus, lands, 120, 34, 0.6, 1, 2.6)
  burst(g, bus, g.white, lands, "lowpass", 4000, 0.6, 0.001, 0.3)
  const st = amp(g, bus)
  hit(st.gain, lands, 0.22, 0.004, 2.4)
  for (const f of [146.83, 155.56, 207.65, 587.33, 622.25]) osc(g, "sawtooth", f, lands, lands + 2.5, filt(g, "lowpass", 2600, 0.8, st), rnd(-6, 6))
  return { end: lands + 2.7 }
}

/** One tutorial card: a soft eerie whoosh with a faint glassy rub on top. */
const card: Recipe = (g, p) => {
  const t = p.t
  const { bus, pan } = out(g, p, { hall: 0.6 })
  pan.pan.setValueAtTime(clampPan(p.pan - 0.4), t)
  pan.pan.linearRampToValueAtTime(clampPan(p.pan + 0.4), t + 1.2)
  const w = amp(g, bus)
  w.gain.setValueAtTime(0.0001, t)
  w.gain.exponentialRampToValueAtTime(0.6, t + 0.45)
  w.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
  const bp = filt(g, "bandpass", 500, 1.6, w)
  bp.frequency.exponentialRampToValueAtTime(1600, t + 0.45)
  bp.frequency.exponentialRampToValueAtTime(700, t + 1.2)
  src(g, g.pink, t, t + 1.25, bp)
  for (const f of [1567.98, 1661.22]) {
    const n = amp(g, bus)
    n.gain.setValueAtTime(0.0001, t + 0.15)
    n.gain.exponentialRampToValueAtTime(0.03, t + 0.5)
    n.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)
    osc(g, "sine", f, t + 0.15, t + 1.55, n)
  }
  return { end: t + 1.6 }
}

const TAP_NOTES = [587.33, 659.25, 783.99, 880, 987.77, 1174.66] // one pentatonic note per room

/** A ghost picked a room: a soft breathy tick on that room's note. The room hears itself playing. */
const tap: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.55 })
  const f = TAP_NOTES[(p.note ?? Math.floor(Math.random() * 6)) % TAP_NOTES.length] * rnd(0.996, 1.004)
  const n = amp(g, bus)
  hit(n.gain, t, 0.12, 0.002, 0.35)
  osc(g, "sine", f, t, t + 0.4, n)
  osc(g, "sine", f * 2.01, t, t + 0.15, amp(g, n, 0.2))
  burst(g, bus, g.pink, t, "bandpass", rnd(1800, 3200), 0.12, 0.003, 0.06)
  return { end: t + 0.45 }
}

/** A new #1: a cymbal swell into a two-chord brass call and a glint on the crown. */
const lead: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.35, cath: 0.3 })
  const sw = amp(g, bus)
  sw.gain.setValueAtTime(0.0001, t)
  sw.gain.exponentialRampToValueAtTime(0.3, t + 0.25)
  sw.gain.linearRampToValueAtTime(0, t + 0.27)
  src(g, g.white, t, t + 0.3, filt(g, "highpass", 5000, 0.7, sw))
  const brass = (at: number, notes: readonly number[], dur: number, peak: number) => {
    const b = amp(g, bus)
    b.gain.setValueAtTime(0, at)
    b.gain.linearRampToValueAtTime(peak, at + 0.02)
    b.gain.setTargetAtTime(0, at + dur * 0.6, dur * 0.3)
    const lp = filt(g, "lowpass", 900, 1.2, b)
    lp.frequency.exponentialRampToValueAtTime(3500, at + 0.08)
    lp.frequency.exponentialRampToValueAtTime(1200, at + dur)
    for (const f of notes) for (const d of [-6, 6]) osc(g, "sawtooth", f, at, at + dur + 0.8, lp, d)
  }
  brass(t + 0.25, [293.66, 440, 587.33], 0.18, 0.14)
  brass(t + 0.45, [233.08, 349.23, 466.16, 587.33], 0.9, 0.17)
  boom(g, bus, t + 0.45, 120, 45, 0.2, 0.7, 0.8)
  partials(g, bus, t + 0.45, 1174.66, GLASS, 0.6)
  return { end: t + 2.3 }
}

/** A streaker catches fire: a whoomph of air, then a low roar and crackles until endsAt (default 4 s). */
const onfire: Recipe = (g, p) => {
  const t = p.t
  const end = Math.max(t + 1.5, p.endsAt ?? t + 4)
  const { bus } = out(g, p, { hall: 0.3 })
  const w = amp(g, bus)
  w.gain.setValueAtTime(0.0001, t)
  w.gain.exponentialRampToValueAtTime(0.8, t + 0.18)
  w.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
  const bp = filt(g, "bandpass", 200, 0.8, w)
  bp.frequency.exponentialRampToValueAtTime(2500, t + 0.25)
  bp.frequency.exponentialRampToValueAtTime(600, t + 1.1)
  src(g, g.pink, t, t + 1.15, bp)
  boom(g, bus, t, 90, 40, 0.3, 0.6, 0.7)
  const roar = amp(g, bus)
  roar.gain.setValueAtTime(0.0001, t + 0.2)
  roar.gain.exponentialRampToValueAtTime(0.12, t + 0.6)
  roar.gain.setValueAtTime(0.12, end - 0.5)
  roar.gain.exponentialRampToValueAtTime(0.0001, end)
  src(g, g.brown, t + 0.2, end, filt(g, "lowpass", 700, 0.7, roar))
  for (let at = t + 0.15; at < end - 0.1; at += rnd(0.03, 0.16)) {
    burst(g, bus, g.white, at, "bandpass", rnd(1500, 6000), rnd(0.05, 0.3) * Math.min(1, (end - at) / 0.6), 0.0005, rnd(0.005, 0.03))
  }
  return { end: end + 0.1 }
}

/** The score counts up during reveal: ticks that climb until endsAt (default 1.2 s), then the total lands. */
const ticker: Recipe = (g, p) => {
  const t = p.t
  const end = Math.max(t + 0.4, p.endsAt ?? t + 1.2)
  const { bus } = out(g, p, { hall: 0.25 })
  for (let at = t; at < end; at += 0.045) {
    const n = amp(g, bus)
    hit(n.gain, at, 0.09, 0.001, 0.035)
    osc(g, "square", 700 * Math.pow(2, ((at - t) / (end - t)) * 1.25), at, at + 0.04, filt(g, "lowpass", 3000, 0.7, n))
  }
  partials(g, bus, end, 1760, GLASS, 0.8)
  return { end: end + 2 }
}

/** An 80s slide projector: the click, the carousel clack, a breath of motor. */
const shutter: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.2 })
  burst(g, bus, g.white, t, "bandpass", 3200, 0.5, 0.0005, 0.012)
  burst(g, bus, g.white, t + 0.07, "bandpass", 1400, 0.45, 0.0008, 0.03)
  const th = amp(g, bus)
  hit(th.gain, t + 0.07, 0.25, 0.002, 0.08)
  osc(g, "triangle", 180, t + 0.07, t + 0.16, th)
  const motor = amp(g, bus)
  hit(motor.gain, t + 0.02, 0.05, 0.03, 0.18)
  src(g, g.pink, t + 0.02, t + 0.25, filt(g, "bandpass", 900, 3, motor))
  return { end: t + 0.3 }
}

/** Someone grabs a seat: a wooden chair scraping on stone, then settling. */
const seat: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.3 })
  const sc = amp(g, bus)
  sc.gain.setValueAtTime(0, t)
  sc.gain.linearRampToValueAtTime(0.4, t + 0.04)
  sc.gain.setValueAtTime(0.4, t + 0.25)
  sc.gain.linearRampToValueAtTime(0, t + 0.34)
  const bp = filt(g, "bandpass", 700, 6, sc)
  bp.frequency.linearRampToValueAtTime(950, t + 0.34)
  const grit = amp(g, bp, 0.7)
  lfo(g, rnd(38, 52), 0.6, t, t + 0.36, grit.gain, "square") // stick-slip judder
  src(g, g.pink, t, t + 0.36, grit)
  const th = amp(g, bus)
  hit(th.gain, t + 0.34, 0.3, 0.002, 0.12)
  osc(g, "triangle", 150, t + 0.34, t + 0.48, th)
  return { end: t + 0.5 }
}

/** No room: two soft, muffled knocks. */
const full: Recipe = (g, p) => {
  const t = p.t
  const { bus } = out(g, p, { hall: 0.35 })
  for (const at of [t, t + 0.16]) {
    boom(g, bus, at, 200, 120, 0.04, 0.35, 0.12)
    burst(g, bus, g.white, at, "lowpass", 900, 0.15, 0.001, 0.03)
  }
  return { end: t + 0.35 }
}

const RECIPES: Record<SynthCue, Recipe> = {
  shutter, seat, full, intro, card, tap, lead, onfire, ticker, join, "round-start": roundStart, hide, tick, bell, hunting, reveal, sweep, caught, safe, possessed, crash, cleansed,
  whisper, static: staticBurst, revive, "finale-ghosts": finaleGhosts, "finale-hunters": finaleHunters,
}

/** Mix trims in dB, measured offline so every cue peaks near -2 dBFS (big hits) or sits lower (small ones)
 *  before the limiter. The one place the cue balance lives. */
const TRIM_DB: Record<SynthCue, number> = {
  shutter: 2, seat: 0, full: -4, intro: -7, card: 12, tap: 5, lead: -3, onfire: 0, ticker: 3,
  join: 4, "round-start": -7, hide: 1, tick: 5, bell: -4, hunting: -2, reveal: -6, sweep: -3.5, caught: -4, safe: 2,
  possessed: -9, crash: -4.5, cleansed: 2, whisper: 1, static: 4.5, revive: 2, "finale-ghosts": -10, "finale-hunters": -4.5,
}

export function playCueAt(g: Graph, cue: SynthCue, p: CueParams): CueHandle {
  outs = []
  const h = RECIPES[cue](g, { ...p, level: p.level * Math.pow(10, TRIM_DB[cue] / 20) })
  const mine = outs
  h.dispose = () => mine.forEach((n) => n.disconnect())
  return h
}

// ---------- the round's tension bed: one more layer per level (1..5), so the last beat feels like a final ----------

export interface Tension {
  set(level: number): void // 0 = off
}

export function tensionBed(g: Graph): Tension {
  const ctx = g.ctx
  const t0 = ctx.currentTime
  const bed = amp(g, g.beds, 0.1) // just above the house beds, under everything else
  const layers = [0, 1, 2, 3, 4].map(() => amp(g, bed, 0))
  const FULL = [0.4, 1.5, 0.14, 1, 0.16] // per-layer gain once it is in
  // 1: a bowed low D (saws through a breathing lowpass)
  const lp1 = filt(g, "lowpass", 260, 1, layers[0])
  lfo(g, 0.2, 60, t0, null, lp1.frequency)
  for (const [f, d] of [[73.42, -7], [73.42, 6], [110, 3]] as const) osc(g, "sawtooth", f, t0, null, lp1, d)
  // 2: a heartbeat, 4: a clock ticking eighths (both scheduled below)
  // 3: high tremolo strings a minor second apart
  const trem = amp(g, layers[2], 1)
  lfo(g, 7.5, 0.5, t0, null, trem.gain)
  const lp3 = filt(g, "lowpass", 2800, 0.7, trem)
  for (const f of [440, 466.16]) for (const d of [-5, 5]) osc(g, "sawtooth", f, t0, null, lp3, d)
  // 5: a ghost choir pad on D minor-major 7
  send(g, layers[4], g.hall, 0.6)
  const lp5 = filt(g, "lowpass", 1400, 0.7, layers[4])
  for (const f of [293.66, 349.23, 440, 554.37]) {
    const o = osc(g, "sawtooth", f, t0, null, lp5, rnd(-8, 8))
    lfo(g, rnd(4.6, 5.6), 8, t0, null, o.detune)
  }
  let level = 0
  let bpm = 60
  let next = t0
  let eighth = 0
  setInterval(() => {
    const now = ctx.currentTime
    if (level < 2) {
      next = now + 0.05
      return
    }
    while (next < now + 0.25) {
      if (eighth % 2 === 0) {
        boom(g, layers[1], next, 90, 45, 0.06, 0.8, 0.18) // lub
        boom(g, layers[1], next + 0.14, 80, 42, 0.06, 0.5, 0.15) // dub
      }
      if (level >= 4) burst(g, layers[3], g.white, next, "bandpass", eighth % 2 ? 2000 : 2600, 0.5, 0.0008, 0.02)
      next += 30 / bpm
      eighth++
    }
  }, 100)
  return {
    set(n) {
      level = Math.max(0, Math.min(5, Math.round(n)))
      bpm = [60, 60, 66, 76, 88, 104][level]
      const now = ctx.currentTime
      layers.forEach((l, i) => l.gain.setTargetAtTime(level > i ? FULL[i] : 0, now, 1.2))
      lp1.frequency.setTargetAtTime(220 + level * 70, now, 1.5) // the low string opens up as the round tightens
    },
  }
}

// ---------- story: a 30 s 80s synth score for the attract loop (Dm Bb Gm A, 96 bpm), looping until stopped ----------

export interface Story {
  set(on: boolean): void
}

export function storyScore(g: Graph): Story {
  const ctx = g.ctx
  const bus = amp(g, g.beds, 0)
  send(g, bus, g.hall, 0.5)
  const sixteenth = 60 / 96 / 4
  const CHORDS = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [98, 116.54, 146.83], [110, 138.59, 164.81]] // Dm Bb Gm A
  const arpLp = filt(g, "lowpass", 900, 4, amp(g, bus, 1))
  lfo(g, 1 / 15, 600, ctx.currentTime, null, arpLp.frequency) // the cutoff breathes once per 15 s
  let on = false
  let next = 0
  let step = 0
  setInterval(() => {
    if (!on) return
    const now = ctx.currentTime
    if (next < now) next = now + 0.05
    while (next < now + 0.3) {
      const bar = Math.floor(step / 16) % 12 // 12 bars of 2.5 s = 30 s
      const chord = CHORDS[Math.floor(bar / 3)]
      const i = step % 16
      const at = next
      // arpeggio: up and down the chord, octave above
      const f = chord[[0, 1, 2, 1][i % 4]] * (i >= 8 ? 4 : 2)
      const n = amp(g, arpLp)
      hit(n.gain, at, 0.09, 0.003, sixteenth * 1.6)
      osc(g, "sawtooth", f, at, at + sixteenth * 1.8, n, 4)
      osc(g, "square", f * 0.5, at, at + sixteenth * 1.8, amp(g, n, 0.4), -4)
      // bass: eighth-note pulse on the root
      if (i % 2 === 0) {
        const b = amp(g, filt(g, "lowpass", 380, 2, bus))
        hit(b.gain, at, 0.22, 0.005, sixteenth * 1.7)
        osc(g, "sawtooth", chord[0] / 2, at, at + sixteenth * 2, b)
      }
      // pad: a warm detuned chord at the start of each chord change
      if (i === 0 && bar % 3 === 0) {
        const pad = amp(g, filt(g, "lowpass", 1100, 0.7, bus))
        pad.gain.setValueAtTime(0, at)
        pad.gain.linearRampToValueAtTime(0.05, at + 1.2)
        pad.gain.setValueAtTime(0.05, at + 6.3)
        pad.gain.linearRampToValueAtTime(0, at + 7.6)
        for (const cf of chord) for (const d of [-9, 9]) osc(g, "sawtooth", cf, at, at + 7.7, pad, d)
      }
      next += sixteenth
      step++
    }
  }, 100)
  return {
    set(v) {
      if (v === on) return
      on = v
      bus.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, v ? 0.4 : 1)
      if (v) step = 0
    },
  }
}

// ---------- beds: the drone, the rain and the far thunder under everything ----------

export function startBeds(g: Graph): void {
  drone(g)
  rain(g)
  setTimeout(function roll() {
    thunder(g)
    setTimeout(roll, rnd(24_000, 55_000))
  }, rnd(9_000, 16_000))
}

function drone(g: Graph): void {
  const ctx = g.ctx
  const t = ctx.currentTime
  const out = amp(g, g.beds)
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(0.36, t + 5)
  const lp = filt(g, "lowpass", 340, 0.9, out)
  lfo(g, 0.043, 140, t, null, lp.frequency) // the house breathes
  const parts = [
    { f: 36.71, type: "sine", g: 0.07, det: [0] }, // D1 (felt, not heard: keep it small)
    { f: 73.42, type: "sawtooth", g: 0.075, det: [-9, 7] }, // D2
    { f: 110, type: "sawtooth", g: 0.06, det: [-6, 9] }, // A2
    { f: 146.83, type: "triangle", g: 0.09, det: [-4, 5] }, // D3
    { f: 174.61, type: "triangle", g: 0.06, det: [3] }, // F3: the third wanders
  ] as const
  const third: OscillatorNode[] = []
  const gains = parts.map((pt, i) => {
    const pg = amp(g, lp, pt.g)
    for (const d of pt.det) {
      const o = osc(g, pt.type, pt.f, t, null, pg, d)
      if (i === parts.length - 1) third.push(o)
    }
    return pg
  })
  // a far, wordless voice that surfaces now and then
  const ghost = amp(g, out)
  send(g, ghost, g.hall, 0.8)
  const ghostOsc = osc(g, "sine", 440, t, null, ghost)
  lfo(g, 4.8, 9, t, null, ghostOsc.detune)
  let ghostFree = t + 6
  // wind through the house
  const windPan = ctx.createStereoPanner()
  windPan.connect(g.beds)
  const wind = amp(g, windPan, 0.05)
  const windBp = filt(g, "bandpass", 500, 4, wind)
  src(g, g.pink, t, null, windBp)
  setInterval(() => {
    const now = ctx.currentTime
    gains.forEach((pg, i) => pg.gain.setTargetAtTime(parts[i].g * rnd(0.55, 1.35), now, 3))
    lp.frequency.setTargetAtTime(rnd(240, 520), now, 4)
    if (Math.random() < 0.25) {
      const f = pick([174.61, 174.61, 155.56, 196])
      third.forEach((o) => o.frequency.setTargetAtTime(f, now, 2.5))
    }
    if (now > ghostFree && Math.random() < 0.3) {
      ghostOsc.frequency.setValueAtTime(pick([440, 523.25, 587.33, 698.46]), now)
      ghost.gain.setTargetAtTime(0.03, now, 1.2)
      ghost.gain.setTargetAtTime(0, now + 3.5, 1.4)
      ghostFree = now + 10
    }
    windBp.frequency.setTargetAtTime(rnd(260, 950), now, 2.2)
    wind.gain.setTargetAtTime(rnd(0.02, 0.09), now, 2.5)
    windPan.pan.setTargetAtTime(rnd(-0.7, 0.7), now, 3)
  }, 4500)
}

function rain(g: Graph): void {
  const ctx = g.ctx
  const t = ctx.currentTime
  const out = amp(g, g.beds)
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(0.62, t + 4)
  const wash = amp(g, out, 0.24)
  src(g, g.pink, t, null, filt(g, "highpass", 450, 0.5, filt(g, "lowpass", 6500, 0.5, wash)))
  // two drop layers at different speeds, so the loop never repeats audibly
  const drops = dropsBuffer(ctx, 7.3)
  const patter = filt(g, "bandpass", 3000, 0.45, amp(g, out, 0.46))
  src(g, drops, t, null, patter, 1)
  src(g, drops, t, null, patter, 0.81)
  const roof = amp(g, out, 0.09)
  src(g, g.brown, t, null, filt(g, "bandpass", 210, 0.8, roof)) // rain drumming on slate, no sub
  setInterval(() => {
    const now = ctx.currentTime
    wash.gain.setTargetAtTime(rnd(0.21, 0.27), now, 3) // the rain shifts, it never thins out
    roof.gain.setTargetAtTime(rnd(0.08, 0.11), now, 3)
  }, 5200)
}

function thunder(g: Graph): void {
  const ctx = g.ctx
  const t = ctx.currentTime + 0.05
  const dur = rnd(5.5, 8.5)
  const pn = ctx.createStereoPanner()
  pn.pan.value = rnd(-0.6, 0.6)
  pn.connect(g.beds)
  send(g, pn, g.cathedral, 0.35)
  const env = amp(g, pn)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(rnd(0.4, 0.6), t + rnd(0.5, 1.1))
  env.gain.exponentialRampToValueAtTime(rnd(0.15, 0.25), t + 2)
  env.gain.exponentialRampToValueAtTime(rnd(0.3, 0.45), t + 2.6)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const lp = filt(g, "lowpass", 600, 0.7, env)
  lp.frequency.setValueAtTime(rnd(500, 800), t)
  lp.frequency.exponentialRampToValueAtTime(90, t + dur)
  src(g, g.brown, t, t + dur + 0.1, lp)
  setTimeout(() => pn.disconnect(), (dur + 0.5) * 1000)
}

/** Sparse rain drops: soft ticks and the odd plink, wrapped so the buffer loops seamlessly. */
function dropsBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(seconds * rate)
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let k = 0; k < seconds * 260; k++) {
      const start = Math.floor(Math.random() * len)
      const a = Math.pow(Math.random(), 2.2) * 0.9
      const n = Math.floor(rate * rnd(0.0015, 0.0065))
      const plink = Math.random() < 0.18
      const f = rnd(1800, 6300)
      for (let i = 0; i < n; i++) {
        const e = Math.exp(-i / (n * 0.25))
        d[(start + i) % len] += a * e * (plink ? Math.sin((2 * Math.PI * f * i) / rate) : Math.random() * 2 - 1)
      }
    }
  }
  return buf
}
