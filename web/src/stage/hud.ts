// DOM layers over the canvas (crisp text at any scale): top bar, clock tower face, room plaques, hunter labels
// and speech, QR, leaderboard, banners, floaters, outage static, revive beat, finale.
import QRCode from "qrcode"
import { BEATS_PER_ROUND, GHOST_COLORS, HUNTERS, INTRO_CARDS, PUBLIC_ID_PREFIX, ROOMS, ROOMS_TO_WIN, ROOM_STYLE, TIMING, WELCOME, type HunterId, type Phase, type RoomId, type StageSnap } from "../../../contract/protocol"
import { avatarDataUrl } from "../avatar/index"
import { hunterPortrait, talk } from "../feed/portrait"
import { playEpilogue, playStory, type StoryHandle } from "../story/index"
import { FLOODS, ditherBackground } from "../fx/ditherGradient"
import { CLOCK, MANSION_W, ROOM_BOXES, ROOM_IDS } from "./layout"

const WELCOME_MS = 6500

/** publicId = first 10 hex of sha256("haunt:" + ghostId): avatars are seeded by it everywhere (contract). */
const publicIds = new Map<string, Promise<string>>()
function publicIdOf(ghostId: string): Promise<string> {
  let p = publicIds.get(ghostId)
  if (!p) {
    p = crypto.subtle.digest("SHA-256", new TextEncoder().encode(PUBLIC_ID_PREFIX + ghostId)).then((buf) =>
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10),
    )
    publicIds.set(ghostId, p)
  }
  return p
}
/** Sets an <img> to the ghost's avatar (fire when streak >= 3). */
function setAvatar(img: HTMLImageElement, ghostId: string, colorIndex: number, fire: boolean, size: number): void {
  const key = `${ghostId}|${fire}`
  if (img.dataset.key === key) return
  img.dataset.key = key
  void publicIdOf(ghostId).then((pid) => {
    if (img.dataset.key === key) img.src = avatarDataUrl(pid, size, { fire, colorIndex })
  })
}

/** Finale social row: placeholder links, edit here. */
const SOCIALS: { name: "x" | "github" | "web"; label: string; url: string }[] = [
  // no literal "@handle" ever: a button whose label still says @handle is not shown
  { name: "x", label: "Follow me on X @handle", url: "https://x.com/handle" },
  { name: "github", label: "Star us on GitHub @gessa-ai", url: "https://github.com/gessa-ai" },
  { name: "web", label: "gessa.ai", url: "https://gessa.ai" },
]

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}
const fmt = (n: number) => Math.round(n).toLocaleString("en-US")
const HUNTER = new Map(HUNTERS.map((h) => [h.id, h]))
const ROOM_NAME = new Map<RoomId, string>(ROOMS.map((r) => [r.id, r.name]))
const SVG = "http://www.w3.org/2000/svg"

interface RoomLabel {
  root: HTMLElement
  count: HTMLElement
  seats: HTMLElement
  leans: HTMLElement
  leanKey: string
  shown: number
  seatKey: string
}
const SEAT_PIPS = 20
const GLYPH: Record<string, string> = { triangle: "▲", diamond: "◆", circle: "●", square: "■", star: "★", moon: "☾" }
const PHASE_MS: Record<Phase, number> = {
  lobby: TIMING.lobbyMs,
  intro: TIMING.introMs,
  hide: TIMING.hideMs,
  hunting: TIMING.huntingMs,
  reveal: TIMING.revealMs,
  finale: TIMING.finaleMs,
}

export class Hud {
  private counters: Record<"online" | "humans" | "joinedToday", { b: HTMLElement; shown: number; target: number }>
  private round = el("div", "st-round", "")
  private clock = el("div", "st-clock")
  private clockText = el("b", "", "2:30")
  private clockLabel = el("span", "", "LOBBY")
  private ring: SVGCircleElement
  private possess = el("div", "st-possess")
  private rooms = new Map<RoomId, RoomLabel>()
  private council = el("div", "st-council")
  private cards = new Map<HunterId, { root: HTMLElement; vote: HTMLElement; bubble: HTMLElement }>()
  private big = el("div", "st-big")
  private bigH = el("div", "st-big-h", "")
  private bigSub = el("div", "st-big-sub", "")
  private bigKey = ""
  private top5 = el("div", "st-top5")
  private intro = el("div", "st-intro")
  private storyLayer = el("div", "st-story")
  private story: StoryHandle | null = null
  private epilogueLayer = el("div", "st-epilogue")
  private epilogue: StoryHandle | null = null
  private epilogueTimer = 0
  private killcamBox = el("div", "st-killcam")
  private killTimer = 0
  private introSeg = -1
  /** Fires once per intro segment (0 = welcome, 1..3 = cards) so the stage can play one sting each. */
  onIntroSegment: (seg: number) => void = () => undefined
  private beat = 0
  private snapRef: StageSnap | null = null
  private qr = el("div", "st-qr big")
  private qrCanvas = el("canvas", "")
  private qrErr = el("div", "st-qr-err")
  private souls = el("div", "st-souls")
  private soulsNum = el("b", "", "0")
  private dim = el("div", "st-dim")
  private banner = el("div", "st-banner")
  private staticBox = el("div", "st-static")
  private staticCanvas = el("canvas", "")
  private staticSub = el("div", "st-dead-sub", "")
  private staticWhy = el("div", "st-dead-why", "")
  private revive = el("div", "st-revive")
  private finale = el("div", "st-finale")
  private toastEl = el("div", "st-toast")
  private lieBox = el("div", "st-lie")
  private floaters = el("div", "st-floaters")
  private tagLayer = el("div", "st-tags")
  private tags: { id: string; node: HTMLElement; until: number }[] = []
  private qrSmallForced: boolean | null = null
  private phase: Phase = "lobby"
  private staticOn = false
  private downSince = 0
  private toastTimer = 0
  private bannerTimer = 0
  private lieTimer = 0

