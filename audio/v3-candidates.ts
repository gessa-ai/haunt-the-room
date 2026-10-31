#!/usr/bin/env bun
// L10b: add 3 shared-library voices per role to the account and render one eleven_v3 line each (audio tags)
// -> web/public/audio/voices/v3-<role>-<n>.mp3 + v3-candidates.json (read by voice-catalog.ts).
import { elevenKey } from "./cabal-cast"
const k = elevenKey()
const LINES: Record<string, string> = {
  exorcist: "[sighs] she picked you. out of four. [tired] can we just do the crypt and go home.",
  medium: "kyle says the crypt. [whispers] kyle has an honest little face.",
  skeptic: "board says the attic is empty. [scoffs] so they're in the attic.",
  priest: "[clears throat] the chapel. follow my voice. [proudly] it is, after all, magnificent.",
  announcer: "four hunters. one lie. [dramatic pause] the medium... believes you.",
}
const PICK: Record<string, string[]> = {
  exorcist: ["1BfrkuYXmEwp8AWqSLWk", "Q4oILuo4P8VeXtE6FMLI", "q1h5HGdnfVxp4TXTJRNN"],
  medium: ["DUhzmIGFwXJ752SvgcCj", "0WKkG7JmcKK7MkwhnMIe", "sssn4wp3AspuK2kvy3Ym"],
  skeptic: ["aWSwMfJOK8iYZivczje6", "lCfIptVKzlPoj4vLmTLz", "RIxlkEgVTlW2XuYWyYjL"],
  priest: ["NXaTw4ifg0LAguvKuIwZ", "a4BsmeT8RITKlxlCY9PO", "b1A9OAVD1Yu0SjoFdv4A"],
  announcer: ["YOq2y2Up4RgXP2HyXjE5", "6F5Zhi321D3Oq7v1oNT4", "zfWx5IjUaWGWTId9hv9t"],
}
const api = (p: string, init: RequestInit = {}) => fetch(`https://api.elevenlabs.io${p}`, { ...init, headers: { "xi-api-key": k, "content-type": "application/json" } })
async function lib(id: string): Promise<any> {
  const r = await api(`/v1/shared-voices?page_size=5&search=${id}`)
  const v = ((await r.json()) as any).voices?.find((x: any) => x.voice_id === id)
  if (v) return v
  throw new Error(`shared voice ${id} not found`)
}
const OUT = new URL("../web/public/audio/voices/", import.meta.url).pathname
const out: Record<string, any[]> = {}
let chars = 0
for (const [role, ids] of Object.entries(PICK)) {
  out[role] = []
  await Promise.all(ids.map(async (sid, i) => {
    try {
      const v = await lib(sid)
      const add = await api(`/v1/voices/add/${v.public_owner_id}/${sid}`, { method: "POST", body: JSON.stringify({ new_name: `Haunt ${role} ${i + 1} ${v.name.split(" - ")[0]}` }) })
      const added = add.ok ? ((await add.json()) as any).voice_id : null
      if (!added) throw new Error(`add HTTP ${add.status} ${(await add.text()).slice(0, 160)}`)
      const tts = await api(`/v1/text-to-speech/${added}?output_format=mp3_44100_128`, { method: "POST", body: JSON.stringify({ text: LINES[role], model_id: "eleven_v3", voice_settings: { stability: 0.5, similarity_boost: 0.8 } }) })
      if (!tts.ok) throw new Error(`tts HTTP ${tts.status} ${(await tts.text()).slice(0, 160)}`)
      await Bun.write(`${OUT}v3-${role}-${i + 1}.mp3`, await tts.arrayBuffer())
      chars += LINES[role].length
      out[role][i] = { n: i + 1, voice_id: added, name: v.name, desc: (v.description ?? "").slice(0, 160), labels: [v.gender, v.age, v.accent].join(" · "), uses: v.cloned_by_count, line: LINES[role], file: `/audio/voices/v3-${role}-${i + 1}.mp3` }
      console.log(`${role} ${i + 1}: ${v.name}`)
    } catch (e) {
      console.error(`${role} ${i + 1} ${sid}: ${(e as Error).message}`)
    }
  }))
}
await Bun.write(new URL("./v3-candidates.json", import.meta.url).pathname, JSON.stringify(out, null, 1))
console.log(`chars ${chars}`)
