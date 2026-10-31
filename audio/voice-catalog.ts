#!/usr/bin/env bun
// L10b: web/public/voices.html = every account voice with its FREE preview_url (no TTS credits), our 4 samples,
// and recommended candidates per hunter + announcer. Key used only here, server-side; never written to the page.
import { cast, elevenKey } from "./cabal-cast"
import { dialogueSection, PAGE_CSS, PLAYER_JS } from "./dialogue-page"

const r = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers: { "xi-api-key": elevenKey() } })
if (!r.ok) throw new Error(`GET /v2/voices HTTP ${r.status}`)
const voices = ((await r.json()) as { voices: any[] }).voices.map((v) => ({
  id: v.voice_id as string, name: v.name as string, url: (v.preview_url ?? "") as string, category: v.category as string,
  gender: v.labels?.gender ?? "unknown", accent: v.labels?.accent ?? "unknown", age: v.labels?.age ?? "", desc: [v.labels?.descriptive, v.labels?.use_case, v.labels?.language].filter(Boolean).join(" · "),
}))
const PICKS: Record<string, { label: string; want: string; ids: string[] }> = {
  exorcist: { label: "The Exorcist", want: "tired gravel, overtime pro", ids: ["N2lVS1w4EtoT3dr4eOWO", "pqHfZKP75CvOlQylNhV4", "6sFKzaJr574YWVu4UuJF"] }, // Callum, Bill, Cornelius
  medium: { label: "The Medium", want: "breathy, eager, theatrical", ids: ["pFZP5JQG7iQjIQuC4Bku", "FGY2WhTYpPnrIDTdsKH5", "cgSgspJ2msm6clMCkdW9"] }, // Lily, Laura, Jessica
  skeptic: { label: "The Skeptic", want: "dry, nasal, deadpan", ids: ["onwK4e9ZLuTAKqWW03F9", "cjVigY5qzO86Huf0OWal", "SAz9YHcvj6GT2YYXdXww"] }, // Daniel, Eric, River
  priest: { label: "The Priest", want: "booming, vain, operatic", ids: ["nPczCjzI2devNBz1zQrb", "JBFqnCBsd6RMkjVDRZzb", "pNInz6obpgDQGcFmaJgB"] }, // Brian, George, Adam
  announcer: { label: "The Announcer", want: "esports caster: deep, punchy, ominous", ids: ["pNInz6obpgDQGcFmaJgB", "IKne3meq5aSn9XLyUdCD", "SOYHLrjzK2X1ezoPC6cr"] }, // Adam, Charlie, Harry
}
const byId = new Map(voices.map((v) => [v.id, v]))
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" } as any)[c]};`)
const card = (v: (typeof voices)[number], tag = "") => `<div class="v"><button data-src="${esc(v.url)}" ${v.url ? "" : "disabled"}>&#9654;</button><div><b>${esc(v.name)}</b>${tag}<small>${esc([v.gender, v.age, v.accent, v.desc, v.category].filter(Boolean).join(" · "))}</small><code>${v.id}</code></div></div>`
let html = dialogueSection("/audio/voice/", "/audio/dialogue/")
const v3 = (await Bun.file(new URL("./v3-candidates.json", import.meta.url).pathname).json().catch(() => ({}))) as Record<string, any[]>
if (Object.keys(v3).length) {
  html += `<h2 style="color:#777">v3 candidates (owner picked #2 for every role) (eleven_v3, audio tags, library voices; pick one per role)</h2>`
  for (const [role, cs] of Object.entries(v3)) {
    html += `<h3>${PICKS[role]?.label ?? role} <em>${esc(PICKS[role]?.want ?? "")} · "${esc(cs.find(Boolean)?.line ?? "")}"</em></h3><div class="grid">` +
      cs.filter(Boolean).map((c) => `<div class="v cur"><button data-src="${c.file}">&#9654;</button><div><b>${role} ${c.n}: ${esc(c.name)}</b><small>${esc(c.labels)} · used ${c.uses} · ${esc(c.desc)}</small><code>${c.voice_id}</code></div></div>`).join("") + `</div>`
  }
  html += `<h2 style="color:#777">Older: flash v2.5 premade samples (rejected)</h2>`
}
html += `<h3>Current samples (rendered, flash v2.5)</h3><div class="grid">` + Object.entries(cast()).filter(([h]) => h !== "_" && h !== "announcer").map(([h, c]) =>
  `<div class="v cur"><button data-src="/audio/voices/sample-${h}.mp3">&#9654;</button><div><b>${PICKS[h].label}</b><small>${esc(c.name)} · stability ${c.stability} · style ${c.style} · speed ${c.speed}</small></div></div>`).join("") + `</div>`
html += `<h2>Recommended candidates (free previews; ★ = current)</h2>`
for (const [h, p] of Object.entries(PICKS)) {
  html += `<h3>${p.label} <em>${esc(p.want)}</em></h3><div class="grid">` + p.ids.map((id, i) => byId.get(id) ? card(byId.get(id)!, h !== "announcer" && i === 0 ? ' <span class="star">★ current</span>' : ` <span class="rec">pick ${i + 1}</span>`) : "").join("") + `</div>`
}
html += `<h2>Every voice in the account (${voices.length})</h2>`
const groups = new Map<string, typeof voices>()
for (const v of voices) { const k = `${v.gender} · ${v.accent}`; groups.set(k, [...(groups.get(k) ?? []), v]) }
for (const [k, vs] of [...groups].sort()) html += `<h3>${esc(k)}</h3><div class="grid">${vs.map((v) => card(v)).join("")}</div>`
await Bun.write(new URL("../web/public/voices.html", import.meta.url).pathname, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hunter Voices</title><style>${PAGE_CSS}</style></head><body>
<h1>Hunter voices</h1><p style="color:#aaa">Previews are ElevenLabs' free voice demos (no credits). Tell the conductor: hunter = voice name. Nothing new renders until you pick.</p>${html}
${PLAYER_JS}</body></html>`)
console.log(`voices.html: ${voices.length} voices, ${voices.filter((v) => v.url).length} with previews`)
