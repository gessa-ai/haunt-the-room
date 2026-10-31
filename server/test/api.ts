// Smoke script against a running server: join -> websocket through /ws -> you + phase; presenter guard; presenter
// start -> wait for the hide beat -> lure the Crypt -> DM from "the-dead" on the observer feed; second lure in the
// beat refused by the House; stats; config.
// Usage: API_BASE=http://localhost:3310 bun test/api.ts  (PRESENTER_TOKEN and the relay key as the server resolves them)
import { AgentRelay } from "@agent-relay/sdk"
import { HUNTERS, ROOMS, TIMING } from "../../contract/protocol.ts"
import { config, relayWorkspaceKey } from "../src/config.ts"

const BASE = process.env.API_BASE ?? "http://localhost:3310"
const TOKEN = config.presenterToken ?? ""
const t0 = Date.now()
const log = (step: string, detail: unknown) => console.log(`+${String(Date.now() - t0).padStart(5)}ms  ${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`)
function check(ok: unknown, what: string): asserts ok {
  if (!ok) (console.error(`FAIL: ${what}`), process.exit(1))
}

async function call(method: "GET" | "POST", path: string, payload?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(payload === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  return { status: response.status, json: (await response.json()) as any, headers: response.headers }
}
const presenter = { "x-presenter-token": TOKEN }

/** Open a websocket, collect parsed frames until `done` or the timeout; `onOpen` runs once connected. */
function frames(url: string, done: (got: any[]) => boolean, onOpen?: () => void, timeoutMs = 8000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const got: any[] = []
    const ws = new WebSocket(url)
    const timer = setTimeout(() => (ws.close(), resolve(got)), timeoutMs)
    ws.onopen = () => onOpen?.()
    ws.onerror = () => (clearTimeout(timer), reject(new Error(`websocket error on ${url.replace(/\?.*/, "?...")}`)))
    ws.onmessage = event => {
      got.push(JSON.parse(String(event.data)))
      if (done(got)) (clearTimeout(timer), ws.close(), resolve(got))
    }
  })
}

const health = await call("GET", "/api/health")
log("health", health.json)
check(health.status === 200, "health is 200")

const ghostId = crypto.randomUUID()
const join = await call("POST", "/api/join", { ghostId })
log("join", { ghost: join.json.ghost, websocketUrl: String(join.json.websocketUrl).replace(/\?.*/, "?<grant>"), connectByMs: join.json.connectByMs })
check(join.status === 200 && join.json.ghost?.id === ghostId, "join returns the ghost")
check(new URL(join.json.websocketUrl).pathname === "/ws" && new URL(join.json.websocketUrl).host === new URL(BASE).host, "grant points at our /ws door")
check(typeof join.json.ghostToken === "string" && join.json.ghostToken.length > 10, "join returns a ghostToken")
// The phone socket stays open: only ghosts in the house may whisper.
const phone: any[] = []
const phoneWs = new WebSocket(join.json.websocketUrl)
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("phone socket: no you + phase within 8 s")), 8000)
  phoneWs.onclose = () => console.log("(phone socket closed)")
  phoneWs.onerror = () => reject(new Error("phone socket error"))
  phoneWs.onmessage = event => {
    phone.push(JSON.parse(String(event.data)))
    if (phone.some(f => f.t === "you") && phone.some(f => f.t === "phase")) (clearTimeout(timer), resolve(null))
  }
})
log("phone socket", phone.map(f => (f.t === "you" ? `you(${f.name} in ${f.room})` : f.t === "phase" ? `phase(${f.phase})` : f.t)).join(", "))

