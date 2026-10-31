// L11b: transcribe a VO file with ElevenLabs Scribe to check that audio tags were not read aloud.
//   node demo/video/stt.mjs <file.mp3>
import fs from "node:fs"
import path from "node:path"
const env = Object.fromEntries(fs.readFileSync(path.resolve(import.meta.dirname, "../../.env"), "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
for (const f of process.argv.slice(2)) {
  const fd = new FormData()
  fd.append("model_id", "scribe_v1")
  fd.append("file", new Blob([fs.readFileSync(f)]), path.basename(f))
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: fd })
  const j = await r.json()
  console.log(path.basename(f), r.status, JSON.stringify(j.text ?? j).slice(0, 300))
}
