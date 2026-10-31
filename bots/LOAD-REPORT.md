# L8 load report (newest run first)

## 10/31/2026, 14:11:14 PDT · 500 bots · https://haunt.gessa.ai

- Command: `bun bots/src/main.ts --load 500 --base https://haunt.gessa.ai`
- Path: POST https://haunt.gessa.ai/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots hide once or twice per HIDE phase (60% crowd into the fullest open room no hunter leans toward, 25% spread, 15% random; never a full room, retry when refused; ~12% switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).
- Ramp 20 s, play 120 s, wall 140 s. House phase finale. House before: online 100 (humans 1, bots 99); peak: online 600 (humans 1, bots 599); 1.5 s after close: unavailable (the House keeps a dropped ghost online for its reconnect grace).
- **Note (L8):** release 2.2 through the tunnel with a round running (presenter start at 14:08:50). 0 actor reloads. Peak 600 online (599 bots: 500 load + ~99 fill). **Hide -> {t:"you"} p50 3.8 s, p95 5.3 s, p99 16.7 s after the ramp** (it was p95 2.5 s at 250 online). The tunnel is not the cause: ping p50 19 ms, p95 110 ms. **Root cause in logs/actors.log:** at ~600 sockets the actor host floods `WARN actor socket output was not published ... 'Some resource has been exhausted' h2 protocol error`, so House sends to sockets FAIL (hence 133 unanswered hides and the 2.7 s / 16 s first {t:"you"}). The House tick collapses: `[house] 0.2 Hz, beat avg 697 ms`. Separately, at 14:10:03 a release (release/20261031-141003) was cut inside this announced window: the server was back 14:10:41, all 500 dropped (1006), 6738 join 502s and 459 join timeouts, then every bot reconnected. Bot-side reconnects ran 0.25-1 s per bot, so the outage drew ~50 joins/s of retries.

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **499/500 (99.8%)** |
| socket opened on first attempt / connected at end | 500 / 500 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **426 / 1623 / 1808 ms** |
| join POST p50 / p95 / max | 117 / 631 / 1002 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 2668 / 16499 / 19120 ms |
| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **3058 / 5286 / 20158 ms** (p99 16595 ms, n=512) |
| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | 3779 / 5283 / 16716 ms (n=462) |
| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **19 / 110 / 813 ms** (n=9669, lost 0) |
| hides sent / answered / refused (House kept another room) / unanswered (no reply) | 2760 / 512 / 979 / 133 |
| HIDE phases seen (bot-beats) / sat out caught / last-second switches | 2465 / 1140 / 121 |
| reveal results | caught 1103, safe 385, possessed 146 |
| **disconnects** after open / reconnects | **502** / 502 (close codes: 4400 x2, 1006 x500) |
| **errors** | **stats unavailable x46, no {t:you} within 3 s of open x488, join HTTP 502 x6738, join timeout (10 s) x459** |
| frames received | you 15253, phase 8348, rooms 14099, pong 9669, result 1634 (350/s avg) |
| driver event-loop lag p95 / max | 1 / 6 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%).


## 10/31/2026, 14:08:36 PDT · 500 bots · https://haunt.gessa.ai

