// One QuickJS runtime + context per host, holding the game module loaded once. Owns the deadline, the memory
// limit and the rebuild after a timeout or out-of-memory. All traffic is strings (one crossing per call).
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime, type QuickJSWASMModule } from "quickjs-emscripten-core"
import singlefile from "@jitl/quickjs-singlefile-mjs-release-sync"
import { PRELUDE } from "./prelude.ts"
import { HostError, type HostErrorKind, type HostFn } from "./errors.ts"

let wasm: Promise<QuickJSWASMModule> | undefined
/** The shared QuickJS wasm module (one per process / actor worker; each host gets its own runtime). */
export const quickjs = (): Promise<QuickJSWASMModule> => (wasm ??= newQuickJSWASMModuleFromVariant(singlefile))

export interface SandboxError { name: string; message: string; stack: string }
export interface SandboxLimits { timeoutMs: number; loadTimeoutMs: number; memoryBytes: number; stackBytes: number }

interface Live {
  rt: QuickJSRuntime
  vm: QuickJSContext
  run: QuickJSHandle
  views: QuickJSHandle
  arm: QuickJSHandle
}

export class Sandbox {
  private live: Live | null = null
  private deadline = Infinity
  private interrupted = false
  private disposed = false
  private readonly mod: QuickJSWASMModule
  private readonly script: string
  private readonly limits: SandboxLimits
  /** Meta JSON reported by the module at the last load. */
  metaJson = "null"

  constructor(mod: QuickJSWASMModule, script: string, limits: SandboxLimits) {
    this.mod = mod
    this.script = script
    this.limits = limits
    this.load()
  }

  /** Call runner.run / runner.views. Returns the runner's string; a crash, timeout or OOM throws HostError. */
  call(fn: HostFn, which: "run" | "views", args: (string | number)[]): string {
    if (this.disposed) throw new HostError(fn, "throw", "host is disposed")
    if (!this.live) this.load() // a previous rebuild failed; retry once, it throws HostError("load") again if still broken
    const live = this.live as Live
    const handles = args.map((a) => (typeof a === "string" ? live.vm.newString(a) : live.vm.newNumber(a)))
    this.interrupted = false
    this.deadline = performance.now() + this.limits.timeoutMs
    let res
    try {
      res = live.vm.callFunction(which === "run" ? live.run : live.views, live.vm.undefined, ...handles)
    } finally {
      this.deadline = Infinity
      for (const h of handles) h.dispose()
    }
    if (res.error) {
      const err = dumpError(live.vm, res.error)
      res.error.dispose()
      const kind: HostErrorKind = this.interrupted ? "timeout" : classify(err)
      this.rebuild()
      throw new HostError(fn, kind, kind === "timeout" ? `${fn} timed out after ${this.limits.timeoutMs} ms (infinite loop or too slow)` : formatError(fn, err))
    }
    const out = live.vm.getString(res.value)
    res.value.dispose()
    return out
  }

  /** After an out-of-memory reported from inside the sandbox: drop the runtime and load fresh. */
  rebuild(): void {
    this.teardown()
    try { this.load() } catch { /* stays null; the next call retries the load and throws HostError("load") */ }
  }

  dispose(): void {
    this.disposed = true
    this.teardown()
  }

  private load(): void {
    const rt = this.mod.newRuntime()
    rt.setMemoryLimit(this.limits.memoryBytes)
    rt.setMaxStackSize(this.limits.stackBytes)
    rt.setInterruptHandler(() => {
      if (performance.now() <= this.deadline) return false
      this.interrupted = true
      return true
    })
    const vm = rt.newContext()
    const handles: QuickJSHandle[] = []
    try {
      const runner = this.eval(vm, PRELUDE, "prelude.js")
      handles.push(runner)
      const install = vm.getProp(runner, "install"); handles.push(install)
      const run = vm.getProp(runner, "run")
      const views = vm.getProp(runner, "views")
      const arm = vm.newFunction("arm", () => { this.deadline = performance.now() + this.limits.timeoutMs })
      const live: Live = { rt, vm, run, views, arm }
      this.live = live
      this.deadline = performance.now() + this.limits.loadTimeoutMs
      const exportsObj = this.eval(vm, this.script, "game.js")
      handles.push(exportsObj)
      const r = vm.callFunction(install, vm.undefined, exportsObj, arm)
      if (r.error) { const e = dumpError(vm, r.error); r.error.dispose(); throw new HostError("load", this.interrupted ? "timeout" : classify(e), formatError("load", e)) }
      const meta = vm.getString(r.value)
      r.value.dispose()
      if (meta.startsWith("!")) { const e = JSON.parse(meta.slice(1)) as SandboxError; throw new HostError("load", classify(e), formatError("load", e)) }
      this.metaJson = meta
    } catch (e) {
      for (const h of handles) h.dispose()
      this.teardown(vm, rt)
      throw e
    } finally {
      this.deadline = Infinity
    }
    for (const h of handles) h.dispose()
  }

  private eval(vm: QuickJSContext, code: string, filename: string): QuickJSHandle {
    this.interrupted = false
    const r = vm.evalCode(code, filename)
    if (r.error) {
      const e = dumpError(vm, r.error)
      r.error.dispose()
      if (this.interrupted) throw new HostError("load", "timeout", `module top level timed out after ${this.limits.loadTimeoutMs} ms`)
      throw new HostError("load", classify(e), formatError("load", e))
    }
    return r.value
  }

  private teardown(vm?: QuickJSContext, rt?: QuickJSRuntime): void {
    const live = this.live
    this.live = null
    if (live) {
      for (const h of [live.run, live.views, live.arm]) if (h.alive) h.dispose()
      live.vm.dispose()
      live.rt.dispose()
    } else {
      vm?.dispose()
      rt?.dispose()
    }
  }
}

function dumpError(vm: QuickJSContext, h: QuickJSHandle): SandboxError {
  try {
    const d = vm.dump(h) as unknown
    if (d && typeof d === "object") {
      const o = d as { name?: unknown; message?: unknown; stack?: unknown }
      return { name: String(o.name ?? "Error"), message: String(o.message ?? ""), stack: String(o.stack ?? "") }
    }
    return { name: "Throw", message: String(d), stack: "" }
  } catch {
    return { name: "InternalError", message: "unreadable exception", stack: "" }
  }
}

export function classify(e: SandboxError): HostErrorKind {
  if (e.name === "ConjureInvalid") return "invalid"
  if (/out of memory/i.test(e.message)) return "memory"
  if (/^interrupted$/.test(e.message)) return "timeout"
  return "throw"
}

export function formatError(fn: HostFn, e: SandboxError): string {
  if (e.name === "ConjureInvalid") return e.message
  const what = e.name === "Throw" ? `the non-Error value ${JSON.stringify(e.message)}` : `${e.name}: ${e.message}`
  const at = gameFrames(e.stack)
  return `${fn} threw ${what}${at ? ` (at ${at})` : ""}`
}

/** The game's own frames, innermost first: "resolveRound < reduce:120". QuickJS (release) omits the line of
 *  the innermost frame; callers carry the line of the call. */
function gameFrames(stack: string): string {
  const frames = [...stack.matchAll(/at (\S+) \(game\.js(?::(\d+))?/g)].slice(0, 3)
  return frames.map((m) => (m[2] ? `${m[1]}:${m[2]}` : m[1])).join(" < ")
}
