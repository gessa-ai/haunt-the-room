// Agent Relay for the server: "the-dead" posts crowd whispers as DMs to hunters, and the presenter's observer token
// reads #hunt plus every DM for the stage feed. The workspace key never leaves this module.
import { AgentRelay, type RelayAgentClient } from "@agent-relay/sdk"
import type { HunterId, RoomId } from "../../contract/protocol.ts"
import { config, relayWorkspaceKey } from "./config.ts"
import { errorMessage, HttpError, upstream } from "./errors.ts"

const THE_DEAD = "the-dead"
const OBSERVER_TTL_MS = 3 * 60 * 60_000
const OBSERVER_REFRESH_MS = 30 * 60_000 // re-mint once the cached token has less than this left

const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code

async function post<T>(key: string, path: string, payload: unknown): Promise<T> {
  const response = await fetch(config.relayBaseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  })
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null
  if (!response.ok || !json?.data) throw new Error(`POST ${path} -> ${response.status} ${json?.error?.message ?? "no body"}`)
  return json.data
}

/** Registration is create-only: after a restart, take the name over with the workspace key and reconnect. */
async function theDeadAgent(key: string): Promise<RelayAgentClient> {
  const relay = new AgentRelay({ workspaceKey: key, baseUrl: config.relayBaseUrl })
  try {
    return await relay.workspace.register({ name: THE_DEAD, type: "agent" })
  } catch (error) {
    if (errorCode(error) !== "name_conflict") throw error
  }
  const existing = await relay.agents.get(THE_DEAD)
  const { token } = await post<{ token: string }>(key, `/v1/agents/${THE_DEAD}/takeover`, {
    expected_agent_id: existing.id,
    actor: "haunt-server",
    reason: "server restart",
    session_ref: `server-${process.pid}-${Date.now()}`,
    node_id: "haunt-server",
  })
  return relay.workspace.reconnect({ apiToken: token })
}

let dead: { key: string; ready: Promise<RelayAgentClient> } | null = null

/** "the-dead" for the current workspace key (rebuilt if the key changes, retried after a failure). */
function theDead(): Promise<RelayAgentClient> {
  const key = relayWorkspaceKey()
  let current = dead
  if (!current || current.key !== key) {
    const ready = theDeadAgent(key)
    current = dead = { key, ready }
    ready.catch(error => {
      console.error(`[relay] the-dead setup failed: ${errorMessage(error)}`)
      if (dead?.ready === ready) dead = null
    })
  }
  return upstream("relay", "the-dead setup", current.ready)
}

export async function relayReady(): Promise<void> {
  await theDead()
}

/** A crowd whisper (a lure): a DM from "the-dead" to one hunter, contract lure text only. */
export async function whisperDm(hunter: HunterId, text: string, room: RoomId, by: string, bot: boolean): Promise<void> {
  const agent = await theDead()
  try {
    await agent.sendMessage({ to: hunter, text, metadata: { kind: "lure", room, by, bot } })
  } catch (error) {
    dead = null // the identity may be gone (another lane re-registered it): register again on the next whisper
    throw new HttpError(502, "relay_failed", `DM to ${hunter} failed: ${errorMessage(error)}`)
  }
}

// ---------- observer token: #hunt and all DMs, read-only ----------

interface Observer {
  token: string
  expiresAt: number
}
let observer: { key: string; ready: Promise<Observer> } | null = null

function mint(key: string): Promise<Observer> {
  const expiresAt = Date.now() + OBSERVER_TTL_MS
  const ready = post<{ token?: string }>(key, "/v1/observer-tokens", {
    name: `haunt-feed-${new Date().toISOString()}`,
    scopes: ["stream:read", "messages:read", "threads:read", "channels:read", "dms:read"],
    filters: { channel_names: ["hunt"], include_dms: true },
    expires_at: new Date(expiresAt).toISOString(),
  }).then(minted => {
    if (!minted.token) throw new Error("observer token response carried no token")
    return { token: minted.token, expiresAt }
  })
  observer = { key, ready }
  ready.catch(error => {
    console.error(`[relay] observer token mint failed: ${errorMessage(error)}`)
    if (observer?.ready === ready) observer = null
  })
  return ready
}

/** ws://localhost:8787/v1/ws?token=ot_live_... (the presenter's Mac reaches the engine directly). */
export async function observerFeedUrl(): Promise<string> {
  const key = relayWorkspaceKey()
  const cached = observer && observer.key === key ? observer.ready : mint(key)
  let current = await upstream("relay", "minting the observer token", cached)
  if (current.expiresAt - Date.now() < OBSERVER_REFRESH_MS) {
    const next = observer && observer.key === key && observer.ready !== cached ? observer.ready : mint(key)
    current = await upstream("relay", "minting the observer token", next)
  }
  return `${config.relayBaseUrl.replace(/^http/, "ws")}/v1/ws?token=${encodeURIComponent(current.token)}`
}

// ---------- public read-only feed for /watch: one upstream observer socket, fanned out to SSE clients ----------

const FEED_TYPES = new Set(["message.created", "thread.reply", "dm.received"])
const feedClients = new Set<(frame: string) => void>()
let feedSocket: WebSocket | null = null

function openFeed(): void {
  if (feedSocket || feedClients.size === 0) return
  void observerFeedUrl().then(
    url => {
      const ws = new WebSocket(url)
      feedSocket = ws
      ws.onmessage = event => {
        const text = String(event.data)
        let type = ""
        try {
          type = (JSON.parse(text) as { type?: string }).type ?? ""
        } catch {
          return
        }
        if (FEED_TYPES.has(type)) for (const send of feedClients) send(text)
      }
      ws.onclose = () => {
        feedSocket = null
        setTimeout(openFeed, 1_000) // reconnect while anyone watches
      }
    },
    error => {
      console.error(`[watch] feed unavailable: ${errorMessage(error)}`)
      setTimeout(openFeed, 5_000)
    },
  )
}

/** Subscribe a watcher; returns the unsubscribe. The upstream socket closes when the last watcher leaves. */
export function watchFeed(send: (frame: string) => void): () => void {
  feedClients.add(send)
  openFeed()
  return () => {
    feedClients.delete(send)
    if (feedClients.size === 0 && feedSocket) feedSocket.close()
  }
}
export const feedWatchers = (): number => feedClients.size
