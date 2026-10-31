export const meta = { title: "Leaky", minPlayers: 2, maxPlayers: 4 };
let counter = 0;
export function init(players) { return { players, c: 0 }; }
export function reduce(s, a) { if (a.type === "go") s.c = ++counter; return s; }
export function view(s, me) { return { me, c: s.c }; }
export function render(v, send, root) { root.replaceChildren(); const b = document.createElement("button"); b.onclick = () => send({ type: "go" }); root.append(b); }
