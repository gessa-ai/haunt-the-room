export const meta = {
  title: "Horror Movie Trivia",
  minPlayers: 2,
  maxPlayers: 8,
  tickMs: 100
};

export function init(players, ctx) {
  const questions = [
    { q: "What year was 'The Exorcist' released?", options: ["1970", "1973", "1976", "1979"], correct: 1 },
    { q: "Who directed 'A Nightmare on Elm Street'?", options: ["John Carpenter", "Wes Craven", "David Cronenberg", "Tobe Hooper"], correct: 1 },
    { q: "What is the killer's name in 'Friday the 13th'?", options: ["Michael Myers", "Jason Voorhees", "Freddy Krueger", "Pinhead"], correct: 1 },
    { q: "In 'The Shining', what hotel does the family stay in?", options: ["The Bates Motel", "The Overlook Hotel", "The Grand Hotel", "The Ritz"], correct: 1 },
    { q: "What is the main monster in 'Jaws'?", options: ["Great White Shark", "Kraken", "Leviathan", "Megalodon"], correct: 0 },
    { q: "Who plays Sidney Prescott in 'Scream'?", options: ["Sarah Michelle Gellar", "Neve Campbell", "Drew Barrymore", "Courteney Cox"], correct: 1 },
    { q: "What year was 'Halloween' released?", options: ["1975", "1978", "1981", "1984"], correct: 1 },
    { q: "In 'The Ring', how many days until you die?", options: ["3 days", "5 days", "7 days", "10 days"], correct: 2 },
    { q: "What horror franchise features Chucky?", options: ["Sinister", "Child's Play", "Puppet Master", "Gremlins"], correct: 1 },
    { q: "Who directed 'The Conjuring'?", options: ["James Wan", "Oren Peli", "Mike Flanagan", "Scott Beck"], correct: 0 }
  ];

  return {
    now: ctx.now,
    players: players.map(p => ({ id: p.id, name: p.name, score: 0 })),
    phase: "lobby",
    questionIdx: 0,
    questions,
    answers: {}
  };
}

export function reduce(state, action, ctx) {
  if (action.type === "tick") {
    state.now = ctx.now;
    if (state.phase === "play" && state.now > state.answerDeadline) {
      state.phase = "reveal";
    }
    if (state.phase === "reveal" && state.now > state.revealDeadline) {
      state.questionIdx++;
      if (state.questionIdx >= state.questions.length) {
        state.phase = "over";
      } else {
        state.phase = "play";
        state.answers = {};
        state.answerDeadline = ctx.now + 10000;
        state.revealDeadline = ctx.now + 13000;
      }
    }
    return state;
  }

  if (action.type === "start" && state.phase === "lobby") {
    state.phase = "play";
    state.answers = {};
    state.answerDeadline = ctx.now + 10000;
    state.revealDeadline = ctx.now + 13000;
    return state;
  }

  if (action.type === "answer" && state.phase === "play" && typeof action.answer === "number") {
    if (action.answer >= 0 && action.answer < 4 && !state.answers[action.playerId]) {
      state.answers[action.playerId] = action.answer;
      const q = state.questions[state.questionIdx];
      if (action.answer === q.correct) {
        const p = state.players.find(x => x.id === action.playerId);
        if (p) p.score++;
      }
    }
    return state;
  }

  if (action.type === "playAgain" && state.phase === "over") {
    state.phase = "lobby";
    state.questionIdx = 0;
    state.answers = {};
    state.players.forEach(p => p.score = 0);
    return state;
  }

  if (action.type === "join") {
    if (!state.players.some(p => p.id === action.playerId) && state.players.length < 8) {
      state.players.push({ id: action.playerId, name: action.name, score: 0 });
    }
    return state;
  }

  if (action.type === "leave") {
    state.players = state.players.filter(p => p.id !== action.playerId);
    delete state.answers[action.playerId];
    return state;
  }

  return state;
}

export function view(state, playerId) {
  const me = state.players.find(p => p.id === playerId);
  const q = state.questions[state.questionIdx];
  const msLeft = state.phase === "play" ? Math.max(0, state.answerDeadline - state.now) :
                 state.phase === "reveal" ? Math.max(0, state.revealDeadline - state.now) : 0;

  return {
    me: playerId,
    phase: state.phase,
    score: me?.score ?? 0,
    players: state.players.map(p => ({ name: p.name, score: p.score })),
    questionIdx: state.questionIdx,
    totalQuestions: state.questions.length,
    question: q?.q ?? "",
    options: q?.options ?? [],
    myAnswer: state.answers[playerId],
    correct: state.phase === "reveal" ? q?.correct : null,
    msLeft
  };
}

