// Path router for the one SPA: /p the phone (lane L6), /stage the projector, /feed the relay feed alone.
// "/" goes to /p because the QR code and every shared link point there.
type Mount = (root: HTMLElement) => unknown

// The phone lives in lane L6's folder; a glob keeps the shell loading while that file is still being written.
const playModules = import.meta.glob<{ mountPlay: Mount }>("./play/index.ts")
const stage3dModules = import.meta.glob<{ mountStage3d: Mount }>("./stage3d/index.ts")

function placeholder(root: HTMLElement, title: string, detail: string): void {
  root.innerHTML = ""
  const box = document.createElement("div")
  box.style.cssText =
    "position:fixed;inset:0;display:grid;place-content:center;gap:12px;text-align:center;font:600 20px/1.4 Georgia,serif;color:#efe6d2;background:#07050c;padding:24px"
  const h = document.createElement("div")
  h.style.cssText = "font-size:34px;letter-spacing:.06em"
  h.textContent = title
  const p = document.createElement("div")
  p.style.cssText = "opacity:.7;font-size:16px"
  p.textContent = detail
  box.append(h, p)
  root.append(box)
}

async function mountPlayRoute(root: HTMLElement): Promise<void> {
  const load = playModules["./play/index.ts"]
  if (!load) return placeholder(root, "You are almost a ghost", "The phone app (web/src/play/index.ts) is not here yet.")
  const mod = await load()
  mod.mountPlay(root)
}

async function route(): Promise<void> {
  const root = document.getElementById("app")
  if (!root) throw new Error("#app missing from index.html")
  const path = location.pathname.replace(/\/+$/, "") || "/"
  if (path === "/") {
    history.replaceState(null, "", "/p" + location.search)
    return mountPlayRoute(root)
  }
  if (path === "/p" || path.startsWith("/p/")) return mountPlayRoute(root)
  if (path === "/stage") return (await import("./stage/index.ts")).mountStage(root)
  // judges, asynchronously: the stage exactly as projected, read-only (public watch grant + feed, no presenter keys)
  if (path === "/watch") return (await import("./stage/index.ts")).mountStage(root, { watch: true })
  if (path === "/feed") return (await import("./feed/index.ts")).mountFeed(root)
  if (path === "/stage3d") {
    const load = stage3dModules["./stage3d/index.ts"]
    if (!load) return placeholder(root, "The 3D house is being built", "web/src/stage3d/index.ts (lane L16) is not here yet.")
    ;(await load()).mountStage3d(root)
    return
  }
  placeholder(root, "Nothing haunts this hall", `No page at ${path}. Try /p, /stage or /feed.`)
}

route().catch((err: unknown) => {
  console.error("[shell] route failed", err)
  const root = document.getElementById("app")
  if (root) placeholder(root, "The house stumbled", err instanceof Error ? err.message : String(err))
})
