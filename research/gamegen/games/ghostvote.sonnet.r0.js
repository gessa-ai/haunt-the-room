export const meta = { title: "Hidden Ghosts 👻", minPlayers: 3, maxPlayers: 8, tickMs: 1000 };

const NIGHT_MS = 30000, DAY_MS = 45000, REVEAL_MS = 6000;

function aliveIds(s){ return s.players.filter(p=>p.alive).map(p=>p.id); }
function ghostIds(s){ return s.players.filter(p=>p.alive && p.role==="ghost").map(p=>p.id); }
function villagerIds(s){ return s.players.filter(p=>p.alive && p.role==="villager").map(p=>p.id); }

function tally(votes, eligible, ctx){
  const counts = {};
  for(const v of eligible){ const t = votes[v]; if(t!==undefined) counts[t]=(counts[t]||0)+1; }
  let max=0, top=[];
  for(const k in counts){ if(counts[k]>max){max=counts[k];top=[k];} else if(counts[k]===max) top.push(k); }
  if(top.length===0) return null;
  if(top.length===1) return top[0];
  return top[Math.floor(ctx.random()*top.length)];
}

function resolveNight(state, ctx){
  const eligible = ghostIds(state);
  const victim = tally(state.nightVotes, eligible, ctx);
  state.lastVictim = victim || null;
  if(victim){ const p = state.players.find(p=>p.id===victim); if(p) p.alive=false; }
  state.nightVotes = {};
  state.phase = "nightReveal";
  state.revealDeadline = ctx.now + REVEAL_MS;
}
function resolveDay(state, ctx){
  const eligible = aliveIds(state);
  const elim = tally(state.dayVotes, eligible, ctx);
  state.lastEliminated = elim || null;
  if(elim){ const p = state.players.find(p=>p.id===elim); if(p) p.alive=false; }
  state.dayVotes = {};
  state.phase = "dayReveal";
  state.revealDeadline = ctx.now + REVEAL_MS;
}
function checkWin(state){
  if(state.phase==="lobby") return null;
  const g = ghostIds(state).length, v = villagerIds(state).length;
  if(g===0) return "villagers";
  if(v===0) return "ghosts";
  return null;
}

export function init(players, ctx){
  return {
    phase: "lobby", round: 0,
    players: players.map(p=>({ id:p.id, name:p.name, alive:true, role:null, left:false })),
    nightVotes: {}, dayVotes: {},
    nightDeadline: null, dayDeadline: null, revealDeadline: null,
    lastVictim: null, lastEliminated: null, winner: null, now: ctx.now
  };
}

