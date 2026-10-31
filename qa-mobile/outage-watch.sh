#!/bin/bash
# L17: when the House stops answering, screenshot sim A every 1 s until it is back + 8 s. Logs to qa-mobile/outages.log
cd "$(dirname "$0")"; end=$(( $(date +%s) + ${1:-1500} ))
while [ $(date +%s) -lt $end ]; do
  if ! curl -s -m 1.5 localhost:3300/api/health | grep -q '"actors":"ok"'; then
    t0=$(date +%s); echo "$(date +%T) DOWN" >> outages.log; n=0; back=0
    while [ $n -lt 60 ]; do
      ./shot.sh A out-$t0-$n 300 >/dev/null; n=$((n+1))
      if curl -s -m 1 localhost:3300/api/health | grep -q '"actors":"ok"'; then [ $back -eq 0 ] && echo "$(date +%T) UP after $(( $(date +%s) - t0 )) s" >> outages.log; back=$((back+1)); [ $back -ge 8 ] && break; fi
      sleep 0.6
    done
  fi
  sleep 0.5
done