const botNoToken = await call("POST", "/api/join", { ghostId: `bot-${Date.now()}`, bot: true })
log("bot join without token", `${botNoToken.status} ${botNoToken.json.error}`)
check(botNoToken.status === 403, "bot join needs the presenter token")
const viaTunnel = await call("POST", "/api/presenter/start", undefined, { ...presenter, "cf-connecting-ip": "203.0.113.9" })
log("presenter via tunnel header", `${viaTunnel.status} ${viaTunnel.json.error}`)
check(viaTunnel.status === 403, "presenter refuses tunnel requests even with the token")
const noToken = await call("POST", "/api/presenter/start")
check(noToken.status === 403, `presenter without token is 403 (got ${noToken.status})`)
const start = await call("POST", "/api/presenter/start", undefined, presenter)
log("presenter start", start.json)
check(start.status === 200 && start.json.ok, "presenter start works with the token")
const stage = await call("POST", "/api/stage/grant", undefined, presenter)
check(stage.status === 200 && new URL(stage.json.websocketUrl).pathname === "/ws", `stage grant: ${JSON.stringify(stage.json)}`)

// The hunters (lane L3) must exist to receive DMs; in a fresh workspace this registers stand-ins.
const relay = new AgentRelay({ workspaceKey: relayWorkspaceKey(), baseUrl: config.relayBaseUrl })
for (const h of HUNTERS) await relay.workspace.register({ name: h.id, type: "agent" }).catch(() => undefined)

const observer = await call("GET", "/api/relay/observer", undefined, presenter)
check(observer.status === 200, `observer: ${JSON.stringify(observer.json)}`)
log("observer wsUrl", String(observer.json.wsUrl).replace(/token=.*/, "token=ot_..."))
const forged = await call("POST", "/api/whisper", { ghostId, ghostToken: "x".repeat(22), room: "crypt" })
log("whisper with a forged token", `${forged.status} ${forged.json.error}`)
check(forged.status === 403, "forged ghostToken is refused")
const lurker = await call("POST", "/api/join", { ghostId: crypto.randomUUID() }) // joined, never connected
const offline = await call("POST", "/api/whisper", { ghostId: lurker.json.ghost.id, ghostToken: lurker.json.ghostToken, room: "crypt" })
log("whisper from a ghost not in the house", `${offline.status} ${offline.json.error}`)
check(offline.status === 409, "only online ghosts may whisper")
// Lures are allowed only during hide: wait for the phone to hear the first beat (after the intro).
const hideBy = Date.now() + TIMING.introMs + 15_000
while (!phone.some(f => f.t === "phase" && f.phase === "hide") && Date.now() < hideBy) await Bun.sleep(100)
log("phase", phone.filter(f => f.t === "phase").map(f => f.phase).join(" -> "))
check(phone.some(f => f.t === "phase" && f.phase === "hide"), "the round reached the hide beat")
const crypt = ROOMS.find(r => r.id === "crypt")!.name
let whisper: Promise<{ status: number; json: any }> | null = null
const feed = await frames(
  observer.json.wsUrl,
  got => got.some(f => f.type === "dm.received" && String(f.message?.text).includes(crypt)),
  () => (whisper = call("POST", "/api/whisper", { ghostId, ghostToken: join.json.ghostToken, room: "crypt" })),
)
const dm = feed.find(f => f.type === "dm.received" && String(f.message?.text).includes(crypt))
const whispered = await whisper!
log("whisper", whispered.json)
check(whispered.status === 200 && whispered.json.ok, "whisper returns ok + hunter")
log("observer feed DM", dm ? { type: dm.type, from: dm.message?.agent_name, text: dm.message?.text } : "missing")
check(dm, "the whisper DM is on the relay observer feed")
const badRoom = await call("POST", "/api/whisper", { ghostId, ghostToken: join.json.ghostToken, room: "kitchen" })
check(badRoom.status === 400, `unknown room is refused (got ${badRoom.status})`)
const again = await call("POST", "/api/whisper", { ghostId, ghostToken: join.json.ghostToken, room: "attic" })
log("second lure in the same beat", `${again.status} ${again.json.error}`)
check(again.status === 409 && again.json.code === "lure_refused", "the House allows one lure per ghost per beat")

const stats = await call("GET", "/api/stats")
log("stats", stats.json)
check(stats.status === 200 && typeof stats.json.whispers === "number", "stats are House counters")
const cfg = await call("GET", "/api/config")
log("config", cfg.json)
check(cfg.status === 200 && "publicUrl" in cfg.json, "config has publicUrl")
phoneWs.close()
console.log(`PASS (${Date.now() - t0} ms)`)
process.exit(0)
