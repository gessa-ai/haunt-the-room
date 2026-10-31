# Party Game Contract v0 (gamegen)

One plain JavaScript (ES2022) module string, no imports, five named exports.
The same string is loaded twice: on the server (sandboxed, pure: `meta`, `init`, `reduce`, `view`)
and on each phone (`render`). The server is authoritative; phones only render a view and send actions.

```js
export const meta = { title: "Pumpkin Rush", minPlayers: 2, maxPlayers: 8, tickMs: 500 }; // tickMs optional

export function init(players, ctx) { /* -> state */ }           // players: [{ id, name }]
export function reduce(state, action, ctx) { /* -> state */ }  // every change goes through here
export function view(state, playerId) { /* -> JSON slice */ }  // what this player may see
export function render(view, send, root) { /* builds DOM */ }  // client only
```

## Server side (init, reduce, view)

| Rule | Why |
|---|---|
| `ctx = { now, random }`: `now` is ms since epoch, `random()` is a seeded PRNG in [0,1). | Deterministic replay, fair seeds. |
| No `Math.random`, `Date`, timers, `fetch`, globals, I/O. The sandbox makes `Math.random` and `Date` throw. | Purity. |
| State and views are plain JSON: objects, arrays, strings, finite numbers, booleans, null. No `undefined` in arrays, no Map/Set/Date/class/functions. | Persisted, diffed and sent over the wire. |
| `reduce` may mutate the state it is given and return it (the server passes a copy). It must always return the state. | Easiest for models; still pure from the outside. |
| `reduce` never throws. Unknown types, wrong phase, wrong player, bad payload: return state unchanged. | Payloads are untrusted client input. |
| Each call finishes in under 50 ms (hard kill at 250 ms). State stays under 64 KB. | Rooms tick on a shared server. |

### Actions
`action = { type, playerId, ...payload }`. The server stamps `playerId` from the authenticated
seat, so a client cannot spoof it. Player action types are the game's own (`"carve"`, `"vote"`, ...).
System actions, sent only by the server:

| type | when | notes |
|---|---|---|
| `join` | a player enters after `init` (late join or rejoin) | `{ type: "join", playerId, name }`; ignore if already present or full |
| `leave` | a player disconnects | keep the game playable with fewer players |
| `tick` | every `meta.tickMs` ms if `tickMs` is set | `{ type: "tick" }`; timers are deadlines (`ctx.now + ms`) checked here; store `state.now = ctx.now` so `view` can show time left |

The game loops: after game over, any player can send a restart action (a "Play again" button).

### view
Return only what `playerId` may see: hide other players' roles, secret words, answers and
votes until reveal. Include `me: playerId` so `render` knows who it is.

## Client side (render)

- Called with the latest view every time it changes. Rebuild from scratch: `root.replaceChildren()`
  (or `root.innerHTML = ""`) first. Attach listeners only to elements inside `root`; never to
  `document` or `window` (they would stack up on every render).
- Call `send({ type, ...payload })` for every input; never mutate state locally.
- DOM only (no canvas, no images, no network, no external fonts). Emoji are fine.
- Mobile first: `<button>` for every action, tap targets at least 56 px tall, text 18 px or more,
  one line at the top saying what to do right now. Text input = `<input>` plus a submit button.
- Halloween palette: background `#0b0614`, pumpkin `#ff7518`, purple `#8a2be2`, slime `#39ff14`,
  blood `#c1121f`, text `#f5f5f5`. Styles inline or in a `<style>` inside `root`.

## What the playtester checks (harness.mjs)

1. Module parses; exports present; `meta` sane (`minPlayers <= 4 <= maxPlayers`); no `import`.
2. 4 players (plus one late joiner when `maxPlayers >= 5`, one leave and rejoin), 200 bot steps with
   ticks. Bots play through the real UI: each step one player's `render` output is searched for
   live controls (anything with a click/pointer/touch/key listener, buttons, inputs), inputs are
   filled with random words/emoji, and one control is pressed. Garbage actions are mixed in.
3. No exception in `init`/`reduce`/`view`/`render` (including async render errors), no timeouts,
   every state and view JSON-clean, under 64 KB.
4. Determinism: the whole run is repeated with the same seed and must produce the identical state trace.
5. Playable: at least one UI-sent player action changed the state.
6. No listener leak on `document`/`window`.
