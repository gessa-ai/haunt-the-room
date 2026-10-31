// think(): the hunters' one LLM door (owner 14:30): OpenRouter, OPENROUTER_API_KEY from ~/haunted-hacks/.env (re-read
// every 15 s until it appears; never printed). No key yet = no call: the authored bank (lines.ts) carries the table.

import path from "node:path"

const ENV_FILE = path.resolve(import.meta.dir, "../../.env")
const URL_ = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = "google/gemini-2.5-flash-lite" // owner 15:10 "as fast as possible, just not dumb": timed 15:13 p50 1.5 s (kimi-k2 6-15 s on Novita, qwen3-235b 6-10 s, deepseek-v3 5 s, gpt-4.1-mini 3.5 s, llama-4-maverick 2-13 s, gpt-4.1-nano 1.5 s but flatter)
const ENV_RECHECK_MS = 15_000

let key: string | null = null
let watching: ReturnType<typeof setInterval> | null = null

async function readKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim()
  const file = Bun.file(ENV_FILE)
  if (!(await file.exists())) return null
  const line = (await file.text()).split("\n").find((l) => /^\s*(export\s+)?OPENROUTER_API_KEY\s*=/.test(l))
  return line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") || null
}

export async function startBrain(): Promise<void> {
  key = await readKey()
  if (key) return void console.log(`[think] brain = OpenRouter ${MODEL}`)
  console.log(`[think] no OPENROUTER_API_KEY yet: the authored bank speaks; watching ${ENV_FILE}`)
  watching = setInterval(() => void readKey().then((k) => {
    if (!k) return
    key = k
    console.log(`[think] brain = OpenRouter ${MODEL} (key appeared)`)
    if (watching) clearInterval(watching), (watching = null)
  }), ENV_RECHECK_MS)
}
export function stopBrain() {
  if (watching) clearInterval(watching)
}
export const brainName = () => (key ? `openrouter:${MODEL}` : "bank")

/** One completion that must be a JSON object, within `budgetMs`. Throws on no key, timeout, error or non-JSON. */
export async function think(system: string, user: string, budgetMs: number, maxTokens = 300): Promise<{ json: Record<string, unknown>; brain: string }> {
  if (!key) throw new Error("no OPENROUTER_API_KEY yet")
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Haunt the Room" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 1, provider: { order: ["google-ai-studio", "google-vertex"], allow_fallbacks: true } }),
    signal: AbortSignal.timeout(budgetMs),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const text = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ""
  const a = text.indexOf("{"), b = text.lastIndexOf("}")
  if (a < 0 || b <= a) throw new Error(`OpenRouter reply has no JSON object: ${text.slice(0, 100)}`)
  return { json: JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>, brain: `openrouter:${MODEL}` }
}
