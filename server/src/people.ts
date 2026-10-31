// Distinct real people for the closing numbers: non-bot ghosts that joined through the public tunnel, persisted to
// logs/people.json so the count survives restarts and releases.
import type { Request } from "express"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { config } from "./config.ts"

const QA_SYNTHETIC_IP = "203.0.113.7"
const FILE = resolve(config.logsDir, "people.json")
const people = new Set<string>(existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as string[]) : [])
let dirty = false

setInterval(() => {
  if (!dirty) return
  dirty = false
  writeFileSync(`${FILE}.tmp`, JSON.stringify([...people]))
  renameSync(`${FILE}.tmp`, FILE)
}, 2_000).unref()

/** Count a join if it is a person: came through the tunnel, not QA's synthetic IP, no presenter token, not a bot. */
export function notePerson(req: Request, ghostId: string, bot: boolean): void {
  const ip = req.get("cf-connecting-ip")
  if (bot || !ip || ip === QA_SYNTHETIC_IP || req.get("x-presenter-token") !== undefined || people.has(ghostId)) return
  people.add(ghostId)
  dirty = true
}

export const peopleCount = (): number => people.size
