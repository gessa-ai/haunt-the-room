# DEMO: Haunt the Room (finalist demo, 2:00 live)

Two people. **TALKER** holds the mic and a spare phone already on https://haunt.gessa.ai/p. **DRIVER** is at the
Mac: stage window focused, terminal ready. Words in quotes are said exactly.

Show mode, 4 beats. Clock after **H** (s): intro 0-16 · beat 1 hide 16, table 25, reveal 34 · beat 2 hide 38,
table 44, reveal 53 · beat 3 hide 57, table 63, reveal 72 · beat 4 hide 76, table 82, reveal 91 · finale 95.
**H at 0:08** puts every row below on its mark.

## Setup (T-10 min)

1. `cd ~/haunted-hacks && ./dev.sh status` (actors, coven, server up); https://haunt.gessa.ai/p answers.
2. Pick the kill target (first line `alive`, age under 10 s):
   `for f in release/current/logs/house-executor-7300.pid logs/house-executor-7300.pid; do [ -f "$f" ] && { ps -p "$(cut -d' ' -f1 "$f")" >/dev/null && s=alive || s=DEAD; echo "$f: $s, age $(( $(date +%s) - $(stat -f %m "$f") )) s"; } || echo "$f: missing"; done`
   Pre-type (no Return) `kill -9 $(cut -d' ' -f1 ~/haunted-hacks/release/current/logs/house-executor-7300.pid)` in a 28 pt terminal, bottom-left.
   Re-run right before walking on: the pid changes after every kill.
3. Stage `http://localhost:3300/stage?token=<PRESENTER_TOKEN>`, maximized, clicked once (audio), volume up.
   Press **S**, then **R**. Bots on to 120 (they retire as phones join). QR big (**Q**).
4. Close card: the real count of people who played today (real phones only, never bots or `joinedToday`).
5. Backup video `demo/out/haunt-the-room.mp4` open in QuickTime.

## The script

| t | who does | room sees | TALKER says |
|---|---|---|---|
| 0:00 | (walk on, QR already up) | mansion, rain, giant QR | "You are the ghosts. They are AI. Lie to them." |
| 0:04 | TALKER points at the QR | phones: your ghost name, in your colour | "Phones out. Scan to play." |
| 0:08 | DRIVER **H** | intro cards on stage and phones | "Four hunters, four AI agents. Everyone else is you." |
| 0:14 | TALKER hands the spare phone to a judge | | "You're a ghost too. Hold on to that." |
| 0:24 | (beat 1 HIDE) | six rooms, seats filling | "Take a seat. Seats run out." |
| 0:33 | (THE TABLE) | four hunters, candle, huge subtitles | "Each one is its own agent on Agent Relay, with its own memory. They argue, then vote two rooms." |
| 0:42 | (REVEAL) | flashlights; phones Found / Safe | (let it land) |
| 0:46 | TALKER at the judge (beat 2 HIDE) | judge's phone: Lie to the AI | "Tap Lie to the AI. Pick the Medium. Blame an empty room." |
| 0:52 | (THE TABLE) | a wisp to one hunter's ear, needle swings, "swayed by <name>" | "Only she heard that. Everyone in this room can see the room is empty. She can't." |
| 1:01 | (REVEAL) | empty room searched; judge's phone: "The Medium believes you." | "You just lied to an AI, and it worked." |
| 1:05 | DRIVER **Return** as beat 3 HIDE starts | stage "Back in N s"; phones keep playing | "We just killed the process running the game. Your phones didn't notice." |
| 1:10 | TALKER points at "Back in N s" | | "Every phone is a Terse Durable Actor. The clock is an actor alarm. Same rooms, same clock." |
| 1:11-1:24 | (beat 3 table + reveal, on time) | hunters bicker, one betrays the vote | "Watch the Priest. He said one room and voted another." |
| 1:24-1:43 | (beat 4) | "n of 2 rooms haunted" | "Pack a room they skip and it's haunted. Two and the house is yours." |
| 1:43 | (finale by itself) | every phone and the projector flood red, or white "Exorcised" | "The house is yours." / "The AI won this one." |
| 1:48 | | | "[N] people played this today. We're Gessa: live events, streams and classrooms become games a crowd plays against AI agents." |
| 1:58 | | | "Thank you." |

**The close always lands:** at 1:48 say it, whatever state the stage is in. Running late: DRIVER **F** after any
reveal, by 1:40 at the latest.

## If X breaks

| X | do | say |
|---|---|---|
| QR won't scan | nothing | "haunt dot gessa dot ai, slash p." |
| few phones | nothing: bots hold the house and are labelled bots | nothing |
| table quiet or slow model | nothing: bank lines speak, a missing vote falls back to the most crowded rooms | "Real agents, no script." |
| judge's lie misses | nothing | "That one didn't buy it. The Medium usually does." |
| no executor pid alive in setup | skip the kill (never kill `logs/actors.pid`: 25-32 s down); at 1:05 repeat the Relay line | |
| kill not back in 5 s | keep talking; phones back but stage frozen: Cmd-R the stage; still down at 1:40: go to the close | "...and that's why we rehearse." |
| no count on the close card | drop the first sentence of the close | |
