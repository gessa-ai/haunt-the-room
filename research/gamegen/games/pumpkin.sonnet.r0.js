"use strict";

const TOOL_INFO = {
  knife: { e: "🔪", l: "Knife" },
  spoon: { e: "🥄", l: "Spoon" },
  marker: { e: "🖊️", l: "Marker" },
  candle: { e: "🕯️", l: "Candle" },
  seeds: { e: "🌱", l: "Seeds" },
  hand: { e: "✋", l: "Hands" },
};
const TOOL_KEYS = Object.keys(TOOL_INFO);
const STEPS = [
  { p: "Slice off the top! 🎃", t: "knife" },
  { p: "Scoop out the slimy guts!", t: "spoon" },
  { p: "Save the seeds!", t: "seeds" },
  { p: "Draw spooky eyes!", t: "marker" },
  { p: "Carve the eyes!", t: "knife" },
  { p: "Carve the nose!", t: "knife" },
  { p: "Carve a creepy mouth!", t: "knife" },
  { p: "Pop in the candle!", t: "candle" },
];
const RACE_MS = 60000;

function shuffle(arr, random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function genOptions(random, correct) {
  const wrongPool = TOOL_KEYS.filter((k) => k !== correct);
  const wrong = shuffle(wrongPool, random).slice(0, 3);
  return shuffle([correct, ...wrong], random);
}
function freshPlayer(p, spectator) {
  return {
    id: p.id,
    name: p.name,
    stepIndex: 0,
    mistakes: 0,
    finishTime: null,
    options: [],
    spectator: !!spectator,
  };
}

export const meta = { title: "Pumpkin Carving Speed Race 🎃🔪", minPlayers: 2, maxPlayers: 8, tickMs: 200 };

export function init(players, ctx) {
  return {
    phase: "lobby",
    now: ctx.now,
    deadline: null,
    startAt: null,
    players: players.map((p) => freshPlayer(p, false)),
  };
}

function resetToLobby(state) {
  state.phase = "lobby";
  state.deadline = null;
  state.startAt = null;
  for (const p of state.players) {
    p.stepIndex = 0;
    p.mistakes = 0;
    p.finishTime = null;
    p.options = [];
    p.spectator = false;
  }
}

export function reduce(state, action, ctx) {
  const { type, playerId } = action;

  if (type === "join") {
    if (state.players.some((p) => p.id === playerId)) return state;
    if (state.players.length >= 8) return state;
    state.players.push(freshPlayer({ id: playerId, name: action.name || "Carver" }, state.phase !== "lobby"));
    return state;
  }
  if (type === "leave") {
    state.players = state.players.filter((p) => p.id !== playerId);
    if (state.phase === "play") {
      const active = state.players.filter((p) => !p.spectator);
      if (active.length > 0 && active.every((p) => p.finishTime !== null)) {
        state.phase = "over";
      }
    }
    return state;
  }
  if (type === "tick") {
    state.now = ctx.now;
    if (state.phase === "play" && state.deadline !== null && ctx.now >= state.deadline) {
      state.phase = "over";
    }
    return state;
  }
  if (type === "start") {
    if (state.phase !== "lobby") return state;
    if (state.players.length < 2) return state;
    state.startAt = ctx.now;
    state.deadline = ctx.now + RACE_MS;
    state.phase = "play";
    for (const p of state.players) {
      p.stepIndex = 0;
      p.mistakes = 0;
      p.finishTime = null;
      p.spectator = false;
      p.options = STEPS.map((s) => genOptions(ctx.random, s.t));
    }
    return state;
  }
  if (type === "tap") {
    if (state.phase !== "play") return state;
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.spectator || player.finishTime !== null) return state;
    if (typeof action.tool !== "string" || !TOOL_KEYS.includes(action.tool)) return state;
    if (player.stepIndex >= STEPS.length) return state;
    const correct = STEPS[player.stepIndex].t;
    if (action.tool === correct) {
      player.stepIndex++;
      if (player.stepIndex >= STEPS.length) {
        player.finishTime = ctx.now - state.startAt;
      }
    } else {
      player.mistakes++;
    }
    const active = state.players.filter((p) => !p.spectator);
    if (active.length > 0 && active.every((p) => p.finishTime !== null)) {
      state.phase = "over";
    }
    return state;
  }
  if (type === "playAgain") {
    if (state.phase !== "over") return state;
    resetToLobby(state);
    return state;
  }
  return state;
}

export function view(state, playerId) {
  const me = state.players.find((p) => p.id === playerId) || null;
  const msLeft = state.phase === "play" && state.deadline !== null ? Math.max(0, state.deadline - state.now) : 0;
  const total = STEPS.length;

  const board = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    stepIndex: p.stepIndex,
    finished: p.finishTime !== null,
    finishTime: p.finishTime,
    mistakes: p.mistakes,
    spectator: p.spectator,
  }));

  let ranking = null;
  if (state.phase === "over") {
    const finished = board.filter((p) => p.finished).sort((a, b) => a.finishTime - b.finishTime);
    const unfinished = board
      .filter((p) => !p.finished)
      .sort((a, b) => b.stepIndex - a.stepIndex || a.mistakes - b.mistakes);
    ranking = [...finished, ...unfinished];
  }

  let myStep = null;
  if (me && state.phase === "play" && !me.spectator && me.finishTime === null && me.stepIndex < total) {
    myStep = {
      prompt: STEPS[me.stepIndex].p,
      options: (me.options[me.stepIndex] || []).map((k) => ({ key: k, e: TOOL_INFO[k].e, l: TOOL_INFO[k].l })),
    };
  }

  return {
    me: playerId,
    phase: state.phase,
    msLeft,
    total,
    canStart: state.players.length >= 2,
    myStepIndex: me ? me.stepIndex : 0,
    myMistakes: me ? me.mistakes : 0,
    myFinished: me ? me.finishTime !== null : false,
    mySpectator: me ? me.spectator : false,
    myStep,
    board,
    ranking,
  };
}

