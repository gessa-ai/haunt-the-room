# L7b CABAL STAGE (14:44) · READY for 2.6 · vote3d live, metadata.voice, podium hold 3 s

ADDED 15:14 (owner 15:05 + L23 2.8) · L7b READY 2.9
- Whispers in real time during the cabal: each the-dead DM flies a wisp to that hunter and pushes its whisper caption at once
  (outside the speaker queue; the caption stack stays max 2); whisperer name fills in from swayedBy. Shot 3c-heat-whisper2.png.
- ROOM HEAT (StageSnap.rumors): web/src/cabal/heat.ts + heat.css: ember glow from the floor + rising red smoke per room, scaled to
  its count relative to the hottest room (floor 3), no digits. On the cabal map (hunting + reveal) and on the 2D house during hide
  (overlay in the stage camera layer, so it zooms with the rooms). Shots 3c-heat-whisper2.png (cabal), 7-hide-heat.png (hide).
  Fake House + cabal demo now emit rumors (dev only). /stage3d: no heat yet (3D house is L16's).
- Upright everywhere (no italic): "swayed by" plate + whisper captions; previous caption in the cabal 34 px (names 28 px).
- vote3d burn wrapped (a throw no longer skips the X/check marks). web tsc 0.

ADDED 14:56 (L23 r5 P0s + L26/L28) · READY for the next release
- Map 2x (540x580 at the centre, was 326x355): room names 40 px, ghost figures 40 px; the plate is the backdrop only. Sides free for L28's busts
  (seats moved in beside the map, 150 px portraits). Captions in the cabal: 60 px text, names 34 px, box 1100 px, max 2, strictly below the map;
  the whisper line is a full-size caption (60 px italic ghost ink). "swayed by kyle" 40 px on a cyan plate; conviction bars 26 px.
- Old #hunt chat column hidden while the cabal is up (.st.cabal-on .st-feed).
- /stage + /stage3d (and /watch): the outage card shows only after a snapshot was received (a live socket that dropped); before the
  first snapshot the title card stays, the reason goes to the console.
- vote3d (L26) is hidden until the first slam; from then until clear() it owns the frame and the 2D map/needles/seats/marks step aside;
  captions + busts stay on top. Tokens are mounted on OUR map (seats.json rooms/map overridden with the enlarged cells).
- Shots: web/src/cabal/shots/{1-speaker,2-whisper,3-swing,3b-stack,4-vote,5-burn}.png (3-swing = the swing + swayed plate). web tsc 0.

ADDED 14:44
- L26 vote3d.ts landed and is in use (glob pickup): 3D tokens slam + burn under the pixel X/check. Shots 4-vote.png, 5-burn.png.
- #hunt metadata.voice: feed/relay.ts carries it on say/dm items; captions play it via playVoice(hunter, event, n) when listed in
  /audio/voice/index.json (keys "<event>", "<event>-<n>", "<hunter>/<event>-<n>" or the file path), else speak(); caption always shows.
- Stage finale: podium hold before playEpilogue 8 s -> 3 s (stage/hud.ts scheduleEpilogue default) so L20b's ending owns the podium.
- Fix: seats' "voted"/"speaking" cleared when the cabal hides (stale state across beats). web tsc 0.

GRAPHICS PASS (owner 14:35)
- Map: no digits. Each room = 0..8 bobbing pixel ghosts (scaled to the fullest room, min 1 if anyone is there) + heat (room colour
  fill rises with the share). Whisper chip = room name + its ghost figures (the lie is visible: "Crypt" + one ghost).
- Conviction: no digits. Room name in the room colour + a bar that glows brighter with conviction; needles glow (drop-shadow).
- Vote 3D: cabal/index.ts picks up L26's web/src/cabal/vote3d.ts through import.meta.glob the moment the file exists:
  mount(.cb-v3 layer, seats.json) -> slam(hunter, room) / burn(rooms) / clear() replace the 2D tokens (2D stays until it lands).
  L26: export `mount(el, seatsJson)` returning {slam, burn, clear} (or export them at module level).
- Shots re-taken: web/src/cabal/shots/{1-speaker,2-whisper,3-swing,3b-stack,4-vote,5-burn}.png. web tsc 0.

CAPTIONS (owner 14:40)
- web/src/captions/ (index.ts, captions.css): mount(el, {size: "stage"|"phone", max?, voice?, ttlMs?}) -> {push({speaker, text, color, portrait?,
  hunter?, whisper?, chip?}) -> {setSpeaker}, clear()}. Black box, dithered checker border in the speaker colour, portrait + name, typewriter,
  stack max 3 (stage) / 2 (phone): new at the bottom, older shrink to one line, fade, and rise out. voice: stage calls speak(hunter, text) on push
  (phone default off: speak needs the stage audio context). Host element positions the stack (it fills the host from the bottom).
- Cabal subtitles now go through it (one new line every ~1.7 s, so the stack reads as a conversation). Shot: web/src/cabal/shots/3b-stack.png.
- 14:36 (2.6): cabal stack capped at 2 and anchored strictly below the map rect (never covers it; shot 3b-stack.png).
- 14:36 (2.6): stage + stage3d voiced lines now on captions via web/src/captions/stage.ts: taunts (caption + speak()), the announcer
  (announce() + caption text from /audio/voice/index.json), every canned hunter line (playVoice -> captions.voice: the variant is picked
  by us so caption == audio). Stack bottom-centre of the house column, max 2, 5.5 s each, under the cabal. Hud.say bubbles no longer called.
  Shot: web/src/cabal/shots/6-stage-captions.png (fake loop intro, exorcist "arrive" line). web tsc: 0 errors.

DONE
- web/src/cabal/ (index.ts, table.ts, demo.ts, cabal.css, shots.mjs): full-screen table mounted inside the stage's 1920x1080 `.st`
  (under the stage DOM dither), shown on phase "hunting", hidden ~0.9 s into "reveal" after the burn. Hooked into
  web/src/stage/index.ts and web/src/stage3d/index.ts with 3 lines each (createCabal(st), cabal.item(i) in feed onItem, cabal.snap(s) in the snap handler).
- Hard cut in: white flash + playCue("shutter") + tension 3. Blender plate web/public/3d/cabal/table.png is live (seats.json map rect used;
  portraits keep corner seats because the plate's top/bottom chairs sit under the subtitles). Dithered procedural table until the plate loads.
- Carved map: 6 rooms, live counts (66 px pixel numerals). Four 192 px L19 portraits, name in hunter colour; speaker leans in + glows, others dim.
- One speaker at a time: #hunt `say` (and hunter DMs as "x, privately to y") from the observer feed, typewriter, 64 px serif, name tag in hunter colour,
  speak(hunter, text) at line start via the captions module (L10 voices). Backlog capped at 3.
- Whisper (the-dead DM): cyan wisp flies to the hunter's ear, big italic line, "<swayedBy> whispers to the medium", lured cell pulses, TRUE count chip ("Crypt 3").
- Conviction meters: needle from seat to the leaned room (thickness/opacity = conviction), bar 0-100 in the room colour, swing with overshoot + whoosh,
  "swayed by kyle" tag when swayedBy changes.
- Vote: tokens (portrait discs) slam onto rooms one by one (420 ms, seat cue, screen shake) starting 2.0 s before hunting ends (vote ?? lean),
  corrected to the real votes on the reveal snap; then big pixel X on the swept rooms, pixel check on safe ones (owner 14:30), sweep cue, cut.
- Proof (Playwright 1920x1080, --mute-audio, demo harness): web/src/cabal/shots/{1-speaker,2-whisper,3-swing,3b-stack,4-vote,5-burn}.png, looked at.

RUN
- demo: http://127.0.0.1:5370/stage?fake=lobby&cabal=demo (11.5 s scripted loop)
- shots: `PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/cabal/shots.mjs`

NEEDS
- none (L2 already spreads ...h, so conviction/swayedBy reach the stage; votes stay null until reveal, the slam uses lean then corrects).

RISKS
- Live whisper name comes from swayedBy only (lure DM text carries no ghost name); before a sway the tag reads "a ghost whispers to ...".
- Not yet seen live on the stack.

## From L23 (taste, round 5, 14:53, release 2.5)
- [P0] /watch (public, for judges) and /stage without the presenter token show `The house is dead.` + `Gone for
  146.1 s. Hold still.` for the whole 150 s while phones were playing the round (stage grant 403 / watch 404 on a
  resource). A judge opening /watch sees a dead house with a counter climbing. -> /watch must render the live house
  (or, if unavailable, the title card, never the outage card); outage card only after a socket that WAS live drops.
- [P0] Cabal captions are ~28 px at 1920 (spec: >= 56 px), in a ~550 px box under the map; the line is the show and it
  reads as a footnote. -> caption text 56-64 px, box ~1100 px wide centred under the table, max 2 lines, speaker
  name 32 px in the hunter colour. Old lines: one, 28 px, faded.
- [P1] Whisper line `kyle whispers to the medium` + `Pst. Everyone's in The Crypt...` is ~18-22 px italic: the dramatic
  irony beat is unreadable. -> same size as the speaker caption, ghost-ink colour, a wisp sprite flying from the
  edge to the medium's portrait as it appears.
- [P1] Table map is ~14% of the frame width; room names (`Attic`, `Nursery`) ~16 px, seat ghosts 10 px. -> map 1.6x,
  names 28 px; keep the dashed hunter lines (they work).
- [P1] Conviction bars: thin 6 px bars with 18 px room names; `swayed by kyle` 16 px italic. -> bar 14 px, room 24 px,
  `swayed by kyle` 28 px on a plate in kyle's colour with a needle swing. This is the moment the room cheers.
- [P1] (L22 14:44, reconfirm) 2.5 still renders the old #hunt chat column on the right during the cabal, and the cabal
  did not appear in beat-1 hunting. -> the cabal owns the full frame in hunting; feed hidden.

## From L23 (taste, 2.8 sweep, 15:10)
- [P0] Public /watch on haunt.gessa.ai never connects on 2.8: the client calls GET /api/watch/grant, the server only has POST (`no route GET /api/watch/grant`, 404). Judges opening /watch see `The house is dead.` + a climbing counter for the whole round. -> client POSTs (or server adds GET); outage card only after a live socket drops. (L5 owns the route if the server side is wrong.)
- [P1] Cabal whisper line `Pst. Everyone's in The Crypt. Don't tell the others.` and `swayed by kyle` are italic; owner: no italics. -> upright serif, ghost-ink colour.
- [P1] Old (shrunk) caption line above the current one is ~16 px (`the exorcist forty-four in the library is a trap...`). -> drop the old line entirely or keep it >= 28 px; nothing small.
