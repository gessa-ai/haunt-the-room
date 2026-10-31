// THE CABAL (lane L7b, lanes/CABAL.md): every HUNTING phase the stage hard-cuts to a top-down table where the four
// AI hunters argue. Lines = #hunt messages from the Relay observer feed; leans / conviction / swayedBy / votes = the
// House snapshot. Mounted inside the stage's 1920x1080 `.st` box (so the stage's DOM dither covers it).
// Dev harness: /stage?fake=lobby&cabal=demo replays a scripted beat in a loop (no stack needed).
import { HUNTERS, ROOMS, ROOM_GRID, ROOM_STYLE, type HunterId, type RoomId, type StageSnap } from "../../../contract/protocol"
import type { FeedItem } from "../feed/relay"
import { hunterPortrait, talk } from "../feed/portrait"
import { playCue } from "../audio/index"
import { mount as mountCaptions } from "../captions/index"

// L26 builds vote3d.ts (three.js tokens + burn). Until the file exists the 2D tokens run; glob finds it the moment it lands.
const VOTE3D = import.meta.glob("./vote3d.ts")
interface Vote3d { slam(h: HunterId, r: RoomId): void; burn(rooms: RoomId[]): void; clear(): void }
import { paintTable, type Layout, DEFAULT_LAYOUT } from "./table"
import { runDemo } from "./demo"
import { mountHeat, type Heat } from "./heat"
import "./cabal.css"

export interface Cabal {
  item(i: FeedItem): void
  snap(s: StageSnap): void
}

type Pt = { x: number; y: number }
const ROOM_NAME = new Map<string, string>(ROOMS.map((r) => [r.id, r.name.replace(/^The /, "")]))
const HUNTER = new Map<HunterId, (typeof HUNTERS)[number]>(HUNTERS.map((h) => [h.id, h]))
const W = 1920
const H = 1080
const PORTRAIT = 150
const VOTE_LEAD_MS = 2000 // votes start slamming this long before hunting ends
const BURN_MS = 900 // swept rooms burn this long into the reveal, then the stage's reveal takes over

/** Pixel art from rows of "#" (fill) / "o" (outline) / "." -> a crisp SVG data URL. */
function pixelArt(rows: string[], fill: string): string {
  let r = ""
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") r += `<rect x='${x}' y='${y}' width='1.02' height='1.02' fill='${ch === "#" ? fill : "#040307"}'/>`
    }),
  )
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0].length} ${rows.length}' shape-rendering='crispEdges'>${r}</svg>`)}")`
}
const X_ART = pixelArt(
  ["oo.....oo", "o#o...o#o", "o##o.o##o", ".o##o##o.", "..o###o..", ".o##o##o.", "o##o.o##o", "o#o...o#o", "oo.....oo"],
  "#ffffff",
)
const OK_ART = pixelArt(
  [".......oo", "......o#o", ".....o##o", "oo..o##o.", "o#oo##o..", "o####o...", ".o##o....", "..oo....."],
  "#7aff9e",
)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}
const lower = (s: string) => s.toLowerCase()
const hunterLabel = (id: HunterId) => lower(HUNTER.get(id)!.name)

/** Which room a line of text names (lure text names exactly one). */
function roomIn(text: string): RoomId | null {
  const t = text.toLowerCase()
  for (const r of ROOMS) if (t.includes(r.id)) return r.id
  return null
}

interface Seat {
  id: HunterId
  root: HTMLDivElement
  card: HTMLDivElement
  bar: HTMLDivElement
  barText: HTMLDivElement
  tag: HTMLDivElement
  needle: SVGLineElement
  tip: SVGCircleElement
  at: Pt // seat centre
  ear: Pt
  lean: RoomId | null
  conviction: number
  swayedBy: string | undefined
  cur: Pt // needle tip now
  from: Pt
  to: Pt
  swingT: number // 0..1 (1 = settled)
}

interface Line {
  who: HunterId
  to?: HunterId
  text: string
  voice?: string
  whisper?: { to: HunterId | null; room: RoomId | null }
}

