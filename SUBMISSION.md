# SUBMISSION: Haunt the Room (Builderbase)

Counts (15:20, L31): tagline 80/80, short 271/280, long 1,474/1,500. `[people]` is still open (see
Numbers); a 3-digit count adds 0 chars net to the long text (`[people]` is 8 chars).

## Links

- Live: https://haunt.gessa.ai (phone: `/p`, projector view: `/watch`). Both answered 200 at 15:20.
- **Judges can play anytime:** play on your phone at https://haunt.gessa.ai/p and watch at
  https://haunt.gessa.ai/watch. Between demos it runs in auto mode, with bot ghosts filling the house (bots are
  labelled as bots, never counted as people).
- Repo: [REPO URL]
- Video (60-90 s): [VIDEO URL]

## Name

Haunt the Room

## Tagline (<= 80 chars, 80)

Hide from four AI hunters. Lie to one. Watch it believe you and betray the rest.

## Short description (<= 280 chars, 271)

You are the ghosts. They are AI. Lie to them. Scan a QR, take a seat in a haunted mansion, and whisper a lie to one of four AI hunters. At a candlelit table they argue over Agent Relay, believe you, and turn on each other. Mid-round we kill -9 the game: no phone notices.

## Long description (<= 1,500 chars, 1,474)

Haunt the Room turns a crowd into ghosts. Scan the QR and your phone is a ghost in a painted mansion on the projector. Each beat you take a seat in one of six rooms, and seats run out. Then the screen cuts to the Cabal: four AI hunters at a candlelit table, the Exorcist, the Medium, the Skeptic and the Priest, who argue out loud and vote two rooms to search.

Your weapon is a lie. Pick a hunter and blame a room ("everyone's in the crypt"). Only that hunter hears it; each has its own private memory. Lies add up into a conviction needle the room can watch swing, votes follow conviction, and sometimes a hunter says one room and votes another. When they search the room you named and come up empty, your phone says Believed. Otherwise Found or Safe.

Each hunter is its own Agent Relay agent: the table is their #hunt channel, your lie is a DM from an agent called the-dead, and votes are typed actions a referee agent applies to the game. Lines come from an LLM (Gemini 2.5 Flash Lite via OpenRouter) with an authored line bank as backup, so the table never goes quiet. Voices are ElevenLabs.

Every phone has its own Terse Durable Actor; one House actor runs the clock on alarms with absolute deadlines. On stage we kill -9 the process running the game mid-round: in testing it came back in under a second, no phone disconnected, same rooms, same clock.

Today the live house ran 34 rounds and 543 messages crossed Agent Relay. [people] people played on real phones.

## What is AI here

- **Live AI:** what each hunter says at the table and what it believes, generated per beat by an LLM
  (`google/gemini-2.5-flash-lite` via OpenRouter, one batched call per beat, `coven/src/think.ts`). Every model line passes a
  line law (must name a real player, room, count or beat; banned phrases refused) or an authored bank line speaks
  instead, so not every line on screen is generated.
- **Rules, not a model:** how lies move a hunter's conviction and how conviction becomes a vote are deterministic
  code in `coven/src/hunters.ts` (each lie adds pull toward its room; the Medium believes fastest, the Exorcist
  needs three liars or the count to agree, the Skeptic leans against the majority; the Priest and Skeptic sometimes
  vote against their stated lean).
- **AI-made assets:** hunter voices rendered with ElevenLabs (`eleven_v3`, pre-rendered lines played on game
  events, `web/public/audio/voice/index.json`); the hunter bust portraits and trailer key art with
  Gemini image generation via OpenRouter; the 3D house and cabal table are Blender renders built by script.
- **Not AI:** game rules, scoring, timing, the actors and the networking. Ghost names are a hash of the phone's id;
  the crowd's lies are fixed templates (no free text from the crowd reaches an agent or the screen).

## 1. Use of real-time AI and track technology

**Both sponsor technologies are load-bearing, and both are on the projector.**

- **Agent Relay** (`coven/`): four hunters, a referee and the-dead are each their own Relay identity. The table is
  the `#hunt` channel. A lie is a DM from the-dead to ONE hunter, so only that hunter knows it until it says it at
  the table; the others then mock it by name. Lean (room, conviction 0-100, swayed by whom) and the vote (`sweep`)
  are typed actions; the referee applies them to the House. Typed actions are the only way an agent touches the
  game.
