# Terse Durable Actors: research (2026-10-31)

Repo: `~/haunted-hacks/research/terse/repo` (shallow clone). Experiments: `~/haunted-hacks/research/terse/exp`
(`src/actors.ts`, `bench1.ts`, `bench2.ts`, `bench4.ts`; durable-actors 0.14.6, local dev on :7200).
**V** means verified by running it here. **S** means read in the source but not run. **U** means unverified.

## 1. SDK surface (S, from `sdk/src/actor/*.ts`, `sdk/src/index.ts`)
- Exports: `Actor, Persisted, Ephemeral, Emittable, Interleave, Resource, Compute, unchecked, ActorInvocationError` + types.
- `class X extends Actor<Metadata, Incoming, Outgoing, Tag>`. It must extend `Actor` directly, every method must be async, and every instance field needs a decorator.
  - Hooks: `onConnect(socket)`, `onMessage(socket, msg)`, `onDisconnect(socket, code, reason, wasClean)` and `onAlarm()` (no arguments).
  - Members: `this.db` (actor-local SQLite: `exec(sql, ...binds)` and `transaction(fn)`), `this.alarm` (`get/set(tsMs)/delete`, ONE slot per actor), `this.id`, `getConnections(tag?)`, `getConnectionCount()`, `broadcast(msg, {except, tags, tagMatch:"all"|"any"})` and `setWebSocketAutoResponse({request, response})`. The auto-response answers a matching raw text frame without waking the actor, so use it for ping/pong.
  - Reserved names: `connect`, `broadcast`, `db`, `alarm` and `then`.
- `ActorSocket`: `id`, `metadata` (settable, lasts only for this connection), `tags`, `setTags(...)` (max 10), `send`, `close(code, reason)` and `reject(4003, reason)` in onConnect.
- `@Persisted`: every assignment is saved, so REASSIGN objects and arrays. `@Ephemeral` may reset between calls. `@Emittable` (on a public @Persisted field) pushes `state` / `state_update` messages to browsers. `@Resource` marks a field as an `ActorResource` with `onResume()` and `onGracefulShutdown()`.
- `@Interleave` on a method lets other calls run during its awaits. It disables rollback and `db.transaction` for the WHOLE class, so put streaming in its own actor class.
- `@Compute({cpu, memoryMiB, idleTimeoutMs, regions})` is a class decorator. The default idle eviction is 10 s.
- Backend calls: `actors.X.get(id).method(...)` (generated client, `durable-actors generate src/actors.ts`). Passing the path matters: without it, generate emitted a stale ChatRoom contract here (V).

### Actor-to-actor RPC: WORKS locally (V)
Inside an actor method, `await Ticker.get(id).ping()` returned in 70 ms the first time and 17 ms warm (`Caller` in exp/src/actors.ts).
- Mechanism (S): `static get` returns a reference that goes through `RemoteActorClient`, configured from the env var `DURABLE_ACTORS_CONTROL_PLANE_URL`. The local host injects that variable.
- Hosted (U, likely needs work): the host does not inject a project ID or secret. You would probably have to add `DURABLE_ACTORS_PROJECT_ID` and `DURABLE_ACTORS_SECRET` as deployment secrets.
- An actor calling itself without `@Interleave` will likely deadlock.

### Listing actors (S)
The generated client has no list method. Use the admin or observe API instead:
- `ControlPlaneClient.listActors()` calls `GET /v1/projects/{id}/observe/actors` (`sdk/src/cli/control-plane.ts`, exported from `durable-actors/observe`).
- CLI: `durable-actors inspect [Name/id] --json`.
- For a game lobby, a `Registry` actor that rooms call into (actor-to-actor) is simpler.

### Alarms and game ticks (V)
The local scheduler polls every **100 ms** (`src/control_plane/alarms.rs: DEFAULT_POLL_INTERVAL`; override with env `DURABLE_ACTORS_ALARM_POLL_INTERVAL_MS` on the control plane, process.rs). Re-arming with `alarm.set(now+P)` from `onAlarm`, measured over 40 ticks:

