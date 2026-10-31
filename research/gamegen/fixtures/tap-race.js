export const meta = { title: "Tap Race", minPlayers: 2, maxPlayers: 8, tickMs: 500 };
export function init(players, ctx) {
  return { phase: "lobby", now: ctx.now, deadline: 0, players: players.map(p => ({ id: p.id, name: p.name, taps: 0 })), seed: Math.floor(ctx.random() * 1000) };
}
export function reduce(s, a, ctx) {
  const me = s.players.find(p => p.id === a.playerId);
  if (a.type === "tick") { s.now = ctx.now; if (s.phase === "play" && ctx.now >= s.deadline) s.phase = "over"; return s; }
  if (a.type === "join") { if (!me) s.players.push({ id: a.playerId, name: String(a.name || "?"), taps: 0 }); return s; }
  if (a.type === "leave") { s.players = s.players.filter(p => p.id !== a.playerId); return s; }
  if (!me) return s;
  if (a.type === "start" && s.phase !== "play") { s.phase = "play"; s.deadline = ctx.now + 10000; s.players.forEach(p => p.taps = 0); }
  if (a.type === "tap" && s.phase === "play") me.taps++;
  return s;
}
export function view(s, playerId) { return { me: playerId, phase: s.phase, msLeft: Math.max(0, s.deadline - s.now), players: s.players }; }
export function render(v, send, root) {
  root.replaceChildren();
  const b = document.createElement("button");
  b.textContent = v.phase === "play" ? "TAP" : "Start";
  b.addEventListener("click", () => send({ type: v.phase === "play" ? "tap" : "start" }));
  root.append(b);
}
