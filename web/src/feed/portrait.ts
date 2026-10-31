// Hunter portraits (lane L19, web/src/avatar): the chat, the hunting overlay and the reveal all use this one helper.
// talk(id) makes every portrait of that hunter twitch (mouth, eyes) for a moment when its line arrives.
import type { HunterId } from "../../../contract/protocol"
import { drawHunter } from "../avatar/index.ts"

const live = new Map<HunterId, Set<HTMLCanvasElement>>()
const talkingUntil = new Map<HunterId, number>()
let raf = 0

export function hunterPortrait(id: HunterId, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.className = "hp"
  c.width = c.height = size
  drawHunter(c, id, size)
  let set = live.get(id)
  if (!set) live.set(id, (set = new Set()))
  set.add(c)
  return c
}

function tick(): void {
  raf = 0
  const now = performance.now()
  let any = false
  for (const [id, set] of live) {
    const talking = (talkingUntil.get(id) ?? 0) > now
    for (const c of set) {
      if (!c.isConnected) {
        set.delete(c)
        continue
      }
      drawHunter(c, id, c.width, { talking })
    }
    any ||= talking
  }
  if (any) raf = requestAnimationFrame(tick)
}

/** The hunter speaks: its portraits twitch for `ms` (then settle on the rest frame). */
export function talk(id: HunterId, ms = 1800): void {
  talkingUntil.set(id, performance.now() + ms)
  if (!raf) raf = requestAnimationFrame(tick)
  window.setTimeout(() => !raf && (raf = requestAnimationFrame(tick)), ms + 50)
}
