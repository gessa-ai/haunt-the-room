// L11: propose the video edit (demo/cut.txt) from what the logs say happened and when.
//   bun demo/cut.ts
// Inputs: demo/raw/clips.jsonl (record.sh: file + start time), demo/raw/beats.jsonl (numbers.ts: House events with
// absolute times), optional phone footage in demo/raw/phone/ (start time from its creation_time metadata).
// Each beat is taken from the LATEST recording that fully covers it (rehearsal beats practice). Edit cut.txt by
// hand if a moment looks wrong, then run demo/assemble.sh.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DIR = import.meta.dir
const RAW = join(DIR, "raw")
const lines = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [])
const duration = (file: string): number =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) || 0

interface Clip { file: string; startMs: number; endMs: number; kind: "stage" | "phone" }
const clips: Clip[] = []
for (const c of lines(join(RAW, "clips.jsonl")) as { file: string; startMs: number }[]) {
  const path = join(RAW, c.file)
  if (!existsSync(path)) continue
  clips.push({ file: `raw/${c.file}`, startMs: c.startMs, endMs: c.startMs + duration(path) * 1000, kind: "stage" })
}
const PHONE = join(RAW, "phone")
for (const f of existsSync(PHONE) ? readdirSync(PHONE).filter(f => /\.(mov|mp4|m4v)$/i.test(f)) : []) {
  const path = join(PHONE, f)
  const created = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags=creation_time", "-of", "csv=p=0", path]).toString().trim()
  const startMs = Date.parse(created)
  if (!Number.isFinite(startMs)) {
    console.warn(`cut: ${f} has no creation_time; place it in cut.txt by hand`)
    continue
  }
  clips.push({ file: `raw/phone/${f}`, startMs, endMs: startMs + duration(path) * 1000, kind: "phone" })
}
if (!clips.length) throw new Error("cut: no recordings in demo/raw (run demo/record.sh during the rounds)")

type Beat = { at: number; kind: string; phase?: string; winner?: string | null; ms?: number }
const beats = (lines(join(RAW, "beats.jsonl")) as Beat[]).sort((a, b) => a.at - b.at)

/** The latest moment matching `pick` whose [at+from, at+to] window a recording of `kind` fully covers. */
function find(pick: (b: Beat) => boolean, from: number, to: number, kind: Clip["kind"] = "stage"): { clip: Clip; at: number } | null {
  for (const b of [...beats].reverse()) {
    if (!pick(b)) continue
    const clip = clips
      .filter(c => c.kind === kind && c.startMs <= b.at + from * 1000 && c.endMs >= b.at + to * 1000)
      .sort((x, y) => y.startMs - x.startMs)[0]
    if (clip) return { clip, at: b.at }
  }
  return null
}
const seg = (hit: { clip: Clip; at: number } | null, from: number, to: number, note: string): string =>
  hit
    ? `clip ${hit.clip.file} ${((hit.at - hit.clip.startMs) / 1000 + from).toFixed(2)} ${(to - from).toFixed(2)}   # ${note} @ ${new Date(hit.at).toLocaleTimeString()}`
    : `# MISSING: ${note} (no recording covers it; record a round or place it by hand)`

const started = (b: Beat) => b.kind === "phase-seen" && (b.phase === "intro" || b.phase === "hunt")
const hide = (b: Beat) => b.kind === "phase-seen" && (b.phase === "hide" || b.phase === "hunt")
const finale = (b: Beat) => b.kind === "phase-seen" && b.phase === "finale"
const killBack = (b: Beat) => b.kind === "house-back" && (b.ms ?? 0) >= 100 // window: 8 s before the revive (covers the kill and a slow outage) to 6 s after

const out = [
  "# demo/cut.txt: one segment per line, played in order. Edit freely, then: demo/assemble.sh",
  "#   card <name> <seconds>                       (demo/build/cards/<name>.png, from bun demo/cards.ts)",
  "#   clip <file> <start seconds> <length seconds>   (file relative to demo/)",
  "card open 3.5",
  seg(find(started, -9, 2), -9, 2, "the room joining, wisps pouring in, round starts"),
  seg(find(started, -5, 3, "phone"), -5, 3, "phones out (room, phone footage)"),
  "card hide 2.5",
  seg(find(hide, -0.5, 13.5), -0.5, 13.5, "a full beat: hide, hunters argue and vote, reveal"),
  "card lie 2.5",
  seg(find(b => b.kind === "lie", -10, 4), -10, 4, "a lure that worked: DM on the feed, empty-room sweep, 'a lie took hold'"),
  "card kill 2.5",
  seg(find(killBack, -8, 6), -8, 6, "kill -9, static, '...but the dead remember'"),
  seg(find(b => finale(b) && b.winner === "ghosts", -2, 8) ?? find(finale, -2, 8), -2, 8, "finale flood"),
  seg(find(finale, -1, 4, "phone"), -1, 4, "the room going red (phone footage)"),
  "card close 5",
]
writeFileSync(join(DIR, "cut.txt"), out.join("\n") + "\n")
console.log(out.join("\n"))
