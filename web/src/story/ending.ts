// THE ENDING (lane L20b, owner 14:35): what plays after the finale podium holds.
//   ghosts win (~15 s): the house floods red, the four hunters go under one by one with their last words (captions +
//     voice), the top three rise on a podium in depth with crowns and the winner's name huge, then a quiet card
//     "The house is yours." and the credits line.
//   hunters win (~10 s): grey dawn, the hunters gloat, the best ghosts get a tiny sinking podium, "Exorcised.", credits.
// Same handle as the reel: { stop(), skip(), done }. Top three: opts.top, else read off the stage's finale podium.
import "../feed/fonts"
import "./ending.css"
import { HUNTERS, type HunterId } from "../../../contract/protocol"
import { mount } from "../captions/index"
import { hunterPortrait } from "../feed/portrait"
import { ditherBackground, FLOODS } from "../fx/ditherGradient"
import { initAudio, playCue } from "../audio"
import type { StoryHandle, StoryOptions } from "./index"

export interface EndingPlace {
  name: string
  color: string
  /** avatar image URL */
  face?: string
}
export interface EndingOptions extends StoryOptions {
  top?: readonly EndingPlace[]
}

const CREDITS = "Built today: every ghost a Terse Durable Actor, every hunter an Agent Relay agent."

const LAST_WORDS: Record<"ghosts" | "hunters", readonly [HunterId, string][]> = {
  ghosts: [
    ["exorcist", "I was off at eleven."],
    ["medium", "They lied to me, darling. All of them."],
    ["skeptic", "For the record: still not ghosts."],
    ["priest", "Not the robes. Anything but the robes."],
  ],
  hunters: [
    ["priest", "Did everyone get my good side?"],
    ["skeptic", "Zero ghosts. As I said. Repeatedly."],
  ],
}

/** The stage's own finale podium (hud.ts .st-finale .pod.p1..p3), when the caller does not pass the top three. */
function readPodium(): EndingPlace[] {
  const out: EndingPlace[] = []
  for (const p of [1, 2, 3]) {
    const col = document.querySelector(`.st-finale .pod.p${p}`)
    const name = col?.querySelector(".pod-name") as HTMLElement | null
    if (!col || !name?.textContent) continue
    const face = col.querySelector("img.pod-face") as HTMLImageElement | null
    out.push({ name: name.textContent, color: name.style.color || "#efe6d2", face: face?.src })
  }
  return out
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement("div")
  d.className = cls
  if (text) d.textContent = text
  return d
}

/** A pixel crown, 9 x 6 cells. */
function crown(color: string, cell: number): HTMLCanvasElement {
  const rows = ["x...x...x", "xx.xxx.xx", "xxxxxxxxx", "xxxxxxxxx", "x.x.x.x.x", "xxxxxxxxx"]
  const c = document.createElement("canvas")
  c.width = 9 * cell
  c.height = 6 * cell
  const g = c.getContext("2d")!
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== "x") return
      g.fillStyle = y === 4 && x % 2 === 0 ? "#ff3b3b" : color
      g.fillRect(x * cell, y * cell, cell, cell)
    }),
  )
  c.className = "crown"
  return c
}

