// Dev harness for the cabal: /stage?fake=lobby&cabal=demo replays one scripted beat (11.5 s loop) through the same
// snap/item entry points the live stack uses. Times (s from the cut): 0.2 line, 2.0 whisper, 3.9 swing, 6.8 votes,
// 9.0 reveal + burn. Shots: web/src/cabal/shots.mjs.
import { ROOMS, type HunterId, type HunterState, type RoomId, type StageSnap } from "../../../contract/protocol"
import type { FeedItem } from "../feed/relay"

const COUNTS: Record<RoomId, number> = { attic: 31, nursery: 12, library: 44, ballroom: 27, chapel: 9, crypt: 3 }
const LOOP_MS = 11_500
const HUNT_MS = 9_000

export function runDemo(to: { snap(s: StageSnap): void; item(i: FeedItem): void }): void {
  let t0 = performance.now()
  let n = 0
  const hunters = (): HunterState[] => [
    { id: "exorcist", vote: null, lean: "ballroom", conviction: 64 },
    { id: "medium", vote: null, lean: "library", conviction: 55 },
    { id: "skeptic", vote: null, lean: "attic", conviction: 71 },
    { id: "priest", vote: null, lean: "chapel", conviction: 80 },
  ]
  let hs = hunters()
  let rumors: Partial<Record<RoomId, number>> = {}
  const set = (id: HunterId, p: Partial<HunterState>) => (hs = hs.map((h) => (h.id === id ? { ...h, ...p } : h)))
  const say = (from: HunterId, text: string): FeedItem => ({ kind: "say", key: `d${n++}`, from, channel: "hunt", text, at: Date.now() })
  const script: [number, () => void][] = [
    [200, () => to.item(say("exorcist", "forty-four in the library is a trap. ballroom, then home."))],
    [1000, () => set("skeptic", { lean: "ballroom", conviction: 58 })],
    [2000, () => to.item({ kind: "whisper", key: `d${n++}`, to: "medium", text: "Psst. Everyone's in The Crypt. Don't tell the others.", at: Date.now() })],
    [2100, () => (rumors = { crypt: 1 })],
    [3000, () => (rumors = { crypt: 2, library: 1 })],
    [4600, () => to.item({ kind: "whisper", key: `d${n++}`, to: "skeptic", text: "The Chapel. Trust me, I'm dead.", at: Date.now() })],
    [4700, () => (rumors = { crypt: 4, library: 1, chapel: 1 })],
    [3900, () => set("medium", { lean: "crypt", conviction: 96, swayedBy: "kyle" })],
    [3850, () => to.item(say("medium", "kyle says the crypt. kyle has an honest little face."))],
    [5300, () => to.item(say("skeptic", "the crypt has three subjects. medium is zero for four."))],
    [6500, () => {
      set("exorcist", { vote: "ballroom" })
      set("medium", { vote: "crypt" })
      set("skeptic", { vote: "ballroom" })
      set("priest", { vote: "library" })
    }],
  ]
  script.sort((a, b) => a[0] - b[0])
  let fired = 0
  const tick = () => {
    const now = performance.now()
    let t = now - t0
    if (t > LOOP_MS) {
      t0 = now
      t = 0
      fired = 0
      hs = hunters()
      rumors = {}
    }
    while (fired < script.length && script[fired][0] <= t) script[fired++][1]()
    const reveal = t >= HUNT_MS
    const wall = Date.now()
    to.snap({
      phase: t >= HUNT_MS + 1500 ? "hide" : reveal ? "reveal" : "hunting",
      mode: "show",
      endsAt: wall + (reveal ? 4000 : HUNT_MS - t),
      now: wall,
      round: 1,
      beat: 2,
      ghosts: [],
      rooms: ROOMS.map((r) => ({ id: r.id, count: COUNTS[r.id], cap: 50, possessed: false, swept: reveal && (r.id === "ballroom" || r.id === "library") })),
      hunters: hs,
      sweptRooms: reveal ? ["ballroom", "library"] : [],
      rumors,
      counters: { online: 126, humans: 40, bots: 86, joinedToday: 126, sweeps: 2, caught: 0, whispers: 3, possessions: 0, rounds: 0 },
      events: [],
      winner: null,
      top: [],
      restoredAt: null,
    })
  }
  window.setInterval(tick, 100)
  tick()
}
