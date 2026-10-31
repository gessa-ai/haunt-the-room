export const meta = { title: "🎃 Horror Movie Trivia 🔪", minPlayers: 2, maxPlayers: 8, tickMs: 500 };

const QUESTIONS = [
  { q: "What's the name of the masked killer in 'Halloween'?", c: ["Jason Voorhees", "Michael Myers", "Freddy Krueger", "Ghostface"], a: 1 },
  { q: "In 'A Nightmare on Elm Street', Freddy Krueger attacks you in...", c: ["Your car", "Your dreams", "Your basement", "Your mirror"], a: 1 },
  { q: "What hotel does the Torrance family work at in 'The Shining'?", c: ["The Stanley", "The Overlook", "The Bates Motel", "The Timberline"], a: 1 },
  { q: "What is the name of the doll in 'Child's Play'?", c: ["Annabelle", "Billy", "Chucky", "Slappy"], a: 2
  },
  { q: "What killer wears a hockey mask?", c: ["Jason Voorhees", "Michael Myers", "Leatherface", "Pinhead"], a: 0 },
  { q: "'The Exorcist' is about a girl possessed by a...", c: ["Ghost", "Demon", "Witch", "Vampire"], a: 1 },
  { q: "What's the family business in 'The Texas Chain Saw Massacre'?", c: ["Farming", "Butchery/Meat", "Taxidermy", "Mining"], a: 1 },
  { q: "In 'Scream', what question does Ghostface ask on the phone?", c: ["'Are you alone?'", "'What's your favorite scary movie?'", "'Do you believe in ghosts?'", "'Is this real?'"], a: 1 },
  { q: "What creature is Dracula in most films?", c: ["Zombie", "Werewolf", "Vampire", "Demon"], a: 2 },
  { q: "'It' features a killer clown named...", c: ["Pennywise", "Giggles", "Bozo", "Twisty"], a: 0 },
  { q: "What ship sinks in 'Jaws'... wait, what terrorizes the beach in 'Jaws'?", c: ["A giant squid", "A shark", "A whale", "Piranhas"], a: 1 },
  { q: "In 'Get Out', what does the Armitage family do to their victims?", c: ["Transplant their brains", "Turn them into zombies", "Feed them to spirits", "Clone them"], a: 0 },
  { q: "'Hereditary' centers around a family cursed by a...", c: ["Witch's coven", "Vampire bloodline", "Ancient curse tablet", "Haunted painting"], a: 0 },
  { q: "What's the name of the cenobite leader in 'Hellraiser'?", c: ["Pinhead", "Pumpkinhead", "Candyman", "Jigsaw"], a: 0 },
  { q: "In 'Saw', what does Jigsaw force victims to do?", c: ["Escape a maze", "Play deadly games to survive", "Fight each other", "Confess sins"], a: 1 },
];

