# COPY (L18): exact string replacements

Voice: dry, specific, domestic. The house is a slightly shabby estate, the ghosts are guests who happen to be dead,
the hunters are four professionals having a bad night. No emoji, no sparkles, no tracked-caps eyebrows, no em dashes,
no "the dead remember". The room should laugh once per beat, not groan.

Routing key: each table names its owning lane. "Current" is copied exactly from the source; replace verbatim.

---------------------------------------------------------------------------------------------------------------------
## 1. contract/protocol.ts (conductor owns contract/)

### WELCOME (owner keeps "Welcome, YC")
| Current | Replacement |
|---|---|
| `kicker: "Welcome, YC,"` | `kicker: "Welcome, YC."` |
| `title: "to the Haunted House"` | `title: "You're all dead. Make yourselves at home."` |

Also (L7 stage.css `.st-intro-kicker`): drop `letter-spacing: 0.5em` to `0.02em` and keep it the same size family as the
title, so the two read as one spoken sentence, not an eyebrow over a headline. Same for `.st-intro-title`
`letter-spacing: 0.22em` -> `0.01em` (tracked small caps across a 40-char line is the AI-poster look).
Fallback title if the owner wants it shorter: `"Wipe your feet."`

### INTRO_CARDS (4 s each; read aloud-able in under 3 s)
| Current | Replacement |
|---|---|
| `{ title: "Hide.", body: "Tap a room before the bell." }` | `{ title: "Hide.", body: "Pick a room on your phone. Change your mind until the bell." }` |
| `{ title: "They hunt.", body: "Four AI hunters pick two rooms. Don't be in them." }` | `{ title: "Four AIs come looking.", body: "They search two rooms. Be in neither." }` |
| `{ title: "Take the house.", body: "Crowd a room they skip. Hold three rooms to win." }` | `{ title: "Move in.", body: "Pack a room they skip and it's haunted. Haunt three, keep the house." }` |

Note: the phone hide screen reuses `INTRO_CARDS[0].title/body` as its header, so card 1 must also read as an
instruction mid-game. "Pick a room on your phone." works there too.

### LURE_TEMPLATES (sent to a hunter as a DM from "the-dead"; shown on the stage feed). `{room}` appears ONCE per
template: `lureText` uses `String.replace`, which replaces only the first match.
| Current | Replacement |
|---|---|
| `"They're all hiding in {room}."` | `"Psst. Everyone's in {room}. Don't tell the others."` |
| `"I saw dozens of them in {room}."` | `"{room}. Trust me, I'm dead."` |
| `"{room}. Go now. They're all there."` | `"I'd never hide in {room}. Too obvious. Anyway, bye."` |

(Third one is the double-bluff: it reads like a lie that is a lie. The Medium will still take it; the Skeptic gets a
line out of it.)

### HUNTERS persona (feeds the LLM prompt; this is where the four voices come from)
| id | Current persona | Replacement persona |
|---|---|---|
| exorcist | `"veteran, commanding, blunt; leads the hunt"` | `"thirty years in the trade, tired, unhurried, wants to be home by eleven; gives orders by name; treats ghosts like a plumbing problem; never raises his voice"` |
| medium | `"senses spirits, gullible, theatrical; trusts whispers"` | `"theatrical and sincere, narrates her own feelings, calls ghosts darling, believes every whisper and is crushed when lied to, then believes the next one"` |
| skeptic | `"dry, sarcastic, data-driven; distrusts the Medium"` | `"deadpan, petty, keeps a running tally of everyone's mistakes (mostly the Medium's), refuses to say the word ghost, says 'subjects' instead"` |
| priest | `"pious, dramatic, secretly vain; seals doors"` | `"vain and operatic, mentions his robes, his voice or his good side, takes credit for every catch, blames the Medium for every miss"` |

### Comment only (not user-facing, but it misleads lanes)
| Current | Replacement |
|---|---|
| `name: string // generated, e.g. "Wraith #212"; never user text` | `name: string // generated, e.g. "Aunt Mabel"; never user text` |

