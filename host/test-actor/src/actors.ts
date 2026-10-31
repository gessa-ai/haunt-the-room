// Bundling proof: the Terse actor bundler (esbuild, no wasm loader) must inline conjure-host + QuickJS.
import { Actor } from "durable-actors"
import { createHost, HostError, type Host } from "../../src/index.ts"
import type { GameMeta, Json } from "../../../contract/protocol.ts"

export interface PlayResult {
  meta: GameMeta; cold: boolean; loadMs: number; reduces: number; reduceP50Ms: number; reduceMaxMs: number
  viewsForMs: number; viewIds: string[]; phase: Json; rng: number; errors: string[]
}
export interface LoopResult { error: string; ms: number; stateAfterRecovery: Json; callerStateUntouched: boolean }

// One host per module source, loaded once per worker (what the Table actor does).
const hosts = new Map<string, Promise<Host>>()
const hostFor = (src: string) => {
  let h = hosts.get(src)
  if (!h) { h = createHost(src, { seed: 42 }); hosts.set(src, h) }
  return h
}

export class HostProbe extends Actor<null, string, string> {
  /** init 6 players, then `steps` ticks + a typed action each, then viewsFor every seat + the stage. */
  async play(input: { src: string; steps: number; action: { type: string; [k: string]: Json } }): Promise<PlayResult> {
    const t0 = performance.now()
    const cold = !hosts.has(input.src)
    const host = await hostFor(input.src)
    const loadMs = performance.now() - t0
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6"]
    let now = 1_761_955_200_000
    let state = host.init(ids.map((id) => ({ id, name: id })), now)
    const reduceMs: number[] = []
    const errors: string[] = []
    for (let i = 0; i < input.steps; i++) {
      now += 500
      for (const a of [{ type: "tick" }, { ...input.action, playerId: ids[i % ids.length] as string }]) {
        const t = performance.now()
        try { state = host.reduce(state, a, now) } catch (e) { if (e instanceof HostError) errors.push(`${e.fn}/${e.kind}: ${e.message}`); else throw e }
        reduceMs.push(performance.now() - t)
      }
    }
    const t1 = performance.now()
    const views = host.viewsFor(state, [...ids, "stage"], now)
    const viewsMs = performance.now() - t1
    reduceMs.sort((a, b) => a - b)
    return {
      meta: host.meta, cold, loadMs, reduces: reduceMs.length,
      reduceP50Ms: reduceMs[Math.floor(reduceMs.length / 2)] ?? 0, reduceMaxMs: reduceMs[reduceMs.length - 1] ?? 0,
      viewsForMs: viewsMs, viewIds: Object.keys(views), phase: (state as { phase?: Json }).phase ?? null,
      rng: host.rng.save(), errors: errors.slice(0, 3),
    }
  }

  /** The interrupt handler works inside the actor worker: a looping reduce times out, the host survives. */
  async loop(): Promise<LoopResult> {
    const src = `export const meta = { title: "Loop", minPlayers: 1, maxPlayers: 4 };
export function init() { return { n: 0 } }
export function reduce(s, a) { if (a.type === "spin") while (true) {} s.n++; return s }
export function view(s, id) { return { me: id, n: s.n } }
export function render() {}`
    const host = await hostFor(src)
    const s0 = host.init([{ id: "a", name: "A" }], 1)
    const t = performance.now()
    let error = ""
    try { host.reduce(s0, { type: "spin" }, 2) } catch (e) { error = e instanceof HostError ? `${e.fn}/${e.kind}: ${e.message}` : String(e) }
    const ms = performance.now() - t
    const after = host.reduce(s0, { type: "inc" }, 3)
    return { error, ms, stateAfterRecovery: after, callerStateUntouched: JSON.stringify(s0) === '{"n":0}' }
  }
}
