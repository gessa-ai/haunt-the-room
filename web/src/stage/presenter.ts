// Presenter keys on the projector: L lobby, H start (intro), F finale, R reset, A auto, S show, B bots on/off,
// Q QR size (local). Commands POST /api/presenter/<cmd> with x-presenter-token (from ?token=, kept in localStorage).
import { presenterToken } from "../feed/token"

const CMDS: Record<string, string> = { l: "lobby", h: "start", f: "finale", r: "reset", a: "auto", s: "show" }

export function startPresenter(toast: (msg: string, err?: boolean) => void, toggleQr: () => void, beforeCommand: () => void = () => undefined): void {
  const tok = presenterToken()
  let botsOn = true
  const send = async (cmd: string) => {
    try {
      const res = await fetch(`/api/presenter/${cmd}`, { method: "POST", headers: { "x-presenter-token": tok } })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 80)}`)
      toast(`presenter: ${cmd} ✓`)
    } catch (err) {
      toast(`presenter: ${cmd} failed: ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
    const k = e.key.toLowerCase()
    if (k === "q") return toggleQr()
    if (k === "b") {
      botsOn = !botsOn
      return void send(botsOn ? "bots-on" : "bots-off")
    }
    const cmd = CMDS[k]
    if (cmd) {
      if (cmd === "reset" || cmd === "lobby" || cmd === "start") beforeCommand() // the epilogue never blocks a key
      void send(cmd)
    }
  })
  if (!tok && !new URLSearchParams(location.search).has("fake")) toast("presenter: no token yet (open /stage?token=...)", true)
}
