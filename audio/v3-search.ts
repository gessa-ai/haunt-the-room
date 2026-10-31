import { elevenKey } from "./cabal-cast"
const k = elevenKey()
const Q: Record<string, string[]> = {
  exorcist: ["gravelly tired", "raspy old man", "weary detective", "gravelly"],
  medium: ["theatrical psychic", "breathy dramatic woman", "eccentric fortune teller", "mystical woman"],
  skeptic: ["deadpan nasal", "dry sarcastic", "nerdy nasal", "deadpan"],
  priest: ["booming preacher", "pompous baritone", "southern preacher", "operatic"],
  announcer: ["esports announcer", "epic announcer", "arena announcer", "trailer narrator"],
}
const out: Record<string, any[]> = {}
for (const [h, terms] of Object.entries(Q)) {
  const seen = new Map<string, any>()
  await Promise.all(terms.map(async (t) => {
    const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=20&language=en&search=${encodeURIComponent(t)}&sort=cloned_by_count`, { headers: { "xi-api-key": k } })
    if (!r.ok) return console.warn(h, t, r.status)
    for (const v of ((await r.json()) as any).voices ?? []) if (v.category !== "premade") seen.set(v.voice_id, { ...v, term: t })
  }))
  out[h] = [...seen.values()].sort((a, b) => (b.cloned_by_count ?? 0) - (a.cloned_by_count ?? 0)).slice(0, 10)
  console.log(`\n## ${h}`)
  for (const v of out[h]) console.log(`${v.voice_id} ${v.public_owner_id.slice(0, 8)} n=${v.cloned_by_count} ${v.gender}/${v.age}/${v.accent} | ${v.name.slice(0, 40)} | ${(v.description ?? "").replace(/\s+/g, " ").slice(0, 110)}`)
}
await Bun.write(new URL("./v3-search.json", import.meta.url).pathname, JSON.stringify(out))
