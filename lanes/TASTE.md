# L23 TASTE (2.8 sweep, 15:10) · live haunt.gessa.ai, muted, 1 stage tab + 1 phone · gallery: lanes/shots-2.8.png

Stage could not be swept live: /watch 404s on its grant (L7b P0). Stage notes come from the lanes' 14:54-14:59 shots.
DONE on 2.8 (phone): live room counts, pixel chairs/faces on tiles, night background on no-room, lowercase rank pills, real names (`ada pumpkin`), AI chips on the lie sheet.

## L7b
- [P0] Public /watch on haunt.gessa.ai never connects on 2.8: the client calls GET /api/watch/grant, the server only has POST (`no route GET /api/watch/grant`, 404). Judges opening /watch see `The house is dead.` + a climbing counter for the whole round. -> client POSTs (or server adds GET); outage card only after a live socket drops. (L5 owns the route if the server side is wrong.)
- [P1] Cabal whisper line `Pst. Everyone's in The Crypt. Don't tell the others.` and `swayed by kyle` are italic; owner: no italics. -> upright serif, ghost-ink colour.
- [P1] Old (shrunk) caption line above the current one is ~16 px (`the exorcist forty-four in the library is a trap...`). -> drop the old line entirely or keep it >= 28 px; nothing small.

## L6b
- [P1] Room names on hide tiles (`Attic`, `Library`) ~12 px under the big counts; lie step 2 room names and step 1 hunter names (`Exorcist`, `Medium`) ~12 px under big art. -> 20 px, white, upright.
- [P1] Hunting screen (full room-colour field + glyph): `The Ballroom` ~16 px and no cabal caption on the phone. -> room name 32 px; show the current cabal line (L7b captions, phone size) at the bottom.
- [P1] Finale card: subline `The hunters have left. One of them was crying.` and `#72 of 121` ~12 px. -> 20 px; rank 28 px. Title wraps fine.
- [P1] Intro card bodies (`They search two rooms. Be in neither.`) ~14 px. -> 20 px.
- [P1] Streak chip in the header (`On a roll x1.75` + flames) still truncates the player's own name to `ada pu...`. -> flames + `x1.75` only, or chip on its own row.

## L20b
- [P1] Ending captions reuse the italic-free box but the old line shrinks to ~20 px and the new line is cut mid-word in the shot (`For the record: st`). -> let the line finish before the slide moves; old line >= 28 px or gone.

## L28
- [P1] Ending bust lineup mixes flat pixel portraits (skeptic, priest, medium square) with a glowing smooth full-body medium/figure (left of each frame): two art styles in one shot reads unfinished. -> one style: all pixel busts at the same size, the speaker lit, others dimmed.

## L26
- [P1] Vote / burn frames: the table sits low and small in a mostly black frame, burning rooms ~90 px blobs, the caption box covers the table's lower third. -> camera ~2x closer so the table fills ~60% height, caption below the table, burn brighter than the candle.

---- round 5 below ----

# L23 TASTE (round 5, 14:53) · release 2.5 CABAL · owner bar: immersive, fewer numbers and words, more graphics, nothing small, no slop

Round 5 = P0/P1 only, per owner lane. Each item is also appended to that lane's status file under "From L23".
Captured 14:45-14:50: live 2.5 at localhost:3300 (/stage 1920x1080 and public /watch as a non-presenter viewer, /p
390x844, muted, 150 s across a L22 rehearsal), plus the lanes' own 2.5 shots (web/src/cabal/shots 14:42-14:43,
web/src/story/shots 14:39) because the live stage never left static for my viewer (see L7b P0-1).

## L7b cabal / stage
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

## L6b phone
- [P0] Live hide (120 online, 14:45): every tile reads `0/30` for the whole hide. Either counts are not arriving or
  the tiles do not update; the room-crowding game is invisible. -> show live counts (or the pixel chairs filling) from
  {t:"rooms"}; if counts are 0 because the house is stalled, that is L2, but the phone must not show six zeros.
- [P1] `No room this beat.` on flat mid-grey (live, both hunting frames). -> the night background every other screen
  uses; keep the pixel ghost + the live cabal caption.
- [P1] Room names on tiles ~12 px small caps (`THE LIBRARY`). -> 20 px sentence case `Library`, white, bottom-left.
- [P1] Rank line `DOWN 8 · #9 OF 120` ~12 px caps under the result grid; header `#9 OF 120` caps. -> `down 8 · #9 of
  120` 22 px; header lowercase `of`.
