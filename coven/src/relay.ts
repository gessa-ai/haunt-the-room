// Agent Relay wiring for the hunt: one workspace, channel #hunt, one Relay client per agent.
// Workspace key: RELAY_WORKSPACE_KEY, else coven/.relay-key, else a new workspace on the engine (saved there).
// Agent tokens: coven/.relay-agents/<name>.token. Relay refuses to re-register a name, so a restarted process
// reconnects with the saved token. One client per agent because a DM event does not say who received it.

import path from "node:path"
import { AgentRelay, type AgentRelayAgent, type RelayAgentClient } from "@agent-relay/sdk"
import type { HunterId } from "../../contract/protocol.ts"

export const CHANNEL = "hunt"
export const COVEN_DIR = path.resolve(import.meta.dir, "..")
export const RELAY_BASE_URL = process.env.RELAY_BASE_URL ?? "http://localhost:8787"

export type AgentName = HunterId | "referee" | "the-dead"

/** A registered agent's client. At runtime it also carries the action surface; the SDK's declared type omits it. */
export type AgentClient = RelayAgentClient & Pick<AgentRelayAgent, "registerAction" | "capabilities" | "events">

export interface Agent {
  name: AgentName
  relay: AgentRelay // this agent's own client: its listeners hear only what this agent receives
  me: AgentClient
  /** Run `wire` now and again after every reconnect (listeners, actions); it returns its own undo. */
  attach(wire: (a: Agent) => () => void): void
}

async function createWorkspace(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `haunt-${Date.now()}` }),
  })
  if (!res.ok) throw new Error(`Relay workspace create failed: ${res.status} ${await res.text()}`)
  const key = ((await res.json()) as { data?: { api_key?: string } }).data?.api_key
  if (!key) throw new Error("Relay workspace create returned no api_key")
  return key
}

export async function workspaceKey(baseUrl = RELAY_BASE_URL, dir = COVEN_DIR): Promise<string> {
  const fromEnv = process.env.RELAY_WORKSPACE_KEY?.trim()
  if (fromEnv) return fromEnv
  const file = Bun.file(path.join(dir, ".relay-key"))
  if (await file.exists()) {
    const saved = (await file.text()).trim()
    if (saved) return saved
  }
  const key = await createWorkspace(baseUrl)
  await Bun.write(file, key + "\n")
  console.log(`[relay] created a workspace on ${baseUrl}; key saved to ${file.name}`)
  return key
}

const isNameConflict = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "name_conflict"

interface ConnectOpts {
  persona?: string
  baseUrl?: string
  dir?: string | undefined
}

/** Connect as `name`: reconnect with its saved token, else register it (taking the name back if the token is lost). */
export async function connectAgent(name: AgentName, opts: ConnectOpts = {}): Promise<Agent> {
  const first = await client(name, opts)
  const wires: { wire: (a: Agent) => () => void; undo: () => void }[] = []
  const agent: Agent = {
    name,
    relay: first.relay,
    me: first.me,
    attach(wire) {
      wires.push({ wire, undo: wire(agent) })
    },
  }
  reconnectors.set(agent, async () => {
    // close the old sockets first: an old client that reconnects on its own keeps the action node, and the engine
    // then refuses the new one ("provider_instance_conflict"), leaving the typed actions with no handler
    await Promise.race([agent.me.events.disconnect(), new Promise((r) => setTimeout(r, 2_000))]).catch(() => {})
    const next = await client(name, opts)
    for (const w of wires) w.undo()
    agent.relay = next.relay
    agent.me = next.me
    for (const w of wires) w.undo = w.wire(agent)
  })
  return agent
}

