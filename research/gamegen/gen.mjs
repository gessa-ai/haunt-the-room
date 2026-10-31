// Generate games with an LLM CLI, playtest, one auto-repair round. Usage: node gen.mjs [gen|test]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { playtest } from "./harness.mjs";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const GAMES = path.join(DIR, "games");
const SYS = path.join(DIR, "SYSTEM_PROMPT.md");
fs.mkdirSync(GAMES, { recursive: true });
fs.mkdirSync(path.join(DIR, ".cwd"), { recursive: true });

export const PROMPTS = [
  ["pumpkin", "pumpkin carving speed race"],
  ["ghostvote", "werewolf-style hidden ghost voting"],
  ["trivia", "trivia about horror movies"],
  ["escape", "haunted house tap-to-escape where everyone must coordinate"],
  ["emoji", "costume drawing guessing game using emoji only"],
  ["zombie", "zombie tag on a grid"],
];
export const JOBS = [
  ...PROMPTS.flatMap(([slug, idea]) => ["sonnet", "haiku"].map((model) => ({ slug, idea, model }))),
  { slug: "zombie", idea: "zombie tag on a grid", model: "codex" },
];

function run(cmd, args, input, timeoutMs = 300000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const p = spawn(cmd, args, { cwd: path.join(DIR, ".cwd"), env: { ...process.env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err, seconds: +((performance.now() - t0) / 1000).toFixed(1) }); });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

async function llm(model, userMsg) {
  if (model === "codex") {
    const outFile = path.join(DIR, ".cwd", `codex-${Date.now()}.txt`);
    const prompt = fs.readFileSync(SYS, "utf8") + "\n\nDo not run any commands or edit files; just reply.\n\n" + userMsg;
    const r = await run("codex", ["exec", "--skip-git-repo-check", "-s", "read-only", "-c", 'model_reasoning_effort="low"', "--output-last-message", outFile, "-"], prompt);
    r.out = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : r.out;
    return r;
  }
  return run("/opt/homebrew/bin/claude", ["-p", "--model", model, "--output-format", "text", "--system-prompt-file", SYS, "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"], userMsg);
}

function extract(text) {
  const blocks = [...text.matchAll(/```(?:js|javascript|mjs|ts)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
  return text.replace(/^```\w*\n?/, "").replace(/```\s*$/, "");
}

const file = (j, round) => path.join(GAMES, `${j.slug}.${j.model}.r${round}.js`);

async function generate(j) {
  const r = await llm(j.model, `Game idea: ${j.idea}\n\nWrite the complete module now.`);
  const code = extract(r.out);
  fs.writeFileSync(file(j, 0), code);
  fs.writeFileSync(file(j, 0) + ".raw.txt", r.out + (r.err ? "\n--- stderr ---\n" + r.err : ""));
  return { ...j, genSeconds: r.seconds, exit: r.code, lines: code.split("\n").length };
}

async function repair(j, code, result) {
  const errs = result.errors.slice(0, 8).join("\n").slice(0, 3000);
  const msg = `Game idea: ${j.idea}\n\nYour module failed the automated playtest (4 bot players pressing random buttons in your UI, ticks, a late join, a leave and rejoin, garbage actions, a determinism replay). Errors:\n${errs}\n\nYour module:\n\`\`\`js\n${code}\n\`\`\`\n\nFix the root cause of every error. Return the complete corrected module in one \`\`\`js block.`;
  const r = await llm(j.model, msg);
  const fixed = extract(r.out);
  fs.writeFileSync(file(j, 1), fixed);
  fs.writeFileSync(file(j, 1) + ".raw.txt", r.out + (r.err ? "\n--- stderr ---\n" + r.err : ""));
  return { repairSeconds: r.seconds, fixed };
}

const mode = process.argv[2] || "gen";
if (mode === "gen") {
  const only = process.argv[3];
  const jobs = only ? JOBS.filter((j) => `${j.slug}.${j.model}` === only || j.model === only) : JOBS;
  const res = await Promise.all(jobs.map(async (j) => { const r = await generate(j); console.log(`gen ${j.slug}.${j.model} ${r.genSeconds}s exit=${r.exit} lines=${r.lines}`); return r; }));
  const prev = fs.existsSync(path.join(DIR, "gen-r0.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "gen-r0.json"), "utf8")) : [];
  const merged = [...prev.filter((p) => !res.some((r) => r.slug === p.slug && r.model === p.model)), ...res];
  fs.writeFileSync(path.join(DIR, "gen-r0.json"), JSON.stringify(merged, null, 2));
} else {
  const gens = JSON.parse(fs.readFileSync(path.join(DIR, "gen-r0.json"), "utf8")).filter((g) => g.exit === 0); // codex: ChatGPT login rejects every model, see RESULTS.md
  const rows = await Promise.all(gens.map(async (g) => {
    const code0 = fs.readFileSync(file(g, 0), "utf8");
    const t0 = playtest(code0);
    const row = { ...g, pass0: t0.pass, errors0: t0.errors, stats0: t0.stats, warnings0: t0.warnings };
    if (!t0.pass) {
      const { repairSeconds, fixed } = await repair(g, code0, t0);
      const t1 = playtest(fixed);
      Object.assign(row, { repairSeconds, pass1: t1.pass, errors1: t1.errors, stats1: t1.stats, warnings1: t1.warnings });
    } else row.pass1 = true;
    console.log(`test ${g.slug}.${g.model} first=${row.pass0} repaired=${row.pass1} ${row.errors0[0] || ""}`);
    return row;
  }));
  fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(rows, null, 2));
}
