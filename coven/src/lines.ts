// THE CABAL fallback bank: the line a hunter says when the model is late (> 1.5 s). Keyed by situation, then hunter.
// Slots: {name} a guest's public name, {room} a room, {room2} a second room, {count} a number, {other} another
// hunter ("the Medium"). Every line is <= 70 chars once filled, one idea, in character, and as good as a model line.

import type { HunterId } from "../../contract/protocol.ts"

export const SITUATIONS = ["crowded", "empty", "whispered", "lied", "mock", "betrayal", "possessed", "losing", "winning", "fooledAgain", "crowdLie", "flipflop"] as const
export type Situation = (typeof SITUATIONS)[number]

export const BANK: Record<Situation, Record<HunterId, string[]>> = {
  crowded: {
    exorcist: [
      "board says {count} in {room}. we sweep {room}.",
      "{room}, {count}. they've put their names on the door.",
      "{count} in {room}. I can be home by eleven.",
      "{room}, {count} of them. This is a one-bucket job.",
      "{count} in {room}. I'm not paid enough to argue.",
    ],
    medium: [
      "{count} in {room}. that's not a crowd. that's a congregation.",
      "{room} is so full I can feel {count} heartbeats. None of them mine.",
      "{count} in {room}. They're lonely, that's all it is.",
      "My left ear itches. That always means {room}.",
    ],
    skeptic: [
      "board says {room2} is empty. so they're in {room2}.",
      "{count} in {room}. Too obvious. Which is why it's obvious.",
      "{room} has {count}. I'd like that on the record before I'm right.",
      "{count} subjects in {room}. The Medium will say it's a feeling.",
    ],
    priest: [
      "{room}. my {room}. i am its best feature.",
      "before we vote, a word about my robes.",
      "{count} souls in {room}, waiting for my voice. Understandable.",
      "{room}. {count} of them. I'll need my good robe.",
      "{count} in {room}. They've heard about me.",
    ],
  },
  empty: {
    exorcist: [
      "Nobody in {room}. Good. One less room to mop.",
      "{room} is empty. So is my thermos.",
      "Zero in {room}. Even ghosts have standards.",
    ],
    medium: [
      "{room} feels empty, which is exactly how they want it to feel.",
      "Nobody in {room}? Then who keeps touching my scarf?",
      "{room} is quiet. Too quiet. No, actually just quiet.",
    ],
    skeptic: [
      "{room}: zero. The one number in this house I trust.",
      "Empty {room}. The Medium will still find a grandmother in it.",
      "{room} has nobody. I checked. Twice. Unlike some of us.",
    ],
    priest: [
      "Nobody in {room}. They fled when I walked past.",
      "{room} is empty. My reputation precedes me.",
      "An empty {room}. My presence has that effect.",
    ],
  },
  whispered: {
    exorcist: [
      "{name} says {room}. {name} also said that last week.",
      "Got a tip from {name}. {room}. I'll weigh it. It weighs nothing.",
      "{name} whispered {room} at me. I'm writing it on my list of lies.",
    ],
    medium: [
      "{name} says {room}. i've checked {name}'s aura. it's clean.",
      "{name} came to me personally. {room}. that means something.",
      "{name} says {room}. i'm at ninety percent.",
      "{name} said don't tell the others. {room}. so i'm telling everyone.",
      "{name} told me {room}. me. not you. remember that.",
      "{name} spoke to me. {room}. the curtain moved and it was {name}.",
      "{name} said {room}. the dead have no reason to lie.",
    ],
    skeptic: [
      "{name} told me {room}. so, not {room}. i read the board.",
      "{name} whispered {room} to me. So it's anywhere but {room}.",
      "A subject called {name} says {room}. Adorable. Ignored.",
      "{name} wants me in {room}. I want {name} to try harder.",
    ],
    priest: [
      "{name} asked for me by name. {room}. Of course they did.",
      "{name} says {room} needs a priest. {name} has taste.",
      "{name} whispered {room}. A fan. I get a lot of those.",
    ],
  },
  lied: {
    exorcist: [
      "{name} fooled you in beat {beat}, {other}. i was there.",
      "{name} burned me last beat. I'm billing {name} for the hour.",
      "Last time I listened to {name}, {room} was empty. Not again.",
      "{name} lied about {room}. I remember. I always remember.",
    ],
    medium: [
      "{name} lied to me in beat {beat}. i will not be fooled again.",
      "i learned from {room}. i'm done with {room}.",
      "{name} lied about {room}. the house heard it. the house remembers.",
      "{name} lied once about {room}. statistically, that's a reset.",
      "{name} lied to me in {room}. i've priced that in.",
    ],
    skeptic: [
      "beat {beat}, {room}. zero. it's in the minutes.",
      "{name} fooled me in {room}. I was testing {name}. Obviously.",
      "Yes, {room} was empty. That was a controlled experiment.",
      "{name} lied once. I lied about believing {name}. We're even.",
    ],
    priest: [
      "{name} sent me to {room}. it was empty. in these robes.",
      "I forgave {name} for {room}. Publicly. With good lighting.",
      "{room} was empty because {name} lied. And the Medium agreed.",
    ],
  },
  mock: {
    exorcist: [
      "it means {name} picked you. out of four.",
      "{name} is one person. the board is {count} people.",
      "{name} is who we're hunting, {other}.",
      "{other}, you believed {name}. {name} is a ghost. That's the job.",
      "{other} is following a whisper again. Somebody hold their coat.",
      "Every beat {other} finds a new best friend. They're all dead.",
    ],
    medium: [
      "{other} was fixing his hair during the last sweep.",
      "{other} has the spiritual depth of a parking ticket.",
      "{other}, the spirits don't like your tone. Neither do I.",
      "{other} counts ghosts like invoices. they're people. dead ones.",
    ],
    skeptic: [
      "{name} is a dead stranger who typed one sentence.",
      "{other}, that's whisper {tally}. you're zero for {tally}.",
      "that's {name}, a person who wants you in {room}.",
      "{other} believed {name}. That's three. I keep a list.",
      "{other} trusts {name} more than math. Bold. Wrong.",
      "{other} heard a whisper and packed a bag for {room}.",
    ],
    priest: [
      "a catch is a team effort, {other}. i was the team.",
      "{other} listens to {name}. I listen to me. Who's winning?",
      "{other}, if you'd been ordained you'd know {name} is lying.",
      "{other} is in my light. Again.",
    ],
  },
  betrayal: {
    exorcist: [
      "{other} said {room}. token went {room2}. thirty years, never seen it.",
      "{other} said {room} and swept {room2}. I saw. I'm too tired to care.",
      "{other} leaned {room} and voted {room2}. Very professional.",
      "We had a deal, {other}. {room}. You swept {room2}. Noted.",
    ],
    medium: [
      "{other} told us {room} and swept {room2}. I feel so used.",
      "{other} lied to my face about {room}. My face, {other}.",
      "{other}, you leaned {room}. Then {room2}. I trusted that lean.",
    ],
    skeptic: [
      "i agreed to {room} out loud. i swept {room2} in private.",
      "{other} leaned {room}, swept {room2}. I'd like it minuted.",
      "Fun fact: {other} said {room}. {other} swept {room2}. Fun.",
      "{other} bluffed {room}. I'd respect it if it had worked.",
    ],
    priest: [
      "{other}, you promised {room}. your token had other plans.",
      "{other} leaned {room}, swept {room2}. Betrayal suits nobody. Except me.",
      "{other} said {room} and went {room2}. I forgive you. Loudly.",
      "{other} betrayed us at {room2}. I'll pray for you. Briefly.",
    ],
  },
  possessed: {
    exorcist: [
      "we just lost {room}. my coat is in {room}.",
      "{room} is possessed. That's overtime. I hate overtime.",
      "They took {room}. Fine. I'll do it after my sandwich.",
      "{room} fell. Somebody here voted with their heart.",
    ],
    medium: [
      "{room} is possessed. i told you. nobody writes down what i say.",
      "{room} is theirs now. I saw it coming. I just said nothing.",
      "they took {room}. i saw this. in a vision. in the bath.",
      "We lost {room}. I blame the energy at this table.",
    ],
    skeptic: [
      "{room} is now haunted. statistically.",
      "{room} is possessed. Statistically, that's the Medium's fault.",
      "They took {room}. I predicted it. Quietly. In my head.",
      "{room} is gone. Nobody listened to me. Again.",
    ],
    priest: [
      "i don't do well in a house i don't own. {room}.",
      "{room} is possessed. Had I been consulted, it would not be.",
      "They took {room} while I was being humble. Never again.",
      "{room} fell. The Medium was in charge of {room}, I believe.",
    ],
  },
  losing: {
    exorcist: [
      "rooms gone: {count}. one more and they own the house.",
      "thirty years. never lost to a house with six rooms.",
      "rooms gone: {count}. I'm calling my wife. I'll be late.",
      "We're losing to the audience. Let that sink in.",
      "rooms possessed: {count}. This is why I wanted to retire.",
    ],
    medium: [
      "We're losing, and honestly? They deserve it. They're so united.",
      "rooms gone: {count}. The house has chosen them. I respect it.",
      "we're losing. the house chose them. i saw it coming. i said nothing.",
    ],
    skeptic: [
      "We're behind. I've prepared a document on whose fault it is.",
      "rooms lost: {count}. Each one traceable to a whisper.",
      "We're losing to people holding phones. Write that down.",
    ],
    priest: [
      "we caught nobody. let the record show i looked magnificent.",
      "We're losing. Clearly the others aren't praying hard enough.",
      "rooms lost: {count}. None of them on my watch. Spiritually.",
      "If we lose, I want it known that I looked magnificent.",
    ],
  },
  winning: {
    exorcist: [
      "{count} caught. Keep it boring and we'll all go home.",
      "We're ahead. Nobody do anything clever.",
      "{count} in the bag. I'm not celebrating till the van's loaded.",
    ],
    medium: [
      "{count} caught. I said goodbye to every single one.",
      "we're winning. the dead told me we would. one of them was honest.",
      "{count} caught. i knew every one of their names. not their real ones.",
    ],
    skeptic: [
      "{count} caught. Mostly my picks. I'll send a spreadsheet.",
      "We're winning. Despite the Medium. Never because of.",
      "{count} subjects processed. Good. Now stop talking.",
    ],
    priest: [
      "{count} caught. if we miss, blame the medium. if we hit, i prayed.",
      "{count} caught. Mostly by me. History will agree.",
      "We're winning. You're welcome, all of you.",
      "{count} souls saved. My voice carried, I think.",
    ],
  },
  flipflop: {
    exorcist: [
      "{other}, you just changed your mind because {name} said so?",
      "{other} was {room2} ten seconds ago. {name} talks, {other} moves.",
      "{name} whispers once and {other} packs for {room}. unbelievable.",
    ],
    medium: [
      "{name} spoke to {other} and not to me? i see how it is.",
      "{other} switched to {room}. even the doubters hear {name} now.",
      "{other} felt it too. {room}. i said this an hour ago.",
    ],
    skeptic: [
      "{other} flipped to {room} on one whisper from {name}. minuted.",
      "{other} was {room2}. now {room}. because {name}. remarkable.",
      "{name} said {room} and {other} folded in under a second. a record.",
    ],
    priest: [
      "{other} changed sides for {name}. i'd never. unless {name} asked me.",
      "{name} whispered to {other} instead of me. a clerical error.",
      "{other} follows {name} into {room}. i'll lead them out after.",
    ],
  },
  crowdLie: {
    exorcist: [
      "{count} of you said {room}. that's not a tip, that's a union.",
      "{count} whispers, all {room}. fine. i can't fight a petition.",
      "{count} of you agree on {room}. that's never happened at a table.",
    ],
    medium: [
      "{count} of you said {room}. {count}. that's not a rumour, that's data.",
      "{count} voices, one room. {room}. i don't argue with a quorum.",
      "{name} and {count} others say {room}. the dead have unionised.",
    ],
    skeptic: [
      "{count} of you said {room}. so it's anywhere but {room}.",
      "{count} identical tips about {room}. that's a coordinated campaign.",
      "{count} subjects lobbying for {room}. i'm voting against the lobby.",
    ],
    priest: [
      "{count} of you begged me for {room}. i do have a following.",
      "{count} whispers. {room}. my fans have spoken.",
      "{count} souls asked for me in {room}. i'll sign autographs after.",
    ],
  },
  fooledAgain: {
    exorcist: [
      "{liar} burned me in beat {beat}. {name} says {room}. i'll allow it.",
      "{liar} lied in beat {beat}. {name} is different. {name} is new.",
    ],
    medium: [
      "{liar} lied to me in beat {beat}. but {name} says {room}. i believe.",
      "i will not be fooled again. {name} says {room}. {name} is sincere.",
      "{liar} lied. {name} isn't {liar}. {room}.",
    ],
    skeptic: [
      "{liar} fooled me in beat {beat}. {name} won't. so it's {room}.",
      "beat {beat}, {liar}, {room2}. zero. now {name} says {room}. noted.",
    ],
    priest: [
      "{liar} lied to me in beat {beat}. {name} would never lie to a priest.",
      "{name} says {room}. unlike {liar}, {name} admires my robes.",
    ],
  },
}

