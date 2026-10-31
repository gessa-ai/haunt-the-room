// Where StageSnaps come from: the House socket (POST /api/stage/grant, a fresh grant per connect) or, before the
// actors and server are up, the local fake in ./dev (/stage?fake=<scenario>). Both feed the same stage code.
import type { HouseToStage, StageSnap } from "../../../contract/protocol"
import { presenterToken } from "../feed/token"

export interface SnapHandlers {
  snap(s: StageSnap): void
  /** up = snaps are flowing; down = the House socket is gone (the stage shows static and keeps the clock). */
  status(up: boolean, why: string): void
}
export interface SnapSource {
  start(h: SnapHandlers): void
}

const STALE_MS = 4_000

/** watch = the public read-only grant (GET /api/watch/grant) for /watch; otherwise the presenter's stage grant. */
export function houseSource(watch = false): SnapSource {
  return {
    start(h) {
      let attempt = 0
      let up = false
      const down = (why: string) => {
        if (up) console.warn(`[stage] house down: ${why}`)
        up = false
        h.status(false, why)
      }
      const retry = () => window.setTimeout(connect, Math.min(1_500, 150 * 2 ** attempt++))
      const connect = async (): Promise<void> => {
        let ws: WebSocket
        try {
          const res = watch
            ? await fetch("/api/watch/grant", { method: "POST" })
            : await fetch("/api/stage/grant", { method: "POST", headers: { "x-presenter-token": presenterToken() } })
          if (!res.ok) throw new Error(`grant HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
          const grant = (await res.json()) as { websocketUrl: string }
          ws = new WebSocket(grant.websocketUrl)
        } catch (err) {
          down(err instanceof Error ? err.message : String(err))
          retry()
          return
        }
        let last = Date.now()
        const watchdog = window.setInterval(() => {
          if (Date.now() - last > STALE_MS) {
            down(`no snapshot for ${STALE_MS} ms`)
            ws.close()
          }
        }, 500)
        ws.onmessage = (e) => {
          let msg: HouseToStage
          try {
            msg = JSON.parse(String(e.data)) as HouseToStage
          } catch {
            console.error("[stage] bad frame", String(e.data).slice(0, 200))
            return
          }
          if (msg.t !== "snap") return
          last = Date.now()
          attempt = 0
          if (!up) {
            up = true
            h.status(true, "snapshots flowing")
          }
          h.snap(msg.s)
        }
        ws.onclose = (e) => {
          window.clearInterval(watchdog)
          down(`socket closed ${e.code}${e.reason ? ` ${e.reason}` : ""}`)
          retry()
        }
      }
      void connect()
    },
  }
}