export function render(view, send, root) {
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `
    body { background: #0b0614; color: #f5f5f5; font-family: sans-serif; margin: 0; padding: 10px; }
    .header { background: #8a2be2; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 15px; }
    .score { font-size: 24px; font-weight: bold; }
    .question { background: #1a1a2e; padding: 15px; border-radius: 8px; margin: 15px 0; font-size: 18px; border-left: 4px solid #ff7518; }
    .options { display: grid; gap: 10px; margin: 15px 0; }
    button { background: #ff7518; color: #0b0614; border: none; padding: 15px; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; width: 100%; min-height: 56px; }
    button:hover:not(:disabled) { background: #39ff14; }
    button.correct { background: #39ff14; }
    button.wrong { background: #c1121f; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .scoreboard { background: #1a1a2e; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .player-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #8a2be2; }
    .player-row:last-child { border-bottom: none; }
    .info { text-align: center; margin: 10px 0; }
    .timer { color: #39ff14; font-weight: bold; }
  `;
  root.appendChild(style);

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `🎬 Horror Movie Trivia 🔪<div class="score">Score: ${view.score}</div>`;
  root.appendChild(header);

  if (view.phase === "lobby") {
    const title = document.createElement("div");
    title.style.textAlign = "center";
    title.style.fontSize = "20px";
    title.style.margin = "20px";
    title.textContent = "👻 Test your horror knowledge!";
    root.appendChild(title);
    
    const btn = document.createElement("button");
    btn.textContent = "🎬 Start Game";
    btn.onclick = () => send({ type: "start" });
    root.appendChild(btn);

    const board = document.createElement("div");
    board.className = "scoreboard";
    board.innerHTML = "<div style='font-weight: bold; margin-bottom: 10px;'>Players:</div>" +
      view.players.map(p => `<div class="player-row"><div>${p.name}</div><div>${p.score}</div></div>`).join("");
    root.appendChild(board);
  }

  if (view.phase === "play") {
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `Q${view.questionIdx + 1}/${view.totalQuestions} <span class="timer">⏱️ ${(view.msLeft / 1000).toFixed(1)}s</span>`;
    root.appendChild(info);

    const q = document.createElement("div");
    q.className = "question";
    q.textContent = view.question;
    root.appendChild(q);

    const opts = document.createElement("div");
    opts.className = "options";
    const answered = typeof view.myAnswer === "number";
    view.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.disabled = answered;
      btn.onclick = () => !answered && send({ type: "answer", answer: i });
      opts.appendChild(btn);
    });
    root.appendChild(opts);
  }

  if (view.phase === "reveal") {
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `<span class="timer">⏱️ ${(view.msLeft / 1000).toFixed(1)}s</span>`;
    root.appendChild(info);

    const q = document.createElement("div");
    q.className = "question";
    q.textContent = view.question;
    root.appendChild(q);

    const opts = document.createElement("div");
    opts.className = "options";
    view.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.disabled = true;
      if (i === view.correct) {
        btn.className = "correct";
        btn.textContent = "✅ " + opt;
      } else if (view.myAnswer === i) {
        btn.className = "wrong";
        btn.textContent = "❌ " + opt;
      } else {
        btn.textContent = opt;
      }
      opts.appendChild(btn);
    });
    root.appendChild(opts);

    const board = document.createElement("div");
    board.className = "scoreboard";
    const sorted = [...view.players].sort((a, b) => b.score - a.score);
    board.innerHTML = "<div style='font-weight: bold; margin-bottom: 10px;'>Scores:</div>" +
      sorted.map(p => `<div class="player-row"><div>${p.name}</div><div>${p.score}</div></div>`).join("");
    root.appendChild(board);
  }

  if (view.phase === "over") {
    const title = document.createElement("div");
    title.style.textAlign = "center";
    title.style.fontSize = "24px";
    title.style.margin = "20px";
    title.textContent = "🎃 Game Over! 🎃";
    root.appendChild(title);

    const board = document.createElement("div");
    board.className = "scoreboard";
    const sorted = [...view.players].sort((a, b) => b.score - a.score);
    board.innerHTML = "<div style='font-weight: bold; margin-bottom: 10px;'>Final Scores:</div>" +
      sorted.map((p, i) => `<div class="player-row"><div>${i === 0 ? "🏆 " : ""}${p.name}</div><div>${p.score}</div></div>`).join("");
    root.appendChild(board);

    const btn = document.createElement("button");
    btn.textContent = "👻 Play Again";
    btn.onclick = () => send({ type: "playAgain" });
    root.appendChild(btn);
  }
}
