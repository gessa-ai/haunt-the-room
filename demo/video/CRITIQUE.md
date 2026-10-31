# CRITIQUE: haunt-the-room.mp4 (L29 video critic, 15:12 PT)

Build reviewed: demo/video/out/haunt-the-room.mp4, mtime 14:58:46, 55.02 s, 1920x1080 30 fps, AAC 48 k.
Method: every 0.5 s frame (110 frames, 960 w), per-frame ffprobe signalstats YAVG/YDIF + scene score, frame-by-frame strips at
every cut, ebur128, silencedetect -50 dB/0.5 s. No audio was played aloud.

Timeline as built (from cut.json): 0.0 line:medium | 3.2 cold:vote | 5.0 title | 8.0 story:house | 10.6 story:hunters |
13.4 story:ghosts | 16.0 join | 22.0 line:skeptic | 24.7 cabal:vote (15.3 s) | 40.0 kill (10 s) | 50.0 end:flicker | 53.0 end:hold.

## Measurements
- Loudness: I -15.7 LUFS, TP -1.5 dBTP (at the ceiling, no clipping), LRA 4.8 LU. No silences. Momentary dips to -24..-26 LUFS
  at 12.1, 14.1, 16.1, 22.1 s (story tail and the join/skeptic seams: bed only, thin).
- Bed: cut.bed.dur = 20 s, looped with a 1.2 s fade-out + fade-in per loop (build.mjs l.137) => a bed pump at 20 s and 40 s.
- Black frames (YAVG 0): 8.0 s (title -> house) and 53.0 s (end:flicker -> end:hold). Image segments fade in from black (build.mjs l.56).
- White flash: 34.97-35.10 s, 4 frames full white (YAVG 208), then fades through grey into the next table. Strobe risk.
- Stray micro-shot: 4.85-5.00 s, 5 frames of a different stage view (3D rooms, timer, full sidebar) at the end of cold:vote.
- Shot lengths: cabal:vote 15.3 s and kill 10 s are single shots (standard 1.5-4 s); join 6 s.
- VO lines without an on-screen caption: "Four exorcists. All four are A.I. Tonight, you are the ghosts." (8.05 s) and
  "Scan the code. Your phone is a ghost in the house." (16.3 s).
- Caption reading speed: medium line 68 chars in 1.7 s = 40 cps (limit 17); whisper 31 chars in 1.5 s = 21 cps; skeptic 53 chars in 2.7 s = 20 cps.
- Safe margin: the "tag" chip ("4 AI agents on Agent Relay", "the process running the game dies", "every ghost is...") sits at x = 3.4 %, inside the 5 % margin.
- Hook: whisper card at 0.0 (ok). Title at 5.0 s (ok). End card held 5.0 s (ok). No finale (red flood + podium) segment at all: SCRIPT 0:50-0:55 is missing.

## Fix list (ranked by impact)
1. 40.0-50.0 kill: the shot contradicts itself. It opens on "The house is dead. Gone for 46.6 s" (the stage got the revive 47 s late:
   events.jsonl restored 1793482732316 vs restoredAt 1793482684856), shows "Back in 1.68 s" at 41.4, then dies AGAIN at 46.5
   ("Gone for 0.1..3.2 s") and the segment ends on static. A stranger reads "dead for 47 s, then dead again, never back", while the
   caption says "back in 1.7 s". Fix in cut.json: split "kill" into two segments: kill:die {atMs 1793482736900, dur 1.4} (static,
   no "Gone for 46 s") then kill:back {atMs 1793482741700, dur 3.0} on the revived stage of the second kill (revived event at capture
   1793482741666), or, if that frame is not clean, kill:back = atMs 1793482732400 dur 3.0 (the "Back in 1.68 s" card, which lasts 5 s on
   screen). Never include frames before 1793482732316. Total 4.4 s instead of 10.
2. 24.7-40.0 cabal:vote is one 15.3 s take with 5.5 s of dead countdown (29.5-35.0 "Pick a room on your phone" 6..1) and a phone
   PIP that reads "Caught. Sit this one out." then "No room this beat." (our hero loses). Fix: split into cabal:table {atMs
   1793482880342, dur 1.6}, cabal:slam {atMs +1560, dur 1.6, gain 1} (vote result + burn), drop atMs +3100..+10300 entirely,
   cabal:line {atMs +10500, dur 3.5, zoom {z 1.3, x 0.2, y 0.75}} on "got a tip from gio. the library. i'll weigh it. it weighs nothing.".
   Pick a PIP window where phone1 shows the landed lie / +points, or drop the pip from this segment.
3. 50.0-55.0 end card is the pre-15:08 art: title wraps "HAUNT THE / ROOM", moon sits behind the N of HAUNT, sponsor line renders
   "ERSE DURABLE AC_ORS". L25 re-exported 07-end.png + 07-end-flicker.mp4 at 15:08. Fix: just rebuild (build.sh), then re-check 50-55.
