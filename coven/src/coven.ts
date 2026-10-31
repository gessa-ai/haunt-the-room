// Wires the hunt: six Relay identities, the brain, the referee's typed actions and the four hunter loops.

import { HUNTERS, type HunterId } from "../../contract/protocol.ts"
import { startHunters } from "./hunters.ts"
import { startReferee, type House } from "./referee.ts"
import { connectAgent, joinHunt, superviseRelay, type Agent } from "./relay.ts"
import { startBrain, stopBrain } from "./think.ts"

export async function startCoven(opts: { house: House; log?: (line: string) => void; dir?: string }) {
  const log = opts.log ?? ((l: string) => console.log(l))
  const dir = opts.dir
  const agents = {} as Record<HunterId, Agent>
  for (const h of HUNTERS) agents[h.id] = await connectAgent(h.id, { persona: `${h.name}: ${h.persona}`, dir })
  const referee = await connectAgent("referee", { persona: "Applies the hunters' typed actions to the House.", dir })
  for (const a of [referee, ...Object.values(agents)]) await joinHunt(a)
  await startBrain()

  const ref = startReferee({ referee, house: opts.house, log })
  await new Promise((r) => setTimeout(r, 1_000)) // the typed actions register before the first vote
  const hunt = startHunters({ agents, house: opts.house, referee: ref, log })
  const unsupervise = superviseRelay([referee, ...Object.values(agents)], log)
  return {
    agents,
    referee,
    stop() {
      unsupervise()
      hunt.stop()
      ref.stop()
      stopBrain()
    },
  }
}
