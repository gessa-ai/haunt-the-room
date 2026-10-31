// Spawn ONE Claude Code agent via @agent-relay/harnesses (broker + PTY), send it a channel message, time the reply.
import { AgentRelay } from '@agent-relay/sdk';
import { claude } from '@agent-relay/harnesses';
const base = 'http://localhost:8787';
process.env.RELAY_BASE_URL = base; // broker child inherits; picks self-host
const ws = await (await fetch(base + '/v1/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'research-harness-' + Date.now() }) })).json();
const workspaceKey = ws.data?.api_key ?? ws.api_key;
const relay = new AgentRelay({ workspaceKey, baseUrl: base });
const me = await relay.workspace.register({ name: 'host', type: 'agent' });
await me.channels.create({ name: 'seance', topic: 'harness test' });
const t0 = Date.now();
const agent = await claude.create({ relay, name: 'medium', channels: ['seance'], cwd: process.cwd() + '/claude-scratch' });
console.log('spawned in', Date.now() - t0, 'ms; agent keys', Object.keys(agent), 'id', agent.id, agent.name);
relay.addListener('*', (e) => { if (!String(e.type).startsWith('session')) console.log('EV', e.type, JSON.stringify(e).slice(0, 250)); });
const got = new Promise((r) => relay.addListener('message.created', (e) => { if (e.message?.from?.name !== 'host') r(e); }));
const t1 = Date.now();
await me.sendMessage({ to: '#seance', text: '@medium please reply in #seance with exactly: BOO from medium' });
const res = await Promise.race([got, new Promise((r) => setTimeout(() => r('TIMEOUT'), 150000))]);
console.log('REPLY after', Date.now() - t1, 'ms (total from spawn call', Date.now() - t0, 'ms):', JSON.stringify(res).slice(0, 400));
try { await agent.release?.(); console.log('released'); } catch (e) { console.log('release err', e.message); }
setTimeout(() => process.exit(0), 3000);