export function render(view, send, root) {
  root.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    .wrap { background:#0b0614; color:#f5f5f5; min-height:100vh; padding:12px; font-family:sans-serif; }
    h1 { color:#ff7518; font-size:22px; margin:4px 0 10px; }
    .bar { background:#2a1f3a; border-radius:8px; height:16px; overflow:hidden; margin:6px 0; }
    .fill { height:100%; background:#ff7518; transition:width .2s; }
    .timerfill { height:100%; background:#c1121f; transition:width .2s linear; }
    button { min-height:56px; font-size:18px; border:none; border-radius:10px; margin:6px 0; width:100%; font-weight:bold; cursor:pointer; }
    .start { background:#8a2be2; color:#fff; }
    .opt { background:#39ff14; color:#0b0614; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .card { background:#1c1226; border:2px solid #8a2be2; border-radius:12px; padding:10px; margin:6px 0; }
    .row { display:flex; justify-content:space-between; align-items:center; }
    .big { font-size:20px; font-weight:bold; color:#ff7518; }
    .small { font-size:14px; color:#ccc; }
    .rank1 { color:#ff7518; font-weight:bold; }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  const h = document.createElement("h1");
  h.textContent = "🎃 Pumpkin Carving Speed Race";
  wrap.appendChild(h);

  if (view.phase === "lobby") {
    const info = document.createElement("div");
    info.className = "small";
    info.textContent = view.canStart ? "Ready to carve! Any player can start." : "Waiting for more carvers (need 2+)...";
    wrap.appendChild(info);
    const btn = document.createElement("button");
    btn.className = "start";
    btn.textContent = "🔪 START RACE!";
    btn.disabled = !view.canStart;
    btn.onclick = () => send({ type: "start" });
    wrap.appendChild(btn);
  }

  if (view.phase === "play") {
    const tbar = document.createElement("div");
    tbar.className = "bar";
    const tfill = document.createElement("div");
    tfill.className = "timerfill";
    tfill.style.width = Math.max(0, (view.msLeft / 60000) * 100) + "%";
    tbar.appendChild(tfill);
    wrap.appendChild(tbar);
    const tlabel = document.createElement("div");
    tlabel.className = "small";
    tlabel.textContent = "⏱️ " + Math.ceil(view.msLeft / 1000) + "s left";
    wrap.appendChild(tlabel);

    if (view.mySpectator) {
      const s = document.createElement("div");
      s.className = "card";
      s.textContent = "👀 You're spectating this round. Next round you'll race!";
      wrap.appendChild(s);
    } else if (view.myFinished) {
      const s = document.createElement("div");
      s.className = "card";
      s.textContent = "🏆 You finished your pumpkin! Waiting on others...";
      wrap.appendChild(s);
    } else if (view.myStep) {
      const card = document.createElement("div");
      card.className = "card";
      const prog = document.createElement("div");
      prog.className = "bar";
      const pf = document.createElement("div");
      pf.className = "fill";
      pf.style.width = (view.myStepIndex / view.total) * 100 + "%";
      prog.appendChild(pf);
      card.appendChild(prog);
      const p = document.createElement("div");
      p.className = "big";
      p.textContent = view.myStep.prompt;
      card.appendChild(p);
      const m = document.createElement("div");
      m.className = "small";
      m.textContent = "Oops x" + view.myMistakes;
      card.appendChild(m);
      wrap.appendChild(card);

      const grid = document.createElement("div");
      grid.className = "grid";
      for (const o of view.myStep.options) {
        const b = document.createElement("button");
        b.className = "opt";
        b.textContent = o.e + " " + o.l;
        b.onclick = () => send({ type: "tap", tool: o.key });
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
    }

    const list = document.createElement("div");
    list.className = "card";
    const lt = document.createElement("div");
    lt.className = "small";
    lt.textContent = "👻 Everyone's progress:";
    list.appendChild(lt);
    for (const p of view.board) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "4px";
      const name = document.createElement("span");
      name.textContent = (p.finished ? "🏆 " : p.spectator ? "👀 " : "🎃 ") + p.name;
      const pct = document.createElement("span");
      pct.className = "small";
      pct.textContent = p.finished ? "Done!" : p.stepIndex + "/" + view.total;
      row.appendChild(name);
      row.appendChild(pct);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  if (view.phase === "over") {
    const title = document.createElement("div");
    title.className = "big";
    title.textContent = "🏁 Race Results!";
    wrap.appendChild(title);
    (view.ranking || []).forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "card";
      const name = document.createElement("div");
      name.className = i === 0 ? "rank1" : "";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎃";
      name.textContent = `${medal} ${p.name}`;
      const detail = document.createElement("div");
      detail.className = "small";
      detail.textContent = p.finished
        ? `Finished in ${(p.finishTime / 1000).toFixed(1)}s (${p.mistakes} oops)`
        : `Did not finish — ${p.stepIndex}/${view.total} steps`;
      row.appendChild(name);
      row.appendChild(detail);
      wrap.appendChild(row);
    });
    const btn = document.createElement("button");
    btn.className = "start";
    btn.textContent = "🔁 Carve Again!";
    btn.onclick = () => send({ type: "playAgain" });
    wrap.appendChild(btn);
  }
}