- Command: `bun bots/src/main.ts --load 500 --base https://haunt.gessa.ai`
- Path: POST https://haunt.gessa.ai/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots hide once or twice per HIDE phase (60% crowd into the fullest open room no hunter leans toward, 25% spread, 15% random; never a full room, retry when refused; ~12% switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).
- Ramp 20 s, play 120 s, wall 140 s. House phase finale. House before: online 89 (humans 48, bots 41); peak: online 620 (humans 48, bots 572); 1.5 s after close: unavailable (the House keeps a dropped ghost online for its reconnect grace).
- **Note (L8):** release 2.2, through the tunnel, 0 actor reloads. The House sat in finale (no round), so there were no hides; rerun with a round below. Findings: (1) the first {t:"you"} after open was slow, p50 2.7 s / p95 4.4 s with ~600 sockets: the House greets late under a join wave (L2). (2) 49 drops with close code 4400 and no reload (all reconnected): someone closes sockets under load (L2/L5, check the gateway or server log). (3) Tunnel transport: ping p50 20 ms, p95 144 ms. (4) Join POST through the tunnel: p50 95 ms, p95 317 ms.

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **451/500 (90.2%)** |
| socket opened on first attempt / connected at end | 500 / 500 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **285 / 578 / 772 ms** |
| join POST p50 / p95 / max | 95 / 317 / 500 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 2654 / 4360 / 5494 ms |
| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **- / - / - ms** (p99 - ms, n=0) |
| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | - / - / - ms (n=0) |
| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **20 / 144 / 1598 ms** (n=12823, lost 0) |
| hides sent / answered / refused (House kept another room) / unanswered (no reply) | 0 / 0 / 0 / 0 |
| HIDE phases seen (bot-beats) / sat out caught / last-second switches | 0 / 0 / 0 |
| reveal results | none |
| **disconnects** after open / reconnects | **49** / 49 (close codes: 4400 x49) |
| **errors** | **no {t:you} within 3 s of open x172, stats unavailable x6** |
| frames received | you 8743, phase 500, rooms 500, pong 12823 (161/s avg) |
| driver event-loop lag p95 / max | 1 / 32 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%).


## 10/31/2026, 12:59:59 PDT · 150 bots · http://127.0.0.1:3300

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:3300`
- Path: POST http://127.0.0.1:3300/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots hide once or twice per HIDE phase (40% crowd, 40% spread, 20% random; ~12% switch in the last second), sit out when caught, never lure. Every bot also pings every ~5 s (gateway auto-response).
- Ramp 20 s, play 120 s, wall 140 s. House phase reveal. House before: online 100 (humans 1, bots 99); peak: online 254 (humans 5, bots 249); 1.5 s after close: online 8 (humans 5, bots 3) (the House keeps a dropped ghost online for its reconnect grace).
- **Note (L8):** first run on THE LOOP. Another fill (~100 bots) was also on the House, so peak online was 254 (249 bots). 18 actor hot reloads happened during the run (logs/actors.log), which explains the 7 join 502s and 3 drops (4400, all reconnected). **Finding for L2:** transport is fast (ping -> pong p95 6 ms), but hide -> {t:"you"} p95 is 2.5 s after the ramp (p50 36 ms). The House actor queues messages during HIDE bursts with ~250 ghosts. The onMessage path calls #you (rank) and #arm (alarm.set) on every hide; profile those, plus the 1 s snapshot persist.

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **149/150 (99.3%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **165 / 313 / 433 ms** |
| join POST p50 / p95 / max | 162 / 309 / 432 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 9 / 280 / 396 ms |
| **message latency** (hide -> matching {t:"you"}) p50 / p95 / max | **27 / 962 / 2872 ms** (p99 2697 ms, n=966) |
| hide latency after the ramp (ramp + 10 s to end) p50 / p95 / p99 | 36 / 2477 / 2705 ms (n=742) |
| **transport RTT** (ping -> pong, gateway auto-response) p50 / p95 / max | **0 / 6 / 754 ms** (n=3864, lost 0) |
| hides sent / answered / refused (House kept another room) / unanswered (no reply) | 974 / 966 / 2 / 0 |
| HIDE phases seen (bot-beats) / sat out caught / last-second switches | 810 / 114 / 81 |
| reveal results | caught 151, safe 268, possessed 15 |
| **disconnects** after open / reconnects | **3** / 3 (close codes: 4400 x3) |
| **errors** | **join HTTP 502 x7, stats unavailable x1** |
| frames received | you 36046, phase 2983, rooms 11185, pong 3864, result 434 (389/s avg) |
| driver event-loop lag p95 / max | 2 / 16 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, hide p95 <= 300 ms (ping p95 if no round ran), unexpected disconnects <= 1% of bots, unanswered hides <= 0.1%).


## 10/31/2026, 12:49:23 PDT · 150 bots · http://127.0.0.1:3300

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:3300`
- Path: POST http://127.0.0.1:3300/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots move every 3-8 s, flee 75% of warns (60% after 0.3-1.2 s, 15% in the last 0.3-0.5 s), respect seals and banishment, never whisper.
- Ramp 20 s, play 120 s, wall 140 s. House phase finale. House before: online 2 (humans 2, bots 0); peak: online 149 (humans 2, bots 147); 1.5 s after close: online 2 (humans 2, bots 0) (the House keeps a dropped ghost online for its reconnect grace).
- **Note (L8):** every error and drop is in the first 20 s and lines up with 8 actor hot reloads in logs/actors.log ("Updated local actors.", count 15 -> 23 during the run: actors/src/actors.ts saved into the live integration tree). Each reload closes every House socket (4400) and 502s joins for a few seconds; all 15 dropped bots reconnected. Steady state t=20-140 s, per 5 s window: move p50 2-4 ms, p95 8-67 ms, no new errors. A live hunt ran (1882 warns, 313 daredevil flees, 243 caught).

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **149/150 (99.3%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **114 / 2058 / 2684 ms** |
| join POST p50 / p95 / max | 113 / 1966 / 2108 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 6 / 1804 / 5432 ms |
| **message latency** (move -> matching {t:"you"}) p50 / p95 / max | **3 / 91 / 6080 ms** (p99 601 ms, n=3822) |
| moves sent / answered / refused (answered with another room) / unanswered (no reply) | 3852 / 3822 / 12 / 0 |
| warns heard / fled (late, daredevil) / caught | 1882 / 1403 (313) / 243 |
| **disconnects** after open / reconnects | **15** / 15 (close codes: 4400 x15) |
| **errors** | **join HTTP 502 x47, stats unavailable x2, no {t:you} within 3 s of open x5** |
| frames received | you 41474, phase 314, rooms 36944, say 4114, warn 2079, pop 1034, caught 243 (616/s avg) |
| driver event-loop lag p95 / max | 1 / 8 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, move p95 <= 300 ms, unexpected disconnects <= 1% of bots, unanswered moves <= 0.1%).


