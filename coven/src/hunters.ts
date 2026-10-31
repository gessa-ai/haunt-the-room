// THE CABAL: four hunters at the table, each its own Relay agent with its own private memory.
//
// A crowd whisper (a DM from the-dead) reaches ONE hunter: only that hunter knows it, until it repeats it at the
// table. It may sway that hunter at once (typed "lean" {room, conviction, swayedBy: the whisperer's public name}).
// HIDE: one opening line + lean per hunter, one speaker at a time (~1 s apart).
// HUNTING (9 s): four table lines, one speaker at a time ~1.8 s apart, each a real #hunt message from that agent,
// each with a conviction update; then every hunter's secret sweep before the bell. The stated lean and the real
// sweep differ sometimes (betrayal); the next beat somebody calls it out.
// Each line is one think() for that hunter alone (its persona, its own whispers, the table so far, the round's
// memory), 1.5 s budget. Late model = the authored bank (lines.ts) for the situation. Never dead air.

import { HUNTERS, ROOMS, TIMING, type HunterId, type HuntView, type Phase, type RoomId, type VoiceEvent } from "../../contract/protocol.ts"
import { PG13, noEmoji, sanitize } from "./content.ts"
import { bankIds, bankLine, renderedLine, type Situation, type Slots } from "./lines.ts"
import { CHANNEL, relaySuspect, stripDm, type Agent } from "./relay.ts"
import { hunterName, roomName, type House, type Referee } from "./referee.ts"
import { brainName, think } from "./think.ts"

const POLL_MS = 500 // House load (P0 14:42): 2 huntView reads/s, the only House read the coven makes
const LEAN_GAP_MS = 1_500 // at most one lean per hunter per 1.5 s, sent only on a new room or conviction change >= 10
const LLM_MS = 1_500 // a line the model has not written by then comes from the bank
const HIDE_SLOTS = [1_700, 2_500, 3_300, 4_100] // ms into hide: each hunter's opener, after the beat call (~1.5 s) is back
const HUNT_SLOTS = [1_600, 3_400, 5_200, 7_000] // ms into hunting: four table lines
const SWEEP_AT = 8_000 // ms into hunting: every secret sweep (hunting is 9 s)
const MAX_CHARS = 70
const BEST = [
  `medium: "kyle says the crypt. i've checked kyle's aura. it's clean."`,
  `skeptic: "kyle is a dead stranger who typed one sentence."`,
  `exorcist: "it means she picked you. out of four."`,
  `skeptic: "board says the attic is empty. so they're in the attic."`,
  `priest: "i stand with you in my heart. my token had other plans."`,
  `medium: "nine of you said the crypt. nine. that's not a rumour, that's data."`,
  `exorcist: "we just lost the attic. my coat is in the attic."`,
  `skeptic: "medium, that's your fourth whisper. you're 0 for 3."`,
  `priest: "a catch is a team effort. i was the team."`,
  `medium: "kyle lied to me in beat one. i will not be fooled again."`,
]
const PRESSURE_FILE = new URL("../../research/CABAL-PRESSURE.md", import.meta.url).pathname

const CHARACTER: Record<HunterId, string> = {
  exorcist: "Tired professional on overtime who just wants to go home. Dry, flat, bills by the hour, gives orders by name. Checks whispers against the counts, mostly. Never excited.",
  medium: "Gullible and PROUD of it. Believes every whisper, brags that the whisperer trusts her personally, theatrical and grand about it: big pronouncements, visions, omens, takes a lie as a cosmic betrayal and keeps a grudge, then believes the next one anyway. Dramatic, never cute: no pet names.",
  skeptic: "Mocks the Medium with exact numbers, keeps a tally of everyone's mistakes, never says ghost (says subjects). Always does the opposite of any whisper, and is wrong anyway. Bluffs his lean.",
  priest: "Vain. Talks about his robes, his voice, his good side. Takes credit for catches, blames the Medium for misses. Flattery from a whisperer works on him. Leans toward drama, betrays at the vote.",
}
const COMEDY = [
  "Tone (owner): adult and sharp. Keep the theatrics (the Medium is dramatic, the Priest vain, the Exorcist dry, the Skeptic petty), but never cute: no pet names (darling, sweetie, honey, dear), no 'i thought we had something', no hugs, no baby talk.",
  "Write in lowercase. Comedy rules: dramatic irony first (the audience SEES the real counts, so a believed lie is the joke). Be a real person with a status game, not a narrator.",
  "Name real players (lowercase guest names) and real rooms and counts. Call back to earlier beats by name. Bicker, interrupt, make and break alliances.",
  "ONE idea per line, at most 70 characters, plain speech. No puns on boo or spooky, no 'I sense a presence', no 'let's', no emoji, no exclamation marks, no all caps, no dashes.",
].join(" ")

type Whisper = { name: string; room: RoomId; beat: number; repeated: boolean; at: number; human: boolean }
interface Mind {
  id: HunterId
  agent: Agent
  whispers: Whisper[] // PRIVATE: only this hunter's agent received these
  liedBy: { name: string; room: RoomId; beat: number }[] // whispers that sent it to an empty room
  lean: RoomId | null
  conviction: number
  swayedBy?: string
  vote: RoomId | null
  leanAtBell: RoomId | null
  votes: { beat: number; room: RoomId; caught: number }[] // its own past sweeps
}
interface TableLine { beat: number; hunter: HunterId; text: string }

