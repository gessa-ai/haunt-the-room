// Request admission: presenter checks, signed ghost identity, and the global whisper bucket.
import type { Request } from "express"
import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "./config.ts"
import { HttpError } from "./errors.ts"

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

/** The presenter token alone (bot joins: lane L8 runs them locally or through the tunnel). */
export function requirePresenterToken(req: Request): void {
  if (!config.presenterToken) throw new HttpError(503, "no_presenter_token", "PRESENTER_TOKEN is not set in ~/haunted-hacks/.env")
  if (req.get("x-presenter-token") !== config.presenterToken) throw new HttpError(403, "bad_presenter_token", "missing or wrong x-presenter-token")
}

/** Presenter commands: only this Mac (never through the tunnel: cloudflared also connects from loopback) + the token. */
export function presenterOnly(req: Request): void {
  if (req.get("cf-connecting-ip") !== undefined || !LOOPBACK.has(req.socket.remoteAddress ?? ""))
    throw new HttpError(403, "presenter_only", "presenter routes answer only on this Mac, never through the tunnel")
  requirePresenterToken(req)
}

// ---------- ghost identity: /api/join signs the ghostId, /api/whisper checks it ----------

const ghostSecret = config.presenterToken ? createHmac("sha256", config.presenterToken).update("haunt ghost token v1").digest() : null

export function ghostToken(ghostId: string): string {
  if (!ghostSecret) throw new HttpError(503, "no_presenter_token", "PRESENTER_TOKEN is not set in ~/haunted-hacks/.env (it seeds ghost tokens)")
  return createHmac("sha256", ghostSecret).update(ghostId).digest("base64url").slice(0, 22)
}

export function requireGhostToken(ghostId: string, token: unknown): void {
  const expected = Buffer.from(ghostToken(ghostId))
  const given = Buffer.from(typeof token === "string" ? token : "")
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw new HttpError(403, "bad_ghost_token", "ghostToken does not match this ghostId (join again)")
}

// ---------- token buckets ----------

/** `capacity` tokens, refilled at `perSecond`; idle full buckets are swept every minute. */
export function bucket(what: string, capacity: number, perSecond: number) {
  const buckets = new Map<string, { tokens: number; at: number }>()
  const level = (key: string, now: number) => {
    const b = buckets.get(key)
    return b ? Math.min(capacity, b.tokens + ((now - b.at) / 1000) * perSecond) : capacity
  }
  setInterval(() => {
    const now = Date.now()
    for (const key of buckets.keys()) if (level(key, now) >= capacity) buckets.delete(key)
  }, 60_000).unref()
  return {
    /** Throws 429 + Retry-After when empty; consume with take() once every check has passed. */
    check(key: string): void {
      const tokens = level(key, Date.now())
      if (tokens >= 1) return
      const retryS = Math.max(1, Math.ceil((1 - tokens) / perSecond))
      throw new HttpError(429, "rate_limited", `${what}: try again in ${retryS} s`, { "Retry-After": String(retryS) }) // quiet: no log
    },
    take(key: string): void {
      const now = Date.now()
      buckets.set(key, { tokens: level(key, now) - 1, at: now })
    },
  }
}
