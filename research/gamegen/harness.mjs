// Playtester for the gamegen contract (CONTRACT.md). Usage: node harness.mjs <game.js> [--seed N] [--json]
import vm from "node:vm";
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const STEPS = 200, STEP_MS = 400, CALL_TIMEOUT_MS = 250, MAX_STATE_BYTES = 64 * 1024;
const WORDS = ["pumpkin", "ghost", "Scream", "42", "🎃👻", "🧟", "Halloween", "boo", "a", "🦇🕸️🕯️", "Freddy", "7"];
const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "w", "a", "s", "d"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function toScript(src) {
  let s = src;
  s = s.replace(/^\s*export\s+default\s+/gm, "const __default = ");
  s = s.replace(/\bexport\s+(async\s+)?function\b/g, (_, a) => (a || "") + "function");
  s = s.replace(/\bexport\s+(const|let|var|class)\b/g, "$1");
  s = s.replace(/^\s*export\s*\{[^}]*\}\s*;?/gm, "");
  const pick = (n) => `${n}: typeof ${n} !== "undefined" ? ${n} : undefined`;
  return `(function(){\n${s}\n;return { ${["meta", "init", "reduce", "view", "render"].map(pick).join(", ")} };})()`;
}

// JSON-cleanliness walk that works across realms.
function jsonProblem(v, path = "$", seen = new Set()) {
  if (v === null) return null;
  const t = typeof v;
  if (t === "string" || t === "boolean") return null;
  if (t === "number") return Number.isFinite(v) ? null : `${path} is ${v}`;
  if (t === "undefined") return `${path} is undefined`;
  if (t !== "object") return `${path} is a ${t}`;
  if (seen.has(v)) return `${path} is a cycle`;
  seen.add(v);
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const p = jsonProblem(v[i], `${path}[${i}]`, seen); if (p) return p; } seen.delete(v); return null; }
  const proto = Object.getPrototypeOf(v);
  if (proto !== null && Object.getPrototypeOf(proto) !== null) return `${path} is a ${v.constructor?.name || "non-plain object"}`;
  for (const k of Object.keys(v)) { if (v[k] === undefined) continue; const p = jsonProblem(v[k], `${path}.${k}`, seen); if (p) return p; }
  seen.delete(v);
  return null;
}

function makeServer(code) {
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {}, debug() {} } });
  vm.runInContext(`Math.random = () => { throw new Error("Math.random is forbidden on the server: use ctx.random()"); };
    globalThis.Date = new Proxy(Date, { construct() { throw new Error("Date is forbidden on the server: use ctx.now"); }, apply() { throw new Error("Date is forbidden on the server: use ctx.now"); }, get(t, k) { if (k === "now") return () => { throw new Error("Date.now is forbidden on the server: use ctx.now"); }; return t[k]; } });
    globalThis.setTimeout = globalThis.setInterval = undefined;`, context);
  const mod = vm.runInContext(toScript(code), context, { timeout: 1000, filename: "game.js" });
  const call = (name, args) => {
    context.__fn = mod[name]; context.__args = args;
    return vm.runInContext("__fn(...__args)", context, { timeout: CALL_TIMEOUT_MS });
  };
  return { mod, call };
}

function makeClient(code, errors, pid) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { const m = String(e?.message || e); if (!/Not implemented: (navigation|HTMLFormElement|window\.scrollTo|HTMLMediaElement)/.test(m)) errors.push(`render async error (${pid}): ${m}`); });
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const listened = new Map(); // element -> Set(types)
  let globalListeners = 0;
  const orig = w.EventTarget.prototype.addEventListener;
  w.EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (this === w || this === w.document || this === w.document.body) globalListeners++;
    if (!listened.has(this)) listened.set(this, new Set());
    listened.get(this).add(type);
    return orig.call(this, type, fn, opts);
  };
  w.alert = w.confirm = w.prompt = () => {};
  const mod = w.eval(toScript(code));
  return { dom, w, mod, root: w.document.getElementById("root"), listened, get globalListeners() { return globalListeners; } };
}

