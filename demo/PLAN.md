# Video plan (60-90 s, assembled by 15:30)

Shape: 6 title cards in the stage's fonts, cut between real footage of today's rounds.

| # | card | footage (picked automatically by `bun demo/cut.ts`) |
|---|---|---|
| 1 | "You are the ghosts. They are AI. Lie to them." | the room joining, wisps pouring in; phone shot of the room scanning |
| 2 | "Hide. Six seconds." | one full beat: hide, hunters argue and vote on the feed, flashlight reveal |
| 3 | "Lie to them." | a lure that worked: the DM on the feed, the empty-room sweep, "somebody lied" / "They fell for it." |
| 4 | "$ kill -9" | the terminal kill, the stage's "Back in 0.2 s", same rooms, same beat; phones never notice |
| 5 | (finale) | blood-red flood on the projector; phone shot of the room going red |
| 6 | close + numbers | people who played (real phones only: `bun demo/cards.ts --people <n>`), Relay messages, recovery time; "We're Gessa..." |

## Timeline

| when | who | do |
|---|---|---|
| 13:50 | agent (L11) | start the logger, leave it running until 15:15: `bun demo/numbers.ts` |
| 13:50 | owner | one 3 s test in your own Terminal: `demo/record.sh --max 3`. If it says "no frames after 10 s", grant Screen Recording to Terminal (System Settings > Privacy & Security > Screen Recording), reopen Terminal, retry |
| 14:00 | owner | practice rounds: `demo/record.sh --label practice --mic` (add `--screen 1` if the projector is an extended display; `demo/record.sh --list`). Ctrl-C after a few rounds |
| 14:45 | owner | rehearsal: `demo/record.sh --label rehearsal --mic`; also film the room on your phone (landscape, 10-20 s around "phones out", a lie landing, the kill, the red finale) |
| 15:15 | agent | AirDrop the phone clips into `demo/raw/phone/` (their creation time places them). Then `bun demo/cards.ts && bun demo/cut.ts`, check `demo/cut.txt`, `demo/assemble.sh` |
| 15:30 | agent | watch `demo/out/haunt-the-room.mp4`; upload; paste the link into SUBMISSION.md |

## Notes

- `record.sh` encodes on the GPU (h264_videotoolbox) so the stack and 500 bots keep the CPU; files are fragmented
  mp4, so Ctrl-C or a crash never loses a recording.
- The Mac mic (`--mic`) catches the room and the PA; there is no system-audio loopback device on this Mac.
- `cut.ts` takes each moment from the latest recording that covers it; anything it cannot find is a `# MISSING`
  line in `cut.txt` to place by hand (`clip <file> <start s> <length s>`).
- README still: `ffmpeg -ss <s> -i demo/raw/<rehearsal>.mp4 -frames:v 1 demo/stills/stage.png`.
- Backup for the live demo: the assembled video, open in QuickTime before we go on.
