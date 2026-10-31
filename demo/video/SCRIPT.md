# HAUNT THE ROOM: round-1 video, OWNER TIMELINE 60 s (14:56)
| t | section | picture | sound |
|---|---|---|---|
| 0:00-0:05 | cold open | a hunter believes a named whisper (whisper card + hunter line, pixel captions), vote slam | hunter voice + slam |
| 0:05-0:08 | title | L25 06-title-flicker.mp4 | bed |
| 0:08-0:16 | story | L25 key art: house, hunters, ghosts (parallax) | narrator: "Four exorcists. All four are A.I. Tonight, you are the ghosts." |
| 0:16-0:22 | join | projector QR + joins, phone PIP | narrator: "Scan the code. Your phone is a ghost in the house." |
| 0:22-0:40 | THE CABAL | one beat: whisper, hunter lines one per shot, needle "swayed by <name>", 3D vote slam + burn, phone result PIP; label once "4 AI agents on Agent Relay" | hunter voices, slam |
| 0:40-0:50 | kill -9 | terminal `kill -9 <pid>`, static, "Back in x s", phone PIP; label "every ghost is a Terse Durable Actor" | narrator: "Now we kill the process running the game. Nobody moved." + static |
| 0:50-0:55 | finale | red flood + podium, phone PIP | finale hit |
| 0:55-1:00 | end | L25 07-end-flicker.mp4 + hold | narrator: "Haunt the Room. Scan to join." |
One continuous bed (the game's own lobby score, looped), ducked under narrator; game audio only at hunter lines and hits.
Captions in Geist Pixel only, no italics. Every name, line and number comes from the capture log (moments.mjs).

## Capture (14:45-15:00, after the window is posted in lanes/QA.md)

```sh
cd ~/haunted-hacks
node demo/video/rec.mjs --label cap1 --base http://localhost:3300 --phones 2 --names kyle,maya --feed --allow-kill
#   (typed into that terminal) l  -> lobby so the phones can take their names; wait ~10 s
#   s, then r, then bots-on?n=120   -> show mode, reset, fill bots
#   h                                -> start the round (phone1 'kyle' lies every hide beat, phone2 hides)
#   kill                             -> at beat 3 HIDE: kill -9 the House executor (DEMO.md path check built in)
#   m <note>                         -> mark a funny line;   q -> stop (after the finale + 5 s)
```
Disk: ~90 MB/min for stage + 2 phones + feed; refuses under 250 MB free, stops itself under 150 MB.

## Build (15:00-15:15)

```sh
node demo/video/moments.mjs cap1        # -> demo/video/cut.json + moment table + MISSING list
demo/video/build.sh                     # -> demo/video/out/haunt-the-room.mp4
```
VO: ElevenLabs eleven_v3, narrator David (shared library). `VO_ENGINE=say` for a free placeholder.
