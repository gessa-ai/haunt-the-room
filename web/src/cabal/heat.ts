// ROOM HEAT (owner 15:05): StageSnap.rumors = lies told this beat naming each room. Drawn as rising red smoke and an
// ember glow per room, scaled to its count (never digits). The lies stay secret; the heat is public.
// Used on the cabal table map (inside each room cell) and on the 2D house during hide (an overlay in the camera layer).
import { ROOMS, type RoomId, type StageSnap } from "../../../contract/protocol"
import "./heat.css"

export interface Heat {
  apply(rumors: StageSnap["rumors"], visible: boolean): void
}
type Rect = { x: number; y: number; w: number; h: number }

/** 0..1 per room: relative to the hottest room, with a floor so one lie is a wisp, not a blaze. */
export function heatLevels(rumors: StageSnap["rumors"]): Map<RoomId, number> {
  const max = Math.max(3, ...ROOMS.map((r) => rumors?.[r.id] ?? 0))
  return new Map(ROOMS.map((r) => [r.id, Math.min(1, (rumors?.[r.id] ?? 0) / max)]))
}

function ember(): HTMLDivElement {
  const e = document.createElement("div")
  e.className = "rh"
  for (let i = 0; i < 5; i++) {
    const p = document.createElement("i")
    p.className = "rh-smoke"
    p.style.left = `${12 + i * 19}%`
    p.style.animationDelay = `${-i * 0.37}s`
    e.append(p)
  }
  return e
}

/** One ember per room: `hosts` are elements to fill (cabal cells), or rects in `layer` (the 2D house). */
export function mountHeat(target: { cells: Map<RoomId, HTMLElement> } | { layer: HTMLElement; rects: Record<RoomId, Rect> }): Heat {
  const embers = new Map<RoomId, HTMLDivElement>()
  for (const r of ROOMS) {
    const e = ember()
    if ("cells" in target) target.cells.get(r.id)?.append(e)
    else {
      const rc = target.rects[r.id]
      Object.assign(e.style, { position: "absolute", left: `${rc.x}px`, top: `${rc.y}px`, width: `${rc.w}px`, height: `${rc.h}px` })
      target.layer.append(e)
    }
    embers.set(r.id, e)
  }
  return {
    apply(rumors, visible) {
      const lv = heatLevels(rumors)
      for (const [id, e] of embers) {
        const h = visible ? lv.get(id) ?? 0 : 0
        e.style.setProperty("--h", h.toFixed(2))
        e.classList.toggle("hot", h > 0)
      }
    },
  }
}
