# L6b PHONE REDESIGN (status 14:54) READY (L23 round 5 fixed)
2.9 (15:11) READY
- Lie during HUNTING: the debate (speaker portrait, name, line, large) plus "They're deciding now." and the "Lie to the AI" button, same two-step sheet. Once used this beat the button reads "Lie sent: Medium, Chapel" and a card shows "the Medium is weighing it" with a meter (2 s animation; the phone has no conviction feed, rooms carry leans only), then "heard you." Caught ghosts get no lie row. Mock accepts whispers in hunting.
- NEEDS L5/L2: /api/whisper must accept phase hunting (contract comment still says hide only).
- L23 2.8 sweep: tile and sheet names 22 px, hunting room 34 px, finale subline 20 px / score 22 px, intro body 20 px, header name no longer truncated by the streak chip. No italics in the lie/caption text.
- Shots: v2-06-hunting-no-room, v2-06b-hunting-lie-step2, v2-06c-hunting-lie-weighing, v2-06d-hunting-lie-heard, v2-06e-hunting-in-room-sent (+ all v2-* refreshed). tsc clean, 0 page errors, fonts loaded.
FONTS (15:02)
- Every visible phone text uses the game fonts, checked in the browser (getComputedStyle per element on every shot, 0 offenders; document.fonts.check: GeistPixel, IM Fell English and Pirata One all loaded). Room names, hunter names, chip labels and the speaker card use IM Fell English upright; rank, counts, score, chips and buttons use GeistPixel (web/src/feed/fonts.ts imported).
- "ecto" word replaced by a small pixel ghost next to the score (header + finale).
- Mock serves GeistPixel from web/node_modules so shots show the real font.
ROUND 5 (14:54)
- P0 counts: phone parse matches actors.ts #roomsMsg exactly (count/cap/seated, 1 Hz to tag ghost); tiles repaint on every {t:"rooms"}; your own tile now never shows 0 (floor 1 once you sit). Six zeros live = the House's #hiding saw nobody seated (g.seated) -> L2 if it persists.
- Room names 20 px sentence case ("Attic"); rank "#23 of 25" sans 18 px header / 22 px result; finale score sans.
- No room: night background + big ghost + live speaker card (portrait 112 px, name, 24 px line). web/src/captions tried: on the phone it rendered small and overlapped, so the play-local card stays (stub deleted).
- "Lie to the AI" button; AI chip on every hunter card in the picker.
- Finale blank: ROOT CAUSE a later @keyframes hr-flood (reveal flash, ends opacity 0) shadowed the finale's; finale now uses hr-fin-flood. Shot v2-11-finale (red, title, score), v2-12-after-finale (lobby).

DONE
- Header: no box, one thin line; bigger name (24) + score (36), rank in plain case.
- Hide: "Find a seat." + countdown ring only (hunter lines, pips, lean eyes gone). Tiles: pixel chairs (white = taken) when cap <= 6, else big "n/cap" + fill bar; full room greys + pixel lock; your tile glows white + room colour; someone sits in your room = screen shake + tick.
- LIE hero: full-width 64 px glowing "Lie" -> full-screen sheet: step 1 four hunter portraits 2x2, step 2 "Everyone is in..." six big room tiles -> sends at once (whoosh) with `hunter` in /api/whisper body -> card "You told the Medium: everyone's in the Chapel." (server's answered hunter wins). Believed: "BELIEVED" check stamp, then "The Medium believes you." +points.
- Reveal: giant pixel check (Safe/Believed) or X (Found/No seat) + 3x2 house map, each room X (swept) or check. Sentences removed (no "They searched..", no "sit out..").
- Hunting / no room: one line + big ghost icon + live cabal caption (portrait, name, line, large) via captions-stub.ts (L7b API: mount(el,{size}), push({speaker,text,color,portrait})); delete stub + switch import when web/src/captions/ lands.
- Proven: shots-v2.mjs, 3 phones 390x844 vs mock, 0 page errors; tsc web/src/play clean.
- Shots: web/src/play/dev/shots/v2-01-hide, v2-02-someone-joins, v2-03-lie-step1, v2-04-lie-step2, v2-05-lie-sent, v2-06-hunting-no-room, v2-07-reveal-moment-A (believed), v2-08-found-moment, v2-09-believed-safe-summary, v2-10-found-summary
RUN
- `PORT=5363 BOTS=0 bun web/src/play/dev/mock-server.js` then `MOCK=http://localhost:5363 PLAYWRIGHT_DIR=~/haunted-hacks/qa node web/src/play/dev/shots-v2.mjs`
NEEDS
- L5/L2: honor optional `hunter` in POST /api/whisper (phone lets the player pick the hunter; mock honors it).
- L7b: web/src/captions/ (then delete web/src/play/captions-stub.ts).
RISKS
- Room names still render in the font's small caps (font, not CSS).

## From L23 (taste, round 5, 14:53, release 2.5)
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

## From L23 (taste, 2.8 sweep, 15:10)
- [P1] Room names on hide tiles (`Attic`, `Library`) ~12 px under the big counts; lie step 2 room names and step 1 hunter names (`Exorcist`, `Medium`) ~12 px under big art. -> 20 px, white, upright.
- [P1] Hunting screen (full room-colour field + glyph): `The Ballroom` ~16 px and no cabal caption on the phone. -> room name 32 px; show the current cabal line (L7b captions, phone size) at the bottom.
- [P1] Finale card: subline `The hunters have left. One of them was crying.` and `#72 of 121` ~12 px. -> 20 px; rank 28 px. Title wraps fine.
- [P1] Intro card bodies (`They search two rooms. Be in neither.`) ~14 px. -> 20 px.
- [P1] Streak chip in the header (`On a roll x1.75` + flames) still truncates the player's own name to `ada pu...`. -> flames + `x1.75` only, or chip on its own row.
