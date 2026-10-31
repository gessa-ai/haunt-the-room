export const meta = {
  title: "Zombie Tag",
  minPlayers: 2,
  maxPlayers: 8,
  tickMs: 500
};

export function init(players, ctx) {
  const gridSize = 7;
  const positions = {};
  const used = new Set();
  
  for (const p of players) {
    let x, y;
    do {
      x = Math.floor(ctx.random() * gridSize);
      y = Math.floor(ctx.random() * gridSize);
    } while (used.has(`${x},${y}`));
    used.add(`${x},${y}`);
    positions[p.id] = { x, y };
  }
  
  const zIdx = Math.floor(ctx.random() * players.length);
  
  return {
    phase: "play",
    gridSize,
    positions,
    zombieIds: [players[zIdx].id],
    round: 1,
    nextMoves: {},
    roundStart: ctx.now,
    roundDuration: 60000,
    scores: Object.fromEntries(players.map(p => [p.id, 0])),
    players: players.map(p => ({ id: p.id, name: p.name })),
    now: ctx.now
  };
}

export function reduce(state, action, ctx) {
  if (action.type === "tick") {
    state.now = ctx.now;
    
    if (Object.keys(state.nextMoves).length > 0) {
      const { positions, gridSize, zombieIds, nextMoves } = state;
      
      for (const pid in positions) {
        const pos = positions[pid];
        const dir = nextMoves[pid];
        if (dir === "up") pos.y = Math.max(0, pos.y - 1);
        else if (dir === "down") pos.y = Math.min(gridSize - 1, pos.y + 1);
        else if (dir === "left") pos.x = Math.max(0, pos.x - 1);
        else if (dir === "right") pos.x = Math.min(gridSize - 1, pos.x + 1);
      }
      
      const cells = {};
      for (const pid in positions) {
        const key = `${positions[pid].x},${positions[pid].y}`;
        if (!cells[key]) cells[key] = [];
        cells[key].push(pid);
      }
      
      for (const key in cells) {
        const occupants = cells[key];
        if (occupants.length > 1) {
          const hasZ = occupants.some(id => zombieIds.includes(id));
          if (hasZ) {
            for (const id of occupants) {
              if (!zombieIds.includes(id)) zombieIds.push(id);
            }
          }
        }
      }
      
      state.nextMoves = {};
    }
    
    const alive = state.players.filter(p => !state.zombieIds.includes(p.id));
    const elapsed = ctx.now - state.roundStart;
    
    if (alive.length === 0 || elapsed > state.roundDuration) {
      const zc = state.zombieIds.length;
      for (const p of alive) state.scores[p.id] += zc * 10;
      
      if (state.round >= 3) {
        state.phase = "over";
      } else {
        state.round++;
        state.zombieIds = [state.players[Math.floor(ctx.random() * state.players.length)].id];
        state.roundStart = ctx.now;
      }
    }
    
    return state;
  }
  
  if (action.type === "move") {
    if (state.phase !== "play") return state;
    const { direction } = action;
    if (["up", "down", "left", "right"].includes(direction)) {
      state.nextMoves[action.playerId] = direction;
    }
    return state;
  }
  
  if (action.type === "playAgain") {
    if (state.phase !== "over") return state;
    return init(state.players, ctx);
  }
  
  if (action.type === "join") {
    const { playerId, name } = action;
    if (state.players.some(p => p.id === playerId)) return state;
    if (state.players.length >= 8) return state;
    let x = Math.floor(ctx.random() * state.gridSize);
    let y = Math.floor(ctx.random() * state.gridSize);
    state.positions[playerId] = { x, y };
    state.scores[playerId] = 0;
    state.players.push({ id: playerId, name });
    return state;
  }
  
  if (action.type === "leave") {
    const { playerId } = action;
    delete state.positions[playerId];
    delete state.scores[playerId];
    delete state.nextMoves[playerId];
    state.zombieIds = state.zombieIds.filter(id => id !== playerId);
    state.players = state.players.filter(p => p.id !== playerId);
    return state;
  }
  
  return state;
}

export function view(state, playerId) {
  const isZombie = state.zombieIds.includes(playerId);
  const alive = state.players.filter(p => !state.zombieIds.includes(p.id));
  
  return {
    me: playerId,
    phase: state.phase,
    gridSize: state.gridSize,
    positions: state.positions,
    isZombie,
    round: state.round,
    scores: state.scores,
    players: state.players,
    zombieCount: state.zombieIds.length,
    aliveCount: alive.length,
    msLeft: Math.max(0, 60000 - (state.now - state.roundStart))
  };
}

