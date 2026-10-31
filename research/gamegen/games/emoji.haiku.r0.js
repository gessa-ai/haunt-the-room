export const meta = { title: "🎃 Costume Drawing 🎃", minPlayers: 2, maxPlayers: 8 };

const COSTUMES = ["vampire", "witch", "ghost", "pumpkin", "skeleton", "zombie", "mummy", "pirate", "superhero", "alien", "clown", "astronaut", "devil", "angel", "werewolf"];

export function init(players, ctx) {
  return {
    phase: "lobby",
    players: players.map(p => ({ ...p, score: 0 })),
    currentDrawerIndex: 0,
    costume: null,
    drawing: "",
    guesses: {},
    round: 0,
    totalRounds: Math.min(Math.max(players.length, 2), 3)
  };
}

export function reduce(state, action, ctx) {
  if (action.type === "join") {
    if (state.players.find(p => p.id === action.playerId) || state.players.length >= 8) return state;
    state.players.push({ id: action.playerId, name: action.name, score: 0 });
    return state;
  }
  if (action.type === "leave") {
    state.players = state.players.filter(p => p.id !== action.playerId);
    if (state.currentDrawerIndex >= state.players.length && state.players.length > 0) state.currentDrawerIndex %= state.players.length;
    return state;
  }
  if (action.type === "startGame") {
    if (state.phase !== "lobby" || state.players.length < 2) return state;
    state.phase = "drawing";
    state.round = 1;
    state.costume = COSTUMES[Math.floor(ctx.random() * COSTUMES.length)];
    state.drawing = "";
    state.guesses = {};
    state.currentDrawerIndex = 0;
    return state;
  }
  if (action.type === "submitDrawing") {
    if (state.phase !== "drawing" || action.playerId !== state.players[state.currentDrawerIndex].id) return state;
    if (typeof action.drawing !== "string" || !action.drawing) return state;
    state.drawing = action.drawing;
    state.phase = "guessing";
    state.guesses = {};
    return state;
  }
  if (action.type === "submitGuess") {
    if (state.phase !== "guessing" || action.playerId === state.players[state.currentDrawerIndex].id) return state;
    if (typeof action.guess !== "string") return state;
    state.guesses[action.playerId] = action.guess;
    return state;
  }
  if (action.type === "reveal") {
    if (state.phase !== "guessing") return state;
    const cLower = state.costume.toLowerCase();
    for (const pid of Object.keys(state.guesses)) {
      const gLower = state.guesses[pid].toLowerCase();
      if (gLower.includes(cLower) || cLower.includes(gLower)) {
        const p = state.players.find(pl => pl.id === pid);
        if (p) p.score += 10;
      }
    }
    const drawer = state.players[state.currentDrawerIndex];
    const correct = Object.values(state.guesses).filter(g => {
      const gL = g.toLowerCase();
      return gL.includes(cLower) || cLower.includes(gL);
    }).length;
    if (correct > 0 && drawer) drawer.score += 5;
    state.phase = "reveal";
    return state;
  }
  if (action.type === "nextRound") {
    if (state.phase !== "reveal") return state;
    state.currentDrawerIndex = (state.currentDrawerIndex + 1) % state.players.length;
    state.round += 1;
    if (state.round > state.totalRounds) {
      state.phase = "over";
    } else {
      state.costume = COSTUMES[Math.floor(ctx.random() * COSTUMES.length)];
      state.drawing = "";
      state.guesses = {};
      state.phase = "drawing";
    }
    return state;
  }
  if (action.type === "playAgain") {
    if (state.phase !== "over") return state;
    state.phase = "lobby";
    state.players = state.players.map(p => ({ ...p, score: 0 }));
    state.round = 0;
    state.costume = null;
    state.drawing = "";
    state.guesses = {};
    state.currentDrawerIndex = 0;
    return state;
  }
  return state;
}

