// The referee: the only hands the hunters have. It registers the typed Relay actions "sweep" (this beat's vote) and
// "taunt", applies each to the House and posts the outcome to #hunt, so every action is a line on the feed.
// The input carries `hunter`: Relay reports every action caller as "node", so the caller cannot name itself.

import { z } from "zod"
import { HUNTERS, ROOMS, type HouseRpc, type HunterId, type RoomId } from "../../contract/protocol.ts"
import { noEmoji } from "./content.ts"
import { CHANNEL, type Agent } from "./relay.ts"

const hunterId = z.enum(HUNTERS.map((h) => h.id) as [HunterId, ...HunterId[]])
const roomId = z.enum(ROOMS.map((r) => r.id) as [RoomId, ...RoomId[]])

export const ACTION_INPUT = {
  sweep: z.object({ hunter: hunterId, room: roomId }),
  taunt: z.object({ hunter: hunterId, text: z.string().min(1).max(80) }),
  lean: z.object({ hunter: hunterId, room: roomId, conviction: z.number().min(0).max(100).optional(), swayedBy: z.string().max(16).optional() }),
}

export type Applied =
  | { action: "sweep"; hunter: HunterId; room: RoomId; ok: boolean; reason?: string }
  | { action: "taunt"; hunter: HunterId; text: string; ok: true }
  | { action: "lean"; hunter: HunterId; room: RoomId; conviction?: number; swayedBy?: string; ok: boolean; reason?: string }

/** The House calls the referee makes. `lean` is the poker tell (contract HunterState.lean; RPC pending in L2). */
export type House = Pick<HouseRpc, "huntView" | "sweep" | "taunt" | "lean">

export const hunterName = (id: HunterId) => HUNTERS.find((h) => h.id === id)!.name
export const roomName = (id: RoomId) => ROOMS.find((r) => r.id === id)!.name

function line(a: Applied): string {
  const who = hunterName(a.hunter)
  if (a.action === "taunt") return `taunt · ${who}: "${a.text}"`
  if (a.action === "lean") return a.ok ? `lean · ${who} → ${roomName(a.room)}${a.conviction !== undefined ? ` ${a.conviction}` : ""}${a.swayedBy ? ` · swayed by ${a.swayedBy}` : ""}` : `lean refused · ${who}: ${a.reason ?? "no"}`
  return a.ok ? `vote · ${who} → ${roomName(a.room)}` : `vote refused · ${who} → ${roomName(a.room)}: ${a.reason ?? "no"}`
}

export interface Referee {
  /** Post a referee line (the reveal results). */
  post(text: string, metadata: Record<string, unknown>): Promise<void>
  stop(): void
}

export function startReferee(opts: { referee: Agent; house: House; onApplied?: (a: Applied) => void; log: (l: string) => void }): Referee {
  const { referee, house, log } = opts
  const post = async (text: string, metadata: Record<string, unknown>) => {
    text = noEmoji(text)
    log(`  referee     ${text}`)
    await referee.me.sendMessage({ to: `#${CHANNEL}`, text, metadata }).catch((e: Error) => log(`[referee] could not post: ${e.message}`))
  }
  const report = async (a: Applied) => {
    opts.onApplied?.(a)
    await post(line(a), { kind: "action", ...a })
    return a
  }
  /** A House failure is logged with the action and returned as a refusal; it never reaches the stage feed. */
  const guarded =
    <I extends { hunter: HunterId }, O>(name: string, fn: (input: I) => Promise<O>) =>
    async ({ input }: { input: I }): Promise<O | { ok: false; reason: string }> => {
      try {
        return await fn(input)
      } catch (e) {
        log(`[referee] ${name} by ${input.hunter} failed at the House: ${(e as Error).message.slice(0, 120)}`)
        return { ok: false, reason: (e as Error).message }
      }
    }
  let undo = () => {}
  referee.attach((a) => {
    const handles = [
      a.me.registerAction({
        name: "sweep",
        description: "Vote to sweep a room this beat; the two most-voted rooms are swept at the reveal.",
        input: ACTION_INPUT.sweep,
        handler: guarded("sweep", async (input: { hunter: HunterId; room: RoomId }) => report({ action: "sweep", ...input, ...(await house.sweep(input)) })),
      }),
      a.me.registerAction({
        name: "lean",
        description: "Openly lean toward a room with a conviction 0-100 (hide and hunting; shown live on the table; may be a bluff, the sweep stays secret). swayedBy: the whisperer who changed this hunter's mind.",
        input: ACTION_INPUT.lean,
        handler: guarded("lean", async (input: { hunter: HunterId; room: RoomId; conviction?: number; swayedBy?: string }) => report({ action: "lean", ...input, ...(await house.lean(input)) })),
      }),
      a.me.registerAction({
        name: "taunt",
        description: "Shout at the ghosts (80 characters).",
        input: ACTION_INPUT.taunt,
        handler: guarded("taunt", async (input: { hunter: HunterId; text: string }) => {
          await house.taunt(input)
          return report({ action: "taunt", ...input, ok: true })
        }),
      }),
    ]
    undo = () => handles.forEach((h) => h.unregister())
    return () => undo()
  })
  return { post, stop: () => undo() }
}
