// Game-style captions for every voiced line (owner 14:40): a black pixel box with a dithered border in the speaker's
// colour, portrait + name, large text typed in. Captions queue: new ones push in at the bottom, older ones rise,
// shrink and fade out at the top once the stack is full (stage max 3, phone max 2).
//   const caps = mount(el, { size: "stage" })            // stage: voice on (calls speak() for hunters)
//   caps.push({ speaker: "the medium", text, color: "#b18cff", portrait: hunterPortrait("medium", 96), hunter: "medium" })
// The host element decides where the stack sits (it fills the host, stacking from the bottom).
import { HUNTERS, type HunterId } from "../../../contract/protocol"
import { playVoice, speak } from "../audio/index"
import type { VoiceEvent } from "../../../contract/protocol"
import "./captions.css"
import { showBust, BUST_SIDE } from "./bust"

export interface Caption {
  speaker: string
  text: string
  color: string
  /** a canvas (e.g. hunterPortrait(id, 96)) or an image URL */
  portrait?: HTMLCanvasElement | HTMLImageElement | string
  /** the hunter speaking, for the voice (speak) */
  hunter?: HunterId
  /** whispered lines: italic, ghost ink */
  whisper?: boolean
  /** a small chip at the right of the name row, e.g. the true count beside a lie */
  chip?: { text: string; color: string; ghosts?: number }
  /** the audio is already playing (a canned file): do not call speak() */
  voiced?: boolean
  /** a pre-rendered line (#hunt metadata.voice): "<event>", "<event>-<n>" or "<hunter>/<event>-<n>"; played via
   *  playVoice when listed in /audio/voice/index.json, else the caption falls back to speak() */
  voiceKey?: string
}
export interface Captions {
  el: HTMLElement
  /** returns a handle to rename the speaker later (e.g. a whisperer revealed a moment after) */
  push(c: Caption): { setSpeaker(name: string): void }
  clear(): void
}
export interface CaptionOptions {
  size: "stage" | "phone"
  /** max captions visible (stage 3, phone 2) */
  max?: number
  /** call speak() for hunter lines (default: on for stage, off for phone) */
  voice?: boolean
  /** a caption leaves on its own after this long (default 9 s) */
  ttlMs?: number
}

/** A small pixel ghost (white with a dark outline) for counts drawn as figures instead of digits. */
export const GHOST_ART = (() => {
  const rows = ["..oooo..", ".o####o.", "o######o", "o#o##o#o", "o######o", "o######o", "o######o", "o#o##o#o", "oo.oo.oo"]
  let r = ""
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && (r += `<rect x='${x}' y='${y}' width='1.02' height='1.02' fill='${ch === "#" ? "#ffffff" : "#040307"}'/>`)))
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 9' shape-rendering='crispEdges'>${r}</svg>`)}")`
})()
document.documentElement.style.setProperty("--ghost-art", GHOST_ART)

