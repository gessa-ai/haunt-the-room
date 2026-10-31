# Haunt the Room: preview for judges

You are the ghosts. They are AI. Lie to them. The whole room scans a QR, hides in a haunted house on the big
screen, and four AI hunters argue about where to look.

How it works:
- **The crowd:** each beat you pick one of six rooms on your phone (6 s), the hunters search two rooms, and the
  reveal says Caught, Safe or Haunted. Pack a room they skip and it's haunted; haunt three rooms and the house is yours.
- **The AI hunters:** four LLM agents read the live room counts, argue in public, cut private side deals, and each
  vote a room; everything they say is generated live. Everything else is you.
- **Agent Relay:** the hunters talk in one Relay channel and by DM; their only way to act on the game is a typed
  action (`sweep`, `taunt`) that a referee agent applies, and your lies reach them as DMs.
- **Durable Actors:** every phone is its own Terse actor with its own SQLite, and one House actor runs the round
  clock on actor alarms and pushes state to every phone and the projector over websockets.
- **The kill:** mid-round we `kill -9` the process running the game; it comes back in a fraction of a second from
  its snapshot, no phone notices, same rooms, same clock.

Files: `1-stage-lobby.jpg`, `2-stage-reveal.jpg` (caught, kill cam, after the kill, caught), `3-phone-hide-result.jpg`
(hide, caught, haunted), `4-finale-blood-flood.jpg`, `preview.mp4` (28 s).
Honest labels: the lobby still and the first 15 s of the video are a fake-data stage loop (the counters there are
made up, not people); the reveal, phone and kill stills are from today's real stack with bots and test phones.
Rebuild: `node demo/preview/capture.mjs <dir> 75 && demo/preview/build.sh <dir>`.
