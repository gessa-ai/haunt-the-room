#!/usr/bin/env bash
# HAUNT THE ROOM stack: relay -> actors -> generated client -> coven -> server, each under a restart loop.
#   ./dev.sh [start]   start from the dev tree (refuses if already running; NODE_ENV=production serves web/dist)
#   ./dev.sh release   build web, snapshot actors/ coven/ server/ bots/ contract/ + web/dist into
#                      release/<timestamp>/, stop the running stack, start the frozen copy (production, no reloads,
#                      same ports, same actor state dir). Lanes keep editing the dev tree.
#   ./dev.sh rollback release/<ts>   run an earlier frozen release again
#   ./dev.sh build     production web build (web/dist)
#   ./dev.sh stop      stop exactly the processes this script started (logs/pids)
#   ./dev.sh status    pids, which tree runs, restart counts
#   ./dev.sh relay     put the relay engine under this script's supervisor (takes over logs/relay-supervisor.pid's)
#   ./dev.sh tunnel    cloudflared quick tunnel (fallback; the named tunnel is deploy/tunnel.sh)
# On stage: kill -9 $(cat logs/actors.pid)   (the supervisor restarts the actor server ~0.5 s after it dies)
# Every process gets ulimit -n 65536; each log is capped (over 5 MB it rolls to <name>.log.1, so <= 10 MB each).
# Port overrides for lane testing: ACTORS_PORT, SERVER_PORT, LOG_DIR, RELAY_BASE_URL. Reads .env if present.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
ACTORS_PORT="${ACTORS_PORT:-7300}"
SERVER_PORT="${SERVER_PORT:-3300}"
RELAY_URL="${RELAY_BASE_URL:-http://localhost:8787}"
LOGS="${LOG_DIR:-$ROOT/logs}"
APP="${APP_DIR:-$ROOT}" # the tree that runs: the dev tree, or release/<timestamp>
PIDS="$LOGS/pids"
CONTROL_PLANE="http://127.0.0.1:$ACTORS_PORT"
LOG_CAP_BYTES=$((5 * 1024 * 1024))
mkdir -p "$LOGS"
export LOG_DIR="$LOGS"
ulimit -n 65536 || echo "dev.sh: WARNING could not raise the open-file limit (now $(ulimit -n))" >&2

STARTING=0
die() {
  echo "dev.sh: $*" >&2
  if ((STARTING)); then echo "dev.sh: start failed, stopping what it started" >&2; stop >&2; fi
  exit 1
}
alive() { kill -0 "$1" 2>/dev/null; }
pid_of() { [[ -f "$PIDS" ]] || return 0; awk -v n="$1" '$1 == n { p = $2 } END { print p }' "$PIDS"; }

# cap_log <file>: append stdin to <file>; past LOG_CAP_BYTES the file rolls to <file>.1 (replacing the old one).
cap_log() {
  local file="$1" size
  size="$(stat -f %z "$file" 2>/dev/null || echo 0)"
  awk -v f="$file" -v max="$LOG_CAP_BYTES" -v n="$size" '{
    print >> f; fflush(f); n += length($0) + 1
    if (n > max) { close(f); system("mv -f \"" f "\" \"" f ".1\""); n = 0 }
  }'
}

# launch <name> <dir> <command...>: own process group, nohup, capped log logs/<name>.log, record "<name> <pid>".
launch() {
  local name="$1" dir="$2"; shift 2
  set -m
  (cd "$dir" && nohup "$@" 2>&1 </dev/null | cap_log "$LOGS/$name.log") &
  set +m
  echo "$name $!" >>"$PIDS"
  echo "  $name pid $! -> $LOGS/$name.log"
}

# wait_until <name> <seconds> <command...>: until the command succeeds; the service dying or the deadline fails.
wait_until() {
  local name="$1" limit="$2" pid; shift 2
  local deadline=$((SECONDS + limit))
  pid="$(pid_of "$name")"
  until "$@" >/dev/null 2>&1; do
    alive "$pid" || { tail -n 30 "$LOGS/$name.log" >&2; die "$name exited during startup (log above)"; }
    ((SECONDS < deadline)) || { tail -n 30 "$LOGS/$name.log" >&2; die "$name not ready after $limit s"; }
    sleep 0.5
  done
}

# ---------- restart loops (each runs as `dev.sh _supervise-<name>` inside its own process group) ----------

