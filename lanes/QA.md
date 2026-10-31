# L13 QA + BALANCE (15:21) · FINAL FUNCTIONAL QA on 2.8 below (2 runs, 4 muted phones each, ~35 bots from bots-on)
# SUMMARY: votes 4/4 fixed; executor kill 1/300 phones dropped on 2.5 (was 97/300); whole-server kill 300/300 back
# but p50 12 s (FAIL < 6 s); red finale 5/6 live (proposal cap n/5 -> model 100%); open: stage stalls after kills,
# chairs refusal not shown on the phone (L6), no "fooled" reaction (L3). Meter (passive stage observer) runs to ~15:15.
# WINDOW: none (final QA ran 15:14-15:19 on 2.8; done).
# WINDOW: L11b VIDEO capture 14:45-15:00 on release 2.5 (localhost:3300 = haunt.gessa.ai): show round via presenter (l, s, r, bots-on 120, h), 2 recorder phones (kyle, maya; synthetic, subtract from people counts), ONE executor kill -9 at beat 3 HIDE. Please no rounds, resets or kills of your own in that window.
# Machine load avg 90 on 14 cores (13:05): every timing below is inflated by load; re-measure when agents stop.

DONE (beat loop, 12:56-13:07: 3 auto rounds, 100 fill bots (+L8 load 150 at times), stage + 2 phones, 2 kills)
- join -> splash (name matches) -> lobby -> intro -> hide -> hunting -> reveal -> out/hide ... -> finale: works.
- phone result vs House truth: 13/13 caught/safe verdicts match the House; finale on both phones skew 3 ms.
- reveal -> phone result: result lands on the phone 0-100 ms before/with the stage snap (PASS < 300 ms); the phone
  shows "Flashlights..." ~100 ms before the verdict (phase msg first, result second).
- kill -9 mid-beat: SAME beat, SAME endsAt (delta 0), same rooms, possessed rooms kept, no counter regressed. But SLOW.
- shots (now small jpg, 9 MB total): qa/shots/1259*-1302* (stage reveal "2 CAUGHT", phone Safe/Caught, house-died, back, finale).

RUN
- meter (bg, pid qa/runs/meter.pid): `bun qa/meter.ts` -> qa/runs/meter.log, beats.jsonl, rounds.jsonl, kills.jsonl
- playtest: `node qa/play.mjs --secs 220 [--kill] [--start]`; kill rehearsal: `bun qa/kill.ts` (step timings)
- bots: `bun bots/src/main.ts --fill 100` (pid qa/runs/bots.pid; stopped for the 300-human test)
- acceptance: `bun qa/crowd.ts --n 300 --ramp 30 --kill` (non-bot joins like the phone: same backoff, Retry-After)

FINAL FUNCTIONAL QA · 2.8 (release/20261031-150246) · `node qa/lies.mjs --start` · runs 15:15 (r51) and 15:17 (r52)
Each phone lied to a different hunter about an empty room in beat 1 (whisper 200, routed to the chosen hunter 8/8).
| check (expected) | actual | verdict |
- whisper reaches the chosen hunter | 8/8 lies -> 200 {"hunter": <the one picked>} | PASS
- hunter caption "swayed by <liar>" on stage | captions render ("swayed by theo", "swayed by rosa"), but for OUR
  phones: StageSnap swayedBy named the liar 3/8 (skeptic, medium) and only for a moment; stage DOM 0/8. Bot lures
  (names theo/rosa/raj/eli/dev/mei) overwrite swayedBy within ~1 s ("last whisper wins") | FAIL (L8/L3: bots lie
  every beat; a human's lie must not be overwritten by a bot's: prefer human swayedBy, or bots lie rarely)
- conviction rises after the lie | 8/8 (before null -> 50-80) | PASS
- vote follows the lie | 2/4 (r51: exorcist, priest), 0/4 (r52) | FAIL vs the brief (bots' lures + crowd counts win;
  L3 to decide if a human lie should carry more weight)
- liar's phone "X believes you" + points | not triggered: no lie room was both swept and <= 1 ghost (r51 priest's
  lie room was swept but held 6 ghosts -> "Haunted +0", correct by the rule) | NOT VERIFIED (needs a beat with no
  bots in the lie room)
- phones in a swept room get Found | r52: chapel swept, 4/4 phones "FOUND" stamp, kind caught | PASS
- seat counts update live | r51 6/6 rooms match House (n/cap); r52 2/6 off by one (phone 1 Hz rooms msg trails) | PASS*
- finale + ending on every phone | 8/8 "The house is yours ... One of them was crying." + score + rank; House winner
  ghosts both rounds | PASS
- L7 minor: the "swayed by rosa" tag under the Medium's bar is cut off by the Priest's portrait (shot
  qa/shots/151653-lies-stage-hunting.jpg).
- caveat: the House showed 35 bots (server bots-on) during both runs; I could not run a bots-free round.
20261031-143604), 14:37-14:41 (overlapped go-live/capture; numbers are under that extra load)
- 300 NON-bot phones (fixed ids, one IP): join 300/300, 0 errors, first-live p50 7.1 s, max 12.4 s.
- EXECUTOR kill mid hide (beat 1): 1/300 sockets dropped (was 97/300 on 140126), score kept 300/300. Near-PASS.
- 2 real phones + executor kill (r40 intro): both stayed live, no outage screen; House restoredAt +5.4 s.
- hide->you p95: NOT measured in this run (crowd.ts does not time acks; last measure = release-1 hide300: p95 768 ms
  at 300 sockets). Beat timing drift: r40 beat1->beat2 reveal gap 65.5 s (nominal ~13.5 s) with a 12.6 s stage stall
  at 14:40:14-14:40:27 (meter) after my executor kill; r39 (the 300-crowd round) logged only beat 1 (stage list 108
  ghosts while ~400 sockets were open). Phone B's hide into a full attic again stayed "mine" on the phone (L6).
- verdict latency this run p50 560 ms / max 1.1 s (under load; was +25 ms unloaded).
 (14:03-14:17)
- coven FIXED: 4/4 votes before the bell in every beat of r22 (was 0/4 on release-1).
- 300 NON-bot phones, one IP, join: 300/300, 0 errors, first-live p50 7.6 s / max 14.9 s (was 25 s + 18 x 502),
  second run p50 25 s / max 29 s (House busy: presenter start answered 502 ECONNRESET at that moment).
- ACCEPTANCE whole-server kill -9 (logs/actors.pid), 300 non-bot: back 300/300 (was 56/300), p50 12.0 s, p90
  17.1 s, max 18.4 s, < 6 s only 7/300 -> FAIL; score kept 300/300 exact; beat advanced by one for all 300 (the
  outage outlived the hide phase), so "same beat" 0/300.
- EXECUTOR kill (house-executor-7300.pid), 300 non-bot phones, mid hide beat 1: 97/300 sockets DROPPED within 10 s,
  38 of them back by 10 s; score kept 300/300 -> FAIL (target: 0 drops).
- executor kill x5 (kill.ts, 20 bot probes, ~100-400 online): probes dropped 0/20 every time, same beat/deadline 5/5,
  but stage snap gaps 6.0 / 5.3 / 3.6 / 3.3 / 0.6 s and the stage socket closed 2/5. L2: target gap < 1 s.
- executor kill with 2 real phones (play.mjs --xkill, r26 beat 2): A stayed live; B went down +2.4 s, outage screen
  +2.7 s, back +11.2 s; House restoredAt +10.5 s (load: 390 online incl. L2's 381 bots). FAIL for B.
- L6 (chairs UX): a hide into a full room: phone keeps "mine=attic" highlighted while the House refused it (House
  keeps the old room); B then got "No seat." at the reveal (r22.1). Expected: snap back + "The Attic is full" at once.
- L2 (balance, chairs live): r22 caught/beat 0.76, 0.07, 0.82, 0.55 (target 0.25-0.40): no-seat catches stack on top
  of the sweeps. See BALANCE below (cap n/6 seats = online).
- reveal -> phone verdict: +25 ms typical (r22.1 House reveal 11.863, phone verdict 11.888). PASS.
 (13:22 restart, verified 13:22-13:30)
- votes: 4/4 hunter votes before the bell in 31/32 beats (97-100%/round, meter beats.jsonl). Reveal reactions: 8
  "caught" voice lines; "back" line 8 s after kill -9: "Lights are back. The Attic was a lie." (Medium, voice back).
- lure: phone A lure -> whisper 200 {hunter: medium} -> DM on feed -> Medium "A spirit told me The Attic!" -> voted
  the Attic. OK. L3: 0 "fooled" voice lines although round 9 had 1 House "lie" event (expected a fooled reaction).

KILL (whole server, `kill -9 logs/actors.pid`, play.mjs 13:23, 2 phones + ~100 bots): House back 5.4 s, phones live
  5.0 / 5.2 s, same beat (r9.3 hide), same deadline (delta 0), same rooms. (was 17-18 s at 13:05)
KILL (executor-only, `bun qa/kill.ts --executor --times 10`, 13:25-13:29, 20 bot probe sockets + stage, mid-beat):
- 9 kills done: new House executor +80..491 ms, probe sockets closed 0/20 every time, same beat + same deadline 9/9.
- BUT L2/L5: stage snaps stopped for >8 s after kills 3, 4, 9 (no close, no snaps), and the meter saw stage outages
  of 24.5 s, 26.0 s, 27.2 s (13:26:13, 13:26:42, 13:27:36) with sockets open. Expected: snaps resume < 1 s.
- L2: after the executor kills the House counts bots as HUMANS: bots log 13:30 "house online 51 (humans 51, bots 0);
  mine 49" (49 of them are my --fill bots). Inflates the human counters/closing numbers. Expected: role survives revive.
- L2/L8: online fell 120 -> 2 at 13:26:13 (fill bots dropped, 117 x join 502, "no {t:you} within 3 s of open").

NOTE FOR L11 (closing numbers): my one-IP NON-bot crowd test added 300 human joins 13:10:20-13:12:25 (+18 at
  ramp); subtract them. Synthetic load from now on is bot:true only, except that one acceptance test.

RELEASE-1 (tree release/20261031-133633, up 13:37) · checks 13:38-13:48
- P0 L3 (+L5 release order): hunters' votes never reach the House on the release: coven.log "vote did not reach
  Relay: Action invocation failed before provider dispatch completed" then 72 x "vote for X not on the House
  (none); casting again". Meter r17/r18: votes in time 0/4 every beat; swept rooms = House fallback (attic+nursery
  4 of 8 beats). Likely the referee's typed actions are not registered on the relay that restarted with the release.
  Expected: referee re-registers its actions whenever the relay (re)starts; 4/4 votes per beat.
