// HAUNT THE ROOM web app: one SPA, three routes (/p phone, /stage projector, /feed relay feed).
// Dev: `bun run dev` serves it alone on 5370; integration: the server (lane L5) loads this config in Vite
// middleware mode on its own origin, so /api and the websocket doors are same-origin and need no proxy.
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const WEB = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(WEB, "..")

export default defineConfig({
  root: WEB,
  appType: "spa",
  server: {
    // The public origin reaches the dev server through the Cloudflare tunnel.
    allowedHosts: ["haunt.gessa.ai", ".trycloudflare.com"],
    // contract/ lives beside web/; secrets never leave the box.
    fs: {
      allow: [WEB, resolve(REPO, "contract")],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.relay-key", "**/.relay-agents.json"],
    },
  },
  build: { outDir: resolve(WEB, "dist"), emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 2000 },
})