# Actors: logs/actors.pid always holds the live native control plane (the child of the durable-actors CLI).
# Warn-level logging (the default INFO line per request was ~2 MB/min). A release tree never reloads.
supervise_actors() {
  cd "$APP/actors"
  local watch=(); [[ "$APP" != "$ROOT" ]] && watch=(--no-watch)
  while true; do
    RUST_LOG=warn bun node_modules/durable-actors/bin/durable-actors.js dev --port "$ACTORS_PORT" "${watch[@]}" & # no bunx lookup on restart
    local cli=$! native=""
    for _ in $(seq 1 200); do native="$(pgrep -P "$cli" | head -n 1 || true)"; [[ -n "$native" ]] && break; sleep 0.05; done
    echo "${native:-$cli}" >"$LOGS/actors.pid"
    echo "[supervisor] $(date +%T) actors up: cli $cli, control plane ${native:-?} (logs/actors.pid)"
    wait "$cli" || true
    echo "[supervisor] $(date +%T) actors died; restarting in 0.5 s"
    sleep 0.5
  done
}

# The relay engine (it once died on SQLITE_CANTOPEN and stayed down).
supervise_relay() {
  cd "$ROOT/relay-spike"
  while true; do
    node node_modules/.bin/relaycast-engine --port "${RELAY_URL##*:}" --db "$ROOT/relay-spike/relaycast.db" &
    local engine=$! code=0
    echo "[supervisor] $(date +%T) relay up: pid $engine"
    wait "$engine" || code=$?
    echo "[supervisor] $(date +%T) relay died (exit $code); restarting in 0.5 s"
    sleep 0.5
  done
}

# The coven (hunters). logs/coven.pid holds the live coven; start refuses a second coven while it is alive.
supervise_coven() {
  cd "$APP"
  while true; do
    bun coven/src/main.ts &
    local coven=$! code=0
    echo "$coven" >"$LOGS/coven.pid"
    echo "[supervisor] $(date +%T) coven up: pid $coven (logs/coven.pid)"
    wait "$coven" || code=$?
    echo "[supervisor] $(date +%T) coven died (exit $code); restarting in 0.5 s"
    sleep 0.5
  done
}

# The server (API, /ws door, web, bots child). It restores the presenter's bots from logs/bots.json at boot.
supervise_server() {
  cd "$APP/server"
  while true; do
    PORT="$SERVER_PORT" bun src/main.ts &
    local server=$! code=0
    echo "[supervisor] $(date +%T) server up: pid $server"
    wait "$server" || code=$?
    echo "[supervisor] $(date +%T) server died (exit $code); restarting in 0.5 s"
    sleep 0.5
  done
}

relay_up() { curl -s -o /dev/null --max-time 2 "$RELAY_URL/"; }

# Ensure the relay runs under OUR supervisor. Takes over the conductor's stopgap loop (logs/relay-supervisor.pid):
# stop that loop, then its engine, then start ours (the relay is down for about a second).
start_relay() {
  local mine; mine="$(pid_of relay)"
  if [[ -n "$mine" ]] && alive "$mine"; then echo "  relay already supervised by dev.sh (pid $mine)"; return 0; fi
  local stopgap="$LOGS/relay-supervisor.pid"
  if [[ -f "$stopgap" ]] && alive "$(cat "$stopgap")"; then
    local loop engine; loop="$(cat "$stopgap")"; engine="$(pgrep -P "$loop" || true)"
    echo "  taking over the relay from supervisor $loop (engine ${engine:-none})"
    kill -TERM "$loop" 2>/dev/null || true
    if [[ -n "$engine" ]]; then kill -TERM $engine 2>/dev/null || true; fi
    for _ in $(seq 1 40); do relay_up || break; sleep 0.25; done
    if relay_up; then die "the old relay still answers on $RELAY_URL after its supervisor was stopped"; fi
    mv -f "$stopgap" "$stopgap.replaced"
  elif relay_up; then
    echo "  WARNING: a relay not started by dev.sh answers on $RELAY_URL; leaving it (it is NOT supervised)" >&2
    return 0
  fi
  launch relay "$ROOT/relay-spike" "$ROOT/dev.sh" _supervise-relay
  wait_until relay 30 relay_up
}

running() {
  [[ -f "$PIDS" ]] || return 1
  while read -r _ pid; do alive "$pid" && return 0; done <"$PIDS"
  return 1
}

