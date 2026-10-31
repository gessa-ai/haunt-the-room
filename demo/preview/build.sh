#!/usr/bin/env bash
# L11: build demo/preview/ (4 stills + a ~27 s clip) for showing judges early. Sources: a fake-data capture of
# /stage?fake=loop (capture.mjs), the real-stack QA shots (qa/shots, 13:07-13:23), the 3D stage shots
# (web/src/stage3d/shots). Everything small: JPEG q82 at 1600 px, video 1280x720 crf 28.
#   demo/preview/build.sh <capture dir from capture.mjs>
set -euo pipefail
CAP="$1"; P="$(cd "$(dirname "$0")" && pwd)"; R="$P/../.."; T="$(mktemp -d)"
Q="$R/qa/shots"; S3="$R/web/src/stage3d/shots"
latest() { ls -t "$Q"/*"$1" | head -n 1; }
WEBM="$(ls "$CAP"/*.webm | head -n 1)"
J=(-quality 82 -strip)

# 1 stage lobby (fake data)
magick "$CAP/s20.jpg" -resize 1600x "${J[@]}" "$P/1-stage-lobby.jpg"
# 2 stage reveal: caught, kill cam, the kill recovery ("Nobody moved."), caught
magick montage "$S3/reveal-1.png" "$S3/reveal-3.png" "$(latest 06-stage-reveal-stage.jpg)" "$S3/reveal-2.png" \
  -tile 2x2 -geometry 960x540+0+0 -background black "$T/rev.png"
magick "$T/rev.png" -resize 1600x "${J[@]}" "$P/2-stage-reveal.jpg"
# 3 phone: hide grid, caught, possessed
magick montage "$(latest 08-lure-mode-A.jpg)" "$(latest 06-reveal-caught-A.jpg)" "$(latest 06-reveal-possessed-A.jpg)" \
  -tile 3x1 -geometry 390x844+12+0 -background '#0b0710' "$T/ph.png"
magick "$T/ph.png" "${J[@]}" "$P/3-phone-hide-result.jpg"
# 4 the 3D finale blood flood
magick "$S3/finale-4.png" -resize 1600x "${J[@]}" "$P/4-finale-blood-flood.jpg"

# video: stage clips from the capture + stills cut in
VF="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b0710,fps=30,format=yuv420p"
n=0; : >"$T/list.txt"
clip() { n=$((n+1)); ffmpeg -hide_banner -loglevel error -nostdin -y -ss "$1" -t "$2" -i "$WEBM" -an -vf "$VF,fade=t=in:d=0.2,fade=t=out:st=$(python3 -c "print($2-0.2)"):d=0.2" -c:v libx264 -crf 28 -preset veryfast "$T/$n.mp4"; echo "file '$T/$n.mp4'" >>"$T/list.txt"; }
still() { n=$((n+1)); ffmpeg -hide_banner -loglevel error -nostdin -y -loop 1 -framerate 30 -t "$2" -i "$1" -vf "$VF,fade=t=in:d=0.2,fade=t=out:st=$(python3 -c "print($2-0.2)"):d=0.2" -c:v libx264 -crf 28 -preset veryfast "$T/$n.mp4"; echo "file '$T/$n.mp4'" >>"$T/list.txt"; }
clip 17 4.5                                   # lobby: wisps pour in, the QR call
clip 26 8                                     # intro cards
clip 41 3                                     # beat 1 hide on the stage
still "$(latest 08-lure-mode-A.jpg)" 2        # phone: hide grid
still "$S3/reveal-1.png" 2.5                  # reveal: caught
still "$(latest 06-reveal-caught-A.jpg)" 2    # phone: caught
still "$S3/reveal-3.png" 2                    # kill cam
still "$(latest 06-stage-reveal-stage.jpg)" 2 # after kill -9: "Nobody moved."
still "$S3/finale-4.png" 2.5                  # finale blood flood
ffmpeg -hide_banner -loglevel error -nostdin -y -f concat -safe 0 -i "$T/list.txt" -c copy -movflags +faststart "$P/preview.mp4"
rm -rf "$T"
ls -la "$P" | awk 'NR>1 {print $5, $9}'
echo "preview.mp4 $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$P/preview.mp4") s"
