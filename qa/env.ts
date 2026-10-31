// QA helpers shared by qa/ scripts: presenter token from ~/haunted-hacks/.env (never printed), base URL, presenter calls.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"

export const ROOT = `${homedir()}/haunted-hacks`
export const BASE = process.env.QA_BASE ?? "http://127.0.0.1:3300"
const envFile = (() => {
  try { return readFileSync(`${ROOT}/.env`, "utf8") } catch { return "" }
})()
export const TOKEN = process.env.PRESENTER_TOKEN ?? /^PRESENTER_TOKEN=(.*)$/m.exec(envFile)?.[1]?.trim() ?? ""
if (!TOKEN) throw new Error("PRESENTER_TOKEN missing from ~/haunted-hacks/.env")
export const H = { "x-presenter-token": TOKEN, "content-type": "application/json" }

export async function presenter(cmd: string, q = ""): Promise<unknown> {
  const r = await fetch(`${BASE}/api/presenter/${cmd}${q}`, { method: "POST", headers: H })
  const body = await r.text()
  if (!r.ok) throw new Error(`presenter ${cmd}: HTTP ${r.status} ${body.slice(0, 200)}`)
  return JSON.parse(body)
}
export async function stageGrant(): Promise<string> {
  const r = await fetch(`${BASE}/api/stage/grant`, { method: "POST", headers: H })
  if (!r.ok) throw new Error(`stage grant HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return ((await r.json()) as { websocketUrl: string }).websocketUrl
}
export async function observerUrl(): Promise<string> {
  const r = await fetch(`${BASE}/api/relay/observer`, { headers: H })
  if (!r.ok) throw new Error(`observer HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return ((await r.json()) as { wsUrl: string }).wsUrl
}
export const ts = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}` }
