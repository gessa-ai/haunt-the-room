#!/bin/bash
# Usage: bin/slot.sh <command...>  Runs the command holding one of 3 browser slots on this Mac (waits for a free one).
# The live game runs on this Mac: headless browsers starve it. Every screenshot/QA browser run goes through here.
for i in $(seq 1 600); do
  for s in 1 2 3; do
    d=/tmp/haunt-browser-slot-$s
    if mkdir "$d" 2>/dev/null; then
      echo $$ > "$d/pid"; trap '/bin/rm -rf "$d"' EXIT
      "$@"; exit $?
    elif [ -f "$d/pid" ] && ! kill -0 "$(cat "$d/pid")" 2>/dev/null; then /bin/rm -rf "$d"; fi
  done
  sleep 1
done
echo "slot.sh: no browser slot free after 10 min" >&2; exit 75
