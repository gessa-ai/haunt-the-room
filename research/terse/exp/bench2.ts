import { actors } from "./generated/index.js"
const sb = actors.Sandbox.get("sb2")
await sb.setReducer("function reduce(s,a){ return { n: (s.n||0) + a.by, log: [...(s.log||[]).slice(-20), a] } }")
for (let i = 0; i < 6; i++) console.log(JSON.stringify(await (sb as any).timing({ by: 1 })))
process.exit(0)
