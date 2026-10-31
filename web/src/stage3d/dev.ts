// Fake House for building the 3D stage before (or without) the actors: /stage3d?fake=<loop|hide|hunting|reveal|finale>.
// Plays THE LOOP (hide -> hunting -> reveal) with ~320 ghosts at 10 Hz through the same SnapSource seam as the
// real House socket. Hold scenarios restart their one phase forever (reveal replays the kill cam every 4 s).
import {
  GHOST_COLORS,
  HUNTERS,
  ROOMS,
  TIMING,
  possessThreshold,
  roomCapacity,
  type GhostTuple,
  type HouseEvent,
  type Phase,
  type RoomId,
  type StageSnap,
} from "../../../contract/protocol"
import type { SnapSource } from "../stage/source"

const IDS = ROOMS.map((r) => r.id) as RoomId[]
const NAMES = ["Wraith", "Shade", "Banshee", "Specter", "Phantom", "Wisp", "Revenant", "Poltergeist"]
const DUR: Partial<Record<Phase, number>> = { hide: TIMING.hideMs, hunting: TIMING.huntingMs, reveal: TIMING.revealMs, finale: TIMING.finaleMs }
const NEXT: Partial<Record<Phase, Phase>> = { hide: "hunting", hunting: "reveal", reveal: "hide" }
// a skewed crowd: the Ballroom and the Library are packed, the Attic nearly empty
const WEIGHT: Record<RoomId, number> = { attic: 0.6, nursery: 1, library: 1.6, ballroom: 2.2, chapel: 1.1, crypt: 1.3 }

function weightedRoom(): RoomId {
  const total = IDS.reduce((a, r) => a + WEIGHT[r], 0)
  let x = Math.random() * total
  for (const r of IDS) if ((x -= WEIGHT[r]) <= 0) return r
  return "crypt"
}

export function fakeSource3d(scenario: string): SnapSource {
  return {
    start(h) {
      const hold = scenario !== "loop"
      let phase: Phase = scenario === "loop" ? "hide" : (scenario as Phase)
      let endsAt = Date.now() + (DUR[phase] ?? 6000)
      let beat = 3
      const ghosts: { id: string; c: number; room: RoomId; caught: boolean; score: number; streak: number }[] = []
      const n = Number(new URLSearchParams(location.search).get("n") ?? 320)
      for (let i = 0; i < n; i++)
        ghosts.push({ id: `g${i}`, c: i % GHOST_COLORS.length, room: weightedRoom(), caught: false, score: Math.floor(Math.random() * 900), streak: Math.floor(Math.random() * 4) })
      for (const g of ghosts) {
        const cap0 = roomCapacity(ghosts.length)
        while (ghosts.filter((x) => x !== g && x.room === g.room).length >= cap0) g.room = IDS[(IDS.indexOf(g.room) + 1) % IDS.length]
      }
      const possessed = new Set<RoomId>(["crypt"])
      if (scenario === "finale") ["crypt", "ballroom", "library"].forEach((r) => possessed.add(r as RoomId))
      let swept: RoomId[] = []
      let votes: (RoomId | null)[] = HUNTERS.map(() => null)
      const events: HouseEvent[] = []
      const counters = { online: n, humans: Math.round(n * 0.67), bots: n - Math.round(n * 0.67), joinedToday: 1184, sweeps: 41, caught: 263, whispers: 57, possessions: 9, rounds: 2 }
      const ev = (e: Omit<HouseEvent, "at">) => {
        events.push({ ...e, at: Date.now() })
        if (events.length > 20) events.shift()
      }

      const enter = (p: Phase) => {
        phase = p
        endsAt = Date.now() + (DUR[p] ?? 6000)
        if (p === "hide") {
          beat = (beat % 8) + 1
          swept = []
          votes = HUNTERS.map(() => null)
          for (const g of ghosts) g.caught = false
        }
        if (p === "hunting" || p === "reveal") {
          const byCount = IDS.map((r) => [r, ghosts.filter((g) => g.room === r).length] as const).sort((a, b) => b[1] - a[1])
          votes = HUNTERS.map((_, i) => byCount[i % 3][0])
        }
        if (p === "reveal") {
          swept = [votes[0]!, votes[1] === votes[0] ? votes[2]! : votes[1]!]
          const thr = possessThreshold(ghosts.length)
          for (const r of IDS) {
            const inRoom = ghosts.filter((g) => g.room === r)
            if (swept.includes(r)) {
              inRoom.forEach((g) => (g.caught = true))
              ev({ kind: "caught", room: r, count: inRoom.length })
              possessed.delete(r)
            } else if (inRoom.length >= thr && !possessed.has(r)) {
              possessed.add(r)
              ev({ kind: "possessed", room: r, count: inRoom.length })
            }
          }
        }
        ev({ kind: "phase", text: p })
      }
      enter(phase)

      window.setInterval(() => {
        const now = Date.now()
        if (now >= endsAt) enter(hold ? phase : NEXT[phase] ?? "hide")
        // musical chairs: a hide into a full room is refused (the ghost keeps its seat)
        const cap = roomCapacity(ghosts.length)
        if (phase === "hide")
          for (const g of ghosts)
            if (Math.random() < 0.012) {
              const want = weightedRoom()
              if (ghosts.filter((x) => x.room === want).length < cap) g.room = want
            }
        const tuples: GhostTuple[] = ghosts.map((g, i) => [g.id, g.c, g.room, (g.caught ? 1 : 0) | (i % 3 === 2 ? 2 : 0)])
        const top = [...ghosts]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((g): [string, string, number, number, number] => [g.id, `${NAMES[Number(g.id.slice(1)) % NAMES.length]} #${100 + Number(g.id.slice(1))}`, g.c, g.score, g.streak])
        const s: StageSnap = {
          phase,
          mode: "show",
          endsAt,
          now,
          round: 3,
          beat: phase === "finale" ? 0 : beat,
          ghosts: tuples,
          rooms: IDS.map((id) => ({ id, cap, count: ghosts.filter((g) => g.room === id && !g.caught).length, possessed: possessed.has(id), swept: swept.includes(id) })),
          hunters: HUNTERS.map((x, i) => ({ id: x.id, vote: phase === "hide" ? null : votes[i], lean: phase === "hide" ? IDS[(i * 2 + Math.floor(now / 2300)) % IDS.length] : null })),
          sweptRooms: swept,
          counters,
          events: [...events],
          winner: phase === "finale" ? "ghosts" : null,
          top,
          restoredAt: null,
        }
        h.snap(s)
      }, 100)
      h.status(true, "fake")
    },
  }
}