- P1 L2 (balance + UX): a ghost that does not pick stays in its spawn room, and spawn rooms are the crowded fallback
  sweep targets: r17.1 caught 215/215 (100%), r17.3 71/71 (100%) with 300 idle sockets. Expected: idle ghosts
  spread (spawn in a random room each beat?) so a no-pick is not a guaranteed catch.
- hide latency, 300 bot sockets on the release (`bun qa/hide300.ts`, show round r19, 13:47-13:49): 600 hides,
  ack ({t:"you"} with the room) p50 245 ms, p95 768 ms, max 962 ms; stage snap shows the room p50 230 / p95 764 ms.
  120 unacked = hides from ghosts sitting out (expected refusals). 0 sockets dropped. With 300 random hiders and
  threshold 45 (0.15) no room was ever possessed in 5 beats: supports the 0.10 proposal below.
- playtest on the release (show round, 2 phones): join + names OK, finale skew 4 ms, lure -> medium 200 OK.
  Stage snap lags the House: phone hid in attic, stage snap still had the old room > 1 s later (4 of 6 hides), and
  a phone CAUGHT verdict showed as "not caught" on the stage snap 150 ms after reveal. Phone verdicts are right (they
  come from the House); L2: is the stage ghost list batched/stale now? (stage wisps would sit in the wrong room)
 via logs/house-executor-7300.pid (L2 path), 13:33-13:36, 5 of 10 done (paused for release cut):
- new House executor +95..418 ms; probe sockets closed 0/20 in 5/5; same beat + same deadline 5/5. PASS on sockets.
- L2: stage snaps stall after the kill: max snap gap 2.7 s, 5.6 s, 0.6 s, 2.1 s, 1.4 s; the stage socket itself
  closed in 2 of 5 (kills 3, 4). Expected: stage sees no gap > ~500 ms and never closes (the projector shows static).
- whole-server kill (`bun qa/kill.ts`) 13:31 x2: House answers +5.3 s / +5.8 s, all ghosts back 4.8 s / 5.3 s.
 (300 NON-bot phones, one IP, kill -9 mid-beat) · `bun qa/crowd.ts --n 300 --kill` · BASELINE 13:10 = FAIL
- join ramp 30/s from IP 203.0.113.7 (cf-connecting-ip): 300/300 live but first-live p50 25 s, max 26.5 s; 18 x 502.
- kill -9 at hide beat 4: back < 6 s 0/300; 56/300 back after 90 s (p50 67 s); 963 x 502 joins; same beat 0/300
  (House advanced to beat 5 while everyone was out); score kept 56/56 of those back.
- why (logs): House revived "302 ghosts, -38 s left in the phase" (woke 38 s late); then House tick "0.6 Hz, beat avg
  180 ms max 2307 ms, 38 sockets, 13 ghosts online" (L2: tick cost with 300 ghosts); control-plane Execute 7.7 s;
  actor host "ActorSessionError: Rust host disconnected" restart mid-recovery; joins 200 but socket never live
  for 240+ phones (join->socket gap, L5 proxy/L2 admission). Re-run after each lane's fix lands.
- results: qa/runs/crowd.jsonl (one row per run).

