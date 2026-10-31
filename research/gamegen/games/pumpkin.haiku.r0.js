export const meta = {
  title: "🎃 Pumpkin Carving Race",
  minPlayers: 2,
  maxPlayers: 8
};

export function init(players, ctx) {
  return {
    phase: "lobby",
    round: 1,
    players: players.map(p => ({ ...p, score: 0 })),
    carving: players.map(p => ({
      playerId: p.id,
      regionIndex: 0,
      regionProgress: 0
    }))
  };
}

const REGIONS = ["Left Eye 👁️", "Right Eye 👁️", "Nose 👃", "Mouth 👄", "Chin 🧔"];
const TAPS_PER_REGION = 3;

export function reduce(state, action, ctx) {
  if (action.type === "start" && state.phase === "lobby") {
    state.phase = "carving";
    state.carving = state.players.map(p => ({
      playerId: p.id,
      regionIndex: 0,
      regionProgress: 0
    }));
  }

  if (action.type === "carve" && state.phase === "carving") {
    const carving = state.carving.find(c => c.playerId === action.playerId);
    if (!carving) return state;

    carving.regionProgress++;

    if (carving.regionProgress >= TAPS_PER_REGION) {
      carving.regionIndex++;
      carving.regionProgress = 0;

      if (carving.regionIndex >= REGIONS.length) {
        const playerIdx = state.players.findIndex(p => p.id === action.playerId);
        if (playerIdx !== -1) state.players[playerIdx].score++;
        state.phase = "over";
        state.winner = action.playerId;
      }
    }
  }

  if (action.type === "playAgain" && state.phase === "over") {
    state.phase = "carving";
    state.round++;
    state.carving = state.players.map(p => ({
      playerId: p.id,
      regionIndex: 0,
      regionProgress: 0
    }));
  }

  if (action.type === "join") {
    if (!state.players.find(p => p.id === action.playerId)) {
      state.players.push({ id: action.playerId, name: action.name, score: 0 });
      if (state.phase === "carving") {
        state.carving.push({ playerId: action.playerId, regionIndex: 0, regionProgress: 0 });
      }
    }
  }

  if (action.type === "leave") {
    state.players = state.players.filter(p => p.id !== action.playerId);
    state.carving = state.carving.filter(c => c.playerId !== action.playerId);
  }

  return state;
}

export function view(state, playerId) {
  const myCarving = state.carving.find(c => c.playerId === playerId);
  const allCarvings = state.carving.map(c => {
    const player = state.players.find(p => p.id === c.playerId);
    return {
      playerId: c.playerId,
      name: player?.name || "?",
      regionIndex: c.regionIndex,
      regionProgress: c.regionProgress,
      isMe: c.playerId === playerId
    };
  });

  const winner = state.winner ? state.players.find(p => p.id === state.winner) : null;

  return {
    me: playerId,
    phase: state.phase,
    round: state.round,
    carvings: allCarvings,
    myRegion: myCarving ? REGIONS[myCarving.regionIndex] : null,
    myProgress: myCarving ? myCarving.regionProgress : 0,
    players: state.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    winner: winner ? winner.name : null
  };
}

