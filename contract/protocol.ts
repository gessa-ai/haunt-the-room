// HAUNT THE ROOM wire contract. Single source of truth for actors/, coven/, server/, web/, bots/, art/, audio/.
// Lanes import from here; nobody redefines these shapes.

// ---------- The house ----------

/** Cross-section layout on the stage: 2 columns x 3 floors, top to bottom. */
export const ROOMS = [
  { id: "attic", name: "The Attic" },
  { id: "nursery", name: "The Nursery" },
  { id: "library", name: "The Library" },
  { id: "ballroom", name: "The Ballroom" },
  { id: "chapel", name: "The Chapel" },
  { id: "crypt", name: "The Crypt" },
] as const
export type RoomId = (typeof ROOMS)[number]["id"]
/** Signature colour + glyph per room, identical on phone buttons and projector (instant recognition, Kahoot-style). */
export const ROOM_STYLE: Record<RoomId, { color: string; glyph: "triangle" | "diamond" | "circle" | "square" | "star" | "moon" }> = {
  attic: { color: "#e2364f", glyph: "triangle" },
  nursery: { color: "#2f7de1", glyph: "diamond" },
  library: { color: "#e0a400", glyph: "circle" },
  ballroom: { color: "#2fa84f", glyph: "square" },
  chapel: { color: "#9b4dff", glyph: "star" },
  crypt: { color: "#1fb5b5", glyph: "moon" },
}
export const ROOM_GRID: RoomId[][] = [["attic", "nursery"], ["library", "ballroom"], ["chapel", "crypt"]]

export const HUNTERS = [
  { id: "exorcist", name: "The Exorcist", color: "#ffd27a", persona: "thirty years in the trade, tired, unhurried, wants to be home by eleven; gives orders by name; treats ghosts like a plumbing problem; never raises his voice" },
  { id: "medium", name: "The Medium", color: "#b18cff", persona: "theatrical and sincere, narrates her own feelings, calls ghosts darling, believes every whisper and is crushed when lied to, then believes the next one" },
  { id: "skeptic", name: "The Skeptic", color: "#7ad7ff", persona: "deadpan, petty, keeps a running tally of everyone's mistakes (mostly the Medium's), refuses to say the word ghost, says 'subjects' instead" },
  { id: "priest", name: "The Priest", color: "#ff8a7a", persona: "vain and operatic, mentions his robes, his voice or his good side, takes credit for every catch, blames the Medium for every miss" },
] as const
export type HunterId = (typeof HUNTERS)[number]["id"]

/** Whispers are LURES: a ghost picks a room and a hunter is told the dead are there. No free text, ever.
 *  A lure "works" when the lured hunter sweeps that room soon after and catches almost nobody. */
export const LURE_TEMPLATES = [
  "Psst. Everyone's in {room}. Don't tell the others.",
  "{room}. Trust me, I'm dead.",
  "I'd never hide in {room}. Too obvious. Anyway, bye.",
] as const
export const lureText = (room: RoomId, n: number): string =>
  LURE_TEMPLATES[n % LURE_TEMPLATES.length].replace("{room}", ROOMS.find((r) => r.id === room)!.name)

/** THE LOOP (Kahoot cadence, decided 12:58): a round is BEATS_PER_ROUND beats. Each beat:
 *   HIDE    (hideMs):    every ghost taps one of the six rooms (can change until the bell). One lure allowed.
 *   HUNTING (huntingMs): phones lock; the four AI hunters argue over Agent Relay and each votes ONE room
 *                        (typed action "sweep" {room}); the referee sweeps the TWO most-voted rooms.
 *   REVEAL  (revealMs):  flashlights snap onto the two rooms. Ghosts there are CAUGHT (out for the next beat).
 *                        Everyone else is SAFE and scores. A room holding >= possessThreshold safe ghosts becomes
 *                        POSSESSED (it stays possessed until a later sweep cleanses it).
 *  Ghosts win the round if >= ROOMS_TO_WIN rooms are possessed after the last beat. The crowd's dilemma:
 *  crowd up to possess rooms, or spread out to stay safe, and outguess the AI that is reading the same counts. */
