// Benchmark + soak: every research/gamegen/games/*.js through the host the way a Table drives it.
// 6 players, 300 steps of 400 ms game time: ticks when due, one discovered player action per step with a
// random-ish payload, late joins up to 11 players, a leave and a rejoin, and after every state change a
// viewsFor over 12 sockets (11 seats + the stage). Run twice per game to prove determinism.
// Usage: bun test/run.ts [games dir]
import fs from "node:fs"
import path from "node:path"
import { checkModule, createHost, HostError, ViewsError, type Host } from "../src/index.ts"
import type { Json } from "../../contract/protocol.ts"

const GAMES = path.resolve(process.argv[2] ?? path.join(import.meta.dir, "../../research/gamegen/games"))
const STEPS = 300, STEP_MS = 400, SEED = 1234
const WORDS = ["pumpkin", "ghost", "Scream", "42", "🎃👻", "boo", "a", "7", ""]
const SYSTEM = new Set(["join", "leave", "tick"])

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

type Template = { type: string; fixed: Record<string, Json>; open: string[] }

/** The actions the module's own UI sends: every send({ type: "x", k: v }) in render, literal values kept,
 *  other values left open for a random-ish fill. Plus every action type and payload key reduce mentions. */
function discover(src: string) {
  const templates: Template[] = []
  for (const m of src.matchAll(/send\(\s*\{([^{}]*)\}\s*\)/g)) {
    const fixed: Record<string, Json> = {}, open: string[] = []
    let type = ""
    for (const part of (m[1] as string).split(",")) {
      const kv = /^\s*(\w+)\s*(?::\s*([\s\S]*?))?\s*$/.exec(part)
      if (!kv || !kv[1]) continue
      const k = kv[1], v = (kv[2] ?? k).trim()
      const lit = /^["'`]([^"'`]*)["'`]$/.exec(v)
      if (k === "type") { if (lit) type = lit[1] as string; continue }
      if (lit) fixed[k] = lit[1] as string
      else if (/^-?\d+(\.\d+)?$/.test(v)) fixed[k] = Number(v)
      else if (v === "true" || v === "false") fixed[k] = v === "true"
      else open.push(k)
    }
    if (type && !SYSTEM.has(type)) templates.push({ type, fixed, open })
  }
  const types = new Set<string>()
  for (const re of [/\btype\s*:\s*["'`]([\w-]{1,30})["'`]/g, /case\s+["'`]([\w-]{1,30})["'`]\s*:/g, /\.type\s*===?\s*["'`]([\w-]{1,30})["'`]/g])
    for (const m of src.matchAll(re)) if (m[1] && !SYSTEM.has(m[1])) types.add(m[1])
  const param = /function\s+reduce\s*\(\s*\w+\s*,\s*(\w+)/.exec(src)?.[1] ?? "action"
  const keys = new Set<string>()
  for (const m of src.matchAll(new RegExp(`\\b${param}\\.(\\w+)`, "g"))) if (m[1] && m[1] !== "type" && m[1] !== "playerId") keys.add(m[1])
  const literals = [...new Set([...src.matchAll(/["']([\w -]{1,16})["']/g)].map((m) => m[1] as string))]
  return { templates, types: [...types], keys: [...keys], literals }
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[Math.min(s.length - 1, Math.floor(q * s.length))] as number) : NaN }
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) }

interface RunResult {
  loadMs: number; initMs: number; reduce: number[]; view: number[]; views12: number[]
  actions: number; changed: number; ticks: number; maxStateBytes: number
  errors: Map<string, number>; finalHash: string; phases: Set<string>
}

async function play(src: string): Promise<RunResult> {
  const t0 = performance.now()
  const host: Host = await createHost(src, { seed: SEED })
  const loadMs = performance.now() - t0
  const rnd = mulberry32(SEED ^ 0x9e3779b9)
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T
  const { templates, types, keys, literals } = discover(src)
  const r: RunResult = { loadMs, initMs: 0, reduce: [], view: [], views12: [], actions: 0, changed: 0, ticks: 0, maxStateBytes: 0, errors: new Map(), finalHash: "", phases: new Set() }
  const err = (e: unknown) => {
    if (!(e instanceof HostError)) throw e
    const key = `${e.fn}/${e.kind}: ${e instanceof ViewsError ? Object.values(e.failed)[0] : e.message}`.slice(0, 110)
    r.errors.set(key, (r.errors.get(key) ?? 0) + 1)
  }
  const sockets = Array.from({ length: 11 }, (_, i) => `p${i + 1}`)
  const present = new Set(sockets.slice(0, 6))
  let now = 1_761_955_200_000
  let t = performance.now()
  let state: Json = host.init([...present].map((id) => ({ id, name: `Ghoul ${id}` })), now)
  r.initMs = performance.now() - t

  const value = (key: string): Json => {
    if (/id|target|player|who|vote|suspect|accuse/i.test(key)) return rnd() < 0.85 ? pick([...present]) : "nobody"
    const roll = rnd()
    if (roll < 0.35) return Math.floor(rnd() * 6)
    if (roll < 0.75 && literals.length) return pick(literals)
    if (roll < 0.95) return pick(WORDS)
    return pick([true, false, null, -1, 9999])
  }
  const apply = (action: { type: string; playerId?: string; [k: string]: Json | undefined }) => {
    const before = JSON.stringify(state)
    const t1 = performance.now()
    try { state = host.reduce(state, action, now) } catch (e) { err(e); return }
    r.reduce.push(performance.now() - t1)
    const after = JSON.stringify(state)
    r.maxStateBytes = Math.max(r.maxStateBytes, after.length)
    const phase = (state as { phase?: unknown }).phase
    if (phase !== undefined) r.phases.add(String(phase))
    if (after === before) return
    if (!SYSTEM.has(action.type)) r.changed++
    const t2 = performance.now()
    try { host.viewsFor(state, [...sockets, "stage"], now) } catch (e) { err(e) }
    r.views12.push(performance.now() - t2)
    const t3 = performance.now()
    try { host.view(state, pick([...present]), now) } catch (e) { err(e) }
    r.view.push(performance.now() - t3)
  }

  const tickMs = host.meta.tickMs
  let nextTick = tickMs ? now + tickMs : Infinity
  for (let step = 0; step < STEPS; step++) {
    now += STEP_MS
    while (now >= nextTick) { r.ticks++; apply({ type: "tick" }); nextTick += tickMs as number }
    if (step >= 20 && step <= 60 && step % 8 === 4) { // p7..p11 arrive; the game may refuse them if full
      const id = sockets[present.size] as string
      present.add(id); apply({ type: "join", playerId: id, name: `Late ${id}` })
    }
    if (step === 150) { present.delete("p3"); apply({ type: "leave", playerId: "p3" }) }
    if (step === 200) { present.add("p3"); apply({ type: "join", playerId: "p3", name: "Ghoul p3" }) }
    if (!types.length) continue
    const action: { type: string; playerId: string; [k: string]: Json } = { type: "", playerId: pick([...present]) }
    if (templates.length && rnd() < 0.8) { // what the UI would send
      const t = pick(templates)
      action.type = t.type
      Object.assign(action, t.fixed)
      for (const k of t.open) action[k] = value(k)
    } else { // a hostile or confused client
      action.type = pick(types)
      for (const k of keys) if (rnd() < 0.7) action[k] = value(k)
    }
    r.actions++
    apply(action)
  }
  r.finalHash = hash(JSON.stringify(state)) + ":" + host.rng.save()
  host.dispose()
  return r
}

const files = fs.readdirSync(GAMES).filter((f) => f.endsWith(".js")).sort()
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "-")
const rows: string[] = []
const notes: string[] = []
rows.push("| game | static | load ms | init ms | reduce p50/p95 ms | view p50/p95 ms | viewsFor(12) p50/p95 ms | max state KB | changed/actions | ticks | phases | determ. | host errors |")
rows.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
const all = { reduce: [] as number[], view: [] as number[], views12: [] as number[] }
let failures = 0
for (const f of files) {
  const src = fs.readFileSync(path.join(GAMES, f), "utf8")
  const name = f.replace(/\.r0\.js$/, "")
  const check = checkModule(src)
  try {
    const a = await play(src)
    const b = await play(src)
    all.reduce.push(...a.reduce); all.view.push(...a.view); all.views12.push(...a.views12)
    const errCount = [...a.errors.values()].reduce((x, y) => x + y, 0)
    rows.push(`| ${name} | ${check.ok ? "ok" : "FAIL"} | ${f1(a.loadMs)} | ${f1(a.initMs)} | ${f1(pct(a.reduce, 0.5))} / ${f1(pct(a.reduce, 0.95))} | ${f1(pct(a.view, 0.5))} / ${f1(pct(a.view, 0.95))} | ${f1(pct(a.views12, 0.5))} / ${f1(pct(a.views12, 0.95))} | ${(a.maxStateBytes / 1024).toFixed(1)} | ${a.changed}/${a.actions} | ${a.ticks} | ${a.phases.size} | ${a.finalHash === b.finalHash ? "yes" : "NO"} | ${errCount} |`)
    if (a.finalHash !== b.finalHash) failures++
    for (const [k, n] of a.errors) notes.push(`- ${name}: ${n}x ${k}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    rows.push(`| ${name} | ${check.ok ? "ok" : "FAIL"} | refused: ${msg.slice(0, 80)} | | | | | | | | | | |`)
    if (check.ok) failures++ // a statically fine module must load
  }
  if (!check.ok) notes.push(`- ${name}: checkModule: ${check.issues.join("; ").slice(0, 160)}`)
}
rows.push(`| **all** | | | | ${f1(pct(all.reduce, 0.5))} / ${f1(pct(all.reduce, 0.95))} | ${f1(pct(all.view, 0.5))} / ${f1(pct(all.view, 0.95))} | ${f1(pct(all.views12, 0.5))} / ${f1(pct(all.views12, 0.95))} | | | | | | |`)
console.log(rows.join("\n"))
console.log(`\ncalls measured: reduce ${all.reduce.length}, view ${all.view.length}, viewsFor(12) ${all.views12.length}`)
if (notes.length) console.log("\nnotes (game bugs the host caught and survived; the table keeps the previous state):\n" + notes.join("\n"))
// ---------- the host laws, by real calls ----------
const tiny = (reduce: string, view = "return { me: id, n: s.n }", top = "") => `export const meta = { title: "T", minPlayers: 1, maxPlayers: 20, tickMs: 50 };
${top}
export function init(players, ctx) { return { n: 0, r: ctx.random() }; }
export function reduce(s, a, ctx) { ${reduce} }
export function view(s, id) { ${view} }
export function render() { return Math.random() }`
const P2 = [{ id: "a", name: "A" }, { id: "b", name: "B" }]
const laws: [string, boolean, string][] = []
/** reduce must fail with `kind` matching `re`, leave the caller's state and the rng untouched, and the host usable. */
async function law(name: string, body: string, kind: string, re: RegExp, opts: { timeoutMs?: number; memoryMb?: number } = {}) {
  const h = await createHost(tiny(body), { seed: 7, ...opts })
  const s0 = h.init(P2, 1), before = JSON.stringify(s0), rng0 = h.rng.save(), t = performance.now()
  let e: unknown
  try { h.reduce(s0, { type: "x", playerId: "a" }, 2) } catch (x) { e = x }
  const ms = performance.now() - t
  const usable = JSON.stringify(h.view(s0, "a", 3)) === '{"me":"a","n":0}'
  const ok = e instanceof HostError && e.fn === "reduce" && e.kind === kind && re.test(e.message) && JSON.stringify(s0) === before && h.rng.save() === rng0 && usable
  laws.push([name, ok, `${ms.toFixed(0)} ms: ${e instanceof Error ? e.message.slice(0, 90) : "no error"}`])
  h.dispose()
}
await law("infinite loop -> timeout, context rebuilt", "while (true) {}", "timeout", /timed out after 250 ms/)
await law("loop inside try/catch still times out", "try { while (true) {} } catch (e) { return s }", "timeout", /timed out/)
await law("Math.random throws", "s.x = Math.random(); return s", "throw", /Math\.random is forbidden/)
await law("Date.now throws", "s.x = Date.now(); return s", "throw", /Date\.now is forbidden/)
await law("new Date throws", "s.x = new Date(); return s", "throw", /Date is forbidden/)
await law("Date escape via prototype.constructor blocked", "s.x = Date.prototype.constructor.now(); return s", "throw", /forbidden/)
await law("NaN in state -> invalid with path", "s.x = { y: [0, NaN] }; return s", "invalid", /\$\.x\.y\[1\] is NaN/)
await law("Map in state -> invalid", "s.m = new Map(); return s", "invalid", /\$\.m is a Map/)
await law("missing return -> invalid", "s.n++", "invalid", /returned undefined/)
await law("state over 64 KB -> invalid", "s.x = 'x'.repeat(70000); return s", "invalid", /limit 65536/)
await law("game throw names the game frames + action", "function deep(s) { return s.nope.deep }\n return deep(s)", "throw", /TypeError.*\(at deep < reduce:5\).*"type":"x"/)
await law("deep recursion -> stack overflow, no crash", "function f(n) { return f(n + 1) + 1 } return f(0)", "throw", /stack overflow/)
await law("out of memory -> memory, recovered", "let x = 'a'; while (true) x = x + x;", "memory", /out of memory/, { memoryMb: 8 })
{
  const h = await createHost(tiny("return s", "if (id === 'stage') return s.players.find(p => p.id === id).role; return { me: id }"), { seed: 1 })
  let e: unknown
  try { h.viewsFor(h.init(P2, 1), ["a", "stage", "b"], 1) } catch (x) { e = x }
  laws.push(["viewsFor isolates a failing view (ViewsError keeps the rest)", e instanceof ViewsError && Object.keys(e.views).join() === "a,b" && Object.keys(e.failed).join() === "stage", e instanceof Error ? e.message.slice(0, 90) : "no error"])
  laws.push(["meta clamped: maxPlayers 20 -> 12, tickMs 50 -> 200", h.meta.maxPlayers === 12 && h.meta.tickMs === 200, JSON.stringify(h.meta)])
  const r = ((await createHost(tiny("return s"), { seed: 1234 })).init(P2, 1) as { r: number }).r
  laws.push(["ctx.random = harness mulberry32(seed)", r === mulberry32(1234)(), `first draw ${r}`])
}
for (const [name, src] of [
  ["export default { meta, init, ... }", `const meta = { title: "D", minPlayers: 1, maxPlayers: 4 };\nfunction init() { return { n: 0 } }\nfunction reduce(s) { s.n++; return s }\nfunction view(s, id) { return { me: id, n: s.n } }\nfunction render() {}\nexport default { meta, init, reduce, view, render };`],
  ["arrow-function exports", `export const meta = { title: "A", minPlayers: 1, maxPlayers: 4 };\nexport const init = () => ({ n: 0 });\nexport const reduce = (s) => { s.n++; return s };\nexport const view = (s, id) => ({ me: id, n: s.n });\nexport const render = () => {};`],
  ["export { a as reduce } list", `const meta = { title: "L", minPlayers: 1, maxPlayers: 4 };\nfunction a() { return { n: 0 } }\nfunction b(s) { s.n++; return s }\nfunction c(s, id) { return { me: id, n: s.n } }\nfunction d() {}\nexport { meta, a as init, b as reduce,\n  c as view, d as render };`],
] as const) {
  let detail = ""
  try {
    const h = await createHost(src, { seed: 1 })
    detail = JSON.stringify(h.view(h.reduce(h.init(P2, 1), { type: "x" }, 1), "a", 1))
    laws.push([`loads ${name}`, checkModule(src).ok && detail === '{"me":"a","n":1}', detail])
  } catch (e) { laws.push([`loads ${name}`, false, String(e)]) }
}
laws.push(["checkModule refuses import", !checkModule(`import x from "y";\n${tiny("return s")}`).ok, checkModule(`import x from "y";\n${tiny("return s")}`).issues[0] ?? ""])
laws.push(["checkModule refuses >= 60 KB", !checkModule(tiny("return s") + "//" + "x".repeat(61440)).ok, "size"])

console.log("\n| law | ok | detail |\n|---|---|---|")
for (const [name, ok, detail] of laws) console.log(`| ${name} | ${ok ? "PASS" : "FAIL"} | ${detail.replace(/\|/g, "/")} |`)
const lawFails = laws.filter((l) => !l[1]).length
console.log(`\n${laws.length - lawFails}/${laws.length} laws pass; ${failures} game failures`)
process.exit(failures || lawFails ? 1 : 0)
