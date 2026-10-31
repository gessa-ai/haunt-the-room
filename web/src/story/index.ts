// THE STORY (lane L20): a slide-projector film before the game. Seven dithered stills, each with a slow Ken Burns
// move, a shutter blink + carousel clack between them, one typewriter caption each, an 80s synth score under it.
//
//   playStory(el, { onDone, loop })   the full reel (~24.5 s). loop: true = the lobby attract loop (never ends by
//                                     itself; the stage calls handle.stop() when H starts the intro).
//   playStoryShort(el, { onDone })    the 12 s finalist cut (4 slides x 3 s).
//   playEpilogue(el, winner, { onDone, top })  after the finale podium: the ending (ending.ts).
//   handle.stop()                     tear down now, silently (no onDone)
//   handle.skip()                     end now and call onDone (any key / click does this unless loop or skippable: false)
// Sound: lane L10 cues ("story" score, "shutter" per slide), from the first gesture.
// The story fills `el` (position it; the story is position: absolute; inset: 0). Put the QR above it.
import "../feed/fonts"
import "./story.css"
import { ditherCanvas } from "./dither"
import { initAudio, playCue } from "../audio"
import { playEnding, type EndingOptions } from "./ending"
import { compose, loadMeta, PANELS, SHORT_IDS, SRC_H, SRC_W, type Composed, type Move, type Panel, type StoryMeta } from "./panels"

export interface StoryOptions {
  onDone?: () => void
  /** Attract loop: repeat forever (default false). */
  loop?: boolean
  /** Any key / click skips (default true; false while looping). */
  skippable?: boolean
  /** Score + clack (default true). */
  sound?: boolean
}

export interface StoryHandle {
  stop(): void
  skip(): void
  /** Resolves when the story ends for any reason. */
  done: Promise<void>
}

/** Low-res dither buffer: one texel per dither cell (1920 / 480 = 4 px cells on the projector). */
const W = 480
const H = 270
const HI = 4
const OPEN_MS = 170
const CLOSE_MS = 130
const TYPE_DELAY_MS = 380
const TYPE_MS_PER_CHAR = 34

export function playStory(el: HTMLElement, opts: StoryOptions = {}): StoryHandle {
  return run(el, PANELS, 3500, opts)
}

export function playStoryShort(el: HTMLElement, opts: StoryOptions = {}): StoryHandle {
  const panels = SHORT_IDS.map((id) => {
    const p = PANELS.find((q) => q.id === id)
    if (!p) throw new Error(`story: no panel ${id}`)
    return p
  })
  return run(el, panels, 3000, opts)
}

