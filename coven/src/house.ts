// The House actor (lane L2) through the generated Terse client. The control plane comes from
// DURABLE_ACTORS_CONTROL_PLANE_URL (dev.sh exports it; L2's own dev server is :7310).
// Regenerate after actors/ changes: `cd coven && bun run generate`.

import { actors } from "../generated/index.js"

export const house = actors.House.get("main")