function controlsOf(client) {
  const { root, listened, w } = client;
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.disabled) continue;
    const types = listened.get(el);
    const tag = el.tagName;
    if (tag === "BUTTON" || (tag === "INPUT" && /^(button|submit)$/i.test(el.type)) || el.onclick || el.onpointerdown || el.ontouchstart || (types && [...types].some((t) => /click|pointer|touch|mouse/.test(t)))) out.push({ el, kind: "tap", types });
  }
  for (const target of [w, w.document, w.document.body, root]) {
    const types = listened.get(target);
    if (types && [...types].some((t) => /key/.test(t))) out.push({ el: target, kind: "key", types });
  }
  return out;
}

function press(client, c, rnd) {
  const { w, root } = client;
  for (const inp of root.querySelectorAll("input, textarea, select")) {
    if (inp.tagName === "SELECT") { if (inp.options.length) inp.selectedIndex = Math.floor(rnd() * inp.options.length); }
    else if (/^(checkbox|radio)$/i.test(inp.type)) inp.checked = rnd() < 0.5;
    else if (/^(number|range)$/i.test(inp.type)) inp.value = String(Math.floor(rnd() * 10));
    else if (!/^(button|submit)$/i.test(inp.type)) inp.value = WORDS[Math.floor(rnd() * WORDS.length)];
    inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  }
  if (c.kind === "key") {
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    const t = c.types.has("keydown") ? "keydown" : c.types.has("keyup") ? "keyup" : "keypress";
    c.el.dispatchEvent(new w.KeyboardEvent(t, { key, bubbles: true }));
    return;
  }
  const types = c.types || new Set();
  if (types.has("click") || c.el.onclick || c.el.tagName === "BUTTON" || c.el.tagName === "INPUT") { c.el.click(); return; }
  const t = [...types].find((x) => /pointerdown|touchstart|mousedown|pointerup|touchend|mouseup/.test(x)) || "click";
  c.el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true }));
}