export interface Slots {
  name?: string
  room?: string
  room2?: string
  count?: number
  other?: string
  beat?: number
  tally?: number
  liar?: string
}

const recent = new Map<string, number[]>()
/** A bank line for this hunter and situation, filled, never one of its last three picks. */
export function bankLine(id: HunterId, s: Situation, slots: Slots): string {
  const pool = BANK[s][id]
  const key = `${id}:${s}`
  const used = recent.get(key) ?? []
  const fresh = pool.map((_, i) => i).filter((i) => !used.includes(i))
  const i = (fresh.length ? fresh : pool.map((_, k) => k))[Math.floor(Math.random() * (fresh.length || pool.length))]!
  recent.set(key, [...used, i].slice(-Math.min(3, pool.length - 1)))
  const text = fillLine(pool[i]!, slots)
  bankIds.set(text.toLowerCase(), `${s}.${id}.${i}`)
  return text
}
/** Line ids for audio (L10b, audio/lines.json): `${situation}.${hunter}.${index}`, by the posted (lowercase) text. */
export const bankIds = new Map<string, string>()
export const bankSheet = () =>
  Object.entries(BANK).flatMap(([s, byHunter]) => Object.entries(byHunter).flatMap(([h, ls]) => ls.map((template, i) => ({ id: `${s}.${h}.${i}`, hunter: h, situation: s, template, slots: /\{/.test(template) }))))
function fillLine(t: string, slots: Slots): string {
  return t
    .replaceAll("{name}", slots.name ?? "somebody")
    .replaceAll("{room}", slots.room ?? "the Attic")
    .replaceAll("{room2}", slots.room2 ?? "the Crypt")
    .replaceAll("{count}", String(slots.count ?? 0))
    .replaceAll("{other}", slots.other ?? "the Medium")
    .replaceAll("{beat}", String(slots.beat ?? 1))
    .replaceAll("{tally}", String(slots.tally ?? 2))
    .replaceAll("{liar}", slots.liar ?? "somebody")
    .replace(/([a-z,] )The /g, "$1the ") // "in the Crypt" mid-sentence, "The Crypt" at the start
}

export const bankSize = () => Object.values(BANK).reduce((n, byHunter) => n + Object.values(byHunter).reduce((m, l) => m + l.length, 0), 0)

// ---------- pre-rendered voice (L10b, web/public/audio/voice/index.json, eleven_v3) ----------
// A bank turn in a generic situation may speak one of L10b's rendered slot-free lines instead, so the stage plays the
// v3 file: the #hunt message carries metadata.voice = "<hunter>/<key>-<n>" (the file without .mp3).
const VOICE_INDEX = new URL("../../web/public/audio/voice/index.json", import.meta.url).pathname
type Rendered = { file: string; text: string }
let rendered: Record<string, Record<string, Rendered[]>> = {}
const loadVoices = () =>
  Bun.file(VOICE_INDEX).json().then((d: { voices?: typeof rendered }) => void (rendered = d.voices ?? {}), () => {})
void loadVoices()
setInterval(loadVoices, 30_000).unref?.()
const GENERIC: Situation[] = ["crowded", "empty", "possessed", "losing", "winning"]
/** A rendered line for this hunter + situation (its spoken tags stripped for the subtitle), or null. */
export function renderedLine(id: HunterId, s: Situation): { text: string; voice: string } | null {
  if (!GENERIC.includes(s)) return null
  const pool = (rendered[id]?.[s] ?? []).map((r) => ({ text: r.text.replace(/\[[^\]]*\]\s*/g, "").trim(), voice: r.file.replace(/\.mp3$/, "") })).filter((r) => r.text && r.text.length <= 70)
  return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null
}