export function createCabal(host: HTMLElement): Cabal {
  const demo = new URLSearchParams(location.search).get("cabal") === "demo"
  const root = el("div", "cb")
  const canvas = el("canvas", "cb-bg")
  canvas.width = W
  canvas.height = H
  const plate = el("img", "cb-plate")
  plate.alt = ""
  const overlay = svg("svg", { class: "cb-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H })
  const mapBox = el("div", "cb-map")
  const seatsBox = el("div", "cb-seats")
  const tokens = el("div", "cb-tokens")
  const wisp = el("div", "cb-wisp")
  const capHost = el("div", "cb-caps")
  const flash = el("div", "cb-flash")
  root.append(canvas, plate, mapBox, overlay, seatsBox, tokens, wisp, capHost, flash)
  const caps = mountCaptions(capHost, { size: "stage", max: 2, voice: true }) // the band under the map holds two; never covers the map
  host.append(root)

  let layout: Layout = DEFAULT_LAYOUT
  paintTable(canvas, layout)

  // ---------- the carved map ----------
  const cells = new Map<RoomId, { box: HTMLDivElement; count: HTMLDivElement; centre: Pt }>()
  /** a room's crowd as figures + heat, never digits: 0..8 ghosts scaled to the fullest room */
  const drawGhosts = (c: { box: HTMLDivElement; count: HTMLDivElement }, count: number, max: number) => {
    const n = count === 0 ? 0 : Math.max(1, Math.round((count / max) * 8))
    c.box.style.setProperty("--heat", String(count / max))
    if (c.count.dataset.n === String(n)) return
    c.count.dataset.n = String(n)
    c.count.innerHTML = ""
    for (let i = 0; i < n; i++) c.count.append(el("i", "cb-g"))
  }
  let heat: Heat | null = null
  const buildMap = () => {
    mapBox.innerHTML = ""
    cells.clear()
    const m = layout.map
    Object.assign(mapBox.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px` })
    capHost.style.top = `${m.y + m.h + 12}px` // captions live strictly below the map rect
    const cw = m.w / 2
    const ch = m.h / 3
    ROOM_GRID.forEach((row, r) =>
      row.forEach((id, c) => {
        const box = el("div", "cb-room")
        box.style.setProperty("--c", ROOM_STYLE[id].color)
        Object.assign(box.style, { left: `${c * cw}px`, top: `${r * ch}px`, width: `${cw}px`, height: `${ch}px` })
        const count = el("div", "cb-ghosts")
        box.append(el("div", "cb-rname", ROOM_NAME.get(id)!), count)
        mapBox.append(box)
        cells.set(id, { box, count, centre: { x: m.x + c * cw + cw / 2, y: m.y + r * ch + ch / 2 } })
      }),
    )
    heat = mountHeat({ cells: new Map([...cells].map(([id, c]) => [id, c.box])) })
  }
  buildMap()

  // ---------- seats ----------
  const seats = new Map<HunterId, Seat>()
  const placeSeat = (s: Seat, i: number) => {
    const at = layout.seats[i]
    s.at = at
    const left = at.x < W / 2
    s.ear = { x: at.x + (left ? PORTRAIT * 0.42 : -PORTRAIT * 0.42), y: at.y - PORTRAIT * 0.18 }
    s.root.style.left = `${at.x}px`
    s.root.style.top = `${at.y}px`
    s.root.classList.toggle("right", !left)
    s.root.classList.toggle("low", at.y > H / 2)
  }
  HUNTERS.forEach((h, i) => {
    const r = el("div", "cb-seat")
    r.style.setProperty("--hc", h.color)
    const card = el("div", "cb-card")
    const p = hunterPortrait(h.id, PORTRAIT)
    card.append(p, el("div", "cb-hname", hunterLabel(h.id)))
    const meter = el("div", "cb-meter")
    const track = el("div", "cb-track")
    const bar = el("div", "cb-bar")
    track.append(bar)
    const barText = el("div", "cb-mtext", "undecided")
    const tag = el("div", "cb-tag")
    meter.append(barText, track, tag)
    r.append(card, meter)
    seatsBox.append(r)
    const needle = svg("line", { class: "cb-needle", stroke: h.color, style: `color:${h.color}`, x1: 0, y1: 0, x2: 0, y2: 0 })
    const tip = svg("circle", { class: "cb-tip", fill: h.color, r: 12, cx: 0, cy: 0 })
    overlay.append(needle, tip)
    const s: Seat = {
      id: h.id, root: r, card, bar, barText, tag, needle, tip, at: { x: 0, y: 0 }, ear: { x: 0, y: 0 },
      lean: null, conviction: 0, swayedBy: undefined, cur: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, swingT: 1,
    }
    placeSeat(s, i)
    s.cur = s.from = s.to = { ...s.at }
    seats.set(h.id, s)
  })

  // ---------- the Blender plate (web/public/3d/cabal/table.png + seats.json), swapped in when it appears ----------
  let plateOn = false
  const tryPlate = async () => {
    if (plateOn) return
    try {
      const res = await fetch("/3d/cabal/table.png", { method: "HEAD", cache: "no-store" })
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return
      const js = await fetch("/3d/cabal/seats.json", { cache: "no-store" })
      if (js.ok && (js.headers.get("content-type") ?? "").includes("json")) {
        const parsed = parseSeats(await js.json())
        // our own seats + the big map (L23 r5): the plate is the backdrop only
        if (!parsed) console.warn("[cabal] seats.json not understood; plate used as backdrop only")
      }
      plate.src = `/3d/cabal/table.png?v=${Date.now()}`
      await plate.decode()
      plateOn = true
      root.classList.add("plate")
      buildMap()
      HUNTERS.forEach((h, i) => placeSeat(seats.get(h.id)!, i))
      for (const s of seats.values()) aim(s, true)
      console.info("[cabal] background plate in use")
    } catch (err) {
      console.warn("[cabal] plate check failed", err)
    }
  }
  void tryPlate()
  window.setInterval(() => void tryPlate(), 5000)

  // ---------- needles + meters ----------
  const aim = (s: Seat, snapNow = false) => {
    const c = s.lean ? cells.get(s.lean)! : null
    // aim at the cell's edge facing the seat, so the live count stays readable
    const half = layout.map.w / 4
    const target = c ? { x: c.centre.x + (s.at.x < W / 2 ? -half : half) * 0.62, y: c.centre.y } : s.at
    s.from = { ...s.cur }
    s.to = target
    s.swingT = snapNow ? 1 : 0
    if (snapNow) s.cur = { ...target }
  }
  const setLean = (s: Seat, lean: RoomId | null, conviction: number | undefined, swayedBy: string | undefined, quiet = false) => {
    const changedRoom = lean !== s.lean
    const swayed = swayedBy !== undefined && swayedBy !== s.swayedBy
    s.lean = lean
    if (conviction !== undefined) s.conviction = Math.max(0, Math.min(100, conviction))
    else if (lean && changedRoom) s.conviction = 50
    s.swayedBy = swayedBy
    s.bar.style.width = `${lean ? s.conviction : 0}%`
    s.bar.style.background = lean ? ROOM_STYLE[lean].color : "transparent"
    s.barText.textContent = lean ? ROOM_NAME.get(lean)! : "undecided"
    s.root.style.setProperty("--lean", lean ? ROOM_STYLE[lean].color : "#efe6d2")
    s.root.style.setProperty("--conv", String(lean ? s.conviction / 100 : 0))
    if (changedRoom) aim(s, quiet)
    if (swayed && swayedBy) {
      s.tag.textContent = `swayed by ${lower(swayedBy)}`
      s.root.classList.remove("swayed")
      void s.root.offsetWidth
      s.root.classList.add("swayed")
      if (!quiet) playCue("whisper")
    } else if (!swayedBy) {
      s.tag.textContent = ""
      s.root.classList.remove("swayed")
    }
    if (changedRoom && !quiet && !swayed) playCue("shutter")
  }

  // ---------- one speaker at a time ----------
  const queue: Line[] = []
  let speaking: { line: Line; started: number; until: number } | null = null
  const LINE_MIN_MS = 1700
  const CHAR_MS = 26
  let renames: { line: Line; set(name: string): void }[] = []
  /** a whisper lands the moment it arrives (owner 15:05): wisp to the hunter + whisper caption, outside the speaker queue */
  const whisperNow = (line: Line) => {
    if (!line.whisper) return
    const w = line.whisper
      const target = w.to
      const tname = target ? hunterLabel(target) : "a hunter"
      flyWisp(target)
      let chip: { text: string; color: string; ghosts?: number } | undefined
      if (w.room) {
        const room = w.room
        const c = cells.get(room)!
        c.box.classList.remove("lured")
        void c.box.offsetWidth
        c.box.classList.add("lured")
        const real = snap?.rooms.find((r) => r.id === room)?.count ?? 0
        chip = { text: ROOM_NAME.get(room)!, color: ROOM_STYLE[room].color, ghosts: Number(c.count.dataset.n ?? (real ? 1 : 0)) }
      }
      const h = caps.push({ speaker: `${whisperer(line)} whispers to ${tname}`, text: line.text, color: "#7af0ff", whisper: true, chip })
      renames.push({ line, set: h.setSpeaker })
  }
  const startLine = (line: Line, now: number) => {
    speaking = { line, started: now, until: now + Math.max(LINE_MIN_MS, line.text.length * CHAR_MS + 900) }
    for (const s of seats.values()) s.root.classList.toggle("speaking", !line.whisper && s.id === line.who)
    for (const s of seats.values()) s.root.classList.toggle("dim", !line.whisper && s.id !== line.who)
    if (line.whisper) {
      whisperNow(line)
    } else {
      const hc = HUNTER.get(line.who)!
      talk(line.who, speaking.until - now)
      caps.push({
        speaker: line.to ? `${hunterLabel(line.who)}, privately to ${hunterLabel(line.to)}` : hunterLabel(line.who),
        text: line.text,
        color: hc.color,
        portrait: hunterPortrait(line.who, 96),
        hunter: line.who,
        voiceKey: line.voice,
      })
    }
  }
  const whisperer = (line: Line) => {
    const to = line.whisper?.to
    const sw = to ? seats.get(to)?.swayedBy : undefined
    return sw ? lower(sw) : "a ghost"
  }
  const say = (line: Line) => {
    if (!root.classList.contains("on")) return
    if (line.text.length > 90) line.text = `${line.text.slice(0, 88).trimEnd()}...`
    queue.push(line)
    while (queue.length > 3) {
      // backlog: keep whispers, drop the oldest table talk
      const i = queue.findIndex((l) => !l.whisper)
      queue.splice(i >= 0 ? i : 0, 1)
    }
  }

  // ---------- the wisp ----------
  let wispAnim: Animation | null = null
  const flyWisp = (to: HunterId | null) => {
    const s = to ? seats.get(to) : null
    const end = s ? s.ear : { x: W / 2, y: H / 2 }
    const start = { x: end.x < W / 2 ? -80 : W + 80, y: 120 }
    const mid = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 140 }
    wispAnim?.cancel()
    wispAnim = wisp.animate(
      [
        { transform: `translate(${start.x}px, ${start.y}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(1.2)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(0.9)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 1300, easing: "cubic-bezier(.4,.0,.2,1)", fill: "forwards" },
    )
    playCue("whisper")
    if (s) {
      s.root.classList.remove("hears")
      void s.root.offsetWidth
      s.root.classList.add("hears")
    }
  }

  // ---------- the vote ----------
  let voteStarted = false
  let burnt = false
  const placed = new Map<HunterId, RoomId>()
  let v3: Vote3d | null = null
  const v3host = el("div", "cb-v3")
  root.insertBefore(v3host, tokens)
  const v3load = VOTE3D["./vote3d.ts"]
  if (v3load)
    void (async () => {
      try {
        const mod = (await v3load()) as { mount(el: HTMLElement, seats: unknown): Vote3d | void } & Partial<Vote3d>
        const plateJson = (await fetch("/3d/cabal/seats.json").then((r) => r.json())) as Record<string, unknown>
        // tokens land on OUR (enlarged) map, not the plate's carved one
        const seatsJson = {
          ...plateJson,
          map: layout.map,
          rooms: Object.fromEntries([...cells].map(([id, c]) => [id, [c.centre.x, c.centre.y]])),
          seats: Object.fromEntries(HUNTERS.map((h, i) => [h.id, [layout.seats[i].x, layout.seats[i].y]])),
        }
        const api = mod.mount(v3host, seatsJson)
        v3 = api ?? (mod as unknown as Vote3d)
        root.classList.add("v3") // the 3D layer owns the frame from the first slam to clear()
        console.info("[cabal] vote3d in use")
      } catch (err) {
        console.error("[cabal] vote3d failed to mount; 2D tokens stay", err)
      }
    })()
  const slam = (id: HunterId, room: RoomId, delay: number) => {
    window.setTimeout(() => {
      if (!root.classList.contains("on") || placed.get(id) === room) return
      placed.set(id, room)
      if (v3) {
        v3.slam(id, room)
        seats.get(id)!.root.classList.add("voted")
        playCue("seat")
        return
      }
      tokens.querySelector(`[data-h="${id}"]`)?.remove()
      const c = cells.get(room)!
      const n = [...placed.values()].filter((r) => r === room).length - 1
      const t = el("div", "cb-token")
      t.dataset.h = id
      t.style.setProperty("--hc", HUNTER.get(id)!.color)
      const p = hunterPortrait(id, 72)
      t.append(p)
      const [ox, oy] = ([[-44, -2], [44, -2], [-44, 40], [44, 40]] as const)[Math.min(3, n)]
      t.style.left = `${c.centre.x + ox}px`
      t.style.top = `${c.centre.y + oy + 18}px`
      tokens.append(t)
      root.classList.remove("shake")
      void root.offsetWidth
      root.classList.add("shake")
      seats.get(id)!.root.classList.add("voted")
      playCue("seat")
    }, delay)
  }
  const startVote = (s: StageSnap) => {
    voteStarted = true
    speaking = null
    queue.length = 0
    root.classList.add("voting")
    for (const s of seats.values()) s.root.classList.remove("speaking", "dim")
    HUNTERS.forEach((h, i) => {
      const hs = s.hunters.find((x) => x.id === h.id)
      const room = hs?.vote ?? hs?.lean ?? seats.get(h.id)!.lean
      if (room) slam(h.id, room, i * 420)
    })
  }
  const burn = (rooms: RoomId[]) => {
    if (burnt) return
    burnt = true
    try {
      v3?.burn(rooms)
    } catch (err) {
      console.error("[cabal] vote3d burn failed", err)
    }
    for (const [id, c] of cells) {
      const hit = rooms.includes(id)
      c.box.classList.add(hit ? "burn" : "safe")
      const m = el("div", hit ? "cb-mark cb-x" : "cb-mark cb-ok")
      m.style.left = `${c.centre.x}px`
      m.style.top = `${c.centre.y}px`
      m.style.backgroundImage = hit ? X_ART : OK_ART
      tokens.append(m)
    }
    playCue("sweep", rooms[0] ? { room: rooms[0] } : {})
  }

  // ---------- show / hide ----------
  let shown = false
  let hideTimer = 0
  const show = () => {
    if (shown) return
    shown = true
    window.clearTimeout(hideTimer)
    voteStarted = false
    burnt = false
    placed.clear()
    tokens.innerHTML = ""
    v3?.clear()
    queue.length = 0
    speaking = null
    caps.clear()
    renames = []
    root.classList.remove("voting", "out")
    for (const c of cells.values()) {
      c.box.classList.remove("burn", "lured", "safe")
    }
    for (const s of seats.values()) s.root.classList.remove("voted", "speaking", "dim", "hears")
    root.classList.add("on")
    host.classList.add("cabal-on") // the stage hides its chat column while the cabal owns the frame
    flash.classList.remove("go")
    void flash.offsetWidth
    flash.classList.add("go")
    playCue("shutter")
    playCue("tension", { level: 3 })
  }
  const hide = () => {
    if (!shown) return
    shown = false
    root.classList.remove("on")
    host.classList.remove("cabal-on")
    for (const s of seats.values()) s.root.classList.remove("voted", "speaking", "dim", "hears")
    speaking = null
    queue.length = 0
  }

  // ---------- data ----------
  let snap: StageSnap | null = null

  const applySnap = (s: StageSnap) => {
    snap = s

    heat?.apply(s.rumors, s.phase === "hunting" || s.phase === "reveal")
    const maxCount = Math.max(1, ...s.rooms.map((r) => r.count))
    for (const r of s.rooms) {
      const c = cells.get(r.id)
      if (c) drawGhosts(c, r.count, maxCount)
    }
    if (s.phase === "hunting") {
      const wasShown = shown
      show()
      for (const h of s.hunters) {
        const seat = seats.get(h.id)
        if (seat) setLean(seat, h.lean, h.conviction, h.swayedBy, !wasShown)
      }
      if (!voteStarted && s.endsAt - s.now <= VOTE_LEAD_MS) startVote(s)
    } else if (s.phase === "reveal" && shown) {
      // the real votes land with the reveal: correct any token, burn the swept rooms, then the stage's reveal
      if (!voteStarted) startVote(s)
      s.hunters.forEach((h) => h.vote && placed.get(h.id) !== h.vote && slam(h.id, h.vote, 0))
      if (s.sweptRooms.length) burn(s.sweptRooms)
      if (!hideTimer || !root.classList.contains("out")) {
        root.classList.add("out")
        hideTimer = window.setTimeout(hide, BURN_MS)
      }
    } else hide()
  }
  const applyItem = (i: FeedItem) => {
    if (!shown || burnt) return
    if (i.kind === "whisper") {
      const to = HUNTER.has(i.to as HunterId) ? (i.to as HunterId) : null
      return whisperNow({ who: to ?? "medium", text: i.text, whisper: { to, room: roomIn(i.text) } })
    }
    if (voteStarted) return
    if (i.kind === "say" && HUNTER.has(i.from as HunterId)) say({ who: i.from as HunterId, text: i.text, voice: i.voice })
    else if (i.kind === "dm" && HUNTER.has(i.from as HunterId))
      say({ who: i.from as HunterId, to: HUNTER.has(i.to as HunterId) ? (i.to as HunterId) : undefined, text: i.text, voice: i.voice })
  }

  // ---------- frame loop ----------
  const frame = (now: number) => {
    requestAnimationFrame(frame)
    if (!shown) return
    if (!speaking && queue.length) startLine(queue.shift()!, now)
    // the whisperer's name arrives a moment later (swayedBy on the next snapshot)
    renames = renames.filter((r) => {
      const to = r.line.whisper?.to
      if (!to || !seats.get(to)?.swayedBy) return true
      r.set(`${whisperer(r.line)} whispers to ${hunterLabel(to)}`)
      return false
    })
    if (speaking) {
      if (now > speaking.until) {
        speaking = null
        if (!queue.length) for (const s of seats.values()) s.root.classList.remove("speaking", "dim")
      }
    }
    for (const s of seats.values()) {
      if (s.swingT < 1) s.swingT = Math.min(1, s.swingT + 1 / 42)
      // a whooshing swing with a little overshoot
      const t = s.swingT
      const e = t === 1 ? 1 : 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.12
      s.cur = { x: s.from.x + (s.to.x - s.from.x) * e, y: s.from.y + (s.to.y - s.from.y) * e }
      const vis = s.lean ? 1 : 0
      s.needle.setAttribute("x1", String(s.at.x + (s.at.x < W / 2 ? 120 : -120)))
      s.needle.setAttribute("y1", String(s.at.y))
      s.needle.setAttribute("x2", String(s.cur.x))
      s.needle.setAttribute("y2", String(s.cur.y))
      s.needle.style.opacity = String(vis * (0.35 + s.conviction / 140))
      s.needle.style.strokeWidth = String(4 + s.conviction / 12)
      s.tip.setAttribute("cx", String(s.cur.x))
      s.tip.setAttribute("cy", String(s.cur.y))
      s.tip.style.opacity = String(vis)
    }
  }
  requestAnimationFrame(frame)

  const api: Cabal = {
    item: (i) => !demo && applyItem(i),
    snap: (s) => !demo && applySnap(s),
  }
  if (demo) runDemo({ snap: applySnap, item: applyItem })
  void snap
  return api
}

/** seats.json from the Blender lane: tolerant of {seats:[{x,y}|[x,y]], map:{x,y,w,h}|[x,y,w,h]} in 1920x1080 px. */
function parseSeats(j: unknown): Layout | null {
  const o = j as Record<string, unknown>
  const pt = (v: unknown): Pt | null => {
    if (Array.isArray(v) && v.length >= 2) return { x: Number(v[0]), y: Number(v[1]) }
    const p = v as Record<string, unknown> | null
    if (p && typeof p === "object" && "x" in p && "y" in p) return { x: Number(p.x), y: Number(p.y) }
    return null
  }
  const seatsRaw = o?.seats
  const list = Array.isArray(seatsRaw)
    ? seatsRaw.map(pt)
    : seatsRaw && typeof seatsRaw === "object"
      ? HUNTERS.map((h) => pt((seatsRaw as Record<string, unknown>)[h.id]))
      : []
  const m = (o?.map ?? o?.table ?? o?.mapRect) as unknown
  let map: Layout["map"] | null = null
  if (Array.isArray(m) && m.length >= 4) map = { x: +m[0], y: +m[1], w: +m[2], h: +m[3] }
  else if (m && typeof m === "object") {
    const r = m as Record<string, number>
    if ("w" in r || "width" in r) map = { x: +r.x, y: +r.y, w: +(r.w ?? r.width), h: +(r.h ?? r.height) }
    else if ("x0" in r) map = { x: +r.x0, y: +r.y0, w: +r.x1 - +r.x0, h: +r.y1 - +r.y0 }
  }
  if (list.length < 4 || list.some((p) => !p || !isFinite(p.x) || !isFinite(p.y)) || !map || !isFinite(map.w)) return null
  return { seats: list.slice(0, 4) as Pt[], map }
}
