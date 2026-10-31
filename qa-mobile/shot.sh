#!/bin/bash
# L17: shot.sh <A|B> <label> [px]  -> qa-mobile/shots/<HHMMSS>-<A|B>-<label>.jpg (+ small/ copy for review)
cd "$(dirname "$0")/shots"
case $1 in A) U=B08BDEE7-07D4-44BD-8CA4-E2104FE56034;; B) U=$(cat ../simB.txt 2>/dev/null);; esac
f="$(date +%H%M%S)-$1-$2"
xcrun simctl io $U screenshot --type=jpeg "$f.jpg" >/dev/null 2>&1 && sips -Z ${3:-560} "$f.jpg" --out "small/$f.jpg" >/dev/null && echo "$PWD/small/$f.jpg"
