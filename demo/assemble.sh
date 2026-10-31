#!/usr/bin/env bash
# L11: build the 60-90 s video from demo/cut.txt (bun demo/cut.ts proposes it; cards from bun demo/cards.ts).
#   demo/assemble.sh [cut.txt] [--bed <audio file>]
# Every segment is normalised to 1920x1080, 30 fps, yuv420p, AAC 48 kHz stereo (silence where a source has no
# audio), with 0.25 s fades; then concatenated and loudness-normalised to -16 LUFS.
# Output: demo/out/haunt-the-room.mp4 (+ demo/out/haunt-the-room.jpg poster from the finale).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUT="$DIR/cut.txt" BED=""
while (($#)); do
  case "$1" in
    --bed) BED="$2"; shift ;;
    *) CUT="$1" ;;
  esac
  shift
done
[[ -f "$CUT" ]] || { echo "assemble: $CUT missing (bun demo/cut.ts)" >&2; exit 1; }
SEG="$DIR/build/segments"; OUT="$DIR/out"
rm -rf "$SEG"; mkdir -p "$SEG" "$OUT"
FPS=30 FADE=0.25
VF="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=$FPS,format=yuv420p"
ENC=(-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2)

has_audio() { [[ -n "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1")" ]]; }
fades() { # <length>: video + audio fade in/out
  local d="$1" st; st="$(python3 -c "print(max(0.0, $d - $FADE))")"
  echo "fade=t=in:st=0:d=$FADE,fade=t=out:st=$st:d=$FADE|afade=t=in:st=0:d=$FADE,afade=t=out:st=$st:d=$FADE"
}

n=0; : >"$SEG/list.txt"
while read -r kind a b c _; do
  [[ -z "${kind:-}" || "$kind" == \#* ]] && continue
  n=$((n + 1)); seg="$SEG/$(printf %02d $n).mp4"
  case "$kind" in
    card)
      png="$DIR/build/cards/$a.png"; len="$b"
      [[ -f "$png" ]] || { echo "assemble: card $png missing (bun demo/cards.ts)" >&2; exit 1; }
      f="$(fades "$len")"
      ffmpeg -hide_banner -loglevel error -nostdin -y -loop 1 -framerate $FPS -t "$len" -i "$png" \
        -f lavfi -t "$len" -i anullsrc=r=48000:cl=stereo \
        -vf "$VF,${f%%|*}" -af "${f##*|}" "${ENC[@]}" -shortest "$seg" ;;
    clip)
      src="$DIR/$a"; start="$b"; len="$c"
      [[ -f "$src" ]] || { echo "assemble: clip $src missing" >&2; exit 1; }
      f="$(fades "$len")"
      if has_audio "$src"; then
        ffmpeg -hide_banner -loglevel error -nostdin -y -ss "$start" -t "$len" -i "$src" \
          -vf "$VF,${f%%|*}" -af "aresample=48000,${f##*|}" "${ENC[@]}" "$seg"
      else
        ffmpeg -hide_banner -loglevel error -nostdin -y -ss "$start" -t "$len" -i "$src" \
          -f lavfi -t "$len" -i anullsrc=r=48000:cl=stereo -map 0:v -map 1:a \
          -vf "$VF,${f%%|*}" -af "${f##*|}" "${ENC[@]}" -shortest "$seg"
      fi ;;
    *) echo "assemble: unknown line kind '$kind' in $CUT" >&2; exit 1 ;;
  esac
  echo "file '$seg'" >>"$SEG/list.txt"
  echo "  $(printf %02d $n) $kind $a ${len}s"
done <"$CUT"
((n > 0)) || { echo "assemble: no segments in $CUT" >&2; exit 1; }

FINAL="$OUT/haunt-the-room.mp4"
if [[ -n "$BED" ]]; then
  ffmpeg -hide_banner -loglevel error -nostdin -y -f concat -safe 0 -i "$SEG/list.txt" -stream_loop -1 -i "$BED" \
    -filter_complex "[1:a]volume=0.18[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$FINAL"
else
  ffmpeg -hide_banner -loglevel error -nostdin -y -f concat -safe 0 -i "$SEG/list.txt" \
    -af "loudnorm=I=-16:TP=-1.5" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$FINAL"
fi
LEN="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL")"
ffmpeg -hide_banner -loglevel error -nostdin -y -sseof -6 -i "$FINAL" -frames:v 1 -q:v 3 "$OUT/haunt-the-room.jpg" || true
echo "video: $FINAL (${LEN%.*} s, $(du -h "$FINAL" | cut -f1)). Target 60-90 s."
