#!/usr/bin/env bash
# L11: record the projector screen for the video (ffmpeg avfoundation, hardware H.264, fragmented mp4 so a killed
# recording still plays). Run it from the owner's own Terminal: macOS asks once for Screen Recording permission
# for that app (System Settings > Privacy & Security > Screen Recording); an agent cannot grant it.
#   demo/record.sh [--screen N] [--mic] [--label practice] [--max 1800]
#     --screen N   which display: 0 = main, 1 = the projector when extended (list: demo/record.sh --list)
#     --mic        also record the room through the Mac microphone (crowd + PA)
# Stop with Ctrl-C. Output: demo/raw/stage-<label>-<HHMMSS>.mp4 and one line in demo/raw/clips.jsonl (start time,
# used by demo/cut.ts to find the beats in the recording).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW="$DIR/raw"; mkdir -p "$RAW"
SCREEN=0 MIC=0 LABEL=practice MAX=1800

devices() { ffmpeg -hide_banner -nostdin -f avfoundation -list_devices true -i "" 2>&1 | grep -E '\[[0-9]+\]' || true; }
while (($#)); do
  case "$1" in
    --screen) SCREEN="$2"; shift ;;
    --mic) MIC=1 ;;
    --label) LABEL="$2"; shift ;;
    --max) MAX="$2"; shift ;;
    --list) devices; exit 0 ;;
    *) echo "usage: demo/record.sh [--screen N] [--mic] [--label name] [--max seconds] | --list" >&2; exit 2 ;;
  esac
  shift
done

LIST="$(devices)"
VIDEO="$(echo "$LIST" | grep "Capture screen $SCREEN" | grep -Eo '\] \[[0-9]+\]' | grep -Eo '[0-9]+' | head -n 1 || true)"
[[ -n "$VIDEO" ]] || { echo "record.sh: no 'Capture screen $SCREEN' device. Devices:" >&2; echo "$LIST" >&2; exit 1; }
AUDIO=none
if ((MIC)); then
  AUDIO="$(echo "$LIST" | grep -i 'microphone' | grep -Eo '\] \[[0-9]+\]' | grep -Eo '[0-9]+' | head -n 1 || true)"
  [[ -n "$AUDIO" ]] || { echo "record.sh: no microphone device found" >&2; exit 1; }
fi

free_gb() { df -g "$RAW" | awk 'NR == 2 { print $4 }'; }
(( $(free_gb) >= 3 )) || { echo "record.sh: only $(free_gb) GB free on this disk; need >= 3 GB (6 Mb/s = 45 MB/min)" >&2; exit 1; }
OUT="$RAW/stage-$LABEL-$(date +%H%M%S).mp4"
START_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
ACODEC=(-an); ((MIC)) && ACODEC=(-c:a aac -b:a 160k -ac 2)
echo "recording screen $SCREEN (device $VIDEO, audio $AUDIO) -> $OUT  (Ctrl-C to stop, max $MAX s)"
ffmpeg -hide_banner -loglevel error -nostdin -f avfoundation -framerate 30 -capture_cursor 0 -i "$VIDEO:$AUDIO" \
  -t "$MAX" -vf "scale=1920:-2,format=yuv420p" -c:v h264_videotoolbox -b:v 6M -realtime 1 "${ACODEC[@]}" \
  -movflags +frag_keyframe+empty_moov "$OUT" &
FF=$!
echo "{\"file\":\"$(basename "$OUT")\",\"startMs\":$START_MS,\"label\":\"$LABEL\",\"screen\":$SCREEN,\"mic\":$MIC}" >>"$RAW/clips.jsonl"
trap 'kill -INT $FF 2>/dev/null || true' INT TERM

# Watchdog: no bytes after 10 s = macOS is holding the capture for the Screen Recording permission.
for _ in $(seq 1 20); do
  [[ -s "$OUT" ]] && break
  kill -0 $FF 2>/dev/null || break
  sleep 0.5
done
if [[ ! -s "$OUT" ]]; then
  kill -9 $FF 2>/dev/null || true
  echo "record.sh: no frames after 10 s. Grant Screen Recording to this terminal app (System Settings >" >&2
  echo "  Privacy & Security > Screen Recording), quit and reopen it, then run again." >&2
  exit 1
fi
echo "frames are flowing"
# Disk guard: other lanes share this disk; stop cleanly below 1 GB free.
( while kill -0 $FF 2>/dev/null; do
    if (( $(free_gb) < 1 )); then echo "record.sh: under 1 GB free, stopping the recording" >&2; kill -INT $FF; break; fi
    sleep 5
  done ) &
wait $FF || true
echo "saved $OUT ($(du -h "$OUT" | cut -f1))"
