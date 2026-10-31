| prompt | model | gen s | lines | pass first try | repair s | pass after 1 repair | phases reached | first-try error (truncated) |
|---|---|---|---|---|---|---|---|---|
| costume drawing guessing game using emoji only | haiku | 113.6 | 271 | yes | - | yes | lobby, drawing, guessing, reveal, over |  |
| costume drawing guessing game using emoji only | sonnet | 141.2 | 361 | yes | - | yes | lobby, clue, guess, reveal |  |
| haunted house tap-to-escape where everyone must coordinate | haiku | 116.1 | 320 | yes | - | yes | lobby, play |  |
| haunted house tap-to-escape where everyone must coordinate | sonnet | 74.6 | 297 | yes | - | yes | lobby, play, result, over |  |
| werewolf-style hidden ghost voting | haiku | 65.9 | 246 | yes | - | yes | lobby, day, night, gameover |  |
| werewolf-style hidden ghost voting | sonnet | 140 | 328 | yes | - | yes | lobby, night, nightReveal, day, dayReveal, over |  |
| pumpkin carving speed race | haiku | 90.9 | 254 | yes | - | yes | lobby, carving, over |  |
| pumpkin carving speed race | sonnet | 91.2 | 340 | yes | - | yes | lobby, play, over |  |
| trivia about horror movies | haiku | 94.9 | 246 | yes | - | yes | lobby, play, reveal |  |
| trivia about horror movies | sonnet | 50.2 | 314 | yes | - | yes | lobby, question, reveal |  |
| zombie tag on a grid | haiku | 78.7 | 289 | yes | - | yes | play |  |
| zombie tag on a grid | sonnet | 70.4 | 275 | yes | - | yes | lobby, play, over |  |

sonnet: first-try 6/6, after repair 6/6, gen seconds median 91.2 (min 50.2, max 141.2)
haiku: first-try 6/6, after repair 6/6, gen seconds median 94.9 (min 65.9, max 116.1)

All 12 generations ran at once (12-way parallel through the `claude -p` CLI), so their times include contention.
Solo re-run, 2 at once, "zombie tag on a grid": sonnet 62 s (280 lines, PASS), haiku 92 s (264 lines, PASS).

OpenAI: `codex` is installed and logged in with ChatGPT, OPENAI_API_KEY is unset. The configured default model `gpt-6.1-sol`,
and gpt-6, gpt-6.1, gpt-5.5, gpt-5.4, gpt-5.2-codex, gpt-5.1-codex, gpt-5-codex and gpt-5 were each refused with
"model is not supported when using Codex with a ChatGPT account". Nothing was generated.

Repair round: never ran, because every game passed on the first try. The repair path in gen.mjs has not been exercised.

Secret-hiding spot check (leakcheck.mjs): ghostvote sonnet/haiku hide other players' roles in view(p1); emoji games
send the costume only to the clue giver (null for guessers).

## Recommendation
- Model: sonnet. Same 100% pass rate as haiku, richer games (more phases, real round loops), and faster when run solo here (62 s vs 92 s).
  Output is about 250-360 lines, which is roughly 4-6k tokens, so latency is bound by output speed and not by the model tier.
- Latency: 50-140 s through the CLI, median ~90 s under load. To get under ~60 s: call the API directly (no CLI startup), stream,
  cap the output (one 200-line module, terse UI), and show the lobby while the code streams in. The playtest itself takes ~1-2 s.
- Failure modes the harness catches (exercised with fixtures/): Math.random/Date on the server, module-level mutable state
  (warm-replay determinism), listener leaks on document, reduce/view/render throwing, non-JSON state, infinite loops (250 ms kill).
- Not caught yet: whether the game is fun or winnable, secret leaks in general (only spot-checked), games that never reach "over"
  within 80 s of simulated time (zombie.haiku stayed in "play"; escape.haiku never reached "over"), and visual/tap-target quality (no screenshot check).
  Next harness additions: a generic leak check (diff view(p) against other players' private fields), a must-reach-"over" check with a longer tick-only tail,
  and a Playwright screenshot at 390x844.
