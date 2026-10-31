export const meta = {
  title: "🧟 Zombie Tag",
  minPlayers: 2,
  maxPlayers: 8,
  tickMs: 500
};

export function init(players, ctx) {
  return {
    phase: "lobby",
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      x: Math.floor(ctx.random() * 8),
      y: Math.floor(ctx.random() * 8),
      isZombie: i === 0,
      tagTime: i === 0 ? 0 : null
    })),
    now: ctx.now,
    gridWidth: 8,
    gridHeight: 8,
    gameDeadline: null
  };
}

export function reduce(state, action, ctx) {
  if (action.type === "start" && state.phase === "lobby") {
    state.phase = "play";
    state.gameDeadline = ctx.now + 120000;
    state.now = ctx.now;
    return state;
  }

  if (action.type === "tick") {
    state.now = ctx.now;
    if (state.phase === "play") {
      const humans = state.players.filter(p => !p.isZombie);
      if (humans.length === 0 || state.now >= state.gameDeadline) {
        state.phase = "over";
      }
    }
    return state;
  }

  if (action.type === "move" && state.phase === "play") {
    const player = state.players.find(p => p.id === action.playerId);
    if (!player) return state;
    
    const dir = action.direction;
    if (!["up", "down", "left", "right"].includes(dir)) return state;
    
    const moves = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = moves[dir];
    player.x = Math.max(0, Math.min(state.gridWidth - 1, player.x + dx));
    player.y = Math.max(0, Math.min(state.gridHeight - 1, player.y + dy));
    
    if (player.isZombie) {
      state.players.forEach(v => {
        if (!v.isZombie && v.x === player.x && v.y === player.y) {
          v.isZombie = true;
          v.tagTime = state.now;
        }
      });
    }
    return state;
  }

  if (action.type === "playAgain" && state.phase === "over") {
    state.phase = "lobby";
    state.players.forEach((p, i) => {
      p.x = Math.floor(ctx.random() * state.gridWidth);
      p.y = Math.floor(ctx.random() * state.gridHeight);
      p.isZombie = i === 0;
      p.tagTime = i === 0 ? 0 : null;
    });
    state.gameDeadline = null;
    return state;
  }

  if (action.type === "join") {
    const exists = state.players.some(p => p.id === action.playerId);
    if (exists || state.players.length >= 8) return state;
    state.players.push({
      id: action.playerId,
      name: action.name,
      x: Math.floor(ctx.random() * state.gridWidth),
      y: Math.floor(ctx.random() * state.gridHeight),
      isZombie: false,
      tagTime: null
    });
    return state;
  }

  if (action.type === "leave") {
    state.players = state.players.filter(p => p.id !== action.playerId);
    if (state.phase === "play" && state.players.filter(p => !p.isZombie).length === 0) {
      state.phase = "over";
    }
    return state;
  }

  return state;
}

export function view(state, playerId) {
  const me = state.players.find(p => p.id === playerId);
  const msLeft = state.phase === "play" && state.gameDeadline 
    ? Math.max(0, state.gameDeadline - state.now) : 0;

  return {
    phase: state.phase,
    playerId,
    me: me ? { id: me.id, name: me.name, x: me.x, y: me.y, isZombie: me.isZombie } : null,
    players: state.players.map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, isZombie: p.isZombie })),
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    msLeft,
    survivors: state.players.filter(p => !p.isZombie).map(p => p.name)
  };
}

