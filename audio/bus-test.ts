#!/usr/bin/env bun
// L10b offline check of the one voice bus (web/src/audio/voices.ts): 5 overlapping 0.7 s lines -> play order, never two at once.
const log: string[] = []
;(globalThis as any).__voiceBusLog = log
;(globalThis as any).fetch = async () => ({ ok: false, status: 404 }) // no index: only live lines in this test
const t0 = performance.now()
let sounding = 0, maxSounding = 0
const param = () => ({ value: 1, setTargetAtTime() {} })
const node = () => ({ gain: param(), pan: param(), connect() {}, disconnect() {} })
const ctx: any = {
  get currentTime() { return (performance.now() - t0) / 1000 },
  createGain: node, createStereoPanner: node,
  createBufferSource() {
    const src: any = { connect() {}, disconnect() {},
      start() { sounding++; maxSounding = Math.max(maxSounding, sounding); src.timer = setTimeout(() => src.fire(), src.buffer.duration * 1000) },
      stop() { clearTimeout(src.timer); setTimeout(() => src.fire(), 120) },
      fire() { if (src.done) return; src.done = true; sounding--; src.onended?.() } }
    return src
  },
}
const g: any = { ctx, voice: node(), hall: node(), bedDuck: node(), sfxDuck: node() }
const { createVoices } = await import("../web/src/audio/voices.ts")
const v = createVoices(g)
const buf = { duration: 0.7 } as AudioBuffer
const at = (ms: number, who: string) => setTimeout(() => { log.push(`ask ${who} @${Math.round(performance.now() - t0)}`); v.line(who, buf) }, ms)
at(0, "exorcist"); at(100, "medium"); at(200, "skeptic"); at(300, "announcer"); at(2500, "priest")
await Bun.sleep(3600)
console.log(log.join("\n"))
const order = log.filter((l) => l.startsWith("play") || l.startsWith("drop")).join(", ")
const want = "play exorcist, play medium, play skeptic, drop announcer, play priest"
console.log(`max voices at once: ${maxSounding}\norder: ${order}\n${order === want && maxSounding === 1 ? "PASS" : "FAIL (want " + want + ")"}`)
process.exit(order === want && maxSounding === 1 ? 0 : 1)