  constructor(
    private st: HTMLElement,
    private cam: HTMLElement,
  ) {
    const top = el("div", "st-top")
    const title = el("div", "st-title")
    const img = new Image()
    img.className = "st-emblem"
    img.onerror = () => img.remove()
    img.src = "/art/title.webp"
    title.append(img, el("span", "", "Haunt the Room"))
    const cwrap = el("div", "st-counters")
    const mk = (label: string) => {
      const d = el("div", "st-counter")
      const b = el("b", "", "0")
      d.append(b, el("span", "", label))
      cwrap.append(d)
      return { b, shown: 0, target: 0 }
    }
    this.counters = { online: mk("actual people"), humans: mk("bots"), joinedToday: mk("died today") }
    top.append(title, this.round, cwrap)

    // clock tower face
    this.clock.style.left = `${CLOCK.cx - 86}px`
    this.clock.style.top = `${CLOCK.cy - 86}px`
    const svg = document.createElementNS(SVG, "svg")
    svg.setAttribute("viewBox", "0 0 172 172")
    const face = document.createElementNS(SVG, "circle")
    face.setAttribute("class", "face")
    face.setAttribute("cx", "86")
    face.setAttribute("cy", "86")
    face.setAttribute("r", "84")
    const ticks = document.createElementNS(SVG, "g")
    ticks.setAttribute("class", "ticks")
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const l = document.createElementNS(SVG, "line")
      l.setAttribute("x1", String(86 + Math.sin(a) * 68))
      l.setAttribute("y1", String(86 - Math.cos(a) * 68))
      l.setAttribute("x2", String(86 + Math.sin(a) * (i % 3 === 0 ? 60 : 64)))
      l.setAttribute("y2", String(86 - Math.cos(a) * (i % 3 === 0 ? 60 : 64)))
      ticks.append(l)
    }
    const bg = document.createElementNS(SVG, "circle")
    bg.setAttribute("class", "ring-bg")
    bg.setAttribute("cx", "86")
    bg.setAttribute("cy", "86")
    bg.setAttribute("r", "74")
    this.ring = document.createElementNS(SVG, "circle")
    this.ring.setAttribute("class", "ring")
    this.ring.setAttribute("cx", "86")
    this.ring.setAttribute("cy", "86")
    this.ring.setAttribute("r", "74")
    this.ring.setAttribute("stroke-dasharray", String(2 * Math.PI * 74))
    svg.append(face, ticks, bg, this.ring)
    const digits = el("div", "digits")
    digits.append(this.clockText, this.clockLabel)
    this.clock.append(svg, digits)
    this.possess.style.left = `${CLOCK.cx}px`
    this.possess.style.top = `${CLOCK.cy + 104}px`

