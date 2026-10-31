// Calls the running test actor: bun call.ts (dev server on :7301, client generated into ./generated)
import fs from "node:fs"
import { actors } from "./generated/index.js"
const games = new URL("../../research/gamegen/games/", import.meta.url)
const probe = actors.HostProbe.get("probe-1")
for (const [file, action] of [
  ["zombie.sonnet.r0.js", { type: "move", dir: "up" }],
  ["trivia.sonnet.r0.js", { type: "start" }],
  ["ghostvote.haiku.r0.js", { type: "start" }],
] as const) {
  const src = fs.readFileSync(new URL(file, games), "utf8")
  for (const run of ["cold", "warm"]) {
    const t = performance.now()
    const r = await probe.play({ src, steps: 50, action })
    console.log(file, run, `rpc ${(performance.now() - t).toFixed(1)} ms`, JSON.stringify(r))
  }
}
console.log("loop", JSON.stringify(await probe.loop()))
process.exit(0)