async function client(name: AgentName, opts: ConnectOpts): Promise<{ relay: AgentRelay; me: AgentClient }> {
  const baseUrl = opts.baseUrl ?? RELAY_BASE_URL
  const dir = opts.dir ?? COVEN_DIR
  const key = await workspaceKey(baseUrl, dir)
  const relay = new AgentRelay({
    workspaceKey: key,
    baseUrl,
    onError: (err, ctx) => console.error(`[relay] ${name} listener error (${JSON.stringify(ctx)}):`, err),
  })
  const tokenFile = Bun.file(path.join(dir, ".relay-agents", `${name}.token`))
  if (await tokenFile.exists()) {
    const [savedKey, token] = (await tokenFile.text()).trim().split("\n")
    if (savedKey === key && token) {
      try {
        return { relay, me: (await relay.workspace.reconnect({ apiToken: token })) as AgentClient }
      } catch (e) {
        console.warn(`[relay] saved token for ${name} was refused (${(e as Error).message}); registering again`)
      }
    }
  }
  const register = () => relay.workspace.register({ name, type: "agent", ...(opts.persona ? { persona: opts.persona } : {}) })
  let me: AgentClient
  try {
    me = (await register()) as AgentClient
  } catch (e) {
    if (!isNameConflict(e)) throw e
    await relay.agents.delete(name) // the name exists but its token is gone: take it back
    me = (await register()) as AgentClient
  }
  await Bun.write(tokenFile, `${key}\n${me.token}\n`)
  return { relay, me }
}

const reconnectors = new Map<Agent, () => Promise<void>>()
let suspect = false
/** Call when a send fails at the transport: the next healthy check rebuilds every client. */
export const relaySuspect = () => void (suspect = true)

/**
 * After a Relay engine restart, sends work again but listener sockets and registered actions stay dead. This
 * watches the engine (1 s) and, once it is healthy after an outage or a failed send, rebuilds every agent's client
 * from its saved token, re-attaches listeners and actions and re-joins #hunt. Retries with backoff; never throws.
 */
export function superviseRelay(agents: Agent[], log: (l: string) => void, baseUrl = RELAY_BASE_URL): () => void {
  let running = true
  let wasDown = false
  void (async () => {
    let backoff = 1_000
    while (running) {
      const healthy = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false)
      if (!healthy) {
        if (!wasDown) log(`[relay] engine at ${baseUrl} is down; waiting for it`)
        wasDown = true
      } else if (wasDown || suspect) {
        try {
          for (const a of agents) {
            await reconnectors.get(a)!()
            if (a.name !== "the-dead") await joinHunt(a)
          }
          log(`[relay] engine is back: ${agents.length} agents reconnected, listeners and actions re-attached, #${CHANNEL} re-joined`)
          wasDown = false
          suspect = false
          backoff = 1_000
        } catch (e) {
          log(`[relay] reconnect failed (${(e as Error).message}); retrying in ${backoff / 1000} s`)
          await new Promise((r) => setTimeout(r, backoff))
          backoff = Math.min(15_000, backoff * 2)
          continue
        }
      }
      await new Promise((r) => setTimeout(r, 1_000))
    }
  })()
  return () => void (running = false)
}

/** Create #hunt if missing and join it. */
export async function joinHunt(agent: Agent): Promise<void> {
  const channels = await agent.relay.channels.list()
  if (!channels.some((c) => c.name === CHANNEL)) {
    await agent.me.channels.create({ name: CHANNEL, topic: "Four exorcists hunt the room" }).catch((e: Error) => {
      if (!/exist/i.test(e.message)) throw e // another agent created it a moment ago
    })
  }
  await agent.me.channels.join(CHANNEL).catch((e: Error) => {
    if (!/already/i.test(e.message)) throw e
  })
}

/** DMs start with "@<recipient> ": a DM on the Relay feed carries only its sender, and the stage shows both. */
export const dmText = (to: AgentName, text: string) => `@${to} ${text}`
export const stripDm = (text: string) => text.replace(/^@[\w-]+\s+/, "")

/**
 * For the server (lane L5): post a crowd whisper as a DM from "the-dead" to one hunter.
 *   import { theDead } from "../../coven/src/relay.ts"
 *   const dead = await theDead(); await dead.whisper("medium", "They're all in the Crypt.")
 */
export async function theDead(): Promise<{ whisper(hunter: HunterId, text: string): Promise<void> }> {
  const agent = await connectAgent("the-dead", { persona: "The voices of the ghosts in the house." })
  return {
    async whisper(hunter, text) {
      await agent.me.sendMessage({ to: hunter, text: dmText(hunter, text), metadata: { kind: "whisper" } })
    },
  }
}
