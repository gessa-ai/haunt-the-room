// Lane L16's live-3D showpieces (web/src/stage3d/theater.ts) inside /stage: the intro push-in and the finale flood.
// Guardrails: the module is preloaded during LOBBY; if it is not ready within 300 ms or a shot throws, the 2D version
// plays instead (no waiting); every shot is stopped when the phase changes (no leaked WebGL context).
interface Shot {
  done: Promise<void>
  stop(): void
}
interface Theater {
  playIntroShot(el: HTMLElement): Shot
  playFinaleShot(el: HTMLElement, winner: "ghosts" | "hunters"): Shot
  INTRO_MS: number
  FINALE_MS: number
}
const modules = import.meta.glob<Theater>("../stage3d/theater.ts")
let loading: Promise<Theater | null> | null = null
let current: { shot: Shot; host: HTMLElement } | null = null

export function preloadShowpieces(): void {
  const load = modules["../stage3d/theater.ts"]
  if (loading || !load) return
  loading = load().catch((err: unknown) => {
    console.error("[stage] 3D showpieces failed to load; the 2D intro/finale will play", err)
    return null
  })
}

async function ready(): Promise<Theater | null> {
  preloadShowpieces()
  if (!loading) return null
  return Promise.race([loading, new Promise<null>((res) => window.setTimeout(() => res(null), 300))])
}

/** Plays a shot into a fresh host inside `parent`. Resolves to its duration in ms, or null when the 2D path should run. */
export async function playShowpiece(parent: HTMLElement, kind: "intro" | "finale", winner: "ghosts" | "hunters" = "ghosts"): Promise<{ ms: number; done: Promise<void> } | null> {
  stopShowpiece()
  const t = await ready()
  if (!t) return null
  const host = document.createElement("div")
  host.className = "st-showpiece"
  parent.prepend(host)
  try {
    const shot = kind === "intro" ? t.playIntroShot(host) : t.playFinaleShot(host, winner)
    current = { shot, host }
    return { ms: kind === "intro" ? t.INTRO_MS : t.FINALE_MS, done: shot.done }
  } catch (err) {
    console.error(`[stage] 3D ${kind} shot threw; playing the 2D version`, err)
    host.remove()
    return null
  }
}

export function stopShowpiece(): void {
  if (!current) return
  try {
    current.shot.stop()
  } catch (err) {
    console.error("[stage] stopping the 3D shot failed", err)
  }
  current.host.remove()
  current = null
}