export function reduce(state, action, ctx){
  switch(action.type){
    case "join": {
      if(state.players.find(p=>p.id===action.playerId)) return state;
      if(state.players.length>=8) return state;
      const name = (typeof action.name==="string" && action.name.trim()) ? action.name.trim().slice(0,16) : "Ghost";
      state.players.push({ id:action.playerId, name, alive: state.phase==="lobby", role:null, left:false });
      return state;
    }
    case "leave": {
      const idx = state.players.findIndex(p=>p.id===action.playerId);
      if(idx===-1) return state;
      if(state.phase==="lobby"){ state.players.splice(idx,1); return state; }
      const p = state.players[idx];
      p.alive = false; p.left = true;
      delete state.nightVotes[action.playerId];
      delete state.dayVotes[action.playerId];
      if(state.phase==="night"){
        const eligible = ghostIds(state);
        if(eligible.length===0 || eligible.every(id=>state.nightVotes[id]!==undefined)) resolveNight(state,ctx);
      } else if(state.phase==="day"){
        const eligible = aliveIds(state);
        if(eligible.length===0 || eligible.every(id=>state.dayVotes[id]!==undefined)) resolveDay(state,ctx);
      }
      return state;
    }
    case "start": {
      if(state.phase!=="lobby") return state;
      if(!state.players.find(p=>p.id===action.playerId)) return state;
      if(state.players.length<3) return state;
      const ids = state.players.map(p=>p.id);
      for(let i=ids.length-1;i>0;i--){ const j=Math.floor(ctx.random()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
      const ghostCount = Math.min(Math.max(1, Math.floor(state.players.length/3)), state.players.length-2);
      const ghostSet = new Set(ids.slice(0, ghostCount));
      for(const p of state.players){ p.alive=true; p.left=false; p.role = ghostSet.has(p.id)?"ghost":"villager"; }
      state.phase = "night"; state.round = 1;
      state.nightVotes = {}; state.dayVotes = {};
      state.lastVictim = null; state.lastEliminated = null; state.winner = null;
      state.nightDeadline = ctx.now + NIGHT_MS; state.dayDeadline = null; state.revealDeadline = null;
      return state;
    }
    case "voteNight": {
      if(state.phase!=="night") return state;
      const voter = state.players.find(p=>p.id===action.playerId);
      if(!voter || !voter.alive || voter.role!=="ghost") return state;
      const targetId = action.targetId;
      if(typeof targetId!=="string") return state;
      const target = state.players.find(p=>p.id===targetId);
      if(!target || !target.alive || targetId===action.playerId) return state;
      state.nightVotes[action.playerId] = targetId;
      const eligible = ghostIds(state);
      if(eligible.every(id=>state.nightVotes[id]!==undefined)) resolveNight(state,ctx);
      return state;
    }
    case "voteDay": {
      if(state.phase!=="day") return state;
      const voter = state.players.find(p=>p.id===action.playerId);
      if(!voter || !voter.alive) return state;
      const targetId = action.targetId;
      if(typeof targetId!=="string") return state;
      const target = state.players.find(p=>p.id===targetId);
      if(!target || !target.alive || targetId===action.playerId) return state;
      state.dayVotes[action.playerId] = targetId;
      const eligible = aliveIds(state);
      if(eligible.every(id=>state.dayVotes[id]!==undefined)) resolveDay(state,ctx);
      return state;
    }
    case "playAgain": {
      if(state.phase!=="over") return state;
      state.players = state.players.filter(p=>!p.left);
      for(const p of state.players){ p.alive=true; p.role=null; }
      state.phase = "lobby"; state.round = 0;
      state.nightVotes = {}; state.dayVotes = {};
      state.lastVictim = null; state.lastEliminated = null; state.winner = null;
      state.nightDeadline = null; state.dayDeadline = null; state.revealDeadline = null;
      return state;
    }
    case "tick": {
      state.now = ctx.now;
      if(state.phase==="night" && state.nightDeadline!=null && ctx.now>=state.nightDeadline){
        resolveNight(state,ctx);
      } else if(state.phase==="day" && state.dayDeadline!=null && ctx.now>=state.dayDeadline){
        resolveDay(state,ctx);
      } else if((state.phase==="nightReveal"||state.phase==="dayReveal") && state.revealDeadline!=null && ctx.now>=state.revealDeadline){
        const winner = checkWin(state);
        if(winner){ state.winner = winner; state.phase = "over"; }
        else if(state.phase==="nightReveal"){ state.phase = "day"; state.dayDeadline = ctx.now + DAY_MS; }
        else { state.round += 1; state.phase = "night"; state.nightDeadline = ctx.now + NIGHT_MS; }
      }
      return state;
    }
    default: return state;
  }
}

export function view(state, playerId){
  const me = state.players.find(p=>p.id===playerId);
  if(!me){
    return { me: playerId, phase: state.phase, notInGame: true,
      players: state.players.map(p=>({ name:p.name, alive:p.alive })) };
  }
  const showRole = p => {
    if(state.phase==="over") return p.role;
    if(p.id===playerId) return p.role;
    if(me.role==="ghost" && p.role==="ghost") return p.role;
    return null;
  };
  const v = {
    me: playerId, phase: state.phase, round: state.round,
    myRole: me.role, myAlive: me.alive,
    players: state.players.map(p=>({ id:p.id, name:p.name, alive:p.alive, isMe:p.id===playerId, role: showRole(p) })),
    canStart: state.phase==="lobby" && state.players.length>=3
  };
  let deadline = null;
  if(state.phase==="night") deadline = state.nightDeadline;
  else if(state.phase==="day") deadline = state.dayDeadline;
  else if(state.phase==="nightReveal"||state.phase==="dayReveal") deadline = state.revealDeadline;
  v.msLeft = deadline!=null ? Math.max(0, deadline - state.now) : null;

  if(state.phase==="night"){
    v.canVote = me.alive && me.role==="ghost";
    v.hasVoted = !!state.nightVotes[playerId];
    v.targets = v.canVote ? state.players.filter(p=>p.alive && p.id!==playerId).map(p=>({id:p.id,name:p.name})) : [];
    const eligible = ghostIds(state);
    v.votedCount = eligible.filter(id=>state.nightVotes[id]!==undefined).length;
    v.totalVoters = eligible.length;
  }
  if(state.phase==="day"){
    v.canVote = me.alive;
    v.hasVoted = !!state.dayVotes[playerId];
    v.targets = v.canVote ? state.players.filter(p=>p.alive && p.id!==playerId).map(p=>({id:p.id,name:p.name})) : [];
    const eligible = aliveIds(state);
    v.votedCount = eligible.filter(id=>state.dayVotes[id]!==undefined).length;
    v.totalVoters = eligible.length;
  }
  if(state.phase==="nightReveal"){
    const victim = state.players.find(p=>p.id===state.lastVictim);
    v.victimName = victim ? victim.name : null;
    v.victimRole = victim ? victim.role : null;
  }
  if(state.phase==="dayReveal"){
    const e = state.players.find(p=>p.id===state.lastEliminated);
    v.eliminatedName = e ? e.name : null;
    v.eliminatedRole = e ? e.role : null;
  }
  if(state.phase==="over") v.winner = state.winner;
  return v;
}

export function render(view, send, root){
  root.replaceChildren();
  const css = document.createElement('style');
  css.textContent = `
    *{box-sizing:border-box;font-family:sans-serif}
    .wrap{background:#0b0614;color:#f5f5f5;min-height:100%;padding:16px}
    .top{font-size:20px;font-weight:bold;color:#ff7518;margin-bottom:10px}
    button{min-height:56px;font-size:18px;width:100%;margin:6px 0;border:none;border-radius:10px;
      background:#8a2be2;color:#f5f5f5;font-weight:bold}
    button:disabled{background:#444;color:#999}
    .ghost-btn{background:#39ff14;color:#0b0614}
    .danger{background:#c1121f}
    .card{background:#1a1024;border-radius:10px;padding:10px;margin:6px 0}
    .players{display:flex;flex-wrap:wrap;gap:6px}
    .tag{padding:4px 8px;border-radius:8px;background:#2a1a3a;font-size:14px}
    .dead{opacity:0.4;text-decoration:line-through}
    .timer{font-size:16px;color:#8a2be2;margin:6px 0}
  `;
  root.appendChild(css);
  const wrap = document.createElement('div'); wrap.className='wrap'; root.appendChild(wrap);
  const top = document.createElement('div'); top.className='top'; wrap.appendChild(top);

  const roster = document.createElement('div'); roster.className='card';
  const rp = document.createElement('div'); rp.className='players';
  for(const p of view.players){
    const t = document.createElement('span');
    t.className = 'tag' + (p.alive?'':' dead');
    t.textContent = `${p.name}${p.role?` (${p.role==='ghost'?'👻':'🧑'})`:''}`;
    rp.appendChild(t);
  }
  roster.appendChild(rp); wrap.appendChild(roster);

  if(view.msLeft!=null){
    const timer = document.createElement('div'); timer.className='timer';
    timer.textContent = `⏳ ${Math.ceil(view.msLeft/1000)}s`;
    wrap.appendChild(timer);
  }

  if(view.notInGame){
    top.textContent = "👀 Spectating... wait for next game";
    return;
  }

  if(view.phase==="lobby"){
    top.textContent = "🎃 Waiting in the graveyard...";
    const btn = document.createElement('button');
    btn.textContent = view.canStart ? "🚀 Start Game" : "Need 3+ players";
    btn.disabled = !view.canStart;
    btn.onclick = ()=>send({type:"start"});
    wrap.appendChild(btn);
    return;
  }

  if(view.phase==="night"){
    if(view.canVote){
      top.textContent = "👻 Pick a victim...";
      if(view.hasVoted){
        const d=document.createElement('div'); d.className='card'; d.textContent="✅ Vote cast. Waiting for other ghosts...";
        wrap.appendChild(d);
      } else {
        for(const t of view.targets){
          const b = document.createElement('button'); b.className='ghost-btn';
          b.textContent = `🔪 ${t.name}`;
          b.onclick = ()=>send({type:"voteNight", targetId:t.id});
          wrap.appendChild(b);
        }
      }
      const c = document.createElement('div'); c.className='card'; c.textContent = `Ghosts voted: ${view.votedCount}/${view.totalVoters}`;
      wrap.appendChild(c);
    } else if(!view.myAlive){
      top.textContent = "💀 You're a spirit now... watch in silence";
    } else {
      top.textContent = "😴 Night falls. Close your eyes...";
      const d = document.createElement('div'); d.className='card'; d.textContent = "The ghosts are choosing a victim.";
      wrap.appendChild(d);
    }
    return;
  }

  if(view.phase==="nightReveal"){
    top.textContent = "🌅 Dawn breaks...";
    const d = document.createElement('div'); d.className='card';
    d.textContent = view.victimName ? `💀 ${view.victimName} (${view.victimRole}) was taken in the night!` : "😌 No one was taken last night.";
    wrap.appendChild(d);
    return;
  }

  if(view.phase==="day"){
    top.textContent = view.myAlive ? "☀️ Discuss, then vote to eliminate!" : "💀 You're a spirit now... watch in silence";
    if(view.canVote){
      if(view.hasVoted){
        const d=document.createElement('div'); d.className='card'; d.textContent="✅ Vote cast. Waiting for others...";
        wrap.appendChild(d);
      } else {
        for(const t of view.targets){
          const b = document.createElement('button'); b.className='danger';
          b.textContent = `⚖️ ${t.name}`;
          b.onclick = ()=>send({type:"voteDay", targetId:t.id});
          wrap.appendChild(b);
        }
      }
      const c = document.createElement('div'); c.className='card'; c.textContent = `Votes cast: ${view.votedCount}/${view.totalVoters}`;
      wrap.appendChild(c);
    }
    return;
  }

  if(view.phase==="dayReveal"){
    top.textContent = "🔥 The village has decided...";
    const d = document.createElement('div'); d.className='card';
    d.textContent = view.eliminatedName ? `⚰️ ${view.eliminatedName} was a ${view.eliminatedRole}!` : "🤷 No one was eliminated (tie).";
    wrap.appendChild(d);
    return;
  }

  if(view.phase==="over"){
    top.textContent = view.winner==="ghosts" ? "👻 GHOSTS WIN!" : "🧑 VILLAGERS WIN!";
    const btn = document.createElement('button');
    btn.textContent = "🔁 Play Again";
    btn.onclick = ()=>send({type:"playAgain"});
    wrap.appendChild(btn);
    return;
  }
}
