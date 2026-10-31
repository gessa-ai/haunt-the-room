// The ghost's phone (route /p): a Kahoot-style controller, one decision per beat. HIDE: tap a room (or lure a
// hunter). HUNTING: wait in your room's colour. REVEAL: SAFE / CAUGHT / POSSESSED / YOUR LIE WORKED, full screen.
// One thing on screen at a time. L7 mounts it: const unmount = mountPlay(root).
import "../feed/fonts"
import type { HouseToPhone, HunterId, Phase, RoomId, RoomState } from "../../../contract/protocol"
import { BEATS_PER_ROUND, GHOST_COLORS, HUNTERS, INTRO_CARDS, NAME_MAX, ROOM_GRID, ROOM_STYLE, ROOMS, SCORE, TIMING, WELCOME } from "../../../contract/protocol"
import { playPhoneCue, unlockPhoneAudio, type PhoneCue } from "../audio"
import { attachPhoneDither } from "../fx/phoneDither"
import { avatarDataUrl, hunterDataUrl } from "../avatar"
import { icon } from "./icons"
import { ghostId } from "./identity"
import { openSession, type LinkStatus, type Session } from "./session"
import "@fontsource/pirata-one/400.css"
import "@fontsource/cinzel/700.css"
import "@fontsource/im-fell-english/400.css"
import "@fontsource/im-fell-english/400-italic.css"
import "@fontsource/im-fell-english-sc/400.css"
import "./play.css"

type Msg<T extends HouseToPhone["t"]> = Extract<HouseToPhone, { t: T }>
type ResultKind = Msg<"result">["kind"]

const ROOM_NAME = new Map<RoomId, string>(ROOMS.map((r) => [r.id, r.name]))
const HUNTER = new Map<HunterId, (typeof HUNTERS)[number]>(HUNTERS.map((x) => [x.id, x]))
const GLYPH: Record<(typeof ROOM_STYLE)[RoomId]["glyph"], string> = {
  triangle: `<polygon points="50,10 92,86 8,86"/>`,
  diamond: `<polygon points="50,6 94,50 50,94 6,50"/>`,
  circle: `<circle cx="50" cy="50" r="42"/>`,
  square: `<rect x="12" y="12" width="76" height="76" rx="8"/>`,
  star: `<polygon points="50,5 62,37 96,38 69,59 79,93 50,73 21,93 31,59 4,38 38,37"/>`,
  moon: `<path d="M62 6a44 44 0 1 0 32 64A36 36 0 1 1 62 6z"/>`,
}
/** Getting caught should be funny, not punishing: each hunter has a voice. */
const CAUGHT_LINES: Record<HunterId, readonly string[]> = {
  exorcist: ["There you are.", "Found one. Write it down.", "Back in the box."],
  medium: ["Darling, I felt you. Through the floor.", "Go towards my voice.", "Oh, you're cold. Poor thing."],
  skeptic: ["Subject located. Unremarkable.", "I had you at sixty percent.", "That's one for me."],
  priest: ["Kneel. Wait, can you kneel?", "Blessed. You're welcome.", "Did you see my good side?"],
}
const RESULT_WORD: Record<ResultKind, string> = { safe: "Safe", caught: "Caught.", possessed: "Haunted", lie: "They fell for it." }
/** "The Attic" -> "the Attic", for room names inside a sentence. */
const lower = (name: string) => name.replace(/^The /, "the ")
const SPLASH_MS = 1_500
const DEAD_AFTER_MS = 250
const COUNT_UP_MS = 700
const TICK_MS = 100
const FIRE_STREAK = 3
/** The owner's links on the finale screen (placeholders until the owner fills them in). */
const SOCIALS: { label: string; handle: string; href: string; icon: "x" | "insta" | "link" }[] = [
  { label: "Follow me on X", handle: "@handle", href: "#", icon: "x" },
  { label: "Instagram", handle: "@handle", href: "#", icon: "insta" },
]
const MAX_CHAIRS = 6 // seats drawn per room; above this each chair stands for several seats
const BEST_KEY = "haunt.best"

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function iconButton(className: string, name: Parameters<typeof icon>[0], label: string): HTMLButtonElement {
  const b = h("button", className)
  b.type = "button"
  b.append(icon(name), h("span", "", label))
  return b
}

/** A pixel avatar (lane L19) as an <img>; on fire = flames around it. */
function face(ghostId: string, size: number, colorIndex: number, fire = false, className = "hr-face"): HTMLImageElement {
  const img = h("img", className)
  img.alt = ""
  img.draggable = false
  img.src = avatarDataUrl(ghostId, size, { colorIndex, fire })
  return img
}

/** A hunter's pixel portrait (lane L19). */
function hunterFace(hunter: HunterId, className = "hr-hface"): HTMLImageElement {
  const img = h("img", className)
  img.alt = ""
  img.draggable = false
  img.src = hunterDataUrl(hunter, 48)
  return img
}

