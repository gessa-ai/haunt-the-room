#!/bin/bash
# L17: block until sim A shows the hide grid (Attic tile red at raw 315,996 AND Nursery tile blue), max 90 s
U=B08BDEE7-07D4-44BD-8CA4-E2104FE56034; f=/tmp/l17-wait.png
for i in $(seq 1 150); do
  xcrun simctl io $U screenshot "$f" >/dev/null 2>&1
  a="$(magick "$f" -crop 400x300+100+820 -format "%[fx:int(255*mean.r)] %[fx:int(255*mean.b)] " info:)$(magick "$f" -crop 400x300+660+820 -format "%[fx:int(255*mean.r)] %[fx:int(255*mean.b)]" info:)"
  set -- $a; if [ $1 -gt $(( $2 + 30 )) ] && [ $4 -gt $(( $3 + 30 )) ]; then echo "hide at $(date +%T.%N | cut -c1-12) ($a)"; exit 0; fi
  sleep 0.3
done; echo "no hide in time"; exit 1
