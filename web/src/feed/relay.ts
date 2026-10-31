// The Agent Relay observer feed: GET /api/relay/observer -> { wsUrl }, then the raw engine websocket.
// Raw frames (research/RELAY.md): {type:"message.created", channel, message:{id, agent_name, text, ...}, seq}.
// Sender on the raw feed = message.agent_name. DMs, thread replies and typed actions are parsed liberally.
import { HUNTERS, type HunterId } from "../../../contract/protocol"
import { presenterToken } from "./token"

export type FeedItem = (
  | { kind: "say"; key: string; from: string; channel: string; text: string; at: number; voice?: string }
  | { kind: "dm"; key: string; from: string; to: string | null; text: string; at: number; voice?: string }
  | { kind: "whisper"; key: string; to: string | null; text: string; at: number }
  | { kind: "action"; key: string; action: string; from: string | null; target: string; at: number; note?: string }
) & { seq?: number }

export interface FeedHandlers {
  item(i: FeedItem): void
  status(live: boolean, why: string): void
}
export interface FeedSource {
  start(h: FeedHandlers): void
}

const HUNTER_IDS = new Set<string>(HUNTERS.map((x) => x.id))
export const isHunter = (name: string | null): name is HunterId => name !== null && HUNTER_IDS.has(name)

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null)
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null)

function nameOf(v: unknown): string | null {
  const o = obj(v)
  return str(v) ?? (o ? str(o.name) ?? str(o.agent_name) ?? str(o.handle) : null)
}

let seq = 0
export function parseFrame(frame: Raw): FeedItem | null {
  const type = str(frame.type) ?? ""
  const now = Date.now()
  const m = obj(frame.message) ?? obj(obj(frame.data)?.message) ?? null
  if (m && /^(message|dm|thread|direct)\./.test(type) && /(created|received|reply|sent)$/.test(type)) {
    const from = str(m.agent_name) ?? nameOf(m.from) ?? str(frame.agent_name) ?? nameOf(frame.from) ?? "unknown"
    const meta = obj(m.metadata) ?? {}
    let text = str(m.text) ?? ""
    if (!text) return null
    // DMs and whispers are addressed "@name text" (coven dmText); metadata.to names the recipient
    const at = text.match(/^@([\w-]+)\s+/)
    const addressed = at ? at[1] : null
    if (at) text = text.slice(at[0].length)
    if (meta.kind === "action") {
      const action = str(meta.action) ?? "action"
      const target = str(meta.room) ?? str(meta.text) ?? ""
      const hunter = str(meta.hunter)
      return {
        kind: "action",
        key: String(m.id ?? frame.seq ?? `act-${seq++}`),
        action,
        from: isHunter(hunter) ? hunter : null,
        target,
        at: Date.now(),
        note: text,
      }
    }
    const key = String(m.id ?? frame.seq ?? `${type}-${seq++}`)
    const dm =
      meta.kind === "dm" ||
      meta.kind === "whisper" ||
      type.startsWith("dm") || type.startsWith("direct") || m.kind === "dm" || "conversation_id" in m || "conversationId" in m || "conversation_id" in frame
    const to =
      str(meta.to) ??
      addressed ??
      str(m.to_name) ?? nameOf(m.to) ?? nameOf(m.recipient) ?? str(m.recipient_name) ?? nameOf(frame.to) ?? nameOf(frame.recipient) ?? null
    if (from === "the-dead") return { kind: "whisper", key, to, text, at: now }
    const voice = str(meta.voice) ?? undefined // a pre-rendered line (web/public/audio/voice/index.json key)
    if (dm) return { kind: "dm", key, from, to, text, at: now, voice }
    const channel = str(frame.channel) ?? nameOf(m.channel) ?? str(m.channel_name) ?? "hunt"
    return { kind: "say", key, from, channel, text, at: now, voice }
  }
  if (type === "action.invoked") {
    const d = obj(frame.data) ?? frame
    const action = str(d.action) ?? str(d.action_name) ?? nameOf(d.action) ?? str(d.name) ?? "action"
    const input = obj(d.input) ?? {}
    const who = nameOf(d.agent) ?? str(d.agent_name) ?? str(d.caller)
    const target = str(input.room) ?? str(input.text) ?? ""
    return {
      kind: "action",
      key: String(d.invocation_id ?? d.invocationId ?? frame.seq ?? `act-${seq++}`),
      action: action.replace(/^.*\./, ""),
      from: isHunter(who) ? who : null,
      target,
      at: now,
    }
  }
  return null
}

/** watch = the public read-only feed (GET /api/watch/feed -> { wsUrl }) for /watch. */
// After a Relay engine restart the observer socket can reconnect yet receive nothing. While hunters should be
// talking (the stage says so per phase), 15 s of silence closes the socket; the close re-fetches a fresh token.
const SILENCE_MS = 15_000
let expectTalk = false
export function setExpectTalk(on: boolean): void {
  expectTalk = on
}

export function observerSource(watch = false): FeedSource {
  return {
    start(h) {
      let attempt = 0
      const retry = () => window.setTimeout(connect, Math.min(4_000, 250 * 2 ** attempt++))
      const connect = async (): Promise<void> => {
        let ws: WebSocket
        try {
          const res = watch
            ? await fetch("/api/watch/feed")
            : await fetch("/api/relay/observer", { headers: { "x-presenter-token": presenterToken() } })
          if (!res.ok) throw new Error(`observer HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
          const { wsUrl } = (await res.json()) as { wsUrl: string }
          ws = new WebSocket(wsUrl)
        } catch (err) {
          h.status(false, err instanceof Error ? err.message : String(err))
          retry()
          return
        }
        let lastFrame = Date.now()
        const silence = window.setInterval(() => {
          if (expectTalk && Date.now() - lastFrame > SILENCE_MS) {
            console.warn(`[feed] ${SILENCE_MS / 1000} s of silence while hunters should talk: re-opening with a fresh token`)
            ws.close()
          }
        }, 1000)
        ws.onopen = () => {
          attempt = 0
          lastFrame = Date.now()
          h.status(true, "observer open")
        }
        ws.onmessage = (e) => {
          lastFrame = Date.now()
          let data: unknown
          try {
            data = JSON.parse(String(e.data))
          } catch {
            console.error("[feed] bad frame", String(e.data).slice(0, 200))
            return
          }
          for (const f of Array.isArray(data) ? data : [data]) {
            const o = obj(f)
            const item = o ? parseFrame(o) : null
            if (item && o && typeof o.seq === "number") item.seq = o.seq
            if (item) h.item(item)
          }
        }
        ws.onclose = (e) => {
          window.clearInterval(silence)
          h.status(false, `observer closed ${e.code}`)
          retry()
        }
      }
      void connect()
    },
  }
}
