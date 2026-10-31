# L3b CABAL BRAINS status (15:17) · READY 2.9: LIVE coven restarted, LLM lines back

LIVE P0 (15:10 "0 llm lines"): kimi-k2 on OpenRouter/Novita = 6.4-14.9 s (budget was <= 6.5 s from hide+1.2 s) -> every
beat call timed out. Timed 15:13 (3 tries each, live key): gemini-2.5-flash-lite 1.3/1.5/1.7 s, gpt-4.1-nano 1.4-2.1 s
(flatter), gpt-4.1-mini 2.9-4.1 s, llama-4-maverick 2.2-12.8 s, deepseek-v3 5.0-5.6 s, qwen3-235b 5.8-10.3 s.
- FIX: model = google/gemini-2.5-flash-lite pinned to google-ai-studio (fallbacks on); beat call starts AT hide start,
  budget = hunting start - 0.3 s; it now writes the 4 hide openers too (slots 1.7/2.5/3.3/4.1 s) + the 4 debate lines;
  example names (kyle etc.) flagged as not players. Bank stays the backup (late call, or the line law refuses).
- Live coven restarted twice (QA.md 15:14, 15:16; files copied into release/20261031-150246/coven/src, supervisor
  respawned it). logs/coven.log beat 4 (15:16): 6 of 8 table lines from the LLM (75%), 2 refused by the line law -> bank;
  beat 1 of the earlier restart: 4/4 debate lines LLM. 7 lean, 4 sweep per beat.
- NEXT RELEASE MUST CARRY coven/src/{hunters,lines,think}.ts from ~/haunted-hacks (the live copy was patched in place).


MID-DEBATE LIES (owner 15:05; proved run 11 15:07, var/cabal-run11.log; this House runs 4 s hunting, so the lie went
in at +1.2 s = +3 s of 9 s)
- A whisper DM in HUNTING: the hunter's lean jumps the 1.5 s queue (one lean, new pull), ~0.5 s later it interjects
  with a bank line naming the liar (whispered / crowdLie), and a swayed hunter's vote flips (the ~8 s sweep reads it).
  The next speaker reacts from the new bank situation "flipflop" (12 lines, new ids flipflop.<hunter>.0-2 for L10b).
```
47.3 beat 2 hunting   (Medium leaning chapel 99)
48.6 the-dead DM -> medium: jdog says nursery
49.1 medium    jdog came to me personally. the nursery. that means something.  [interjection, vote flipped chapel -> nursery · 80 swayed by jdog]
49.6 exorcist  the medium was the chapel ten seconds ago.                       [flipflop]
49.8 referee   vote · The Medium -> The Nursery
51.1 House load beat 2: 28 huntView, 7 lean, 4 sweep
51.1 medium    jdog lied about the nursery. i'll remember jdog.
```


TONE (owner "don't be so uwu", proved run 10 14:55, var/cabal-run10.log: 0 darling/sweet/"had something", 12/12 sweeps)
- Personas in the prompt are coven CHARACTER only (dry, adult, deadpan, petty, a little menacing: tired
  professional, true believer, contrarian, narcissist); the contract persona ("calls ghosts darling") is no longer sent.
  Tone rule in every prompt; the line law now refuses darling(s), sweet/sweetie/sweetheart, honey, dear, babe, hug,
  uwu, cutie, bestie, "we had something", "hurt me", "so loved"; and any model line already said this round.
- 14:58 correction (owner): theatrics kept, pet names out. Medium = theatrical true believer (visions, omens, cosmic grudges),
  Priest vain, Exorcist dry, Skeptic petty. Three Medium lines made dramatic again (whispered.medium.5, lied.medium.2, possessed.medium.2; already in the 24 below).
- Fooled reveal: "dan lied about the library. i'll remember dan." (was "i thought we had something").
- L10b RE-RENDER ONLY THESE bank ids (coven/bank-lines.json has the new templates; 24):
  crowded.medium.0, whispered.medium.0, whispered.medium.4, whispered.medium.5, whispered.medium.6, lied.medium.2,
  lied.medium.3, lied.medium.4, mock.medium.3, possessed.medium.0, possessed.medium.2, losing.exorcist.0,
  losing.exorcist.2, losing.exorcist.4, losing.medium.1, losing.medium.2, losing.skeptic.1, losing.priest.2,
  winning.medium.1, winning.medium.2, crowdLie.medium.0, crowdLie.medium.1, crowdLie.medium.2, fooledAgain.medium.2
  (losing.* exorcist/skeptic/priest changed only "{count} rooms gone" -> "rooms gone: {count}" grammar.)