export function runOnce(code, seed = 1234, sharedServer = null) {
  const errors = [], warnings = [];
  const stats = { steps: 0, uiActions: 0, uiActionsChangedState: 0, actionTypes: {}, ticks: 0, renders: 0, emptyControlSteps: 0, phases: new Set(), garbage: 0 };
  const trace = [];
  if (/^\s*import\s/m.test(code)) return { errors: ["module uses import; the contract forbids imports"], warnings, stats, trace };
  let server;
  try { server = sharedServer || makeServer(code); } catch (e) { return { errors: [`module failed to load on the server: ${e.message}`], warnings, stats, trace }; }
  const { mod, call } = server;
  for (const n of ["init", "reduce", "view", "render"]) if (typeof mod[n] !== "function") errors.push(`missing export function ${n}`);
  const meta = mod.meta;
  if (!meta || typeof meta !== "object") errors.push("missing export meta");
  else {
    if (!(meta.minPlayers >= 1 && meta.minPlayers <= 4)) errors.push(`meta.minPlayers must be 1..4 (got ${meta.minPlayers})`);
    if (!(meta.maxPlayers >= 4)) errors.push(`meta.maxPlayers must be >= 4 (got ${meta.maxPlayers})`);
    if (meta.tickMs != null && !(meta.tickMs >= 50 && meta.tickMs <= 5000)) errors.push(`meta.tickMs must be 50..5000 (got ${meta.tickMs})`);
  }
  if (errors.length) return { errors, warnings, stats, trace };

  const rngGame = mulberry32(seed), rngBot = mulberry32(seed ^ 0x9e3779b9);
  let now = 1_761_955_200_000; // fixed epoch
  const ctx = () => ({ now, random: rngGame });
  const all = [{ id: "p1", name: "Vlad" }, { id: "p2", name: "Morticia" }, { id: "p3", name: "Pumpkinhead" }, { id: "p4", name: "Wednesday" }, { id: "p5", name: "Late Larry" }];
  const present = new Set(["p1", "p2", "p3", "p4"]);
  let state;
  const fail = (m) => { if (errors.length < 12 && !errors.includes(m)) errors.push(m); };
  const checkState = (s, where) => {
    if (s === undefined || s === null || typeof s !== "object") { fail(`${where} returned ${s === null ? "null" : typeof s} instead of the state object`); return false; }
    const p = jsonProblem(s); if (p) { fail(`${where}: state not plain JSON: ${p}`); return false; }
    const bytes = JSON.stringify(s).length; if (bytes > MAX_STATE_BYTES) { fail(`${where}: state is ${bytes} bytes (> 64 KB)`); return false; }
    return true;
  };
  try { state = call("init", [all.slice(0, 4).map((p) => ({ ...p })), ctx()]); } catch (e) { return { errors: [`init threw: ${e.message}`], warnings, stats, trace }; }
  if (!checkState(state, "init")) return { errors, warnings, stats, trace };
  state = structuredClone(state);
  if (state.phase !== undefined) stats.phases.add(String(state.phase));

  const clients = {};
  for (const p of all) { try { clients[p.id] = makeClient(code, errors, p.id); } catch (e) { fail(`module failed to load in the browser: ${e.message}`); return { errors, warnings, stats, trace }; } }
  const lastView = {};
  let pendingSends = [];

  const apply = (action, source) => {
    const before = JSON.stringify(state);
    let next;
    try { next = call("reduce", [structuredClone(state), structuredClone(action), ctx()]); }
    catch (e) { fail(`reduce threw on ${JSON.stringify(action).slice(0, 160)} (${source}): ${e.message}${/Script execution timed out/.test(e.message) ? " (infinite loop or too slow)" : ""}`); return false; }
    if (!checkState(next, `reduce(${action.type})`)) return false;
    state = structuredClone(next);
    if (state.phase !== undefined) stats.phases.add(String(state.phase));
    const after = JSON.stringify(state);
    trace.push(after.length + ":" + hash(after));
    return before !== after;
  };

  const renderAll = () => {
    for (const pid of present) {
      let v;
      try { v = call("view", [structuredClone(state), pid]); } catch (e) { fail(`view threw for ${pid}: ${e.message}`); continue; }
      const p = jsonProblem(v); if (p) { fail(`view(${pid}) not plain JSON: ${p}`); continue; }
      const vj = JSON.stringify(v);
      if (lastView[pid] === vj) continue;
      lastView[pid] = vj;
      const c = clients[pid];
      const send = (a) => { if (a && typeof a === "object" && typeof a.type === "string") pendingSends.push({ ...JSON.parse(JSON.stringify(a)), playerId: pid }); else fail(`render sent a non-action: ${String(JSON.stringify(a)).slice(0, 80)}`); };
      try { c.mod.render(c.w.eval(`(${vj})`), send, c.root); stats.renders++; } catch (e) { fail(`render threw for ${pid} in phase ${v?.phase}: ${e.message}`); }
    }
  };

  const flushSends = (source) => {
    let guard = 0;
    while (pendingSends.length && guard++ < 50) {
      const a = pendingSends.shift();
      if (["join", "leave", "tick"].includes(a.type)) { warnings.push(`client sent system action ${a.type}; server drops it`); continue; }
      stats.uiActions++; stats.actionTypes[a.type] = (stats.actionTypes[a.type] || 0) + 1;
      if (apply(a, source)) stats.uiActionsChangedState++;
      renderAll();
    }
    pendingSends = [];
  };

  renderAll(); flushSends("render-on-mount");
  let nextTick = meta.tickMs ? now + meta.tickMs : Infinity;
  const seenTypes = new Set();
  for (let step = 0; step < STEPS && errors.length === 0; step++) {
    stats.steps++;
    now += STEP_MS;
    while (now >= nextTick) { stats.ticks++; apply({ type: "tick" }, "tick"); nextTick += meta.tickMs; renderAll(); flushSends("tick"); }
    if (step === 40 && meta.maxPlayers >= 5) { present.add("p5"); apply({ type: "join", playerId: "p5", name: "Late Larry" }, "join"); renderAll(); }
    if (step === 100) { present.delete("p3"); apply({ type: "leave", playerId: "p3" }, "leave"); delete lastView.p3; renderAll(); }
    if (step === 140) { present.add("p3"); apply({ type: "join", playerId: "p3", name: "Pumpkinhead" }, "rejoin"); renderAll(); }
    if (step % 10 === 5) { // garbage from a hostile client
      stats.garbage++;
      const t = [...seenTypes][Math.floor(rngBot() * Math.max(1, seenTypes.size))] || "noop";
      const junk = [{ type: "__bogus__", playerId: "p1" }, { type: t, playerId: "ghost-not-in-game" }, { type: t, playerId: "p2", value: null, choice: -1, index: 9999, targetId: "nobody", answer: { x: 1 }, x: NaN, y: "1e309" }, { type: t, playerId: "p1", payload: undefined }][Math.floor(rngBot() * 4)];
      const before = JSON.stringify(state);
      apply(JSON.parse(JSON.stringify(junk)), "garbage");
      if (junk.type === "__bogus__" && JSON.stringify(state) !== before) warnings.push("unknown action type changed state");
      renderAll();
    }
    if (Object.values(clients).some((c) => c.globalListeners > 50)) break; // leak, reported below
    const ids = [...present];
    const pid = ids[Math.floor(rngBot() * ids.length)];
    const c = clients[pid];
    const controls = controlsOf(c);
    if (!controls.length) { stats.emptyControlSteps++; continue; }
    const ctl = controls[Math.floor(rngBot() * controls.length)];
    try { press(c, ctl, rngBot); } catch (e) { fail(`UI handler threw for ${pid}: ${e.message}`); }
    for (const a of pendingSends) seenTypes.add(a.type);
    flushSends(`ui:${pid}`);
  }
  for (const [pid, c] of Object.entries(clients)) { if (c.globalListeners > 6) fail(`render added ${c.globalListeners} listeners to document/window/body for ${pid} (leak; attach listeners only inside root)`); c.w.close(); }
  if (errors.length === 0 && stats.uiActionsChangedState === 0) fail(`unplayable: bots pressed UI ${stats.steps - stats.emptyControlSteps} times, ${stats.uiActions} actions sent, none changed the state`);
  stats.phases = [...stats.phases];
  return { errors, warnings: [...new Set(warnings)], stats, trace, finalState: state };
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

export function playtest(code, seed = 1234) {
  const t0 = performance.now();
  let shared = null; try { shared = makeServer(code); } catch {}
  const a = runOnce(code, seed, shared);
  if (a.errors.length === 0) {
    const b = runOnce(code, seed, shared); // warm module: catches module-level mutable state leaking between rooms
    if (b.errors.length) a.errors.push(...b.errors.map((e) => `second run: ${e}`));
    else if (a.trace.join() !== b.trace.join()) {
      const i = a.trace.findIndex((x, k) => x !== b.trace[k]);
      a.errors.push(`non-deterministic: same seed and inputs diverged at transition ${i} of ${a.trace.length}`);
    }
  }
  return { pass: a.errors.length === 0, errors: a.errors, warnings: a.warnings, stats: a.stats, ms: Math.round(performance.now() - t0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const seed = Number(process.argv[process.argv.indexOf("--seed") + 1]) || 1234;
  const r = playtest(fs.readFileSync(file, "utf8"), seed);
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else { console.log(r.pass ? "PASS" : "FAIL", file, `${r.ms}ms`); for (const e of r.errors) console.log("  error:", e); for (const w of r.warnings) console.log("  warn:", w); console.log("  stats:", JSON.stringify(r.stats)); }
  process.exit(r.pass ? 0 : 1);
}
