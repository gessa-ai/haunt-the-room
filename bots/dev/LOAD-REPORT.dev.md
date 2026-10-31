# L8 load report (newest run first)

## 10/31/2026, 14:30:01 PDT · 60 bots · http://127.0.0.1:7340

- Command: `bun bots/src/main.ts --load 60 --base http://127.0.0.1:7340 --ramp 3 --play 45 --report bots/dev/LOAD-REPORT.dev.md`
- Path: POST http://127.0.0.1:7340/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots hide once or twice per HIDE phase, taps spread over its first 70% (40% spread, 35% crowd into the fullest open room no hunter leans toward, 25% emptiest room; every bot taps every beat with a safety seat at 85% of the phase; never a full room, retry when refused; ~12% of seated bots switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).
- Ramp 3 s, play 45 s, wall 48 s. House phase hunting. House before: online 0 (humans 0, bots 0); peak: online 60 (humans 0, bots 60); 1.5 s after close: online 0 (humans 0, bots 0) (the House keeps a dropped ghost online for its reconnect grace).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **60/60 (100.0%)** |
| socket opened on first attempt / connected at end | 60 / 60 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **1 / 1 / 1 ms** |
| join POST p50 / p95 / max | 0 / 0 / 0 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 0 / 0 / 0 ms |
| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **0 / 0 / 7 ms** (p99 6 ms, n=151) |
| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | 0 / 0 / 6 ms (n=151) |
| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **0 / 0 / 6 ms** (n=526, lost 0) |
| hides sent / answered / refused (House kept another room) / unanswered (no reply) | 161 / 151 / 1 / 0 |
| HIDE phases seen (bot-beats) / sat out caught / last-second switches / seat rescues | 120 / 23 / 13 / 0 |
| catches per in-play bot-beat (target 0.25-0.40) | 0.24 |
| reveal results | possessed 30, caught 23, safe 7 |
| **disconnects** after open / reconnects | **0** / 0 (close codes: -) |
| **errors** | **none** |
| frames received | you 401, phase 420, pong 526, rooms 1440, result 60 (59/s avg) |
| driver event-loop lag p95 / max | 1 / 5 ms |

Verdict: **GREEN** against the L8 bar (connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%).


## 10/31/2026, 12:57:14 PDT · 150 bots · http://127.0.0.1:7340

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:7340 --ramp 5 --play 30 --report bots/dev/LOAD-REPORT.dev.md`
- Path: POST http://127.0.0.1:7340/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots hide once or twice per HIDE phase (40% crowd, 40% spread, 20% random; ~12% switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).
- Ramp 5 s, play 30 s, wall 35 s. House phase finale. House before: online 0 (humans 0, bots 0); peak: online 150 (humans 0, bots 150); 1.5 s after close: online 0 (humans 0, bots 0) (the House keeps a dropped ghost online for its reconnect grace).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **150/150 (100.0%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **1 / 5 / 17 ms** |
| join POST p50 / p95 / max | 0 / 2 / 8 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 0 / 0 / 2 ms |
| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **0 / 0 / 3 ms** (p99 2 ms, n=358) |
| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | 0 / 1 / 1 ms (n=130) |
| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **0 / 1 / 5 ms** (n=916, lost 0) |
| hides sent / answered / refused (House kept another room) / unanswered (no reply) | 358 / 358 / 0 / 0 |
| HIDE phases seen (bot-beats) / sat out caught / last-second switches | 312 / 57 / 28 |
| reveal results | caught 97, possessed 146 |
| **disconnects** after open / reconnects | **0** / 0 (close codes: -) |
| **errors** | **none** |
| frames received | you 1051, phase 1329, pong 916, rooms 3600, result 243 (204/s avg) |
| driver event-loop lag p95 / max | 1 / 3 ms |

Verdict: **GREEN** against the L8 bar (connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%).


## 10/31/2026, 12:42:30 PDT · 5 bots · http://127.0.0.1:3300

- Command: `bun bots/src/main.ts --load 5 --base http://127.0.0.1:3300 --ramp 1 --play 10 --report bots/dev/LOAD-REPORT.dev.md`
- Path: POST http://127.0.0.1:3300/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots move every 3-8 s, flee 75% of warns (60% after 0.3-1.2 s, 15% in the last 0.3-0.5 s), respect seals and banishment, never whisper.
- Ramp 1 s, play 10 s, wall 11 s. House before: online 3 (humans 3, bots 0); peak: online 5 (humans 0, bots 5); after close: online 5 (humans 0, bots 5).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **5/5 (100.0%)** |
| socket opened on first attempt / connected at end | 5 / 5 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **201 / 235 / 235 ms** |
| join POST p50 / p95 / max | 199 / 232 / 232 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 13 / 33 / 33 ms |
| **message latency** (move -> matching {t:"you"}) p50 / p95 / max | **- / - / - ms** (p99 - ms, n=0) |
| moves sent / answered / refused (answered with another room) / unanswered (no reply) | 0 / 0 / 0 / 0 |
| warns heard / fled (late, daredevil) / caught | 0 / 0 (0) / 0 |
| **disconnects** after open / reconnects | **0** / 0 (close codes: -) |
| **errors** | **none** |
| frames received | you 105, phase 5, rooms 105 (20/s avg) |
| driver event-loop lag p95 / max | 2 / 5 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, move p95 <= 300 ms, unexpected disconnects <= 1% of bots, unanswered moves <= 0.1%).