- Run 10 sample: skeptic "dan and sana told me library too. that's four liars or zero ghosts." / exorcist "you're
  both wrong. the crypt has two. i have bills." / exorcist "jdog is the ninth name you've said. ballroom has zero."


HOUSE LOAD (P0 14:42; proved run 9 14:49, var/cabal-run9.log, 3 beats, 12/12 sweeps, 29 lines)
- per beat           before (run 8, 14:39)          after (run 9)
  huntView           ~56 (4 Hz poll, 14 s beat)     28 (2 Hz; 59 in beat 1 incl. the 16 s intro)
  lean               ~9.3 (28 / 3 beats)            8 / 5 / 4 (4 / 2 / 3 coalesced away)
  sweep              4 + blind retries              4 / 4 / 4 (retry only after the invocation failed; none needed)
- Lean coalescer: one queued flush per hunter, at most one lean per hunter per 1.5 s, sent only on a new room, a
  conviction change >= 10 or a new swayedBy; table lines no longer lean when nothing changed. No House reads per
  line: hunters read the cached huntView (the 2 Hz poll is the coven's only House read). Counts logged per reveal.
- v3 voice fired: "exorcist: they've put their names on the door." metadata.voice = exorcist/crowded-1.
- Fixed: the fooled reveal names the LATEST liar (run 9 said kyle while dan +4 had swayed her).


2.6 ADDS (owner 14:35, proved run 8 14:39, var/cabal-run8.log, 3 beats, 12/12 sweeps, kimi-k2 live)
- Lies aggregate: every whisper adds 1 to its room's pull on that hunter; strongest pull = lean, conviction rises
  with the count (Medium 70+10n, Priest 55+10n, Exorcist needs 3 liars or the count), swayedBy = "dan +4".
  A newer lie about another room can out-pull the old one. Skeptic leans the OPPOSITE of the majority (also swayed).
  Votes follow conviction (>= 70 or the Medium: sweep = lean, no knife). New bank situation crowdLie (12 lines).
- Model A/B (same few-shot prompt): kimi-k2 3.1 s, funniest; deepseek-v3 4.9-10 s; gemini-2.5-flash-lite 0.6-1.4 s
  flat and 429s; claude-3.5-haiku gone from OpenRouter. Picked moonshotai/kimi-k2: the ONE beat call runs during
  hide (needs < ~5 s), so its lines are ready at hunting; late = bank. Few-shot with the 10 best bank lines.
- Voice: bank turns in generic situations take an L10b rendered line 50% of the time and post metadata.voice =
  "<hunter>/<key>-<n>" (from web/public/audio/voice/index.json, re-read every 30 s; L10b's cabal keys not in the
  index yet, so none fired in the run). LLM lines carry no key. Bank lines carry metadata.lineId; sheet coven/bank-lines.json.
- Sweeps: one retry when Relay drops the invocation (run 6 lost 8 of 12 under load; run 7/8: 12/12).
```
beat 1 (5 liars: kyle mo sana priya dan -> attic, which has 0)
  medium    kyle said don't tell the others. the attic. so i'm telling everyone.  [attic 80 swayed by kyle]
  skeptic   2 subjects lobbying for the attic. i'm voting against the lobby.      [nursery 75 swayed by mo +1]
  medium    kyle chose me specifically. he said darling, don't tell.             [kimi · attic 99 swayed by dan +4]
  skeptic   kyle told us both attic. that's not special, that's spam.            [kimi]
  priest    my voice carries to the nursery. my vote carries to the chapel.     [kimi] -> swept chapel (betrayal)
  exorcist  attic has zero. kyle has zero credibility. medium has zero shame.   [kimi]
reveal  medium  kyle lied to me. in the attic. i thought we had something.
beat 2  skeptic   the priest leaned the nursery, swept the chapel. i'd like it minuted.
        exorcist  priest. your robes are in the car. nursery. now.               [kimi]
        medium    dan whispered attic. he said darling, this time it's real.     [kimi] -> attic: 0 caught
```


DONE (coven/src: hunters.ts rewritten, lines.ts new, think.ts OpenRouter, referee.ts lean{room,conviction,swayedBy})
- Four hunters = four Relay agents, private memory each: a whisper DM (the-dead -> ONE hunter) is known only to that
  hunter (its prompt marks it PRIVATE) until it says it at the table; the others then mock it by name.
- Whisperer name: metadata.by (L5 2.5), else the "<name>: " text prefix, else "a ghost". swayedBy = that name.
- On the DM the needle swings at once: Medium always (95, swayedBy), Priest 70%, Exorcist only if the count agrees,
  Skeptic leans the opposite. Medium always sweeps her whisper (moment 1: named lie, empty sweep, "kyle lied to me").
- HIDE: 4 openers (+lean) at 0.7/1.7/2.7/3.7 s, whispered hunter first, Skeptic answers. HUNTING: 4 table lines
  ~0.65 s.. apart scaled to the House's real hunting length (9 s -> 0.4/2.2/4.0/5.8 s), then all 4 sweeps at 8.0 s.
- LLM: OpenRouter google/gemini-2.5-flash-lite (timed 1.5 s; gemini-2.0-flash-001 is 404 on OpenRouter). ONE batched
  call per beat at hide+1.2 s writes all four hunting lines in turn order (each still posted by its own agent);
  each line passes the CABAL-PRESSURE line law (ban list, must name a player/room/count/beat) or the bank speaks.
  Hide openers + any late/refused line = bank. Never dead air (proved with no key: 29 lines / 3 beats all bank).
- Bank: 151 authored lines (lines.ts), 10 situations (crowded, empty, whispered, lied, mock, betrayal, possessed,
  losing, winning, fooledAgain) x 4 hunters, slots {name}{room}{room2}{count}{other}{beat}{tally}{liar}; seeded from
  research/CABAL-PRESSURE.md. Prompt carries whisperer name, true count, own past whispers, past sweeps, catch tally.
- Betrayal: Priest/Skeptic knife 30% (sweep != stated lean); reveal records it; next beat someone calls it out.
- Callbacks: liedBy memory -> "fooledAgain" (beat 3: "kyle lied to me before. jdog would never.").

RUN (proof, 14:29, real House :7310, 24 socket bots, real relay :8787 fresh workspace, OpenRouter live)
- `cd ~/haunted-hacks/coven && DURABLE_ACTORS_CONTROL_PLANE_URL=http://127.0.0.1:7310 bun test/flow.ts` (log var/cabal-run5.log)
- 9/11 PASS; the 2 FAILs are leans: :7310 still answers "House.lean was not found" (L2 dev build). On 2.4 integration
  L22 saw medium conviction 95 + swayedBy on the House, so leans work there; 2.5 fixes the name (metadata.by).
```
beat 1 hide   the-dead DM -> medium: kyle says library
  medium    kyle says the library. i'm at ninety percent.        [bank · library 95 swayed by kyle]
  skeptic   the medium heard a whisper and packed a bag for the library.
beat 1 hunt   medium    kyle whispered the library, darlings.       [llm]
  skeptic   the library has subjects zero, medium.                 [llm]
  priest    my robes do not lie. the ballroom.                    [llm]
reveal  medium    kyle lied to me. in the library. i thought we had something.
beat 2  priest    priya says the nursery needs a priest. priya has taste.  [swayed by priya]
  skeptic   the priest, that's whisper 1. you're zero for 1.
  exorcist  the skeptic leaned the attic and voted the nursery. very professional.   (betrayal callout)
  medium    kyle hurt me in the library. but people can change.
beat 3  medium    kyle hurt me. jdog would never. the chapel, darling.     [swayed by jdog]
  priest    the skeptic betrayed us at the chapel. i'll pray for you. briefly.
  medium    kyle lied to me before. jdog would never.             [llm]
reveal  medium    jdog lied to me. in the chapel. i thought we had something.
  exorcist  the skeptic said the attic and swept the nursery. i saw.
```
- Earlier run 4 (llm): "kyle says ballroom. he lies, but i believe him." / "priya whispered attic. it's empty, priest."

NEXT
- Polish prompt if time (model lines are shorter/flatter than the bank; the bank carries the comedy).

NEEDS
- L2: House.lean must accept hunting phase + conviction/swayedBy (contract); :7310 build has no lean at all.
- L5: restart the coven in 2.5 (no new deps). L7: show swayedBy/conviction from the snapshot.

RISKS
- If OpenRouter is slow (> ~4 s at hide), that beat's hunting lines are all bank (still in character, never silent).
