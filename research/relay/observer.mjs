// Mint an observer token on the local engine and print the live /v1/ws feed,
// while two agents exercise channels, DM, thread reply, reaction, and an action.
import { AgentRelay } from '@agent-relay/sdk';
import WebSocket from 'ws';
import { z } from 'zod';
const base = process.env.RELAY_BASE_URL ?? 'http://localhost:8787';
const post = async (p, body, key) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) })).json();
const ws = await post('/v1/workspaces', { name: 'research-observer-' + Date.now() });
const workspaceKey = ws.data?.api_key ?? ws.api_key;
const ot = await post('/v1/observer-tokens', { name: 'projector', scopes: ['stream:read', 'messages:read', 'channels:read', 'dms:read', 'threads:read'] }, workspaceKey);
const observerToken = ot.data?.token ?? ot.data?.secret ?? ot.token;
console.log('observer token response keys:', Object.keys(ot.data ?? ot), 'prefix', String(observerToken).slice(0, 8));
const sock = new WebSocket(`${base.replace(/^http/, 'ws')}/v1/ws?token=${observerToken}`);
sock.on('message', (d) => console.log('WS>', d.toString().slice(0, 400)));
await new Promise((r, j) => { sock.on('open', r); sock.on('error', j); });
console.log('ws open');
const relay = new AgentRelay({ workspaceKey, baseUrl: base });
const a = await relay.workspace.register({ name: 'agnes', type: 'agent' });
const b = await relay.workspace.register({ name: 'bram', type: 'agent' });
relay.addListener('*', (e) => console.log('SDK>', e.type ?? e.event ?? '?', JSON.stringify(e).slice(0, 300)));
await a.channels.create({ name: 'seance', topic: 'research' });
await b.channels.join('seance');
const m = await a.sendMessage({ to: '#seance', text: 'hello channel' });
console.log('sendMessage returned keys', Object.keys(m ?? {}));
const dm = await a.sendMessage({ to: 'bram', text: 'hello dm' });
const mid = m?.id ?? m?.message?.id ?? m?.data?.id;
try { await b.threads?.reply?.(mid, { text: 'thread reply' }); console.log('thread reply ok'); } catch (e) { console.log('thread err', e.message); }
try { await b.messages.react?.(mid, '👻'); console.log('react ok'); } catch (e) { console.log('react err', e.message); }
const h = a.registerAction({ name: 'ghost.scare', description: 'scare', input: z.object({ who: z.string() }), handler: async ({ input }) => ({ scared: input.who }) });
console.log('action handle keys', Object.keys(h));
try { const inv = await b.invokeAction?.('ghost.scare', { who: 'bram' }) ?? await h.invoke?.({ who: 'bram' }); console.log('invoke ->', JSON.stringify(inv).slice(0, 200)); } catch (e) { console.log('invoke err', e.message); }
await new Promise((r) => setTimeout(r, 3000));
const evs = await (await fetch(base + '/v1/workspace/events?since=0', { headers: { authorization: 'Bearer ' + observerToken } })).json();
console.log('durable events', (evs.data?.events ?? evs.data ?? []).length ?? JSON.stringify(evs).slice(0, 200));
process.exit(0);
