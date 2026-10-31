import { Actor, Persisted, Ephemeral, Interleave } from "durable-actors"
import type { ActorSocket } from "durable-actors"
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core"
import singlefile from "@jitl/quickjs-singlefile-mjs-release-sync"

// ---------- 2. QuickJS sandboxed reducer ----------
let qjsPromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined
const qjs = () => (qjsPromise ??= newQuickJSWASMModuleFromVariant(singlefile))

export class Sandbox extends Actor<null, string, string> {
    @Persisted state: unknown = { n: 0 }
    @Persisted reducer = "function reduce(s,a){ return { n: s.n + a.by } }"

    async setReducer(src: string) { this.reducer = src; return true }

    async apply(action: unknown): Promise<{ state: unknown; us: number; coldUs?: number }> {
        const t0 = performance.now()
        const mod = await qjs()
        const t1 = performance.now()
        const rt = mod.newRuntime()
        rt.setMemoryLimit(16 * 1024 * 1024)
        rt.setMaxStackSize(512 * 1024)
        const deadline = Date.now() + 50
        rt.setInterruptHandler(() => Date.now() > deadline) // kills infinite loops
        const vm = rt.newContext()
        try {
            const code = `${this.reducer}\nJSON.stringify(reduce(${JSON.stringify(this.state)}, ${JSON.stringify(action)}))`
            const result = vm.evalCode(code)
            if (result.error) { const e = vm.dump(result.error); result.error.dispose(); throw new Error("reducer error: " + JSON.stringify(e)) }
            const next = JSON.parse(vm.getString(result.value)); result.value.dispose()
            this.state = next
            return { state: next, us: Math.round((performance.now() - t1) * 1000), coldUs: Math.round((t1 - t0) * 1000) }
        } finally { vm.dispose(); rt.dispose() }
    }

    async timing(action: unknown) {
        const mod = await qjs()
        const t0 = performance.now()
        const rt = mod.newRuntime(); const vm = rt.newContext()
        const t1 = performance.now()
        const r = vm.evalCode(`${this.reducer}\nJSON.stringify(reduce(${JSON.stringify(this.state)}, ${JSON.stringify(action)}))`)
        const out = JSON.parse(vm.getString(vm.unwrapResult(r)))
        const t2 = performance.now()
        vm.dispose(); rt.dispose()
        const t3 = performance.now()
        this.state = out
        const t4 = performance.now()
        this.state = out
        const t5 = performance.now()
        return { newRtCtxUs: Math.round((t1-t0)*1000), evalUs: Math.round((t2-t1)*1000), disposeUs: Math.round((t3-t2)*1000), persistUs: Math.round((t4-t3)*1000), persist2Us: Math.round((t5-t4)*1000) }
    }

    async applyNewFunction(action: unknown) {
        const t0 = performance.now()
        const reduce = new Function(`${this.reducer}; return reduce`)()
        this.state = reduce(this.state, action)
        return { state: this.state, us: Math.round((performance.now() - t0) * 1000) }
    }
}

// ---------- 1. Alarm tick granularity ----------
export class Ticker extends Actor<null, string, { t: number; n: number }> {
    @Persisted ticks: number[] = []
    @Persisted periodMs = 100
    @Persisted remaining = 0

    async start(periodMs: number, count: number) {
        this.periodMs = periodMs; this.remaining = count; this.ticks = []
        this.alarm.set(Date.now() + periodMs)
        return true
    }
    async onAlarm() {
        const now = Date.now()
        this.ticks = [...this.ticks, now]
        this.broadcast({ t: now, n: this.ticks.length })
        if (--this.remaining > 0) this.alarm.set(now + this.periodMs)
    }
    async stats() {
        const d = this.ticks.slice(1).map((t, i) => t - this.ticks[i]).sort((a, b) => a - b)
        const p = (q: number) => d[Math.min(d.length - 1, Math.floor(q * d.length))]
        return { ticks: this.ticks.length, remaining: this.remaining, min: d[0], p50: p(0.5), p95: p(0.95), max: d[d.length - 1] }
    }
    async ping() { return "pong:" + this.id }
}

// ---------- 3. @Interleave streaming ----------
export class Streamer extends Actor<{ name: string }, string, { chunk?: string; i?: number; done?: boolean; t: number }> {
    @Persisted text = ""
    @Persisted pings = 0
    @Interleave
    async stream(n: number, delayMs: number) {
        this.text = ""
        for (let i = 0; i < n; i++) {
            await new Promise(r => setTimeout(r, delayMs))
            const chunk = `tok${i} `
            this.text = this.text + chunk
            this.broadcast({ chunk, i, t: Date.now() })
        }
        this.broadcast({ done: true, t: Date.now() })
        return this.text
    }
    async ping() { this.pings = this.pings + 1; return { pings: this.pings, textLen: this.text.length, t: Date.now() } }
}

// ---------- 4. Fan-out ----------
export class Room extends Actor<{ i: number }, string, { seq: number; ts: number }> {
    @Ephemeral seq = 0
    async send(seq: number, ts: number) { this.broadcast({ seq, ts }); return true }
    async count() { return this.getConnectionCount() }
}

// ---------- 1b. Actor-to-actor RPC ----------
export class Caller extends Actor<null, string, string> {
    async callTicker(id: string) {
        const t0 = Date.now()
        const r = await Ticker.get(id).ping()
        return { r, ms: Date.now() - t0 }
    }
    async callSandbox(id: string) {
        const t0 = Date.now()
        const r = await Sandbox.get(id).apply({ by: 1 })
        return { r, ms: Date.now() - t0 }
    }
}