| P requested | p50 interval | p95 |
|---|---|---|
| 250 ms | 306 | 341 |
| 100 ms | 202 | 204 |
| 50 ms | 102 | 103 |

- **Fastest alarm tick is about 10 Hz (set P=50 → about 100 ms). For ~250 ms, set P≈200.**
- A tighter tick needs a loop inside the actor: `setTimeout` in an `@Interleave` method or an `ActorResource`, with the idle timeout raised via `@Compute`. This is U.

### Persist cost (V, important for ticks)
The FIRST `@Persisted` assignment in a call costs about **14 ms**; later ones in the same call cost about 0.3 ms (bench2).
- At 10 Hz, keep hot game state in `@Ephemeral` (or a module variable) and snapshot it to `@Persisted` every N ticks.

## 2. Sandboxed LLM reducer with QuickJS: WORKS (V)
- Use the **singlefile** variant (wasm inlined as base64), because the actor bundle has no wasm loader (S: esbuild, no .wasm loader in `sdk/src/compiler/actor-build.ts`):
  - `bun add quickjs-emscripten-core @jitl/quickjs-singlefile-mjs-release-sync@0.31.0`
- Result: the interrupt handler stopped `while(true){}` with `InternalError: interrupted`.
- Timing per call:
  - Module load is about 9 ms, once per worker.
  - newRuntime + newContext: 0.4 to 5 ms.
  - eval: 0.1 to 4 ms.
  - persist: about 14 ms.
  - Whole RPC from the backend: p50 18 ms, p95 24 ms over 50 calls.
- `new Function` also works (S/V) but is not a sandbox.
```ts
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core"
import singlefile from "@jitl/quickjs-singlefile-mjs-release-sync"
let qjsP: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined
const qjs = () => (qjsP ??= newQuickJSWASMModuleFromVariant(singlefile))
export class Sandbox extends Actor<null, string, string> {
  @Persisted state: unknown = { n: 0 }
  @Persisted reducer = "function reduce(s,a){ return { n: s.n + a.by } }"
  async setReducer(src: string) { this.reducer = src; return true }
  async apply(action: unknown) {
    const rt = (await qjs()).newRuntime()
    rt.setMemoryLimit(16 << 20); rt.setMaxStackSize(512 << 10)
    const deadline = Date.now() + 50; rt.setInterruptHandler(() => Date.now() > deadline)
    const vm = rt.newContext()
    try {
      const r = vm.evalCode(`${this.reducer}\nJSON.stringify(reduce(${JSON.stringify(this.state)}, ${JSON.stringify(action)}))`)
      if (r.error) { const e = vm.dump(r.error); r.error.dispose(); throw new Error("reducer error: " + JSON.stringify(e)) }
      this.state = JSON.parse(vm.getString(r.value)); r.value.dispose()
      return this.state
    } finally { vm.dispose(); rt.dispose() }
  }
}
```
On hosted, the singlefile variant should bundle like plain JS (U).

## 3. Streaming with @Interleave while other RPCs are served (V)
- 10 chunks at 100 ms each. Each `broadcast` reached the websocket **as it was sent**, with 0 to 5 ms lag; broadcasts are not buffered to the end of the call.
- 5 `ping()` RPCs during the stream each took 20 to 29 ms and were served mid-stream.
- The whole stream took 1313 ms.
```ts
export class Streamer extends Actor<{name:string}, string, {chunk?:string; i?:number; done?:boolean; t:number}> {
  @Persisted text = ""
  @Interleave async stream(n: number, delayMs: number) {
    this.text = ""
    for (let i = 0; i < n; i++) {
      await new Promise(r => setTimeout(r, delayMs))   // stands in for `for await (chunk of llm.textStream)`
      this.text = this.text + `tok${i} `; this.broadcast({ chunk: `tok${i} `, i, t: Date.now() })
    }
    this.broadcast({ done: true, t: Date.now() }); return this.text
  }
  async ping() { return { len: this.text.length } }
}
```

