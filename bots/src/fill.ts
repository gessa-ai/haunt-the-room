// --fill <n>: keep about n ghosts online. Bots join while the room is thin and retire as real humans join.
import { lureText, type StageSnap } from "../../contract/protocol.ts"
import { Bot, type BotEnv } from "./bot.ts"
import { pickLure, world } from "./brain.ts"
import { GUEST_NAMES } from "./names.ts"
import { botGhostId, log, ms, pct, rand } from "./util.ts"

type Counters = StageSnap["counters"]
const POLL_MS = 1_000
const STATUS_MS = 10_000
const LIARS_PER_BEAT = 1 // L13 15:17: bot lies drowned the humans' lies; at most one bot lie per beat, fleet-wide
const LIE_AFTER_MS = 3_000 // ...and never before 3 s into the hide, so humans lie first
const MAX_FILL = 150 // owner 14:45: never more than 150 bots

export async function fetchStats(base: string): Promise<Counters> {
  const res = await fetch(`${base}/api/stats`, { signal: AbortSignal.timeout(5_000) }) // stats took 1.2-3 s on 2.5
  const body = await res.text()
  if (!res.ok) throw new Error(`stats ${res.status}: ${body.slice(0, 160)}`)
  return JSON.parse(body) as Counters
}

export function startFill(asked: number, env: BotEnv): (why: string) => Promise<void> {
  const target = Math.min(asked, MAX_FILL)
  if (target < asked) log(`fill ${asked} capped at ${MAX_FILL}`)
  const m = env.metrics
  const bots = new Map<number, Bot>() // slot -> bot; slots are reused lowest-first so names stay stable
  const rate = Math.max(4, Math.ceil(target / 15)) // reach any target in ~15 s: wisps pour in, not pop in
  let last: Counters | null = null
  let stopped = false

  const spawn = () => {
    let slot = 0
    while (bots.has(slot)) slot++
    const bot = new Bot(botGhostId("fill", slot), env, GUEST_NAMES[slot % GUEST_NAMES.length])
    bots.set(slot, bot)
    bot.start()
  }
  const retire = () => {
    const slots = [...bots.keys()]
    const slot = slots[Math.floor(Math.random() * slots.length)]!
    bots.get(slot)!.stop("retired: a human joined")
    bots.delete(slot)
  }

  const poll = async () => {
    try {
      last = await fetchStats(env.base)
    } catch (e) {
      m.errors.add("stats unavailable", String(e))
      return
    }
    if (stopped) return
    const humans = typeof last.humans === "number" ? last.humans : Math.max(0, last.online - bots.size)
    const diff = Math.max(0, target - humans) - bots.size
    for (let k = 0; k < Math.min(Math.abs(diff), rate); k++) diff > 0 ? spawn() : retire()
  }

  // Lures: at most one bot lie per HIDE phase (>= 3 s in), naming one of the emptiest rooms. Bot sockets cannot see
  // human lies, so the 3 s floor is how humans get the first word.
  let lureBeat = ""
  const lureTimers: ReturnType<typeof setTimeout>[] = []
  const lureWatch = setInterval(() => {
    const key = `${world.round}.${world.beat}`
    if (world.phase !== "hide" || key === lureBeat) return
    lureBeat = key
    lureTimers.length = 0 // last beat's timers have fired
    const ready = [...bots.values()].filter((b) => b.canHide).sort(() => Math.random() - 0.5)
    for (const bot of ready.slice(0, LIARS_PER_BEAT)) {
      lureTimers.push(
        setTimeout(() => {
          if (!bot.canHide) return
          const room = pickLure(bot.room)
          bot.whisper(room).then(
            (res) => {
              m.whispers++
              log(`lure "${lureText(room, m.whispers)}" -> ${res.slice(0, 80)}`)
            },
            (e) => m.errors.add("lure failed", String(e)),
          )
        }, rand(LIE_AFTER_MS, Math.max(LIE_AFTER_MS + 200, world.endsAt - Date.now() - 800))),
      )
    }
  }, 250)

  let seen = { hides: 0, beats: 0, satOut: 0, lastSecond: 0 }
  const status = () => {
    const open = [...bots.values()].filter((b) => b.open).length
    const c = last ? `house online ${last.online} (humans ${last.humans}, bots ${last.bots})` : "house stats: none yet"
    const results = [...m.results].map(([k, v]) => `${k} ${v}`).join(" ") || "none"
    log(
      `fill ${target}: ${c}; mine ${bots.size} (open ${open}); phase ${world.phase ?? "?"} beat ${world.beat};` +
        ` last ${STATUS_MS / 1000} s: hides ${m.hides - seen.hides} (last-second ${m.lastSecond - seen.lastSecond})` +
        ` sat out ${m.satOut - seen.satOut}; hide p50/p95 ${ms(pct(m.hideMs, 0.5))}/${ms(pct(m.hideMs, 0.95))} ms;` +
        ` results ${results}; lures ${m.whispers}; disconnects ${m.disconnects}; errors: ${m.errors.summary()}`,
    )
    seen = { hides: m.hides, beats: m.beats, satOut: m.satOut, lastSecond: m.lastSecond }
    m.hideMs = []
  }

  log(`fill ${target} via ${env.base} (spawn/retire up to ${rate}/s, presenter token ${env.token ? "set" : "MISSING"})`)
  void poll()
  const pollTimer = setInterval(() => void poll(), POLL_MS)
  const statusTimer = setInterval(status, STATUS_MS)

  return async (why) => {
    stopped = true
    clearInterval(pollTimer)
    clearInterval(statusTimer)
    clearInterval(lureWatch)
    for (const t of lureTimers) clearTimeout(t)
    for (const b of bots.values()) b.stop(`bots-off (${why})`)
    log(`fill stopped (${why}): closed ${bots.size} sockets`)
    bots.clear()
  }
}
