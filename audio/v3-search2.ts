import { elevenKey } from "./cabal-cast"
const k = elevenKey()
const Q: Record<string, string[]> = { medium: ["psychic", "fortune teller", "theatrical", "dramatic", "witch", "breathy"], priest: ["pompous", "vicar", "priest", "baritone", "aristocrat", "posh"] }
for (const [h, terms] of Object.entries(Q)) {
  const seen = new Map<string, any>()
  await Promise.all(terms.map(async (t) => {
    const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=15&search=${encodeURIComponent(t)}&gender=${h === "medium" ? "female" : "male"}`, { headers: { "xi-api-key": k } })
    if (!r.ok) return console.warn(h, t, r.status)
    for (const v of ((await r.json()) as any).voices ?? []) if (v.category !== "premade" && (v.language ?? "en") === "en") seen.set(v.voice_id, v)
  }))
  console.log(`\n## ${h}`)
  for (const v of [...seen.values()].sort((a, b) => b.cloned_by_count - a.cloned_by_count).slice(0, 12)) console.log(`${v.voice_id} ${v.public_owner_id} n=${v.cloned_by_count} ${v.age}/${v.accent} | ${v.name.slice(0, 40)} | ${(v.description ?? "").replace(/\s+/g, " ").slice(0, 100)}`)
}