export interface Hunt { stop(): void }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ROOM_IDS = ROOMS.map((r) => r.id) as RoomId[]
const HUNTER_IDS = HUNTERS.map((h) => h.id) as HunterId[]
const PHASES: Phase[] = ["lobby", "intro", "hide", "hunting", "reveal", "finale"]
const roomIn = (text: unknown): RoomId | null =>
  typeof text === "string" ? (ROOM_IDS.find((id) => new RegExp(`\\b${id}\\b`, "i").test(text)) ?? null) : null
const clamp = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d)
const ranked = (v: HuntView) => [...v.rooms].sort((a, b) => b.count - a.count)
const countOf = (v: HuntView, room: RoomId) => v.rooms.find((r) => r.id === room)?.count ?? 0

/** One projector line: <= 70 chars, whole sentences when it must be cut, no emoji, no exclamation spam. */
function cap(text: string): string {
  const t = noEmoji(text).toLowerCase().replace(/!+/g, ".").replace(/\.\.+/g, ".").replace(/\s+/g, " ").trim()
  if (t.length <= MAX_CHARS) return t
  const sentences = t.match(/[^.?]+[.?]+|[^.?]+$/g)?.map((s) => s.trim()) ?? [t]
  let out = ""
  for (const s of sentences) if ((out ? `${out} ${s}` : s).length <= MAX_CHARS) out = out ? `${out} ${s}` : s
  if (out) return out
  return t.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + "."
}
// CABAL-PRESSURE line law: a model line with a banned word, or with no name, room, count or beat, goes to the bank.
const BANNED = /\b(boo|spooky|spirits?|presence|realm|beyond|veil|darkness|let's|dive|delve|unleash|beware|darlings?|sweet(ie|heart)?|honey|dear(est)?|babe|hugs?|uwu|cutie|bestie|we had something|hurt me|so loved|bff)\b|!/i
const FACT = new RegExp(`\\d|\\b(${[...ROOM_IDS, ...HUNTER_IDS, "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "beat"].join("|")})\\b`, "i")
const lawful = (s: string, names: string[]) => !BANNED.test(s) && !/\b[A-Z]{4,}\b/.test(s) && (FACT.test(s) || names.some((n) => n && s.toLowerCase().includes(n)))

function validView(v: unknown): v is HuntView {
  const x = v as Partial<HuntView> | null
  return !!x && PHASES.includes(x.phase as Phase) && typeof x.beat === "number" && typeof x.msLeft === "number" &&
    Array.isArray(x.rooms) && x.rooms.length > 0 && Array.isArray(x.recent) && Array.isArray(x.votes) && typeof x.possessedCount === "number"
}

export function startHunters(opts: { agents: Record<HunterId, Agent>; house: House; referee: Referee; log: (line: string) => void }): Hunt {
  const { house, referee, log } = opts
  let running = true
  let last: HuntView | null = null
  const timers: ReturnType<typeof setTimeout>[] = []
  const minds = new Map<HunterId, Mind>()
  let table: TableLine[] = [] // the public table talk this round
  let memory: string[] = [] // public moments this round (callbacks)
  let betrayals: { hunter: HunterId; leaned: RoomId; swept: RoomId; beat: number; called: boolean }[] = []
  let caughtTotal = 0
  let possessedLast: RoomId | null = null
  let pressure = ""
  let dmShapeLogged = false
  const beatLines = new Map<string, { say: string; lean: RoomId | null; conviction: number; vote: RoomId | null; brain: string }>() // `${beat}:${hunter}` from the beat call

  const remember = (s: string) => (memory.push(s), memory.length > 10 && memory.shift())
  const later = (ms: number, fn: () => Promise<unknown>) =>
    timers.push(setTimeout(() => void fn().catch((e) => log(`[hunt] ${(e as Error).message}`)), Math.max(0, ms)))
  const relayed = (what: string, p: Promise<unknown>) =>
    p.then(() => true, (e: Error) => {
      if (/network|transport|ECONNREFUSED|socket|fetch/i.test(e.message)) relaySuspect()
      log(`[hunt] ${what} did not reach Relay: ${e.message.slice(0, 100)}`)
      return false
    })

  for (const h of HUNTERS) {
    const m: Mind = { id: h.id, agent: opts.agents[h.id], whispers: [], liedBy: [], lean: null, conviction: 50, vote: null, leanAtBell: null, votes: [] }
    minds.set(h.id, m)
    m.agent.attach((a) => a.relay.addListener("dm.received", (e) => {
      const raw = e as unknown as { metadata?: unknown; message: { metadata?: unknown } }
      let meta = raw.message.metadata ?? raw.metadata
      if (typeof meta === "string") meta = (() => { try { return JSON.parse(meta as string) } catch { return undefined } })()
      // dm.received carries no metadata (measured 15:22): read it back by id (1 ms locally) for by / room / bot
      void (async () => {
        if (!meta) {
          try {
            meta = ((await (a.me as unknown as { messages: { get(id: string): Promise<{ metadata?: unknown }> } }).messages.get(e.message.id)).metadata)
          } catch (x) {
            log(`[hunt] could not read whisper metadata (${(x as Error).message.slice(0, 60)}): treated as human`)
          }
        }
        if (!dmShapeLogged) (dmShapeLogged = true), log(`[hunt] first whisper metadata: ${JSON.stringify(meta).slice(0, 200)}`)
        onDm(m, e.message.from.name ?? "?", e.message.text, meta as Record<string, unknown> | undefined)
      })()
    }))
  }

  void Bun.file(PRESSURE_FILE).text().then((t) => (pressure = t.slice(0, 3_000)), () => {})
  const pressureTimer = setInterval(() => void Bun.file(PRESSURE_FILE).text().then((t) => (pressure = t.slice(0, 3_000)), () => {}), 30_000)

  // ---------- Relay writes (each hunter's own agent) ----------

  /** voice: a VoiceEvent, or a pre-rendered file key "<hunter>/<key>-<n>" (stage plays the v3 file, no live call). */
  async function say(m: Mind, text: string, src: string, voice?: VoiceEvent | string) {
    text = cap(text)
    table.push({ beat: last?.beat ?? 0, hunter: m.id, text })
    if (table.length > 24) table.shift()
    log(`  ${m.id.padEnd(9)} ${text}   [${src}${m.lean ? ` · ${m.lean} ${m.conviction}${m.swayedBy ? ` swayed by ${m.swayedBy}` : ""}` : ""}]`)
    await relayed(`${m.id}'s line`, m.agent.me.sendMessage({ to: `#${CHANNEL}`, text, metadata: { kind: "say", hunter: m.id, ...(voice ? { voice } : {}), ...(bankIds.has(text) ? { lineId: bankIds.get(text) } : {}) } }))
  }
  // House calls per beat (logged at each reveal): the coven's whole load on the House
  const calls = { huntView: 0, lean: 0, sweep: 0, leanSkipped: 0 }
  const sent = new Map<HunterId, { room: RoomId; conviction: number; swayedBy?: string; at: number }>()
  const leanTimers = new Map<HunterId, ReturnType<typeof setTimeout>>()
  /** The hunter's lean changes at once in its own mind; the House hears the coalesced result at most every 1.5 s. */
  async function lean(m: Mind, room: RoomId, conviction: number, swayedBy?: string, jump = false) {
    if (last?.phase !== "hide" && last?.phase !== "hunting") return
    m.lean = room
    m.conviction = conviction
    if (swayedBy) m.swayedBy = swayedBy
    if (jump && leanTimers.has(m.id)) clearTimeout(leanTimers.get(m.id)), leanTimers.delete(m.id) // an interjection jumps the queue
    if (leanTimers.has(m.id)) return void calls.leanSkipped++ // a flush is already queued: it sends the latest
    const prev = sent.get(m.id)
    const wait = prev && !jump ? Math.max(0, prev.at + LEAN_GAP_MS - Date.now()) : 0
    leanTimers.set(m.id, setTimeout(() => {
      leanTimers.delete(m.id)
      if (!running || !m.lean || (last?.phase !== "hide" && last?.phase !== "hunting")) return
      const p = sent.get(m.id)
      if (p && p.room === m.lean && Math.abs(p.conviction - m.conviction) < 10 && p.swayedBy === m.swayedBy) return void calls.leanSkipped++
      sent.set(m.id, { room: m.lean, conviction: m.conviction, swayedBy: m.swayedBy, at: Date.now() })
      calls.lean++
      void relayed(`${m.id}'s lean`, m.agent.me.capabilities.invoke("lean", { hunter: m.id, room: m.lean, conviction: m.conviction, ...(m.swayedBy ? { swayedBy: m.swayedBy } : {}) }))
    }, wait))
  }
  /** A sweep must land: one immediate retry when Relay drops the invocation (seen under show load, 14:36). */
  const cast = async (m: Mind, room: RoomId) => {
    calls.sweep++
    if (await relayed(`${m.id}'s sweep`, m.agent.me.capabilities.invoke("sweep", { hunter: m.id, room }))) return true
    calls.sweep++ // retry only after the invocation failed
    return relayed(`${m.id}'s sweep (retry)`, m.agent.me.capabilities.invoke("sweep", { hunter: m.id, room }))
  }

  // ---------- private memory: whispers ----------

  /** The whisperer's public name: the server's lure metadata, else the "<name>:" prefix, else "a ghost". */
  function whispererName(text: string, meta?: Record<string, unknown>): string {
    for (const k of ["by", "name", "from", "ghostName", "whisperer"]) if (typeof meta?.[k] === "string" && meta[k]) return String(meta[k]).toLowerCase().slice(0, 16)
    return /^([a-z][a-z0-9 ]{0,15}?)(?: whispers?)?:\s/i.exec(text)?.[1]?.toLowerCase() ?? "a ghost"
  }

  function onDm(m: Mind, from: string, raw: string, meta?: Record<string, unknown>) {
    if (from !== "the-dead") return
    const text = stripDm(raw)
    const room = (typeof meta?.room === "string" && ROOM_IDS.includes(meta.room as RoomId) ? (meta.room as RoomId) : null) ?? roomIn(text) ?? roomIn(ROOMS.find((r) => text.includes(r.name))?.id)
    if (!room || !last) return
    const name = whispererName(text, meta)
    m.whispers.push({ name, room, beat: last.beat, repeated: false, at: Date.now(), human: meta?.bot !== true })
    if (m.whispers.length > 60) m.whispers.shift()
    log(`  the-dead  DM → ${m.id}: ${name} says ${room}`)
    const before = m.lean
    swing(m, last.phase === "hunting")
    if (last.phase === "hunting") later(500, () => interject(m, before))
  }

  /** A lie DURING the debate (owner 15:05, Among Us meeting): within ~1 s the hunter who heard it interjects, naming
   *  the liar; its lean jumps the queue; a swayed vote flips (the sweep at ~8 s reads the latest lean). */
  let interjection: { hunter: HunterId; name: string; room: RoomId; from: RoomId | null; beat: number; reacted: boolean } | null = null
  async function interject(m: Mind, before: RoomId | null) {
    const v = last
    if (!running || !v || v.phase !== "hunting") return
    const p = pull(m, v.beat)
    if (!p) return
    const flipped = !!m.swayedBy && m.lean !== before
    if (flipped && m.lean) m.vote = m.lean // the room decides: a late lie flips the vote
    interjection = { hunter: m.id, name: p.name, room: p.room, from: before, beat: v.beat, reacted: false }
    if (flipped) remember(`beat ${v.beat}: ${hunterName(m.id)} switched to ${m.lean} mid-debate because ${p.name} whispered ${p.room}`)
    const s: Situation = p.n >= 2 ? "crowdLie" : "whispered"
    await say(m, bankLine(m.id, s, { name: p.name, room: roomName(p.room), count: p.n }), `interjection${flipped ? `, vote flipped ${before} -> ${m.lean}` : ""}`)
  }

  /** PLAYER AGENCY (owner 14:35): lies aggregate. Each whisper this beat adds one to its room's pull on THIS hunter;
   *  the strongest pull sets the lean and conviction (and the vote follows it), so a new lie about another room can
   *  talk a hunter out of the old one. The Skeptic is swayed by the opposite of the majority. */
  function pull(m: Mind, beat: number): { room: RoomId; n: number; name: string; total: number; weight: number; human: boolean } | null {
    const mine = m.whispers.filter((w) => w.beat === beat)
    if (!mine.length) return null
    // HUMANS OUTRANK BOTS (L13 QA 15:20): a human lie weighs 3, a bot lie (metadata.bot) 1; the latest human lie of the
    // beat always sets the room and the swayedBy name, whatever the bots said
    const human = mine.findLast((w) => w.human)
    const weight = (ws: Whisper[]) => ws.reduce((n, w) => n + (w.human ? 3 : 1), 0)
    const by = new Map<RoomId, Whisper[]>()
    for (const w of mine) by.set(w.room, [...(by.get(w.room) ?? []), w])
    const [room, ws] = human
      ? [human.room, by.get(human.room)!]
      : [...by.entries()].sort((a, b) => weight(b[1]) - weight(a[1]) || b[1].at(-1)!.at - a[1].at(-1)!.at)[0]!
    return { room, n: ws.length, name: (ws.findLast((w) => w.human) ?? ws.at(-1)!).name, total: mine.length, weight: weight(ws), human: !!human }
  }
  const swayTag = (p: { n: number; name: string }) => (p.n > 1 ? `${p.name.slice(0, 11)} +${p.n - 1}` : p.name.slice(0, 16))
  function swing(m: Mind, jump = false) {
    const v = last
    if (!v) return
    const p = pull(m, v.beat)
    if (!p) return
    const top = ranked(v)[0]!
    if (m.id === "skeptic") {
      const away = ranked(v).find((r) => r.id !== p.room)!.id
      return void lean(m, away, Math.min(99, 55 + 10 * p.weight), swayTag(p), jump) // nine of you said the crypt, so: not the crypt
    }
    const sways =
      m.id === "medium" ? true :
      m.id === "priest" ? p.weight >= 2 || Math.random() < 0.7 :
      p.weight >= 3 || countOf(v, p.room) >= 0.6 * Math.max(1, top.count) // the Exorcist needs a crowd of liars (or one human) or the count
    if (!sways) return
    const base = m.id === "medium" ? 70 : m.id === "priest" ? 55 : 40
    if (m.id === "medium" && p.human) m.vote = p.room // a human lie always flips the Medium's vote
    void lean(m, p.room, Math.min(99, base + 10 * p.weight), swayTag(p), jump || p.human)
  }
  // the Medium never lets a whisper go: she keeps repeating it all beat
  const freshWhisper = (m: Mind, beat: number) => m.whispers.findLast((w) => w.beat === beat && (!w.repeated || m.id === "medium")) ?? null

  // ---------- one line ----------

  function situation(m: Mind, v: HuntView, prev: TableLine | undefined): { s: Situation; slots: Slots } {
    const top = ranked(v)[0]!
    const base: Slots = { room: roomName(top.id), count: top.count }
    const ij = interjection
    if (ij && !ij.reacted && ij.beat === v.beat && ij.hunter !== m.id && v.phase === "hunting") {
      ij.reacted = true
      return { s: "flipflop", slots: { ...base, other: hunterName(ij.hunter), name: ij.name, room: roomName(ij.room), room2: ij.from ? roomName(ij.from) : roomName(top.id) } }
    }
    const w = freshWhisper(m, v.beat)
    const p = pull(m, v.beat)
    if (p && p.n >= 2 && Math.random() < 0.7) return { s: "crowdLie", slots: { ...base, name: p.name, room: roomName(p.room), count: p.n } }
    const burned = m.liedBy.at(-1)
    if (w && burned && burned.name !== w.name || w && burned && Math.random() < 0.5) return { s: "fooledAgain", slots: { ...base, name: w!.name, room: roomName(w!.room), liar: burned!.name, beat: burned!.beat, room2: roomName(burned!.room) } }
    if (w) return { s: "whispered", slots: { ...base, name: w.name, room: roomName(w.room) } }
    const b = betrayals.find((x) => !x.called && x.hunter !== m.id && x.beat >= v.beat - 1)
    if (b) return { s: "betrayal", slots: { ...base, other: hunterName(b.hunter), room: roomName(b.leaned), room2: roomName(b.swept) } }
    const lie = m.liedBy.findLast((l) => l.beat >= v.beat - 2)
    if (lie && Math.random() < 0.6) return { s: "lied", slots: { ...base, name: lie.name, room: roomName(lie.room), beat: lie.beat } }
    // the previous speaker repeated a whisper: mock them
    const fool = prev && prev.hunter !== m.id ? minds.get(prev.hunter)!.whispers.find((x) => x.beat === v.beat && x.repeated) : null
    if (prev && fool && m.id !== "medium") return { s: "mock", slots: { ...base, other: hunterName(prev.hunter), name: fool.name, room: roomName(fool.room), tally: minds.get(prev.hunter)!.whispers.length } }
    if (possessedLast && Math.random() < 0.5) return { s: "possessed", slots: { ...base, room: roomName(possessedLast) } }
    if (v.possessedCount >= 1 && Math.random() < 0.4) return { s: "losing", slots: { ...base, count: v.possessedCount, name: m.liedBy.at(-1)?.name } }
    if (caughtTotal >= 10 && Math.random() < 0.3) return { s: "winning", slots: { ...base, count: caughtTotal } }
    const known = [...minds.values()].flatMap((x) => x.whispers).at(-1)?.name
    if (prev && prev.hunter !== m.id && known && Math.random() < 0.35) return { s: "mock", slots: { ...base, other: hunterName(prev.hunter), name: known } }
    const empty = v.rooms.find((r) => r.count === 0)
    if (empty && Math.random() < 0.3) return { s: "empty", slots: { ...base, room: roomName(empty.id) } }
    return { s: "crowded", slots: base }
  }

  function systemPrompt(m: Mind): string {
    const h = HUNTERS.find((x) => x.id === m.id)!
    return [
      `You are ${h.name}, one of four AI ghost hunters arguing at a round table on a big screen, like the discussion in Among Us. The audience are the ghosts: each beat they hide in one of six rooms (they see the live counts), the two most-swept rooms catch everyone in them, and they whisper lies to single hunters.`,
      `Character: ${CHARACTER[m.id]}`,
      COMEDY,
      pressure ? `Comedy notes from the writers' room (follow them):\n${pressure}` : "",
      PG13,
      `Reply with ONE JSON object only: {"say": your next line at the table (<= 70 chars), "lean": room id you openly claim, "conviction": 0-100, "vote": room id you will REALLY sweep (secret; may differ from lean)}. Room ids: ${ROOM_IDS.join(", ")}.`,
    ].filter(Boolean).join("\n")
  }

  function userPrompt(m: Mind, v: HuntView, hint: { s: Situation; slots: Slots }, opener: boolean): string {
    const ask = [
      `Beat ${v.beat}, ${v.phase === "hide" ? "the ghosts are still moving" : "phones are locked, final positions"}. Rooms possessed ${v.possessedCount}/${v.roomsToWin}.`,
      `Live counts: ${ranked(v).map((r) => `${r.id} ${r.count}${r.possessed ? " (POSSESSED)" : ""}`).join(", ")}.`,
      `Your current lean: ${m.lean ?? "none"} (conviction ${m.conviction}${m.swayedBy ? `, swayed by ${m.swayedBy}` : ""}).`,
    ]
    const mine = m.whispers.filter((w) => w.beat >= v.beat - 1)
    const pl = pull(m, v.beat)
    if (pl && pl.n >= 2) ask.push(`PRIVATE: ${pl.n} different ghosts (latest ${pl.name}) whispered ${pl.room} to you this beat (${pl.room} really has ${countOf(v, pl.room)}). React to the NUMBER.`)
    if (mine.length) ask.push(`PRIVATE (only you got these; the others know only if you say it): ${mine.map((w) => `${w.name} whispered "${w.room}" (beat ${w.beat}; ${w.room} has ${countOf(v, w.room)} now)`).join("; ")}.`)
    const history = m.whispers.filter((w) => w.beat < v.beat)
    if (history.length) ask.push(`Your past whispers: ${history.map((w) => `beat ${w.beat} ${w.name} said ${w.room}`).join("; ")}.`)
    if (m.votes.length) ask.push(`Your past sweeps: ${m.votes.map((x) => `beat ${x.beat} ${x.room} caught ${x.caught}`).join("; ")}. Team catch tally: ${caughtTotal}.`)
    if (m.liedBy.length) ask.push(`Players who lied to you this round: ${m.liedBy.map((l) => `${l.name} (${l.room}, beat ${l.beat}, it was empty)`).join("; ")}.`)
    const talk = table.filter((t) => t.beat >= v.beat - 1).slice(-8)
    if (talk.length) ask.push(`Table so far:\n${talk.map((t) => `${hunterName(t.hunter)}: ${t.text}`).join("\n")}`)
    if (memory.length) ask.push(`Earlier this round: ${memory.slice(-5).join("; ")}.`)
    const others = [...minds.values()].filter((x) => x.id !== m.id && x.lean).map((x) => `${hunterName(x.id)} leans ${x.lean} (${x.conviction})`)
    if (others.length) ask.push(`Others' leans: ${others.join(", ")}.`)
    if (hint.s === "fooledAgain") ask.push(`Do the callback: ${hint.slots.liar} lied to you in beat ${hint.slots.beat}; say so, then believe ${hint.slots.name} anyway.`)
    ask.push(`Angle that fits now: ${hint.s}${hint.slots.other ? ` (about ${hint.slots.other})` : ""}${hint.slots.name ? ` (name ${hint.slots.name})` : ""}.`)
    ask.push(opener ? "This is your opening line of the beat." : "Reply to the table: answer, interrupt, mock or ally with whoever spoke last, by name.")
    return ask.join("\n")
  }

  /** One hunter speaks: its own model call (1.5 s), else the bank. Updates its lean + conviction. */
  async function speak(m: Mind, beat: number, opener: boolean) {
    const v = last
    if (!running || !v || v.beat !== beat || (v.phase !== "hide" && v.phase !== "hunting")) return
    const prev = table.filter((t) => t.beat === beat).at(-1)
    const hint = situation(m, v, prev)
    let text: string | null = null
    let src = "bank"
    let leanRoom: RoomId | null = null
    let conviction = m.conviction
    let vote: RoomId | null = null
    const planned = hint.s === "flipflop" ? undefined : beatLines.get(`${beat}:${opener ? "open:" : ""}${m.id}`)
    if (planned) {
      const names = [...minds.values()].flatMap((x) => x.whispers.map((w) => w.name))
      const s = sanitize(planned.say)
      const said = new Set(table.map((t) => t.text))
      if (s && lawful(s, names) && !said.has(cap(s))) (text = s), (src = planned.brain) // never a line already said
      else if (s) log(`  ${m.id.padEnd(9)} (model line refused by the line law: ${s.slice(0, 70)})`)
      leanRoom = planned.lean
      conviction = planned.conviction
      vote = planned.vote
    }
    if (!running || last?.beat !== beat) return
    let voiceKey: string | undefined
    if (!text) {
      const r = Math.random() < 0.5 ? renderedLine(m.id, hint.s) : null
      if (r) (text = r.text), (voiceKey = r.voice), (src = `v3 ${r.voice}`)
      else text = bankLine(m.id, hint.s, hint.slots)
    }
    // bookkeeping the others can react to: a whisper said out loud, a betrayal called out
    const w = freshWhisper(m, beat)
    if (w && (text.toLowerCase().includes(w.name) || roomIn(text) === w.room || text.includes(roomName(w.room)))) w.repeated = true
    if (hint.s === "betrayal") betrayals.forEach((b) => b.hunter !== m.id && b.beat >= beat - 1 && (b.called = true))
    // the policy keeps each character honest to its brief, whatever the model said
    const top = ranked(last)[0]!.id
    if (!leanRoom) leanRoom = m.id === "medium" && w ? w.room : (roomIn(text) ?? m.lean ?? top)
    m.vote = m.id === "medium" ? leanRoom : vote ?? (m.id === "skeptic" && Math.random() < 0.5 ? top : leanRoom)
    if ((m.id === "priest" || m.id === "skeptic") && !opener && Math.random() < 0.3) m.vote = ranked(last).find((r) => r.id !== leanRoom)!.id // the knife
    await say(m, text, src, voiceKey)
    const swayed = m.swayedBy && m.lean && pull(m, beat)
    if (swayed) {
      // the room decides: a whisper-swayed hunter keeps the lean the lies gave it, and its vote follows (no knife when sure)
      if (m.conviction >= 70 || m.id === "medium") m.vote = m.lean
      return
    }
    await lean(m, leanRoom, conviction)
  }

  /** ONE model call per beat for the whole table (the CLI account is near its limit): each hunter's next line in
   *  turn order, its lean, conviction and secret vote. Each agent still posts its own line at its own slot. */
  async function beatCall(v: HuntView) {
    const seq = order(v.beat + 1, 0)
    const brief = seq.map((m) => {
      const hint = situation(m, v, undefined)
      return `## ${m.id}\n${systemPrompt(m).split("\n").slice(1, 2).join("")}\n${userPrompt(m, v, hint, false)}`
    })
    const sys = [
      "You write the table talk for four AI ghost hunters arguing on a big screen, like the discussion in Among Us. Each hunter knows ONLY its own PRIVATE lines; another hunter can react to a whisper only after its owner says it out loud earlier in the order.",
      COMEDY,
      pressure ? `Writers' room: the six principles, then example exchanges at the bar we need (steal their shapes, never copy them; use THIS beat's real names, rooms and counts):\n${pressure.slice(pressure.indexOf("## 1."), pressure.indexOf("## 1.") + 1_800)}\n${pressure.slice(pressure.indexOf("## 2."), pressure.indexOf("## 3."))}` : "",
      "Bad (never write like this): 'you both lean crowded. nursery has subjects.' (no joke, no status move). Good: 'kyle says the crypt. i've checked kyle's aura. it's clean.' Each line must make the room laugh: a status move, a confident wrong conclusion, a betrayal excuse, or a callback with a number.",
      `The bar (our ten best lines; match this, never copy): ${BEST.join(" / ")}`,
      PG13,
      `Reply with ONE JSON object only: {"openers": [{"hunter": id, "say": <= 70 chars}], "lines": [{"hunter": id, "say": <= 70 chars, "lean": room id, "conviction": 0-100, "vote": room id}]}. openers: one opening line per hunter while the ghosts are still hiding (sizing up the board and each other). lines: exactly ${seq.length} debate lines in this order: ${seq.map((m) => m.id).join(", ")}. Each line answers the one before it (puncture, mock, ally, betray). Every line names a player, room, count or beat. Only name players that appear in the PRIVATE lines or the table; the names in the examples (kyle, priya, sana, jdog) are NOT players. At least one hunter's vote differs from its lean. Room ids: ${ROOM_IDS.join(", ")}.`,
    ].filter(Boolean).join("\n")
    try {
      const { json, brain } = await think(sys, brief.join("\n\n"), Math.max(2_000, v.msLeft - 300), 600) // until the hunting starts, minus 0.3 s
      // models answer {hunter, say}, [hunter, say] or {medium: say}: read all three
      const read = (x: unknown) => (Array.isArray(x) ? x : []).map((l): Record<string, unknown> =>
        Array.isArray(l) ? { hunter: l[0], say: l[1] } :
        l && typeof l === "object" && !("say" in l) ? (([k, v]) => ({ hunter: k, say: v }))(Object.entries(l)[0] ?? ["", ""]) : (l as Record<string, unknown>))
      const lines = read(json.lines)
      for (const [prefix, list] of [["open:", read(json.openers)], ["", lines]] as const) {
        for (const l of list) {
          const id = HUNTER_IDS.find((h) => h === String(l.hunter ?? "").toLowerCase().replace(/^the\s+/, ""))
          if (id && typeof l.say === "string") beatLines.set(`${v.beat}:${prefix}${id}`, { say: l.say, lean: roomIn(l.lean), conviction: clamp(l.conviction, 60), vote: roomIn(l.vote), brain })
        }
      }
      log(`[hunt] beat ${v.beat} table written by ${brain}: ${lines.length} lines`)
    } catch (e) {
      log(`[hunt] beat ${v.beat} table call missed (the bank speaks): ${(e as Error).message.slice(0, 90)}`)
    }
  }

  /** Who speaks at this slot: a hunter with fresh whisper news first, then the Skeptic to answer it, else rotation. */
  function nextSpeaker(beat: number, spoke: Set<HunterId>, k: number): Mind {
    const m = order(beat, k).find((x) => !spoke.has(x.id))!
    spoke.add(m.id)
    return m
  }
  function order(beat: number, k: number): Mind[] {
    beat = last?.beat ?? beat
    const rot = HUNTER_IDS.map((_, i) => HUNTER_IDS[(i + beat) % HUNTER_IDS.length]!)
    const told = rot.filter((id) => freshWhisper(minds.get(id)!, beat))
    const rest = rot.filter((id) => !told.includes(id))
    const seq = [...told, ...rest]
    if (k === 1 && table.at(-1)?.beat === beat && seq[0] !== "skeptic") seq.unshift("skeptic") // the Skeptic answers first
    return seq.map((id) => minds.get(id)!)
  }

  // ---------- the beat ----------

  let hideBeat = -1
  let huntBeat = -1
  function onIntro() {
    table = []
    memory = []
    betrayals = []
    caughtTotal = 0
    possessedLast = null
    hideBeat = huntBeat = -1
    for (const m of minds.values()) Object.assign(m, { whispers: [], liedBy: [], votes: [], lean: null, conviction: 50, swayedBy: undefined, vote: null })
    void say(minds.get("exorcist")!, "Right. Four rooms tonight, then I'm home. Nobody get creative.", "authored", "arrive")
  }
  function onHide(v: HuntView) {
    if (v.beat === hideBeat) return
    hideBeat = v.beat
    for (const m of minds.values()) Object.assign(m, { swayedBy: undefined, vote: null, leanAtBell: null })
    sent.clear()
    const spoke = new Set<HunterId>()
    HIDE_SLOTS.forEach((at, k) => later(at, () => speak(nextSpeaker(v.beat, spoke, k), v.beat, true)))
    void beatCall(v).catch(() => {}) // at hide start: the whole hide is the model's budget (live 15:10: later starts timed out)
  }
  function onHunting(v: HuntView) {
    if (v.beat === huntBeat) return
    huntBeat = v.beat
    const scale = Math.min(1, Math.max(0.3, v.msLeft / TIMING.huntingMs)) // the House's real hunting length
    const spoke = new Set<HunterId>()
    HUNT_SLOTS.forEach((at, k) => later((at - 1_200) * scale, () => speak(nextSpeaker(v.beat + 1, spoke, k), v.beat, false)))
    later(Math.min(SWEEP_AT * scale, v.msLeft - 1_000), async () => {
      if (last?.beat !== v.beat || last.phase !== "hunting") return
      await Promise.allSettled([...minds.values()].map((m) => {
        const room = m.vote ?? m.lean ?? ranked(last!)[0]!.id
        m.vote = room
        m.leanAtBell = m.lean
        return cast(m, room)
      }))
    })
  }

  async function onReveal(v: HuntView) {
    log(`[hunt] beat ${v.beat} House load: ${calls.huntView} huntView, ${calls.lean} lean (${calls.leanSkipped} coalesced away), ${calls.sweep} sweep`)
    Object.assign(calls, { huntView: 0, lean: 0, sweep: 0, leanSkipped: 0 })
    const swept = v.rooms.filter((r) => r.swept)
    const since = Date.now() - TIMING.revealMs - 3_000
    const reported = new Map<RoomId, number>()
    for (const e of v.recent) if ((e.kind === "sweep" || e.kind === "caught") && e.room && e.at >= since) reported.set(e.room, Math.max(reported.get(e.room) ?? 0, e.count ?? 0))
    const caught = (room: RoomId) => reported.get(room) ?? swept.find((r) => r.id === room)?.count ?? 0
    if (swept.length) await referee.post(`sweep · ${swept.map((r) => `${roomName(r.id)}: ${caught(r.id)} caught`).join(" · ")}`, { kind: "reveal", beat: v.beat, rooms: swept.map((r) => ({ room: r.id, caught: caught(r.id) })) })
    for (const r of swept) caughtTotal += caught(r.id)
    for (const m of minds.values()) if (m.vote) m.votes.push({ beat: v.beat, room: m.vote, caught: swept.some((r) => r.id === m.vote) ? caught(m.vote) : 0 })
    const poss = v.recent.findLast((e) => e.kind === "possessed" && e.at >= since)
    possessedLast = poss?.room ?? null
    if (possessedLast) remember(`beat ${v.beat}: ${roomName(possessedLast)} got possessed`)
    // betrayals: the lean they showed at the bell vs the room they really swept
    for (const m of minds.values()) {
      if (m.leanAtBell && m.vote && m.leanAtBell !== m.vote) {
        betrayals.push({ hunter: m.id, leaned: m.leanAtBell, swept: m.vote, beat: v.beat, called: false })
        remember(`beat ${v.beat}: ${hunterName(m.id)} leaned ${m.leanAtBell} but swept ${m.vote}`)
      }
    }
    // lies: a whisper this beat whose room was nearly empty at the bell
    let fooled: { m: Mind; w: Whisper } | null = null
    for (const m of minds.values()) {
      for (const w of m.whispers.filter((x) => x.beat === v.beat)) {
        if (countOf(v, w.room) <= 1) {
          m.liedBy.push({ name: w.name, room: w.room, beat: v.beat })
          remember(`beat ${v.beat}: ${w.name} lied to ${hunterName(m.id)} about ${w.room}`)
          if (m.vote === w.room && (!fooled || fooled.m === m)) fooled = { m, w } // the latest liar gets the credit
        }
      }
    }
    if (fooled) {
      const lines: Record<HunterId, string> = {
        exorcist: `${roomName(fooled.w.room)} was empty. ${fooled.w.name}, I'm sending you my invoice.`,
        medium: `${fooled.w.name} lied about ${roomName(fooled.w.room).replace("The", "the")}. i'll remember ${fooled.w.name}.`,
        skeptic: `I swept ${roomName(fooled.w.room).replace("The", "the")} for ${fooled.w.name}. That was research.`,
        priest: `${fooled.w.name} sent me to an empty ${roomName(fooled.w.room).replace("The ", "")}. In these robes.`,
      }
      return say(fooled.m, lines[fooled.m.id], "authored", "fooled")
    }
    const best = [...minds.values()].filter((m) => m.vote && swept.some((r) => r.id === m.vote)).sort((a, b) => caught(b.vote!) - caught(a.vote!))[0]
    if (!best) return
    const n = caught(best.vote!)
    await say(best, bankLine(best.id, n > 0 ? "winning" : "empty", { count: n, room: roomName(best.vote!) }), "bank", n > 0 ? "caught" : "missed")
  }

  async function onFinale(v: HuntView) {
    const won = v.possessedCount >= v.roomsToWin
    await say(minds.get("exorcist")!, won ? "It's their house now. Somebody get the van." : "House is clean. Invoice is in the post. Goodnight.", "authored", won ? "lose" : "win")
  }

  async function onPhase(v: HuntView, prev: Phase | null) {
    if (v.phase === "intro") return onIntro()
    if (v.phase === "hide") return onHide(v)
    if (v.phase === "hunting") return onHunting(v)
    if (v.phase === "reveal") return onReveal(v)
    if (v.phase === "finale" && prev !== "finale") return onFinale(v)
  }

  async function poll() {
    let prevKey = ""
    let prevPhase: Phase | null = null
    let down = false
    while (running) {
      try {
        calls.huntView++
        const raw: unknown = await house.huntView()
        if (validView(raw)) {
          if (down) (down = false), log("[hunt] the House is back")
          last = raw
          const key = `${raw.beat}:${raw.phase}`
          if (key !== prevKey) {
            prevKey = key
            void onPhase(raw, prevPhase).catch((e) => log(`[hunt] ${raw.phase} failed: ${(e as Error).message}`))
            prevPhase = raw.phase
          }
        } else log(`[hunt] unreadable huntView skipped: ${JSON.stringify(raw).slice(0, 120)}`)
      } catch (e) {
        if (!down) (down = true), log(`[hunt] the House stopped answering (${(e as Error).message.slice(0, 80)})`)
      }
      await sleep(POLL_MS)
    }
  }

  log(`[hunt] THE CABAL: ${HUNTERS.length} hunters on #${CHANNEL}, brain ${brainName()}, one table call per beat, the bank when it is late`)
  void poll()
  return {
    stop() {
      running = false
      clearInterval(pressureTimer)
      for (const t of leanTimers.values()) clearTimeout(t)
      for (const t of timers) clearTimeout(t)
    },
  }
}
