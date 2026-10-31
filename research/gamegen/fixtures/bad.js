export const meta = { title: "Bad", minPlayers: 2, maxPlayers: 4 };
export function init(players) { return { roll: Math.random(), players }; }
export function reduce(s, a) { return s; }
export function view(s) { return s; }
export function render(v, send, root) { document.addEventListener("keydown", () => send({type:"x"})); }
