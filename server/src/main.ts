// HAUNT THE ROOM server: the HTTP API, the phones' /ws door to the actors, and the web app. `bun src/main.ts`.
import express from "express"
import { createServer } from "node:http"
import { api, restoreBots } from "./api.ts"
import { config } from "./config.ts"
import { errorMessage } from "./errors.ts"
import { relayReady } from "./relay.ts"
import { mountWeb } from "./web.ts"
import { actors, HOUSE_ID } from "./actors.ts"
import { attachWebSocketProxy, setHideSink } from "./wsProxy.ts"

const app = express()
app.disable("x-powered-by")
app.set("trust proxy", "loopback") // cloudflared connects from loopback; its X-Forwarded-* are the truth
const server = createServer(app)

app.use("/api", api())
const othersHandleUpgrades = await mountWeb(app, server)
attachWebSocketProxy(server, othersHandleUpgrades)
setHideSink(hides => actors.House.get(HOUSE_ID).hides({ hides }))

server.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port} (${config.production ? "production" : "development"}), relay ${config.relayBaseUrl}, presenter token ${config.presenterToken ? "set" : "MISSING"}`)
  restoreBots()
  relayReady().then(
    () => console.log("[relay] the-dead is ready to whisper"),
    error => console.error(`[relay] not ready yet (whispers retry on use): ${errorMessage(error)}`),
  )
})