    // room plaques: ROOM_STYLE colour + glyph + live count
    for (const id of ROOM_IDS) {
      const b = ROOM_BOXES[id].inner
      const style = ROOM_STYLE[id]
      const root = el("div", "st-room")
      root.style.setProperty("--rc", style.color)
      Object.assign(root.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })
      const plaque = el("div", "st-plaque")
      plaque.append(el("span", "st-glyph", GLYPH[style.glyph] ?? "●"), el("span", "", ROOM_NAME.get(id) ?? id))
      const count = el("div", "st-count", "0")
      const seats = el("div", "st-seats")
      const leans = el("div", "st-leans")
      root.append(plaque, count, seats, leans)
      this.rooms.set(id, { root, count, seats, leans, leanKey: "", shown: 0, seatKey: "" })
    }
    const roomsLayer = el("div", "st-rooms")
    roomsLayer.style.position = "absolute"
    roomsLayer.style.inset = "0"
    roomsLayer.style.pointerEvents = "none"
    roomsLayer.append(...[...this.rooms.values()].map((r) => r.root))

    for (const h of HUNTERS) {
      const root = el("div", "st-card")
      root.style.setProperty("--hc", h.color)
      const img = hunterPortrait(h.id, 192)
      img.classList.add("st-card-img")
      const vote = el("div", "st-card-vote", "")
      const bubble = el("div", "st-card-bubble", "")
      root.append(bubble, img, el("div", "st-card-ai", "AI agent"), el("div", "st-card-name", h.name.replace(/^The /, "")), vote)
      this.council.append(root)
      this.cards.set(h.id, { root, vote, bubble })
    }
    this.big.append(this.bigH, this.bigSub)

    // QR (lobby: giant; hunt: corner)
    this.qr.append(el("div", "st-qr-cta", "Scan to play."), this.qrCanvas, el("div", "st-qr-url", ""), this.qrErr)
    this.souls.append(
      el("span", "st-cta", "Scan to pass away."),
      el("span", "st-cta-sub", "Your phone becomes a ghost in this house. Four AIs will try to find it."),
      this.soulsNum,
      el("span", "st-souls-l", "dearly departed"),
    )

    // overlays
    this.staticBox.append(this.staticCanvas, el("div", "st-dead", "The house is dead."), this.staticSub, this.staticWhy)
    this.staticCanvas.width = 260
    this.staticCanvas.height = 215
    this.revive.append(el("b", "", ""), el("span", "", "Nobody moved. Same rooms, same clock."))
    const social = el("div", "socials")
    for (const x of SOCIALS.filter((x) => !x.label.includes("@handle"))) {
      const a = el("a", "soc-btn")
      a.href = x.url
      a.append(el("i", `soc px-${x.name}`), el("span", "", x.label))
      social.append(a)
    }
    this.finale.append(el("div", "flood"), el("div", "drips"), el("div", "words", ""), el("div", "fboard"), el("div", "stats"), social)
    ditherBackground(this.intro, FLOODS.night)
    const introStill = new Image()
    introStill.className = "st-intro-still"
    introStill.onload = () => this.intro.prepend(introStill)
    introStill.src = "/3d/stage/intro.webp"

    cam.append(roomsLayer, this.tagLayer, this.floaters)
    st.append(this.storyLayer, this.killcamBox, this.big, this.council, this.top5, this.intro, top, this.dim, this.clock, this.possess, this.qr, this.souls, this.banner, this.lieBox, this.staticBox, this.revive, this.finale, this.epilogueLayer, this.toastEl)
    void this.loadQr()
  }

  private async loadQr(): Promise<void> {
    let base = location.origin
    const fake = new URLSearchParams(location.search).has("fake")
    try {
      if (fake) throw Object.assign(new Error("fake"), { fakeBase: "https://haunt.gessa.ai" })
      const res = await fetch("/api/config")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const cfg = (await res.json()) as { publicUrl?: string }
      if (!cfg.publicUrl) throw new Error("no publicUrl")
      base = cfg.publicUrl.replace(/\/+$/, "")
      if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base)) throw new Error(`publicUrl ${base} is not public https`)
      this.qr.style.display = ""
      this.qrErr.textContent = ""
    } catch (err) {
      if (fake) base = "https://haunt.gessa.ai" // screenshot mode: the demo's public origin
      else {
      // never show a QR that phones cannot reach: hide it and say why (presenter-visible toast)
      this.qr.style.display = "none"
      if (!new URLSearchParams(location.search).has("fake")) this.toast(`QR hidden: ${err instanceof Error ? err.message : String(err)}`, true)
      console.error("[stage] /api/config", err)
      window.setTimeout(() => void this.loadQr(), 10_000)
      return
      }
    }
    const url = `${base}/p`
    await QRCode.toCanvas(this.qrCanvas, url, { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#120b06", light: "#efe3c8" } })
    this.qrCanvas.style.removeProperty("width")
    this.qrCanvas.style.removeProperty("height")
    const label = this.qr.querySelector(".st-qr-url")
    if (label) label.textContent = url.replace(/^https?:\/\//, "")
  }

  toggleQr(): void {
    const small = this.qr.classList.contains("small")
    this.qrSmallForced = !small
    this.layoutQr()
  }
  private layoutQr(): void {
    const small = this.qrSmallForced ?? this.phase !== "lobby"
    this.qr.classList.toggle("small", small)
    this.qr.classList.toggle("big", !small)
    this.dim.style.opacity = !small && this.phase === "lobby" ? "1" : "0"
    this.souls.style.opacity = this.phase === "lobby" ? "1" : "0"
  }

  setPhase(phase: Phase): void {
    if (phase !== this.phase && phase !== "finale" && !(phase === "lobby" && this.epilogue)) this.stopEpilogue()
    this.lobbyStory(phase === "lobby")
    if (phase === this.phase) return
    this.phase = phase
    this.qrSmallForced = null
    this.layoutQr()
    this.council.classList.toggle("on", phase === "hunting" || phase === "reveal")
    this.st.classList.toggle("hunting", phase === "hunting")
    this.st.classList.toggle("playing", phase !== "lobby" && phase !== "finale")
    this.st.classList.toggle("lobby", phase === "lobby")
    this.st.classList.toggle("hiding", phase === "hide")
    this.lobbyStory(phase === "lobby")
    if (phase !== "reveal") this.killcamBox.classList.remove("on")
    if (phase !== "finale") {
      this.finale.className = "st-finale"
      this.finaleShown = false
    }
  }

  apply(s: StageSnap, clockNow: number): void {
    this.setPhase(s.phase)
    this.round.textContent = `Round ${s.round} · ${s.phase === "lobby" ? "the door's open" : s.phase === "finale" ? "closing time" : s.beat ? `beat ${s.beat} of ${BEATS_PER_ROUND}` : "the hunt"}`
    this.counters.online.target = s.counters.humans
    this.counters.humans.target = s.counters.bots
    this.counters.joinedToday.target = s.counters.joinedToday
    const possessed = s.rooms.filter((r) => r.possessed).length
    this.possess.innerHTML = ""
    for (let i = 0; i < ROOMS_TO_WIN; i++) this.possess.append(el("i", i < possessed ? "on" : ""))
    this.possess.append(document.createTextNode(` ${Math.min(possessed, ROOMS_TO_WIN)} of ${ROOMS_TO_WIN} rooms possessed`))
    this.possess.style.opacity = s.phase === "lobby" || s.phase === "finale" ? "0" : "1"
    for (const r of s.rooms) {
      const v = this.rooms.get(r.id)
      if (!v) continue
      const cap = r.cap ?? 0
      if (v.shown !== r.count || !v.seatKey.endsWith(`/${cap}`)) {
        v.shown = r.count
        v.count.textContent = cap ? `${r.count}/${cap}` : String(r.count)
      }
      // musical chairs: candles fill as seats are taken; a full room glows
      const pips = Math.min(SEAT_PIPS, cap)
      const lit = cap ? Math.min(pips, Math.round((r.count / cap) * pips)) : 0
      const key = `${lit}/${pips}/${cap}`
      if (key !== v.seatKey) {
        v.seatKey = key
        v.seats.innerHTML = ""
        for (let i = 0; i < pips; i++) v.seats.append(el("i", i < lit ? "on" : ""))
      }
      v.root.classList.toggle("full", cap > 0 && r.count >= cap)
      v.root.classList.toggle("possessed", r.possessed)
      v.root.classList.toggle("swept", r.swept && s.phase === "reveal")
    }
    // POKER: during hide each hunter openly leans toward a room (maybe a bluff): a hunter-colour eye on that room
    for (const [id, v] of this.rooms) {
      const who = s.phase === "hide" ? s.hunters.filter((h) => h.lean === id).map((h) => h.id) : []
      const key = who.join(",")
      if (key === v.leanKey) continue
      v.leanKey = key
      v.leans.innerHTML = ""
      for (const h of who) {
        const eye = el("i", "st-eye")
        eye.style.setProperty("--hc", HUNTER.get(h)?.color ?? "#fff")
        eye.title = HUNTER.get(h)?.name ?? h
        v.leans.append(eye)
      }
    }
    this.beat = s.beat
    this.snapRef = s
    for (const h of s.hunters) {
      const c = this.cards.get(h.id)
      if (!c) continue
      const show = s.phase === "reveal" && h.vote
      c.vote.textContent = show && h.vote ? `${GLYPH[ROOM_STYLE[h.vote].glyph]} ${(ROOM_NAME.get(h.vote) ?? h.vote).replace(/^The /, "")}` : s.phase === "hunting" ? "…" : ""
      c.vote.style.background = show && h.vote ? ROOM_STYLE[h.vote].color : ""
    }
    this.soulsNum.textContent = fmt(s.counters.humans)
    this.renderBoard(s)
  }

  mountBoard(slot: HTMLElement): void {
    slot.append(this.podium)
  }

  /** The live podium: rows keyed by ghost, positioned by rank (they slide), scores tick up, streak >= 3 burns. */
  private podium = el("div", "st-podium")
  private podRows = new Map<string, { row: HTMLElement; score: HTMLElement; face: HTMLImageElement; shown: number; target: number }>()
  private renderBoard(s: StageSnap): void {
    // the podium (top 3) + whoever is in last place (L2: StageSnap.last; until then no last row)
    const lastRow = (s as StageSnap & { last?: [string, string, number, number, number] | null }).last ?? null
    const top = [...(s.top ?? []).slice(0, 3), ...(lastRow && !(s.top ?? []).slice(0, 3).some((t) => t[0] === lastRow[0]) ? [lastRow] : [])]
    this.podium.style.display = s.phase !== "lobby" && s.phase !== "finale" && top.length ? "" : "none"
    const live = new Set<string>()
    top.forEach(([id, name, colorIndex, score, streak], rank) => {
      live.add(id)
      let r = this.podRows.get(id)
      if (!r) {
        const row = el("div", "st-pod-row enter")
        const scoreEl = el("b", "st-pod-score", fmt(score))
        const face = el("img", "st-pod-face")
        row.append(el("span", "st-pod-rank", ""), face, el("span", "st-pod-name", name), scoreEl)
        this.podium.append(row)
        r = { row, score: scoreEl, face, shown: score, target: score }
        this.podRows.set(id, r)
        window.setTimeout(() => row.classList.remove("enter"), 30)
      }
      r.target = score
      const rankEl = r.row.querySelector(".st-pod-rank")
      const isLast = lastRow !== null && id === lastRow[0] && rank === 3
      if (rankEl) rankEl.textContent = isLast ? "last" : String(rank + 1)
      r.row.classList.toggle("last", isLast)
      const nameEl = r.row.querySelector<HTMLElement>(".st-pod-name")
      if (nameEl) {
        nameEl.textContent = name
        nameEl.style.color = GHOST_COLORS[colorIndex % GHOST_COLORS.length]
      }
      r.row.style.transform = `translateY(${rank * 40 + (rank === 3 ? 10 : 0)}px)`
      r.row.classList.toggle("first", rank === 0)
      r.row.classList.toggle("fire", (streak ?? 0) >= 3)
      setAvatar(r.face, id, colorIndex, (streak ?? 0) >= 3, 40)
    })
    for (const [id, r] of this.podRows) {
      if (live.has(id)) continue
      r.row.classList.add("leave")
      this.podRows.delete(id)
      window.setTimeout(() => r.row.remove(), 500)
    }
  }

  /** Per frame: clock, counters easing, hunter labels, bubbles, static noise. */
  frame(clockNow: number, endsAt: number, wispAt: (id: string) => { x: number; y: number } | null): void {
    const dur = PHASE_MS[this.phase]
    const left = endsAt > clockNow ? endsAt - clockNow : 0
    const shown = left
    const secs = Math.ceil(shown / 1000)
    this.clockText.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
    const pips = this.beat > 0 && this.phase !== "finale" ? Array.from({ length: BEATS_PER_ROUND }, (_, i) => (i < this.beat ? "■" : "□")).join("") : ""
    if (this.clockLabel.textContent !== pips) this.clockLabel.textContent = pips
    const frac = left === 0 ? (this.phase === "lobby" ? 1 : 0) : Math.min(1, left / dur)
    this.ring.style.strokeDashoffset = String(2 * Math.PI * 74 * (1 - frac))
    this.clock.classList.toggle("urgent", this.phase === "hide" && left > 0 && left < 3_000)
    this.bigFrame(left)
    for (const c of Object.values(this.counters)) {
      if (c.shown !== c.target) {
        const d = c.target - c.shown
        c.shown = Math.abs(d) < 1 ? c.target : c.shown + d * 0.18
        c.b.textContent = fmt(c.shown)
      }
    }
    for (const r of this.podRows.values()) {
      if (r.shown !== r.target) {
        const d = r.target - r.shown
        r.shown = Math.abs(d) < 1 ? r.target : r.shown + d * 0.12
        r.score.textContent = fmt(r.shown)
      }
    }
    const t = performance.now()
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i]
      const p = wispAt(tag.id)
      if (!p || t > tag.until) {
        tag.node.remove()
        this.tags.splice(i, 1)
        continue
      }
      tag.node.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - 22).toFixed(1)}px)`
    }
    if (this.staticOn) this.drawStatic(clockNow)
  }

  say(hunter: HunterId, text: string): void {
    talk(hunter, 2500)
    const c = this.cards.get(hunter)
    if (!c) return
    c.bubble.textContent = text
    c.bubble.classList.remove("show")
    void c.bubble.offsetWidth
    c.bubble.classList.add("show")
  }

  /** ONE message at a time, huge: what the room should do right now. */
  private bigFrame(left: number): void {
    const secs = Math.ceil(left / 1000)
    let h = ""
    let sub = ""
    let cls = ""
    this.introFrame(left)
    if (this.phase === "hide") {
      h = left > 0 ? String(secs) : "0"
      sub = "Pick a room on your phone."
      cls = "hide"
    } else if (this.phase === "hunting") {
      h = "The hunters are arguing."
      sub = "Four AI agents, one vote each. The top two rooms get searched."
      cls = "hunting"
    } else if (this.phase === "reveal") {
      const swept = this.snapRef?.sweptRooms ?? []
      h = ""
      sub = "" // the stamps and the council's votes already say it
      void swept
      cls = "reveal"
    }
    const key = `${cls}|${h}|${sub}`
    if (key === this.bigKey) return
    const restart = cls !== this.big.dataset.cls || (cls === "hide" && h !== this.bigH.textContent)
    this.bigKey = key
    this.big.dataset.cls = cls
    this.big.className = `st-big ${cls}`
    this.bigH.textContent = h
    this.bigSub.textContent = sub
    if (restart && cls) {
      this.bigH.classList.remove("pop")
      void this.bigH.offsetWidth
      this.bigH.classList.add("pop")
    }
    this.council.classList.toggle("on", this.phase === "hunting" || this.phase === "reveal")
      }

  /** INTRO: a title sequence, synced to the absolute deadline: welcome (4 s), then the three cards (4 s each). */
  private introFrame(left: number): void {
    const on = this.phase === "intro"
    this.intro.classList.toggle("on", on)
    if (!on) {
      this.introSeg = -1
      return
    }
    // welcome over the first 6.5 s (the 3D push-in when it plays), then the three cards share the rest
    const el0 = TIMING.introMs - left
    const cards = INTRO_CARDS.length
    const cardMs = (TIMING.introMs - WELCOME_MS) / cards
    const seg = el0 < WELCOME_MS ? 0 : Math.min(cards, 1 + Math.floor((el0 - WELCOME_MS) / cardMs))
    if (seg === this.introSeg) return
    this.introSeg = seg
    for (const c of [...this.intro.children]) if (!c.classList.contains("st-intro-still") && !c.classList.contains("st-showpiece")) c.remove()
    const box = el("div", `st-intro-seg seg-${seg}`)
    if (seg === 0) {
      box.append(el("div", "st-intro-kicker", WELCOME.kicker), el("div", "st-intro-title", WELCOME.title))
    } else {
      const card = INTRO_CARDS[seg - 1]
      const ill = el("div", `st-ill ill-${Math.min(seg, 3)}`)
      ill.append(el("i", ""), el("i", ""), el("b", ""))
      box.append(ill, el("div", "st-intro-card", card.title), el("div", "st-intro-body", card.body))
    }
    this.intro.append(box)
    this.onIntroSegment(seg)
  }

  /** Zoom onto the swept rooms at reveal; pull back to the whole house otherwise. */
  camera(rooms: RoomId[]): void {
    if (!rooms.length) {
      this.cam.style.transform = ""
      return
    }
    // a slow cinematic push-in that keeps the whole house on screen (council above, caption below)
    void ROOM_BOXES
    this.cam.style.transform = "translate(-28px, -50px) scale(1.1)"
  }

  /** REVEAL kill cam (lane L15's Blender stills): cut into the swept rooms for ~2.4 s, then back to the board.
   *  A room without a rendered still is skipped (the board's own reveal carries it). */
  killcam(rooms: RoomId[], caught: Map<RoomId, number>): void {
    const dev = new URLSearchParams(location.search).has("fake")
    const srcs = (id: RoomId) => [`/3d/stage/killcam-${id}-swept.webp`, ...(dev ? ["/3d/preview-killcam.png"] : [])]
    const load = (urls: string[]): Promise<string | null> =>
      urls.length === 0
        ? Promise.resolve(null)
        : new Promise((res) => {
            const img = new Image()
            img.onload = () => res(urls[0])
            img.onerror = () => void load(urls.slice(1)).then(res)
            img.src = urls[0]
          })
    void Promise.all(rooms.map((id) => load(srcs(id)))).then((urls) => {
      const shots = rooms.map((id, i) => ({ id, url: urls[i] })).filter((x): x is { id: RoomId; url: string } => !!x.url)
      if (!shots.length || this.phase !== "reveal") return
      this.killcamBox.innerHTML = ""
      for (const { id, url } of shots) {
        const panel = el("div", "st-kc")
        panel.style.setProperty("--rc", ROOM_STYLE[id].color)
        panel.style.backgroundImage = `url("${url}")`
        const n = caught.get(id) ?? 0
        panel.append(el("div", "st-kc-room", (ROOM_NAME.get(id) ?? id).replace(/^The /, "")), el("div", "st-kc-n", n ? `${n} CAUGHT` : "Empty."))
        this.killcamBox.append(panel)
      }
      this.killcamBox.className = `st-killcam on n${shots.length}`
      window.clearTimeout(this.killTimer)
      this.killTimer = window.setTimeout(() => this.killcamBox.classList.remove("on"), 2400)
    })
  }

  /** "NEW #1" stinger. */
  newLeader(name: string): void {
    // one focal element per phase: the stinger lives in the podium column, never over the house
    const flash = el("div", "st-podflash")
    flash.append(el("b", "", `${name} is winning`))
    this.podium.append(flash)
    window.setTimeout(() => flash.remove(), 2600)
    this.podium.classList.remove("crown")
    void this.podium.offsetWidth
    this.podium.classList.add("crown")
  }

  /** "3d": for lane L16's /stage3d. Countdown + possession tracker sit in the sky band, hunter portraits stand
   *  outside the house (left/right margins) until reveal, room plaques are hidden (3D labels its own rooms). */
  setLayout(mode: "2d" | "3d"): void {
    this.st.classList.toggle("layout-3d", mode === "3d")
  }

  /** FINALE arc: the podium holds ~3 s (L20b's ending shows its own podium), then L20's 7 s epilogue (no winner, no epilogue). When it ends: the lobby
   *  reel if the House has moved on to the lobby (auto mode), else hold on the podium (show mode). */
  scheduleEpilogue(winner: "ghosts" | "hunters" | null, afterMs = 3000): void {
    this.stopEpilogue()
    if (!winner) return
    this.epilogueTimer = window.setTimeout(() => {
      if (this.phase !== "finale") return
      try {
        this.epilogueLayer.classList.add("on")
        this.epilogue = playEpilogue(this.epilogueLayer, winner, { skippable: false })
        void this.epilogue.done.then(() => this.endEpilogue())
      } catch (err) {
        console.error("[stage] epilogue failed; holding the podium", err)
        this.endEpilogue()
      }
    }, afterMs)
  }
  private endEpilogue(): void {
    this.epilogue = null
    this.epilogueLayer.classList.remove("on")
    this.epilogueLayer.innerHTML = ""
    this.lobbyStory(this.phase === "lobby")
  }
  /** Presenter keys and phase changes (other than finale -> lobby mid-epilogue) end it at once. */
  stopEpilogue(): void {
    window.clearTimeout(this.epilogueTimer)
    if (this.epilogue) {
      this.epilogue.stop()
      this.endEpilogue()
    }
  }

  /** LOBBY: lane L20's story reel loops under the QR; anything else stops it. */
  private lobbyStory(on: boolean): void {
    if (on && this.epilogue) return // the epilogue finishes first, then the reel starts
    if (on && !this.story) {
      try {
        this.story = playStory(this.storyLayer, { loop: true })
        this.st.classList.add("storying")
      } catch (err) {
        console.error("[stage] story reel failed; lobby shows the house", err)
      }
    } else if (!on && this.story) {
      this.story.stop()
      this.story = null
      this.storyLayer.innerHTML = ""
      this.st.classList.remove("storying")
    }
  }

  get introEl(): HTMLElement {
    return this.intro
  }
  get finaleEl(): HTMLElement {
    return this.finale
  }
  /** While a 3D showpiece plays: the intro scrim goes clear; the finale holds its podium back. */
  introShot(on: boolean): void {
    this.intro.classList.toggle("shot", on)
  }
  finaleShot(on: boolean): void {
    this.finale.classList.toggle("shot", on)
  }

  /** Between beats: the top 5 slides in for a moment. */
  slideTop5(s: StageSnap): void {
    const top = (s.top ?? []).slice(0, 5)
    if (!top.length) return
    this.top5.innerHTML = ""
    this.top5.append(el("div", "st-top5-h px-crown"))
    top.forEach(([, name, colorIndex, score], i) => {
      const row = el("div", "st-top5-row")
      const n = el("span", "", `${i + 1}. ${name}`)
      n.style.color = GHOST_COLORS[colorIndex % GHOST_COLORS.length]
      row.append(n, el("b", "", fmt(score)))
      this.top5.append(row)
    })
    this.top5.classList.remove("show")
    void this.top5.offsetWidth
    this.top5.classList.add("show")
  }

  /** One banner at a time: a short queue; a more important banner replaces the one on screen. */
  private bannerQ: { text: string; sub: string; color: string; prio: number }[] = []
  private bannerPrio = -1
  showBanner(text: string, sub = "", color = "", prio = 1): void {
    if (this.bannerPrio >= 0 && prio <= this.bannerPrio) {
      this.bannerQ = this.bannerQ.filter((b) => b.text !== text).slice(-1)
      this.bannerQ.push({ text, sub, color, prio })
      return
    }
    this.bannerPrio = prio
    this.banner.textContent = text
    if (sub) this.banner.append(el("small", "", sub))
    this.banner.style.color = color
    this.banner.classList.remove("show")
    void this.banner.offsetWidth
    this.banner.classList.add("show")
    window.clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => {
      this.banner.classList.remove("show")
      this.bannerPrio = -1
      const next = this.bannerQ.shift()
      if (next) window.setTimeout(() => this.showBanner(next.text, next.sub, next.color, next.prio), 120)
    }, 1700)
  }

  /** A lure worked: banner across the feed column. */
  lie(text: string): void {
    this.lieBox.textContent = ""
    this.lieBox.append(el("b", "", text))
    this.lieBox.classList.remove("show")
    void this.lieBox.offsetWidth
    this.lieBox.classList.add("show")
    window.clearTimeout(this.lieTimer)
    this.lieTimer = window.setTimeout(() => this.lieBox.classList.remove("show"), 4200)
  }

  /** A name tag that follows a wisp ("that's me", liar, daredevil). At most 8 on screen. */
  tagWisp(id: string, text: string, color: string, seconds: number, cls = ""): void {
    const i = this.tags.findIndex((t) => t.id === id)
    if (i >= 0) this.tags.splice(i, 1)[0].node.remove()
    while (this.tags.length >= 3) this.tags.shift()?.node.remove() // a few at once, never a carpet over the rooms
    const node = el("div", `st-tag ${cls}`, text)
    node.style.color = color
    this.tagLayer.append(node)
    this.tags.push({ id, node, until: performance.now() + seconds * 1000 })
  }

  /** Floating text at a stage point (rises and fades). */
  float(x: number, y: number, text: string, color: string, size = 34): void {
    const f = el("div", "st-float", text)
    Object.assign(f.style, { left: `${x}px`, top: `${y}px`, color, fontSize: `${size}px` })
    this.floaters.append(f)
    window.setTimeout(() => f.remove(), 1800)
  }

  /** A big word slammed into a room (stays inside the room, never stacks in the middle). */
  stamp(x: number, y: number, text: string, color: string): void {
    const f = el("div", "st-stamp", text)
    Object.assign(f.style, { left: `${x}px`, top: `${y}px`, color })
    this.floaters.append(f)
    window.setTimeout(() => f.remove(), 2200)
  }

  bump(which: "online" | "humans" | "joinedToday"): void {
    const b = this.counters[which].b
    b.classList.remove("bump")
    void b.offsetWidth
    b.classList.add("bump")
  }

  private downWhy = ""
  setDown(down: boolean, clockNow: number, why = ""): void {
    this.downWhy = why
    if (down === this.staticOn) return
    this.staticOn = down
    this.staticBox.classList.toggle("on", down)
    this.clock.classList.toggle("down", down)
    if (down) this.downSince = clockNow
  }

  private drawStatic(clockNow: number): void {
    const g = this.staticCanvas.getContext("2d")
    if (!g) return
    const w = this.staticCanvas.width
    const h = this.staticCanvas.height
    const img = g.createImageData(w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const out = (clockNow - this.downSince) / 1000
    this.staticSub.textContent = `Gone for ${out.toFixed(1)} s. Hold still.`
    this.staticWhy.textContent = this.downWhy
  }

  showRevive(recoveryMs: number): void {
    const b = this.revive.querySelector("b")
    if (b) b.textContent = recoveryMs > 0 ? `Back in ${(recoveryMs / 1000).toFixed(2)} s.` : "Back."
    this.revive.classList.remove("show")
    void this.revive.offsetWidth
    this.revive.classList.add("show")
  }


  private finaleShown = false
  showFinale(s: StageSnap, relayMessages: number, peakOnline: number): void {
    if (!s.winner) return
    if (this.finaleShown && this.finale.classList.contains(s.winner)) return this.finaleNumbers(s, relayMessages, peakOnline)
    this.finaleShown = true
    this.finale.className = `st-finale ${s.winner}`
    const flood = this.finale.querySelector<HTMLElement>(".flood")
    if (flood) ditherBackground(flood, s.winner === "ghosts" ? FLOODS.blood : FLOODS.dawn)
    const words = this.finale.querySelector(".words")
    if (words) words.textContent = s.winner === "ghosts" ? "The house is yours." : "Exorcised."
    const fb = this.finale.querySelector(".fboard")
    if (fb) {
      fb.innerHTML = ""
      const top = (s.top ?? []).slice(0, 5)
      const podium = el("div", "podium")
      for (const place of [2, 1, 3]) {
        const entry = top[place - 1]
        const col = el("div", `pod p${place}`)
        if (entry) {
          const [gid, name, colorIndex, ecto, streak] = entry
          const color = GHOST_COLORS[colorIndex % GHOST_COLORS.length]
          const orb = el("img", "pod-face")
          orb.style.setProperty("--c", color)
          setAvatar(orb, gid, colorIndex, (streak ?? 0) >= 3, 160)
          const nm = el("div", "pod-name", name)
          nm.style.color = color
          col.append(orb, nm, el("div", "pod-ecto", `${fmt(ecto)} ecto`))
        }
        col.append(el("div", "pod-step", String(place)))
        podium.append(col)
      }
      fb.append(podium)
      const rest = el("div", "pod-rest")
      top.slice(3).forEach(([, name, colorIndex, ecto], i) => {
        const r = el("span", "", `${i + 4}. ${name} · ${fmt(ecto)}`)
        r.style.color = GHOST_COLORS[colorIndex % GHOST_COLORS.length]
        rest.append(r)
      })
      fb.append(rest)
    }
    const stats = this.finale.querySelector(".stats")
    if (stats) {
      stats.innerHTML = ""
      const add = (n: number, label: string) => {
        const d = el("div", "")
        d.append(el("b", "", fmt(n)), el("span", "", label))
        stats.append(d)
      }
      add(s.counters.joinedToday, "people died today")
      add(peakOnline, "Durable Actors at once")
      add(relayMessages, "messages on Agent Relay")
      add(s.counters.caught, "ghosts caught")
    }
  }

  private finaleNumbers(s: StageSnap, relayMessages: number, peakOnline: number): void {
    const bs = this.finale.querySelectorAll(".stats b")
    const vals = [s.counters.joinedToday, peakOnline, relayMessages, s.counters.caught]
    bs.forEach((b, i) => {
      b.textContent = fmt(vals[i] ?? 0)
    })
  }

  toast(text: string, err = false): void {
    this.toastEl.textContent = text
    this.toastEl.classList.toggle("err", err)
    this.toastEl.classList.add("show")
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), err ? 5000 : 1600)
  }

  roomCenter(id: RoomId): { x: number; y: number } {
    return ROOM_BOXES[id].center
  }
  get width(): number {
    return MANSION_W
  }
}