export function render(view, send, root) {
  root.replaceChildren();

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .container { background: #0b0614; color: #f5f5f5; min-height: 100vh; padding: 20px; }
    .header { text-align: center; font-size: 24px; margin-bottom: 20px; font-weight: bold; }
    .scoreboard { margin-bottom: 20px; }
    .player-score { padding: 12px; margin: 5px 0; background: #2a1a40; border-radius: 8px; border-left: 4px solid #ff7518; }
    .pumpkin { font-size: 80px; text-align: center; margin: 20px 0; animation: bounce 0.6s infinite; }
    @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .region { font-size: 20px; margin: 10px 0; text-align: center; color: #39ff14; font-weight: bold; }
    .progress { width: 100%; height: 20px; background: #39ff14; border-radius: 10px; margin: 10px 0; overflow: hidden; border: 2px solid #8a2be2; }
    .progress-bar { height: 100%; background: #ff7518; width: 0%; transition: width 0.15s ease-out; }
    .button { width: 100%; padding: 20px; margin: 10px 0; font-size: 20px; background: #ff7518; color: #0b0614; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; min-height: 56px; }
    .button:active { background: #e65a00; transform: scale(0.98); }
    .leaderboard { background: #2a1a40; padding: 15px; border-radius: 8px; margin-top: 20px; border: 2px solid #8a2be2; }
    .leaderboard h3 { color: #39ff14; margin-top: 0; }
    .status { text-align: center; margin: 10px 0; font-size: 16px; }
    .racer { padding: 8px; margin: 5px 0; background: #1a0a30; border-radius: 4px; border-left: 3px solid #39ff14; }
    .racer.me { background: #2a1a40; border-left-color: #ff7518; }
  `;
  root.appendChild(style);

  const container = document.createElement("div");
  container.className = "container";

  if (view.phase === "lobby") {
    container.innerHTML = `
      <div class="header">🎃 PUMPKIN CARVING RACE 🎃</div>
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 100px;">🎃</div>
        <div style="margin: 20px 0; font-size: 18px;">Get ready to carve!</div>
      </div>
    `;

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "scoreboard";
    view.players.forEach(p => {
      const pDiv = document.createElement("div");
      pDiv.className = "player-score";
      pDiv.textContent = `${p.name}: ${p.score} wins 🏆`;
      scoreDiv.appendChild(pDiv);
    });
    container.appendChild(scoreDiv);

    const startBtn = document.createElement("button");
    startBtn.className = "button";
    startBtn.textContent = "🚀 START CARVING";
    startBtn.onclick = () => send({ type: "start" });
    container.appendChild(startBtn);
  }

  if (view.phase === "carving") {
    const headerDiv = document.createElement("div");
    headerDiv.className = "header";
    headerDiv.textContent = `ROUND ${view.round}: CARVE IT UP!`;
    container.appendChild(headerDiv);

    const pumpkinDiv = document.createElement("div");
    pumpkinDiv.className = "pumpkin";
    pumpkinDiv.textContent = "🎃";
    container.appendChild(pumpkinDiv);

    const myCarving = view.carvings.find(c => c.isMe);
    if (myCarving) {
      const regionDiv = document.createElement("div");
      regionDiv.className = "region";
      regionDiv.textContent = `Current: ${view.myRegion}`;
      container.appendChild(regionDiv);

      const progressDiv = document.createElement("div");
      progressDiv.className = "progress";
      const bar = document.createElement("div");
      bar.className = "progress-bar";
      const pct = (view.myProgress / 3) * 100;
      bar.style.width = pct + "%";
      progressDiv.appendChild(bar);
      container.appendChild(progressDiv);

      const statusDiv = document.createElement("div");
      statusDiv.className = "status";
      statusDiv.textContent = `${myCarving.regionIndex + 1}/${REGIONS.length} regions carved`;
      container.appendChild(statusDiv);
    }

    const carveBtn = document.createElement("button");
    carveBtn.className = "button";
    carveBtn.style.fontSize = "40px";
    carveBtn.style.padding = "40px 20px";
    carveBtn.textContent = "⚔️ CARVE! ⚔️";
    carveBtn.onclick = () => send({ type: "carve" });
    container.appendChild(carveBtn);

    const leaderboard = document.createElement("div");
    leaderboard.className = "leaderboard";
    leaderboard.innerHTML = "<h3>Race Status:</h3>";
    view.carvings.forEach(c => {
      const pDiv = document.createElement("div");
      pDiv.className = c.isMe ? "racer me" : "racer";
      const bar = "█".repeat(c.regionIndex) + "░".repeat(REGIONS.length - c.regionIndex);
      pDiv.textContent = `${c.isMe ? "YOU" : c.name}: ${bar}`;
      leaderboard.appendChild(pDiv);
    });
    container.appendChild(leaderboard);
  }

  if (view.phase === "over") {
    const headerDiv = document.createElement("div");
    headerDiv.className = "header";
    headerDiv.style.fontSize = "40px";
    headerDiv.style.marginTop = "40px";
    headerDiv.textContent = `🏆 ${view.winner} WINS! 🏆`;
    container.appendChild(headerDiv);

    const celebDiv = document.createElement("div");
    celebDiv.style.textAlign = "center";
    celebDiv.style.margin = "50px 0";
    celebDiv.style.fontSize = "100px";
    celebDiv.textContent = "🎃✨";
    container.appendChild(celebDiv);

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "scoreboard";
    view.players.forEach(p => {
      const pDiv = document.createElement("div");
      pDiv.className = "player-score";
      pDiv.textContent = `${p.name}: ${p.score} wins`;
      if (p.name === view.winner) {
        pDiv.style.background = "#ff7518";
        pDiv.style.color = "#0b0614";
        pDiv.style.fontWeight = "bold";
      }
      scoreDiv.appendChild(pDiv);
    });
    container.appendChild(scoreDiv);

    const againBtn = document.createElement("button");
    againBtn.className = "button";
    againBtn.textContent = "🔄 PLAY AGAIN";
    againBtn.onclick = () => send({ type: "playAgain" });
    container.appendChild(againBtn);
  }

  root.appendChild(container);
}
