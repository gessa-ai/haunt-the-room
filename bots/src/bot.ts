// One bot ghost: joins through the public path, holds a House socket, hides once or twice per beat.
import type { HouseToPhone, PhoneToHouse, RoomId } from "../../contract/protocol.ts"
import { applyPhase, applyRooms, pickHide, pickStrategy, world } from "./brain.ts"
import { bump, rand, type Metrics } from "./util.ts"

export interface BotEnv {
  base: string // public origin, e.g. http://127.0.0.1:3300 or https://<public>
  token: string | null // x-presenter-token (the server requires it for bot:true joins)
  metrics: Metrics
}

type Timer = ReturnType<typeof setTimeout>
const SECOND_HIDE_P = 0.5 // some bots change their mind mid-beat
const LAST_SECOND_P = 0.12 // a few switch rooms in the last second before the bell
const PING_MS = 5_000 // transport RTT probe (answered by the gateway, never wakes the House)
const IN_FLIGHT_MS = 2_000 // a hide this young may still get its reply

function joinErrorKind(e: unknown): string {
  if (e instanceof Error && e.name === "TimeoutError") return "join timeout (10 s)"
  const s = e instanceof Error ? e.message : String(e)
  const status = s.match(/^join (\d{3})/)
  return status ? `join HTTP ${status[1]}` : `join failed: ${s.slice(0, 60)}`
}