export function render(view, send, root) {
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    #root { background: #0b0614; color: #f5f5f5; font-family: system-ui; font-size: 18px; padding: 10px; min-height: 100vh; }
    .header { text-align: center; font-weight: bold; font-size: 24px; margin-bottom: 15px; }
    .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; aspect-ratio: 1; margin-bottom: 20px; }
    .cell { background: #2a1f4d; border: 1px solid #8a2be2; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .cell.zombie { background: #39ff14; }
    .cell.human { background: #ff7518; }
    .cell.me { border: 3px solid #c1121f; }
    .status { text-align: center; margin-bottom: 20px; font-size: 16px; font-weight: bold; }
    .scoreboard { background: #1a1428; padding: 10px; border-radius: 8px; margin-bottom: 20px; }
    .player { padding: 8px; margin: 5px 0; }
    button { background: #ff7518; color: #0b0614; border: none; padding: 15px; font-size: 18px; font-weight: bold; border-radius: 8px; cursor: pointer; min-height: 56px; width: 100%; margin: 5px 0; }
    button:active { background: #8a2be2; color: #39ff14; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .arrow-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
    .arrow-buttons button { min-height: 45px; padding: 10px; margin: 0; }
  `;
  root.appendChild(style);

  if (view.phase === "lobby") {
    const h = document.createElement("div");
    h.className = "header";
    h.textContent = "🧟 ZOMBIE TAG";
    root.appendChild(h);
    
    const info = document.createElement("div");
    info.className = "status";
    info.textContent = `${view.players.length} players ready`;
    root.appendChild(info);
    
    const sb = document.createElement("div");
    sb.className = "scoreboard";
    view.players.forEach(p => {
      const d = document.createElement("div");
      d.className = "player";
      d.textContent = `👤 ${p.name}`;
      sb.appendChild(d);
    });
    root.appendChild(sb);
    
    const btn = document.createElement("button");
    btn.textContent = view.players.length >= 2 ? "🎮 START" : "⏳ Need 2+";
    btn.disabled = view.players.length < 2;
    btn.onclick = () => send({ type: "start" });
    root.appendChild(btn);
  } else if (view.phase === "play") {
    const h = document.createElement("div");
    h.className = "header";
    h.textContent = view.me.isZombie ? "🧟 YOU'RE ZOMBIE!" : "🏃 SURVIVE!";
    root.appendChild(h);
    
    const timer = document.createElement("div");
    timer.className = "status";
    timer.textContent = `⏱️ ${Math.ceil(view.msLeft / 1000)}s | 🏃 ${view.survivors.length}`;
    root.appendChild(timer);
    
    const grid = document.createElement("div");
    grid.className = "grid";
    for (let y = 0; y < view.gridHeight; y++) {
      for (let x = 0; x < view.gridWidth; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        const p = view.players.find(pl => pl.x === x && pl.y === y);
        if (p) {
          cell.className += p.isZombie ? " zombie" : " human";
          cell.textContent = p.id === view.playerId ? "🎯" : (p.isZombie ? "🧟" : "🏃");
        }
        if (view.me && view.me.x === x && view.me.y === y) cell.className += " me";
        grid.appendChild(cell);
      }
    }
    root.appendChild(grid);
    
    const arrows = document.createElement("div");
    arrows.className = "arrow-buttons";
    arrows.appendChild(document.createElement("div"));
    
    const up = document.createElement("button");
    up.textContent = "⬆️";
    up.onclick = () => send({ type: "move", direction: "up" });
    arrows.appendChild(up);
    
    arrows.appendChild(document.createElement("div"));
    
    const left = document.createElement("button");
    left.textContent = "⬅️";
    left.onclick = () => send({ type: "move", direction: "left" });
    arrows.appendChild(left);
    
    const down = document.createElement("button");
    down.textContent = "⬇️";
    down.onclick = () => send({ type: "move", direction: "down" });
    arrows.appendChild(down);
    
    const right = document.createElement("button");
    right.textContent = "➡️";
    right.onclick = () => send({ type: "move", direction: "right" });
    arrows.appendChild(right);
    
    root.appendChild(arrows);
  } else if (view.phase === "over") {
    const h = document.createElement("div");
    h.className = "header";
    h.textContent = "💀 GAME OVER";
    root.appendChild(h);
    
    const sb = document.createElement("div");
    sb.className = "scoreboard";
    sb.style.textAlign = "center";
    
    const survivors = view.players.filter(p => !p.isZombie);
    if (survivors.length > 0) {
      const title = document.createElement("div");
      title.style.color = "#39ff14";
      title.style.fontWeight = "bold";
      title.style.marginBottom = "10px";
      title.textContent = "🎉 SURVIVORS";
      sb.appendChild(title);
      survivors.forEach(p => {
        const d = document.createElement("div");
        d.className = "player";
        d.textContent = `🏃 ${p.name}`;
        sb.appendChild(d);
      });
    } else {
      const d = document.createElement("div");
      d.style.color = "#39ff14";
      d.textContent = "👿 All zombies!";
      sb.appendChild(d);
    }
    root.appendChild(sb);
    
    const btn = document.createElement("button");
    btn.textContent = "🔄 PLAY AGAIN";
    btn.onclick = () => send({ type: "playAgain" });
    root.appendChild(btn);
  }
}
