// The web app (lane L7 owns web/). Development: Vite in middleware mode, loaded from web/'s own node_modules so
// its config and plugins resolve against one Vite copy, HMR on this server. Production: web/dist; the SPA routes
// /p (phone), /stage (projector), /feed get index.html; / redirects to /p.
import express, { type Express, type NextFunction, type Request, type Response } from "express"
import { existsSync } from "node:fs"
import type { Server } from "node:http"
import { join } from "node:path"
import { config } from "./config.ts"

interface ViteDevServer {
  middlewares: (req: Request, res: Response, next: NextFunction) => void
}
interface ViteModule {
  createServer(options: Record<string, unknown>): Promise<ViteDevServer>
}

/** Every non-/api request gets this when the web app cannot be served, so the cause is on screen, not a hang. */
function webUnavailable(app: Express, reason: string): void {
  console.error(`[web] ${reason}`)
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next()
    res.status(503).type("text/plain").send(`Conjure web app unavailable: ${reason}\n`)
  })
}

async function mountVite(app: Express, server: Server): Promise<boolean> {
  // web/'s own install only (Bun would otherwise auto-install a cached copy that ignores web/'s lockfile).
  if (!existsSync(join(config.webDir, "node_modules", "vite", "package.json"))) {
    webUnavailable(app, `${config.webDir}/node_modules/vite missing (lane L7: bun install in web/)`)
    return false
  }
  const { createServer } = (await import(Bun.resolveSync("vite", config.webDir))) as ViteModule
  const vite = await createServer({
    root: config.webDir,
    appType: "spa",
    server: {
      middlewareMode: true,
      ws: { server },
      allowedHosts: [".trycloudflare.com"],
      fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.durable-actors/**", "**/.relay-key"] },
    },
  })
  app.use(vite.middlewares)
  console.log(`[web] vite middleware on ${config.webDir}`)
  return true
}

function mountDist(app: Express): void {
  const dist = join(config.webDir, "dist")
  const index = join(dist, "index.html")
  if (!existsSync(index)) return webUnavailable(app, `${index} missing (build it: cd web && bun run build)`)
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, path) {
        res.set("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
      },
    }),
  )
  app.get(/^\/(p|stage|feed|watch)(\/.*)?$/, (_req, res) => res.set("Cache-Control", "no-cache").sendFile(index))
  console.log(`[web] serving ${dist}`)
}

/** Mount the web app after the API. Returns whether something else (Vite HMR) handles websocket upgrades. */
export async function mountWeb(app: Express, server: Server): Promise<boolean> {
  app.get("/", (_req, res) => res.redirect(302, "/p")) // the QR may point at the bare origin
  if (config.production) {
    mountDist(app)
    return false
  }
  return mountVite(app, server)
}
