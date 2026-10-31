// Spot check: does view(p1) expose other players' secret roles/words? Prints p1's view after a few steps.
import fs from "node:fs"; import vm from "node:vm"; import { toScript } from "./harness.mjs";
for (const f of process.argv.slice(2)) {
  const c = vm.createContext({}); const m = vm.runInContext(toScript(fs.readFileSync(f, "utf8")), c);
  let r = 7; const ctx = { now: 1e12, random: () => ((r = (r * 16807) % 2147483647) / 2147483647) };
  let s = m.init([1,2,3,4].map(i => ({ id: "p"+i, name: "P"+i })), ctx);
  const full = JSON.stringify(s); const v = JSON.stringify(m.view(JSON.parse(full), "p1"));
  const startTypes = ["start","startGame","start_game","begin"]; for (const t of startTypes) s = m.reduce(s, { type: t, playerId: "p1" }, ctx) ?? s;
  console.log("==", f, "\nSTATE:", JSON.stringify(s).slice(0, 600), "\nVIEW p2:", JSON.stringify(m.view(s, "p2")).slice(0, 600));
}
