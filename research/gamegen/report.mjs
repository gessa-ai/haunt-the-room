// Build RESULTS.md table from results.json
import fs from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const rows = JSON.parse(fs.readFileSync(dir + "results.json", "utf8")).sort((a, b) => a.slug.localeCompare(b.slug) || a.model.localeCompare(b.model));
const yn = (b) => (b ? "yes" : "no");
let md = "| prompt | model | gen s | lines | pass first try | repair s | pass after 1 repair | phases reached | first-try error (truncated) |\n|---|---|---|---|---|---|---|---|---|\n";
for (const r of rows) {
  const s = r.pass1 && r.stats1 ? r.stats1 : r.stats0;
  md += `| ${r.idea} | ${r.model} | ${r.genSeconds} | ${r.lines} | ${yn(r.pass0)} | ${r.repairSeconds ?? "-"} | ${r.model === "codex" && r.exit ? "n/a" : yn(r.pass1)} | ${(s?.phases || []).join(", ")} | ${(r.errors0?.[0] || "").replace(/\|/g, "/").slice(0, 110)} |\n`;
}
const by = (m) => rows.filter((r) => r.model === m);
for (const m of ["sonnet", "haiku"]) {
  const g = by(m); if (!g.length) continue;
  const secs = g.map((r) => r.genSeconds).sort((a, b) => a - b);
  md += `\n${m}: first-try ${g.filter((r) => r.pass0).length}/${g.length}, after repair ${g.filter((r) => r.pass1).length}/${g.length}, gen seconds median ${secs[Math.floor(secs.length / 2)]} (min ${secs[0]}, max ${secs.at(-1)})`;
}
fs.writeFileSync(dir + "RESULTS.md", md + "\n");
console.log(md);
