// What a bot knows about the house (the latest frames any bot socket heard) and where it hides.
import { ROOMS, type HouseToPhone, type Phase, type RoomId, type RoomState } from "../../contract/protocol.ts"

const IDS: RoomId[] = ROOMS.map((r) => r.id)

/** One house, so one shared view: whichever bot socket heard the House last wins. */
export const world = {
  phase: null as Phase | null,
  beat: 0,
  round: 0,
  endsAt: 0,
  rooms: new Map<RoomId, RoomState>(),
  leans: new Set<RoomId>(), // rooms a hunter is openly leaning toward right now
}

export function applyPhase(m: Extract<HouseToPhone, { t: "phase" }>) {
  Object.assign(world, { phase: m.phase, beat: m.beat, round: m.round, endsAt: m.endsAt })
}
export function applyRooms(m: Extract<HouseToPhone, { t: "rooms" }>) {
  for (const r of m.rooms) world.rooms.set(r.id, r)
  world.leans = new Set((m.leans ?? []).map(([, room]) => room))
}

/** Per bot per beat (QA 14:28: catches 0.76/ghost/beat vs target 0.25-0.40): ~40% spread out, ~35% follow the
 *  crowd toward possession, ~25% hug the empty rooms. */
export type Strategy = "crowd" | "spread" | "empty"
export function pickStrategy(): Strategy {
  const r = Math.random()
  return r < 0.4 ? "spread" : r < 0.75 ? "crowd" : "empty"
}

function weighted(ids: RoomId[], w: (id: RoomId) => number): RoomId {
  const ws = ids.map(w)
  let pick = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ids.length; i++) if ((pick -= ws[i]!) <= 0) return ids[i]!
  return ids[ids.length - 1]!
}

const count = (id: RoomId) => world.rooms.get(id)?.count ?? 0
const free = (id: RoomId) => {
  const r = world.rooms.get(id)
  return !r || r.count < r.cap
}

/** Where to hide; never a full room (refused = no seat = caught). `except` = the room being left or refused. */
export function pickHide(s: Strategy | "random", except: RoomId | null = null): RoomId {
  const open = IDS.filter((id) => id !== except && free(id))
  const ids = open.length ? open : IDS.filter((id) => id !== except)
  if (s === "random") return ids[Math.floor(Math.random() * ids.length)]!
  // spread: weighted toward the less crowded rooms, so the crowd fans out evenly
  if (s === "spread") return weighted(ids, (id) => 1 / (1 + count(id)))
  // empty: the emptiest open room
  if (s === "empty") return [...ids].sort((a, b) => count(a) - count(b) + Math.random() - 0.5)[0]!
  // crowd: the most-filled non-full room that no hunter leans toward and is not possessed yet
  const target = (id: RoomId) => !world.leans.has(id) && !world.rooms.get(id)?.possessed
  const pool = ids.filter(target).length ? ids.filter(target) : ids
  return [...pool].sort((a, b) => count(b) - count(a) + (Math.random() - 0.5) * 0.9)[0]!
}

/** The lie that works: one of the three emptiest rooms (not the liar's own), so a hunter sweeps (almost) nobody;
 *  several liars per beat name different rooms. */
export function pickLure(own: RoomId | null): RoomId {
  const score = (id: RoomId) => count(id) + Math.random() * 0.5
  const emptiest = IDS.filter((id) => id !== own).sort((a, b) => score(a) - score(b)).slice(0, 3)
  return emptiest[Math.floor(Math.random() * emptiest.length)]!
}