export const BEATS_PER_ROUND = 8 // auto mode (afternoon practice)
/** Show mode (the 2-minute finalist demo): intro 16 s + 5 beats ~= 87 s, leaving room for the opening line, the kill -9 and the close. */
export const SHOW_BEATS = 4
export const beatsFor = (mode: "show" | "auto"): number => (mode === "show" ? SHOW_BEATS : BEATS_PER_ROUND)
export const SWEEPS_PER_BEAT = 2
export const SCORE = {
  safe: 100, // surviving a beat, scaled by minority: points = round(safe * (1 - shareOfOnlineGhostsInYourRoom) )
  minSafe: 20,
  possessRoom: 150, // you were in a room when it became possessed
  lieWorked: 200, // you lured a hunter to a room that ended up swept and nearly empty (<= 1 ghost); first liar only
  streakStep: 0.25, // each consecutive safe beat multiplies safe points by +0.25 (cap streakMax)
  streakMax: 2,
} as const
export const safePoints = (shareInRoom: number, streak: number): number =>
  Math.round(Math.max(SCORE.minSafe, SCORE.safe * (1 - shareInRoom)) * Math.min(SCORE.streakMax, 1 + SCORE.streakStep * streak))

export const TIMING = {
  lobbyMs: 20_000, // auto mode only (afternoon practice rounds)
  introMs: 16_000, // cinematic: 'Welcome, YC, to the Haunted House' (4 s) + the 3 INTRO_CARDS (4 s each), synced on stage and phones
  firstHideMs: 9_000, // beat 1 is longer: people are still learning
  hideMs: 6_000,
  huntingMs: 9_000, // THE CABAL: full-screen debate at the table (owner 14:15: AI interactions are the show) // hunters must vote by the end; missing votes fall back to the most crowded rooms
  revealMs: 4_000,
  finaleMs: 15_000,
  stageHz: 10,
  persistEveryMs: 1_000,
  waveCooldownMs: 10_000, // "that's me": a wave lights your ghost and name on the stage
} as const
export const ROUND_MS = TIMING.introMs + (TIMING.firstHideMs - TIMING.hideMs) + BEATS_PER_ROUND * (TIMING.hideMs + TIMING.huntingMs + TIMING.revealMs) // ~2:11
/** The whole tutorial. Shown during intro on the projector AND on every phone, in this order. No other instructions exist. */
export const WELCOME = { kicker: "Welcome, YC.", title: "You're all dead. Make yourselves at home." } as const
export const INTRO_CARDS = [
  { title: "Find a seat.", body: "Rooms only hold so many. No seat when the bell rings, and they find you." },
  { title: "Four AIs come looking.", body: "They search two rooms. Be in neither." },
  { title: "Move in.", body: "Pack a room they skip and it's haunted. Haunt two, keep the house." },
] as const
/** MUSICAL CHAIRS (decided 13:25): every room has limited seats. A hide into a full room is refused. Anyone without a
 *  seat when the bell rings is caught (sits out next beat). Seats are drawn on the stage and phones, not just numbers. */
export const roomCapacity = (ghostsOnline: number) => Math.max(3, Math.ceil(ghostsOnline / 4))
/** Safe ghosts needed in a room at reveal for it to become possessed: the room is (nearly) full. */
export const possessThreshold = (ghostsOnline: number) => Math.ceil(roomCapacity(ghostsOnline) * 0.5) // tuned 14:02: 0.75 gave zero possessions in rehearsal
/** Ghosts win the round if at least this many rooms are possessed after the last beat. */
export const ROOMS_TO_WIN = 2 // tuned 14:02 so the red finale fires in a 5-beat show round

export type Phase = "lobby" | "intro" | "hide" | "hunting" | "reveal" | "finale"
export type Mode = "show" | "auto" // show: the presenter starts rounds; auto: lobby -> round -> finale loops

// ---------- Ghost actor (one per phone; id = playerId, a uuid kept in the phone's localStorage) ----------

export interface GhostRecord {
  id: string
  name: string // generated, e.g. "Aunt Mabel"; never user text
  color: string // hex from the palette below
  createdAt: number
  ecto: number // lifetime score
  banished: number
  whispers: number
  rounds: number
  lastSeen: number
}
export interface GhostRpc {
  /** Create on first call (name + colour generated deterministically from the id), return the record. */
  ensure(input: { id: string; bot?: boolean }): Promise<GhostRecord>
  get(): Promise<GhostRecord>
  add(input: { ecto?: number; banished?: number; whispers?: number; rounds?: number }): Promise<void>
  rename(input: { name: string }): Promise<GhostRecord> // name already sanitized by the server
}
/** Player names: a generated name is always ready (no tap required); players MAY overwrite it on the lobby screen.
 *  Server sanitizes: letters, digits, spaces, . ' - only; trimmed; 1..NAME_MAX chars; a small blocklist; else keep the old name. */
/** ghostId is a bearer secret (it rejoins as that ghost): it never leaves the House except to its own phone and the
 *  local stage. Everything other people see (seated faces, avatars, podium on phones) uses publicId = the first 10 hex
 *  chars of sha256("haunt:" + ghostId), computed server-side. Avatars are seeded by publicId everywhere. */