## 4. Fan-out (V, local, M-series Mac, one actor)
- 200 Bun websocket clients connected in 29 ms (grants in parallel).
- 20 msg/s for 10 s, sent as backend RPC `room.send(seq, ts)` → `this.broadcast`.
- **40,000/40,000 delivered. Send→receive p50 2 ms, p95 4 ms, p99 43 ms, max 70 ms. The RPC itself: p50 3 ms.**
- Socket message wire format is plain JSON: `JSON.parse(ev.data)` gives the broadcast object.

## 5. Example patterns (S; paths are relative to the repo root)
- `examples/ai-chat/src/{actors,backend}.ts`:
  - The actor only stores history (`load`, `append`). LLM streaming runs in Express via the AI SDK `streamText` → `pipeUIMessageStreamToResponse`.
  - The backend appends to the actor only after the stream completes.
  - `README.md:52-75` shows the in-actor alternative: `@Interleave onMessage` + `for await (chunk of result.textStream) { ...; this.broadcast(...) }`.
- `examples/pi/pi-durable/src/actors.ts` and `src/modal/SandboxResource.ts`:
  - `@Resource` external sandbox. It keeps its ID in its own SQLite table, and `onResume` reattaches or recreates it.
  - `@Interleave prompt()` broadcasts `{type:"ops"}` per step, then `{type:"view"}` in `finally`.
  - `submit()` returns immediately while the work keeps running in the background.
- `examples/background/background-gym/src/actors.ts`:
  - The `JobRunner` ActorResource stores jobs in SQLite. `start()` fires `void this.steps(id)` and returns.
  - `onResume` restarts unfinished jobs.
  - Catch errors inside the loop: an unhandled rejection kills the worker.
- `examples/documents/src/{actors,backend,collaboration}.ts`:
  - Generic `POST /api/socket/:actorName/:actorId` → `actors[name].prepareWebsocket({actorId, metadata})` with `Cache-Control: no-store`.
  - The browser opens `new WebSocket(grant.websocketUrl)`. `onConnect` sends a snapshot, and `onMessage` merges a Yjs update and broadcasts it.
- `@Emittable` example: `examples/bank-typescript/src/actors.ts`, plus `docs/reference/typescript-guide.md:138-188`.

## 6. Observability dashboard (S, U)
- Local: `npx durable-actors observe` (from the project dir, against the running dev server). It serves the UI on `127.0.0.1:<random port>` and proxies `/api/observe`; dev needs no secret.
- What it shows (`packages/observer-ui/src`):
  - an overview, actor types and instances, and persisted state with version diffs
  - a request waterfall where interleaved calls overlap
  - websocket timelines, residency and metrics.
  - This is good for projecting on stage, but I did not open it.
- Hosted: the observer is an embeddable React package (`durable-actors-observer`, `HttpObserverClient`) that your backend proxies to `/v1/projects/{id}/observe/*` with the admin secret. The repo documents no hosted dashboard URL (U: check the terse-cli or docs.useterse.ai).

## 7. Hosted deploy (S, mostly U)
- This repo has no `deploy` command (CLI: init, dev, generate, inspect, observe, start). Deploy is `PUT /v1/projects/{id}/deployment`; `terse-cli` 0.14.9 wraps it (not in the repo, unverified).
- Bundle: esbuild produces one ESM `actors.mjs` with `durable-actors` external.
  - Loaders: ts/tsx/js/json/.sql. No wasm or asset loader, so use inlined-wasm packages.
  - No size limit was found; the only check rejects an empty bundle.
  - Limits: 125 to 4000 millicores CPU, 256 to 4096 MiB memory (`docs/reference/configuration.md:57-60`).
- Secrets: hosted deployments use `secretRefs`, which become worker `process.env` (`sdk/src/host/actor-worker.ts:48`). Locally the host inherits the parent env except `DURABLE_ACTORS_*`, so the project `.env` reaches the actor.
- Websocket grant (V locally): `prepareWebsocket` → `{ websocketUrl, homeRegion, connectByMs }`.
  - The URL here was `ws://127.0.0.1:7200/v1/socket?<token>`. Hosted it is `wss://...` (U).
  - The URL is a bearer credential: connect before `connectByMs`, and never cache it.
