// Audio audition (L10): one button per cue, per stage moment, per phone blip and per hunter line, so the owner
// can hear the whole show in a minute. Dev: http://127.0.0.1:5370/src/audio/dev.html (integrated: :3300).
import { CUES, HUNTERS, ROOM_GRID, VOICE_EVENTS, type HunterId, type VoiceEvent } from "../../../contract/protocol"
import { announce, audioStatus, initAudio, playCue, playPhoneCue, playVoice, setMaster, type PhoneCue, type StageCue } from "./index"
import type { VoiceIndex } from "./voices"

const PHONE: PhoneCue[] = ["hide-tap", "tick", "safe", "caught", "possessed", "lie", "fire", "climb", "crackle", "finale"]

const later = (ms: number, fn: () => void) => setTimeout(fn, ms)

/** One beat of the loop at real speed: HIDE 6 s (ticks in the last 3) -> bell -> HUNTING 3.5 s -> REVEAL. */
function beat(outcome: "caught" | "possessed" | "cleansed"): void {
  const hideEnds = Date.now() + 6000
  playCue("hide", { endsAt: hideEnds })
  crowd(120, 5500)
  for (const s of [3, 4, 5]) later(s * 1000, () => playCue("tick"))
  later(6000, () => {
    playCue("bell")
    playCue("hunting", { endsAt: Date.now() + 3500 })
  })
  later(9500, () => {
    playCue("reveal")
    playCue("sweep", { room: "library" })
    later(150, () => playCue("sweep", { room: "crypt" }))
    later(300, () => playCue("safe"))
    later(700, () => playCue("ticker", { endsAt: Date.now() + 1200 }))
    later(2100, () => playCue("lead"))
    if (outcome === "caught") {
      for (let i = 0; i < 8; i++) later(250 + i * 20, () => playCue("caught", { room: "library" }))
      later(1400, () => playVoice("exorcist", "caught"))
    } else if (outcome === "possessed") {
      later(600, () => playCue("possessed", { room: "ballroom" }))
      later(2400, () => playCue("crash", { room: "ballroom" }))
      later(3000, () => playVoice("priest", "possessed"))
    } else {
      later(500, () => playCue("cleansed", { room: "crypt" }))
      later(1400, () => playVoice("skeptic", "missed"))
    }
  })
}

/** n ghosts tapping rooms over ms, denser toward the bell (as a real crowd does). */
function crowd(n: number, ms: number): void {
  const rooms = ROOM_GRID.flat()
  for (let i = 0; i < n; i++) later(ms * Math.sqrt(Math.random()), () => playCue("tap", { room: rooms[Math.floor(Math.random() * rooms.length)] }))
}

const MOMENTS: [string, () => void][] = [
  ["Crowd hides: 200 taps in 6 s", () => crowd(200, 6000)],
  ["Tension 1 to 5 (a step every 4 s), then off", () => {
    for (let l = 1; l <= 5; l++) later((l - 1) * 4000, () => playCue("tension", { level: l }))
    later(21000, () => playCue("tension", { level: 0 }))
  }],
  ["Story score on (30 s loop)", () => playCue("story")],
  ["Story score off", () => playCue("story", { level: 0 })],
  ["ON FIRE (4 s)", () => playCue("onfire", { endsAt: Date.now() + 4000 })],
  ["Doors open: 40 joins", () => { for (let i = 0; i < 40; i++) later(i * 140 + Math.random() * 120, () => playCue("join")) }],
  ["300 joins in 6 s (limiter)", () => { for (let i = 0; i < 300; i++) later(Math.random() * 6000, () => playCue("join")) }],
  ["Intro: title, then 3 cards (16 s)", () => { playCue("intro"); for (const s of [4, 8, 12]) later(s * 1000, () => playCue("card")) }],
  ["THE HUNT BEGINS", () => { playCue("round-start"); later(1700, () => playVoice("exorcist", "arrive")) }],
  ["Beat: hide, bell, hunting, reveal (caught)", () => beat("caught")],
  ["Beat ending in a possession + chandelier", () => beat("possessed")],
  ["Beat ending in a cleanse", () => beat("cleansed")],
  ["Lure whisper", () => { playCue("whisper"); later(1200, () => playVoice("medium", "fooled")) }],
  ["THE KILL: static, revive, 'the Crypt was a lie'", () => {
    playCue("static")
    later(2100, () => playCue("revive"))
    later(3700, () => playVoice("skeptic", "back", 1))
  }],
  ["Finale: ghosts win", () => { playCue("finale-ghosts"); later(2600, () => playVoice("exorcist", "lose")) }],
  ["Finale: hunters win", () => { playCue("finale-hunters"); later(1300, () => playVoice("priest", "win")) }],
]

const CSS = `
.au{min-height:100vh;margin:0;padding:24px 28px 60px;background:#07060b;color:#e9e3f5;font:14px/1.4 ui-sans-serif,system-ui,sans-serif}
.au h1{font:600 26px/1.1 Georgia,serif;letter-spacing:.04em;margin:0 0 6px}
.au h2{font:600 13px/1 ui-sans-serif,system-ui;letter-spacing:.14em;text-transform:uppercase;color:#9d91b8;margin:26px 0 10px}
.au .bar{display:flex;gap:18px;align-items:center;flex-wrap:wrap;color:#b9afd0}
.au .meter{width:180px;height:8px;border-radius:4px;background:#1c1828;overflow:hidden}
.au .meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7af0ff,#b18cff,#ff7ad9)}
.au .row{display:flex;flex-wrap:wrap;gap:8px}
.au button{background:#15121f;color:#efe9ff;border:1px solid #2c2540;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer}
.au button:hover{border-color:#6b5a99;background:#1d1830}
.au button:active{transform:translateY(1px)}
.au button.big{padding:10px 14px;border-color:#4a3b70}
.au .grid{display:grid;grid-template-columns:110px repeat(4,minmax(0,1fr));gap:6px 10px;align-items:start}
.au .hd{font:600 15px/1.2 Georgia,serif;padding:4px 0}
.au .ev{color:#9d91b8;padding-top:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.au .cell{display:flex;flex-direction:column;gap:4px}
.au .cell button{text-align:left;padding:5px 8px;font-size:12.5px;border-radius:6px}
.au .cell button.rnd{color:#9d91b8;font-size:11px;padding:3px 8px}
.au .hint{color:#ffd27a}
`

