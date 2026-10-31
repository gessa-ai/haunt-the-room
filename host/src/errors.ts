import type { Json } from "../../contract/protocol.ts"

export type HostFn = "load" | "init" | "reduce" | "view"
/** throw: the game threw. timeout: past timeoutMs (context rebuilt). memory: past memoryMb (context rebuilt).
 *  invalid: the result broke the contract (not plain JSON, not an object, too big, missing export). */
export type HostErrorKind = "throw" | "timeout" | "memory" | "invalid"

export class HostError extends Error {
  readonly fn: HostFn
  readonly kind: HostErrorKind
  constructor(fn: HostFn, kind: HostErrorKind, message: string) {
    super(message)
    this.name = "HostError"
    this.fn = fn
    this.kind = kind
  }
}

/** viewsFor: some players' views failed. `views` holds every view that succeeded, `failed` the reason per player. */
export class ViewsError extends HostError {
  readonly views: Record<string, Json>
  readonly failed: Record<string, string>
  constructor(kind: HostErrorKind, views: Record<string, Json>, failed: Record<string, string>) {
    const ids = Object.keys(failed)
    super("view", kind, `view failed for ${ids.length} player(s): ${ids.map((id) => `${id}: ${failed[id]}`).join("; ")}`)
    this.name = "ViewsError"
    this.views = views
    this.failed = failed
  }
}
