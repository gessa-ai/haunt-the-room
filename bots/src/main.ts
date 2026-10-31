#!/usr/bin/env bun
// HAUNT THE ROOM bot ghosts (lane L8).
//   bun bots/src/main.ts --fill <n> [--base <url>]
//       keep about n ghosts online: bots join while the room is thin and retire as humans join (GET /api/stats).
//       The server's presenter command bots-on spawns this; SIGTERM/SIGINT closes every socket at once (bots-off);
//       it also exits when its parent dies.
//   bun bots/src/main.ts --load <n> --base <url> [--ramp <s>=20] [--play <s>=120] [--report <path>]
//       load test through the public path; writes bots/LOAD-REPORT.md (newest run first).
// PRESENTER_TOKEN comes from the environment or ~/haunted-hacks/.env (sent as x-presenter-token on bot joins).
import { join } from "node:path"
import { startFill } from "./fill.ts"
import { startLoad } from "./load.ts"
import { log, Metrics, presenterToken, ROOT } from "./util.ts"

const USAGE =
  "usage: bun bots/src/main.ts --fill <n> [--base <url>]\n" +
  "       bun bots/src/main.ts --load <n> --base <url> [--ramp <s>] [--play <s>] [--report <path>]"

function die(msg: string): never {
  console.error(`bots: ${msg}\n${USAGE}`)
  process.exit(2)
}

const args = new Map<string, string>()
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i]!
  const v = argv[i + 1]
  if (!k.startsWith("--") || v === undefined || v.startsWith("--")) die(`bad argument near ${k}`)
  args.set(k.slice(2), v)
}
const num = (k: string, dflt?: number): number => {
  const raw = args.get(k)
  if (raw === undefined && dflt !== undefined) return dflt
  const v = Number(raw)
  if (!Number.isFinite(v) || v < 0) die(`--${k} needs a number >= 0 (got ${raw})`)
  return v
}
for (const k of args.keys()) if (!["fill", "load", "base", "ramp", "play", "report"].includes(k)) die(`unknown flag --${k}`)
if (args.has("fill") === args.has("load")) die("pass exactly one of --fill or --load")
if (args.has("load") && !args.has("base")) die("--load needs --base <url> (the public origin)")

const base = (args.get("base") ?? "http://127.0.0.1:3300").replace(/\/+$/, "")
if (!/^https?:\/\//.test(base)) die(`--base must be an http(s) URL (got ${base})`)
const token = presenterToken()
if (!token) log("WARNING: PRESENTER_TOKEN not in the environment or ~/haunted-hacks/.env; bot joins go without x-presenter-token")
const env = { base, token, metrics: new Metrics() }

process.on("unhandledRejection", (e) => env.metrics.errors.add("unhandled rejection", String(e)))

let stop: (why: string) => Promise<unknown>
if (args.has("fill")) {
  stop = startFill(Math.floor(num("fill")), env)
  // Spawned by the server's bots-on: if the server dies without signalling us, leave with it (no orphan bots
  // doubling the room after a restart).
  const parent = process.ppid
  setInterval(() => {
    if (process.ppid === parent) return
    log(`parent ${parent} exited: closing sockets`)
    void stop("parent exited").finally(() => setTimeout(() => process.exit(0), 150))
  }, 1_000)
} else {
  const n = Math.floor(num("load"))
  const report = args.get("report") ?? join(ROOT, "bots", "LOAD-REPORT.md")
  const command = `bun bots/src/main.ts ${argv.join(" ")}`
  const run = startLoad({ n, rampMs: num("ramp", 20) * 1000, playMs: num("play", 120) * 1000, reportPath: report, command }, env)
  stop = run.stop
  run.done.then(
    () => process.exit(0),
    (e) => {
      console.error("bots: load run failed:", e)
      process.exit(1)
    },
  )
}

let stopping = false
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) process.exit(130) // second signal: leave now
    stopping = true
    log(`${sig}: closing sockets`)
    // Close frames go out on the next tick; a short grace lets them flush, then exit regardless.
    void stop(sig).finally(() => setTimeout(() => process.exit(0), 150))
  })
}
