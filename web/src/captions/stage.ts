// The stage's voiced lines as captions (owner 14:40): hunter taunts (voiced by speak() through the captions module)
// and the announcer (its canned file plays via announce(); the caption text comes from /audio/voice/index.json).
// The stack sits at the bottom of the house column, under the cabal (which has its own stack while it is up).
import { HUNTERS, type HunterId, type RoomId, type VoiceEvent } from "../../../contract/protocol"
import { announce, playVoice, type AnnounceEvent } from "../audio/index"
import { hunterPortrait } from "../feed/portrait"
import { mount, voiceIndex } from "./index"

const HUNTER = new Map<HunterId, (typeof HUNTERS)[number]>(HUNTERS.map((h) => [h.id, h]))

export interface StageCaptions {
  taunt(hunter: HunterId, text: string): void
  announce(ev: AnnounceEvent, room?: RoomId): void
  /** a canned hunter line (playVoice) with its caption; we pick the variant so the caption matches the audio */
  voice(hunter: HunterId, event: VoiceEvent, n?: number): void
}

export function stageCaptions(st: HTMLElement, houseWidth: number): StageCaptions {
  const host = document.createElement("div")
  const w = Math.min(1040, houseWidth - 80)
  Object.assign(host.style, { position: "absolute", left: `${(houseWidth - w) / 2}px`, width: `${w}px`, bottom: "28px", height: "340px", zIndex: "44", pointerEvents: "none" })
  st.append(host)
  const caps = mount(host, { size: "stage", max: 2, ttlMs: 5500 })
  let lines: Record<string, { text: string }[]> = {}
  let hunterLines: Record<string, Record<string, { text: string }[]>> = {}
  const last = new Map<string, number>()
  void voiceIndex.then((v) => {
    lines = v.announcer ?? {}
    hunterLines = v
  })
  return {
    taunt(hunter, text) {
      const h = HUNTER.get(hunter)
      if (!h) return
      caps.push({ speaker: h.name.toLowerCase(), text, color: h.color, portrait: hunterPortrait(hunter, 96), hunter })
    },
    voice(hunter, event, n) {
      const pool = hunterLines[hunter]?.[event] ?? []
      const key = `${hunter}:${event}`
      let i = n !== undefined ? Math.max(1, Math.min(pool.length || 1, n)) : 1 + Math.floor(Math.random() * Math.max(1, pool.length))
      if (n === undefined && pool.length > 1 && i === last.get(key)) i = (i % pool.length) + 1
      last.set(key, i)
      playVoice(hunter, event, i)
      const text = pool[i - 1]?.text
      const h = HUNTER.get(hunter)
      if (text && h) caps.push({ speaker: h.name.toLowerCase(), text, color: h.color, portrait: hunterPortrait(hunter, 96), hunter, voiced: true })
    },
    announce(ev, room) {
      announce(ev, room)
      const key = ev === "haunted" ? `haunted-${room}` : ev
      const text = lines[key]?.[0]?.text
      if (text) caps.push({ speaker: "the house", text, color: "#efe6d2", voiced: true })
    },
  }
}
