// Story demo page (lane L20). ?play=full|loop|short autostarts (for screenshots); ?at=<ms> is not supported, use waits.
import { avatarDataUrl } from "../avatar/index.ts"
import { playEpilogue, playStory, playStoryShort, type StoryHandle } from "./index"

const stage = document.getElementById("stage") as HTMLElement
const log = document.getElementById("log") as HTMLElement
let h: StoryHandle | null = null
const say = (s: string) => (log.textContent = s)

function go(kind: string) {
  h?.stop()
  const onDone = () => say(`${kind}: onDone ${new Date().toLocaleTimeString()}`)
  h =
    kind === "short"
      ? playStoryShort(stage, { onDone })
      : kind === "ghosts" || kind === "hunters"
        ? playEpilogue(stage, kind, { onDone, top: [["kyle", "#ffe27a"], ["priya", "#7af0ff"], ["marcus", "#ff7ad9"]].map(([name, color]) => ({ name, color, face: avatarDataUrl(name, 160) })) })
        : playStory(stage, { onDone, loop: kind === "loop" })
  say(`${kind}: playing`)
  ;(window as unknown as { story: StoryHandle }).story = h
}
for (const k of ["full", "loop", "short", "ghosts", "hunters"]) document.getElementById(k)?.addEventListener("click", (e) => (e.stopPropagation(), go(k)))
document.getElementById("h")?.addEventListener("click", (e) => {
  e.stopPropagation()
  h?.stop()
  say("H: cut to intro")
})
window.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") {
    h?.stop()
    say("H: cut to intro")
  }
})
// the key bar and log only with ?debug (never in shots or on a projector)
if (new URLSearchParams(location.search).has("debug")) document.body.classList.add("debug")
const play = new URLSearchParams(location.search).get("play")
if (play) go(play)
