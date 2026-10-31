// Presenter debug panel: a small gear (bottom-left, nearly invisible) or the D key. Hidden by default; never shown
// on the projector unless opened. Uses the same local presenter token as the keys.
import { setMaster } from "../audio/index"
import { presenterToken } from "../feed/token"
import { el } from "./hud"

export interface DebugDeps {
  read(): { online: number; humans: number; bots: number; phase: string; beat: number; fps: string; recoveryMs: number | null; up: boolean }
  setDither(v: number): void
  toast(msg: string, err?: boolean): void
}

export function mountDebug(st: HTMLElement, deps: DebugDeps): void {
  const gear = el("button", "st-gear", "")
  gear.title = "debug (D)"
  const panel = el("div", "st-debug")
  const send = async (cmd: string, q = "") => {
    try {
      const res = await fetch(`/api/presenter/${cmd}${q}`, { method: "POST", headers: { "x-presenter-token": presenterToken() } })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 80)}`)
      deps.toast(`${cmd} ✓`)
    } catch (err) {
      deps.toast(`${cmd} failed: ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }
  const row = (...kids: HTMLElement[]) => {
    const r = el("div", "st-dbg-row")
    r.append(...kids)
    panel.append(r)
  }
  const btn = (label: string, fn: () => void, cls = "") => {
    const b = el("button", `st-dbg-btn ${cls}`, label)
    b.addEventListener("click", (e) => {
      e.stopPropagation()
      fn()
    })
    return b
  }
  const slider = (min: number, max: number, step: number, value: number, on: (v: number) => void) => {
    const i = el("input", "st-dbg-range")
    Object.assign(i, { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) })
    i.addEventListener("input", () => on(Number(i.value)))
    return i
  }
  panel.append(el("div", "st-dbg-h", "debug · keys L H F R A S B Q · D closes · click unlocks sound"))
  row(...["lobby", "start", "finale", "reset", "auto", "show"].map((c) => btn(c, () => void send(c))))
  const botN = el("span", "st-dbg-val", "120")
  let fill = 120
  row(
    btn("bots on", () => void send("bots-on", `?n=${fill}`)),
    btn("bots off", () => void send("bots-off")),
    slider(10, 600, 10, fill, (v) => {
      fill = v
      botN.textContent = String(v)
    }),
    botN,
  )
  row(
    btn("kill the house", () => {
      if (confirm("Kill the live House executor now?")) void send("kill")
    }, "danger"),
    btn(location.pathname.startsWith("/stage3d") ? "2D stage" : "3D stage", () => {
      location.href = (location.pathname.startsWith("/stage3d") ? "/stage" : "/stage3d") + location.search
    }),
  )
  const dVal = el("span", "st-dbg-val", "1.00")
  row(el("span", "st-dbg-l", "dither"), slider(0, 1, 0.05, 1, (v) => {
    deps.setDither(v)
    dVal.textContent = v.toFixed(2)
  }), dVal)
  const vVal = el("span", "st-dbg-val", "1.00")
  row(el("span", "st-dbg-l", "volume"), slider(0, 1, 0.05, 1, (v) => {
    setMaster(v)
    vVal.textContent = v.toFixed(2)
  }), vVal)
  const out = el("pre", "st-dbg-out", "")
  panel.append(out)
  st.append(gear, panel)

  let health = ""
  const refresh = async () => {
    if (!panel.classList.contains("on")) return
    const d = deps.read()
    try {
      const h = (await (await fetch("/api/health")).json()) as Record<string, unknown>
      health = Object.entries(h).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" ")
    } catch (err) {
      health = `health failed: ${err instanceof Error ? err.message : String(err)}`
    }
    out.textContent = [
      `online ${d.online} · humans ${d.humans} · bots ${d.bots}`,
      `phase ${d.phase} · beat ${d.beat} · house ${d.up ? "up" : "DOWN"}`,
      `${d.fps}`,
      `last recovery ${d.recoveryMs === null ? "n/a" : `${d.recoveryMs} ms`}`,
      health,
    ].join("\n")
  }
  window.setInterval(() => void refresh(), 1000)
  const toggle = () => {
    panel.classList.toggle("on")
    void refresh()
  }
  gear.addEventListener("click", (e) => {
    e.stopPropagation()
    toggle()
  })
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) toggle()
  })
}
