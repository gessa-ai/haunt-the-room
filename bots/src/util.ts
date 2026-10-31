// Shared plumbing for the bot process: config, logging, error tally, metrics.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** ~/haunted-hacks (this file lives in bots/src). */
export const ROOT = join(import.meta.dir, "..", "..")

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const clock = () => new Date().toTimeString().slice(0, 8)
export const log = (msg: string) => console.log(`[bots ${clock()}] ${msg}`)

/** PRESENTER_TOKEN from the environment, else from ~/haunted-hacks/.env. Never printed. */
export function presenterToken(): string | null {
  const fromEnv = process.env.PRESENTER_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const file = join(ROOT, ".env")
  if (!existsSync(file)) return null
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?PRESENTER_TOKEN\s*=\s*(.*?)\s*$/)
    if (m) return m[1]!.replace(/^(['"])(.*)\1$/, "$2").trim() || null
  }
  return null
}

/** Stable uuid-shaped ghost id per bot slot: a bot keeps its name, colour and Ghost actor across runs. */
export function botGhostId(ns: "fill" | "load", slot: number): string {
  const h = new Bun.CryptoHasher("sha1").update(`haunt-bot:${ns}:${slot}`).digest("hex")
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Every error is counted by kind; the first of each kind (and every 100th) is printed right away. */
export class ErrorTally {
  readonly counts = new Map<string, number>()
  add(kind: string, detail?: string) {
    const n = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, n)
    if (n === 1 || n % 100 === 0) log(`ERROR ${kind} (x${n})${detail ? `: ${detail.slice(0, 200)}` : ""}`)
  }
  get total() {
    let t = 0
    for (const n of this.counts.values()) t += n
    return t
  }
  summary() {
    return [...this.counts].map(([k, n]) => `${k} x${n}`).join(", ") || "none"
  }
}

export const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/** Counters every bot writes into; fill prints a window of them, load turns them into the report. */
export class Metrics {
  joinMs: number[] = [] // POST /api/join round trip
  connectMs: number[] = [] // join start -> socket open
  stateMs: number[] = [] // socket open -> first {t:"you"}
  hideMs: number[] = [] // hide sent -> matching {t:"you"}
  pingMs: number[] = [] // {"t":"ping"} -> {t:"pong"} (gateway auto-response: pure transport)
  pingLost = 0
  firstOpen = 0 // bots whose FIRST attempt opened a socket
  firstState = 0 // ... and got their first {t:"you"}
  reconnects = 0
  disconnects = 0 // unexpected closes after open
  closeCodes = new Map<string, number>()
  beats = 0 // HIDE phases a bot saw
  satOut = 0 // ... while caught (sat the beat out)
  hides = 0
  lastSecond = 0 // switches in the last second before the bell
  seatRescues = 0 // no seat at 85% of the phase -> took any open seat
  refused = 0 // the hide never got its {t:"you"}, but one for another room came (the House kept the old room)
  unanswered = 0 // the hide got no {t:"you"} at all
  results = new Map<string, number>() // reveal results: safe / caught / possessed / lie
  whispers = 0
  msgs = new Map<string, number>()
  errors = new ErrorTally()
}

export function pct(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}
export function max(xs: number[]): number {
  let m = NaN
  for (const x of xs) if (!(x <= m)) m = x
  return m
}
export const ms = (x: number) => (Number.isFinite(x) ? `${Math.round(x)}` : "-")