## 10/31/2026, 12:40:37 PDT · 150 bots · http://127.0.0.1:7340

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:7340 --ramp 5 --play 15 --report bots/dev/LOAD-REPORT.dev.md`
- Path: POST http://127.0.0.1:7340/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots move every 3-8 s, flee 75% of warns (60% after 0.3-1.2 s, 15% in the last 0.3-0.5 s), respect seals and banishment, never whisper.
- Ramp 5 s, play 15 s, wall 20 s. House before: online 0 (humans 0, bots 0); peak: online 150 (humans 0, bots 150); after close: online 0 (humans 0, bots 0).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **150/150 (100.0%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **1 / 5 / 89 ms** |
| join POST p50 / p95 / max | 0 / 2 / 48 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 0 / 0 / 3 ms |
| **message latency** (move -> matching {t:"you"}) p50 / p95 / max | **0 / 1 / 11 ms** (p99 2 ms, n=461) |
| moves sent / answered / refused (answered with another room) / unanswered (no reply) | 461 / 461 / 0 / 0 |
| warns heard / fled (late, daredevil) / caught | 243 / 174 (33) / 52 |
| **disconnects** after open / reconnects | **0** / 0 (close codes: -) |
| **errors** | **none** |
| frames received | you 659, phase 150, rooms 5235, warn 257, caught 52 (318/s avg) |
| driver event-loop lag p95 / max | 1 / 14 ms |

Verdict: **GREEN** against the L8 bar (connect >= 99%, move p95 <= 300 ms, unexpected disconnects <= 1% of bots, unanswered moves <= 0.1%).


## 10/31/2026, 12:32:17 PDT · 150 bots · http://127.0.0.1:7340

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:7340 --ramp 5 --play 20 --report bots/dev/LOAD-REPORT.dev.md`
- Path: POST http://127.0.0.1:7340/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots move every 3-8 s, flee 75% of warns after 0.3-1.2 s, respect seals and banishment, never whisper.
- Ramp 5 s, play 20 s, wall 25 s. House before: online 10 (humans 10, bots 0); peak: online 160 (humans 10, bots 150); after close: online 10 (humans 10, bots 0).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **150/150 (100.0%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **1 / 1 / 4 ms** |
| join POST p50 / p95 / max | 0 / 1 / 2 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 0 / 0 / 0 ms |
| **message latency** (move -> matching {t:"you"}) p50 / p95 / max | **0 / 0 / 2 ms** (p99 1 ms, n=552) |
| moves sent / answered / refused (other room) / unanswered (>10 s) | 552 / 552 / 0 / 0 |
| warns heard / fled / caught | 464 / 344 / 107 |
| **disconnects** after open / reconnects | **0** / 0 (close codes: -) |
| **errors** | **none** |
| frames received | you 787, phase 150, rooms 6695, warn 464, caught 107 (328/s avg) |
| driver event-loop lag p95 / max | 1 / 2 ms |

Verdict: **GREEN** against the L8 bar (connect >= 99%, move p95 <= 300 ms, unexpected disconnects <= 1% of bots, unanswered moves <= 0.1%).