type VoiceIndex = Record<string, Record<string, { text: string; file?: string }[]>>
let index: VoiceIndex = {}
/** /audio/voice/index.json voices (loaded once, shared by every captions user). */
export const voiceIndex: Promise<VoiceIndex> = fetch("/audio/voice/index.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`voice index HTTP ${r.status}`))))
  .then((j: { voices?: VoiceIndex }) => (index = j.voices ?? {}))
  .catch((err: unknown) => {
    console.error("[captions] voice index unavailable", err)
    return (index = {})
  })

/** resolve a metadata.voice key against the index -> [event, n] or null when not listed */
function listed(hunter: HunterId, key: string): [string, number] | null {
  const k = key.replace(/\.mp3$/, "").replace(new RegExp(`^(${hunter}/)`), "")
  const pool = index[hunter]
  if (!pool) return null
  if (pool[k]?.length) return [k, 1]
  const m = k.match(/^(.*)-(\d+)$/)
  if (m && pool[m[1]] && pool[m[1]].length >= Number(m[2]) && Number(m[2]) >= 1) return [m[1], Number(m[2])]
  for (const [ev, lines] of Object.entries(pool)) {
    const i = lines.findIndex((l) => l.file === key || l.file === `${hunter}/${k}.mp3` || l.file === `${k}.mp3`)
    if (i >= 0) return [ev, i + 1]
  }
  return null
}

const HUNTER_IDS = new Set<string>(HUNTERS.map((h) => h.id))
const CHAR_MS = 24

export function mount(host: HTMLElement, opts: CaptionOptions): Captions {
  const max = opts.max ?? (opts.size === "stage" ? 3 : 2)
  const voice = opts.voice ?? opts.size === "stage"
  const ttl = opts.ttlMs ?? 9000
  const root = document.createElement("div")
  root.className = `cap cap-${opts.size}`
  host.append(root)
  const live: HTMLElement[] = []

  const leave = (box: HTMLElement) => {
    const i = live.indexOf(box)
    if (i >= 0) live.splice(i, 1)
    box.classList.add("cap-out")
    window.setTimeout(() => box.remove(), 420)
    restyle()
  }
  const restyle = () => live.forEach((b, i) => b.classList.toggle("cap-old", i < live.length - 1))

  const push = (c: Caption) => {
    const box = document.createElement("div")
    box.className = `cap-box${c.whisper ? " cap-whisper" : ""}`
    box.style.setProperty("--sc", c.color)
    if (c.portrait) {
      const p =
        typeof c.portrait === "string"
          ? Object.assign(document.createElement("img"), { src: c.portrait, alt: "" })
          : c.portrait
      p.classList.add("cap-face")
      box.append(p)
    }
    const body = document.createElement("div")
    body.className = "cap-body"
    const head = document.createElement("div")
    head.className = "cap-name"
    head.append(document.createTextNode(c.speaker))
    if (c.chip) {
      const chip = document.createElement("span")
      chip.className = "cap-chip"
      chip.textContent = c.chip.text
      if (c.chip.ghosts !== undefined) {
        const g = document.createElement("span")
        g.className = "cap-ghosts"
        for (let i = 0; i < c.chip.ghosts; i++) g.append(Object.assign(document.createElement("i"), { className: "cap-g" }))
        if (!c.chip.ghosts) g.textContent = "empty"
        chip.append(g)
      }
      chip.style.background = c.chip.color
      head.append(chip)
    }
    const text = document.createElement("div")
    text.className = "cap-text"
    // reserve the final size so the stack does not jump while typing
    const ghost = document.createElement("span")
    ghost.className = "cap-ghost"
    ghost.textContent = c.text
    const typed = document.createElement("span")
    typed.className = "cap-typed"
    text.append(typed, ghost)
    body.append(head, text)
    box.append(body)
    root.append(box)
    live.push(box)
    while (live.length > max) leave(live[0])
    restyle()
    const t0 = performance.now()
    const type = () => {
      if (!box.isConnected) return
      const n = Math.min(c.text.length, Math.floor((performance.now() - t0) / CHAR_MS))
      typed.textContent = c.text.slice(0, n)
      ghost.textContent = c.text.slice(n)
      if (n < c.text.length) requestAnimationFrame(type)
    }
    requestAnimationFrame(type)
    window.setTimeout(() => live.includes(box) && leave(box), ttl)
    const hunter = c.hunter ?? (HUNTER_IDS.has(c.speaker) ? (c.speaker as HunterId) : undefined)
    // L28: the speaking hunter's bust slides in from its side while the line types and plays (phone: above the box)
    if (hunter && !c.whisper) showBust(hunter, BUST_SIDE[hunter], c.text.length * CHAR_MS + 400, opts.size === "phone" ? root : undefined, root)
    if (voice && hunter && !c.whisper && !c.voiced) {
      const hit = c.voiceKey ? listed(hunter, c.voiceKey) : null
      if (hit) playVoice(hunter, hit[0] as VoiceEvent, hit[1])
      else {
        if (c.voiceKey) console.warn(`[captions] voice "${c.voiceKey}" not in voice/index.json for ${hunter}; speaking it`)
        void speak(hunter, c.text)
      }
    }
    return {
      setSpeaker(name: string) {
        if (head.firstChild && head.firstChild.nodeType === Node.TEXT_NODE) head.firstChild.textContent = name
      },
    }
  }
  return {
    el: root,
    push,
    clear() {
      for (const b of [...live]) leave(b)
    },
  }
}