export function view(state, playerId) {
  const isDrawer = state.phase !== "lobby" && state.players[state.currentDrawerIndex]?.id === playerId;
  const result = {
    phase: state.phase,
    me: playerId,
    players: state.players,
    currentDrawerName: state.players[state.currentDrawerIndex]?.name,
    isDrawer,
    round: state.round,
    totalRounds: state.totalRounds
  };
  if (state.phase === "drawing") result.costume = isDrawer ? state.costume : null;
  if (state.phase === "guessing" || state.phase === "reveal") result.drawing = state.drawing;
  if (state.phase === "guessing" || state.phase === "reveal") result.guesses = state.guesses;
  if (state.phase === "reveal") result.costume = state.costume;
  return result;
}

export function render(view, send, root) {
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `body{margin:0;padding:12px;font-family:Arial,sans-serif;background:#0b0614;color:#f5f5f5}.container{max-width:600px;margin:0 auto}.header{text-align:center;margin-bottom:16px}.title{font-size:24px;font-weight:bold}.phase-info{font-size:18px;color:#39ff14;margin-bottom:8px}.scoreboard{background:#1a0f2e;padding:12px;border-radius:8px;margin-bottom:16px}.player-score{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #8a2be2}.drawing-display{background:#1a0f2e;padding:20px;border-radius:8px;margin:16px 0;text-align:center;font-size:48px;word-wrap:break-word;min-height:80px}input{width:100%;padding:12px;font-size:18px;border:2px solid #8a2be2;background:#0b0614;color:#f5f5f5;border-radius:4px;box-sizing:border-box;margin-bottom:8px}button{width:100%;padding:12px;margin-top:8px;font-size:18px;background:#ff7518;color:#0b0614;border:none;border-radius:4px;cursor:pointer;font-weight:bold}button:hover{background:#c1121f}.guesses-list{background:#1a0f2e;padding:12px;border-radius:8px;margin-top:12px}.guess-item{padding:8px;border-bottom:1px solid #8a2be2}.correct{color:#39ff14}.center-text{text-align:center;margin-top:16px}.costume-prompt{font-size:20px;font-weight:bold;color:#ff7518;margin:16px 0;text-align:center}`;
  root.appendChild(style);
  const container = document.createElement("div");
  container.className = "container";
  const header = document.createElement("div");
  header.className = "header";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "🎃 Costume Drawing 🎃";
  header.appendChild(title);
  const phaseInfo = document.createElement("div");
  phaseInfo.className = "phase-info";
  if (view.phase === "lobby") phaseInfo.textContent = "👻 Waiting to start...";
  else if (view.phase === "drawing") phaseInfo.textContent = `📝 ${view.currentDrawerName} draws (${view.round}/${view.totalRounds})`;
  else if (view.phase === "guessing") phaseInfo.textContent = "🤔 Guess the costume!";
  else if (view.phase === "reveal") phaseInfo.textContent = `✨ Answer: ${view.costume}`;
  else phaseInfo.textContent = "🎉 Game Over!";
  header.appendChild(phaseInfo);
  container.appendChild(header);
  const scoreboard = document.createElement("div");
  scoreboard.className = "scoreboard";
  view.players.forEach(p => {
    const item = document.createElement("div");
    item.className = "player-score";
    const name = document.createElement("span");
    name.textContent = (p.id === view.me ? "👤 " : "") + p.name;
    const score = document.createElement("span");
    score.textContent = `${p.score} pts`;
    item.appendChild(name);
    item.appendChild(score);
    scoreboard.appendChild(item);
  });
  container.appendChild(scoreboard);
  if (view.phase === "lobby") {
    const btn = document.createElement("button");
    btn.textContent = "🎮 Start Game";
    btn.onclick = () => send({ type: "startGame" });
    container.appendChild(btn);
  } else if (view.phase === "drawing") {
    if (view.isDrawer) {
      const prompt = document.createElement("div");
      prompt.className = "costume-prompt";
      prompt.textContent = `🎨 Draw: ${view.costume}`;
      container.appendChild(prompt);
      const input = document.createElement("input");
      input.placeholder = "Use emoji only... 🧛‍♂️🌙🎩";
      const btn = document.createElement("button");
      btn.textContent = "✅ Submit Drawing";
      btn.onclick = () => { if (input.value.trim()) send({ type: "submitDrawing", drawing: input.value.trim() }); };
      container.appendChild(input);
      container.appendChild(btn);
    } else {
      const w = document.createElement("div");
      w.className = "center-text";
      w.textContent = "⏳ Waiting for the drawing...";
      container.appendChild(w);
    }
  } else if (view.phase === "guessing") {
    const drawing = document.createElement("div");
    drawing.className = "drawing-display";
    drawing.textContent = view.drawing || "?";
    container.appendChild(drawing);
    if (!view.isDrawer) {
      const input = document.createElement("input");
      input.placeholder = "What costume is it?";
      const btn = document.createElement("button");
      btn.textContent = "📤 Submit Guess";
      btn.onclick = () => { if (input.value.trim()) { send({ type: "submitGuess", guess: input.value.trim() }); input.value = ""; } };
      container.appendChild(input);
      container.appendChild(btn);
    } else {
      const w = document.createElement("div");
      w.className = "center-text";
      w.textContent = "👀 Waiting for guesses...";
      container.appendChild(w);
    }
    if (Object.keys(view.guesses).length > 0) {
      const guesses = document.createElement("div");
      guesses.className = "guesses-list";
      const title = document.createElement("strong");
      title.textContent = "Guesses: ";
      guesses.appendChild(title);
      Object.entries(view.guesses).forEach(([pid, guess]) => {
        const item = document.createElement("div");
        item.className = "guess-item";
        const player = view.players.find(p => p.id === pid);
        item.textContent = `${player?.name}: ${guess}`;
        guesses.appendChild(item);
      });
      container.appendChild(guesses);
    }
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "⏭️ Reveal Answer";
    nextBtn.onclick = () => send({ type: "reveal" });
    container.appendChild(nextBtn);
  } else if (view.phase === "reveal") {
    const drawing = document.createElement("div");
    drawing.className = "drawing-display";
    drawing.textContent = view.drawing;
    container.appendChild(drawing);
    if (Object.keys(view.guesses).length > 0) {
      const guesses = document.createElement("div");
      guesses.className = "guesses-list";
      const title = document.createElement("strong");
      title.textContent = "Guesses: ";
      guesses.appendChild(title);
      Object.entries(view.guesses).forEach(([pid, guess]) => {
        const item = document.createElement("div");
        item.className = "guess-item";
        const cL = view.costume.toLowerCase();
        const gL = guess.toLowerCase();
        const isCorrect = gL.includes(cL) || cL.includes(gL);
        if (isCorrect) item.classList.add("correct");
        const player = view.players.find(p => p.id === pid);
        item.textContent = `${player?.name}: ${guess} ${isCorrect ? "✅" : ""}`;
        guesses.appendChild(item);
      });
      container.appendChild(guesses);
    }
    const nextBtn = document.createElement("button");
    nextBtn.textContent = view.round >= view.totalRounds ? "🏁 See Results" : "➡️ Next Round";
    nextBtn.onclick = () => send({ type: "nextRound" });
    container.appendChild(nextBtn);
  } else if (view.phase === "over") {
    const sorted = [...view.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const result = document.createElement("div");
    result.style.textAlign = "center";
    result.style.marginTop = "24px";
    const winnerText = document.createElement("div");
    winnerText.style.fontSize = "24px";
    winnerText.style.marginBottom = "16px";
    winnerText.textContent = `🏆 ${winner.name} wins!`;
    result.appendChild(winnerText);
    const allScores = document.createElement("div");
    allScores.style.marginBottom = "24px";
    sorted.forEach((p, i) => {
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${p.name}: ${p.score} pts`;
      allScores.appendChild(line);
    });
    result.appendChild(allScores);
    const btn = document.createElement("button");
    btn.textContent = "🎮 Play Again";
    btn.onclick = () => send({ type: "playAgain" });
    result.appendChild(btn);
    container.appendChild(result);
  }
  root.appendChild(container);
}