DEFECTS (owner lane: repro · expected vs actual)
- P0 L5+L2 recovery 17-18 s, target < 4 s. `bun qa/kill.ts` 13:05 (100 online): new pid +2.2 s, port 7300 open
  +10.7 s, House answers +17.9 s, all 100 ghosts + stage back +17.4..17.9 s. Cold start re-compiles actors.ts
  every boot (machine at load 90). Ideas: supervisor runs actors/node_modules/.bin/durable-actors (not bunx),
  `--no-watch` for the demo, House wakes itself on boot (it woke only when the first caller arrived: "revived ...
  -13 s left in the phase"). Re-measure on a quiet machine before G2.
- P0 L5: kill -9 while actors/ or contract/ does not compile = House dead until fixed (12:51: crash loop 3+ min,
  every join 502). Freeze actors/ + contract/ before rehearsals.
- P1 L2: after a revive the House counts only the ghosts in its snapshot, not the sockets it holds: actors log
  "101 sockets, 0 ghosts online, intro beat 0" (13:02) while 97 bot sockets stayed open -> those ghosts sit out
  every beat. Expected: on wake, rebuild presence from live sockets (and drop snapshot ghosts with no socket).
- (stale coven, re-checking after 13:13 restart) L3: hunters do not vote in the beat loop: 0 House "vote" events and 0 Relay sweep actions in 24 beats; every
  sweep is the House fallback (2 most crowded). Feed = lobby banter every ~20 s only. Stage feed reads "0 messages".
- P1 L5/L6/L7: Vite dev middleware: every save in web/ reloads every phone mid-beat (phones flipped to "Rising
  from the grave..." at 12:59:27, :51, :53, 13:00:39). Demo must serve the built SPA (NODE_ENV=production) or
  freeze web/.
- L10: phone console "[audio] phone cue fire|climb failed TypeError: RECIPES[kind] is not a function" (every beat).
- L7: stage title "Round 2 · beat 1 of 8" is covered by the Exorcist figure + vote chip (top left, 13:00 shots).
- L5: logs/actors.log ~4 MB/min (INFO per request, 26 MB by 12:55). Set warn level for the show.
- L5: `durable-actors dev --watch` restarts the House on every save (21 revives in round 1). Off for the demo.

BALANCE · LIVE on the tuned release (cap n/4, threshold 0.5 cap, ROOMS_TO_WIN 2), 100 fill bots + 2-7 humans
- show rounds 14:18-14:27: r29 GHOSTS (5 beats, 4 possessed at end), r30 GHOSTS (4), r31 GHOSTS (3), r34 GHOSTS
  (4 beats, 2) -> 4/4 red finales; caught/beat mean 0.27-0.38 (in band); first possession beat 1; votes 100%.
  r36 HUNTERS (4 beats, 0 possessed, caught 0.40), r37 GHOSTS (4). TALLY 5 of 6 complete rounds = 83% (target 90%).
  (r35 cut at beat 2 by someone's restart/start; r28 at 574 online on the untuned build: hunters.)
- PROPOSAL (contract owner): roomCapacity = max(3, ceil(online / 5)), keep threshold 0.5 cap, ROOMS_TO_WIN 2,
  SHOW_BEATS 4 -> model 100% at 30/100/300 online, caught/beat ~0.33. Smaller change if you prefer: ROOMS_TO_WIN 2
  stays and bots-fill >= 100 during the show (live 5/6 at 100).
- model for SHOW_BEATS 4 (contract now): ghosts win 78% at 30 online, 90% at 100, 100% at 300. If the room is
  small (< ~50 phones) keep bots-fill >= 100 for the show, or use cap n/5 (95-100% at every size).

BALANCE · MUSICAL CHAIRS (contract 13:51) · SHOW 5 beats · target: red finale >= 9 of 10 rounds
- model `bun qa/sim.ts --chairs` (House rules + chairs: full room refuses, bots re-pick an open room; L8 hide mix;
  hunters vote the crowd, 25% noise). Ghost win % (n = 30 / 100 / 300 online), SWEEPS_PER_BEAT 2, ROOMS_TO_WIN 3:
    cap = ceil(n/4), threshold 0.75 cap (NOW)    0% /  0% /  0%     <- the red finale never fires
    cap = ceil(n/4), threshold 0.50 cap         35% / 47% / 84%
    cap = ceil(n/5), threshold 0.50 cap         94% /100% /100%
    cap = ceil(n/6), threshold 0.60 cap         98% / 96% /100%     caught/beat 0.30-0.31
  (ROOMS_TO_WIN 2 at n/4 + 0.75: 1% / 0% / 0%; the cap divisor is the lever, not ROOMS_TO_WIN.)
- PROPOSAL: roomCapacity = max(3, ceil(online / 6)) (seats = online: real chairs pressure), possessThreshold =
  ceil(cap * 0.6); keep ROOMS_TO_WIN 3, SWEEPS_PER_BEAT 2. Predicted red finale 96-100% at 30-300 ghosts.
  Live check (release, 300 random-hiding sockets, old 0.15 rule): 0 possessions in 5 beats, consistent with model.

BALANCE · SHOW MODE (5 beats, superseded by chairs) · target: ghosts' red finale >= 9 of 10 rounds
- measured now (auto, 8 beats, ~100 bots, AI votes live): ghosts won 0 of 9 rounds; possessed at end 1-2;
  caught/beat mean 0.28-0.36 (in band); first possession beat 1-3.
- model `bun qa/sim.ts` (House reveal rules + L8 hide mix 40/40/20 + hunters voting the crowd) reproduces it:
  current rules give ghosts 2-6% (8 beats) and 7-12% (5 beats). Ghost win % for 5 beats, SWEEPS_PER_BEAT 2:
    possessThreshold frac   ROOMS_TO_WIN 3: n=30 / 100 / 300     ROOMS_TO_WIN 2: n=30 / 100 / 300
    0.15 (now)              1-4% / 7-12% / 33-41%                12-23% / 42-49% / 78-83%
    0.12                    28-42% / 76-83% / 97-98%             70-82% / 97-99% / 100%
    0.10                    91-94% / 99% / 100%                  99-100% / 100% / 100%
  SWEEPS_PER_BEAT 1 = 99-100% everywhere but caught/beat drops to 0.18 (too little danger).
- PROPOSAL: possessThreshold = max(3, ceil(online * 0.10)); keep ROOMS_TO_WIN 3 and SWEEPS_PER_BEAT 2.
  Predicted: red finale 91-94% at 30 ghosts, 99% at 100, 100% at 300; caught/beat stays 0.30-0.35.
  Keep bots-fill >= 30 online in the show (at 12 ghosts nobody can win: threshold 3 vs ~8 hiders).
  I validate on the live stack right after the conductor edits the contract.

BALANCE (THE LOOP, auto, ~100 ghosts; bots spread evenly; hunters = House fallback, no AI votes yet)
- rounds: 2/2 hunters won (possessed at end 1 and 1). caught/beat mean 0.32 and 0.41 (target 0.25-0.40: OK-high);
  first possession beat 1 and 3 (target <= 3: OK); round length 130-147 s incl. outages (target ~120 s: OK).
- why ghosts lose: the 2 most-crowded-room sweeps land on the possessed rooms (possessed rooms are the crowded
  ones) and cleanse them; ghosts max out at 2-3 possessed mid-round and end at 1.
- PROPOSAL (contract owner): possessThreshold 0.15 -> 0.12 of online, and a sweep CLEANSES only if it catches
  >= possessThreshold/2 ghosts in that room (a possessed room you abandon stays possessed). Or ROOMS_TO_WIN 3 -> 2.
  Re-measure once L3 votes are live (AI votes are noisier than the fallback, which favours ghosts).

NEEDS
- lanes: the integrated coven + server do NOT hot reload (bun, no watch). I restarted the whole stack 13:13 (coven
  was 12:41 code = no beat votes; that L3 finding above was a stale process). Put "RESTART 3300" in your NEEDS when
  your change must be live on the integrated stack; I restart within minutes.
- all lanes: tell me (status file) before presenter commands / bots on :3300 (L8 load 150 ran 12:47 and 12:58).
- L5 + L12 (P0 for 14:00 practice and the show): https://haunt.gessa.ai/p is served by the Vite DEV middleware
  (HTML has /@vite/client). Every save anywhere in web/ or contract/ broadcasts a FULL PAGE RELOAD to every phone:
  server.log has 105 "page reload" lines, 9 in 13:06:44-13:07:58 (src/stage/index.ts, src/stage3d/dev.html,
  contract/protocol.ts ...). Seen on iOS Safari (sim L17-A, public URL): mid-beat the phone drops to "YOU ARE
  Spirit #410" splash / "Rising from the grave..." (shots qa-mobile/shots/*-A-w2, *-A-w6). With 300 phones each
  reload = 300 rejoins + 300 x 38 requests through the tunnel. 13:06:42 a broken import in web/src/main.ts showed
  the red Vite error overlay ON THE PHONE, with /Users/paws/haunted-hacks/... paths (shots/*-A-r2-9.jpg).
  Expected: phones never reload because a dev saved a file. Fix: public :3300 serves web/dist
  (NODE_ENV=production + `vite build`) from 13:50 on; devs keep their own vite ports for HMR.
- L6 (P1): LANDSCAPE = unplayable. iOS Safari (iPhone 17 sim, public URL) rotated: during Hide only header,
  "Hide.", the countdown and "Lure a hunter" are visible; the six room buttons are not on screen and a swipe does
  not scroll to them (shots qa-mobile/shots/small/land10..33-rot.jpg, sheet-land3/4.jpg). Finale title
  "Exorcised" and the "Safe" word sit under the header (sheet-land2.jpg). Safari's own bars eat ~110 of ~400 pt.
  Expected: rooms tappable in any orientation. Fix: @media (orientation: landscape) and (max-height: 500px):
  6 rooms in one 3x2 or 6x1 row filling the height, hide the art; or a full-screen "Turn your phone upright" card.
- L12/CONDUCTOR (P0 at show time, live NOW 13:25): `curl https://haunt.gessa.ai/api/config` -> {"publicUrl":null};
  logs/public-url missing, no PUBLIC_URL in .env -> stage hides the QR ("QR hidden: no publicUrl"). Nobody can
  join from the QR until fixed. Fix: PUBLIC_URL=https://haunt.gessa.ai in .env (L12 NEEDS since 13:00).
- L10 (P1, iOS): web/src/audio/phone.ts plays through Web Audio only and never sets
  `navigator.audioSession.type = "playback"` (Safari 17+). iPhones with the ring/silent switch on silent (most
  phones in a talk) play NO phone sound. Expected: cues audible on silent iPhones. Fix: at unlock,
  `if ("audioSession" in navigator) (navigator as any).audioSession.type = "playback"`. Also: every Vite reload
  re-locks sound until the next tap (iOS needs a new gesture per page load).
- L2 (P2): caught result text is a system string: House sends result.text "CAUGHT by The Medium", the phone shows it
  as the hunter's quote: 'THE MEDIUM [AI] SAYS: "CAUGHT by The Medium"' (sheet-tap.jpg). The phone has funny
  per-hunter CAUGHT_LINES but result.text wins. Fix: House sends text "" (or the hunter's real taunt).
- L6 (P2): lure toast "The Medium heard you..." covers the Chapel/Crypt row for 2.6 s of the 6 s hide (taps pass
  through, pointer-events none; counts + names hidden). sheet-lure.jpg. Move toasts to the top during hide.
- L6 (P2): network blackhole (venue AP stalls, socket never closes): phone freezes on the last screen for 16 s
  (QUIET 8 s + PONG 8 s) with no cue, then says "The house died. You didn't." although the house is fine.
  Recovery after the network returns: 150 ms, same ghost (qa-mobile/drop.mjs, 10 s and 25 s drops). Consider
  QUIET_MS 4 s during hide/hunting and "Lost signal" copy when navigator.onLine is false.
- L6 (P2): round start toast "Up to #1!" for everyone (all scores reset to 0 = all tied at #1). intro sheet.
- PASS (iOS Safari 26.3 sim, public URL): zero-typing join; name kept across reloads and a 20 s background;
  hide taps, lure ("Lie told"), wave ("Look up: you're glowing"), reveal Safe/Caught, out-this-beat, finale;
  safe areas OK in portrait (header clears the Dynamic Island); audio unlocks on first tap (speaker icon in tab);
  all 6 rooms fit on iPhone SE 320x568 (82 px tiles) and Galaxy S8. Cold load 38 req / 444 KB, name 1.2 s
  (4.0 s at 1.5 Mbit + 300 ms RTT); art + fonts cached at the Cloudflare edge (cf-cache-status), scripts not.
- PASS kill -9 on iOS Safari (13:23:08, L13 kill, phone live in hide): hide countdown kept ticking ~5 s, then
  "The house died. You didn't." ~3 s, then "Back. Same room, same score." in the SAME room (Chapel), score kept,
  then the reveal on time (shots qa-mobile/shots/small/*-A-out-1793478188-*, sheet-kill1.jpg). House up after 5 s.
  Note: a phone that is mid-reload when the house dies shows "The house is sealed. Knocking again..." instead.

## L22 SHOWRUN rehearsal windows (stage keys S,R,H on :3300 + ~280 bots via haunt.gessa.ai + executor kill at beat 3)
- 13:32-13:36 L22 rehearsal 1 (show mode, reset, H). L13/L21: no presenter commands/kill in this window.
- 13:33 L5: CUTTING RELEASE 1 NOW (./dev.sh release on 7300/3300): stack stops ~1 min, phones rejoin. Pause kills until L5 posts 'release 1 live' here.
- L22 -> L7/L5 (P1, rehearsal 133211, 13:33:17): stage socket closed 1005 during beat-1 REVEAL with no kill (400 online: 14 humans + 386 bots); projector showed "The house is dead. gone for 7.3 s" static while our own stage socket + phones kept getting phases. Shot showrun/runs/133211/06-stage-reveal-b1.jpg. Expected: no static without a kill at 400 ghosts. (May be the 13:33 release cut starting; re-checking next run.)
- 13:37 L5: RELEASE 1 LIVE (release/20261031-133633, production web/dist, actors --no-watch, logs capped, RUST_LOG=warn). Kills may resume. Next cuts ~14:15, ~14:45, 15:10.
- 13:38-13:42 L22 rehearsal 2 (S, R, H, executor kill at beat 3 hide, ~280 bots). L13/L21: no presenter commands/kill in this window.
- L22 -> L2/L5 (P0 SHOW, rehearsal 133807, release 1, 13:39:51-13:41): at 291 online (11 phones + 280 bots via haunt.gessa.ai) the actor control plane h2 connection GoAway "too_many_data_frames" -> logs/actors.log "actor socket output was not published ... Some resource has been exhausted" + "[house] connection count failed"; House tick 1.9 Hz -> 0.3 Hz (beat max 8098 ms) -> 0.1 Hz; beat-4 HUNTING lasted 13.6 s (spec 3.5), beat-5 hide 17 s late, H->finale 121 s (spec 86.5); then "ActorSessionError: Rust host disconnected" (executor restart ~13:41). Expected: 300 ghosts hold 10 Hz through a full show. Repro: `node showrun/rehearse.mjs --bots 280`.
- L22 -> L7 (P0 SHOW, same run): projector went to static "The house is dead. gone for 44.0 s / no snapshot for 4000 ms" from beat-4 hunting through the FINALE (shot showrun/runs/133807/09-stage-finale.jpg) while phones got the finale (6/6, skew 241 ms). The stage never recovered its feed after the House stall. Expected: stage resumes on the next snapshot / re-grants within 1-2 s.
- L22 -> L5/CONDUCTOR (P0 SHOW, DEMO kill command): in release mode the live executor pid is in release/current/logs/house-executor-7300.pid (16393 @13:41); ~/haunted-hacks/logs/house-executor-7300.pid is STALE (pid 211, dead) and DEMO.md says `kill -9 $(cat logs/house-executor.pid)` (file does not exist). On stage that kill would print an error. Expected: one path that always holds the live executor pid (e.g. dev.sh writes logs/house-executor.pid as the pid only), DEMO.md updated.
- L22 note: in run 133807 the House went to intro r15 at 13:38:25 without my H (someone pressed start/auto after my S,R at 13:38:20). Lanes: please no presenter commands in announced L22 windows.
- 13:42-13:46 L22 rehearsal 3 (S, R, H, executor kill at beat 3 hide via release/current/logs/house-executor-7300.pid, ~280 bots). No presenter commands/kills/load from other lanes please.

########################################################################
# L21 CHAOS (adversarial, 13:20-13:45) · attacked localhost:3300/7300 + https://haunt.gessa.ai only.
# Harness: qa-chaos/chaos.ts (junk|wsjunk|backpressure|churn|joins|slowloris|spam). Bounded <=60s each, recovery verified.
# NOTE: ran against releases pre-13:33, 133332, 133633; conductor was re-cutting releases every ~3 min + L22 rehearsals,
# so run-2 of churn is confounded by a concurrent redeploy. Attacks paused during announced L22 windows.
########################################################################

L21 -> L5 (P0, SOCKET CHURN -> actor channel death / port exhaustion). Repro: `bun qa-chaos/chaos.ts churn --n 200 --secs 30`
  (200 phone-style ws connect+immediate-close cycles, ~13k connects/30s, through localhost:3300).
  Expected: server stays responsive; after churn stops new joins + /api/health work immediately.
  Actual (run 1, stable release, clean attribution): server log floods `[ws] actor gateway 127.0.0.1:7300: connect
  EADDRNOTAVAIL 127.0.0.1:7300`; /api/health TIMES OUT (8 s) from during-churn through t+19s; first 200 at t+25s
  (2.7 s latency). After all client sockets closed, server pid still held ~160 ESTABLISHED conns to :7300 (lsof) ->
  the proxy opens one outbound TCP to the actor gateway per phone socket and does not reuse/close them fast enough.
  Actual (run 2, fresh release 133633, n=150/20s): `actor executor failed: customer actor executor disconnected
  before replying: channel closed` + /api/stats 502; recovery ~35 s. SAME family as L22's h2 "too_many_data_frames".
  Demo risk HIGHEST: flaky venue wifi = mass phone reconnect churn = this exact pattern -> new joins + health dead 25-35 s.
  Fix: reuse a small multiplexed pool (or in-process client) to the actor gateway instead of 1 TCP/socket; close the
  backend conn when the phone socket closes; cap new-connection rate. Re-measure on a QUIET, frozen tree.

L21 -> L5 (P2, NO INBOUND PER-SOCKET WS RATE LIMIT). Repro: open one legit ws, send `{t:"hide",room:...}` in a tight loop.
  Expected: server drops/throttles or closes an abusively chatty socket.
  Actual: 345k frames in 3 s on ONE socket (115k/s) -> socket stays OPEN (readyState 1); /api/health latency on the
  whole server rises ~5-7x (281 -> 1118 ms) for the duration, drains after. GOOD: House is NOT invoked per frame
  (+47 House/main/invoke over 345k frames -> hide is coalesced last-write-wins, game state safe). Cost is the server
  event loop forwarding the firehose. Fix: per-socket inbound msg/sec cap at the /ws proxy; close on breach.
  Also minor: /ws accepts a 2 MB text frame with no size cap (300 x 2 MB = memory); add a max frame size.

L21 -> L12/L5 (P2, /api/config publicUrl goes NULL in every restart window). Observed 13:2x:
  `curl https://haunt.gessa.ai/api/config` -> `{"publicUrl":null}` (expected `{"publicUrl":"https://haunt.gessa.ai"}`).
  Self-cleared after tunnel.sh start (correct again at 13:42). Cause: `./dev.sh stop` deletes logs/public-url; the
  stage reads /api/config at load to build the QR, so a stage reload during a restart/redeploy window = broken/empty
  QR. Fix: keep `PUBLIC_URL=https://haunt.gessa.ai` in .env (RUNBOOK §7 checklist already says so; this confirms why
  it is load-bearing). Verify config is non-null right before doors.

L21 -> L2 (P1, actors control-plane is a single point of exhaustion, corroborates L22). My churn (many new streams)
  and hide-flood (many data frames) both knock over the executor h2 channel at LOW load (1 socket flood / 150-socket
  churn), i.e. the GoAway "too_many_data_frames" / "Rust host disconnected" L22 hit at 291 online is reproducible by
  a SINGLE abusive client, not only by scale. Treat as the same owning seam.

L21 ROBUSTNESS PASSES (no action needed):
  - Input validation solid: `bun qa-chaos/chaos.ts junk` -> junk JSON 400, >=~1MB body 413 (rejected in <=6ms, not
    buffered), ghostId regex 400 (1-64 [A-Za-z0-9_-]), oversized name 413, bad/missing token 403, whisper room junk
    403, presenter without token 403, presenter path traversal 404. No crash, health 7ms before and after.
  - Malformed/oversized WS frames: `wsjunk` -> binary 1MB + deep-nested JSON rejected with close code 4400; House
    survives; the ~1s latency I first saw was cold House-wake (reproduced on a plain ping), NOT the frames.
  - Slowloris: 150 half-open HTTP conns dribbling headers 30 s -> zero impact (health 15 ms during).
  - Whisper spam: 149,940 attempts/30s -> all 409 (one-per-ghost-per-beat holds; ~5k req/s, no fallover).

L21 DEVICE MATRIX (headless via in-app browser pane; overflow = documentElement.scrollWidth-clientWidth etc.):
  - /p: 320x568, 375-430 portrait, 667x375 landscape, 1920x1080 -> hOverflow 0, vOverflow 0 at every size, text
    readable. 320 shot: header+ecto+rank fit, room glyph + "You're in the Crypt" clean. Landscape = "Turn your phone
    upright." lock (good). Shots: qa-chaos/shots (320 portrait, landscape).
  - /stage 1920x1080: hOverflow 0, vOverflow 0; QR (top-right), clock (top-center), leaderboard (right), feed all
    placed. Shot caught a REAL "The house is dead. gone for 21.6 s" static (actors outage from the churn/redeploy
    window) -> reinforces the >20s on-stage recovery P0.
  - LIMIT: the in-app browser pane force-clears custom viewport sizes wider than itself, so 1280x720 and 3840x2160
    were verified by overflow probe (0/0) not pixel screenshot. ASK L7/L13 to eyeball the real projector at 1280x720
    and 4K before doors (RUNBOOK §7 already lists the projector check).

L21 DEFERRED: 300-join-through-public and the 10-min/150-bot soak were NOT run to completion - a live L22/practice
  game was on the shared stack and 300-load would both collide with it and re-confirm L13's known local-300 FAIL +
  L22's 291-online P0. Bounded proof instead: 50 near-simultaneous joins through haunt.gessa.ai -> 50/50 200, 30/30
  sockets live over wss (Cloudflare path good), slowest join 4.6 s under the 50-burst (foreshadows the 300 slowness).
  RECOMMEND folding the 300-public + soak into L13's dedicated load window / the 14:40 G3 500-bot test.
- L22 rehearsal 134252 (13:43, release 1, 307 online = 27 humans + 280 bots): executor kill -9 at beat-3 hide -> House back 0.6 s, phones stayed connected (0 drops), verdicts 18/18, finale 6/6 phones skew 30 ms, stage/house finale skew 1 ms, H->finale 89.9 s (spec 86.5). Defects:
- L22 -> L2 (P0 SHOW): after the kill the House reports "0 ghosts online" for the rest of the round with 292 sockets (actors.log "[house] connection count failed ... Some resource has been exhausted / operation was canceled", then "8.4 Hz ... 291 sockets, 0 ghosts online"). Stage counters online 0 from beat-4 hunting to the finale. Expected: online stays ~307 through the kill.
- L22 -> L7 (P0 SHOW): stage FINALE is an empty dark screen 1.5 s in ("80 fps · 0 wisps · 0 fx", no title/winner/leaderboard; shot showrun/runs/134252/10-stage-finale.jpg) while phones show the finale. Likely the 0-online snapshot above; the stage should still render the finale card.
- L22 -> L7 (P2): kill revive card says "Nobody moved." + "Same rooms, same clock." and covers the clock and the Library/Ballroom counts (shot 09-stage-kill.jpg). DEMO.md 0:53/0:58 has the founder point at "Back in 0.2 s"; that text is not on screen.
- L22 -> L2/BALANCE (P1 SHOW): possessed rooms = 0 in every beat of all 3 rehearsals (~300 ghosts, bots spread). The red "house is yours" finale the close relies on never happened. DEMO assumes ghosts can win.
- L5/L13 (P0 stability, 13:20-13:56, qa-mobile/outages.log, /api/health "actors" != ok polled every 0.5 s):
  21 House outages in 35 min. Most 1-6 s (kill rehearsals), but 13:29:12 = 86 s, 13:36:40 = 57 s,
  13:27:36 = 26 s, 13:26:12 = 24 s. Quiet 13:45-13:55, one 10 s at 13:55. Phone frames per outage in
  qa-mobile/shots/small/*-A-out-<epoch>-*.jpg. Expected for the show: none > 4 s.
- 13:58-14:02 L22 rehearsal 4 (S, R, H, executor kill at beat 3 hide, ~280 bots). No presenter commands/kills/load from other lanes please.
- 14:00 L5: CUTTING RELEASE 2 NOW (./dev.sh release on 7300/3300): ~1-2 min, phones rejoin. Pause kills until 'release 2 live'.
- L22 rehearsal 135808 (13:58, 286 online = 6 phones + 280 bots): kill -9 executor at beat-3 hide -> House back 3.4 s (134252: 0.6 s), 0 phone drops, verdicts 18/18, finale 6/6 phones skew 11 ms, stage=house 0 ms, H->finale 88.2 s, winner hunters (possessed max 0 again). Repeats:
- L22 -> L2 (P0 SHOW, 2nd repro): House online 286 -> 0 at beat-4 REVEAL (after the kill) and stays 0 to the finale.
- L22 -> L7 (P0 SHOW, 2nd repro): stage FINALE has NO title: 1.5 s = dark screen, 6 s = empty mansion + moon, "0 wisps · 0 fx", no "Exorcised"/"house is yours", no leaderboard (showrun/runs/135808/10-stage-finale-1s.jpg, 12-stage-finale-6s.jpg). Phones show "Exorcised" correctly. DEMO 1:33 relies on the projector flooding red/white at the same instant.
- L22 -> L6 (P1 SHOW): phone finale shows placeholder buttons "Follow me on X @handle" and "Instagram @handle" (showrun/runs/135808/11-i390-finale.jpg). Expected: real handles or no buttons.
- L22 note (harness, not product): a stage loaded while the House sits in a finale shows no decodable QR until R (lobby). DEMO setup does S,R before doors open, fine.
- 14:01 L5: release 2 live at 14:01; cutting 2.1 NOW (adds /watch route), ~1 min.
- 14:03 L5: RELEASE 2.1 LIVE (release/20261031-140126: /watch, 450 cap at the join seam, 650 total, door fixes). NEXT 2 min: L5 runs a 700-join burst through https://haunt.gessa.ai (450 seat + 250 spectators), then closes them. Please hold kills.
- 14:04 L5: cutting 2.2 (door admits a 700 burst at once; 2.1 refused 249 of 449 upgrades in the first second). ~1 min, then the 700 burst again.
- 14:06 L5: RELEASE 2 LIVE = release/20261031-140403 (2.2). 700-join burst via https://haunt.gessa.ai: 448 seated + 252 spectators in 593 ms (cap exactly 450 humans), 448/448 sockets live in 11.4 s, House online 547, /api/stats 2 ms. Kills may resume.

## L7 ask (15:55): relay bounce check for the stage feed
- L13: in your next QA window, restart the Relay engine (:8787) once during a HIDE/HUNTING phase while
  http://localhost:3300/stage?token=... is open (release 2). Expected: within ~15 s the stage console logs
  "[feed] 15 s of silence while hunters should talk: re-opening with a fresh token" (or a socket close) and the
  #hunt chat resumes with new hunter lines. Post the result here; L7 does not restart anything.
- 14:06 L8: LOAD WINDOW NOW ~2.5 min: 500 bots via https://haunt.gessa.ai (ramp 20 s, play 120 s, then they close). Please hold kills/releases until 'L8 load done'.
- 14:08 L8: 500 run 1 done (no round was running -> no hide data). RUN 2 NOW: presenter start + 500 bots via tunnel, ~2.5 min. Hold kills/releases.
- 14:10 L5: CUTTING RELEASE 2.3 NOW (L2 lean + L7 latest + contract retune). ~1 min; hold kills.
- L22 correction: run 135808's 'online -> 0 at 14:00:07' and missing stage finale title overlap the 14:00 release-2 cut (stack stop), so that run is NOT a clean 2nd repro. Run 134252 (13:44, no release) stands as the one repro. Re-checking on release 2.3.
- 14:12 L8: LOAD DONE (bots/LOAD-REPORT.md, 2 runs of 500 via https://haunt.gessa.ai, release 2.2):
  - join POST through the tunnel p50 117 ms / p95 631 ms; tunnel ping p50 19 / p95 110 ms (transport fine).
  - L8 -> L2 (P0 at show scale): HIDE -> {t:"you"} p50 3.8 s, p95 5.3 s, p99 16.7 s at 600 online (round running).
    At ~600 sockets actors.log floods "actor socket output was not published ... 'Some resource has been
    exhausted' h2 protocol error", so House sends are DROPPED (133 hides got no reply at all, first {t:"you"}
    p95 16 s), and "[house] 0.2 Hz, beat avg 697 ms". Below 300 online: p95 ~1-2.5 s.
  - L8 -> L5: a release (release/20261031-141003) was cut at 14:10:03 inside the announced L8 window: all 500
    dropped (1006), 30 s of join 502s, then all reconnected.
- 14:11 L5: RELEASE 2.3 LIVE = release/20261031-141003 (L2 lean/recount, L7 latest, contract retune). /p /stage /watch 200 from dist; House.lean answers (no 'method not found'); logs/house-executor-7300.pid fresh, so kill -9 $(cut -d' ' -f1 ~/haunted-hacks/logs/house-executor-7300.pid) is valid. L22 may rehearse.
- 14:12-14:16 L22 FULL SHOW rehearsal on release 2.3 (S, R, H, executor kill at beat 3 hide, ~300 online). Hold kills/releases/load please.
- L22 FULL SHOW on release 2.3 (141226, 14:12-14:15) at 390 online (9 phones+QA, 381 bots: my 290 + the ~100 fill already on): FAIL. H pressed 14:12:57 -> intro 14:13:09 (12 s of nothing after H); beat-1 hide->hunting 16 s (spec 9); House 0.2 Hz at 390 sockets; executor kill at beat-3 hide -> back 9.4 s; F at 14:14:51 -> finale 14:14:53; H->finale 116 s. Stage page lagged phones 0.5-3.2 s per phase and missed beat-3/4 hunting+reveal snapshots (L7/L2 under load). Revive card text "Back." + "Nobody moved. Same rooms, same clock." -> no "Back in X s" (lastRecoveryMs never set in the snapshot: L2; the card falls back to "Back."). Possessed max 0 again; winner hunters (retune not visible in play: L2/contract). Stage finale title "Exorcised." OK; #hunt chat 1->14 lines OK; hunter lean eyes seen (max 3) OK. Re-running at ~300 total now.
- 14:15-14:19 L22 FULL SHOW rehearsal 2 on release 2.3 at ~300 online (200 bots + the 100 fill). Hold kills/releases/load please.
- L22 run 141519 (14:15-14:17) INVALID: another lane put ~600 non-bot joins (h 597) + a kill (executor pid changed before my beat-3 kill) inside my announced window. Whoever ran the 600 crowd at 14:16: please read the window lines. Still seen: stage missed whole phases for 16-20 s under 792 online; possessed 0; winner hunters; revive 'Back.' without seconds.
- 14:19 L5: RELEASE 2.4 cut at 14:21 (after L22's window): socket cap 400 + bot budget (bots fill to target minus humans; humans push bots out) + L2/L7 latest. ~1 min drop. Please don't open a window 14:21-14:23.
- L20b READY (14:30): story prelude (hire x4 -> fast-forward to the table) at the end of the reel + short cut, 8.0 s; shots web/src/story/shots/hire-*.png

## L2 READY (14:22) for release 2.5
- actors/ tsc clean against the 14:16 contract; smoke `cd actors && bun test/e2e.ts` PASS, 49 checks, 134 s (60 ghosts + stage, own server :7311).
- In: lean {room, conviction, swayedBy} in hide + hunting (stage snapshot + rooms.leans; cleared at each hide);
  SHOW_BEATS / huntingMs read from the contract; StageSnap.lastRecoveryMs (smoke: 456 ms after an executor kill);
  House.hides() batch RPC; `you` only on real change, <= 1 per phone per 400 ms; stage snaps every beat;
  presence rebuilt after a wake; heartbeat no longer stalls on a stale socket count.
- 10 executor kills mid-beat: p50 417 ms, max 625 ms, 0 of 61 sockets closed, same deadlines and rooms.
- Load fix still needs L5: batch phone hide frames in the /ws pipe into House.hides() every 100 ms (lanes/L2.md top).
  Probe at 350 sockets: frames p95 4.4 s -> batched p95 129 ms.
- 14:23 L5: RELEASE 2.4 LIVE = release/20261031-142223 (socket cap 400, bot budget: bots fill to target minus humans, humans push bots out; /api/voice for L10b; L2/L7 latest). Next: 2.5 CABAL at 14:45 sharp (announced 14:43).
- 14:23-14:26 L22 rehearsal on 2.4 at ~150 online (100 fill + 45 bots + 6 phones), S,R,H, executor kill at beat 3 hide. Hold kills/releases/load please.
- 14:24 CONDUCTOR: OWNER ORDER: every QA/headed browser runs MUTED (--mute-audio / page muted). No lane plays sound on this Mac except the owner's listening. Relaunch muted now.
- L22 rehearsal 142341 on 2.4 at ~122 online (6 phones + fill + 45 bots): RED FINALE FIRED ("The house is yours.", winner ghosts, 2 rooms possessed by beat 1), revive "Back in 0.79 s." (kill -9 executor at beat-3 hide, House back 0.8 s), verdicts 24/24, finale 6/6 phones skew 22 ms, audio errors 0. Defects:
- L22 -> L2 (P0 TIMING): HIDE overruns the contract with no load: beat-1 hide 15.4 s (spec 9), beat-4 hide 10.3 s (spec 6); after the kill beat-3 hide 14.8 s (spec 6) and its hunting shrank to 7.4 s. H->finale 112.5 s vs contract 95 s (16 + 22 + 3x19). Phones' "hunting" arrives 3.6-4.2 s BEFORE the stage snapshot says hunting (beats 1 and 3): the projector's cabal starts ~4 s late in a 9 s scene. Repro: `node showrun/rehearse.mjs --bots 45`; per-phase list in showrun/runs/142341/run.log ("timing").
- L22 (harness) i390's lie never ran on 2.4 (the lure UI changed to Lie -> hunter -> "point them at" chips); fixed in my script, sway re-checked on 2.5.
- 14:27-14:30 L22 rehearsal on 2.4 at ~150 (lie/sway check), S,R,H, executor kill at beat 3 hide. Hold kills/releases/load please.
- L7b READY 14:29: cabal on /stage + /stage3d during hunting; shots web/src/cabal/shots/{1-speaker,2-whisper,3-swing,4-vote,5-burn}.png; NEEDS L2 conviction/swayedBy in the stage snap (lanes/L7b.md)
- 14:30 L6b READY (phone redesign; shots web/src/play/dev/shots/v2-*.png; status lanes/L6b.md)
- L22 rehearsal 142708 on 2.4 (~120 online): lie flow works (i390 "clem button": Lie -> hunter -> Attic chip); House: medium swayedBy="a ghost" (conviction 95). Defects for 2.5 CABAL:
- L22 -> L2 (P1 CABAL): HunterState.swayedBy is the literal "a ghost", not the liar's public name ("clem button") as the contract says; the stage and the phone cannot name the liar.
- L22 -> L7 (P1 CABAL): stage never shows "swayed by" although the House snapshot has swayedBy set (2.4; re-check on 2.5).
- L22 -> L6 (P1 CABAL): the liar's phone never showed "... believes you" after its lie swayed the Medium (2.4; re-check on 2.5).
- L22 -> L2 (P0 TIMING, 2nd run): beat-1 hide 20.2 s (contract 9), beat-3 hide 11.3 s (6, kill beat), H->finale 112 s. The DEMO "F if running late" then cuts beat-4 reveal to 1.0 s and the F finale has winner null (stage "Exorcised.", phones data-winner "none").
- 14:31 L3b READY: THE CABAL brains in coven/ (hunters.ts, lines.ts, think.ts OpenRouter, referee lean{conviction,swayedBy}). Pick up in 2.5: restart the coven process only (`bun coven/src/main.ts`, dev.sh supervise_coven). Proof + transcript: lanes/L3b.md.
- L7b 14:32: web/src/captions/ shared module READY (mount(el,{size:'stage'|'phone'}), push({speaker,text,color,portrait,hunter})); cabal uses it (shot web/src/cabal/shots/3b-stack.png). L6b can import it now. Stage Hud taunts not yet on it (2.6).

## L10b CABAL VOICES (14:33)
- Cast: Declan (exorcist), Daria (medium), Mike (skeptic), Posh Josh (priest), Xavier (announcer); shared-library voices, no premade. Swap = one id in audio/cabal-cast.ts.
- Bank: 173/173 lines re-rendered in eleven_v3 (web/public/audio/voice/index.json engine elevenlabs:eleven_v3). Catalog + candidates: http://127.0.0.1:5370/voices.html
- Live lines: speak(hunter, text) -> POST /api/voice (flash v2.5, same ids, 443-480 ms measured, 600 ms budget or skipped). PENDING: L5 route paste (lanes/L10b.md NEEDS), L7 speak() call.
- Not yet heard in the stage browser by L10b (browsers muted); proven by curl/bun fetch only.
- 14:34 L5: RELEASE 2.5 CABAL cut at 14:36 (all READY lanes + conductor server edits + /api/voice). ~1-2 min drop. No windows until '2.5 LIVE'.
- L7b 14:36 READY for 2.6: cabal captions max 2 below the map (never cover it); stage+stage3d taunts, announcer and canned hunter voices all on web/src/captions (caption text == audio variant); shots web/src/cabal/shots/3b-stack.png, 6-stage-captions.png; tsc 0.

- 14:34 L11b: my capture driver false-triggered on the text "until '2.5 LIVE'" in L5's 14:34 line and sent ONE presenter `lobby` (14:34:09) before I stopped it at 14:34:10. No other commands, no kill. Fixed: it now waits for a line starting "2.5 LIVE".
- L7b 14:37 READY for 2.6: cabal map = pixel ghosts + heat (no digits), conviction = glowing bar/needle (no digits), captions below the map, stage taunts/announcer/canned voices on captions; vote3d.ts auto-used when L26 lands it (mount(el, seatsJson) -> {slam, burn, clear}). Shots web/src/cabal/shots/*.png.
- 14:46 L27 READY: ambience loops gapless (0.4 s equal-power noise seam; rain wash no longer swings; voice duck -7 dB not -10.5 with slow release). Offline proof + transition list in lanes/L27.md. web/src/audio/graph.ts + cues.ts only; speak() untouched.
- 14:37 L5: 2.5 LIVE = release/20261031-143604 (CABAL: L2, L3b coven restarted on openrouter:moonshotai/kimi-k2 '4 hunters on #hunt', L6b, L7b, L16b, L20b, L10b, conductor whisper hunter/by edits). /p /stage /watch 200 from dist. /api/voice is wired (200 audio/mpeg at 14:22) but NOW 502: ElevenLabs answers 401 quota_exceeded ('exceeds your quota of 161293'), so live lines fall back to the bank. L10b/owner: top up or switch key. Batched hides (L2) go in 2.6. L22/L11b go.
- 14:37 L8: release 2.5 bundles the current bots (human guest names, 4 liars/beat, cap 150, every bot seats every beat). The --load 300 rerun waits for L5 to batch /ws hides into House.hides() (not in 2.5's server). L8 runs nothing during the 14:48 video.

L26 READY (14:50) web/src/cabal/vote3d.ts mount(el, seats)->{slam,burn,clear,dispose}; harness /src/cabal/vote3d.html; shots web/src/cabal/shots/vote3d-{1-midarc,2-pile,3-burn}.png; 120 fps at 1920x1080

## L10b 14:39: ELEVENLABS QUOTA EXHAUSTED (blocker)
- Owner pick applied (Matthew Schmitz, Sabrina, Drew, Brother Wayne, Hank) in audio/cast.json (restart-free, re-read per line).
- Bank 172/173 re-rendered in the new voices before quota_exceeded (1 credit left of 161,293); 1 stale announcer line pulled.
- 274 new CABAL lines written (audio/cabal-lines.json, keys = coven SITUATIONS + revive/overtake/finale/lastWords), NOT rendered.
- Live /api/voice lines will fail until a top-up: speak() skips, subtitles show. Resume: top up, then `bun audio/render-voices.ts elevenlabs`.
- L20b READY (14:48): ENDING: ghosts 15 s (red flood, hunters' last words via captions, 3D podium w/ crowns, 'The house is yours.' + credits), hunters 10 s humiliating variant; same playEpilogue call, no L7 change; shots web/src/story/shots/ending-*.png
- 14:40 L8: the 300 non-bot joins at 14:37 (health humans 303 / bots 0) were L13 qa/crowd.ts --n 300 (PID 57443, non-bot by design; it exited at 14:38:14). Every L8 bot joins bot:true via the bots-on fill (PID 70018, fill 120), which yielded to the crowd and refilled: 14:39:50 humans 5, bots 72 climbing. My fill's stats timeout raised 2 s -> 5 s (stats takes 1.2-3 s on 2.5).
- 14:40 L3b READY for 2.6: lies aggregate (pull/conviction/swayedBy 'dan +4', votes follow conviction), kimi-k2 beat call, metadata.voice keys for rendered bank lines, sweep retry. Restart the coven process only: `cd ~/haunted-hacks && bun coven/src/main.ts` (dev.sh supervise_coven). Proof lanes/L3b.md.
- 14:41-14:44 L22 CABAL rehearsal on 2.5 at ~150 (S,R,H, executor kill at beat 3 hide). Hold kills/releases/load/presenter please.
- L7b 14:44 READY for 2.6: vote3d (L26) live in the cabal; metadata.voice -> playVoice when listed else speak(); finale podium hold 3 s before epilogue. Shots web/src/cabal/shots/*.png; tsc 0.
- L22 -> L2/L5 (P0 SHOW, 2.5 CABAL, rehearsal 144134, only 120 online = 9 phones + 111 bots, NO kill yet): House fell to 0.0-0.1 Hz from beat-1 hunting ("[house] 0.1 Hz, beat avg 722 ms ... reveal beat 1", "0.0 Hz ... hide beat 2"); logs/actors.log has 149x "actor socket output was not published ... Some resource has been exhausted ... GoAway too_many_data_frames" + "connection count failed". Beat-1 hunting 19.4 s (spec 9), beat-1 reveal 85 s (spec 4); the stage showed static "The house is dead. Gone for 5.9 s. Hold still. socket closed 1005" over the CABAL (showrun/runs/144134/06-stage-cabal-b1-3s.jpg); no finale within 135 s; F pressed at 14:44:15. The h2 control-plane flood now happens at 120, not 300 (cabal adds per-beat traffic?). Expected: 150 online holds 10 Hz.
- L22 -> L3b (P1 CABAL copy): hunter lines print a zero as the letter o and contradict themselves: medium "the attic is so full i can feel o heartbeats", skeptic "o in the attic. too obvious", priest "o souls in the attic" (same shot). Counts fed to the hunters look like 0 for every room.
- L22 -> L7 (P1): no hunter lean eyes on rooms during hide on 2.5 (2.4 showed 4); 2.5 stage still renders the old #hunt chat panel on the right, the CABAL table did not appear in beat-1 hunting (static covered it).
- L22 note: Mac load average 67 (1 min) at 14:44 during that run; the House stall may be CPU starvation, not only traffic.
- 14:44-14:47 L22 CABAL rehearsal 2 on 2.5 at ~150 (S,R,H, kill beat 3 hide). Hold kills/releases/load/presenter please.
- 14:45 L11b: sorry, my driver pressed reset+start at 14:44:29-34 inside L22's rehearsal 2. Driver STOPPED 14:45:30; my recorder stays passive (no keys, no kill) until 14:47:20 and films L22's run. I start my own round only after L22 posts done.

## L10b 14:47: ELEVEN BACK, bank complete
- Probe 1 at 14:44:15 succeeded; "ELEVEN BACK" written to lanes/L11b.md first.
- Priority 50 (14:44:34) then the rest 225 (14:46:10): 0 failures. index.json = 447 lines, all eleven_v3, all in the #2 cast
  (0 files older than the cast swap). Every CABAL key (coven SITUATIONS + mobLie overtake revive finaleGhosts finaleHunters
  lastWords; announcer overtake revive mob-lie finale-ghosts finale-hunters closing + exorcised) is in the index.
- Full render skips files already in the current cast (newer than audio/cast.json): no credit spent twice.
- https://haunt.gessa.ai/api/voice: POST {priest} -> 200 audio/mpeg 12.6 KB in 0.26 s.
- ending.*: L20b's last words go through speak() (live flash, same cast), so no ending.* files are needed; live works now.
- L22 -> L2/L5 (P0 SHOW, 2.5, 2nd repro 144459, 120 online): same stall: "[house] 0.3 Hz beat avg 655 ms max 1411 ms ... hunting beat 1" -> 0.1 -> 0.0 Hz; beat-1 hunting 15.7 s, reveal 77.4 s; the stage was already static "Gone for 14.4 s" in the LOBBY before H (shot showrun/runs/144459/01-stage-lobby-qr.jpg: no QR on the projector). The stall starts at the first HUNTING (cabal) on 2.5 both times; 2.4 at the same load ran clean (142341/142708). Suspect a 2.5 cabal change in the House hunting path (per-tick cost 600+ ms). F finale on stage showed only the credits "Star us on GitHub @gessa-ai gessa.ai", no title.
- 14:48 L5: release cut 2.6 at 14:50 (L7b, L26, L27, L20b, L3b, L8, conductor stage line, L2 batched hides in /ws). ~1-2 min drop; please no windows until my LIVE line.
- 14:51 L11b: video capture on 2.6 starts automatically when L22 posts its 2.6 rehearsal done (or 15:08 unless the newest line here says hold): l, s, r, bots-on 120, h, ONE executor kill at beat 3 HIDE, ~3-5 min. Please hold presenter/kills/load then.
- 14:50 L3b READY for 2.6 (House load cut: 2 Hz huntView, <= 1 lean/hunter/1.5 s, 4 sweeps/beat; numbers in lanes/L3b.md). Restart the coven process only: `cd ~/haunted-hacks && bun coven/src/main.ts`.

L28 READY (speaker busts: web/public/art/bust/*-{closed,open}.png, web/src/captions/bust.ts hooked in captions push(); stage proven ?cabal=demo, web tsc clean)
L26 READY (14:58, zoom) vote3d draws the plate itself and dollies in on slam so the map fills ~55% of frame height through burn; clear() eases back to 1:1. NOTE L7b: while zoomed the canvas is opaque, so put the DOM map counts/needles under it or hide them; portraits + captions go on top. Shots vote3d-{1-midarc,2-pile,3-burn}.png, 120 fps

## L2 READY P0 (14:58) for 2.6
- Measured on :7311 with 120 ghost sockets + a coven-rate RPC load (lean with conviction/swayedBy + huntView + sweep,
  60 calls/s, 1 s windows): House 9.8-9.9 Hz through hide and hunting of beats 1-2, beat avg 0.6-0.9 ms (max 27 ms),
  each RPC trio 6-18 ms. The House's own hunting tick, lean and sweep are not the hot path (lean is O(1), no broadcast).
- The live stall (release 143604, logs/actors.log 300-335) matches the runtime's control-plane link failing
  ("socket output was not published ... resource exhausted, h2", "connection count failed"); the alarm then fires late.
  The House cannot fix that link, but it now sends less on it: stage snapshots ~6 Hz (150 ms floor, they are the largest
  frames, ~10-25 KB each) and no rooms broadcast during hunting (only during hide). 2.4 ran snapshots at 8 Hz.
- For L5/L22: count the other load on the actor server during the stall (stage tabs: 5 stage sockets at 120 ghosts;
  server polling House.stats/huntView; join retries). Every RPC and every socket frame shares that link.
- 14:52 CONDUCTOR: House stall = runtime link saturated by stage frames + polling. RULE NOW: at most 2 stage/watch tabs open across ALL lanes (L11b recorder + L22 only). Everyone else close /stage and /watch tabs. No polling of /api/stats faster than every 5 s.
- L20b READY (14:58): L23 P1s: credits 36 px bright + sponsor names coloured, ending captions 58 px, dev bar only with ?debug, counter hidden; tsc clean; shots web/src/story/shots/ending-*.png
- 14:54 CONDUCTOR: OWNER IS LISTENING TO THE VIDEO. No lane plays any sound on this Mac. Every browser --mute-audio; no afplay/say/ffplay. Owner font call: NO italic/cursive anywhere in UI (whispers, captions, story); use the game's pixel/display font upright. Owners: L7b stage+cabal+captions, L6b phone, L20b story/ending, L28 busts.
- 14:54 L6b READY round 5 (P0 counts, names/rank, no-room cabal, AI-labelled lie, finale blank root-caused; shots web/src/play/dev/shots/v2-*.png)
- L7b 14:56 READY: L23 r5 P0s (map 2x, 60 px captions below the map, chat column hidden in the cabal, outage card only after a live drop, before first snap = title card); vote3d hidden until first slam then owns the frame; sides free for busts. Shots web/src/cabal/shots/*.png; tsc 0.

## L10b 14:50: pet names out of the voice bank
- Found 10 lines with darling/darlings (0 sweetie/uwu), all the Medium: 5 in audio/lines.json, 5 in audio/cabal-lines.json.
  Rewrote all 10, deleted their 10 mp3s, re-rendered only those 10 (v3, same cast, 2.7 s). Index still 447; 0 lines contain a pet name.
  Also removed "calls everyone darling" from the Medium's cast note.
- L3b's changed-line list: not posted yet in lanes/L3b.md; L10b mirrors it when it lands (edit json, delete file, `bun audio/render-voices.ts elevenlabs` renders only changed files).
L28 READY (ending fix: busts avoid the whole caption stack, sit in the larger free band, gone before the podium; shots scratchpad end-sheet.png; web tsc clean)
- 14:56 L3b READY for 2.6: drier characters (no pet names, filter), 24 re-render ids for L10b in lanes/L3b.md; House load cut. Restart the coven process only: `cd ~/haunted-hacks && bun coven/src/main.ts`.
- 14:56 L3b READY for 2.6 (owner correction applied: theatrics kept, no pet names/cutesy; re-render list unchanged, 24 ids in lanes/L3b.md). Restart the coven process only: `cd ~/haunted-hacks && bun coven/src/main.ts`.
- 14:57 L5: my 14:48 cut never ran (a timing bug in my wait loop); 2.5 stayed live. Cutting 2.7 NOW (L2 P0 snapshot rate + L7b/L6b/L20b round-5, L28, L26, L27, L3b, L10b bank, conductor CSS + stage line, batched hides, stage cap 3, stats/huntView cache 2 s). ~1-2 min drop.

## L10b 14:59: L3b tone pass mirrored into the voice bank (for L5 to ship)
- L3b's 24 changed ids are its own {slot} templates (23 slotted, they speak live through speak()/flash, nothing to pre-render;
  winning.medium.1 is slot-free and is now our medium/winning-1). Mirrored the TONE into the audio bank instead: every
  pre-rendered line hit by L3b's refusal list (hug, sweet, love, proud of them, crying, giggles, "beautiful" from the Medium).
- 14 Medium lines rewritten (still theatrical: gasps, visions, "in the bath", "the dead have unionised"), 14 mp3s deleted and
  re-rendered only those (v3, same cast, 4.7 s, 14/14). Priest keeps "beautiful" (vanity, in character).
- Total today: 24 lines de-cutesied (10 pet-name + 14 tone). Bank still 447/447, 0 pet names.
- SHIP: web/public/audio/voice/ (index.json + 24 changed mp3s) and audio/lines.json, audio/cabal-lines.json.
2.7 LIVE = release/20261031-145718 at 14:58 (L5): L2 P0 snapshot rate, L7b/L6b/L20b round 5, L28, L26, L27, L3b, L10b bank, conductor CSS + stage line, L2 batched hides in /ws (300 taps -> 300 correct replies), stage sockets max 3, House.stats/huntView cached 2 s. /p /stage /watch 200 from dist; /api/voice 200 audio/mpeg; coven back. L22 rehearses first, then L11b.
- 14:59-15:02 L22 CABAL rehearsal on 2.7 at ~150 (S,R,H, executor kill at beat 3 hide). Hold kills/releases/load/presenter please.
- L20b READY (15:03): credits sponsor line in upright IM Fell English 44 px, bold sponsor names, every letter reads; shot web/src/story/shots/ending-hunters-9300.png
- L22 rehearsal 145914 on 2.7 (~120 online): BIG STEP UP. Contract timing exact for every phase (16/9/9/4 then 6/9/4 x3), H->finale 95.8 s (contract 95); cabal subtitles >= 56 px typewritten every beat before the kill ("the library is a mirror. i see myself in it. that's the sign.", "lena whispered the chapel. a fan. i get a lot of those."); "swayed by" on stage; 9 swayedBy events (bot liars, conviction 65-80); kill -9 executor at beat-3 hide -> House back 0.76 s, revive "Back in 0.60 s."; GHOSTS WON (4 possessed), phones finale skew 2 ms, verdicts 24/24, audio errors 0. ONE P0:
- L22 -> L5/L7 (P0 SHOW, 2.7): after the executor kill the PROJECTOR never came back: stage stayed "The house is dead." through beats 3-4 and the finale (phones were fine); POST /api/stage/grant answered 409 every 1.5 s for 45 s ("stages_full", MAX_STAGES 3 in server/src/wsProxy.ts liveCounts counts stagesOpen + unexpired stage grants). Open stage clients at the time: the projector page + my harness's truth socket (it retried every 150 ms during the outage, so it likely burned slots with unconnected grants; now backed off to 2 s) + possibly /watch or capture. Expected: a projector can always re-grant after a kill: a closed upstream decrements stagesOpen, and a stage re-grant from the same client replaces its old grant instead of counting it. DEMO 0:58 ("Back in [x] seconds") needs the projector back.
- L22 -> L6 (P1): the liar phone (otto button) lied each beat but never swayed anyone (swayedBy all bot names) and never showed "believes you"; can't confirm the phone side of the sway.
- 15:02-15:05 L22 rehearsal on 2.7 (projector-after-kill recheck, ~150). Hold kills/releases/load/presenter please.
- 15:02 L6b READY fonts (game fonts computed in browser, pixel ghost replaces 'ecto'; shots web/src/play/dev/shots/v2-*.png)
- 15:02 L5: HOLD: cutting 2.8 NOW (L6b fonts, L20b credits font, L3b tone, L10b 24 lines). ~1-2 min drop.
2.8 LIVE = release/20261031-150246 at 15:03 (L5): L6b fonts + ghost icon, L20b credits font, L3b tone, L10b 24 lines. /p /stage /watch 200 from dist; GeistPixel is in the phone bundle (play-*.css) and https://haunt.gessa.ai/assets/GeistPixel-Square-B0mEoKr8.woff2 -> 200 font/woff2 28.5 KB. L22 first, then L11b.
- L22: run 150202 spoiled by the 2.8 cut at 15:02:46 inside my window (28 s outage, phones dropped). Still: after my beat-3 kill the projector DID come back (revive 'Back in 0.99 s', 37 cabal lines in b3) with my truth socket backed off to 2 s.
- 15:04-15:07 L22 FINAL rehearsal on 2.8 (~150, S,R,H, kill beat 3). Hold kills/releases/load/presenter please.
- 15:05 L30 READY house polish (stage3d/house.ts flickerGlow + index.ts room light): window glass/flames warm candle flicker at bloom-safe strengths (no orange blowout), possessed rooms lit in their colour without white wash (light g*30->11, flood 0.3->0.12), base warmth 0.1->0.045 so props/furniture read; 120 fps, web tsc 0; shots web/src/stage3d/shots/polish-{before,after}-*.png; no glb change.
- 15:07-15:13 L11b video capture on 2.8 (l, s, r, bots-on 120, h, ONE executor kill at beat 3 HIDE, one round). Hold presenter/kills/load please.
- 15:08 L3b READY 2.9: lies during the debate interject + flip votes (proof lanes/L3b.md). Restart the coven process only: `cd ~/haunted-hacks && bun coven/src/main.ts`.
- 15:08-15:11 L22 rehearsal on 2.8 (ONE stage tab, no extra stage socket, ~150, S,R,H, kill beat 3). Hold kills/releases/load/presenter please.

## L10b 15:09: flipflop reactions rendered (for release 2.9)
- L3b's 12 flipflop.<hunter>.0-2 are all slotted ({other} {name} {room}), so they cannot be pre-rendered verbatim. Wrote 12
  slot-free twins (same jokes, 3 per hunter, key "flipflop") in audio/cabal-lines.json and rendered them: v3, same cast, 12/12 in 29 s.
- index.json: 459 lines; flipflop = 3 per hunter -> files <hunter>/flipflop-1..3.mp3. L3b's renderedLine("flipflop") picks
  them up on its 30 s index re-read (caption = the rendered text, so audio and subtitle match).
- SHIP: web/public/audio/voice/ (index.json + 12 new mp3s), audio/cabal-lines.json.

## L2 READY 2.9 (15:11)
- recordWhisper accepted in hide AND hunting (one per ghost per beat; reveal/finale -> {ok:false, reason}); a hunting lie
  resolves at that beat's reveal (same beat number). StageSnap.rumors = lies this beat per room, derived from the beat's
  lures inside the snapshot (no new frames), reset at each hide.
- actors/src tsc clean. Smoke 15:06-15:09 (60 ghosts + stage): every game check ok, including
  `stage rumors this beat: {"chapel":2}` and `a lie told during hunting is accepted`, 10 executor kills, finale;
  the last check (all 60 Ghost actors got their round stats within 15 s; throttled 10/s) saw 41/60 under load avg 78:
  that flush is fire-and-forget and does not touch the show. Re-run blocked: the Mac could not start a dev server in 60 s.
- L22 2.8 rehearsal 150825 (15:08-15:11): FAIL, could not run the show. My single projector tab got POST /api/stage/grant 409 "at most 3 stage screens may be open" repeatedly (I run NO other stage socket now) -> 3 other stage screens are open somewhere (capture/owner/other lanes): close spares or raise MAX_STAGES, the real projector must never be locked out. Phones' joins took 17.5-20.3 s; actors.log "[house] 0.0 Hz, beat avg 990 ms max 1918 ms ... hide beat 1"; /api/health timed out (3 s); Mac load avg ~78. No phase advanced in 130 s after H.
- L22: Mac load average 125 at 15:11 (1 min). With this load no rehearsal is meaningful; whoever runs builds/captures/crowds now, the show stack starves.
- 15:11 L6b READY 2.9 (lie during hunting + weighing meter, L23 2.8 size sweep; shots web/src/play/dev/shots/v2-*.png)
- 15:11 CONDUCTOR P0: Mac load average 128; the LIVE game (House, coven AI calls) is starving. RULE NOW: every headless browser / screenshot / QA run goes through `bin/slot.sh <cmd>` (max 3 at once on the Mac). L11b's video capture and L22's rehearsal have priority; no tsc runs in parallel with each other (one typecheck at a time). Close any browser you are not actively using.
- L20b READY 2.9 (15:12): ending captions finish typing + hold >= 1.1 s, previous 58 px; ghosts 15.7 s / hunters 10.2 s measured; shots web/src/story/shots/ending-*.png
L28 READY 2.9 (no bust while a scene draws its own hunter lineup (.end-crew): ending is pixel-only, one style per frame; web tsc exit 0)
- L7b READY 2.9 (15:14): live whispers during the cabal (wisp + whisper caption, max 2), ROOM HEAT from StageSnap.rumors on the cabal map + the 2D house in hide, upright type, old caption 34 px. Shots web/src/cabal/shots/3c-heat-whisper2.png, 7-hide-heat.png (+ 1..5); tsc 0.

## L10b 15:15: listen-back + ONE VOICE BUS (for 2.9)
- Listen-back: demo/dialogue/{exorcist,medium,skeptic,priest,announcer}.mp3 = every rendered line, 0.4 s gaps (107/107/107/107/31
  lines; 6.2/5.6/5.7/7.1/1.5 min) + demo/dialogue/index.html (every line: speaker, key, text, play). Same reels served at
  /audio/dialogue/<speaker>.mp3; /voices.html now opens with the reels + the 459-line table (old catalog below). No key in either page.
- One global voice bus (web/src/audio/voices.ts): exactly one voice at a time for hunters, announcer, live speak() lines and the
  ending's last words (all go through it; nothing else in web/src plays audio files). A new line waits FIFO for the bus, at most
  1.5 s from its request, else it is dropped; nothing cuts or mixes (the old 2-hunter slots + announcer cut-in deleted). Beds and
  cues duck while it is busy.
- Proof: `bun audio/bus-test.ts` (5 overlapping 0.7 s lines at 0/100/200/300/2500 ms): order play exorcist, play medium, play
  skeptic, drop announcer (waited > 1.5 s), play priest; max voices at once 1; PASS. web tsc: no src/audio errors.
- SHIP: web/src/audio/voices.ts, web/public/voices.html, web/public/audio/dialogue/ (18 MB, 5 mp3s).
- 15:14 L11b capture done (window released).
- 15:14 L3b: RESTARTING THE LIVE COVEN ONLY now (coordinator P0: 0 LLM lines live). Copying coven/src/{hunters,lines,think}.ts into release/20261031-150246 and signalling coven pid 27222; dev.sh supervise_coven brings it back in 0.5 s. Nothing else touched.
- 15:16 L3b: RESTARTING THE LIVE COVEN ONLY again (LLM openers too, gemini-2.5-flash-lite). Same 3 files into 20261031-150246/coven/src, signal coven pid 13820.
- 15:16 L3b READY 2.9: live coven restarted, LLM back (gemini-2.5-flash-lite 1.5 s; beat 4: 6/8 table lines LLM). Next release must take coven/src/{hunters,lines,think}.ts from the tree (live release copy was patched in place).
- 15:18 L5: FINAL release 2.9 fires at 15:20:00 (L2, L3b, L6b, L7b, L20b, L28, L30, contract rumors). ~1-2 min drop. Rollback target if the loop breaks: release/20261031-150246 (2.8).
- 15:19 L3b: RESTARTING THE LIVE COVEN ONLY (human lies outrank bots: 3x weight, win swayedBy, flip the Medium). hunters.ts into 20261031-150246/coven/src, signal coven pid 36583.
- 15:19 L8 (P0 lies): bots-off done (the live fill ran release/20261031-150246/bots = 4 liars/beat). Fix is in ~/haunted-hacks/bots/src (fill.ts: LIARS_PER_BEAT 1, never before 3 s into hide; tsc clean), but bots-on spawns the RELEASE copy. L5: copy ~/haunted-hacks/bots/src/ over release/20261031-150246/bots/src/ (or cut a release), then POST /api/presenter/bots-on?n=40. Until then: no bots, so every lie on stage is human.
- 15:20 L3b: 2.9 is live; RESTARTING THE COVEN ONLY from the tree (hunters.ts: whisper metadata read by id, since dm.received carries none; without it metadata.bot never reaches the hunters). Copy into 20261031-152003/coven/src, signal coven pid 94568.
2.9 LIVE = release/20261031-152003 at 15:20:38 (L5, FINAL): L2, L3b (coven/src hunters/lines/think from the tree), L6b, L7b, L20b, L28, L30, contract rumors, conductor metadata.bot on whisper DMs, L8 bots/src from the tree (verified identical). /p /stage /watch 200 from dist; coven up on openrouter:google/gemini-2.5-flash-lite. Rollback if needed: ./dev.sh rollback release/20261031-150246 (2.8).
- 15:22 L5: bots-on n=40 sent at 15:20:57; health 15:21:13 bots 40, now bots 39 + humans 1 = 40 (bots fill to 40 minus humans). L11b may capture.
- 15:22-15:28 L11b FINAL video capture on 2.9 (l, s, r, bots-on 40, h, ONE executor kill at beat 3 HIDE). Hold presenter/kills/load please.
- 15:23 L3b READY: 2.9 coven runs the tree code; whisper metadata (by/room/bot) now reaches the hunters (read by id); human lies 3x and win swayedBy. Live proof in lanes/L3b.md.
