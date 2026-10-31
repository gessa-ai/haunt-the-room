// The server's one door to the actors (House "main", Ghost per phone; contract/protocol.ts). The client is
// generated from lane L2's actors/src/actors.ts into server/generated (dev.sh runs `durable-actors generate`).
export { actors } from "../generated/index.js"

export const HOUSE_ID = "main"