export class Bot {
  room: RoomId | null = null
  caught = false
  everOpened = false
  private ghostToken = ""
  private ws: WebSocket | null = null
  private alive = true
  private attempt = 0
  private beatKey = ""
  private seated = false // a hide this beat was answered with that room
  private strategy: ReturnType<typeof pickStrategy> = "crowd"
  /** The hide awaiting its {t:"you"}; `other` = a {t:"you"} for a different room arrived meanwhile. */
  private pending: { room: RoomId; at: number; other: boolean } | null = null
  private pingAt = 0
  private beatTimers: Timer[] = []
  private retryTimer: Timer | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    readonly ghostId: string,
    private env: BotEnv,
    private name?: string, // a guest name sent on join (fill); the House generates one otherwise
  ) {}

  get open() {
    return this.ws?.readyState === WebSocket.OPEN
  }
  get canHide() {
    return this.open && !this.caught && world.phase === "hide"
  }

  start() {
    void this.connect()
  }

  /** Close the socket and never come back (retire, bots-off, end of a load run). */
  stop(reason: string) {
    this.alive = false
    this.clearPlay()
    clearTimeout(this.retryTimer)
    const ws = this.ws
    this.ws = null
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(1000, reason)
  }

  /** Classify an unmatched hide: refused (the House answered with another room) or unanswered (no reply). */
  settle(minAgeMs = 0) {
    const p = this.pending
    if (!p || performance.now() - p.at < minAgeMs) return
    if (p.other) this.env.metrics.refused++
    else this.env.metrics.unanswered++
    this.pending = null
  }

  /** A lure: tell a hunter the dead are all in `room` (POST /api/whisper {ghostId, ghostToken, room}). */
  async whisper(room: RoomId): Promise<string> {
    const res = await fetch(`${this.env.base}/api/whisper`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ghostId: this.ghostId, ghostToken: this.ghostToken, room }),
      signal: AbortSignal.timeout(5_000),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`whisper ${res.status}: ${body.slice(0, 160)}`)
    return body
  }

  private clearPlay() {
    for (const t of this.beatTimers) clearTimeout(t)
    this.beatTimers = []
    clearInterval(this.pingTimer)
  }

  private async connect() {
    const { base, token, metrics: m } = this.env
    const initial = !this.everOpened
    const t0 = performance.now()
    let url: string
    try {
      const res = await fetch(`${base}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-presenter-token": token } : {}) },
        body: JSON.stringify({ ghostId: this.ghostId, bot: true, ...(this.name ? { name: this.name } : {}) }),
        signal: AbortSignal.timeout(10_000),
      })
      const body = await res.text()
      if (!res.ok) throw new Error(`join ${res.status}: ${body.slice(0, 160)}`)
      const grant = JSON.parse(body) as { websocketUrl?: unknown; ghostToken?: unknown }
      if (typeof grant.websocketUrl !== "string") throw new Error(`join: no websocketUrl in ${body.slice(0, 160)}`)
      url = grant.websocketUrl
      this.ghostToken = typeof grant.ghostToken === "string" ? grant.ghostToken : ""
    } catch (e) {
      if (!this.alive) return
      m.errors.add(joinErrorKind(e), String(e))
      return this.retry()
    }
    if (!this.alive) return
    m.joinMs.push(performance.now() - t0)

    const ws = new WebSocket(url)
    this.ws = ws
    let openedAt = 0
    let gotYou = false
    ws.onopen = () => {
      if (this.ws !== ws) return
      openedAt = performance.now()
      m.connectMs.push(openedAt - t0)
      if (initial) m.firstOpen++
      else m.reconnects++
      this.everOpened = true
      this.pingTimer = setInterval(() => this.ping(), PING_MS * rand(0.8, 1.2))
      this.beatTimers.push(
        setTimeout(() => {
          if (this.ws === ws && !gotYou) m.errors.add("no {t:you} within 3 s of open")
        }, 3_000),
      )
    }
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return
      if (!this.onFrame(String(ev.data)) || gotYou) return
      gotYou = true
      m.stateMs.push(performance.now() - openedAt)
      if (initial) m.firstState++
      this.attempt = 0
      if (world.phase === "hide") this.planBeat() // joined mid-beat
    }
    ws.onerror = () => {
      if (this.ws === ws) m.errors.add(openedAt ? "ws error" : "ws error before open")
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws) return // stopped or replaced
      this.ws = null
      this.pending = null
      this.pingAt = 0
      this.clearPlay()
      if (!this.alive) return
      if (openedAt) {
        m.disconnects++
        bump(m.closeCodes, String(ev.code))
      } else m.errors.add(`ws closed before open (${ev.code})`)
      this.retry()
    }
  }

  /** Backoff 0.25 -> 1 s, jittered: bots are back within ~1.5 s of the House (kill -9 beat) without a stampede. */
  private retry() {
    if (!this.alive) return
    const delay = Math.min(1_000, 250 * 2 ** this.attempt++) * rand(0.5, 1.5)
    this.retryTimer = setTimeout(() => void this.connect(), delay)
  }

  /** Returns true for {t:"you"}. */
  private onFrame(data: string): boolean {
    const m = this.env.metrics
    let msg: HouseToPhone
    try {
      msg = JSON.parse(data) as HouseToPhone
    } catch {
      m.errors.add("unparseable frame", data.slice(0, 80))
      return false
    }
    bump(m.msgs, msg.t)
    switch (msg.t) {
      case "you":
        if (this.pending && this.pending.room === msg.room) {
          m.hideMs.push(performance.now() - this.pending.at)
          this.pending = null
          if (world.phase === "hide") this.seated = true
        } else if (this.pending) {
          // refused (the room filled up): find another seat before the bell
          const refused = this.pending.room
          this.pending.other = true
          if (world.phase === "hide" && !msg.caught) {
            this.beatTimers.push(setTimeout(() => this.hide(pickHide(this.strategy, refused)), rand(150, 400)))
          }
        }
        this.room = msg.room
        this.caught = msg.caught
        return true
      case "phase":
        applyPhase(msg)
        // a beat's {t:"you"} (caught cleared) may trail its phase frame: decide a moment later
        if (msg.phase === "hide") this.beatTimers.push(setTimeout(() => this.planBeat(), 250))
        return false
      case "rooms":
        applyRooms(msg)
        return false
      case "result":
        bump(m.results, msg.kind)
        return false
      case "pong":
        if (this.pingAt) m.pingMs.push(performance.now() - this.pingAt)
        this.pingAt = 0
        return false
      case "say":
        return false
      default:
        m.errors.add(`unknown frame t=${String((msg as { t?: unknown }).t)}`)
        return false
    }
  }

  /** One HIDE phase: a first pick, maybe a change of mind, maybe a last-second switch. Caught = sit out. */
  private planBeat() {
    const key = `${world.round}.${world.beat}`
    if (key === this.beatKey) return
    this.beatKey = key
    const m = this.env.metrics
    m.beats++
    if (this.caught) return void m.satOut++
    for (const t of this.beatTimers) clearTimeout(t)
    this.beatTimers = []
    const left = world.endsAt - Date.now()
    if (left < 800) return
    const strategy = (this.strategy = pickStrategy())
    const at = (ms: number, fn: () => void) => this.beatTimers.push(setTimeout(fn, ms))
    // real crowds do not tap in the same millisecond: taps spread over the first 70% of the phase
    const spreadEnd = Math.max(600, 0.7 * left)
    this.seated = false
    const first = rand(300, spreadEnd)
    at(first, () => this.hide(pickHide(strategy), true)) // always tap once: no seat at the bell = caught
    // safety: still no seat at 85% of the phase (refusals, lost frames) -> take any open seat
    at(0.85 * left, () => {
      if (!this.seated) (m.seatRescues++, this.hide(pickHide("spread"), true))
    })
    if (Math.random() < SECOND_HIDE_P && spreadEnd - first > 1_000) {
      at(rand(first + 1_000, spreadEnd), () => this.hide(pickHide(strategy, this.room)))
    }
    if (Math.random() < LAST_SECOND_P) {
      at(left - rand(300, 900), () => {
        if (this.seated) (m.lastSecond++, this.hide(pickHide("random", this.room)))
      })
    }
  }

  private hide(room: RoomId, force = false) {
    const ws = this.ws
    if (!ws || !this.canHide || (!force && room === this.room)) return
    const m = this.env.metrics
    this.settle(IN_FLIGHT_MS) // a younger pending hide (overtaken by a switch) is superseded, not lost
    this.pending = { room, at: performance.now(), other: false }
    m.hides++
    ws.send(JSON.stringify({ t: "hide", room } satisfies PhoneToHouse))
  }

  private ping() {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (this.pingAt) this.env.metrics.pingLost++ // previous ping never answered
    this.pingAt = performance.now()
    ws.send('{"t":"ping"}') // the exact text the gateway auto-answers
  }
}
