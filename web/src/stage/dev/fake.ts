// Local fake House for building and screenshotting the stage before the actors are up: /stage?fake=<scenario>.
// Scenarios: loop (default), lobby, hide, hunting, reveal, outage, finale, finale-hunters.
// Plays THE LOOP (contract: intro, then beats of hide -> hunting -> reveal) and emits StageSnap at 10 Hz
// through the same SnapSource seam as the real House socket.
import {
  BEATS_PER_ROUND,
  GHOST_COLORS,
  HUNTERS,
  ROOMS,
  ROOMS_TO_WIN,
  TIMING,
  possessThreshold,
  roomCapacity,
  type GhostTuple,
  type HouseEvent,
  type HunterState,
  type Phase,
  type RoomId,
  type RoomState,
  type StageSnap,
} from "../../../../contract/protocol"
import type { SnapSource } from "../source"

interface FakeGhost {
  id: string
  color: number
  room: RoomId
  bot: boolean
  caught: boolean
  score: number
  streak: number
}

const ROOM_IDS = ROOMS.map((r) => r.id) as RoomId[]
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]
const NAMES = ["Wraith", "Shade", "Banshee", "Specter", "Phantom", "Wisp", "Poltergeist", "Revenant"]
function fakeName(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `${["aunt mabel", "uncle otto", "cousin ida", "grandpa lou", "miss hazel", "old tom"][h % 6]} ${h % 90}`
}
const DUR: Record<Phase, number> = {
  lobby: 20_000,
  intro: TIMING.introMs,
  hide: TIMING.hideMs,
  hunting: TIMING.huntingMs,
  reveal: TIMING.revealMs,
  finale: TIMING.finaleMs,
}

