# Agent Relay research (2026-10-31)

Scripts: `~/haunted-hacks/research/relay/` (`observer.mjs`, `invoke-test.mjs`, `bun-test.mjs`, `harness.mjs`, logs). Repo clone: `research/relay/repo` (v15.0.1). Engine: local relaycast on :8787 (not ours, untouched; we only created workspaces).

## 1. SDK surface (@agent-relay/sdk 15.0.1), all VERIFIED against :8787

```js
import { AgentRelay } from '@agent-relay/sdk';
// workspace: POST /v1/workspaces {name} -> data.api_key (rk_live_*)
const relay = new AgentRelay({ workspaceKey, baseUrl: 'http://localhost:8787' });
// other options: observerToken (read-only mode), sinceSeq/onCursor (resume), onError, retryPolicy
const a = await relay.workspace.register({ name: 'agnes', type: 'agent' }); // agent client, own at_live_* token
await a.channels.create({ name: 'seance', topic: '...' });  await b.channels.join('seance');
const m = await a.sendMessage({ to: '#seance', text: 'hi' });   // channel; m.id
await a.sendMessage({ to: 'bram', text: 'hi' });                // DM (bare name)
await relay.messages.reply({ from: b, messageId: m.id, text: 'thread reply' }); // thread (NOT b.threads.reply(id,{}))
await b.messages.react(m.id, '👻');                               // reaction
```

Listener events (`relay.addListener(name | 'prefix.*' | '*', fn)`, fans in over all registered agents):
- `message.created` -> `{ type, message: { id, kind:'channel', text, from:{id,name}, channel:{name}, mode, metadata, blocks, attachments, reactions, mentions }, envelope:{ from:{...} } }`. **Sender = `e.message.from.name`** (also `e.envelope.from`). The old spike's `envelope.from.handle` path is not the reliable one; use `from.name`.
- `dm.received` -> same `message` shape with `kind:'dm'`, `conversationId`.
- `thread.reply` -> `message.kind:'thread_reply'`.
- `message.reacted` -> `{ messageId, emoji, agentName, action:'added' }`.
- `message.read` -> `{ messageId, agentName, readAt }`.
- `action.invoked` / `action.completed` -> `{ action, agent:{name}, input, output, at }`.
- Harness agents also emit `turn.started`, `agent.activity.changed` (`thinking`/idle), session events.

Actions (fire-and-forget; result arrives as `action.completed`, not inline):
```js
const h = a.registerAction({ name: 'ghost.scare', description: '...', input: z.object({ who: z.string() }),
  handler: async ({ input, agent }) => ({ scared: input.who }) });   // h: {invoked, completed, failed, denied, unregister}
await b.capabilities.invoke('ghost.scare', { who: 'bram' });         // -> { invocationId, actionName, handlerAgentId, ... }
```
Quirk (verified): handler's `agent.name` / event `agent.name` came back as `"node"`, not the caller. Do not rely on it for caller identity.

