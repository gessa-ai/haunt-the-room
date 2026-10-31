// The Agent Relay feed as a haunted ledger: hunter-coloured names, typed actions as chips, DMs under a wax
// seal (PRIVATE), the dead's whispers in ghost ink. createFeed() is the stage's right panel; /feed mounts it alone.
import "./fonts"
import { HUNTERS, ROOMS } from "../../../contract/protocol"
import { fakeRelaySource } from "./dev/fakeRelay"
import "./feed.css"
import { isHunter, observerSource, type FeedItem, type FeedSource } from "./relay"
import { hunterPortrait, talk } from "./portrait"

const KEEP = 14
const HUNTER = new Map<string, { name: string; color: string }>(HUNTERS.map((x) => [x.id, { name: x.name, color: x.color }]))
const ROOM_NAME = new Map<string, string>(ROOMS.map((r) => [r.id, r.name.replace(/^The /, "")]))

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

function who(name: string | null): HTMLElement {
  if (!name) return el("span", "fd-who fd-who-unknown", "someone")
  const h = HUNTER.get(name)
  const span = el("span", "fd-who", h ? h.name.replace(/^The /, "") : name === "referee" ? "Referee" : name)
  span.style.color = h ? h.color : "#bfb39a"
  if (h || name === "referee") {
    const wrap = el("span", "fd-whowrap")
    wrap.append(el("span", "fd-ai", h ? "AI" : "RULES"), span)
    return wrap
  }
  return span
}

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

export interface Feed {
  push(item: FeedItem): void
  /** Between the header and the list: the stage puts its leaderboard here. */
  slot: HTMLElement
}

