// The one mixer every sound flows through (L10). Built on any BaseAudioContext, so the live stage and an
// offline render share the same chain:
//   beds (drone + rain) -> bedMute -> bedDuck -> world
//   cues -> sfx -> sfxDuck -> world          per-cue sends -> hall / cathedral reverbs -> sfxDuck
//   voices -> voice EQ -> world               (beds and cues duck under voices)
//   world -> limiter -> master -> speakers   the kill's static bypasses world through `direct`

export interface Graph {
  ctx: BaseAudioContext
  master: GainNode // final volume (setMaster)
  world: GainNode // everything but the static burst; the kill cuts it
  direct: GainNode // bypasses world (the static itself)
  beds: GainNode
  bedMute: GainNode // the house died: beds silent until revive
  bedDuck: GainNode
  sfx: GainNode
  sfxDuck: GainNode
  voice: GainNode
  hall: GainNode // send input, ~2.8 s room
  cathedral: GainNode // send input, ~6.5 s stone tail
  analyser: AnalyserNode
  white: AudioBuffer
  pink: AudioBuffer
  brown: AudioBuffer
}

export function buildGraph(ctx: BaseAudioContext): Graph {
  const gain = (v: number, to?: AudioNode) => {
    const n = ctx.createGain()
    n.gain.value = v
    if (to) n.connect(to)
    return n
  }
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 5
  limiter.ratio.value = 8
  limiter.attack.value = 0.002
  limiter.release.value = 0.22
  const master = gain(0.9, ctx.destination)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  limiter.connect(master)
  master.connect(analyser)

  const world = gain(1, limiter)
  const direct = gain(1, limiter)
  const bedDuck = gain(1, world)
  const bedMute = gain(1, bedDuck)
  const beds = gain(1, bedMute)
  const sfxDuck = gain(1, world)
  const sfx = gain(1, sfxDuck)

  // Voices: rumble out, a little presence so lines cut through rain and crowd noise.
  const voiceHp = ctx.createBiquadFilter()
  voiceHp.type = "highpass"
  voiceHp.frequency.value = 95
  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 3000
  presence.Q.value = 0.9
  presence.gain.value = 3
  voiceHp.connect(presence)
  presence.connect(world)
  const voice = gain(1.1, voiceHp)

  const hall = gain(1)
  const hallVerb = ctx.createConvolver()
  hallVerb.buffer = impulse(ctx, 2.8, 0.55)
  hall.connect(hallVerb)
  hallVerb.connect(gain(0.55, sfxDuck))
  const cathedral = gain(1)
  const cathVerb = ctx.createConvolver()
  cathVerb.buffer = impulse(ctx, 6.5, 0.4)
  cathedral.connect(cathVerb)
  cathVerb.connect(gain(0.6, sfxDuck))

  return {
    ctx, master, world, direct, beds, bedMute, bedDuck, sfx, sfxDuck, voice, hall, cathedral, analyser,
    white: noise(ctx, 4, "white"),
    pink: noise(ctx, 6, "pink"),
    brown: noise(ctx, 6, "brown"),
  }
}

/** Beds and cues step back while a hunter talks; they return gently after the last line ends. */
export function duck(g: Graph, on: boolean): void {
  const t = g.ctx.currentTime
  // beds dip ~7 dB, never out: the rain stays audible under a line and recovers slowly enough not to pump
  g.bedDuck.gain.setTargetAtTime(on ? 0.45 : 1, on ? t : t + 0.25, on ? 0.12 : 0.9)
  g.sfxDuck.gain.setTargetAtTime(on ? 0.72 : 1, on ? t : t + 0.15, on ? 0.06 : 0.45)
}

/** Output RMS of the master in dBFS (for meters). */
export function level(g: Graph, scratch: Float32Array<ArrayBuffer>): number {
  g.analyser.getFloatTimeDomainData(scratch)
  let sum = 0
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i]
  return 10 * Math.log10(sum / scratch.length + 1e-12)
}

/** Stereo reverb impulse: pre-delay, early taps, then a noise tail whose highs die first (stone, not tin). */
function impulse(ctx: BaseAudioContext, seconds: number, brightness: number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(seconds * rate)
  const buf = ctx.createBuffer(2, len, rate)
  const pre = Math.floor(0.018 * rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate
      const a = brightness * Math.exp(-t * 1.6) + 0.035 // one-pole coefficient: bright early, dark late
      lp += a * (Math.random() * 2 - 1 - lp)
      const norm = Math.sqrt((2 - a) / a) // keep loudness while the filter darkens
      const env = Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.006)
      d[i] = lp * norm * env
    }
    for (let k = 0; k < 10; k++) {
      const i = pre + Math.floor(Math.random() * 0.09 * rate)
      d[i] += (Math.random() * 2 - 1) * 0.6 * (1 - k / 10)
    }
  }
  return buf
}

/** Seamless looping stereo noise (white, pink or brown), decorrelated per channel. The seam is a 0.4 s
 *  equal-power crossfade of the tail into the head, so loop=true never dips (a linear fade of uncorrelated
 *  noise sags 3 dB at the seam, heard as the rain "fading before it loops"). */
export function noise(ctx: BaseAudioContext, seconds: number, color: "white" | "pink" | "brown"): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(seconds * rate)
  const fade = Math.floor(0.4 * rate)
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const raw = new Float32Array(len + fade)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1
      if (color === "white") raw[i] = w * 0.5
      else if (color === "pink") {
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        raw[i] = last * 3.5
      }
    }
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = raw[i]
    for (let i = 0; i < fade; i++) {
      const x = (i / fade) * (Math.PI / 2)
      d[i] = raw[i] * Math.sin(x) + raw[len + i] * Math.cos(x) // loop seam: equal power, the end flows into the start
    }
  }
  return buf
}