export function fakeSource(scenario: string): SnapSource {
  return {
    start(h) {
      const t0 = Date.now()
      const startPhase: Phase =
        scenario === "lobby" || scenario === "loop" ? "lobby" : scenario.startsWith("finale") ? "finale" : scenario === "outage" ? "hide" : (scenario as Phase)
      // screenshot scenarios hold their phase (with a looping countdown); loop and outage run the real cadence
      const hold = !["loop", "outage", "lobby"].includes(scenario)
      let phase: Phase = startPhase
      let endsAt = t0 + DUR[phase]
      let beat = phase === "lobby" ? 0 : 3
      const round = 3
      let winner: StageSnap["winner"] = scenario === "finale" ? "ghosts" : scenario === "finale-hunters" ? "hunters" : null
      let restoredAt: number | null = null
      let swept: RoomId[] = []
      const target = 312
      const ghosts: FakeGhost[] = []
      const events: HouseEvent[] = []
      const counters = { online: 0, humans: 0, bots: 0, joinedToday: 1184, sweeps: 41, caught: 263, whispers: 57, possessions: 9, rounds: 2 }
      const rooms = new Map<RoomId, RoomState>(ROOM_IDS.map((id) => [id, { id, count: 0, cap: 0, possessed: false, swept: false }]))
      const hunters: HunterState[] = HUNTERS.map((x) => ({ id: x.id, vote: null, lean: null }))
      const ev = (e: Omit<HouseEvent, "at">, at: number) => {
        events.push({ ...e, at })
        if (events.length > 20) events.shift()
      }
      const addGhost = (now: number, instant: boolean) => {
        const n = ghosts.length
        const id = `ghost-${n}-${Math.random().toString(36).slice(2, 8)}`
        ghosts.push({ id, color: Math.floor(Math.random() * GHOST_COLORS.length), room: ROOM_IDS[n % ROOM_IDS.length], bot: n % 3 === 2, caught: false, score: Math.floor(Math.random() * 600), streak: Math.floor(Math.random() * 3) })
        counters.joinedToday++
        if (!instant) ev({ kind: "join" }, now)
      }
      if (phase !== "lobby") for (let i = 0; i < target; i++) addGhost(t0, true)
      const possess = (ids: RoomId[]) => {
        for (const id of ids) {
          const r = rooms.get(id)
          if (r) r.possessed = true
        }
      }
      if (beat > 0) possess(["ballroom"])
      if (scenario === "finale") possess(["ballroom", "library", "crypt"])
      let down = false
      let downSince = 0
      let leader = ""

      const enterReveal = (now: number) => {
        const votes = new Map<RoomId, number>()
        for (const x of hunters) if (x.vote) votes.set(x.vote, (votes.get(x.vote) ?? 0) + 1)
        swept = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r)
        while (swept.length < 2) swept.push(pick(ROOM_IDS.filter((r) => !swept.includes(r))))
        const thr = possessThreshold(ghosts.length)
        for (const r of rooms.values()) {
          r.swept = swept.includes(r.id)
          const inRoom = ghosts.filter((g) => g.room === r.id && !g.caught)
          if (r.swept) {
            for (const g of inRoom) {
              g.caught = true
              g.streak = 0
            }
            counters.sweeps++
            counters.caught += inRoom.length
            ev({ kind: "sweep", room: r.id, count: inRoom.length }, now)
            if (inRoom.length) ev({ kind: "caught", room: r.id, count: inRoom.length }, now)
            if (r.possessed) {
              r.possessed = false
              ev({ kind: "cleansed", room: r.id }, now)
            }
          } else {
            for (const g of inRoom) {
              g.score += 60 + Math.floor(Math.random() * 80)
              g.streak++
              if (g.streak === 3) ev({ kind: "onfire", ghostId: g.id, name: fakeName(g.id) }, now)
            }
            if (!r.possessed && inRoom.length >= thr) {
              r.possessed = true
              counters.possessions++
              ev({ kind: "possessed", room: r.id, count: inRoom.length }, now)
            }
          }
        }
      }
      const vote = (now: number) => {
        const byCount = [...rooms.values()].sort((a, b) => b.count - a.count)
        hunters.forEach((x, i) => {
          x.vote = i < 3 ? byCount[i % 2].id : pick(ROOM_IDS)
          ev({ kind: "vote", hunter: x.id, room: x.vote }, now)
        })
        const g = pick(ghosts)
        if (g) ev({ kind: "lie", ghostId: g.id, name: fakeName(g.id), hunter: pick(HUNTERS).id, room: byCount[5].id }, now)
      }
      const enter = (next: Phase, now: number) => {
        phase = next
        endsAt = now + DUR[next]
        ev({ kind: "phase", text: next }, now)
        if (next === "hide") {
          beat++
          swept = []
          for (const g of ghosts) g.caught = false
          for (const r of rooms.values()) r.swept = false
          for (const x of hunters) x.vote = null
        } else if (next === "hunting") vote(now)
        else if (next === "reveal") enterReveal(now)
      }
      if (phase === "reveal") {
        for (const g of ghosts) g.room = Math.random() < 0.3 ? "ballroom" : pick(ROOM_IDS)
        hunters.forEach((x, i) => (x.vote = i < 3 ? "library" : "crypt"))
      }

      const tick = () => {
        const now = Date.now()
        const el = now - t0
        if (scenario === "outage") {
          if (!down && el > 3000 && el < 4000) {
            down = true
            downSince = now
            h.status(false, "fake kill -9")
          }
          if (down && now - downSince > 9000) {
            down = false
            restoredAt = now
            ev({ kind: "revived" }, now)
            h.status(true, "fake restart")
          }
        }
        if (phase === "reveal" && swept.length === 0 && el > 900) enterReveal(now)
        if (now >= endsAt) {
          if (hold) endsAt = now + DUR[phase]
          else if (phase === "lobby") enter("intro", now)
          else if (phase === "intro") enter("hide", now)
          else if (phase === "hide") enter("hunting", now)
          else if (phase === "hunting") enter("reveal", now)
          else if (phase === "reveal") {
            if (beat >= BEATS_PER_ROUND) {
              winner = [...rooms.values()].filter((r) => r.possessed).length >= ROOMS_TO_WIN ? "ghosts" : "hunters"
              enter("finale", now)
            } else enter("hide", now)
          } else if (phase === "finale") {
            winner = null
            beat = 0
            for (const r of rooms.values()) Object.assign(r, { possessed: false, swept: false })
            enter("lobby", now)
          }
        }
        if (phase === "lobby" && ghosts.length < target && Math.random() < 0.9) {
          const n = 1 + Math.floor(Math.random() * 3)
          for (let i = 0; i < n && ghosts.length < target; i++) addGhost(now, false)
        }
        if (phase === "hide") for (const x of hunters) if (Math.random() < 0.02 || !x.lean) x.lean = pick(ROOM_IDS)
        if (phase === "hide" || phase === "lobby") {
          // musical chairs: a full room refuses the move (same rule as the House)
          const cap = roomCapacity(ghosts.length)
          const seated = new Map<RoomId, number>()
          for (const g of ghosts) if (!g.caught) seated.set(g.room, (seated.get(g.room) ?? 0) + 1)
          for (const g of ghosts) {
            if (g.caught || Math.random() >= 0.025) continue
            const to = Math.random() < 0.3 ? "ballroom" : pick(ROOM_IDS)
            if ((seated.get(to) ?? 0) >= cap) continue
            seated.set(g.room, (seated.get(g.room) ?? 1) - 1)
            seated.set(to, (seated.get(to) ?? 0) + 1)
            g.room = to
          }
          if (Math.random() < 0.012) {
            const g = pick(ghosts)
            if (g && !g.caught) ev({ kind: "wave", ghostId: g.id, name: fakeName(g.id), room: g.room }, now)
          }
        }
        for (const r of rooms.values()) r.count = 0
        for (const g of ghosts) {
          const r = rooms.get(g.room)
          if (r && !g.caught) r.count++
        }
        counters.online = ghosts.length
        counters.bots = ghosts.filter((g) => g.bot).length
        counters.humans = counters.online - counters.bots
        if (down) return
        const top = [...ghosts]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((g): [string, string, number, number, number] => [g.id, fakeName(g.id), g.color, g.score, g.streak])
        if (top[0] && top[0][0] !== leader) {
          if (leader) ev({ kind: "lead", ghostId: top[0][0], name: top[0][1] }, now)
          leader = top[0][0]
        }
        const tuples: GhostTuple[] = ghosts.map((g) => [g.id, g.color, g.room, (g.caught ? 1 : 0) | (g.bot ? 2 : 0)])
        h.snap({
          phase,
          mode: scenario === "loop" ? "auto" : "show",
          endsAt,
          now,
          round,
          beat,
          ghosts: tuples,
          rooms: [...rooms.values()].map((r) => ({ ...r, cap: roomCapacity(ghosts.length) })),
          hunters: hunters.map((x) => ({ ...x })),
          sweptRooms: swept.slice(),
          // ROOM HEAT (fake): lies pile up on two rooms as the hide runs
          rumors: phase === "hide" || phase === "hunting" ? { crypt: 1 + (Math.floor(now / 1500) % 4), library: 1, attic: Math.floor(now / 2000) % 2 } : {},
          counters: { ...counters },
          events: events.slice(),
          winner,
          top,
          restoredAt,
        })
      }
      h.status(true, `fake:${scenario}`)
      tick()
      window.setInterval(tick, 1000 / TIMING.stageHz)
    },
  }
}
