export const meta = { title: "Bad", minPlayers: 2, maxPlayers: 4 };
export function init(players) { return { players }; }
export function reduce(s, a) { s.n=(s.n||0)+1; return s; }
export function view(s) { s.n=(s.n||0)+1; return s; }
export function render(v, send, root) { document.addEventListener("keydown", () => send({type:"x"})); }