start() {
  running && { status; die "already running: ./dev.sh stop first"; }
  rm -f "$PIDS" "$LOGS/actors.pid"
  [[ -f "$APP/actors/src/actors.ts" ]] || die "$APP/actors/src/actors.ts missing (lane L2)"
  if [[ -f "$LOGS/coven.pid" ]] && alive "$(cat "$LOGS/coven.pid")"; then die "a coven already runs (pid $(cat "$LOGS/coven.pid")); stop it first"; fi
  STARTING=1
  echo "$APP" >"$LOGS/app-dir"
  echo "starting HAUNT THE ROOM from $APP (relay $RELAY_URL, actors :$ACTORS_PORT, server :$SERVER_PORT, ${NODE_ENV:-development})"

  start_relay

  [[ -f "$LOGS/actors.log" ]] && mv -f "$LOGS/actors.log" "$LOGS/actors.log.1" # so "Ready" below is from this start
  launch actors "$ROOT" env APP_DIR="$APP" "$ROOT/dev.sh" _supervise-actors
  wait_until actors 120 grep -q Ready "$LOGS/actors.log"

  local part
  for part in server coven; do # both import <part>/generated (git-ignored, so a release tree has none)
    echo "  generating the actor client into $APP/$part/generated"
    (cd "$APP/$part" && DURABLE_ACTORS_CONTROL_PLANE_URL="$CONTROL_PLANE" bunx durable-actors generate "$APP/actors/src/actors.ts") \
      >"$LOGS/generate.log" 2>&1 || { tail -n 30 "$LOGS/generate.log" >&2; die "actor client generation for $part failed"; }
  done

  export DURABLE_ACTORS_CONTROL_PLANE_URL="$CONTROL_PLANE"
  launch coven "$APP" env APP_DIR="$APP" "$ROOT/dev.sh" _supervise-coven
  launch server "$APP/server" env APP_DIR="$APP" "$ROOT/dev.sh" _supervise-server
  wait_until server 60 curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$SERVER_PORT/api/health"

  STARTING=0
  echo "up: http://localhost:$SERVER_PORT/stage  (crash demo: kill -9 \$(cat $LOGS/actors.pid))"
}

build() {
  echo "building web/dist"
  (cd "$ROOT/web" && bun run build) >"$LOGS/build.log" 2>&1 || { tail -n 30 "$LOGS/build.log" >&2; die "web build failed (log above)"; }
  [[ -f "$ROOT/web/dist/index.html" ]] || die "web build wrote no web/dist/index.html"
  echo "  web/dist ready ($(du -sh "$ROOT/web/dist" | cut -f1))"
}

