import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { HttpError } from "./errors.ts"

/** ~/haunted-hacks (this file is server/src/config.ts). */
export const REPO = resolve(import.meta.dir, "../..")

/** KEY=VALUE lines of ~/haunted-hacks/.env (dev.sh exports them too; the process environment wins). */
function readDotenv(): Record<string, string> {
  const file = resolve(REPO, ".env")
  if (!existsSync(file)) return {}
  const pairs: Record<string, string> = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) pairs[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2")
  }
  return pairs
}
const dotenv = readDotenv()
export const env = (name: string): string | undefined => process.env[name]?.trim() || dotenv[name]?.trim() || undefined

function positiveInt(name: string, fallback: number): number {
  const raw = env(name)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name}=${raw} is not a positive integer`) // fail closed: no start
  return value
}

export const config = {
  port: Number(env("PORT") ?? 3300),
  production: env("NODE_ENV") === "production",
  relayBaseUrl: (env("RELAY_BASE_URL") ?? "http://localhost:8787").replace(/\/+$/, ""),
  presenterToken: env("PRESENTER_TOKEN") ?? null,
  humanCap: positiveInt("HUMAN_CAP", 400), // live human players; more joins become spectators
  webDir: resolve(REPO, "web"),
  logsDir: env("LOG_DIR") ?? resolve(REPO, "logs"), // dev.sh passes the main logs/ (a release tree has none)
  relayKeyFile: resolve(REPO, "coven/.relay-key"),
  botsMain: resolve(REPO, "bots/src/main.ts"),
} as const

/** The Relay workspace shared with the hunters: RELAY_WORKSPACE_KEY, else coven/.relay-key (lane L3 writes it). */
export function relayWorkspaceKey(): string {
  const fromEnv = env("RELAY_WORKSPACE_KEY")
  if (fromEnv) return fromEnv
  const fromFile = existsSync(config.relayKeyFile) ? readFileSync(config.relayKeyFile, "utf8").trim() : ""
  if (fromFile) return fromFile
  throw new HttpError(503, "relay_not_configured", "Relay workspace key missing: set RELAY_WORKSPACE_KEY or start the coven (it writes coven/.relay-key)")
}

/** The QR target: the live tunnel (logs/public-url, written by `dev.sh tunnel`), else PUBLIC_URL, else unknown. */
export function publicUrl(): string | null {
  const file = resolve(config.logsDir, "public-url")
  const fromFile = existsSync(file) ? readFileSync(file, "utf8").trim() : ""
  return fromFile || env("PUBLIC_URL") || null
}