---------------------------------------------------------------------------------------------------------------------
## 2. Stage (L7): web/src/stage/hud.ts, web/src/stage/index.ts

| File:line | Current | Replacement |
|---|---|---|
| hud.ts:108 | `mk("ghosts online")` | `mk("haunting now")` |
| hud.ts:108 | `mk("humans")` | `mk("actual people")` |
| hud.ts:108 | `mk("joined today")` | `mk("died today")` |
| hud.ts:170 | `"AI AGENT"` | `"AI agent"` (and drop uppercase/tracking on `.st-card-ai`) |
| hud.ts:177 | `"scan to haunt"` | `"it's painless"` |
| hud.ts:179 | `"Scan to die"` | `"Scan to pass away."` (owner call: keep "Scan to die" if it's in his opening; see note) |
| hud.ts:180 | `"Your phone becomes a ghost in this house. Hide from the exorcists. Possess the rooms."` | `"Your phone becomes a ghost in this house. Four AIs will try to find it."` |
| hud.ts:182 | `"ghosts in the house"` | `"dearly departed"` |
| hud.ts:186 | `"THE HOUSE IS DEAD"` | `"The house is dead."` |
| hud.ts:189 | `"…but the dead remember"` | `"Nobody moved."` |
| hud.ts:248 | `"the doors are open"` | `"the door's open"` |
| hud.ts:248 | `"the reckoning"` | `"closing time"` |
| hud.ts:290 | `"who's winning · top 5"` | `"best ghosts so far"` |
| hud.ts:382 | `"Hide! Tap a room on your phone"` | `"Pick a room on your phone."` |
| hud.ts:385 | `"THE AI HUNTERS ARE CHOOSING…"` | `"The hunters are arguing."` |
| hud.ts:386 | `"4 AI agents vote · the top 2 rooms get swept"` | `"Four AI agents, one vote each. The top two rooms get searched."` |
| hud.ts:391 | `` `the AI hunters swept: ${names.join(" & ")}` `` | `` `They searched the ${a} and the ${b}.` `` (names already have "The " stripped) |
| hud.ts:459 | `"most haunting"` | `"most haunting"` (keep; it's good) |
| hud.ts:500 | `"a lie took hold"` | `"somebody lied"` |
| hud.ts:569 | `` `signal lost ${s} s · reconnecting · the clock never stops` `` | `` `gone for ${s} s. The clock didn't notice.` `` |
| hud.ts:575 | `` `back in ${s} s · every ghost where it was · clock on time` `` | `` `Back in ${s} s. Same rooms, same clock.` `` |
| hud.ts:588 | `"THE HOUSE IS YOURS"` | `"THE HOUSE IS YOURS"` (keep; it's the presenter's line) |
| hud.ts:588 | `"EXORCISED"` | `"EXORCISED"` (keep) |
| hud.ts:604/612 | `` `${n} ecto` `` | keep |
| hud.ts:627 | `"ghosts joined today"` | `"people died today"` |
| hud.ts:628 | `"durable actors at once"` | `"Durable Actors at once"` |
| hud.ts:629 | `"relay messages"` | `"messages on Agent Relay"` |
| hud.ts:630 | `"souls banished"` | `"ghosts caught"` |
| hud.ts (newLeader) | `` `NEW #1: ${name}` `` | `` `${name} is winning` `` |
| index.ts:160 | `"EMPTY!"` | `"Empty."` |
| index.ts:164 | `` `${n} CAUGHT` `` | keep |
| index.ts:181 | `"POSSESSED"` | `"HAUNTED"` (matches the phone and the cards; "possessed" stays in the counter) |
| index.ts:199/201 | `` `${liar} fooled ${fooled}` `` | `` `${liar} lied to ${fooled}. It worked.` `` |
| index.ts:215 | `"a ghost"` | `"someone"` |
| index.ts:223 | `` `${name} · ON FIRE` `` | `` `${name}, three in a row` `` |
| index.ts:276 | `"THE DOORS ARE OPEN"`, `"scan the code · become a ghost"` | `"The door's open."`, `"Scan the code. Leave your body at the door."` |

Keep: `"N of 3 rooms possessed"`, `"Haunt the Room"`, presenter hint, fps line.

Note on "Scan to die": it is in SPEC's opening beat and fine as a joke said out loud, but on a 6 m QR it reads as stock
horror. "Scan to pass away." gets the laugh and sets up the euphemism voice the phone uses ("Passing away…").
Either works; do not use both.

### Feed (L7): web/src/feed/index.ts
| Current | Replacement |
|---|---|
| `"4 AI agents hunting you · live on Agent Relay"` | `"Four AI agents discussing you. Live on Agent Relay."` |
| `"a whisper from the dead"` | `"a ghost, lying"` |
| `"PRIVATE"` | keep (load-bearing for Best Agent Relay) |
| `"0 messages"` | keep |

### Referee lines posted to Relay (L3, coven/src/referee.ts:28-29, hunters.ts:347). They show in the feed; the feed
already badges them "RULES", so the emoji is a second label.
| Current | Replacement |
|---|---|
| `` `⚖️ taunt · ${who}: "${text}"` `` | `` `taunt, ${who}: "${text}"` `` |
| `` `⚖️ vote · ${who} → ${room}` `` | `` `${who} votes ${room}` `` |
| `` `⚖️ vote refused · ${who} → ${room}: ${reason}` `` | `` `${who}'s vote for ${room} refused: ${reason}` `` |
| `` `⚖️ sweep · ${room}: ${n} caught · ...` `` | `` `searched ${room}: ${n} caught · ...` `` |

### stage3d (L7): web/src/stage3d/index.ts
| Line | Current | Replacement |
|---|---|---|
| 80 | `"THE HOUSE IS DEAD"` | `"The house is dead."` |
| 174 | `"Phones out"` | keep |
| 175 | `hide: "Hide!"` | `hide: "Hide."` |
| 175 | `hunting: "The Hunt"` | `hunting: "They're arguing"` |
| 175 | `reveal: "Kill Cam"` | `reveal: "Flashlights"` |
| 175 | `"The Hunters Win"` / `"The House Is Yours"` | `"Exorcised"` / `"The house is yours"` (sentence case, same as the phone) |
| 186 | `"Scan to die."`, `` `${n} ghosts in the house` `` | `"Scan to pass away."`, `` `${n} dearly departed` `` |
| 199 | `"<h3>Most haunting</h3>"` | keep |
| 233 | `` `${why} · the clock keeps running` `` | `` `${why}. The clock didn't notice.` `` |
| 329 | `"POSSESS"` | `"HAUNTED"` |
| stage3d.css | `.s3-kicker` `letter-spacing: .18em; text-transform: uppercase` | `letter-spacing: .02em; text-transform: none` |

---------------------------------------------------------------------------------------------------------------------
## 3. Phone (L6): web/src/play/index.ts, play.css

| Line | Current | Replacement |
|---|---|---|
| 32-35 | `CAUGHT_LINES` | see block below |
| 37 | `safe: "Safe"` | keep |
| 37 | `caught: "Caught!"` | `caught: "Caught."` |
| 37 | `possessed: "Possessed"` | `possessed: "Haunted"` |
| 37 | `lie: "Your lie worked"` | `lie: "They fell for it."` |
| 110 | `"Lure here"` | `"Send them here"` |
| 166, 224 | `"👋 That's me!"` | `"Which one's me?"` |
| 168 | `"You're in. Watch the big screen."` | `"You're dead. Eyes on the big screen."` |
| 193, 324 | `"🤫 Lure a hunter"` | `"Lie to a hunter"` |
| 324 | `"Tap a room to lure them there"` | `"Tap the room you want searched"` |
| 324 | `"🤫 Lure sent"` | `"Lie told"` |
| 199 | `"You're out this beat"`, `"Back next beat."` | `"Caught. Sit this one out."`, `"You're back next beat."` |
| 208 | `"The hunters are choosing…"` | `"The hunters are arguing about you."` |
| 234-235 | `"The house died."`, `"You didn't."` | keep (presenter line) |
| 236 | `"Finding your way back…"` | `"Hold still. The house is coming back."` |
| 240, 616 | `"Rising from the grave…"` | `"Passing away…"` |
| 616 | `"The house is sealed. Knocking again…"` | `"The door's stuck. Knocking again…"` |
| 297 | `` `${me.rank === 1 ? "👑 " : ""}#${rank} of ${of}` `` | `` `#${rank} of ${of}` `` |
| 303 | `` `🔥 ON FIRE ${mult}` `` / `` `🔥 ${mult}` `` | `` `On a roll ${mult}` `` / `` `${mult}` `` |
| 332 | `` `Hiding in ${ROOM_NAME.get(room)}` `` | `` `You're in ${ROOM_NAME.get(room)!.replace(/^The /, "the ")}.` `` |
| 332 | `"You didn't hide!"` | `"You didn't pick a room. Bold."` |
| 339 | `` `The AI hunters picked ${swept.join(" and ")}.` `` | `` `They searched ${swept.map(lower).join(" and ")}.` `` (lower = "The X" -> "the X") |
| 342 | `"Flashlights…"` | keep |
| 349 | `` `🔥 streak ${mult}` `` | `` `Streak ${mult}` `` |
| 354 | `` `AI hunter ${hunter.name} picked ${where}. You were there.` `` | `` `${hunter.name} searched ${lower(where)}. You were in it.` `` |
| 355 | `` `${name} [AI] says:` `` | `` `${name} [AI]:` `` |
| 356 | fallback `"Boo."` | `"Found you."` |
| 357 | `"You sit out the next beat."` | `"Sit out the next beat and think about what you did."` |
| 383 | `"The house is yours"` / `"Exorcised"` / `"The night is over"` | keep / keep / `"That's the night."` |
| 384 | `"The ghosts took the house."` | `"The hunters have left. One of them was crying."` |
| 384 | `"Dawn. The hunters cleansed the house."` | `"The house is clean. The Priest is taking a bow."` |
| 385 | `` `✦ ${score}` `` | `` `${score} ecto` `` (sparkle glyph is the tell) |
| 398 | `"Reconnecting…"` | keep |
| 424/428 | `"The house is too noisy. Try again…"` | keep (good) |
| 430, 435 | `"Your lie was lost in the wind."` | `"Nobody heard that. Try again."` |
| 432 | `` `${hunter.name} heard you. “They're in ${room}.”` `` | `` `${hunter.name} heard you. Let's see if they bite.` `` (the quoted text no longer matches the lure) |
| 456 | `"Look up: you're glowing on the big screen."` | `"Look up. You're the bright one."` |
| 508 | `` `You passed ${name}!` `` / `` `Up to #${rank}!` `` | `` `You passed ${name}.` `` / `` `Up to #${rank}.` `` |
| 604 | `"Back in the house. It remembers you."` | `"Back. Same room, same score."` |
| 656 | `"You are"` | keep, but drop `.hr-splash-you` `letter-spacing: 0.3em` to `0.02em` (tracked eyebrow over the name) |
| play.css:462 | `content: "👻 Possessed"` | `content: "Haunted"` |
| play.css | `.hr-hide-beat` 0.16em, `.hr-rev-by` 0.14em, `.hr-lure-mark` 0.14em, `.hr-who-label` 0.22em, `.hr-dead-sub` 0.2em | all to `letter-spacing: 0.02em`, no uppercase. One tracked label on a screen is style; five is a template. |

CAUGHT_LINES (index.ts:31-36), replacement:
```ts
const CAUGHT_LINES: Record<HunterId, readonly string[]> = {
  exorcist: ["There you are.", "Found one. Write it down.", "Back in the box."],
  medium: ["Darling, I felt you. Through the floor.", "Go towards my voice.", "Oh, you're cold. Poor thing."],
  skeptic: ["Subject located. Unremarkable.", "I had you at sixty percent.", "That's one for me."],
  priest: ["Kneel. Wait, can you kneel?", "Blessed. You're welcome.", "Did you see my good side?"],
}
```

### BUG for L6 + L2 (copy-visible): the caught line never shows
actors/src/actors.ts:484 sends `text: "CAUGHT by The Exorcist"`, so phone line 356 renders
`“CAUGHT by The Exorcist”` in quote marks as if the hunter said it; `CAUGHT_LINES` is dead. Same for possessed/lie
(line 361 shows `"POSSESSED The Ballroom +150"`, `"YOUR LIE WORKED +200"` raw). Fix: actors send `text: ""` for caught
(or a real hunter line), and the result texts below:
| actors.ts | Current | Replacement |
|---|---|---|
| 484 | `` `CAUGHT by ${hunterName(hunter)}` `` | `""` (phone picks a CAUGHT_LINES entry for `hunter`) |
| 499 | `` `SAFE +${points}${mult > 1 ? ` x${mult}` : ""}` `` | keep (phone does not render it for safe) |
| 509 | `` `POSSESSED ${r.name} +${SCORE.possessRoom}` `` | `` `${r.name} is haunted now. You helped.` `` |
| 522 | `` `YOUR LIE WORKED +${SCORE.lieWorked}` `` | `` `${hunterName(lure.hunter)} believed you. Everyone saw.` `` |

### Ghost names (L2, actors/src/identity.ts). Mostly charming already. Tells: generic ghost nouns produce
"Quiet Whisper", "Pale Wisp", "Gentle Mist" (reads generated); "Otto" in both lists gives "Otto Otto". Replacements:
| List | Remove | Add |
|---|---|---|
| FIRST | `"Pale", "Old", "Sleepy", "Quiet", "Gentle", "Little"` | `"Aunt", "Uncle", "Cousin", "Nana", "Dr.", "Lady"` |
| LAST | `"Otto", "Whisper", "Wisp", "Mist", "Dusk", "Velvet"` | `"Pickering", "Crumb", "Underhill", "Mothwick", "Bassett", "Pennyworth"` |
Longest result: "Juniper Pennyworth" = 18 > NAME_MAX 16. If L2 enforces 16 on generated names, use `"Penny"` for
`"Pennyworth"` and `"Mothwick"` stays (Juniper Mothwick = 16). Result reads like a seating chart: "Aunt Mabel" is not
possible (Mabel is a first) but "Aunt Thistle", "Dr. Crumb", "Nana Raven", "Hazel Underhill", "Cousin Bramble".

---------------------------------------------------------------------------------------------------------------------
## 4. Coven rule lines (L3): coven/src/hunters.ts (fallback lines when the LLM is slow; shown on stage + phones)

```ts
const ARGUE: Lines = {
  exorcist: [(r) => `${r}. Everyone, ${r}. Let's go home.`, (r) => `Crowd's in ${r}. Obviously.`, (r) => `${r}. I've done this before.`],
  medium: [(r) => `${r}. My elbows are tingling.`, (r) => `Something in ${r} wants a hug.`, (r) => `${r}! I can smell lavender!`],
  skeptic: [(r) => `${r} has the numbers. Look.`, (r) => `${r}. Unlike the Medium, I counted.`, (r) => `Subjects clustering in ${r}.`],
  priest: [(r) => `${r}. The acoustics suit me.`, (r) => `I choose ${r}. Follow me.`, (r) => `${r} needs a priest. Fortunately.`],
}
const BELIEVE: Lines = {
  exorcist: [(r) => `Whisper matches the count. ${r}.`],
  medium: [(r) => `A spirit told me ${r}! Personally!`, (r) => `${r}. They trust me. I can tell.`],
  skeptic: [(r) => `Fine. ${r}. I'm noting I agreed.`],
  priest: [(r) => `A spirit asked for me by name. ${r}.`],
}
const DOUBT: Lines = {
  exorcist: [(r) => `A ghost says ${r}. Ghosts lie.`],
  medium: [(r) => `${r}? The spirits sound unsure.`],
  skeptic: [(r) => `A ghost said ${r}? Noted. Ignored.`, (r) => `${r}? The Medium will buy that.`],
  priest: [(r) => `${r}? I don't take requests.`],
}
const CAUGHT: Lines = {
  exorcist: [(r) => `${r}. Told you. Next.`, (r) => `${r}, done. Who's got coffee?`],
  medium: [(r) => `${r}! I FELT that!`, (r) => `${r}. Go gently, darlings.`],
  skeptic: [(r) => `${r}. Called it. Writing that down.`, (r) => `${r}, as predicted. By me.`],
  priest: [(r) => `${r}, cleansed. By me, specifically.`, (r) => `${r}. Did everyone see that?`],
}
const FOOLED: Lines = {
  exorcist: [(r) => `Empty ${r}. Who listened to a ghost?`],
  medium: [(r) => `${r} was EMPTY? They seemed so honest!`, (r) => `The spirits lied about ${r}. Again.`],
  skeptic: [(r) => `Empty ${r}. I'd like it minuted.`],
  priest: [(r) => `${r}, empty. The Medium's fault.`, (r) => `They flattered me into ${r}. It worked.`],
}
const MISSED = [(r) => `${r}. Nobody. They're learning.`, (r) => `${r}, empty. Somebody talked.`]
const BANTER = {
  exorcist: ["Let's be quick. I've got a sitter.", "Same as last time. Lights, then rooms.", "Nobody votes before I do."],
  medium: ["So many of them. All so young.", "Something just touched my scarf.", "The house is hungry. Or I am."],
  skeptic: ["Ghost count rising. Still not real.", "I brought a clipboard. You brought candles.", "Medium, sit down before you faint."],
  priest: ["My holy water is imported.", "Do the acoustics carry? Good.", "I'll lead. Thank me after."],
}
const SCHEME (DMs) = {
  exorcist: [{ to: "skeptic", text: "Vote with me. The Medium's guessing again." }, { to: "priest", text: "Ignore her ghosts. Follow my count." }],
  medium: [{ to: "exorcist", text: "The Skeptic is jealous of my gift. Watch him." }, { to: "priest", text: "The spirits whisper about you. Mostly the hair." }],
  skeptic: [{ to: "exorcist", text: "The Medium is zero for three. I've been counting." }, { to: "priest", text: "The Exorcist takes credit for my numbers." }],
  priest: [{ to: "skeptic", text: "Between us, I carry this team." }, { to: "exorcist", text: "Tell them I caught the big ones." }],
}
```
(Keep the existing const names in hunters.ts; above is content only. `MISSED`/`BANTER`/`SCHEME` names may differ in source:
`MISSED` line 67, banter table line 69, DM table line 75.)

Other coven lines:
| hunters.ts | Current | Replacement |
|---|---|---|
| 363 | `"Lights on. The hunt begins."` | `"Right. Lights on. Let's get this over with."` |
| 369 | `"The house is theirs. Retreat."` | `"It's their house now. Get the van."` |
| 369 | `"House cleared. Good hunting."` | `"House is clean. Invoice is in the post."` |
| 405 | `` `${room}? That whisper lied. I remember.` `` | `` `Lights are back. ${room} was a lie.` `` |
| 405 | `"The lights died. We didn't."` | `"Power cut. Nobody move. Oh, they didn't."` |

ROLE (hunters.ts:30-33) aligns with the new personas; replacements:
| id | Replacement |
|---|---|
| exorcist | `"You lead and give orders by name. You check every whisper against the counts. You sound bored, never scared."` |
| medium | `"You believe whispers from ghosts and vote for them. You describe what you feel in your body. Call ghosts darling."` |
| skeptic | `"You trust only the counts, ignore whispers, and point out the Medium's mistakes with exact numbers. Never say ghost; say subject."` |
| priest | `"A flattering whisper sways you. You take credit for catches and blame the Medium for misses. Mention your robes or voice."` |
Add to PG13 / system prompt one sentence: `"Never use these words: delve, unleash, restless, doom, beware, spirits are, you can run."`
(cheap guard against stock horror from the model; `clean()` stays as is).


---------------------------------------------------------------------------------------------------------------------
## 5. Hunter voice lines (L10): copy/lines.json

- Drop-in replacement for audio/lines.json: same keys (`_`, `cast`, `lines.<hunter>.<event>[4]`), 160 lines, all
  <= 8 words, no emoji, no em dashes, variant 1 of every `back` pool is still the Crypt-was-a-lie line.
- Route: L10 copies copy/lines.json over audio/lines.json and re-renders (`bun audio/render-voices.ts openai`).
- 114 of 160 lines rewritten; 46 of L10's were already right (mostly the Skeptic's and the Priest's) and are kept.
- Removed: every "three hundred" (wrong whenever the room isn't 300), "Unholy! Unclean! Unacceptable!" (tricolon),
  "Light 'em up!", "This room is mine now." and other action-movie stock.
- `cast.*.openai.instructions` retuned to the four voices (tired professional / sincere, gullible aunt / petty
  scorekeeper / operatic and vain). `say` fallbacks unchanged.
- Voice map per hunter: Exorcist talks about the job (van, invoice, paperwork, hourly); Medium about her body and
  feelings (elbows, third eye, darling); Skeptic about the tally (record, minuted, model, subject); Priest about
  himself (robes, hair, good side, applause).

---------------------------------------------------------------------------------------------------------------------
## 6. Docs (L11): DEMO.md, README.md, SUBMISSION.md

The docs are already plain and specific; the fixes are mostly UI quotes that no longer match the product.
| File:line | Current | Replacement |
|---|---|---|
| DEMO.md:43 | `giant QR "Scan to die"` | `giant QR "Scan to pass away."` (only if the owner takes A on the QR line) |
| DEMO.md:44 | `phones: "You are Wraith #212" in its colour` | `phones: "You are Cousin Bramble" in its colour` |
| DEMO.md:51 | `"Lure a hunter"` (twice, incl. `"Tap 'Lure a hunter'. Pick an empty room. Lie to them."`) | `"Lie to a hunter"`; founder line: `"Tap 'Lie to a hunter'. Pick an empty room."` (the button already says lie) |
| DEMO.md:52 | `DM from the-dead "They're all hiding in The Crypt."` | `DM from the-dead "Psst. Everyone's in The Crypt. Don't tell the others."` |
| DEMO.md:53 | `phones "Your lie worked"` | `phones "They fell for it."` |
| DEMO.md:53 | `"You just lied to an AI, and it worked."` | keep |
| DEMO.md:58 | `"Crowd up and possess a room, or spread out and survive."` | `"Pack a room and it's haunted. Spread out and you live. Pick one."` |
| DEMO.md:43 | `"You are the ghosts. They are AI. Lie to them."` | keep (it's a tricolon, but it's said, and it's the hook) |
| README.md:54 | `"back in 0.2 s · every ghost where it was · clock on time"` | `"Back in 0.2 s. Same rooms, same clock."` |
| README.md:74 | `"Lure a hunter"` | `"Lie to a hunter"` |
| SUBMISSION.md:30 | `("They're all hiding in the Crypt")` | `("Psst. Everyone's in the Crypt.")` |
| SUBMISSION.md:31 | `your phone says "Your lie worked".` | `your phone says "They fell for it."` |
| SUBMISSION.md:97 | `("You are Wraith #212", in your colour) and "That's me!" lights your ghost` | `("You are Cousin Bramble", in your colour) and "Which one's me?" lights your ghost` |
| SUBMISSION.md (Long) | `caught, safe, possessed.` | keep |

"Cousin Bramble" assumes L2 takes the name rows in s3; otherwise use any real output of ghostIdentity(), e.g. "Hazel Thistle".
Recount SUBMISSION long description after the swaps: the lure example is +4 chars, "They fell for it." is -2.
