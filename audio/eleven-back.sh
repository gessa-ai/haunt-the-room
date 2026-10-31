#!/bin/bash
# L10b: probe ElevenLabs every 30 s (max 10 min); on success: tell L11b, render priority, then the full bank.
cd ~/haunted-hacks
log() { echo "$(date +%H:%M:%S) $*" | tee -a logs/l10b-eleven.log; }
for i in $(seq 1 20); do
  if bun -e 'import {cabalSpeak} from "./audio/cabal-cast"; const r = await cabalSpeak("skeptic", "ok."); await r.arrayBuffer()' >/dev/null 2>>logs/l10b-eleven.log; then
    log "ELEVEN BACK (probe $i)"
    printf '\n## ELEVEN BACK %s (L10b probe): ElevenLabs answers again; your VO goes first. L10b bank render is starting now (priority 50 then the rest).\n' "$(date +%H:%M)" >> lanes/L11b.md
    bun audio/render-voices.ts elevenlabs --priority >> logs/l10b-eleven.log 2>&1 && log "PRIORITY DONE" || log "PRIORITY FAILED"
    bun audio/render-voices.ts elevenlabs >> logs/l10b-eleven.log 2>&1 && log "FULL DONE" || log "FULL FAILED"
    exit 0
  fi
  log "probe $i: still refused"
  sleep 30
done
log "gave up after 10 min"