4. 34.97-35.10 4-frame full-white flash (YAVG 208) inside cabal:vote. Fix: falls out with fix 2 (start cabal:line at >= +5200 ms after
   that point, i.e. after the white); if kept, cut it out by splitting the segment at the flash.
5. 1.5-3.2 medium caption: 68 chars in 1.7 s (40 cps), unreadable; it also covers the Library room the line is about, and the
   box is so transparent "The Chapel 11/30" shows through. Fix: line:medium dur 3.2 -> 4.4, whisper d 1.5 -> 1.8, line t 1.8 d 2.6;
   display text trimmed to "kev says the library. kev is sincere." (keep the log text, render the tail); render.mjs caption box
   background alpha >= 0.85; move the caption box to the top for this segment (the whisper is gone by then).
6. 8.05 and 16.3 VO lines have no caption. Fix: add "captions" to story:house ({t 0.05, d 2.5, item {kind "tag", text "Four exorcists. All four are AI."}})
   and story:hunters ({t 0, d 2.6, "Tonight, you are the ghosts."}), and to join ({t 0.3, d 3.2, "Scan the code. Your phone is a ghost in the house."}).
   Same chip as the kill tags, Geist Pixel.
7. 16.0-22.0 join: the stage is playing its own story reel ("The door's open. Scan the code...", then "Halloween. You fly to SF to p..."
   typewriter clipped behind the QR card, then an airplane aisle). Two texts fight the VO, the airplane is unexplained, and the right
   third of frame is black until the PIP appears at 18.5. Fix: join atMs -> the moment the lobby QR + join counter is up without the
   story reel (or the first 1.5 s only: atMs 1793482644983, dur 3.0), pip.from 2.5 -> 0, zoom {z 1.35, x 0.55, y 0.75} onto the QR card.
8. 22.0-22.5 line:skeptic opens on a stale static frame "The house is dead. Gone for 54.6 s" under the skeptic caption (a spoiler of
   the kill and a second "dead" message). Fix: line:skeptic atMs +600, dur 2.7 -> 2.4. Also the 1.25 zoom at x 0.15 crops the
   medium/priest portraits at the right edge ("the med" clipped): use x 0.3.
9. 50-55 finale missing (SCRIPT 0:50-0:55 red flood + podium). Fix: moments.mjs found no finale in cap1; take it from cap3 (drive.mjs
   pid 77746) as finale {src "cap3/stage", atMs <finale>, dur 3.0, gain 1, pip phone1} before end:flicker. With fixes 1+2 the cut has ~12 s to spare.
10. 8.0-16.0 story: three identical slow push-ins (push 0.01->0.03/0.04) back to back, and the house is the subject of all three, so
   it reads as one long held still. Fix: story:house push [0.0, 0.06] (real push-in), story:hunters pan (push [0.04,0.04] with an x drift,
   or "pan": [-0.04, 0.04] if build.mjs supports it), story:ghosts static hold push [0,0] with the flicker; trim each to 2.2 s.
11. 13.4-16.0 story:ghosts: 05-ghosts reads as the house filled with cyan noise, i.e. a broken render, not ghosts. Fix: swap to
   art/05-ghosts.png (non-parallax) or ask L25 for ghost silhouettes; else drop the shot and give its 2.6 s to the finale.
12. 4.85-5.00 stray 5-frame shot at the end of cold:vote (different stage view). Fix: cold:vote dur 1.8 -> 1.6.
13. 35.5-40.0 phone PIP (h 900) sits on top of the right half of the vote table: the medium and priest portraits are hidden and the
   in-game line "i'll weigh it" runs under the PIP. Fix: pip.h 900 -> 720 and place it at the right gutter, or zoom the stage
   {z 1.2, x 0.0} so the table sits left of the PIP.
14. Tag chip x = 3.4 % (outside the 5 % safe margin) at 22-27 and 40-50. Fix: render.mjs tag position left 96 px, top 64 px (5 %/6 %).
15. 53.0 and 8.0 one-frame black dips: image segments fade in from black (build.mjs l.56, fade=t=in d 0.12). Fix: no fade-in when the
   previous segment is the same art (end:flicker -> end:hold), i.e. skip the fade for end:hold, or fold end:hold into end:flicker (dur 5).
16. Bed pumps at 20 s and 40 s (20 s slice looped with 1.2 s fade out/in). Fix: cut.bed.dur 20 -> 56 (one pass, no loop), or loop with
   acrossfade=d=1.5 instead of per-loop afade in build.mjs l.137/144.
17. 40-50 kill audio: static at gain 1 under the VO "The process running the game dies. Nobody moved." Fix: kill gain 1 -> 0.5
   (static stays audible, the VO stays on top); TP is already -1.5 so no headroom to add.
18. 0.0-1.5 hook: the 1.25 zoom at x 0.15 leaves the dev sidebar at the right edge with clipped words ("hing and", "the skeptic said the")
   and the round counter "4" cut at the top. Fix: zoom {z 1.35, x 0.1, y 0.55} so the Library and the whisper card are the only things in frame.
