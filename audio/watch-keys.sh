#!/bin/bash
# L10: watch ~/haunted-hacks/.env until 15:00 (owner 13:50: ElevenLabs, sample first, never burn credits unasked).
#  - ELEVENLABS_API_KEY appears: render ONLY the sample (2 lines per hunter + 4 announcer), write
#    "VOICES SAMPLE READY" to lanes/L10.md and stop. The full render waits for an explicit go.
#  - From 14:30, if there is still no ElevenLabs key (or its sample failed) and OPENAI_API_KEY exists:
#    render everything with OpenAI as the fallback.
# Keys are never printed. Run detached: nohup bash audio/watch-keys.sh >> logs/l10-voices.log 2>&1 &
cd "$(dirname "$0")/.." || exit 1
URL="http://127.0.0.1:5370/src/audio/dev.html"
has() { grep -qE "^[[:blank:]]*(export[[:blank:]]+)?$1[[:blank:]]*=[[:blank:]]*[\"']?[^\"'[:space:]#]" .env 2>/dev/null; }
say_status() { echo "- $(date +%H:%M) $1" >> lanes/L10.md; echo "$(date +%H:%M:%S) $1"; }
echo "$(date +%H:%M:%S) watching .env until 15:00: ElevenLabs sample on sight; OpenAI full render from 14:30 (pid $$)"
eleven_failed=0
while [ "$(date +%H%M)" -lt 1500 ]; do
  if [ $eleven_failed = 0 ] && has ELEVENLABS_API_KEY; then
    if bun audio/render-voices.ts elevenlabs --sample; then
      say_status "VOICES SAMPLE READY (ElevenLabs; 8 hunter + 4 announcer lines, tagged 'elevenlabs'): $URL (reload). Full render waits for the owner's go: bun audio/render-voices.ts elevenlabs"
      exit 0
    fi
    eleven_failed=1
    say_status "VOICES: ElevenLabs sample failed (logs/l10-voices.log); OpenAI fallback from 14:30 if its key exists"
  fi
  if [ "$(date +%H%M)" -ge 1430 ] && has OPENAI_API_KEY; then
    if bun audio/render-voices.ts openai; then say_status "VOICES READY (OpenAI fallback, all 173 lines): $URL (reload)"; exit 0; fi
    say_status "VOICES: OpenAI render failed (logs/l10-voices.log); the say placeholders stay"
    exit 1
  fi
  sleep 20
done
echo "$(date +%H:%M:%S) 15:00: no render; the say placeholders stay"
