#!/usr/bin/env bash
# HAUNT THE ROOM public origin (lane L12): named Cloudflare tunnel "haunt-the-room" -> http://localhost:3300.
#   deploy/tunnel.sh start    start detached (idempotent); writes logs/public-url so /api/config and the QR use it
#   deploy/tunnel.sh stop     stop exactly what start started (the logs/tunnel.pid process group)
#   deploy/tunnel.sh status   pid, edge connections, public URL, /api/health through the public origin
# A supervisor loop restarts cloudflared 1 s after it exits. Log: logs/tunnel.log. Config: deploy/cloudflared.yml.
# Fallback with no DNS (quick tunnel, random hostname): ./dev.sh tunnel (lane L5). Never run both at once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/deploy/cloudflared.yml"
LOGS="$ROOT/logs"
PIDFILE="$LOGS/tunnel.pid"
HOST="$(awk '/hostname:/ { print $3; exit }' "$CONFIG")"
METRICS="$(awk '/^metrics:/ { print $2; exit }' "$CONFIG")"
URL="https://$HOST"
mkdir -p "$LOGS"

die() { echo "tunnel.sh: $*" >&2; exit 1; }
running() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
ready() { curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://$METRICS/ready" | grep -q 200; }

supervise() {
  while true; do
    cloudflared tunnel --no-autoupdate --config "$CONFIG" run || true
    echo "[tunnel-supervisor] $(date +%T) cloudflared exited; restarting in 1 s"
    sleep 1
  done
}

start() {
  command -v cloudflared >/dev/null || die "cloudflared not installed (brew install cloudflared)"
  if running; then
    echo "already running (pid $(cat "$PIDFILE"))"
  else
    set -m
    nohup "$ROOT/deploy/tunnel.sh" _supervise >>"$LOGS/tunnel.log" 2>&1 &
    set +m
    echo $! >"$PIDFILE"
    local deadline=$((SECONDS + 45))
    until ready; do
      running || { tail -n 20 "$LOGS/tunnel.log" >&2; die "supervisor died during startup (log above)"; }
      ((SECONDS < deadline)) || { tail -n 20 "$LOGS/tunnel.log" >&2; die "no edge connection after 45 s (venue blocks port 7844? use the hotspot)"; }
      sleep 0.5
    done
    echo "edge connected (pid $(cat "$PIDFILE"), log $LOGS/tunnel.log)"
  fi
  echo "$URL" >"$LOGS/public-url"
  echo "$URL"
}

stop() {
  running || { rm -f "$PIDFILE"; echo "not running"; return 0; }
  local pid; pid="$(cat "$PIDFILE")"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  # Wait for the whole group (supervisor and cloudflared, which drains for grace-period), then force it.
  for _ in $(seq 1 40); do pgrep -g "$pid" >/dev/null || break; sleep 0.25; done
  pgrep -g "$pid" >/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || true; }
  rm -f "$PIDFILE"
  # Only withdraw the QR target if it is ours (a quick tunnel URL written by dev.sh stays).
  [[ "$(cat "$LOGS/public-url" 2>/dev/null)" == "$URL" ]] && rm -f "$LOGS/public-url"
  echo "stopped"
}

status() {
  if running; then echo "supervisor pid $(cat "$PIDFILE") up"; else echo "NOT running"; fi
  echo "edge: $(curl -s --max-time 2 "http://$METRICS/ready" || echo 'metrics unreachable')"
  echo "logs/public-url: $(cat "$LOGS/public-url" 2>/dev/null || echo '(missing: run deploy/tunnel.sh start)')"
  curl -s -o /dev/null --max-time 5 -w "public $URL/api/health: HTTP %{http_code} in %{time_total}s\n" "$URL/api/health" || echo "public $URL/api/health: unreachable"
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  _supervise) supervise ;;
  *) die "usage: deploy/tunnel.sh start|stop|status" ;;
esac
