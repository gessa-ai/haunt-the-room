#!/usr/bin/env bun
// L10b: render ONE sample line per hunter -> web/public/audio/voices/sample-<hunter>.mp3 (owner hears before live calls).
import { HUNTERS, type HunterId } from "../contract/protocol"
import { cast, CABAL_MODEL, cabalSpeak } from "./cabal-cast"

const SAMPLES: Record<HunterId, string> = {
  exorcist: "Crypt. Eleven of them. I want to be home by eleven.",
  medium: "Kyle whispered to me, darling. They are all in the attic. I trust him.",
  skeptic: "Kyle lied to you in beat one. I have it written down.",
  priest: "The chapel. Follow my voice. It is, after all, magnificent.",
}
const OUT = new URL("../web/public/audio/voices/", import.meta.url).pathname
for (const h of HUNTERS) {
  const t0 = performance.now()
  const r = await cabalSpeak(h.id, SAMPLES[h.id])
  const buf = await r.arrayBuffer()
  await Bun.write(`${OUT}sample-${h.id}.mp3`, buf)
  console.log(`${h.id}: ${cast()[h.id].name} ${CABAL_MODEL} ${buf.byteLength} B in ${Math.round(performance.now() - t0)} ms`)
}