## 10/31/2026, 12:45:57 PDT · 150 bots · http://127.0.0.1:3300

- Command: `bun bots/src/main.ts --load 150 --base http://127.0.0.1:3300`
- Path: POST http://127.0.0.1:3300/api/join {ghostId, bot:true} + x-presenter-token, then the websocketUrl it returns (server /ws proxy). Bots move every 3-8 s, flee 75% of warns (60% after 0.3-1.2 s, 15% in the last 0.3-0.5 s), respect seals and banishment, never whisper.
- Ramp 20 s, play 120 s, wall 140 s. House phase finale. House before: online 0 (humans 0, bots 0); peak: online 150 (humans 0, bots 150); 1.5 s after close: online 0 (humans 0, bots 0) (the House keeps a dropped ghost online for its reconnect grace).
- **Note (L8):** the 502s and 44 drops (12:43:48-12:44:00) are two actor hot reloads (logs/actors.log "Updated local actors." -> House revived from snapshot with 93, then 120 ghosts); all 44 bots reconnected. No hunt ran (House in finale), so no warns. Cold path: these 150 Ghost actors were created in this run.

| metric | value |
|---|---|
| **connect success** (first attempt: socket open + first {t:"you"}) | **141/150 (94.0%)** |
| socket opened on first attempt / connected at end | 150 / 150 |
| **connect time** (join POST -> socket open) p50 / p95 / max | **217 / 2422 / 2839 ms** |
| join POST p50 / p95 / max | 210 / 2399 / 2441 ms |
| first state (open -> first {t:"you"}) p50 / p95 / max | 10 / 464 / 3373 ms |
| **message latency** (move -> matching {t:"you"}) p50 / p95 / max | **2 / 58 / 4070 ms** (p99 2101 ms, n=3374) |
| moves sent / answered / refused (answered with another room) / unanswered (no reply) | 3410 / 3374 / 1 / 0 |
| warns heard / fled (late, daredevil) / caught | 0 / 0 (0) / 0 |
| **disconnects** after open / reconnects | **44** / 44 (close codes: 4400 x44) |
| **errors** | **join HTTP 502 x29, stats unavailable x2, no {t:you} within 3 s of open x3** |
| frames received | you 39729, phase 185, rooms 36390 (545/s avg) |
| driver event-loop lag p95 / max | 1 / 7 ms |

Verdict: **RED** against the L8 bar (connect >= 99%, move p95 <= 300 ms, unexpected disconnects <= 1% of bots, unanswered moves <= 0.1%).