export function playEnding(el: HTMLElement, winner: "ghosts" | "hunters", opts: EndingOptions = {}): StoryHandle {
  const sound = opts.sound ?? true
  const skippable = opts.skippable ?? true
  const top = (opts.top ?? readPodium()).slice(0, 3)
  const ghosts = winner === "ghosts"

  const root = div(`end end-${winner}`)
  const world = div("end-world")
  // depth layers, back to front: the house, light, the flood, smoke, the hunters, the podium
  const house = div("end-house")
  const rays = div("end-rays")
  const flood = div("end-flood")
  ditherBackground(flood, ghosts ? FLOODS.blood : FLOODS.dawn)
  const smoke = div("end-smoke")
  for (let i = 0; i < 6; i++) {
    const s = div("puff")
    s.style.setProperty("--i", String(i))
    smoke.append(s)
  }
  const crew = div("end-crew")
  const lines = LAST_WORDS[winner]
  const crewIds: HunterId[] = ghosts ? HUNTERS.map((h) => h.id) : lines.map(([id]) => id)
  const faces = new Map<HunterId, HTMLElement>()
  crewIds.forEach((id, i) => {
    const f = div("hunter")
    f.style.setProperty("--i", String(i))
    f.append(hunterPortrait(id, 240))
    crew.append(f)
    faces.set(id, f)
  })
  const podium = div("end-podium")
  const order = [2, 1, 3]
  for (const place of order) {
    const p = top[place - 1]
    const col = div(`step s${place}`)
    if (p) {
      const metal = place === 1 ? "#ffd27a" : place === 2 ? "#d9d4e8" : "#d08a52"
      col.append(crown(metal, place === 1 ? 14 : 10))
      if (p.face) {
        const img = document.createElement("img")
        img.className = "face"
        img.src = p.face
        img.style.setProperty("--c", p.color)
        col.append(img)
      }
      const nm = div("who", p.name)
      nm.style.color = p.color
      col.append(nm)
    }
    col.append(div("block", String(place)))
    podium.append(col)
  }
  const big = div("end-big", ghosts ? "" : "Exorcised.")
  const capHost = div("end-caps")
  const card = div("end-card")
  const credits = div("credits")
  // CREDITS, with the two sponsor names lit
  credits.innerHTML = CREDITS.replace("Terse Durable Actor", '<b class="terse">Terse Durable Actor</b>').replace("Agent Relay agent", '<b class="relay">Agent Relay</b> agent')
  card.append(div("line", ghosts ? "The house is yours." : "The house is theirs. For now."), credits)
  world.append(house, rays, flood, smoke, crew, podium)
  root.append(world, big, capHost, card)
  el.append(root)
  const caps = mount(capHost, { size: "stage", max: 2, voice: sound, ttlMs: 4200 })

  // timeline (ms): each line types in <= 1 s (captions 24 ms/char) and holds >= 1.1 s before the next; ghosts <= 16 s
  const T = ghosts
    ? { line0: 500, lineGap: 2100, podium: 9000, card: 12500, end: 16000 }
    : { line0: 400, lineGap: 2100, podium: 4700, card: 7700, end: 10800 }
  const timers: number[] = []
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms))
  let resolveDone!: () => void
  const done = new Promise<void>((r) => (resolveDone = r))
  let ended = false
  const end = (fire: boolean) => {
    if (ended) return
    ended = true
    timers.forEach((t) => clearTimeout(t))
    window.removeEventListener("keydown", onKey, true)
    caps.clear()
    root.remove()
    resolveDone()
    if (fire) opts.onDone?.()
  }
  const onKey = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    end(true)
  }
  if (skippable) window.addEventListener("keydown", onKey, true)

  if (sound) void initAudio().then(() => !ended && playCue("shutter"))
  requestAnimationFrame(() => root.classList.add("go"))
  lines.forEach(([id, text], i) =>
    at(T.line0 + i * T.lineGap, () => {
      const h = HUNTERS.find((x) => x.id === id)!
      caps.push({ speaker: h.name, text, color: h.color, portrait: hunterPortrait(id, 96), hunter: id })
      faces.get(id)?.classList.add("talk")
      // ghosts win: each goes under after their line
      if (ghosts) at(T.lineGap - 250, () => faces.get(id)?.classList.add("gone"))
    }),
  )
  at(T.podium, () => {
    root.classList.add("podium-up")
    if (!ghosts) {
      caps.clear()
      big.classList.add("on")
    }
    if (sound) playCue("shutter")
  })
  at(T.card, () => {
    caps.clear()
    root.classList.add("carded")
  })
  at(T.end, () => end(true))
  return { stop: () => end(false), skip: () => end(true), done }
}
