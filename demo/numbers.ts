// L11 numbers + beats logger for the submission and the video cut. Run it from 13:50 until the freeze.
//   bun demo/numbers.ts           log: one stage socket (House snapshots) + the Relay observer feed
//   bun demo/numbers.ts --print   one line for the close and SUBMISSION.md (reads demo/raw/numbers.json + /api/stats)
// Writes demo/raw/numbers.json (summary, every 2 s) and demo/raw/beats.jsonl (timestamped House events, phase
// changes, outages: demo/cut.ts maps them onto the recordings). Localhost only; the presenter token is read from
// PRESENTER_TOKEN or ~/haunted-hacks/.env and never printed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { HouseEvent, StageSnap } from "../contract/protocol"

const ROOT = join(import.meta.dir, "..")
const RAW = join(import.meta.dir, "raw")
const SUMMARY = join(RAW, "numbers.json")
const BEATS = join(RAW, "beats.jsonl")
const BASE = process.env.HAUNT_BASE ?? "http://127.0.0.1:3300"
const HUNTERS = new Set(["exorcist", "medium", "skeptic", "priest"])
mkdirSync(RAW, { recursive: true })

interface Summary {
  startedAt: string
  updatedAt: string
  peak: { online: number; humans: number; bots: number; at: string | null }
  counters: StageSnap["counters"] | null
  relay: { messages: number; hunterLines: number; dms: number; lies: number; referee: number; maxSeq: number }
  outages: { closedAt: string; backAt: string; ms: number }[]
}

function token(): string {
  const env = process.env.PRESENTER_TOKEN?.trim()
  if (env) return env
  const file = join(ROOT, ".env")
  const line = existsSync(file) ? readFileSync(file, "utf8").split("\n").find(l => /^\s*PRESENTER_TOKEN\s*=/.test(l)) : undefined
  const value = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "")
  if (!value) throw new Error("PRESENTER_TOKEN is not set (env or ~/haunted-hacks/.env)")
  return value
}

const iso = (ms: number) => new Date(ms).toISOString()
const beat = (b: Record<string, unknown>): void => {
  try {
    appendFileSync(BEATS, JSON.stringify(b) + "\n")
  } catch (error) {
    console.error(`[numbers] could not append to ${BEATS}: ${(error as Error).message}`)
  }
}

async function print(): Promise<void> {
  if (!existsSync(SUMMARY)) throw new Error(`${SUMMARY} missing: run \`bun demo/numbers.ts\` during the afternoon first`)
  const s = JSON.parse(readFileSync(SUMMARY, "utf8")) as Summary
  const live = (await fetch(`${BASE}/api/stats`).then(r => (r.ok ? r.json() : null)).catch(() => null)) as StageSnap["counters"] | null
  const c = live ?? s.counters
  const big = s.outages.filter(o => o.ms >= 100)
  const kill = big.length ? `${(big[big.length - 1].ms / 1000).toFixed(1)} s (last of ${big.length})` : "n/a"
  console.log(
    `joined ${c?.joinedToday ?? "?"} non-bot ghosts (includes QA synthetic phones: not "people") · rounds ${c?.rounds ?? "?"} · relay ${s.relay.messages} msgs ` +
      `(${s.relay.hunterLines} hunter lines, ${s.relay.dms} DMs, ${s.relay.lies} lies, ${s.relay.referee} referee) · ` +
      `peak ${s.peak.humans} non-bot + bots (peak total ${s.peak.online}) · kill -9 back in ${kill} · ` +
      `sweeps ${c?.sweeps ?? "?"} caught ${c?.caught ?? "?"} possessions ${c?.possessions ?? "?"}` +
      (live ? "" : "  [stats from the log: /api/stats unreachable]"),
  )
}