export function createFeed(
  host: HTMLElement,
  opts: { onWhisper?: () => void; onItem?: (i: FeedItem) => void; stage?: boolean; watch?: boolean } = {},
): Feed {
  const fake = new URLSearchParams(location.search).get("fake")
  const source: FeedSource = fake ? fakeRelaySource() : observerSource(opts.watch)
  const panel = el("section", opts.stage ? "fd fd-stage" : "fd")
  const head = el("header", "fd-head")
  const title = el("div", "fd-title", "#hunt")
  const sub = el("div", "fd-sub", "Four AI agents discussing you. Live on Agent Relay.")
  const foot = el("div", "fd-foot", "four AI agents · live on Agent Relay")
  const live = el("div", "fd-live", "connecting")
  head.append(title, sub, live)
  const slot = el("div", "fd-slot")
  const list = el("div", "fd-list")
  const count = el("div", "fd-count", "0 messages")
  panel.append(head, slot, list, count, foot)
  host.append(panel)
  const seen = new Set<string>()
  let total = 0

  // ---- stage chat, Discord-style: big portrait, name row, message under it; one hunter's run groups together ----
  let lastGroup: { key: string; body: HTMLElement; row: HTMLElement } | null = null
  const trim = () => {
    while (list.children.length > KEEP) list.firstElementChild?.remove()
    while (list.children.length > 1 && list.scrollHeight > list.clientHeight + 1) list.firstElementChild?.remove()
  }
  const name = (id: string | null) => {
    const h = id ? HUNTER.get(id) : undefined
    const n = el("span", "dc-name", h ? h.name.replace(/^The /, "").toLowerCase() : id ?? "someone")
    if (h) n.style.color = h.color
    return n
  }
  const pushDiscord = (item: FeedItem): void => {
    if (item.kind === "say" || item.kind === "dm") {
      const key = item.kind === "say" ? `say:${item.from}` : `dm:${item.from}:${item.to}`
      const msg = el("p", "dc-msg", item.text)
      if (item.kind === "dm") msg.classList.add("dc-dm")
      if (isHunter(item.from)) talk(item.from)
      if (lastGroup && lastGroup.key === key && lastGroup.row.isConnected) {
        lastGroup.body.append(msg)
        trim()
        return
      }
      const row = el("article", "dc-group")
      const face = isHunter(item.from) ? hunterPortrait(item.from, 60) : el("span", "dc-noface")
      face.classList.add("dc-face")
      const body = el("div", "dc-body")
      const head = el("div", "dc-head")
      if (item.kind === "dm") {
        const seal = el("span", "fd-seal dc-seal")
        seal.append(el("span", "fd-seal-glyph", "✠"))
        head.append(name(item.from), el("span", "dc-to", "→"), name(item.to), seal, el("span", "dc-private", "private"))
      } else head.append(name(item.from), el("span", "dc-ai", "AI"))
      body.append(head, msg)
      row.append(face, body)
      list.append(row)
      lastGroup = { key, body, row }
    } else {
      lastGroup = null
      const row = el("article", `dc-sys dc-${item.kind}`)
      if (item.kind === "whisper") {
        row.append(el("span", "dc-ghost"), el("span", "dc-whisper", item.text), el("span", "dc-to", `→ ${(item.to ?? "").toLowerCase()}`))
      } else {
        const chip = el("span", "fd-chip dc-chip")
        const h = item.from ? HUNTER.get(item.from) : undefined
        if (h) chip.style.setProperty("--chip", h.color)
        const target = item.action === "taunt" ? `“${item.target || item.note || ""}”` : (ROOM_NAME.get(item.target) ?? item.target).toLowerCase()
        chip.append(el("span", `fd-chip-icon px-${item.action}`), el("span", "", `${item.action} ${target}`))
        row.append(item.from ? name(item.from) : el("span", "dc-name", "referee"), chip)
      }
      list.append(row)
    }
    trim()
  }

  const push = (item: FeedItem): void => {
    if (seen.has(item.key)) return
    seen.add(item.key)
    total++
    opts.onItem?.(item)
    count.textContent = `${total} message${total === 1 ? "" : "s"} on the relay`
    if (opts.stage) return pushDiscord(item)
    const row = el("article", `fd-item fd-${item.kind}`)
    const margin = el("div", "fd-time", clock(item.at))
    const body = el("div", "fd-body")
    if (item.kind === "say") {
      const line = el("div", "fd-line")
      line.append(who(item.from), el("span", "fd-arrow", "→"), el("span", "fd-chan", `#${item.channel}`))
      body.append(line, el("p", "fd-text", item.text))
      const h = HUNTER.get(item.from)
      if (h) row.style.setProperty("--ink", h.color)
    } else if (item.kind === "dm") {
      const line = el("div", "fd-line")
      const seal = el("span", "fd-seal")
      seal.append(el("span", "fd-seal-glyph", "✠"))
      line.append(seal, el("span", "fd-private", "PRIVATE"), who(item.from), el("span", "fd-arrow", "→"), who(item.to))
      body.append(line, el("p", "fd-text", item.text))
    } else if (item.kind === "whisper") {
      const line = el("div", "fd-line")
      line.append(el("span", "fd-dead", "a ghost, lying"), el("span", "fd-arrow", "→"), who(item.to))
      body.append(line, el("p", "fd-text fd-ghost", `“${item.text}”`))
      opts.onWhisper?.()
    } else {
      const line = el("div", "fd-line fd-chips")
      if (item.from) line.append(who(item.from))
      const chip = el("span", "fd-chip")
      const h = item.from ? HUNTER.get(item.from) : undefined
      if (h) chip.style.setProperty("--chip", h.color)
      chip.append(el("span", `fd-chip-icon px-${item.action}`), el("span", "fd-chip-verb", item.action.toUpperCase()))
      if (item.action === "taunt") {
        line.append(chip)
        body.append(line, el("p", "fd-text fd-taunt", `“${item.target || item.note || ""}”`))
      } else {
        chip.append(el("span", "fd-chip-arrow", "→"), el("span", "fd-chip-room", (ROOM_NAME.get(item.target) ?? item.target).toUpperCase()))
        line.append(chip)
        body.append(line)
        if (item.note) body.append(el("p", "fd-note", item.note))
      }
    }
    // the speaker's portrait (hunters only): the chat reads as faces talking
    const speaker = item.kind === "say" || item.kind === "dm" ? item.from : item.kind === "action" ? item.from : null
    margin.replaceChildren(isHunter(speaker) ? hunterPortrait(speaker, 40) : el("span", "fd-noface"))
    if (isHunter(speaker) && item.kind !== "action") talk(speaker)
    if (item.kind === "action" || item.kind === "whisper") margin.replaceChildren(el("span", "fd-noface"))
    row.append(margin, body)
    list.append(row)
    while (list.children.length > KEEP) list.firstElementChild?.remove()
    // messages stack from the top; when the column is full the oldest leave so the newest always shows
    while (list.children.length > 1 && list.scrollHeight > list.clientHeight + 1) list.firstElementChild?.remove()
    if (seen.size > 600) seen.clear()
  }

  source.start({
    item: push,
    status(ok, why) {
      live.textContent = ok ? "live" : "reconnecting"
      live.classList.toggle("on", ok)
      live.title = why
      if (!ok) console.warn(`[feed] ${why}`)
    },
  })
  return { push, slot }
}

/** /feed: the ledger alone, 614x1080 scaled to the window. */
export function mountFeed(root: HTMLElement): void {
  root.innerHTML = ""
  const frame = el("div", "fd-alone")
  root.append(frame)
  createFeed(frame)
  const fit = () => {
    const s = Math.min(window.innerWidth / 614, window.innerHeight / 1080)
    frame.style.transform = `translate(${(window.innerWidth - 614 * s) / 2}px, ${(window.innerHeight - 1080 * s) / 2}px) scale(${s})`
  }
  fit()
  window.addEventListener("resize", fit)
}