export function mountAudition(root: HTMLElement): () => void {
  const style = document.createElement("style")
  style.textContent = CSS
  document.head.append(style)
  root.className = "au"
  root.replaceChildren()
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] => {
    const n = document.createElement(tag)
    if (text) n.textContent = text
    if (cls) n.className = cls
    return n
  }
  const button = (label: string, run: () => void, cls = "") => {
    const b = el("button", label, cls)
    b.type = "button"
    b.onclick = () => void initAudio().then(run)
    return b
  }

  root.append(el("h1", "Haunt the Room: audio audition"))
  const bar = el("div", "", "bar")
  const state = el("span")
  const meter = el("div", "", "meter")
  const fill = el("i")
  meter.append(fill)
  const vol = el("input")
  vol.type = "range"
  vol.min = "0"
  vol.max = "1"
  vol.step = "0.01"
  vol.value = "0.9"
  vol.oninput = () => setMaster(Number(vol.value))
  const volLabel = el("label", "master ")
  volLabel.append(vol)
  bar.append(state, meter, volLabel)
  root.append(bar)

  root.append(el("h2", "Stage moments"))
  const moments = el("div", "", "row")
  for (const [label, run] of MOMENTS) moments.append(button(label, run, "big"))
  root.append(moments)

  root.append(el("h2", "Cues (synthesized)"))
  const cues = el("div", "", "row")
  for (const cue of [...CUES, "intro", "card", "tap", "lead", "onfire", "ticker", "shutter", "seat", "full"] as StageCue[]) {
    const ends = cue === "hide" ? 6000 : cue === "hunting" ? 3500 : cue === "onfire" ? 4000 : cue === "ticker" ? 1200 : 0
    cues.append(button(cue, () => playCue(cue, ends ? { endsAt: Date.now() + ends } : {})))
  }
  for (let l = 0; l <= 5; l++) cues.append(button(`tension ${l}`, () => playCue("tension", { level: l })))
  root.append(cues)

  root.append(el("h2", "Phone (L6)"))
  const phone = el("div", "", "row")
  for (const kind of PHONE) phone.append(button(kind, () => playPhoneCue(kind)))
  let streak = 0
  phone.append(button("safe, streak +1", () => playPhoneCue("safe", streak++ % 7)))
  root.append(phone)

  root.append(el("h2", "Announcer"))
  const caster = el("div", "", "row")
  root.append(caster)
  root.append(el("h2", "Hunter voices"))
  const grid = el("div", "", "grid")
  root.append(grid)
  void fetch("/audio/voice/index.json", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<VoiceIndex>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((index) => {
      for (const [event, lines] of Object.entries(index.voices.announcer ?? {})) {
        const room = event.startsWith("haunted-") ? (event.slice(8) as Parameters<typeof announce>[1]) : undefined
        const label = `${lines?.[0]?.text ?? event}${tag(lines?.[0]?.engine)}`
        caster.append(button(label, () => (room ? announce("haunted", room) : announce(event as Parameters<typeof announce>[0]))))
      }
      renderVoices(grid, index, el, button)
    })
    .catch((err: unknown) => grid.append(el("div", `no voice index: ${String(err)}`, "hint")))

  // a timer, not requestAnimationFrame: the status must stay live when the page is in a background pane
  const tick = () => {
    const s = audioStatus()
    const v = s.voices
    state.textContent =
      s.state === "running"
        ? `sound on · voices: ${v.engine} · ${v.loaded}/${v.total} loaded${v.missing ? ` · ${v.missing} missing` : ""}`
        : "click anywhere to unlock sound"
    state.className = s.state === "running" ? "" : "hint"
    fill.style.width = `${Math.max(0, Math.min(100, ((s.levelDb + 60) / 60) * 100))}%`
  }
  void initAudio()
  const timer = setInterval(tick, 100)
  tick()
  return () => {
    clearInterval(timer)
    style.remove()
    root.replaceChildren()
  }
}

function renderVoices(
  grid: HTMLElement,
  index: VoiceIndex,
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => HTMLElementTagNameMap[K],
  button: (label: string, run: () => void, cls?: string) => HTMLButtonElement,
): void {
  grid.append(el("div"))
  for (const h of HUNTERS) {
    const hd = el("div", h.name, "hd")
    hd.style.color = h.color
    grid.append(hd)
  }
  for (const event of VOICE_EVENTS) {
    grid.append(el("div", event, "ev"))
    for (const h of HUNTERS) {
      const cell = el("div", "", "cell")
      const lines = index.voices[h.id as HunterId]?.[event as VoiceEvent] ?? []
      cell.append(button("random", () => playVoice(h.id, event), "rnd"))
      lines.forEach((line, i) => cell.append(button(line.text + tag(line.engine), () => playVoice(h.id, event, i + 1))))
      grid.append(cell)
    }
  }
}

/** Marks lines a real TTS made, so a sample render stands out next to the placeholders. */
function tag(engine?: string): string {
  return engine && engine !== "say" ? ` · ${engine.split(":")[0]}` : ""
}