async function log(): Promise<void> {
  const tok = token()
  const prev = existsSync(SUMMARY) ? (JSON.parse(readFileSync(SUMMARY, "utf8")) as Summary) : null
  const s: Summary = prev ?? {
    startedAt: iso(Date.now()),
    updatedAt: iso(Date.now()),
    peak: { online: 0, humans: 0, bots: 0, at: null },
    counters: null,
    relay: { messages: 0, hunterLines: 0, dms: 0, lies: 0, referee: 0, maxSeq: 0 },
    outages: [],
  }
  const seenEvents = new Set<string>()
  if (existsSync(BEATS)) for (const l of readFileSync(BEATS, "utf8").split("\n")) if (l) seenEvents.add(JSON.parse(l).key ?? "")
  const seenMsgs = new Set<string>()
  const save = () => {
    s.updatedAt = iso(Date.now())
    try {
      writeFileSync(SUMMARY + ".tmp", JSON.stringify(s, null, 1))
      renameSync(SUMMARY + ".tmp", SUMMARY)
    } catch (error) {
      console.error(`[numbers] could not save ${SUMMARY}: ${(error as Error).message} (counting continues in memory)`)
    }
  }
  setInterval(save, 2_000)

  // ---- stage socket: House snapshots ----
  let closedAt = 0
  let lastPhase = ""
  let lastSnapAt = 0
  let lastRestoredAt: number | null | undefined = undefined // undefined = no snapshot yet
  const stage = async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}/api/stage/grant`, { method: "POST", headers: { "x-presenter-token": tok } })
      if (!res.ok) throw new Error(`grant HTTP ${res.status} ${(await res.text()).slice(0, 100)}`)
      const ws = new WebSocket(((await res.json()) as { websocketUrl: string }).websocketUrl)
      ws.onmessage = e => {
        const m = JSON.parse(String(e.data)) as { t: string; s?: StageSnap }
        if (m.t !== "snap" || !m.s) return
        const snap = m.s
        const now = Date.now()
        if (closedAt) {
          const ms = now - closedAt
          s.outages.push({ closedAt: iso(closedAt), backAt: iso(now), ms })
          beat({ key: `back|${now}`, at: now, kind: "house-back", ms })
          console.log(`[numbers] house back after ${(ms / 1000).toFixed(2)} s`)
          closedAt = 0
        }
        // Executor-only kill: no socket closes; the House comes back with a new restoredAt. The outage the stage shows
        // ("back in 0.2 s") is the gap in snapshots before that one.
        if (lastRestoredAt !== undefined && snap.restoredAt !== null && snap.restoredAt !== lastRestoredAt && lastSnapAt) {
          const ms = now - lastSnapAt
          s.outages.push({ closedAt: iso(lastSnapAt), backAt: iso(now), ms })
          beat({ key: `revived|${snap.restoredAt}`, at: now, kind: "house-back", ms, executorOnly: true })
          console.log(`[numbers] house revived (restoredAt changed), snapshot gap ${(ms / 1000).toFixed(2)} s`)
        }
        lastRestoredAt = snap.restoredAt
        lastSnapAt = now
        const c = snap.counters
        s.counters = c
        if (c.online > s.peak.online) s.peak = { online: c.online, humans: c.humans, bots: c.bots, at: iso(now) }
        s.peak.humans = Math.max(s.peak.humans, c.humans)
        const phase = `${snap.phase}|${snap.round}|${(snap as { beat?: number }).beat ?? 0}`
        if (phase !== lastPhase) {
          lastPhase = phase
          beat({ key: `phase|${phase}|${snap.endsAt}`, at: now, kind: "phase-seen", phase: snap.phase, round: snap.round, beat: (snap as { beat?: number }).beat ?? 0, winner: snap.winner })
        }
        for (const ev of snap.events as HouseEvent[]) {
          const key = `${ev.at}|${ev.kind}|${ev.room ?? ""}|${ev.hunter ?? ""}|${ev.count ?? ""}`
          if (seenEvents.has(key)) continue
          seenEvents.add(key)
          beat({ key, ...ev })
        }
      }
      ws.onclose = () => {
        if (!closedAt) closedAt = Date.now()
        beat({ key: `closed|${closedAt}`, at: closedAt, kind: "house-socket-closed" })
        setTimeout(stage, 250)
      }
    } catch (error) {
      if (!closedAt) console.error(`[numbers] stage socket: ${(error as Error).message}`)
      setTimeout(stage, closedAt ? 250 : 2_000)
    }
  }

  // ---- Relay observer feed ----
  const relay = async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}/api/relay/observer`, { headers: { "x-presenter-token": tok } })
      if (!res.ok) throw new Error(`observer HTTP ${res.status} ${(await res.text()).slice(0, 100)}`)
      const ws = new WebSocket(((await res.json()) as { wsUrl: string }).wsUrl)
      ws.onopen = () => console.log("[numbers] relay observer open")
      ws.onmessage = e => {
        const f = JSON.parse(String(e.data)) as { type?: string; seq?: number; message?: Record<string, unknown> }
        if (typeof f.seq === "number") s.relay.maxSeq = Math.max(s.relay.maxSeq, f.seq)
        const m = f.message
        const type = f.type ?? ""
        if (!m || !/^(message|dm|thread|direct)\./.test(type)) return
        const id = String(m.id ?? `${type}|${f.seq}`)
        if (seenMsgs.has(id)) return
        seenMsgs.add(id)
        const from = String(m.agent_name ?? (m.from as { name?: string } | undefined)?.name ?? "")
        const dm = type.startsWith("dm") || type.startsWith("direct") || m.kind === "dm" || "conversation_id" in m
        s.relay.messages++
        if (from === "the-dead") s.relay.lies++
        else if (from === "referee") s.relay.referee++
        else if (HUNTERS.has(from) && dm) s.relay.dms++
        else if (HUNTERS.has(from)) s.relay.hunterLines++
      }
      ws.onclose = e => {
        console.error(`[numbers] relay observer closed ${e.code}; reconnecting in 1 s`)
        setTimeout(relay, 1_000)
      }
    } catch (error) {
      console.error(`[numbers] relay observer: ${(error as Error).message}; retry in 2 s`)
      setTimeout(relay, 2_000)
    }
  }

  console.log(`[numbers] logging ${BASE} -> ${SUMMARY}, ${BEATS} (Ctrl-C to stop)`)
  void stage()
  void relay()
  process.on("SIGINT", () => {
    save()
    process.exit(0)
  })
}

if (process.argv.includes("--print")) await print()
else await log()
