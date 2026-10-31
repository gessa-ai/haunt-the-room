// L11: the video's title cards, 1920x1080 PNG, in the stage's own fonts (Pirata One, IM FELL English, Cinzel).
//   bun demo/cards.ts            -> demo/build/cards/{open,hide,lie,kill,finale,close}.png
// The close card's numbers come from demo/raw/numbers.json (+ live /api/stats). The fonts ship as .woff in
// web/node_modules/@fontsource; Pango cannot read woff, so fontTools converts them to .ttf in demo/build/fonts
// once, and rsvg-convert renders through fontconfig (PANGOCAIRO_BACKEND=fc) pointed at that folder.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DIR = import.meta.dir
const BUILD = join(DIR, "build")
const FONTS = join(BUILD, "fonts")
const OUT = join(BUILD, "cards")
const FS = join(DIR, "..", "web", "node_modules", "@fontsource")
mkdirSync(FONTS, { recursive: true })
mkdirSync(OUT, { recursive: true })

const WOFF = [
  "pirata-one/files/pirata-one-latin-400-normal.woff",
  "cinzel/files/cinzel-latin-700-normal.woff",
  "im-fell-english/files/im-fell-english-latin-400-normal.woff",
  "im-fell-english/files/im-fell-english-latin-400-italic.woff",
]
const missing = WOFF.filter(f => !existsSync(join(FONTS, f.split("/").pop()!.replace(".woff", ".ttf"))))
if (missing.length) {
  const py = "import sys\nfrom fontTools.ttLib import TTFont\nfor p in sys.argv[2:]:\n f=TTFont(p); f.flavor=None; f.save(sys.argv[1]+'/'+p.rsplit('/',1)[1][:-5]+'.ttf')"
  execFileSync("python3", ["-I", "-c", py, FONTS, ...missing.map(f => join(FS, f))], { stdio: "inherit" })
}
const CONF = join(BUILD, "fonts.conf")
writeFileSync(
  CONF,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/opt/homebrew/etc/fonts/fonts.conf</include><dir>${FONTS}</dir><cachedir>${join(BUILD, "fc-cache")}</cachedir></fontconfig>`,
)

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
type Line = { text: string; font: "title" | "body" | "caps" | "mono"; size: number; color: string; y: number }

function card(name: string, bg: [string, string], lines: Line[]): void {
  const family = { title: `font-family="Pirata One"`, body: `font-family="IM FELL English" font-style="italic"`, caps: `font-family="Cinzel" font-weight="700" letter-spacing="10"`, mono: `font-family="Menlo" font-weight="700"` }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
<defs><radialGradient id="g" cx="50%" cy="46%" r="78%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
<filter id="glow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="1920" height="1080" fill="url(#g)"/>
${lines.map(l => `<text x="960" y="${l.y}" text-anchor="middle" ${family[l.font]} font-size="${l.size}" fill="${l.color}"${l.font === "title" ? ` filter="url(#glow)"` : ""}>${esc(l.text)}</text>`).join("\n")}
</svg>`
  const svgPath = join(OUT, `${name}.svg`)
  writeFileSync(svgPath, svg)
  execFileSync("rsvg-convert", ["-w", "1920", "-h", "1080", svgPath, "-o", join(OUT, `${name}.png`)], {
    env: { ...process.env, PANGOCAIRO_BACKEND: "fc", FONTCONFIG_FILE: CONF },
  })
  console.log(`card ${name}.png`)
}

// ---- numbers for the close ----
type Counters = { joinedToday: number; rounds: number; online: number }
const summary = existsSync(join(DIR, "raw", "numbers.json")) ? JSON.parse(readFileSync(join(DIR, "raw", "numbers.json"), "utf8")) : null
const live = (await fetch("http://127.0.0.1:3300/api/stats").then(r => (r.ok ? r.json() : null)).catch(() => null)) as Counters | null
const outages: { ms: number }[] = (summary?.outages ?? []).filter((o: { ms: number }) => o.ms >= 100)
// People: only a count of real phones (bots and QA synthetic phones excluded), passed by hand: --people <n>.
// The House's joinedToday excludes bots but includes QA's synthetic crowd, so it is never shown as people.
const people = process.argv.includes("--people") ? Number(process.argv[process.argv.indexOf("--people") + 1]) : NaN
void live
const stats = [
  Number.isFinite(people) ? `${people} people played this afternoon` : null,
  summary ? `${summary.relay.messages} messages between AI agents over Relay` : null,
  outages.length ? `kill -9 the game process: back in ${(outages[outages.length - 1].ms / 1000).toFixed(2)} s` : null,
].filter(Boolean) as string[]
if (stats.length < 3) console.warn(`cards: close card has ${stats.length}/3 numbers (--people <real phones>; numbers.ts running?)`)

const PURPLE: [string, string] = ["#2a1630", "#05030a"]
card("open", PURPLE, [
  { text: "You are the ghosts.", font: "title", size: 140, color: "#e8e8ff", y: 450 },
  { text: "They are AI. Lie to them.", font: "body", size: 72, color: "#b18cff", y: 600 },
  { text: "PHONES OUT", font: "caps", size: 44, color: "#ffd27a", y: 760 },
])
card("hide", PURPLE, [
  { text: "Hide. Six seconds.", font: "title", size: 130, color: "#e8e8ff", y: 470 },
  { text: "Four AI hunters argue over Agent Relay and vote two rooms.", font: "body", size: 56, color: "#7ad7ff", y: 620 },
])
card("lie", PURPLE, [
  { text: "Lie to them.", font: "title", size: 150, color: "#e8e8ff", y: 480 },
  { text: "Your whisper arrives as a private DM. The Medium believes you.", font: "body", size: 56, color: "#b18cff", y: 630 },
])
card("kill", ["#1a1a1a", "#000000"], [
  { text: "$ kill -9", font: "mono", size: 120, color: "#ff8a7a", y: 470 },
  { text: "Mid-round, we kill the process that runs the game. The phones don't notice.", font: "body", size: 56, color: "#e8e8ff", y: 620 },
])
card("finale", ["#5a0008", "#120002"], [
  { text: "The house is yours.", font: "title", size: 160, color: "#ffe0e0", y: 560 },
])
card("close", PURPLE, [
  { text: "Haunt the Room", font: "title", size: 120, color: "#e8e8ff", y: 300 },
  ...stats.map((t, i) => ({ text: t, font: "caps" as const, size: 40, color: "#ffd27a", y: 420 + i * 70 })),
  { text: "We're Gessa. Live events, streams and classrooms", font: "body", size: 52, color: "#b18cff", y: 790 },
  { text: "become games a crowd plays against AI agents.", font: "body", size: 52, color: "#b18cff", y: 870 },
])
