// The coven process: `bun coven/src/main.ts`. Env: DURABLE_ACTORS_CONTROL_PLANE_URL (the actor server; dev.sh exports
// it), RELAY_BASE_URL (default http://localhost:8787), RELAY_WORKSPACE_KEY (else coven/.relay-key).

import { startCoven } from "./coven.ts"
import { house } from "./house.ts"

// The coven must never die on one bad call: log it and keep hunting.
process.on("unhandledRejection", (e) => console.error("[coven] unhandled rejection (kept running):", e))
process.on("uncaughtException", (e) => console.error("[coven] uncaught exception (kept running):", e))

const coven = await startCoven({ house }).catch((e: Error) => {
  console.error(`[coven] fatal at startup: ${e.message}`)
  process.exit(1) // the supervisor restarts us
})
const shutdown = () => {
  coven.stop()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