function glyph(room: RoomId, className: string): HTMLElement {
  const el = h("span", className)
  el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${GLYPH[ROOM_STYLE[room].glyph]}</svg>`
  return el
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)]

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported (iOS): sound and screen carry the moment
  }
}

/** L10's phone blips (the first tap unlocks sound); audio must never break the game. */
const cue = (kind: PhoneCue, streak = 0) => {
  try {
    playPhoneCue(kind, streak)
  } catch {
    // silent is fine
  }
}

/** Restart a CSS animation (a class toggle alone does not replay it). */
const replay = (node: HTMLElement, cls: string) => {
  node.classList.remove(cls)
  void node.offsetWidth
  node.classList.add(cls)
}

const multiplier = (streak: number) => Math.min(SCORE.streakMax, 1 + SCORE.streakStep * Math.max(0, streak))
const fmtMult = (x: number) => `×${Number.isInteger(x) ? x : Number(x.toFixed(2))}`

interface Tile {
  el: HTMLButtonElement
  count: HTMLElement
  seats: HTMLElement
  faces: HTMLElement
  facesKey: string
}

function buildTile(id: RoomId): Tile {
  const el = h("button", "hr-room")
  el.type = "button"
  el.dataset.room = id
  el.style.setProperty("--rc", ROOM_STYLE[id].color)
  el.setAttribute("aria-label", ROOM_NAME.get(id) ?? id)
  const art = h("img", "hr-art")
  art.alt = ""
  art.decoding = "async"
  art.draggable = false
  // L14's pre-dithered phone art first, then L9's painting, then the plain room colour.
  art.addEventListener("error", () => {
    if (art.src.includes("/fx/rooms/")) art.src = `/art/room-${id}.webp`
    else art.remove()
  })
  art.src = `/fx/rooms/${id}.webp`
  const count = h("b", "hr-count", "0")
  const seats = h("span", "hr-seats")
  const faces = h("span", "hr-faces")
  const badge = h("span", "hr-badge")
  badge.append(icon("ghost"))
  const lock = icon("lock", "hr-lock")
  const bar = h("i", "hr-bar")
  el.append(art, glyph(id, "hr-glyph"), h("span", "hr-name", (ROOM_NAME.get(id) ?? id).replace(/^The /, "")), count, faces, seats, bar, badge, lock)
  return { el, count, seats, faces, facesKey: "" }
}

export function mountPlay(root: HTMLElement): () => void {
  const id = ghostId()
  const prevTitle = document.title
  document.title = "Haunt the Room"
  document.documentElement.classList.add("hr-page")
  root.classList.add("hr-root")

  // ---------- state ----------
  const me = { name: "", color: GHOST_COLORS[7] as string, room: null as RoomId | null, score: 0, caught: false, rank: 0, of: 0, streak: 0 }
  const rooms = new Map<RoomId, RoomState>()
  let phase: Msg<"phase"> | null = null
  let chosen: RoomId | null = null // this beat's pick, shown instantly, confirmed by {t:"you"}
  let resendHide: RoomId | null = null // an unconfirmed pick carried across a reconnect, sent once on the new socket
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  let climbArmed = false // scores reset each round: no "Up to #1" for everyone before the first reveal
  let result: Msg<"result"> | null = null
  let lureBeat = -1
  let liedTo: HunterId | null = null
  let mineSeen = -1
  let mineSeenRoom: RoomId | null = null
  let lureBlockedUntil = 0
  let ghostToken: string | null = null
  let waveReadyAt = 0
  let link: LinkStatus = "joining"
  let everLive = false
  let splashUntil = Number.POSITIVE_INFINITY
  let disposed = false
  let best = 0
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    // storage blocked: the best lives for this page load
  }

  // ---------- DOM: header ----------
  const top = h("header", "hr-top")
  const meName = h("span", "hr-who-name", "…")
  const who = h("span", "hr-who")
  who.append(meName)
  const streakEl = h("span", "hr-streak")
  const scoreNum = h("b", "", "0")
  const scoreEl = h("span", "hr-score")
  scoreEl.append(scoreNum, icon("ghost", "hr-ecto"))
  const scoreRow = h("span", "hr-score-row")
  scoreRow.append(streakEl, scoreEl)
  const rankEl = h("span", "hr-rank")
  const stats = h("span", "hr-stats")
  stats.append(scoreRow, rankEl)
  const topFace = h("span", "hr-top-face")
  top.append(topFace, who, stats)

  // ---------- screens (exactly one visible, chosen by data-screen) ----------
  const screens = h("main", "hr-screens")

  const lobby = h("section", "hr-scr hr-scr-lobby")
  // Your generated name, already filled in; typing a new one is optional and never blocks.
  const lobbyName = h("input", "hr-lobby-name")
  lobbyName.type = "text"
  lobbyName.maxLength = NAME_MAX
  lobbyName.autocomplete = "off"
  lobbyName.spellcheck = false
  lobbyName.enterKeyHint = "done"
  lobbyName.setAttribute("aria-label", "Your ghost name")
  const waveLobby = iconButton("hr-wave", "hand", "Which one's me?")
  const fullBtn = iconButton("hr-full", "full", "Full screen")
  const lobbyFace = h("span", "hr-me-face hr-breathe")
  lobby.append(lobbyFace, lobbyName, h("div", "hr-big-line", "You're dead. Eyes on the big screen."), waveLobby, fullBtn)

  // The whole tutorial is the contract's WELCOME + INTRO_CARDS, mirrored from the stage, synced to the phase clock.
  const intro = h("section", "hr-scr hr-scr-intro")
  const introKicker = h("div", "hr-intro-kicker", WELCOME.kicker)
  const introTitle = h("div", "hr-intro-title", WELCOME.title)
  const introStep = h("div", "hr-intro-step", "")
  intro.append(introKicker, introTitle, introStep)
  let introCard = -2

  const hide = h("section", "hr-scr hr-scr-hide")
  const hideCount = h("b", "hr-hide-count", "6")
  const hideBeat = h("span", "hr-pips")
  const hideHead = h("div", "hr-hide-head")
  const hideTitle = h("div", "hr-hide-title", INTRO_CARDS[0].title)
  hideHead.append(hideTitle, hideCount)
  const grid = h("div", "hr-grid")
  const tiles = new Map<RoomId, Tile>()
  for (const row of ROOM_GRID)
    for (const rid of row) {
      const t = buildTile(rid)
      tiles.set(rid, t)
      grid.append(t.el)
    }
  // Hunters' open leanings during hide: a pixel eye per hunter that slides to the room it is leaning toward.
  const leanEyes = new Map<HunterId, HTMLElement>()
  HUNTERS.forEach((x, i) => {
    const eye = icon("eye", "hr-lean")
    eye.style.setProperty("--hc", x.color)
    eye.dataset.i = String(i)
    eye.title = x.name
    leanEyes.set(x.id, eye)
    grid.append(eye)
  })
  const paintLeans = (leans: [HunterId, RoomId][] | undefined) => {
    const at = new Map(leans ?? [])
    const perRoom = new Map<RoomId, number>()
    for (const [hid, eye] of leanEyes) {
      const room = at.get(hid)
      const tile = room ? tiles.get(room) : undefined
      if (!room || !tile) {
        eye.classList.remove("on")
        continue
      }
      const k = perRoom.get(room) ?? 0
      perRoom.set(room, k + 1)
      const x = tile.el.offsetLeft + tile.el.offsetWidth / 2 - 40 + k * 26
      const y = tile.el.offsetTop - 10
      eye.style.transform = `translate(${x}px, ${y}px)`
      eye.classList.add("on")
    }
  }
  // LYING is the hero: one big button opens a full-screen sheet (pick a hunter, then the room to blame).
  const lieRow = h("div", "hr-lie-row")
  const lieBtn = h("button", "hr-lie-btn", "Lie to the AI")
  lieBtn.type = "button"
  const lieCard = h("div", "hr-lie-card")
  const lieLabel = lieCard
  const lieHint = h("div", "hr-lie-hint", "They're deciding now.")
  lieRow.append(lieHint, lieBtn, lieCard)
  // Lying is open during hide AND hunting (owner 15:05: lie into the debate); one lie per beat.
  const canLie = () => (phase?.phase === "hide" || phase?.phase === "hunting") && !me.caught
  const lieSheet = h("div", "hr-lie-sheet")
  const lieSheetTitle = h("div", "hr-lie-title", "Who do you whisper to?")
  const lieHunters = h("div", "hr-lie-hunters")
  const lieChips = h("div", "hr-lie-chips")
  const lieClose = iconButton("hr-lie-close", "x", "Close")
  let lieHunter: HunterId | null = null
  for (const x of HUNTERS) {
    const b = h("button", "hr-lie-hunter")
    b.type = "button"
    b.dataset.hunter = x.id
    b.style.setProperty("--hc", x.color)
    const nm = h("span", "hr-lie-hname", x.name.replace(/^The /, ""))
    nm.append(h("span", "hr-ai", "AI"))
    b.append(hunterFace(x.id, "hr-hface hr-lie-face"), nm)
    lieHunters.append(b)
  }
  for (const row of ROOM_GRID)
    for (const rid of row) {
      const c = h("button", "hr-lie-chip")
      c.type = "button"
      c.dataset.room = rid
      c.style.setProperty("--rc", ROOM_STYLE[rid].color)
      c.setAttribute("aria-label", `Lie: ${ROOM_NAME.get(rid)}`)
      c.append(glyph(rid, "hr-lie-glyph"), h("span", "", (ROOM_NAME.get(rid) ?? rid).replace(/^The /, "")))
      lieChips.append(c)
    }
  lieSheet.append(lieClose, lieSheetTitle, lieHunters, lieChips)
  const openLie = () => {
    lieHunter = null
    lieSheet.dataset.step = "1"
    lieSheetTitle.textContent = "Who do you whisper to?"
    lieSheet.classList.add("open")
  }
  const closeLie = () => lieSheet.classList.remove("open")
  lieBtn.addEventListener("click", () => {
    if (!canLie() || lieRow.classList.contains("locked") || lieRow.classList.contains("sent")) return replay(lieBtn, "refused")
    openLie()
  })
  lieClose.addEventListener("click", closeLie)
  lieHunters.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>(".hr-lie-hunter") : null
    if (!b) return
    lieHunter = b.dataset.hunter as HunterId
    lieSheet.dataset.step = "2"
    lieSheetTitle.textContent = "Everyone is in…"
    cue("hide-tap")
  })
  // The last two hunter lines, live, above the rooms.
  const sayBox = h("div", "hr-saybox")
  const sayLines: { hunter: HunterId; text: string }[] = []
  const paintSay = () => {
    sayBox.replaceChildren(
      ...sayLines.map((l) => {
        const info = HUNTER.get(l.hunter)
        const row = h("div", "hr-say")
        row.style.setProperty("--hc", info?.color ?? "#fff")
        row.append(hunterFace(l.hunter), h("b", "", info?.name ?? l.hunter), h("span", "hr-ai", "AI"), h("span", "hr-say-text", l.text))
        return row
      }),
    )
  }
  hide.append(hideHead, grid, lieRow)

  const out = h("section", "hr-scr hr-scr-out")
  const outCount = h("b", "hr-out-count", "")
  out.append(h("div", "hr-out-title", "Caught. Sit this one out."), h("p", "hr-howto", "You're back next beat."), outCount)

  const hunting = h("section", "hr-scr hr-scr-hunting")
  const huntGlyph = h("span", "hr-hunt-glyph")
  const huntWhere = h("div", "hr-hunt-where")
  const tickerWho = h("b", "", "")
  const tickerText = h("span", "", "")
  const ticker = h("div", "hr-ticker")
  ticker.append(tickerWho, tickerText)
  const tickerFace = h("span", "hr-ticker-face")
  ticker.prepend(tickerFace)
  const captionEl = h("div", "hr-caption-host")
  hunting.append(huntGlyph, huntWhere, captionEl)

  const reveal = h("section", "hr-scr hr-scr-reveal")
  // The moment (about 1.6 s: a stamp slams in, your avatar reacts, sparks), then a clean summary.
  const moment = h("div", "hr-moment")
  const momentMe = h("span", "hr-m-me")
  const stamp = h("div", "hr-stamp", "")
  const parts = h("div", "hr-m-parts")
  for (let i = 0; i < 18; i++) {
    const p = h("i", "")
    p.style.setProperty("--a", `${i * 20 + ((i * 37) % 13)}deg`)
    p.style.setProperty("--d", `${90 + ((i * 53) % 90)}px`)
    p.style.setProperty("--t", `${(i * 71) % 300}ms`)
    parts.append(p)
  }
  const mChairs = h("div", "hr-m-chairs")
  for (let i = 0; i < 6; i++) mChairs.append(icon("chair"))
  const stampIcon = h("span", "hr-stamp-icon")
  const revMap = h("div", "hr-rev-map")
  const revMapTiles = new Map<RoomId, HTMLElement>()
  for (const row of ROOM_GRID)
    for (const rid of row) {
      const c = h("div", "hr-rev-tile")
      c.style.setProperty("--rc", ROOM_STYLE[rid].color)
      c.append(glyph(rid, "hr-rev-glyph"), h("span", "hr-rev-mark"))
      revMapTiles.set(rid, c)
      revMap.append(c)
    }
  moment.append(stampIcon, h("i", "hr-m-flash"), h("i", "hr-m-door"), mChairs, momentMe, parts, stamp)
  const revWord = h("div", "hr-rev-word", "")
  const revPoints = h("div", "hr-rev-points", "")
  const revStreak = h("div", "hr-rev-streak", "")
  const revRank = h("div", "hr-rev-rank", "")
  const revBy = h("div", "hr-rev-by", "")
  const revLine = h("div", "hr-rev-line", "")
  const revNote = h("div", "hr-rev-note", "")
  const revSwept = h("div", "hr-rev-swept", "")
  const summary = h("div", "hr-summary")
  summary.append(revWord, revPoints, revBy, revLine, revMap, revStreak, revRank)
  reveal.append(moment, summary)

  const finale = h("section", "hr-scr hr-scr-finale")
  const finTitle = h("div", "hr-fin-title")
  const finSub = h("div", "hr-fin-sub")
  const finScore = h("div", "hr-fin-score")
  const waveFinale = iconButton("hr-wave", "hand", "Which one's me?")
  const socials = h("nav", "hr-socials")
  // Only real links: a placeholder handle or "#" href never reaches the screen.
  for (const sl of SOCIALS.filter((x) => x.href !== "#" && x.handle !== "@handle")) {
    const a = h("a", "hr-social")
    a.href = sl.href
    a.target = "_blank"
    a.rel = "noopener"
    a.append(icon(sl.icon), h("span", "hr-social-label", sl.label), h("span", "hr-social-handle", sl.handle))
    socials.append(a)
  }
  finale.append(finTitle, finSub, finScore, waveFinale, socials)

  screens.append(lobby, intro, hide, out, hunting, reveal, finale)

  // ---------- overlays ----------
  const dead = h("div", "hr-dead")
  dead.append(
    h("span", "hr-orb hr-dead-orb"),
    h("div", "hr-dead-1", "The house died."),
    h("div", "hr-dead-2", "You didn't."),
    h("div", "hr-dead-net", "Your connection dropped."),
    h("div", "hr-dead-sub", "Hold still. The house is coming back."),
  )
  const splash = h("div", "hr-splash")
  const splashName = h("div", "hr-splash-name", "")
  const splashYou = h("div", "hr-splash-you", "Passing away…")
  splash.append(h("span", "hr-orb hr-orb-xl"), splashYou, splashName)
  const climbEl = h("div", "hr-climb")
  const toastEl = h("div", "hr-toast")
  toastEl.setAttribute("role", "status")

  const fullScr = h("div", "hr-fullhouse")
  const fullFace = h("span", "hr-me-face")
  const fullCount = h("div", "hr-howto", "")
  fullScr.append(h("div", "hr-gate"), fullFace, h("div", "hr-big-line", "The house is full. Watch the big screen."), fullCount)
  const turn = h("div", "hr-turn")
  turn.append(h("div", "hr-turn-phone"), h("div", "hr-turn-text", "Turn your phone upright."))
  root.replaceChildren(top, screens, lieSheet, dead, fullScr, climbEl, toastEl, splash, turn)

  // ---------- helpers ----------
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const toast = (text: string) => {
    toastEl.textContent = text
    replay(toastEl, "show")
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2_600)
  }

  let climbTimer: ReturnType<typeof setTimeout> | undefined
  const lowerName = (n: string) => n.toLowerCase()
  const climb = (text: string) => {
    climbEl.textContent = text
    replay(climbEl, "show")
    clearTimeout(climbTimer)
    climbTimer = setTimeout(() => climbEl.classList.remove("show"), 2_200)
  }

  // Score counts up; the streak flame grows; rank shows only in the top 25, else your personal best.
  let shown = 0
  let countFrom = 0
  let countStart = 0
  let counting = false
  const step = (t: number) => {
    const k = Math.min(1, (t - countStart) / COUNT_UP_MS)
    shown = Math.round(countFrom + (me.score - countFrom) * (1 - (1 - k) ** 3))
    scoreNum.textContent = String(shown)
    if (k < 1) requestAnimationFrame(step)
    else counting = false
  }
  const setScore = (v: number) => {
    if (v === me.score) return
    if (v > me.score) replay(scoreEl, "bump")
    me.score = v
    if (v > best) {
      best = v
      try {
        localStorage.setItem(BEST_KEY, String(v))
      } catch {
        // storage blocked
      }
    }
    countFrom = shown
    countStart = performance.now()
    if (!counting) {
      counting = true
      requestAnimationFrame(step)
    }
  }
  // Competitive: rank and score always on screen; #1 wears the crown; a 3-beat streak sets you ON FIRE.
  const rankText = () => (me.of > 0 && me.rank > 0 ? `#${me.rank} of ${me.of}` : "")
  let fire = false
  // Avatars are seeded by publicId (never the private ghostId), so your face matches the stage.
  let publicId = ""
  let faceKey = ""
  const paintFace = (colorIndex: number) => {
    const k = `${publicId}|${colorIndex}|${me.streak >= FIRE_STREAK ? 1 : 0}`
    if (!publicId || k === faceKey) return
    faceKey = k
    const fire = me.streak >= FIRE_STREAK
    lobbyFace.replaceChildren(face(publicId, 160, colorIndex, fire, "hr-face hr-face-xl"))
    topFace.replaceChildren(face(publicId, 40, colorIndex, fire))
    momentMe.replaceChildren(face(publicId, 160, colorIndex, fire, "hr-face hr-face-moment"))
  }
  const paintStats = () => {
    const crowned = me.rank === 1 && me.of > 1
    rankEl.replaceChildren(...(crowned ? [icon("crown", "hr-crown")] : []), document.createTextNode(rankText()))
    rankEl.classList.toggle("crown", crowned)
    streakEl.classList.toggle("on", me.streak > 0)
    const flames = Math.min(3, me.streak)
    const mult = me.streak > 0 ? fmtMult(multiplier(me.streak)) : ""
    streakEl.replaceChildren(...Array.from({ length: flames }, () => icon("flame")), document.createTextNode(me.streak >= FIRE_STREAK ? `On a roll ${mult}` : mult))
    const nowFire = me.streak >= FIRE_STREAK
    if (nowFire && !fire) {
      vibrate([40, 30, 40, 30, 80])
    }
    fire = nowFire
    root.classList.toggle("on-fire", fire)
  }

  const myRoom = () => chosen ?? me.room
  let crackleAt = 0
  const crackle = () => {
    // Someone on fire is sitting next to you: a soft crackle, at most every 8 s.
    if (Date.now() - crackleAt < 8_000) return
    crackleAt = Date.now()
    cue("crackle")
  }

  const paintTiles = () => {
    const mine = myRoom()
    grid.classList.toggle("picked", mine !== null)
    for (const [rid, t] of tiles) {
      const r = rooms.get(rid)
      // Your own seat always counts on your tile (the 1 Hz rooms message can trail your tap).
      const count = Math.max(r?.count ?? 0, rid === mine ? 1 : 0)
      const cap = r?.cap ?? 0
      t.count.textContent = cap > 0 ? `${count}/${cap}` : String(count)
      t.el.classList.toggle("possessed", r?.possessed ?? false)
      t.el.classList.toggle("mine", rid === mine)
      // Musical chairs: seats fill live; a full room greys out (your own seat stays yours).
      t.el.classList.toggle("full", cap > 0 && count >= cap && rid !== mine)
      t.el.classList.toggle("many", cap > MAX_CHAIRS)
      t.el.style.setProperty("--fill", cap > 0 ? String(Math.min(1, count / cap)) : "0")
      if (rid === mine && phase?.phase === "hide") {
        if (mineSeenRoom === rid && count > mineSeen) {
          replay(root, "shake")
          cue("tick")
        }
        mineSeen = count
        mineSeenRoom = rid
      }
      const chairs = cap > MAX_CHAIRS ? 0 : cap
      const filled = cap > 0 ? Math.round((Math.min(count, cap) / cap) * chairs) : 0
      if (t.seats.childElementCount !== chairs) t.seats.replaceChildren(...Array.from({ length: chairs }, () => icon("chair")))
      Array.from(t.seats.children).forEach((c, i) => c.classList.toggle("taken", i < filled))
      // Faces of who is seated (a few, then "+n"); a streak of 3+ burns.
      const seated = r?.seated ?? []
      const key = `${seated.map((x) => `${x[0]}:${x[2] >= FIRE_STREAK ? 1 : 0}`).join(",")}|${count}`
      if (key !== t.facesKey) {
        t.facesKey = key
        const more = count - seated.length
        t.faces.replaceChildren(
          ...seated.map(([gid, ci, streak]) => face(gid, 40, ci, streak >= FIRE_STREAK)),
          ...(more > 0 && seated.length > 0 ? [h("b", "hr-more", `+${more}`)] : []),
        )
      }
      if (rid === mine && seated.some(([pid, , streak]) => pid !== publicId && streak >= FIRE_STREAK)) crackle()
    }
    lieRow.classList.toggle("locked", (lureBeat === (phase?.beat ?? -2) && !lieRow.classList.contains("sent")) || Date.now() < lureBlockedUntil)
    lieRow.classList.toggle("gone", me.caught)
  }

  const paintHunting = () => {
    const room = myRoom()
    hunting.style.setProperty("--rc", room ? ROOM_STYLE[room].color : "#140c1f")
    hunting.classList.toggle("noroom", !room)
    huntGlyph.replaceChildren(...(room ? [glyph(room, "hr-hunt-svg")] : []))
    huntWhere.textContent = room ? (ROOM_NAME.get(room) ?? room) : "No room this beat."
    if (!room) huntGlyph.replaceChildren(icon("ghost", "hr-hunt-svg"))
  }

  let lastVerdict = ""
  let summaryTimer: ReturnType<typeof setTimeout> | undefined
  let rankAtHide = 0
  const MOMENT_MS = 1_600
  const STAMP: Record<string, string> = { safe: "Unseen", caught: "Found", noseat: "No chair", haunted: "Haunted", lie: "Fooled them", none: "" }
  /** Points tick up with a few soft ticks (never a machine-gun). */
  const countUp = (to: number) => {
    const t0 = performance.now()
    let ticks = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      revPoints.textContent = `+${Math.round(to * (1 - (1 - k) ** 3))}`
      if (k * 5 > ticks) {
        ticks += 1
        cue("tick")
      }
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const paintReveal = () => {
    const kind = result?.kind ?? "none"
    // The House marks "no seat at the bell" as caught with no hunter; a sweep always names its hunter.
    const noSeat = result?.kind === "caught" && (!result.hunter || !me.room)
    const m = !result ? "none" : noSeat ? "noseat" : kind === "possessed" ? "haunted" : kind
    reveal.dataset.kind = noSeat ? "noseat" : kind
    moment.dataset.m = m
    moment.style.setProperty("--rc", me.room ? ROOM_STYLE[me.room].color : "#9b4dff")
    stamp.textContent = m === "safe" ? "Safe" : m === "lie" ? "Believed" : (STAMP[m] ?? "")
    stampIcon.replaceChildren(...(m === "safe" || m === "lie" ? [icon("check")] : m === "caught" || m === "noseat" ? [icon("x")] : []))
    for (const [rid, c] of revMapTiles) {
      const r = rooms.get(rid)
      c.classList.toggle("mine", rid === me.room)
      const mark = c.querySelector(".hr-rev-mark")
      mark?.replaceChildren(icon(r?.swept ? "x" : "check"))
      c.classList.toggle("swept", r?.swept ?? false)
    }
    // Animate once per verdict: room updates keep arriving during the reveal and must not restart it.
    const verdict = `${phase?.round}:${phase?.beat}:${kind}:${result?.points ?? 0}:${noSeat}`
    const fresh = verdict !== lastVerdict
    lastVerdict = verdict
    const swept = [...rooms.values()].filter((r) => r.swept).map((r) => ROOM_NAME.get(r.id) ?? r.id)
    const searched = swept.length ? `They searched ${swept.map(lower).join(" and ")}.` : ""
    revSwept.textContent = ""
    if (!result) {
      revWord.textContent = "Flashlights…"
      revPoints.textContent = revBy.textContent = revLine.textContent = revNote.textContent = revRank.textContent = ""
      revStreak.replaceChildren()
      return
    }
    revWord.textContent = RESULT_WORD[result.kind]
    if (fresh) revPoints.textContent = result.points > 0 ? "+0" : ""
    const mult = multiplier(result.streak)
    revStreak.replaceChildren(
      ...(result.kind === "safe" && mult > 1
        ? [...Array.from({ length: Math.min(3, result.streak) }, () => icon("flame")), document.createTextNode(`Streak ${fmtMult(mult)}`)]
        : []),
    )
    const delta = rankAtHide > 0 && me.rank > 0 ? rankAtHide - me.rank : 0
    revRank.textContent = delta > 0 ? `Up ${delta} · #${me.rank} of ${me.of}` : delta < 0 ? `Down ${-delta} · #${me.rank} of ${me.of}` : rankText()
    revRank.classList.toggle("up", delta > 0)
    if (noSeat) {
      revWord.textContent = "No seat."
      revSwept.textContent = ""
      revBy.textContent = ""
      revLine.textContent = ""
      revNote.textContent = ""
    } else if (result.kind === "caught") {
      const hunter = result.hunter ? HUNTER.get(result.hunter) : undefined
      reveal.style.setProperty("--hc", hunter?.color ?? "#ffd27a")
      const where = me.room ? ROOM_NAME.get(me.room) : null
      void where
      revWord.textContent = "Found"
      revBy.replaceChildren(
        ...(result.hunter ? [hunterFace(result.hunter, "hr-hface hr-hface-lg")] : []),
        document.createTextNode(`${hunter?.name ?? "A hunter"} `),
        h("span", "hr-ai", "AI"),
        document.createTextNode(":"),
      )
      // Quotes are only ever the hunter's own line; the House's result text is not dialogue.
      if (fresh) revLine.textContent = `“${(result.hunter ? pick(CAUGHT_LINES[result.hunter]) : undefined) ?? "Found you."}”`
      revNote.textContent = ""
    } else {
      revSwept.textContent = ""
      void searched
      revBy.textContent = ""
      revLine.textContent = ""
      if (result.kind === "lie") {
        const who = liedTo ? HUNTER.get(liedTo) : result.hunter ? HUNTER.get(result.hunter) : undefined
        revWord.textContent = `${who?.name ?? "The hunter"} believes you.`
        revBy.replaceChildren(...(who ? [hunterFace(who.id, "hr-hface hr-hface-lg")] : []))
      }
      revNote.textContent = ""
    }
    if (fresh) {
      reveal.classList.remove("summary")
      replay(moment, "play")
      clearTimeout(summaryTimer)
      const pts = Math.round(result.points)
      summaryTimer = setTimeout(() => {
        reveal.classList.add("summary")
        if (pts > 0) countUp(pts)
      }, MOMENT_MS)
    }
  }

  const screenFor = (): string => {
    const p = phase?.phase ?? "lobby"
    if (p === "hide" && me.caught) return "out"
    return p
  }

  const paint = () => {
    const p: Phase = phase?.phase ?? "lobby"
    root.dataset.phase = p
    root.dataset.screen = screenFor()
    const lieHome = p === "hunting" ? hunting : hide
    if (lieRow.parentElement !== lieHome) lieHome.append(lieRow)
    paintTiles()
    if (p === "hunting") paintHunting()
    if (p === "reveal") paintReveal()
    const winner = phase?.winner ?? null
    finale.dataset.winner = winner ?? "none"
    finTitle.textContent = winner === "ghosts" ? "The house is yours" : winner === "hunters" ? "Exorcised" : "That's the night."
    finSub.textContent = winner === "ghosts" ? "The hunters have left. One of them was crying." : winner === "hunters" ? "The house is clean. The Priest is taking a bow." : ""
    finScore.replaceChildren(document.createTextNode(String(me.score)), icon("ghost", "hr-ecto"), document.createTextNode(rankText() ? `  ${rankText()}` : ""))
    // Beat pips instead of a "BEAT 1 OF 8" label.
    const beat = phase?.beat ?? 0
    if (hideBeat.childElementCount !== BEATS_PER_ROUND) hideBeat.replaceChildren(...Array.from({ length: BEATS_PER_ROUND }, () => h("i", "")))
    Array.from(hideBeat.children).forEach((pip, i) => pip.classList.toggle("on", i < beat))
  }

  // ---------- input ----------
  let session: Session | null = null
  grid.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".hr-room") : null
    const rid = el?.dataset.room as RoomId | undefined
    if (!el || !rid || phase?.phase !== "hide" || me.caught) return
    if (el.classList.contains("full")) {
      replay(el, "refused")
      vibrate([20, 40, 20])
      toast(`${ROOM_NAME.get(rid)} is full.`)
      return
    }
    if (!session?.hide(rid)) {
      replay(el, "refused")
      toast("Reconnecting…")
      return
    }
    chosen = rid
    cue("hide-tap")
    replay(el, "tap")
    paintTiles()
  })

  async function sendLure(room: RoomId, el: HTMLElement, toHunter: HunterId | null) {
    lureBeat = phase?.beat ?? -1
    const fx = icon("lure", "hr-lured-fx")
    el.append(fx)
    setTimeout(() => fx.remove(), 900)
    paintTiles()
    try {
      const res = await fetch("/api/whisper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ghostId: id, ghostToken, room, hunter: toHunter ?? undefined }),
        cache: "no-store",
      })
      const body: unknown = await res.json().catch(() => null)
      if (res.status === 429) {
        const wait = Number(res.headers.get("Retry-After")) || 3
        lureBlockedUntil = Date.now() + wait * 1000
        lureBeat = -1
        return toast(`The house is too noisy. Try again in ${wait} s.`)
      }
      if (res.status === 403 || res.status === 409) {
        lureBeat = -1
        return toast("The house is too noisy. Try again.")
      }
      if (!res.ok || !isRecord(body) || body.ok !== true) return toast("Nobody heard that. Try again.")
      const hid = typeof body.hunter === "string" ? (body.hunter as HunterId) : toHunter
      const hunter = hid ? HUNTER.get(hid) : undefined
      liedTo = hid ?? null
      closeLie()
      lieRow.classList.add("sent")
      const short = (hunter?.name ?? "a hunter").replace(/^The /, "")
      lieBtn.textContent = `Lie sent: ${short}, ${(ROOM_NAME.get(room) ?? room).replace(/^The /, "")}`
      // The phone has no hunter conviction feed (rooms carry leans only): the meter is a 2 s weighing animation.
      const weighText = h("span", "hr-weigh-text", `${hunter?.name ?? "The hunter"} is weighing it`)
      const meter = h("i", "hr-weigh")
      meter.style.setProperty("--hc", hunter?.color ?? "#ffd27a")
      const col = h("span", "hr-weigh-col")
      col.append(weighText, meter)
      lieCard.replaceChildren(...(hid ? [hunterFace(hid, "hr-hface hr-lie-card-face")] : []), col)
      replay(meter, "go")
      setTimeout(() => (weighText.textContent = `${hunter?.name ?? "The hunter"} heard you.`), 2_000)
    } catch {
      lureBeat = -1
      toast("Nobody heard that. Try again.")
    } finally {
      paintTiles()
    }
  }
  lieChips.addEventListener("click", (e) => {
    const chip = e.target instanceof Element ? e.target.closest<HTMLElement>(".hr-lie-chip") : null
    const rid = chip?.dataset.room as RoomId | undefined
    if (!chip || !rid || !canLie() || lieRow.classList.contains("locked")) return
    lieSheet.classList.add("whoosh")
    setTimeout(() => lieSheet.classList.remove("whoosh"), 500)
    void sendLure(rid, chip, lieHunter)
  })

  const wave = (btn: HTMLButtonElement) => {
    if (Date.now() < waveReadyAt || !session?.wave()) {
      replay(btn, "refused")
      return
    }
    waveReadyAt = Date.now() + TIMING.waveCooldownMs
    for (const b of [waveLobby, waveFinale]) {
      b.style.setProperty("--dur", `${TIMING.waveCooldownMs}ms`)
      replay(b, "cooling")
    }
    toast("Look up. You're the bright one.")
  }
  waveLobby.addEventListener("click", () => wave(waveLobby))
  waveFinale.addEventListener("click", () => wave(waveFinale))

  // ---------- clock ----------
  let deadTimer: ReturnType<typeof setTimeout> | undefined
  function tick() {
    const now = Date.now()
    const left = phase ? phase.endsAt - now : 0
    if (phase?.phase === "hide") {
      const s = Math.max(0, Math.ceil(left / 1000))
      if (hideCount.textContent !== String(s)) {
        hideCount.textContent = String(s)
        if (s <= 3 && s > 0) {
          replay(hideCount, "tock")
          cue("tick")
        }
      }
      hide.classList.toggle("urgent", left < 3_000)
      outCount.textContent = String(s)
    }
    if (phase?.phase === "intro") {
      // Welcome for 4 s, then each card for 4 s, on the same clock as the stage.
      const since = TIMING.introMs - left
      const i = Math.min(INTRO_CARDS.length - 1, Math.floor((since - 4_000) / 4_000))
      const card = since < 4_000 ? -1 : i
      if (card !== introCard) {
        introCard = card
        const c = card >= 0 ? INTRO_CARDS[card] : undefined
        intro.dataset.card = String(card)
        introKicker.textContent = c ? "" : WELCOME.kicker
        introTitle.textContent = c ? c.title : WELCOME.title
        introStep.textContent = c ? c.body : ""
        replay(intro, "card")
      }
    }
    for (const b of [waveLobby, waveFinale]) b.classList.toggle("cooldown", now < waveReadyAt)
    if (splashUntil <= now && everLive) {
      splashUntil = Number.POSITIVE_INFINITY
      splash.classList.add("out")
    }
  }
  const clockTimer = setInterval(tick, TICK_MS)

  // ---------- the house ----------
  const onMessage = (m: HouseToPhone) => {
    switch (m.t) {
      case "you": {
        const climbed = me.rank > 0 && m.rank > 0 && m.rank < me.rank
        const passed = (m as { passed?: unknown }).passed
        if (climbed && climbArmed) {
          climb(typeof passed === "string" && passed ? `You passed ${passed.toLowerCase()}.` : `Up to #${m.rank}.`)
          replay(rankEl, "flip")
        }
        me.name = m.name.toLowerCase()
        me.color = GHOST_COLORS[m.colorIndex % GHOST_COLORS.length] ?? me.color
        if (m.publicId) publicId = m.publicId
        paintFace(m.colorIndex)
        me.caught = m.caught
        me.rank = m.rank
        me.of = m.of
        me.streak = m.streak
        if (phase?.phase === "hide") {
          me.room = m.room
          if (chosen === m.room) chosen = null
          if (resendHide && resendHide !== m.room && !m.caught && session?.hide(resendHide)) chosen = resendHide
        } else if (m.room) me.room = m.room
        resendHide = null
        setScore(m.score)
        root.style.setProperty("--me", me.color)
        meName.textContent = me.name
        splashName.textContent = me.name
        if (document.activeElement !== lobbyName) lobbyName.value = me.name
        paintStats()
        paint()
        break
      }
      case "phase": {
        const prev = phase?.phase
        phase = m
        if (m.phase !== prev) {
          if (m.phase === "hide") {
            chosen = null
            me.room = null
            mineSeen = -1
            result = null
            lieRow.classList.remove("sent")
            lieBtn.textContent = "Lie to the AI"
            hide.append(lieRow)
            lieCard.replaceChildren()
            liedTo = null
            rankAtHide = me.rank
            vibrate(40)
          }
          if (m.phase === "intro" || m.phase === "lobby") climbArmed = false
          if (m.phase === "reveal") climbArmed = true
          if (m.phase === "hunting") {
            hunting.append(lieRow)
            tickerWho.textContent = ""
            tickerText.textContent = ""
          }
          if (m.phase === "finale") {
            cue("finale")
            vibrate(m.winner === "ghosts" ? [80, 60, 80, 60, 400] : 300)
          }
        }
        if (m.phase === "reveal" && !result) {
          // Reconnected mid-reveal (or the result was lost): after 800 ms, tell the player what `you` says.
          clearTimeout(revealTimer)
          revealTimer = setTimeout(() => {
            if (result || phase?.phase !== "reveal") return
            result = me.caught ? { t: "result", kind: "caught", points: 0, streak: 0, text: "" } : { t: "result", kind: "safe", points: 0, streak: me.streak, text: "" }
            paintReveal()
          }, 800)
        }
        paint()
        tick()
        break
      }
      case "rooms":
        for (const r of m.rooms) rooms.set(r.id, r)
        paintTiles()
        paintLeans(phase?.phase === "hide" ? m.leans : undefined)
        if (phase?.phase === "reveal") paintReveal()
        break
      case "say": {
        const info = HUNTER.get(m.hunter)
        hunting.style.setProperty("--hc", info?.color ?? "#fff")
        {
          // The cabal live on the phone: the speaker's portrait, name and line, large.
          const row = h("div", "hr-caption")
          row.style.setProperty("--hc", info?.color ?? "#fff")
          row.append(hunterFace(m.hunter, "hr-hface hr-caption-face"), h("b", "", info?.name ?? m.hunter), h("span", "", m.text))
          captionEl.replaceChildren(row)
        }
        tickerFace.replaceChildren(hunterFace(m.hunter, "hr-hface hr-ticker-hface"))
        tickerWho.replaceChildren(document.createTextNode(info?.name ?? m.hunter))
        tickerText.textContent = m.text
        replay(ticker, "fresh")
        sayLines.push({ hunter: m.hunter, text: m.text })
        while (sayLines.length > 2) sayLines.shift()
        paintSay()
        break
      }
      case "result":
        // One reveal can bring several results (safe + possessed + lie): headline the biggest, add the points.
        if (result && result.kind !== "caught" && m.kind !== "caught") {
          const rank: Record<ResultKind, number> = { caught: 0, safe: 1, possessed: 2, lie: 3 }
          const top = rank[m.kind] >= rank[result.kind] ? m : result
          result = { ...top, points: result.points + m.points, streak: Math.max(result.streak, m.streak) }
        } else result = m
        if (m.kind === "caught") me.streak = 0
        paintStats()
        paintReveal()
        cue(m.kind, m.streak)
        vibrate(m.kind === "caught" ? 500 : m.kind === "safe" ? 30 : [30, 40, 30])
        break
      case "pong":
        break
    }
  }

  const onStatus = (s: LinkStatus, detail: string) => {
    link = s
    // Honest outage copy: our own link failed (no pong, no open, fetch failed) vs the house closing on us.
    if (s !== "live") dead.dataset.cause = /pong|did not open|fetch|network|load failed|abort/i.test(detail) ? "net" : "house"
    root.dataset.link = s
    if (s === "live") {
      fullScr.classList.remove("show")
      clearTimeout(deadTimer)
      deadTimer = undefined
      if (dead.classList.contains("show")) {
        dead.classList.remove("show")
        toast("Back. Same room, same score.")
      }
      if (!everLive) {
        everLive = true
        if (splashUntil === Number.POSITIVE_INFINITY) splashUntil = Date.now() + SPLASH_MS
      }
    } else if (everLive && deadTimer === undefined && !dead.classList.contains("show")) {
      deadTimer = setTimeout(() => {
        deadTimer = undefined
        if (link !== "live") dead.classList.add("show")
      }, DEAD_AFTER_MS)
    } else if (!everLive) {
      splashYou.textContent = s === "down" ? "The door's stuck. Knocking again…" : "Passing away…"
    }
  }

  // ---------- your name: optional, saved on blur or Enter, never blocking ----------
  const cleanName = (raw: string) => raw.replace(/[^\p{L}\p{N} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX)
  async function commitName() {
    const name = cleanName(lobbyName.value).toLowerCase()
    if (!name || name === me.name) {
      lobbyName.value = me.name
      return
    }
    try {
      const res = await fetch("/api/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ghostId: id, ghostToken, name }),
        cache: "no-store",
      })
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // The server sanitizes; a refused name keeps the old one, so show whatever it answers with.
      me.name = isRecord(body) && isRecord(body.ghost) && typeof body.ghost.name === "string" ? body.ghost.name.toLowerCase() : name
      meName.textContent = me.name
      splashName.textContent = me.name
      lobbyName.value = me.name
    } catch {
      lobbyName.value = me.name
      toast("Couldn't change your name. Try again.")
    }
  }
  lobbyName.addEventListener("blur", () => void commitName())
  lobbyName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lobbyName.blur()
  })

  // ---------- full screen: one tap where the browser allows it (Android Chrome); iOS has none, so no button ----------
  const canFull = typeof document.documentElement.requestFullscreen === "function" && !/iPhone|iPad|iPod/.test(navigator.userAgent)
  const paintFull = () => fullBtn.classList.toggle("on", canFull && !document.fullscreenElement)
  fullBtn.addEventListener("click", () => {
    void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined)
  })
  document.addEventListener("fullscreenchange", paintFull)
  paintFull()

  // ---------- locked like a native game: no rubber-band, pull-to-refresh, zoom or long-press menus ----------
  const noScroll = (e: TouchEvent) => {
    if (e.target !== lobbyName && e.touches.length >= 1) e.preventDefault()
  }
  const noMenu = (e: Event) => {
    if (e.target !== lobbyName) e.preventDefault()
  }
  document.addEventListener("touchmove", noScroll, { passive: false })
  document.addEventListener("contextmenu", noMenu)

  // Keep the screen awake while haunting (a sleeping phone drops its socket). Some browsers need a tap first.
  let wakeLock: WakeLockSentinel | null = null
  const holdAwake = async () => {
    if (disposed || wakeLock || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return
    try {
      wakeLock = await navigator.wakeLock.request("screen")
      wakeLock.addEventListener("release", () => {
        wakeLock = null
      })
    } catch {
      // not allowed yet (no tap, low battery): try again on the next tap or return to the page
    }
  }
  const onVisible = () => void holdAwake()
  document.addEventListener("visibilitychange", onVisible)
  root.addEventListener("pointerdown", onVisible, { passive: true })
  const blockPinch = (e: Event) => e.preventDefault()
  document.addEventListener("gesturestart", blockPinch)
  unlockPhoneAudio()

  session = openSession(id, {
    status: onStatus,
    full(retryInMs) {
      // Over the player cap: wait at the gate, the session knocks again every 20 s.
      fullScr.classList.add("show")
      splash.classList.add("out")
      if (!fullFace.firstChild) fullFace.append(h("span", "hr-orb hr-orb-xl"))
      fullCount.textContent = `Trying again in ${Math.round(retryInMs / 1000)} s.`
    },
    joined(ghost, token) {
      ghostToken = token
      // A new socket: the first {t:"you"} on it is the truth. Keep an unconfirmed pick to resend once.
      resendHide = phase?.phase === "hide" ? chosen : null
      chosen = null
      paint()
      void holdAwake()
      if (!me.name) {
        me.name = ghost.name.toLowerCase()
        me.color = ghost.color || me.color
        root.style.setProperty("--me", me.color)
        meName.textContent = me.name
        splashName.textContent = me.name
        lobbyName.value = me.name
        splashYou.textContent = "You are"
        splash.classList.add("named")
        splashUntil = Date.now() + SPLASH_MS
      }
    },
    message: onMessage,
  })

  paintStats()
  paint()
  tick()
  const dither = attachPhoneDither(root, { contrast: 0.8 })

  return () => {
    if (disposed) return
    disposed = true
    session?.close()
    dither.destroy()
    clearInterval(clockTimer)
    clearTimeout(toastTimer)
    clearTimeout(climbTimer)
    clearTimeout(revealTimer)
    clearTimeout(summaryTimer)
    clearTimeout(deadTimer)
    document.removeEventListener("visibilitychange", onVisible)
    document.removeEventListener("gesturestart", blockPinch)
    document.removeEventListener("touchmove", noScroll)
    document.removeEventListener("contextmenu", noMenu)
    document.removeEventListener("fullscreenchange", paintFull)
    void wakeLock?.release().catch(() => undefined)
    document.title = prevTitle
    document.documentElement.classList.remove("hr-page")
    root.classList.remove("hr-root", "on-fire")
    for (const a of ["data-phase", "data-screen", "data-link", "data-mode"]) root.removeAttribute(a)
    root.style.removeProperty("--me")
    root.replaceChildren()
  }
}