- **Terse Durable Actors** (`actors/src/actors.ts`): one `Ghost` actor per phone with its own SQLite; one `House`
  actor whose alarm heartbeat (about 10 Hz) runs every HIDE / HUNTING / REVEAL deadline as an absolute timestamp;
  websocket fan-out by tag (stage snapshots, room counts to phones, personal results to one ghost); ping answered
  without waking the actor; per-socket admission control; a batched `House.hides()` RPC so hundreds of taps cost
  one call.
- **kill -9 on stage:** we kill the House's executor process mid-round. Live state is `@Ephemeral`, snapshotted to
  `@Persisted` every second; a fresh process revives the actor and the clock is still on time because the
  deadlines are absolute. L2's last 10 executor kills mid-beat: median 0.42 s, worst 0.63 s, 0 sockets closed.
  The stage prints the measured gap ("Back in N s").
- **Real time:** the beat's LLM call runs during HIDE (about 3 s) so lines are ready when the table scene starts;
  a late or refused line becomes a bank line, so the room never waits on a model.

## 2. Originality and creativity

**Everyone built AI ghosts. We inverted it: the audience are the ghosts and the AIs hunt them.**

- Deceiving agents is the mechanic: you pick which AI to lie to, and the game scores the lie when it lands.
- The audience can see the true counts while a hunter believes a lie: the comedy is dramatic irony.
- Four characters with status games: a tired Exorcist on overtime, a Medium who believes every whisper, a Skeptic
  who mocks her and is wrong anyway, a vain Priest. They remember who lied to them and betray each other at the
  vote.
- We kill the game's process as a feature, live, mid-round.

## 3. Execution and demo

**It runs live at https://haunt.gessa.ai.**

- The live house has run 34 rounds today; 543 messages crossed Agent Relay (270 hunter lines, 35 DMs, 229 referee
  posts). [people] people played on real phones.
- Peak 792 sockets online at once (195 of them bots; the other 597 include QA's synthetic phones, so they are not
  a people count).
- Load test (`bots/LOAD-REPORT.md`, 14:11): 500 bots, 600 sockets, 99.8% connected on the first try; at that load
  hide replies slowed to seconds (p95 5.3 s), traced to the actor host's socket output; the House now sends fewer frames (not re-measured at 500 since).
- Failure is designed in: bots fill a thin room and retire as people join, bank lines cover a slow model, a
  missing vote falls back to the most crowded rooms, phones auto-rejoin after an outage.

## 4. User experience and design

**Kahoot-simple, horror-movie pretty.**

- One tap per beat: take a seat. One optional move: Lie to the AI (pick a hunter, pick a room). No account, no
  typing.
- Your phone tells you who you are, in your colour, and every outcome reads in a second: Found, Safe, Believed,
  Haunted.
- Painted mansion, a full-screen candlelit table with huge subtitles and conviction needles, voiced hunters,
  flashlight reveals, a blood-red finale on every phone at the same instant.

## 5. Potential and impact

**Live events, streams and classrooms become games a crowd plays against AI agents.**

- A player is an actor id, not a server slot: per-player actors scale out.
- Agents that negotiate in the open, keep private memory and can be deceived are a new kind of NPC.
- We're Gessa; tonight is one game on that idea.

## Numbers (from `bun demo/numbers.ts --print`, 15:20)

| number | value | note |
|---|---|---|
| people who played (real phones only) | [people] | OPEN: no source separates real phones from QA's synthetic phones. `joinedToday` 1977 includes them: never use it as people |
| rounds played | 34 | `.counters.rounds` (includes bot-only auto rounds) |
| Relay messages | 543 | 270 hunter lines, 35 DMs, 9 lies, 229 referee |
| peak sockets online | 792 | 597 non-bot (includes QA synthetic phones) + 195 bots |
| sweeps / caught / possessions | 360 / 12,154 / 96 | `.counters` (mostly bots) |
| kill -9 recovery | 0.42 s median, 0.63 s worst, 0 sockets closed | `lanes/L2.md` 14:58, 10 executor kills mid-beat. NOT from numbers.ts: its "last outage" (31.6 s) is a whole-server restart during a release, not an executor kill |
| load test | 500 bots / 600 sockets, 99.8% connect, hide p95 5.3 s | `bots/LOAD-REPORT.md` 14:11 (RED at the time) |
