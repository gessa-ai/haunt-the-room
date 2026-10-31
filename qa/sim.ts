// L13 balance model: the House's reveal rules (actors/src/actors.ts) + L8's bot hide policy (bots/src/brain.ts) +
// hunters voting toward the crowd (as measured: AI votes track live counts). Monte Carlo ghost win rate per rule set.
//   bun qa/sim.ts [--n 100] [--beats 5] [--rounds 3000]
const arg = (k: string, d: number) => (process.argv.includes(`--${k}`) ? Number(process.argv[process.argv.indexOf(`--${k}`) + 1]) : d)
const N = arg("n", 100), BEATS = arg("beats", 5), ROUNDS = arg("rounds", 3000)
const R = 6

function weighted(ws: number[]): number {
  let p = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ws.length; i++) if ((p -= ws[i]) <= 0) return i
  return ws.length - 1
}
function round(frac: number, toWin: number, sweeps: number, noise: number, capDiv = 0): { win: boolean; caughtShare: number; firstPoss: number } {
  const out = new Array(N).fill(-1) // beat a ghost was caught (out for the next beat)
  const possessed = new Set<number>()
  let caughtTot = 0, firstPoss = 0
  const cap = capDiv ? Math.max(3, Math.ceil(N / capDiv)) : 1e9
  const threshold = capDiv ? Math.ceil(cap * frac) : Math.max(3, Math.ceil(N * frac))
  for (let beat = 1; beat <= BEATS; beat++) {
    const counts = new Array(R).fill(0)
    const room = new Array(N).fill(-1)
    const order = [...Array(N).keys()].sort(() => Math.random() - 0.5)
    for (const g of order) {
      if (out[g] === beat - 1 && beat > 1) continue
      const r = Math.random()
      let pick: number
      if (r < 0.2) pick = Math.floor(Math.random() * R)
      else if (r < 0.6) pick = weighted(counts.map((c) => 1 / (1 + c) ** 2))
      else pick = weighted(counts.map((c, i) => (possessed.has(i) ? 0.5 : 1) * (1 + Math.min(c, 1.5 * threshold))))
      if (counts[pick] >= cap) { const open = [...Array(R).keys()].filter((i) => counts[i] < cap); if (!open.length) { out[g] = beat; continue } pick = open[Math.floor(Math.random() * open.length)] }
      room[g] = pick
      counts[pick]++
    }
    // 4 hunters vote: each picks the most crowded room with prob 1-noise (2nd most crowded if taken), else random
    const rank = [...Array(R).keys()].sort((a, b) => counts[b] - counts[a])
    const votes = new Array(R).fill(0)
    for (let h = 0; h < 4; h++) votes[Math.random() < noise ? Math.floor(Math.random() * R) : rank[h % 2]]++
    const swept = [...Array(R).keys()].sort((a, b) => votes[b] - votes[a] || counts[b] - counts[a]).slice(0, sweeps)
    let caught = 0
    for (let g = 0; g < N; g++) if (room[g] >= 0 && swept.includes(room[g])) { out[g] = beat; caught++ }
    caughtTot += caught / N
    for (const s of swept) possessed.delete(s)
    for (let i = 0; i < R; i++) if (!swept.includes(i) && counts[i] >= threshold) possessed.add(i)
    if (!firstPoss && possessed.size) firstPoss = beat
  }
  return { win: possessed.size >= toWin, caughtShare: caughtTot / BEATS, firstPoss }
}
if (process.argv.includes("--chairs")) {
  console.log(`CHAIRS: cap = ceil(n / capDiv), threshold = ceil(cap * f); n ${N}, beats ${BEATS}`)
  console.log("capDiv  f     toWin | ghosts win  caught/beat")
  for (const capDiv of [4, 5, 6]) for (const f of [0.75, 0.6, 0.5]) for (const toWin of [3, 2]) {
    let w = 0, c = 0
    for (let i = 0; i < ROUNDS; i++) { const r = round(f, toWin, 2, 0.25, capDiv); w += +r.win; c += r.caughtShare }
    console.log(`${capDiv}       ${f.toFixed(2)}  ${toWin}     | ${(100 * w / ROUNDS).toFixed(0).padStart(3)}%        ${(c / ROUNDS).toFixed(2)}`)
  }
  process.exit(0)
}
console.log(`n ${N}, beats ${BEATS}, ${ROUNDS} rounds per row; hunter noise = chance a vote ignores the counts`)
console.log("frac  win  sweeps noise | ghosts win  caught/beat  first possession beat")
for (const sweeps of [2, 1])
  for (const toWin of [3, 2])
    for (const frac of [0.15, 0.12, 0.1, 0.08])
      for (const noise of [0.1, 0.4]) {
        let w = 0, c = 0, f = 0
        for (let i = 0; i < ROUNDS; i++) { const r = round(frac, toWin, sweeps, noise); w += +r.win; c += r.caughtShare; f += r.firstPoss || BEATS + 1 }
        console.log(`${frac.toFixed(2)}  ${toWin}    ${sweeps}      ${noise}  | ${(100 * w / ROUNDS).toFixed(0).padStart(3)}%        ${(c / ROUNDS).toFixed(2)}         ${(f / ROUNDS).toFixed(1)}`)
      }