/** The ending after the finale podium (ending.ts): ghosts ~15 s, hunters ~10 s, then onDone. */
export function playEpilogue(el: HTMLElement, winner: "ghosts" | "hunters", opts: EndingOptions = {}): StoryHandle {
  return playEnding(el, winner, opts)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function crop(m: Move): { sx: number; sy: number; sw: number; sh: number } {
  const sw = SRC_W / m.s
  const sh = SRC_H / m.s
  const sx = Math.min(SRC_W - sw, Math.max(0, m.x * SRC_W - sw / 2))
  const sy = Math.min(SRC_H - sh, Math.max(0, m.y * SRC_H - sh / 2))
  return { sx, sy, sw, sh }
}

function run(el: HTMLElement, panels: readonly Panel[], panelMs: number, opts: StoryOptions): StoryHandle {
  const loop = opts.loop ?? false
  const skippable = opts.skippable ?? !loop
  const sound = opts.sound ?? true

  const root = document.createElement("div")
  root.className = "story"
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const lamp = document.createElement("div")
  lamp.className = "lamp"
  const grain = document.createElement("div")
  grain.className = "grain"
  const cap = document.createElement("div")
  cap.className = "cap"
  const counter = document.createElement("div")
  counter.className = "slide"
  root.append(canvas, lamp, grain, cap, counter)
  if (skippable) {
    const hint = document.createElement("div")
    hint.className = "skip"
    hint.textContent = "Any key skips."
    root.append(hint)
  }
  el.append(root)
  // crisp overlay for sign copy (not dithered), same frame as the buffer at HI x the resolution
  const hiCanvas = document.createElement("canvas")
  hiCanvas.className = "hi"
  hiCanvas.width = W * HI
  hiCanvas.height = H * HI
  canvas.after(hiCanvas)
  const hi = hiCanvas.getContext("2d")
  if (!hi) throw new Error("story: 2d canvas unavailable")

  const g = canvas.getContext("2d", { willReadFrequently: true })
  if (!g) throw new Error("story: 2d canvas unavailable")
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = "high"

  let resolveDone!: () => void
  const done = new Promise<void>((r) => (resolveDone = r))
  let ended = false
  let raf = 0
  let scoring = false
  let meta: StoryMeta = {}
  const slides: (Composed | null)[] = panels.map(() => null)
  const cuts: (Composed | null)[][] = panels.map(() => [])

  const end = (fireDone: boolean) => {
    if (ended) return
    ended = true
    cancelAnimationFrame(raf)
    window.removeEventListener("keydown", onInput, true)
    root.removeEventListener("pointerdown", onInput)
    if (scoring) playCue("story", { level: 0 })
    root.remove()
    resolveDone()
    if (fireDone) opts.onDone?.()
  }
  const onInput = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    end(true)
  }
  if (skippable) {
    window.addEventListener("keydown", onInput, true)
    root.addEventListener("pointerdown", onInput)
  }

  // compose every slide up front (fonts first: the billboard copy is drawn into the art)
  const ready = (async () => {
    await Promise.race([document.fonts.load('64px "GeistPixel"'), new Promise((r) => setTimeout(r, 1500))])
    meta = await loadMeta()
    await Promise.all(
      panels.map(async (p, i) => {
        try {
          slides[i] = await compose(p, meta)
          const cut = p.cut
          if (cut) cuts[i] = await Promise.all(cut.renders.map((render) => compose({ id: render, caption: "", render, from: cut.from, to: cut.to }, meta)))
        } catch (err) {
          console.error(`[story] slide ${p.id} failed`, err)
        }
      }),
    )
    console.info("[story] slides:", slides.map((s, i) => `${panels[i].id}=${s?.source ?? "MISSING"}`).join(" "))
  })()

  // each slide keeps the reel's beat unless it sets its own (the hiring prelude runs fast)
  const durations = panels.map((p) => p.ms ?? panelMs)
  const offsets = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0))
  const total = durations.reduce((a, b) => a + b, 0)
  let start = 0
  let lastIndex = -1
  let typed = -1
  let frame = 0

  const draw = (now: number) => {
    if (ended) return
    raf = requestAnimationFrame(draw)
    const t = Math.max(0, now - start)
    if (!loop && t >= total) {
      end(true)
      return
    }
    const local = t % total
    let i = 0
    while (i < panels.length - 1 && local >= offsets[i + 1]) i++
    const pt = local - offsets[i]
    const p = panels[i]
    const ms = durations[i]

    if (i !== lastIndex) {
      lastIndex = i
      typed = -1
      cap.textContent = ""
      cap.classList.remove("done")
      counter.textContent = `${String(i + 1).padStart(2, "0")} / ${String(panels.length).padStart(2, "0")}`
      if (sound) playCue("shutter")
    }

    // gate weave: the slide sits a hair off true in the carousel
    const wx = Math.sin(now / 173) * 0.6 + (Math.random() - 0.5) * 0.5
    const wy = Math.cos(now / 211) * 0.6 + (Math.random() - 0.5) * 0.5
    g.fillStyle = "#040307"
    g.fillRect(0, 0, W, H)
    hi.setTransform(1, 0, 0, 1, 0, 0)
    hi.clearRect(0, 0, W * HI, H * HI)
    hi.setTransform(HI, 0, 0, HI, 0, 0)
    // a slide is one shot, or two with a hard cut between them
    const cutAt = p.cut ? p.cut.at * ms : Infinity
    const inCut = pt >= cutAt
    const shot = inCut && p.cut ? p.cut : p
    let s = slides[i]
    let u = Math.min(1, pt / Math.min(ms, cutAt))
    let cutStart = cutAt
    let last = false
    if (inCut && p.cut) {
      // which still of the run, and how far through it
      const sum = p.cut.weights.reduce((a, b) => a + b, 0)
      let from = cutAt
      for (let j = 0; j < p.cut.weights.length; j++) {
        const len = ((ms - cutAt) * p.cut.weights[j]) / sum
        if (pt < from + len || j === p.cut.weights.length - 1) {
          s = cuts[i][j] ?? null
          u = Math.min(1, (pt - from) / len)
          cutStart = from
          last = j === p.cut.weights.length - 1
          break
        }
        from += len
      }
    }
    // Ken Burns (a rush accelerates into the road; dolly jumps run linear; the last still settles)
    const k = p.rush && !inCut ? u * u * u : inCut ? (last ? 1 - (1 - u) ** 2 : u) : ease(u)
    const m: Move = { s: lerp(shot.from.s, shot.to.s, k), x: lerp(shot.from.x, shot.to.x, k), y: lerp(shot.from.y, shot.to.y, k) }
    const c = crop(m)
    if (s) {
      g.drawImage(s.canvas, c.sx, c.sy, c.sw, c.sh, wx, wy, W, H)
      // zoom blur while rushing: two echoes pushed further in
      if (p.rush && !inCut && k > 0.05) {
        for (const [push, a] of [[1.035, 0.35], [1.07, 0.2]] as const) {
          const z = crop({ ...m, s: m.s * (1 + (push - 1) * k * 2) })
          g.globalAlpha = a * Math.min(1, k * 3)
          g.drawImage(s.canvas, z.sx, z.sy, z.sw, z.sh, wx, wy, W, H)
        }
        g.globalAlpha = 1
      }
      if (!inCut && p.live) p.live({ g, hi }, meta, (x, y) => [((x - c.sx) * W) / c.sw + wx, ((y - c.sy) * H) / c.sh + wy], now, k, pt)
    }
    // the cut lands with a white burst
    if (inCut && pt - cutStart < 160) {
      g.fillStyle = `rgba(239,230,210,${((cutStart === cutAt ? 0.8 : 0.35) * (1 - (pt - cutStart) / 160)).toFixed(3)})`
      g.fillRect(0, 0, W, H)
    }

    // shutter blink: lids close at the end of a slide, open at the start of the next
    const open = Math.min(1, pt / OPEN_MS)
    const close = Math.min(1, Math.max(0, (ms - pt) / CLOSE_MS))
    const lid = 1 - Math.min(ease(open), ease(close))
    if (lid > 0) {
      g.fillStyle = "#040307"
      const lh = (H / 2) * lid
      g.fillRect(0, 0, W, lh)
      g.fillRect(0, H - lh, W, lh)
      hi.clearRect(0, 0, W, lh)
      hi.clearRect(0, H - lh, W, lh)
    }
    // lamp overexposure as the slide drops in
    const flash = pt < OPEN_MS + 120 ? 1 - (pt - OPEN_MS) / 120 : 0
    if (flash > 0 && pt > OPEN_MS) {
      g.fillStyle = `rgba(255,240,210,${0.35 * flash})`
      g.fillRect(0, 0, W, H)
    }
    ditherCanvas(g, W, H, frame >> 2)
    frame++

    // projector lamp flicker
    grain.style.background = `rgba(255,245,220,${(0.02 + Math.random() * 0.035).toFixed(3)})`

    // typewriter caption
    const perChar = Math.min(TYPE_MS_PER_CHAR, (ms - TYPE_DELAY_MS - 300) / Math.max(1, p.caption.length))
    const n = Math.max(0, Math.min(p.caption.length, Math.floor((pt - TYPE_DELAY_MS) / perChar)))
    if (!p.caption) cap.classList.add("done")
    if (pt >= TYPE_DELAY_MS && n !== typed) {
      typed = n
      cap.textContent = p.caption.slice(0, n)
      if (n === p.caption.length) cap.classList.add("done")
    }
  }

  // L10's score starts with the first gesture (the stage's first click/key; initAudio is idempotent)
  if (sound)
    void initAudio().then(() => {
      if (ended) return
      scoring = true
      playCue("story")
    })
  void ready.then(() => {
    if (ended) return
    start = performance.now()
    raf = requestAnimationFrame(draw)
  })

  return { stop: () => end(false), skip: () => end(true), done }
}