export function render(view, send, root) {
  root.replaceChildren();
  
  const s = document.createElement("style");
  s.textContent = `
    body { background: #0b0614; color: #f5f5f5; font-size: 16px; }
    .ct { max-width: 500px; margin: 0 auto; padding: 10px; }
    .hdr { font-size: 26px; text-align: center; margin: 15px 0; font-weight: bold; }
    .grd { display: grid; grid-template-columns: repeat(${view.gridSize}, 1fr); gap: 2px; margin: 15px 0; }
    .cel { aspect-ratio: 1; background: #2a2542; border: 2px solid #8a2be2; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .zb { background: #39ff14 !important; }
    .hm { background: #ff7518 !important; }
    .ctrl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 15px 0; }
    .btn { background: #8a2be2; color: #f5f5f5; border: none; padding: 12px; font-size: 18px; cursor: pointer; border-radius: 6px; min-height: 56px; font-weight: bold; }
    .btn:active { background: #ff7518; }
    .sb { background: #2a2542; padding: 12px; border-radius: 6px; margin: 15px 0; border: 2px solid #8a2be2; }
    .si { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #4a4268; }
    .si:last-child { border-bottom: none; }
    .msg { text-align: center; margin: 10px 0; font-size: 18px; font-weight: bold; }
  `;
  root.appendChild(s);
  
  const ct = document.createElement("div");
  ct.className = "ct";
  
  const hdr = document.createElement("div");
  hdr.className = "hdr";
  if (view.phase === "play") {
    hdr.innerHTML = view.isZombie ? "🧟 ZOMBIE" : "👤 HUMAN";
  } else {
    hdr.innerHTML = "🎃 GAME OVER";
  }
  ct.appendChild(hdr);
  
  const msg = document.createElement("div");
  msg.className = "msg";
  msg.textContent = `R${view.round} | Alive: ${view.aliveCount} 👤  Zombies: ${view.zombieCount} 🧟 | ${Math.floor(view.msLeft / 1000)}s`;
  ct.appendChild(msg);
  
  if (view.phase === "play") {
    const grd = document.createElement("div");
    grd.className = "grd";
    
    for (let y = 0; y < view.gridSize; y++) {
      for (let x = 0; x < view.gridSize; x++) {
        const cel = document.createElement("div");
        cel.className = "cel";
        
        let here = null;
        for (const id in view.positions) {
          const p = view.positions[id];
          if (p.x === x && p.y === y) {
            here = id;
            break;
          }
        }
        
        if (here === view.me) {
          cel.classList.add(view.isZombie ? "zb" : "hm");
          cel.textContent = view.isZombie ? "🧟" : "👤";
        } else if (here && view.isZombie) {
          cel.textContent = "👤";
        } else if (here) {
          cel.textContent = "?";
        }
        
        grd.appendChild(cel);
      }
    }
    ct.appendChild(grd);
    
    const ctrl = document.createElement("div");
    ctrl.className = "ctrl";
    
    const up = document.createElement("button");
    up.className = "btn";
    up.textContent = "⬆";
    up.onclick = () => send({ type: "move", direction: "up" });
    
    const left = document.createElement("button");
    left.className = "btn";
    left.textContent = "⬅";
    left.onclick = () => send({ type: "move", direction: "left" });
    
    const down = document.createElement("button");
    down.className = "btn";
    down.textContent = "⬇";
    down.onclick = () => send({ type: "move", direction: "down" });
    
    const right = document.createElement("button");
    right.className = "btn";
    right.textContent = "➡";
    right.onclick = () => send({ type: "move", direction: "right" });
    
    ctrl.appendChild(document.createElement("div"));
    ctrl.appendChild(up);
    ctrl.appendChild(document.createElement("div"));
    ctrl.appendChild(left);
    ctrl.appendChild(down);
    ctrl.appendChild(right);
    
    ct.appendChild(ctrl);
  }
  
  const sb = document.createElement("div");
  sb.className = "sb";
  
  const sbt = document.createElement("div");
  sbt.style.marginBottom = "8px";
  sbt.style.fontWeight = "bold";
  sbt.textContent = "🏆 SCORES";
  sb.appendChild(sbt);
  
  for (const p of view.players) {
    const si = document.createElement("div");
    si.className = "si";
    si.innerHTML = `<span>${p.name}</span><span>${view.scores[p.id]}</span>`;
    sb.appendChild(si);
  }
  
  ct.appendChild(sb);
  
  if (view.phase === "over") {
    const pa = document.createElement("button");
    pa.className = "btn";
    pa.textContent = "PLAY AGAIN";
    pa.style.width = "100%";
    pa.style.marginTop = "15px";
    pa.onclick = () => send({ type: "playAgain" });
    ct.appendChild(pa);
  }
  
  root.appendChild(ct);
}
