// conjure-host: runs the server half (meta, init, reduce, view) of a generated game module in a QuickJS
// sandbox. One host = one module loaded once into one long-lived context. Contract: contract/GAME-CONTRACT.md.
import { HOST_CALL_TIMEOUT_MS, type GameMeta, type Json } from "../../contract/protocol.ts"
import { HostError, ViewsError, type HostErrorKind } from "./errors.ts"
import { MAX_SOURCE_BYTES, EXPORT_NAMES, parseMeta, readStaticMeta, scanModule } from "./module.ts"
import { Sandbox, classify, formatError, quickjs, type SandboxError } from "./sandbox.ts"

export { HostError, ViewsError, type HostErrorKind, type HostFn } from "./errors.ts"
export { MAX_SOURCE_BYTES } from "./module.ts"
// GameMeta and Json come from contract/protocol.ts: import them from there, never through the host (an actor
// RPC signature that names a host type pulls host/src into the Terse declarations pass; see lanes/L1.md).

/** State over this many characters (JSON) is refused: contract "state stays under 64 KB". */
export const MAX_STATE_BYTES = 64 * 1024
/** The spectator id passed to view() for the stage (playerId null). */
export const STAGE_ID = "stage"

export interface HostOptions {
  seed: number
  timeoutMs?: number // per call; default HOST_CALL_TIMEOUT_MS (250)
  memoryMb?: number // QuickJS heap limit; default 32
}

export type HostAction = { type: string; playerId?: string; [k: string]: Json | undefined }

export interface Host {
  /** Parsed and clamped: maxPlayers <= TABLE_CAP, tickMs >= MIN_TICK_MS. */
  readonly meta: GameMeta
  init(players: { id: string; name: string }[], now: number): Json
  /** Never mutates `state`. On failure throws HostError and the rng is left as it was: the caller keeps `state`. */
  reduce(state: Json, action: HostAction, now: number): Json
  /** playerId null = the stage spectator (the module sees "stage"). */
  view(state: Json, playerId: string | null, now: number): Json
  /** One sandbox crossing for many players. Throws ViewsError (with the views that worked) if any failed. */
  viewsFor(state: Json, playerIds: string[], now: number): Record<string, Json>
  /** The seeded PRNG state behind ctx.random (mulberry32, uint32), so a table can persist and restore it. */
  readonly rng: { save(): number; load(s: number): void }
  dispose(): void
}

export async function createHost(src: string, opts: HostOptions): Promise<Host> {
  const scanned = scanModule(src)
  const blocking = scanned.issues.filter((i) => /import|re-export|export \*/.test(i))
  if (blocking.length) throw new HostError("load", "invalid", blocking.join("; "))
  const timeoutMs = opts.timeoutMs ?? HOST_CALL_TIMEOUT_MS
  const sandbox = new Sandbox(await quickjs(), scanned.script, {
    timeoutMs,
    loadTimeoutMs: Math.max(1000, timeoutMs * 4),
    memoryBytes: (opts.memoryMb ?? 32) * 1024 * 1024,
    stackBytes: 512 * 1024,
  })
  const parsed = parseMeta(JSON.parse(sandbox.metaJson))
  if (!parsed.meta) { sandbox.dispose(); throw new HostError("load", "invalid", parsed.issues.join("; ")) }
  const meta = parsed.meta
  let rng = opts.seed >>> 0

  // init/reduce: the runner returns `rng\nstate` or `!error`; the rng commits only on success.
  const run = (fn: "init" | "reduce", args: string, now: number): Json => {
    const out = sandbox.call(fn, "run", [fn, args, rng, now, MAX_STATE_BYTES])
    if (out.startsWith("!")) throw sandboxFailure(fn, JSON.parse(out.slice(1)) as SandboxError, sandbox)
    const nl = out.indexOf("\n")
    const next = JSON.parse(out.slice(nl + 1)) as Json
    rng = Number(out.slice(0, nl)) >>> 0
    return next
  }
  const views = (state: Json, ids: string[], now: number) => {
    const out = JSON.parse(sandbox.call("view", "views", [JSON.stringify(state), JSON.stringify(ids), rng, now])) as {
      views: Record<string, Json>
      failed: Record<string, SandboxError>
    }
    const failedIds = Object.keys(out.failed)
    if (!failedIds.length) return { views: out.views, failed: null }
    let kind: HostErrorKind = "throw"
    const failed: Record<string, string> = {}
    for (const id of failedIds) {
      const e = out.failed[id] as SandboxError
      failed[id] = formatError("view", e)
      kind = classify(e)
    }
    if (kind === "memory") sandbox.rebuild()
    return { views: out.views, failed, kind }
  }

  return {
    meta,
    init(players, now) {
      return run("init", JSON.stringify({ players: players.map((p) => ({ id: p.id, name: p.name })) }), now)
    },
    reduce(state, action, now) {
      try {
        return run("reduce", JSON.stringify({ state, action }), now)
      } catch (e) {
        if (e instanceof HostError) throw new HostError("reduce", e.kind, `${e.message} on ${JSON.stringify(action).slice(0, 160)}`)
        throw e
      }
    },
    view(state, playerId, now) {
      const id = playerId ?? STAGE_ID
      const r = views(state, [id], now)
      if (r.failed) throw new HostError("view", r.kind, `${r.failed[id]} for ${id}`)
      return r.views[id] as Json
    },
    viewsFor(state, playerIds, now) {
      const r = views(state, playerIds, now)
      if (r.failed) throw new ViewsError(r.kind, r.views, r.failed)
      return r.views
    },
    rng: {
      save: () => rng,
      load: (s: number) => { rng = s >>> 0 },
    },
    dispose: () => sandbox.dispose(),
  }
}

function sandboxFailure(fn: "init" | "reduce", e: SandboxError, sandbox: Sandbox): HostError {
  const kind = classify(e)
  if (kind === "memory") sandbox.rebuild()
  return new HostError(fn, kind, formatError(fn, e))
}

/** Static checks, no code runs: size, no imports, the required exports, a sane literal meta. */
export function checkModule(src: string): { ok: boolean; issues: string[]; meta?: GameMeta } {
  const issues: string[] = []
  if (src.length >= MAX_SOURCE_BYTES) issues.push(`module is ${src.length} bytes (limit ${MAX_SOURCE_BYTES})`)
  const scanned = scanModule(src)
  issues.push(...scanned.issues)
  const missing = EXPORT_NAMES.filter((n) => !scanned.exported.has(n))
  if (missing.length) issues.push(`missing export ${missing.join(", ")}`)
  const read = readStaticMeta(src)
  let meta: GameMeta | undefined
  if (read.issue) issues.push(read.issue)
  else {
    const parsed = parseMeta(read.raw)
    issues.push(...parsed.issues)
    meta = parsed.meta
  }
  return meta ? { ok: issues.length === 0, issues, meta } : { ok: false, issues }
}
