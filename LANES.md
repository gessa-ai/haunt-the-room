# Lane rules (every build agent reads this, SPEC.md and contract/ first)

We are competing at YC Haunted Hacks right now. Submission 16:00, everything frozen 15:15. The product is
HAUNT THE ROOM (SPEC.md; the plan changed at 12:20, read it again). You are one of several agents building it in parallel in ~/haunted-hacks.

## Rules
1. Hackathon rule: all code is written today. You may read and copy from ~/haunted-hacks/research/ (written today).
   Never copy code from ~/plushly or any other existing project.
2. Own only your folder (see your lane). Never edit another lane's folder or contract/. If you need something from
   another lane, code against contract/ and stub it inside your own folder; delete the stub when the real thing
   lands. Write the need under NEEDS in your status file; the conductor routes it.
3. No git commands at all (the conductor commits). Never `pkill`/`killall` by pattern: other agents and the
   owner's other work share this Mac. Kill only PIDs you started. Use only your port block.
4. Status file: `lanes/<LANE>.md`, rewritten at least every 20 minutes and when you finish:
   `DONE` (what works, proven how), `RUN` (exact commands), `NEXT`, `NEEDS`, `RISKS`. Terse bullets, no prose.
5. Definition of done: it runs end to end and you proved it by REAL USE (a screenshot for UI, real sockets for
   actors, curl output for the server). NO test suites, test frameworks or unit tests (owner directive 12:10).
   At most one smoke script per lane.
6. Simple backend, extravagant demo (owner directive 12:10): build the simplest thing that works on stage and
   skip hardening nobody sees. Polish what the judges and the room see. Placeholders are fine where another
   lane's piece is missing. No speculative features, no feature flags or alternate code paths. TypeScript.
   Handle errors visibly; never fail silently. Keep your context small: don't re-read big files.
7. Runtime: Bun 1.4.4 (`bun`, `bunx`), Node 22. Terse local server: `bunx durable-actors dev --port <yours>`.
   Generate an actor client from your own folder against a running dev server:
   `DURABLE_ACTORS_CONTROL_PLANE_URL=http://127.0.0.1:<port> bunx durable-actors generate <path-to>/actors/src/actors.ts`
   (always pass the path). Agent Relay local engine: http://localhost:8787 is running (create your own
   workspace: `curl -XPOST localhost:8787/v1/workspaces -H 'content-type: application/json' -d '{"name":"<lane>"}'`).
8. LLM and media: OpenAI when OPENAI_API_KEY is set in ~/haunted-hacks/.env (the owner is adding it; read that
   file, never print or copy the key); until then `claude -p --model haiku` for text and placeholders for media.
9. Deadlines: first working version by 13:00 (rough is fine), integrated by 13:30 (G1), polish until 15:00.
10. When you finish your lane's scope, polish and harden it; do not expand into other lanes.

## Research you should read (verified today)
- research/TERSE.md: SDK surface, alarms (~10 Hz max: request 50 ms), persist cost (~14 ms; keep live state
  @Ephemeral and persist on a timer), websocket grants, actor-to-actor calls. Working code: research/terse/exp/.
  Gotcha found by L1: Terse type-checks public actor method signatures in a separate pass that rejects `.ts`
  import extensions; name only contract/ types in public signatures and declare return types explicitly.
- research/RELAY.md: SDK surface (sender = `e.message.from.name`; thread reply = `relay.messages.reply(...)`;
  registerAction/invoke; observer tokens and the raw feed, browser-readable). Code: research/relay/*.mjs.

## Port blocks
L2 ACTORS 7310-7319 · L3 HUNTERS 7320-7329 · L5 SERVER 3310-3319 + 7330-7339 · L6 PHONE 5360-5369 ·
L7 STAGE 5370-5379 · L8 BOTS 7340-7349 · L9 ART / L10 AUDIO: none needed. Integration (conductor): actors 7300,
server 3300, relay 8787.

## Shared web/ ownership
L7 owns web/package.json, vite config, index.html, web/src/main.ts (routes /p, /stage, /feed), web/src/stage/,
web/src/feed/. L6 owns web/src/play/. L9 owns web/public/art/. L10 owns web/public/audio/ and web/src/audio/.
Need an npm dependency in web/? Write it under NEEDS in your status file; L7 adds it.
