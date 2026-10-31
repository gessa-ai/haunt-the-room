# HAUNT THE ROOM: deploy runbook (lane L12)

Public origin for the phones: **https://haunt.gessa.ai** (the stage QR points at `<publicUrl>/p`).

```
phones (venue wifi or cellular) --https/wss--> Cloudflare edge (SJC) --named tunnel "haunt-the-room"-->
  cloudflared on the Mac (4 QUIC connections) --> http://localhost:3300 server (Bun) --/ws proxy--> actors :7300
projector = browser on the Mac at http://localhost:3300/stage (never through the tunnel)
bots      = localhost:3300 only (presenter guard refuses anything that came through the tunnel)
```

Pieces and where they live:

| Piece | Start | PID / log | Restarts itself? |
|---|---|---|---|
| relay :8787, actors :7300, coven, server :3300 | `./dev.sh` | `logs/pids`, `logs/<name>.log` | actors only (supervisor, 0.5 s) |
| named tunnel | `deploy/tunnel.sh start` | `logs/tunnel.pid`, `logs/tunnel.log` | yes (supervisor loop, 1 s) |
| QR target | written by `deploy/tunnel.sh start` | `logs/public-url` (read per request by GET /api/config) | n/a |

Tunnel facts: id `28298137-774d-466d-ae2c-554326a7a302`, config `deploy/cloudflared.yml`, credentials
`~/.cloudflared/<id>.json` (secret, never copy into the repo), DNS = one proxied CNAME `haunt.gessa.ai` (added
2026-10-31 12:42 with the owner's approval). Edge status: `curl -s 127.0.0.1:20241/ready`.

## 1. Start (T-30 min)

```bash
cd ~/haunted-hacks
ulimit -n 65536                 # REQUIRED in Terminal.app: its default is 256 fds and Bun does not raise it
                                # (measured: EMFILE at 252 fds, i.e. ~120 phones). Claude Code shells are already high.
./dev.sh                        # relay, actors (supervised), coven, server; ends with "up: http://localhost:3300/stage"
deploy/tunnel.sh start          # idempotent; prints https://haunt.gessa.ai and writes logs/public-url
```

`./dev.sh stop` deletes `logs/public-url` but leaves the tunnel running: after any stack restart run
`deploy/tunnel.sh start` again (or keep `PUBLIC_URL=https://haunt.gessa.ai` in `.env`, which survives).

Projector: open `http://localhost:3300/stage?token=<PRESENTER_TOKEN>` once (the token is kept in localStorage),
then load `http://localhost:3300/stage` without it so the token never shows in the address bar, then full screen
(Ctrl+Cmd+F). The stage reads `/api/config` once at load: **reload the stage after switching tunnels.**

## 2. Health checks (all must pass before doors open)

| Check | Command | Expected |
|---|---|---|
| stack | `./dev.sh status` | relay/actors/coven/server `up`, actor control plane pid shown |
| tunnel | `deploy/tunnel.sh status` | supervisor up, `readyConnections` 4, public /api/health HTTP 200 |
| public health | `curl -s https://haunt.gessa.ai/api/health` | `{"ok":true,"actors":"ok","relay":"ok",...}` |
| QR target | `curl -s https://haunt.gessa.ai/api/config` | `{"publicUrl":"https://haunt.gessa.ai"}` |
| phone path end to end | `bun deploy/probe.ts` | `PASS`: /p 200, join 200, `wss://haunt.gessa.ai/ws`, frames you,phase,rooms, ping->pong |
| real phone, off the venue wifi | phone on cellular, open `https://haunt.gessa.ai/p` | "You are <Name> #nnn" in its colour |

`deploy/probe.ts` uses one fixed ghost (`l12-probe`), so reruns never add ghosts to the house. Baseline
(12:46, venue wifi): health warm ~40 ms, join ~130 ms, socket open ~160 ms, ping->pong median ~17 ms.
Capacity (12:51, from this Mac, one IP like the venue NAT): 320 websockets through haunt.gessa.ai opened and
held, 0 failed, RTT median 17 ms, /api/health still 200 in under 150 ms; no Cloudflare rate limit or challenge.

## 3. The on-stage kill

```bash
kill -9 $(cat ~/haunted-hacks/logs/actors.pid)
```

What the room sees and the numbers to expect (L5 measured 12:39):
- Every phone socket closes (1006) within ~1 ms; phones say "The house died. You didn't."; projector shows static.
- The supervisor restarts the actor server 0.5 s later; phones re-join with backoff (`/api/join` answers 502 while
  it boots), first join 200 at ~3.7 s, every ghost back in the SAME room at ~3.8 s; the round clock is absolute
  (`endsAt`), so it is still on time; the stage plays the revive beat (`restoredAt`).
- Only the actor server dies. The server and the tunnel stay up, so the public URL never goes away.

If ghosts are not back within 10 s: `./dev.sh status` (supervisor alive?), `tail -n 30 logs/actors.log`,
`cat logs/actors.pid` (a fresh pid means it restarted). Last resort: section 5, whole stack.

## 4. Presenter token

- Value: `PRESENTER_TOKEN` in `~/haunted-hacks/.env`. Never print it, never show it on the projector.
- Accepted only from the Mac itself: loopback socket, no `CF-Connecting-IP` header, `x-presenter-token` header.
  Through the tunnel the same request is 403 by design.
- Projector keys (stage page): L lobby, H hunt, F finale, R reset, A auto, S show, B bots on/off, Q QR size.
- From a terminal (load the token without echoing it):

```bash
set -a; source ~/haunted-hacks/.env; set +a
curl -s -XPOST -H "x-presenter-token: $PRESENTER_TOKEN" localhost:3300/api/presenter/hunt      # lobby|hunt|finale|reset|auto|show
curl -s -XPOST -H "x-presenter-token: $PRESENTER_TOKEN" "localhost:3300/api/presenter/bots-on?n=120"
curl -s -XPOST -H "x-presenter-token: $PRESENTER_TOKEN" localhost:3300/api/presenter/bots-off
```

## 5. Restart each piece

| Piece | Command | Phones see |
|---|---|---|
| actor server | `kill -9 $(cat logs/actors.pid)` (supervisor restarts it) | the kill beat, back in ~4 s |
| whole stack | `./dev.sh stop && ./dev.sh && deploy/tunnel.sh start` | 502 for the restart, then auto re-join |
| tunnel | `deploy/tunnel.sh stop && deploy/tunnel.sh start` (~5 s: 2 s drain, then reconnect) | sockets drop, auto re-join |
| cloudflared crash | nothing: the supervisor loop restarts it in 1 s (`grep supervisor logs/tunnel.log`) | same |
| stage | Cmd+R on the projector browser | nothing |

`./dev.sh stop` stops only what `./dev.sh` started; the tunnel is separate on purpose (the public URL stays up
while the stack restarts).

## 6. Fallbacks, in order

1. **Venue wifi down or flaky (Mac side):** join the phone hotspot on the Mac. cloudflared reconnects by itself
   within seconds and the URL does not change, so the QR on screen stays valid. Phones keep working on venue wifi
   or cellular because they reach the public URL, not the Mac. The Mac's uplink then carries every phone.
   Measured 12:58: a phone page load is 19 requests / 335 kB (dev mode: modules are `no-cache`, so every phone
   pulls them from the Mac; art is edge-cached), in play ~340 B/s per phone (lobby; allow 3x in the hunt). For
   300 phones: ~100 MB at join (8 s of the venue wifi's 107 Mbit/s uplink; far longer on a hotspot), ~1-3 Mbit/s
   in play.
2. **Tunnel cannot reach Cloudflare** (`deploy/tunnel.sh start` says "no edge connection"): the network blocks
   port 7844. cloudflared already falls back from QUIC (UDP) to HTTP/2 (TCP) on its own; if both are blocked, use
   the hotspot.
3. **Named tunnel or haunt.gessa.ai DNS broken:** quick tunnel, random hostname:
   `deploy/tunnel.sh stop; ./dev.sh tunnel` prints `https://<x>.trycloudflare.com` and writes `logs/public-url`,
   so `/api/config` follows; **reload the stage** for the new QR. Limit (measured 12:49): a quick tunnel holds
   200 open websockets; the 201st fails and while 200 are open EVERY request gets 429, so new phones cannot even
   load /p. Plan for under 200 phones on this path. A fresh hostname can take ~80 s to resolve: start it early.
   Never run both tunnels at once.
4. **Nothing works:** the recorded backup video (lane L11).

## 7. Pre-demo checklist (T-10 min)

- [ ] `caffeinate` alive: `kill -0 $(cat ~/haunted-hacks/logs/caffeinate.pid) && echo ok` (started 12:23 with `-dimsu -t 23400`, runs to ~18:50).
- [ ] Power: MagSafe in, battery above 80%, Low Power Mode OFF (System Settings > Battery).
- [ ] Do Not Disturb ON (Control Center > Focus); quit Messages, Mail and Slack so nothing pops over the stage.
- [ ] Display: System Settings > Displays > projector "Mirror for Built-in Display" (the kill beat shows a terminal
      the room must see); browser zoom 100%; stage full screen.
- [ ] Terminal for the kill: a clean window, large font, `kill -9 $(cat ~/haunted-hacks/logs/actors.pid)` pre-typed,
      no scrollback that shows `.env` or the token.
- [ ] Audio: System Settings > Sound > Output = the venue HDMI/PA; play a stage cue to test level; alert sounds
      off (Sound > Sound Effects > alert volume 0).
- [ ] Network: Mac on venue wifi (Ethernet if offered); the phone hotspot on and tested once with `bun deploy/probe.ts`.
- [ ] All section 2 checks pass, including one real phone on cellular.
- [ ] `PUBLIC_URL=https://haunt.gessa.ai` in `.env` (QR survives a stack restart).

## 8. After the event (owner)

Remove the DNS record: Cloudflare dashboard > gessa.ai > DNS > delete the `haunt` CNAME. Then
`deploy/tunnel.sh stop; cloudflared tunnel cleanup haunt-the-room; cloudflared tunnel delete haunt-the-room`
(this also invalidates the credentials file in `~/.cloudflared`).

## Release mode (lane L5): the public stack runs a FROZEN copy

Why: in the dev tree every save reloads something (actors dev hot-reloads the House and drops every socket;
Vite dev middleware full-reloads every phone; a broken save makes actors/ fail to compile and the House stays dead).

- Cut a release: `./dev.sh release` from ~/haunted-hacks. It
  1. builds web (`web/dist`, log `logs/build.log`),
  2. APFS-clones actors/ coven/ server/ bots/ contract/ (no extra disk) + web/dist into `release/<timestamp>/`
     (skips .durable-actors, generated/, logs/, dist/),
  3. links `release/<ts>/actors/.durable-actors` -> `actors/.durable-actors` (same state: House and Ghosts survive),
  4. stops the running stack, starts the frozen tree on the same ports with NODE_ENV=production and actors
     `--no-watch`, regenerating server/ and coven/ clients against it,
  5. on success points `release/current` at it; on failure restarts the tree that was running before and says so.
- Which tree runs: `./dev.sh status` (first line `tree:`), also `logs/app-dir`. Restart counts for relay, actors and
  coven are listed there too.
- New release = run it again (~1 min, sockets drop once and phones rejoin). Lanes keep editing the dev tree; nothing
  they save reaches the public stack until the next cut.
- Back to the dev tree: `./dev.sh stop && ./dev.sh` (Vite dev middleware; keep it off the public URL).
- Production web without a release: `./dev.sh build && NODE_ENV=production ./dev.sh` (still hot-reloads actors).
- Logs: each capped at 5 MB, then rolled to `<name>.log.1` (<= 10 MB per log); actors run with RUST_LOG=warn.
- Crash demo works the same: `kill -9 $(cat logs/actors.pid)`.
