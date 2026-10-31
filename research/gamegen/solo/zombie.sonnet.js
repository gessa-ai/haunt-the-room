export const meta = { title: "Zombie Tag 🧟", minPlayers: 2, maxPlayers: 8, tickMs: 500 };

const SIZE = 6;
const ROUND_MS = 90000;

function convertCollisions(state) {
  const live = state.players.filter(p => p.connected && !p.spectator);
  for (const z of live) {
    if (!z.zombie) continue;
    for (const h of live) {
      if (!h.zombie && h.x === z.x && h.y === z.y) h.zombie = true;
    }
  }
}

function humansAlive(state) {
  return state.players.filter(p => p.connected && !p.spectator && !p.zombie).length;
}

function freshPositions(state, ctx) {
  const live = state.players.filter(p => p.connected);
  const used = new Set();
  for (const p of live) {
    let x, y, key;
    let tries = 0;
    do {
      x = Math.floor(ctx.random() * SIZE);
      y = Math.floor(ctx.random() * SIZE);
      key = x + "," + y;
      tries++;
    } while (used.has(key) && tries < 50);
    used.add(key);
    p.x = x; p.y = y;
    p.zombie = false;
    p.spectator = false;
  }
  if (live.length > 0) {
    const zi = Math.floor(ctx.random() * live.length);
    live[zi].zombie = true;
  }
}

export function init(players, ctx) {
  const state = {
    phase: "lobby",
    size: SIZE,
    players: players.map(p => ({
      id: p.id, name: p.name, x: 0, y: 0,
      zombie: false, spectator: true, connected: true
    })),
    deadline: 0,
    now: ctx.now,
    winner: null
  };
  return state;
}

export function reduce(state, action, ctx) {
  if (!action || typeof action.type !== "string") return state;

  if (action.type === "join") {
    const exists = state.players.find(p => p.id === action.playerId);
    if (exists) { exists.connected = true; return state; }
    if (state.players.length >= 8) return state;
    state.players.push({
      id: action.playerId, name: String(action.name || "Player"),
      x: 0, y: 0, zombie: false, spectator: true, connected: true
    });
    return state;
  }

  if (action.type === "leave") {
    const p = state.players.find(p => p.id === action.playerId);
    if (p) p.connected = false;
    if (state.phase === "play") {
      convertCollisions(state);
      if (humansAlive(state) === 0) {
        state.phase = "over";
        state.winner = "zombies";
      }
    }
    return state;
  }

  if (action.type === "tick") {
    state.now = ctx.now;
    if (state.phase === "play" && ctx.now >= state.deadline) {
      state.phase = "over";
      state.winner = humansAlive(state) > 0 ? "humans" : "zombies";
    }
    return state;
  }

  if (action.type === "start") {
    if (state.phase !== "lobby" && state.phase !== "over") return state;
    const connected = state.players.filter(p => p.connected);
    if (connected.length < 2) return state;
    freshPositions(state, ctx);
    state.phase = "play";
    state.now = ctx.now;
    state.deadline = ctx.now + ROUND_MS;
    state.winner = null;
    return state;
  }

  if (action.type === "move") {
    if (state.phase !== "play") return state;
    const p = state.players.find(p => p.id === action.playerId);
    if (!p || !p.connected || p.spectator) return state;
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[action.dir];
    if (!d) return state;
    p.x = Math.max(0, Math.min(state.size - 1, p.x + d[0]));
    p.y = Math.max(0, Math.min(state.size - 1, p.y + d[1]));
    convertCollisions(state);
    if (humansAlive(state) === 0) {
      state.phase = "over";
      state.winner = "zombies";
    }
    return state;
  }

  return state;
}

export function view(state, playerId) {
  const me = state.players.find(p => p.id === playerId);
  const msLeft = state.phase === "play" ? Math.max(0, state.deadline - state.now) : 0;
  return {
    me: playerId,
    phase: state.phase,
    size: state.size,
    msLeft,
    winner: state.winner,
    myZombie: me ? me.zombie : false,
    mySpectator: me ? me.spectator : true,
    canStart: state.players.filter(p => p.connected).length >= 2,
    players: state.players.filter(p => p.connected).map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y,
      zombie: p.zombie, spectator: p.spectator, isMe: p.id === playerId
    }))
  };
}