export const PUBLIC_ID_PREFIX = "haunt:"
export const NAME_MAX = 16 // names are always lowercase (generated and typed), e.g. "aunt thistle"
export const GHOST_COLORS = ["#7af0ff", "#b18cff", "#ff7ad9", "#7aff9e", "#ffe27a", "#ff9f7a", "#8fa8ff", "#e8e8ff"] as const

// ---------- House actor (id "main") ----------

export interface HunterState {
  id: HunterId
  vote: RoomId | null // this beat's vote (shown at reveal; hidden during hide)
  lean: RoomId | null // POKER: the room this hunter is openly leaning toward right now (shown live during hide on stage
  //                     and phones; hunters may bluff: the real vote is secret until reveal). Set via typed action "lean".
  conviction?: number // 0-100: how sure this hunter is of its lean (the CABAL meter on stage). Set with "lean" {room, conviction}.
  swayedBy?: string // public name of the ghost whose whisper last changed this hunter's mind (dramatic irony: the room knows it was a lie)
}
export interface RoomState {
  id: RoomId
  count: number // ghosts currently seated there (live during hide)
  cap: number // seats in this room right now (roomCapacity(online))
  seated?: [string, number, number][] // up to 4 seated ghosts [publicId, colorIndex, streak] (NEVER ghostId) (phones show faces; streak >= 3 = on fire); count - 4 = "+n"
  possessed: boolean
  swept: boolean // swept in the current reveal
}
/** One entry per online ghost: [ghostId, colorIndex, room, flags]. flags bit0 = caught (out this beat), bit1 = bot. */
export type GhostTuple = [string, number, RoomId, number]
export interface HouseEvent {
  at: number
  kind: "join" | "vote" | "sweep" | "caught" | "possessed" | "cleansed" | "lie" | "taunt" | "phase" | "revived" | "wave" | "lead" | "onfire" // lead: a new #1; onfire: a ghost reached streak 3
  room?: RoomId
  hunter?: HunterId
  count?: number
  text?: string
  ghostId?: string
  name?: string // generated ghost name, never user text
}
export interface StageSnap {
  phase: Phase
  mode: Mode
  endsAt: number // phase deadline (absolute ms): the clock keeps counting through a kill -9
  now: number
  round: number
  beat: number // 1..BEATS_PER_ROUND (0 outside a round)
  ghosts: GhostTuple[]
  rooms: RoomState[]
  hunters: HunterState[]
  sweptRooms: RoomId[] // this beat's two swept rooms (set at reveal)
  counters: { online: number; humans: number; bots: number; joinedToday: number; sweeps: number; caught: number; whispers: number; possessions: number; rounds: number }
  events: HouseEvent[] // the last ~20, newest last
  winner: "ghosts" | "hunters" | null
  top: [string, string, number, number, number][] // [ghostId, name, colorIndex, roundScore, streak], top 10 (streak >= 3 = ON FIRE)
  restoredAt: number | null
  last?: [string, string, number, number, number] // whoever is in last place this round (same shape as a top entry)
  lastRecoveryMs?: number // measured downtime of the last executor restart (the on-stage kill)
  rumors?: Partial<Record<RoomId, number>> // ROOM HEAT (owner 15:05): lies told this beat that name each room; reset each hide. Lies stay secret, the heat is public.
}

// Socket metadata (set by the server's grant; never trusted from the client)
export interface HouseSocketMeta {
  role: "ghost" | "stage" | "bot"
  ghostId: string // "" for stage
  colorIndex: number
}

export type PhoneToHouse =
  | { t: "hide"; room: RoomId } // during hide only; last one before the bell counts
  | { t: "wave" }
  | { t: "ping" } // answered by autoResponse without waking the actor

export type HouseToPhone =
  | { t: "you"; publicId: string; room: RoomId | null; score: number; caught: boolean; name: string; colorIndex: number; rank: number; of: number; streak: number; passed?: string } // passed: name of the ghost you just overtook
  | { t: "phase"; phase: Phase; endsAt: number; beat: number; round: number; winner: "ghosts" | "hunters" | null }
  | { t: "rooms"; rooms: RoomState[]; leans?: [HunterId, RoomId][] } // live counts + hunters' open leanings during hide (2 Hz)
  | { t: "say"; hunter: HunterId; text: string } // hunter chatter ticker
  | { t: "result"; kind: "safe" | "caught" | "possessed" | "lie"; points: number; streak: number; text: string; hunter?: HunterId } // at reveal: the Kahoot moment
  | { t: "pong" }

