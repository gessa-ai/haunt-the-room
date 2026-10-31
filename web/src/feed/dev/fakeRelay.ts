// Local fake relay observer (?fake=<anything>): raw engine frames in the research/RELAY.md shape, so the real
// parser renders them. Hunter chatter in #hunt, private DMs, the dead's whispers, typed actions.
import { ROOMS, lureText } from "../../../../contract/protocol"
import { parseFrame, type FeedSource } from "../relay"

// Short lines in the COPY.md persona voices (6 words or so), so screenshots match the real game.
const LINES: [string, string][] = [
  ["exorcist", "Ballroom. Then home by eleven."],
  ["skeptic", "Subjects in the Attic: forty-two."],
  ["medium", "Darling, the Crypt is calling me."],
  ["priest", "My robes deserve the Chapel tonight."],
  ["exorcist", "Medium, stop narrating. Pick a room."],
  ["skeptic", "Medium is zero for three. Noted."],
  ["medium", "A whisper says Nursery. I believe it."],
  ["priest", "Leave the Library to my good side."],
]
const DMS: [string, string, string][] = [
  ["skeptic", "exorcist", "Ignore the Medium. Check the Ballroom."],
  ["priest", "medium", "Say Chapel. I want this catch."],
  ["exorcist", "priest", "Take the stairs. I flush the Attic."],
]
const ACTIONS: [string, string, string][] = [
  ["exorcist", "sweep", "library"],
  ["priest", "seal", "chapel"],
  ["medium", "sweep", "crypt"],
  ["skeptic", "taunt", "Run, little lights. The data always finds you."],
  ["exorcist", "sweep", "ballroom"],
]

export function fakeRelaySource(): FeedSource {
  return {
    start(h) {
      let n = 0
      let seq = 100
      const frame = (f: Record<string, unknown>) => {
        const item = parseFrame({ ...f, seq: seq++ })
        if (item) h.item(item)
        else console.error("[fake relay] frame did not parse", f)
      }
      const step = () => {
        const k = n++ % 9
        if (k === 2 || k === 7) {
          const [from, to, text] = DMS[n % DMS.length]
          frame({ type: "dm.received", conversation_id: `c-${from}-${to}`, message: { id: `m${seq}`, agent_name: from, to_name: to, text } })
        } else if (k === 4) {
          frame({ type: "dm.received", conversation_id: "c-dead", message: { id: `m${seq}`, agent_name: "the-dead", to_name: "medium", text: lureText(ROOMS[n % ROOMS.length].id, n) } })
        } else if (k === 1 || k === 5) {
          const [from, action, arg] = ACTIONS[n % ACTIONS.length]
          frame({ type: "action.invoked", action, agent: { name: from }, input: action === "taunt" ? { text: arg } : { room: arg } })
        } else {
          const [from, text] = LINES[n % LINES.length]
          frame({ type: "message.created", channel: "hunt", message: { id: `m${seq}`, agent_name: from, text } })
        }
      }
      h.status(true, "fake relay")
      for (let i = 0; i < 8; i++) step()
      window.setInterval(step, 2600)
    },
  }
}