export function render(view, send, root) {
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    .zt-wrap { background:#0b0614; color:#f5f5f5; min-height:100vh; padding:12px; font-family: sans-serif; }
    .zt-title { color:#ff7518; font-size:22px; font-weight:bold; text-align:center; margin-bottom:8px; }
    .zt-sub { text-align:center; margin-bottom:10px; font-size:16px; }
    .zt-grid { display:grid; grid-template-columns:repeat(${view.size},1fr); gap:3px; max-width:420px; margin:0 auto 14px; background:#1a0f29; padding:4px; border-radius:8px; }
    .zt-cell { position:relative; aspect-ratio:1; background:#1f1430; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:20px; }
    .zt-cell.me { outline: 2px solid #39ff14; }
    .zt-btn { min-height:56px; font-size:20px; border:none; border-radius:8px; background:#8a2be2; color:#fff; font-weight:bold; width:100%; }
    .zt-btn:active { background:#6a1fc2; }
    .zt-dpad { display:grid; grid-template-columns:72px 72px 72px; grid-template-rows:56px 56px 56px; gap:6px; justify-content:center; margin:14px auto; }
    .zt-dpad button { font-size:24px; }
    .zt-start { background:#ff7518; color:#0b0614; font-size:20px; min-height:56px; width:100%; border:none; border-radius:8px; font-weight:bold; }
    .zt-score { background:#1a0f29; border-radius:8px; padding:8px; margin-bottom:10px; }
    .zt-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #2a1f40; }
    .zt-timer { text-align:center; font-size:20px; color:#39ff14; margin-bottom:8px; }
    .zt-over { text-align:center; font-size:26px; color:#c1121f; margin:10px 0; }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "zt-wrap";

  const title = document.createElement("div");
  title.className = "zt-title";
  title.textContent = "🧟 ZOMBIE TAG 🧟";
  wrap.appendChild(title);

  if (view.phase === "lobby") {
    const sub = document.createElement("div");
    sub.className = "zt-sub";
    sub.textContent = "Waiting to start... run from the zombie! 🏃";
    wrap.appendChild(sub);

    const btn = document.createElement("button");
    btn.className = "zt-start";
    btn.textContent = view.canStart ? "🎃 START GAME 🎃" : "Need 2+ players";
    btn.disabled = !view.canStart;
    btn.onclick = () => send({ type: "start" });
    wrap.appendChild(btn);
  }

  if (view.phase === "play" || view.phase === "over") {
    if (view.phase === "play") {
      const secs = Math.ceil(view.msLeft / 1000);
      const timer = document.createElement("div");
      timer.className = "zt-timer";
      timer.textContent = `⏱ ${secs}s left`;
      wrap.appendChild(timer);

      const sub = document.createElement("div");
      sub.className = "zt-sub";
      if (view.mySpectator) sub.textContent = "👀 Spectating until next round";
      else sub.textContent = view.myZombie ? "🧟 You are a ZOMBIE — hunt the humans!" : "🏃 You are HUMAN — run from the zombies!";
      wrap.appendChild(sub);
    }

    const grid = document.createElement("div");
    grid.className = "zt-grid";
    const occ = {};
    for (const p of view.players) {
      const key = p.x + "," + p.y;
      if (!occ[key]) occ[key] = [];
      occ[key].push(p);
    }
    for (let y = 0; y < view.size; y++) {
      for (let x = 0; x < view.size; x++) {
        const cell = document.createElement("div");
        cell.className = "zt-cell";
        const list = occ[x + "," + y] || [];
        const hasMe = list.some(p => p.isMe);
        if (hasMe) cell.classList.add("me");
        if (list.length > 0) {
          const anyZombie = list.some(p => p.zombie);
          cell.textContent = anyZombie ? "🧟" : "🧑";
          if (list.length > 1) cell.title = list.map(p => p.name).join(", ");
        }
        grid.appendChild(cell);
      }
    }
    wrap.appendChild(grid);

    if (view.phase === "play" && !view.mySpectator) {
      const dpad = document.createElement("div");
      dpad.className = "zt-dpad";
      const mk = (txt, dir, col, row) => {
        const b = document.createElement("button");
        b.className = "zt-btn";
        b.textContent = txt;
        b.style.gridColumn = col;
        b.style.gridRow = row;
        b.onclick = () => send({ type: "move", dir });
        return b;
      };
      dpad.appendChild(mk("⬆️", "up", "2", "1"));
      dpad.appendChild(mk("⬅️", "left", "1", "2"));
      dpad.appendChild(mk("➡️", "right", "3", "2"));
      dpad.appendChild(mk("⬇️", "down", "2", "3"));
      wrap.appendChild(dpad);
    }

    if (view.phase === "over") {
      const over = document.createElement("div");
      over.className = "zt-over";
      over.textContent = view.winner === "zombies" ? "🧟 ZOMBIES WIN! 🧟" : "🏃 HUMANS SURVIVE! 🎉";
      wrap.appendChild(over);

      const again = document.createElement("button");
      again.className = "zt-start";
      again.textContent = "🎃 Play Again 🎃";
      again.onclick = () => send({ type: "start" });
      wrap.appendChild(again);
    }
  }

  const score = document.createElement("div");
  score.className = "zt-score";
  for (const p of view.players) {
    const row = document.createElement("div");
    row.className = "zt-row";
    const left = document.createElement("span");
    left.textContent = (p.isMe ? "👉 " : "") + p.name;
    const right = document.createElement("span");
    right.textContent = p.spectator ? "👀" : (p.zombie ? "🧟" : "🏃");
    row.appendChild(left);
    row.appendChild(right);
    score.appendChild(row);
  }
  wrap.appendChild(score);

  root.appendChild(wrap);
}