export type HouseToStage = { t: "snap"; s: StageSnap }

/** House RPC. */
export interface HouseRpc {
  setPhase(input: { phase: "lobby" | "intro" | "finale"; mode?: Mode }): Promise<void> // presenter: intro starts a round
  reset(): Promise<void>
  /** Referee: a hunter's vote for this beat (only during hide/hunting; last vote wins). */
  sweep(input: { hunter: HunterId; room: RoomId }): Promise<{ ok: boolean; reason?: string }>
  taunt(input: { hunter: HunterId; text: string }): Promise<void>
  lean(input: { hunter: HunterId; room: RoomId; conviction?: number; swayedBy?: string }): Promise<{ ok: boolean; reason?: string }> // hide + hunting; last lean wins
  huntView(): Promise<HuntView>
  recordWhisper(input: { ghostId: string; hunter: HunterId; room: RoomId }): Promise<{ ok: boolean; reason?: string }> // one per ghost per beat; allowed in HIDE and HUNTING (owner 15:05: lie during the debate, Among Us meeting)
  rename(input: { ghostId: string; name: string }): Promise<void> // updates the live name (podium, events)
  stats(): Promise<StageSnap["counters"]>
}
export interface HuntView {
  phase: Phase
  beat: number
  msLeft: number
  rooms: RoomState[] // live counts: the hunters see where the crowd is hiding, and so can be fooled
  votes: HunterState[]
  possessedCount: number
  roomsToWin: number
  recent: HouseEvent[]
}

export interface JoinResponse { ghost: GhostRecord; ghostToken: string; websocketUrl: string; connectByMs: number }

// ---------- Server HTTP API (public origin; phones only ever talk to this origin) ----------
// POST /api/join            { ghostId, name? }       -> JoinResponse (no rate limits on joins: the venue is one IP)
// POST /api/name            { ghostId, ghostToken, name } -> { ghost } (sanitized; bad names keep the old one)
// POST /api/whisper         { ghostId, ghostToken, room, hunter? } -> { ok, hunter } (hunter = the player's pick; server picks if absent; the DM text is "@<hunter> <liar name>: <lure>", metadata {kind:"lure", room, by, bot}) (one per ghost per beat, during hide; DM lureText(room) from "the-dead")
// POST /api/stage/grant     (localhost only)         -> { websocketUrl, connectByMs }
// POST /api/presenter/:cmd  (localhost only; cmd = lobby | start (intro) | finale | reset | auto | show | bots-on | bots-off)
// GET  /api/relay/observer  (localhost only)         -> { wsUrl } (observer feed incl. DMs)
// GET  /api/stats                                    -> StageSnap["counters"]
// GET  /p                    the phone app (the QR points here); /stage the projector; /feed the feed alone

// ---------- Agent Relay conventions ----------
// One workspace (local engine :8787 for the demo). Channel "#hunt". Agents: "exorcist", "medium", "skeptic",
// "priest" (hunters), "referee" (registers the typed actions and applies them to the House), "the-dead" (the
// server posts crowd whispers as DMs from this agent). Typed actions: "sweep" {room} = this beat's vote,
// "taunt" {text <= 80 chars}, "lean" {room} (an open, possibly bluffing hint during hide). Every typed action input also carries `hunter` (Relay reports every caller as "node"). Each beat the hunters ARGUE in #hunt during hide (they see live counts), DM side deals
// (shown PRIVATE on stage), and each must vote before hunting ends; the two most-voted rooms are swept.

// ---------- Cues (stage audio + animation hooks; audio lane maps each to files) ----------
export const CUES = [
  "ambient", "rain", "join", "round-start", "hide", "tick", "bell", "hunting", "reveal", "sweep", "caught", "safe",
  "possessed", "crash", "cleansed", "whisper", "static", "revive", "finale-ghosts", "finale-hunters",
  "intro", "card", "tap", "lead", "onfire", "ticker", "tension", "shutter", "story", "seat", "full",
] as const
export type Cue = (typeof CUES)[number]
export const VOICE_EVENTS = ["arrive", "sweep", "caught", "missed", "fooled", "possessed", "back", "win", "lose", "taunt"] as const
export type VoiceEvent = (typeof VOICE_EVENTS)[number]
// Voice files: web/public/audio/voice/<hunterId>/<event>-<n>.mp3 (n = 1..4). Index: web/public/audio/voice/index.json
// Art files: web/public/art/{sky.webp, room-<roomId>.webp, hunter-<hunterId>.png, title.webp, wisp.png}