function shuffle(arr, random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function init(players, ctx) {
  return {
    phase: "lobby",
    now: ctx.now,
    players: players.map(p => ({ id: p.id, name: p.name, score: 0 })),
    order: [],
    qi: -1,
    answers: {},
    deadline: 0,
    lastCorrect: -1,
    lastGains: {},
  };
}

function startRound(state, ctx) {
  state.order = shuffle(QUESTIONS.map((_, i) => i), ctx.random).slice(0, Math.min(10, QUESTIONS.length));
  state.qi = 0;
  state.answers = {};
  state.lastGains = {};
  state.lastCorrect = -1;
  state.phase = "question";
  state.deadline = ctx.now + 15000;
}

function nextQuestion(state, ctx) {
  state.qi++;
  if (state.qi >= state.order.length) {
    state.phase = "over";
    return;
  }
  state.answers = {};
  state.phase = "question";
  state.deadline = ctx.now + 15000;
}

function scoreRound(state, ctx) {
  const qidx = state.order[state.qi];
  const correct = QUESTIONS[qidx].a;
  const gains = {};
  for (const [pid, choice] of Object.entries(state.answers)) {
    if (choice === correct) {
      const p = state.players.find(pp => pp.id === pid);
      if (p) {
        const timeLeft = Math.max(0, state.deadline - state.now);
        const bonus = Math.round((timeLeft / 15000) * 50);
        const gain = 50 + bonus;
        p.score += gain;
        gains[pid] = gain;
      }
    } else {
      gains[pid] = 0;
    }
  }
  state.lastGains = gains;
  state.lastCorrect = correct;
  state.phase = "reveal";
  state.deadline = ctx.now + 5000;
}

export function reduce(state, action, ctx) {
  if (action.type === "join") {
    if (state.players.find(p => p.id === action.playerId)) return state;
    if (state.players.length >= 8) return state;
    state.players.push({ id: action.playerId, name: action.name || "Player", score: 0 });
    return state;
  }
  if (action.type === "leave") {
    state.players = state.players.filter(p => p.id !== action.playerId);
    delete state.answers[action.playerId];
    return state;
  }
  if (action.type === "tick") {
    state.now = ctx.now;
    if (state.phase === "question" && state.now >= state.deadline) {
      scoreRound(state, ctx);
    } else if (state.phase === "reveal" && state.now >= state.deadline) {
      nextQuestion(state, ctx);
    }
    return state;
  }
  if (action.type === "start") {
    if (state.phase !== "lobby") return state;
    if (state.players.length < 2) return state;
    startRound(state, ctx);
    return state;
  }
  if (action.type === "answer") {
    if (state.phase !== "question") return state;
    if (!state.players.find(p => p.id === action.playerId)) return state;
    if (state.answers[action.playerId] !== undefined) return state;
    const choice = action.choice;
    if (typeof choice !== "number" || choice < 0 || choice > 3) return state;
    state.answers[action.playerId] = choice;
    const liveCount = state.players.length;
    if (Object.keys(state.answers).length >= liveCount) {
      scoreRound(state, ctx);
    }
    return state;
  }
  if (action.type === "playAgain") {
    if (state.phase !== "over") return state;
    state.players.forEach(p => (p.score = 0));
    startRound(state, ctx);
    return state;
  }
  return state;
}

export function view(state, playerId) {
  const base = {
    me: playerId,
    phase: state.phase,
    players: state.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    msLeft: Math.max(0, state.deadline - state.now),
  };
  if (state.phase === "lobby") return base;
  if (state.phase === "over") return base;
  const qidx = state.order[state.qi];
  const qdata = QUESTIONS[qidx];
  const answered = Object.keys(state.answers).length;
  if (state.phase === "question") {
    return {
      ...base,
      qNum: state.qi + 1,
      qTotal: state.order.length,
      question: qdata.q,
      choices: qdata.c,
      myAnswer: state.answers[playerId] !== undefined ? state.answers[playerId] : null,
      answeredCount: answered,
      totalCount: state.players.length,
    };
  }
  if (state.phase === "reveal") {
    return {
      ...base,
      qNum: state.qi + 1,
      qTotal: state.order.length,
      question: qdata.q,
      choices: qdata.c,
      correct: state.lastCorrect,
      myAnswer: state.answers[playerId] !== undefined ? state.answers[playerId] : null,
      myGain: state.lastGains[playerId] || 0,
    };
  }
  return base;
}

export function render(view, send, root) {
  const COLORS = { bg: "#0b0614", pumpkin: "#ff7518", purple: "#8a2be2", slime: "#39ff14", blood: "#c1121f", text: "#f5f5f5" };
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: 'Georgia', serif; }
    .wrap { background:${COLORS.bg}; color:${COLORS.text}; min-height:100vh; padding:16px; }
    .title { color:${COLORS.pumpkin}; text-align:center; font-size:22px; margin-bottom:10px; }
    .big-btn { width:100%; min-height:56px; font-size:18px; margin:6px 0; border-radius:12px; border:2px solid ${COLORS.purple}; background:#1a0f26; color:${COLORS.text}; }
    .big-btn:active { background:${COLORS.purple}; }
    .choice { width:100%; min-height:56px; font-size:18px; margin:6px 0; border-radius:12px; border:2px solid ${COLORS.pumpkin}; background:#1a0f26; color:${COLORS.text}; }
    .choice.picked { background:${COLORS.purple}; }
    .choice.correct { background:${COLORS.slime}; color:#000; border-color:${COLORS.slime}; }
    .choice.wrong { background:${COLORS.blood}; }
    .board { background:#1a0f26; border-radius:10px; padding:10px; margin:10px 0; }
    .row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #332244; }
    .bar { height:8px; background:#333; border-radius:4px; overflow:hidden; margin:8px 0; }
    .fill { height:100%; background:${COLORS.pumpkin}; }
    .status { text-align:center; font-size:18px; margin:10px 0; color:${COLORS.pumpkin}; }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "🎃 Horror Movie Trivia 🔪";
  wrap.appendChild(title);

  function scoreboard() {
    const board = document.createElement("div");
    board.className = "board";
    const sorted = view.players.slice().sort((a, b) => b.score - a.score);
    sorted.forEach(p => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${p.id === view.me ? "👻 " : ""}${p.name}</span><span>${p.score}</span>`;
      board.appendChild(row);
    });
    return board;
  }

  if (view.phase === "lobby") {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = `${view.players.length} ghouls waiting...`;
    wrap.appendChild(status);
    wrap.appendChild(scoreboard());
    const btn = document.createElement("button");
    btn.className = "big-btn";
    btn.textContent = "🦇 Start the Horror! 🦇";
    btn.onclick = () => send({ type: "start" });
    wrap.appendChild(btn);
  }

  if (view.phase === "question") {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = `Question ${view.qNum}/${view.qTotal} — ${view.answeredCount}/${view.totalCount} answered`;
    wrap.appendChild(status);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = `${Math.round((view.msLeft / 15000) * 100)}%`;
    bar.appendChild(fill);
    wrap.appendChild(bar);

    const q = document.createElement("div");
    q.style.fontSize = "20px";
    q.style.margin = "12px 0";
    q.style.textAlign = "center";
    q.textContent = view.question;
    wrap.appendChild(q);

    view.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice" + (view.myAnswer === i ? " picked" : "");
      b.textContent = c;
      b.disabled = view.myAnswer !== null;
      b.onclick = () => send({ type: "answer", choice: i });
      wrap.appendChild(b);
    });

    if (view.myAnswer !== null) {
      const waiting = document.createElement("div");
      waiting.className = "status";
      waiting.textContent = "Locked in! Waiting for other victims...";
      wrap.appendChild(waiting);
    }
  }

  if (view.phase === "reveal") {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = view.myGain > 0 ? `🔥 +${view.myGain} points!` : "💀 No points this time";
    wrap.appendChild(status);

    const q = document.createElement("div");
    q.style.fontSize = "18px";
    q.style.margin = "10px 0";
    q.style.textAlign = "center";
    q.textContent = view.question;
    wrap.appendChild(q);

    view.choices.forEach((c, i) => {
      const b = document.createElement("button");
      let cls = "choice";
      if (i === view.correct) cls += " correct";
      else if (i === view.myAnswer) cls += " wrong";
      b.className = cls;
      b.disabled = true;
      b.textContent = c + (i === view.correct ? " ✅" : "");
      wrap.appendChild(b);
    });

    wrap.appendChild(scoreboard());
  }

  if (view.phase === "over") {
    const status = document.createElement("div");
    status.className = "status";
    const sorted = view.players.slice().sort((a, b) => b.score - a.score);
    status.textContent = sorted.length ? `🏆 ${sorted[0].name} survives the night! 🏆` : "Game Over";
    wrap.appendChild(status);
    wrap.appendChild(scoreboard());
    const btn = document.createElement("button");
    btn.className = "big-btn";
    btn.textContent = "🔄 Play Again";
    btn.onclick = () => send({ type: "playAgain" });
    wrap.appendChild(btn);
  }
}