- [P1] `Lie` (and the whisper picker portraits) carry no AI label. -> `AI` chip on each hunter card; button `Lie to
  the AI`.
- [P1] After the finale the phone showed a blank page with only the header (last 2 frames, ~6 s). -> never blank:
  hold the finale card until lobby arrives.

## L20b story / ending
- [P1] Final card `The house is theirs. For now.` is strong, but `Built today: every ghost a Terse Durable Actor, every
  hunter an Agent Relay agent.` is ~18 px grey: this is the sponsor sentence the video needs. -> 32 px, 85% white,
  two lines; the two sponsor names in their own colour.
- [P1] Ending caption boxes (`The Skeptic Zero ghosts. As I said. Repeated`) ~28 px; caption cut mid-word in the shot.
  -> captions 56 px like the cabal; let the typewriter finish before the next slide.
- [P1] A dev key bar (`full lobby loop 12 s cut epilogue: ghosts epilogue: hunters H (start)`) sits at the bottom of
  the story shots. -> confirm it never renders on /stage or /watch; only with ?debug.
- [P1] Lobby: `NN / 07` slide counter (r2) and the count touching the QR plate (r2) still open in r4. -> remove counter.

## L26 vote3d
- [P1] vote3d burn frame (vote3d-3-burn.png): a small table (~25% of frame width) in a black void, the burning rooms
  are 80 px blobs. -> camera 2x closer so the table fills ~60% of the height; flames brighter than the candle.

## L27 ambience
- No finding: captures were muted per the coordinator. Note for L27/L10b: L10b reports ElevenLabs credits exhausted at
  14:36; whatever voice path ships, captions must never wait on audio.

## Carry-over (L7, from r4, still open in the fake board)
- [P1] hide: empty clock ring top centre + countdown disc on the gable. [P1] intro title in small caps.
  [P1] finale has no `Follow me on X` (owner directive). [P1] reveal kill-cam stills grey haze.

---- round 4 notes below (kept for history) ----

# L23 TASTE (round 4, 14:32) · art-director notes; I edit nothing else

Format: `[P0|P1|P2] [lane] element: now -> change (why)`. Status: NEW r4, OPEN since rN, DONE rN. Next pass ~14:47.
Freeze is 15:15: from the 14:47 pass on I only list what is P0 or a one-line CSS/copy change.
Captured: Playwright headless Chromium, stage `:5370/stage?fake=*` 1920x1080 + 1280x720, phone `:5361/p` 390x844 +
375x667, plus L6's v2 shots (web/src/play/dev/shots/v2-*.png, 14:28).

## DONE since r3 (the show now has a real finale and a real hunting scene)
- DONE r4 [L7] FINALE: podium sharp and centred (avatars on 1/2/3 plinths, names, ecto), ranks 4-5 line, stats row
  `1,496 people died today · 312 Durable Actors at once · 11 messages on Agent Relay · 263 ghosts caught`. Strong.
- DONE r4 [L7] OUTAGE: `Gone for 1.4 s. Hold still.` on a black plate, readable from the back.
- DONE r4 [L7] REVEAL stamps `Empty.` / `39 CAUGHT` now solid black plates, readable.
- DONE r4 [L7] HUNTING is a new scene: the four pixel portraits around a round table, a mini room grid with live
  counts, vote bars and dashed lines from each hunter to its pick. The AIs visibly decide. Best screen in the show.
- DONE r4 [L6] Phone v2: clean tiles, real pixel chairs, `Who do you whisper to?` with the four portraits, BELIEVED /
  FOUND scenes with big pixel check / X, a room-by-room result grid. Huge step.
- Earlier DONEs hold (debug footer gone, no `@handle`, QR not covering scores, revive plate).

## TOP 6 RIGHT NOW (all small)
1. [P1][L7] OPEN since r3 · HIDE: an empty clock ring still sits top centre, and the countdown disc sits on the right
   gable beside it. -> delete the ring in hide; put the disc where the ring is. (one-line CSS/positional)
2. [P1][L7] OPEN since r3 · Finale has no `Follow me on X` (owner directive). Row is `Star us on GitHub @gessa-ai` +
   `gessa.ai` only. -> add the X button with the owner's real handle from the conductor; never a placeholder.
