#!/usr/bin/env bash
# L11b VIDEO: cut-list -> demo/video/out/haunt-the-room.mp4
#   demo/video/build.sh [demo/video/cut.json]
# 1 render.mjs: captions + cards (PNG, game fonts, dithered)   2 vo.mjs: voiceover lines (say or ElevenLabs, cached)
# 3 build.mjs: cut, zoom, PIP, captions, stage audio, VO + ducking, -16 LUFS. Intermediates are deleted.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUT="${1:-$DIR/cut.json}"
rm -rf "$DIR/build/png"  # styles change between builds: never reuse a caption PNG
node "$DIR/render.mjs" "$CUT"
node "$DIR/vo.mjs" "$CUT"
node "$DIR/build.mjs" "$CUT"