### Observer token + live feed (VERIFIED, `observer.mjs`)
```js
const ot = await post('/v1/observer-tokens', { name: 'projector',
  scopes: ['stream:read','messages:read','channels:read','dms:read','threads:read'] }, workspaceKey); // Bearer rk_live_*
const token = ot.data.token;                       // ot_live_*
const ws = new WebSocket(`ws://localhost:8787/v1/ws?token=${token}`);
ws.onmessage = (e) => console.log(e.data);
```
Raw WS frame shape (different from SDK shape!): `{"type":"message.created","channel":"seance","message":{"id","agent_id","agent_name":"agnes","text",...},"seq":7}`; also `channel.created`, `member.joined`. **Sender on the raw feed = `message.agent_name`**. Every frame has a `seq`; durable replay via `GET /v1/workspace/events?since=<seq>` (observer token works).
- DMs and reactions did NOT appear on the raw feed with default filters. Filters exist on the token: `filters: { include_dms, channel_names, agent_ids, event_types }` (pass `include_dms: true` to see DMs; not tested).
- Alternative: `new AgentRelay({ observerToken, baseUrl })` then `relay.addListener(...)` gives SDK-shaped events read-only.

### Browser direct subscribe: YES (VERIFIED headers, source-read for WS)
- REST: hono `cors()` default, `access-control-allow-origin: *`, preflight allows `authorization,content-type` (curl-verified).
- WS: the Node entrypoint's upgrade handler checks only path + token, no Origin check (source: `@relaycast/engine/dist/entrypoints/node.js`). A static page can do `new WebSocket(ENGINE_WS + '/v1/ws?token=ot_live_...')` directly. Mint the token server-side; never put `rk_live_*` in a page.

## 2. Bun / non-Node runtimes: WORKS (VERIFIED)
`bun bun-test.mjs` (Bun 1.4.4): register two agents, channel send, listener receives `bun-a: hello from Bun 1.4.4`. SDK deps are only `@relaycast/sdk`, `@relaycast/types`, `zod`; zero `node:` imports in `@agent-relay/sdk/dist` or `@relaycast/sdk/dist`; transport is fetch + WebSocket. No broker binary needed for plain messaging. `engines: node>=22` is declarative only. A Bun durable actor can embed it (not tested inside Terse specifically). Harnesses (section 3) are a different story: they need the native broker binary + local CLIs, so Node/Bun on a real machine only.

## 3. Harnesses: real local CLI processes in a PTY (VERIFIED, `harness.mjs`)
`claude = defineManagedHarness('claude', { runtime:'pty', command:'claude' })`. `claude.create({ relay, name, channels, cwd })`:
1. Starts one Rust broker per AgentRelay (`@agent-relay/broker-darwin-arm64/bin/agent-relay-broker init`), env `RELAY_API_KEY=<workspaceKey>`; it picks the server from `RELAYCAST_BASE_URL`/`RELAY_BASE_URL` (set `process.env.RELAY_BASE_URL` before create or it goes hosted).
2. Broker runs `agent-relay-broker pty --agent-name medium claude -- --dangerously-skip-permissions --mcp-config {agent-relay mcp server with RELAY_AGENT_TOKEN, RELAY_API_KEY, RELAY_BASE_URL}`. Messages are injected into the PTY as new turns; Claude replies through the `agent-relay mcp` tools.
3. **Requires the `agent-relay` CLI on PATH** (or `AGENT_RELAY_MCP_COMMAND`): first run failed with "Agent Relay MCP executable not found". Fix: `npm i agent-relay@15` and `PATH=$PWD/node_modules/.bin:$PATH node harness.mjs`.

Result: spawn call returned in **2.3 s**; after posting `@medium please reply ... BOO from medium` to #seance, Claude's reply `BOO from medium` arrived in **7.9 s** (10.2 s from spawn). Reply event carries `metadata.session_ref` (Claude session id).
**Cleanup gotcha:** `agent.release()` resolved but the broker, PTY, `claude` and `agent-relay mcp` processes kept running after the Node parent exited (orphaned). Kill them explicitly (we did). Note the spawned Claude runs with `--dangerously-skip-permissions` in `cwd`; sandbox the folder.
`codex.create` is the same path with `command:'codex'`. Non-PTY `runtime:'native'` uses `@ai-sdk/harness-*` adapters (pi, deepagents are native-only).

## 4. Hosted vs self-host (source-read, NOT run)
- `init --hosted` creates a workspace on `https://armadillo.agentrelay.com` (or `https://cast.agentrelay.com` if the Agent Relay desktop app/core is present), saves it as the project workspace, configures message injection into local Claude Code/Codex, and prints `npx -y agent-relay@next init --key 'rk_live_...'` to share privately. Keys get bound to their origin in `$AGENT_RELAY_HOME/relaycast-origins.json`; the broker fail-closes if bindings conflict.
- Self-host: `@relaycast/engine` is the same engine (Node + SQLite, :8787). It can sit behind a tunnel (cloudflared/ngrok) for phones/browsers: CORS is `*`, WS has no Origin check, and auth is token-only. Tradeoffs: anyone with the URL can `POST /v1/workspaces` (no admin auth seen), so for a public demo hand out only observer tokens, and expect `wss://` through the tunnel. Not tunnel-tested here.

## 5. Projector-worthy
- Hosted observer dashboard: `https://agentrelay.com/observer?key=ot_live_...` (CLI `agent-relay observer`, MCP `get_observer_url`). It takes only `key`, so it likely reads the hosted service, not our localhost engine (unverified). For a self-host demo, build a tiny static page on the raw `/v1/ws` feed (shape above): channel lanes, `agent_name` bubbles, `seq` counter.
- Live agent state: `agent.activity.changed` (`thinking`/idle) and `turn.started` from harness agents make a good "who is thinking" board.
- Actions as visible beats: `action.invoked` -> `action.completed` with input/output.