# clone_tree <from> <to>: APFS clones (no extra disk) of every entry except runtime state and generated code.
clone_tree() {
  local from="$1" to="$2" entry base
  mkdir -p "$to"
  for entry in "$from"/* "$from"/.[!.]*; do
    [[ -e "$entry" ]] || continue
    base="$(basename "$entry")"
    case "$base" in .durable-actors | generated | logs | dist | .git) continue ;; esac
    cp -cR "$entry" "$to/$base"
  done
}

release() {
  echo "  typechecking web and server (a red one refuses the cut; the live stack is untouched)"
  (cd "$ROOT/web" && bun run typecheck) >"$LOGS/release-check.log" 2>&1 || { tail -n 15 "$LOGS/release-check.log" >&2; die "release refused: web does not typecheck"; }
  (cd "$ROOT/server" && bunx tsc --noEmit -p .) >"$LOGS/release-check.log" 2>&1 || { tail -n 15 "$LOGS/release-check.log" >&2; die "release refused: server does not typecheck"; }
  build
  local stamp dir part
  stamp="$(date +%Y%m%d-%H%M%S)"
  dir="$ROOT/release/$stamp"
  echo "snapshotting into $dir"
  for part in actors coven server bots contract audio; do clone_tree "$ROOT/$part" "$dir/$part"; done
  mkdir -p "$dir/web" && cp -cR "$ROOT/web/dist" "$dir/web/dist"
  ln -s "$ROOT/.env" "$dir/.env" # the coven watches <tree>/.env for OPENAI_API_KEY
  ln -s "$LOGS" "$dir/logs" # lanes write <tree>/logs/... (e.g. house-executor-7300.pid): keep one logs/ in every mode
  # Same actor state as the dev tree's stack, so the House and every Ghost survive the switch.
  mkdir -p "$ROOT/actors/.durable-actors"
  ln -s "$ROOT/actors/.durable-actors" "$dir/actors/.durable-actors"
  # Preflight on the frozen copy BEFORE touching the live stack: a tree whose actors do not compile never ships.
  echo "  typechecking the snapshot's actors against its contract"
  (cd "$dir/actors" && bunx tsc --noEmit -p .) >"$LOGS/release-check.log" 2>&1 || true
  if grep -E '^src/.*error TS' "$LOGS/release-check.log" >&2; then # only src/ ships (the actor compiler checks it)
    die "release $stamp refused: actors/src does not compile (live stack untouched)"
  fi
  local previous="$ROOT"
  [[ -f "$LOGS/app-dir" ]] && previous="$(cat "$LOGS/app-dir")"
  if running; then echo "stopping the running stack ($previous)"; stop; fi
  export NODE_ENV=production
  if (APP="$dir" && start); then
    ln -sfn "$dir" "$ROOT/release/current"
    echo "release $stamp is live (tree: $dir)"
  else
    echo "dev.sh: release $stamp failed to start; bringing back $previous" >&2
    [[ "$previous" == "$ROOT" ]] && unset NODE_ENV
    APP="$previous"
    start
    die "release $stamp NOT live; $previous is running again"
  fi
}

# rollback <release dir>: run an existing frozen tree again (same ports, same state).
rollback() {
  local dir="${1:-}"
  [[ -n "$dir" && -f "$dir/actors/src/actors.ts" ]] || die "usage: ./dev.sh rollback release/<timestamp>"
  dir="$(cd "$dir" && pwd)"
  if running; then echo "stopping the running stack"; stop; fi
  export NODE_ENV=production
  APP="$dir"
  start
  ln -sfn "$dir" "$ROOT/release/current"
  echo "rolled back: $dir is live"
}

stop() {
  [[ -f "$PIDS" ]] || { echo "nothing to stop ($PIDS missing)"; return 0; }
  local name pid left quick=0
  [[ -n "$(pid_of tunnel)" ]] && quick=1
  while read -r name pid; do
    alive "$pid" && { kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; echo "  stopping $name ($pid)"; }
  done <"$PIDS"
  for _ in $(seq 1 20); do
    left=0
    while read -r _ pid; do alive "$pid" && left=1; done <"$PIDS"
    ((left)) || break
    sleep 0.25
  done
  while read -r name pid; do
    alive "$pid" && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; echo "  killed $name ($pid)"; }
  done <"$PIDS"
  rm -f "$PIDS" "$LOGS/actors.pid" "$LOGS/coven.pid" "$LOGS/app-dir"
  ((quick)) && rm -f "$LOGS/public-url" # only the quick tunnel's URL; the named tunnel (deploy/tunnel.sh) owns its own
  echo "stopped"
}

status() {
  [[ -f "$PIDS" ]] || { echo "not running"; return 0; }
  [[ -f "$LOGS/app-dir" ]] && echo "  tree: $(cat "$LOGS/app-dir")"
  while read -r name pid; do
    if alive "$pid"; then echo "  $name $pid up"; else echo "  $name $pid DOWN (see $LOGS/$name.log)"; fi
  done <"$PIDS"
  [[ -f "$LOGS/actors.pid" ]] && echo "  actor control plane (kill -9 target): $(cat "$LOGS/actors.pid")"
  local name count last
  for name in relay actors coven server; do
    [[ -f "$LOGS/$name.log" ]] || continue
    count="$(cat "$LOGS/$name.log.1" "$LOGS/$name.log" 2>/dev/null | grep -cE "\[supervisor\].* $name died|$name exited with" || true)"
    last="$(cat "$LOGS/$name.log.1" "$LOGS/$name.log" 2>/dev/null | grep -E "\[supervisor\].* $name died|$name exited with" | tail -n 1 || true)"
    echo "  $name restarts: $count${last:+ (last: $last)}"
  done
  [[ -f "$LOGS/public-url" ]] && echo "  public: $(cat "$LOGS/public-url")"
  return 0
}

tunnel() {
  command -v cloudflared >/dev/null || die "cloudflared not installed (brew install cloudflared)"
  if [[ -f "$LOGS/tunnel.pid" ]] && alive "$(cat "$LOGS/tunnel.pid")"; then
    die "the named tunnel (deploy/tunnel.sh, pid $(cat "$LOGS/tunnel.pid")) is live: not starting a quick tunnel over its logs/public-url"
  fi
  local old; old="$(pid_of tunnel)"
  if [[ -n "$old" ]] && alive "$old" && [[ -f "$LOGS/public-url" ]]; then cat "$LOGS/public-url"; return 0; fi
  : >"$LOGS/tunnel.log"
  launch tunnel "$ROOT" cloudflared tunnel --no-autoupdate --url "http://localhost:$SERVER_PORT"
  local deadline=$((SECONDS + 60)) url=""
  until [[ -n "$url" ]]; do
    url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -n 1 || true)"
    ((SECONDS < deadline)) || { tail -n 20 "$LOGS/tunnel.log" >&2; die "no tunnel URL after 60 s"; }
    [[ -n "$url" ]] || sleep 0.5
  done
  echo "$url" >"$LOGS/public-url"
  echo "$url"
}

case "${1:-start}" in
  start) start ;;
  release) release ;;
  rollback) rollback "${2:-}" ;;
  build) build ;;
  stop) stop ;;
  status) status ;;
  tunnel) tunnel ;;
  relay) start_relay ;;
  _supervise-actors) supervise_actors ;;
  _supervise-relay) supervise_relay ;;
  _supervise-coven) supervise_coven ;;
  _supervise-server) supervise_server ;;
  *) die "usage: ./dev.sh [start|release|build|stop|status|relay|tunnel]" ;;
esac