3. [P1][L7/L16] OPEN since r1 · REVEAL kill-cam stills are still grey haze (stamps now read, the rooms don't). ->
   CSS `filter: brightness(.55) contrast(1.5)` on the two stills; the cone stays bright. One line.
4. [P1][L6] NEW r4 · Phone hide: unpicked tiles are ~25% brightness, room names `THE LIBRARY` in ~12 px small caps:
   at a glance there is one room, not six. -> unpicked tiles 70%, names 18 px sentence case (`The Library`) like the
   whisper room picker already does (`Library`, white bold). The picked tile keeps its white ring + glow.
5. [P1][L6] NEW r4 · AI labelling lost on the phone: the `Lie` button and the whisper picker (`Exorcist`, `Medium`,
   `Skeptic`, `Priest`) have no AI chip. Owner: AI clearly labelled. -> `AI` chip on each portrait card (the stage's
   chip), button `Lie to the AI`.
6. [P1][L6] NEW r4 · BELIEVED summary: `The Medium believes you.` white blackletter on saturated yellow (~1.6:1) and the
   rank pill `UP 1 · #1 OF 4` in caps. -> black text on yellow; pill `up 1 · #1 of 4`. Same for FOUND's `#3 OF 4`.

## STAGE · lobby
- [P2][L7] `24 dearly departed` still touches the QR plate top edge. -> 24 px gap. OPEN since r2
- [P2][L20] Story counter `01 / 07` (top right) still there. -> remove. OPEN since r2

## STAGE · intro
- [P1][L7] Parchment clock over the WELCOME title. -> hide in intro. OPEN since r1
- [P1][L7] Title in small caps (all caps). -> sentence case blackletter, the house style. OPEN since r1

## STAGE · hide
- [P1][L7] Empty ring + disc on gable (Top 1). OPEN since r3
- [P2][L7] `Pick a room on your phone.` plate covers the Chapel/Crypt seat rows. -> below the house. OPEN since r1
- [P2][L7] `1 of 2 rooms possessed` 22 px. -> pips 40 px, drop the sentence or 28 px. OPEN since r1

## STAGE · hunting (new scene)
- [P1][L7] NEW r4 · Under each portrait `undecided` + an empty bar at the start; the room grid shows `52` in all six
  rooms (fake data, fine) but the scene has no words from the hunters, and the feed column is gone in this phase. The
  argument IS the Relay demo. -> show each hunter's latest #hunt line as a 2-line speech plate under its name (24 px
  serif italic), replacing `undecided` until it votes.
- [P2][L7] NEW r4 · The round table is a big empty brown disc behind a small 2x3 grid. -> grid 1.5x (numbers 64 px);
  the table can stay.

## STAGE · reveal
- [P1][L7/L16] Kill-cam haze (Top 3). OPEN since r1
- [P2][L7] Stamps are tilted black plates (good); text `39 CAUGHT` caps. -> `39 caught`. OPEN since r2

## STAGE · finale
- [P1][L7] No X link (Top 2). OPEN since r3
- [P2][L7] NEW r4 · Avatars on the podium are ~80 px on a 1080 frame; #1's name `uncle otto 49` is the only bright
  thing. -> avatars 2x (160 px) so the room recognises its winner. Ranks 4-5 line 18 px pink: 24 px bone.

## STAGE · feed
- [P1][L7] Feed body ~24 px, names ~20 px at 1920. -> body 30 px, names 24 px, last 5 messages. OPEN since r3

## PHONE (L6 v2 + live mock)
- [P1][L6] Unpicked tiles too dark + tiny small-caps names (Top 4). NEW r4
- [P1][L6] AI chips on whisper portraits + `Lie` button (Top 5). NEW r4
- [P1][L6] BELIEVED text contrast + caps pills (Top 6). NEW r4
- [P1][L6] NEW r4 · `No room this beat.` (hunting, no seat) is again a flat mid-grey field. -> night background like
  every other screen; keep the pixel ghost + the Medium's line card (that card is great).
- [P2][L6] Score chip `0 ecto / #2 OF 4`: `ecto` 11 px, `OF` caps. OPEN since r1
- [P2][L6] FOUND hunter portrait ~50 px with an 11 px name. -> 120 px. OPEN since r2

## NAMES (everyone)
- [P1][L2 + L6 mock + L16] Names still carry numbers and repeat: stage `uncle otto 49`, `cousin ida 2`, `old tom 11`
  and `old tom 17` in one top 3; phone mock `spirit #527`, `banshee #353`. -> bigger first x last pool, digits only on
  a real collision. OPEN since r1
