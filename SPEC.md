# HAUNT THE ROOM (working title; the owner names it)

One sentence: the whole audience scans a QR code and becomes a ghost in a painted haunted mansion on the big
screen; four AI exorcists plot over Agent Relay and hunt the room live; every ghost is a Durable Actor, so when we
`kill -9` the server mid-hunt, 300 ghosts come back exactly where they were and the clock never misses a beat.

Opening line: "Every team today built AI ghosts. Tonight, YOU are the ghosts. Phones out."

## Why this (decided 12:20; evidence)

- Blind tournament (12:12-12:16): 8 designers who never saw our plans; 6 judges scoring anonymized plans in
  rotated order. Winner "HAUNT THE ROOM": 3 of 6 judge picks, won all 3 head-to-heads, highest delivery feasibility
  of the room-scale plans. Our previous plan (prompt-to-game "Conjure") ranked last (dead air while generating,
  unpredictable output, basic visuals). 5 of 8 independent designers converged on this shape.
- Crowd model: 20 samples of what other teams' AIs propose from the same page: mostly "AI ghosts haunt a house"
  (several literally named Seance) and agent factories. We invert it: the room are the ghosts, the AIs are hunted
  by them and hunt them. We say so in the first sentence, so 10 Seance demos make ours stronger, not weaker.
- It obeys every owner directive: the demo is the metric, simple backend, extravagant demo, visual fidelity, no
  test suites, nothing invisible.

## The finalist demo (3:00; a 1:30 cut is in DEMO.md when written)

| t | What the room sees | Presenter says |
|---|---|---|
| 0:00 | Dark painted mansion, rain, a giant QR: "Scan to die." | "Every team today built AI ghosts. Tonight, you are the ghosts. Phones out." |
| 0:10 | Join counter climbs 0 -> 300; one glowing wisp per phone pours in through the door with a whoosh; each phone says "You are Wraith #212" in its colour | (let it breathe) |
| 0:35 | Four exorcists walk in with flashlight cones; the Relay feed on the right lights up: "Exorcist -> #hunt: Ballroom is packed. Skeptic, seal the east door." | "Each of you is now a Durable Actor with its own database. Those four are AI agents talking to each other over Agent Relay. Survive them." |
| 0:45-1:30 | The hunt. Phones flash "THE EXORCIST IS COMING TO THE LIBRARY - FLEE" 2 s before each sweep; a river of light streams between rooms; caught phones go dark; 40 ghosts possess the Ballroom and the chandelier crashes. Hunters speak through the PA. | (react with the room) |
| 1:30 | Whisper beat: phones get a WHISPER button (preset lies). The feed shows the Medium: "a spirit says they're all in the Crypt"; a PRIVATE DM between hunters; the hunters charge the empty Crypt. | "Ghosts... lie to them." |
| 1:50 | THE KILL: a terminal on screen, `kill -9 <pid>`. Projector: static. Every phone: "The house died. You didn't." Supervisor restarts in ~2 s. Every wisp returns to the same room, the round clock is still on time, a hunter says "...the Crypt was a lie." | "This is all running on my laptop. Watch." ... "Durable." |
| 2:20 | Finale: the ghosts take the house; every phone and the projector flood blood red at the same instant | "The house is yours." |
| 2:35 | Numbers from today (ghosts joined, actors alive, Relay messages, peak sockets) and the close | "We're Gessa. We build the consumer AI multiplayer game platform: every player a durable actor, every AI character a real agent. This is what the next multiplayer game looks like." |

## What judges score, and where we score it

- 1st place ("very well-executed products or incredibly creative use cases", both sponsors): the room plays; it
  works live; it looks like a shipped game; both sponsor technologies are load-bearing and visible.
- Best Durable Actors (Terse): one Ghost actor per phone with its own SQLite; one House actor whose alarms run the
  round clock, the 2 s sweep telegraphs and the 5 s banish timers; websocket fan-out to 300 phones and the stage;
  `kill -9` survival with the clock still on time.
- Best Agent Relay: four agents in #hunt plus private DMs (badged on screen); typed actions (sweep, seal, taunt)
  are the ONLY way the agents touch the world (a referee applies them to the House); the crowd's whispers arrive
  as DMs; the observer feed is the right-hand panel.
- OpenAI: the hunters' brains, their voices (TTS), and the painted art.
- Scale to millions: per-player actors, a 500-bot load test, live numbers.

## Scope

KEEP (load-bearing for the demo): House + Ghost actors with alarms and persistence; hunters on Relay with typed
actions; phone client; projector stage; server with join/whisper/presenter controls; supervisor auto-restart;
bots; art; audio.
CUT: game generation, the QuickJS sandbox, Forge/Gallery, the playtester, the iframe runner, any free text from
the crowd on screen (names are generated, whispers are presets).

## Architecture

```
phones (venue wifi) --https/wss--> cloudflared tunnel --> Mac :3300 server (Bun/express)
   /api/join /api/whisper /api/presenter/* /api/relay/observer, static web, and a websocket proxy so phones only
   ever talk to the public origin  --> Terse actor server :7300 (local durable-actors dev, under a supervisor
   that restarts it ~2 s after kill -9): House("main"), Ghost(playerId)
projector = a browser on the Mac at localhost:3300/stage (House socket role "stage", 10 Hz snapshots;
   Relay observer feed from the local engine)
hunters = coven/ Bun process on the Mac: four Relay agents + "referee" (typed-action handler -> House RPC);
   the server posts whispers as "the-dead" DMs. LLM: OpenAI when OPENAI_API_KEY is set, else claude -p haiku.
bots = bots/ process: bot ghosts that make the house look alive and the 500-ghost load test.
```

Ports (Mac, integration): actors 7300, server 3300, relay 8787.

## Lanes (each owns its folder; never edit another lane's folder or contract/; no git; terse status)

| Lane | Owns | Delivers |
|---|---|---|
| L2 ACTORS | actors/ | House + Ghost actors per contract; alarms; persistence; kill -9 survival |
| L3 HUNTERS | coven/ | 4 hunter agents + referee on Relay; typed actions; whisper DMs; voices cue events |
| L5 SERVER | server/, dev.sh | join, whisper, presenter, observer, ws proxy, supervisor, tunnel |
| L6 PHONE | web/src/play/ | the ghost's phone experience |
| L7 STAGE | web/ (shell, routes, web/src/stage/) | the projector: mansion, wisps, hunters, feed, clock, QR, kill + finale overlays, presenter keys |
| L8 BOTS | bots/ | bot ghosts (fill) + 500-ghost load test |
| L9 ART | web/public/art/, art/ | painted rooms, sky, hunters, title, phone thumbnails |
| L10 AUDIO | web/public/audio/, web/src/audio/, audio/ | ambience, stingers, hunter voice pools, `playCue()` |
| L11 SHIP | README.md, SUBMISSION.md, DEMO.md | submission, video, demo script (starts 14:30) |

## Gates

- 13:20 G1: phones join, move between rooms, hunters sweep over Relay, stage shows it, locally.
- 13:50 G2: tunnel up; real phones over venue wifi; kill -9 survival works end to end; owner reviews the look.
- 14:00 open practice rounds to the room (auto mode) and start counting.
- 14:40 G3: 500-bot load test green; art and audio in; two full rehearsals.
- 15:15 freeze. 15:15-15:45 video, submission, rehearse. 15:45 submitted.

## Fallbacks

- Few phones: bots fill to the target count (the stage never looks empty).
- LLM slow: hunters fall back to a rule-based move (still posting to Relay) for that turn.
- Wifi: phone hotspot; recorded backup video.
