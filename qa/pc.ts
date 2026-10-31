// presenter command from the QA lane: bun qa/pc.ts <lobby|hunt|finale|reset|auto|show|bots-on|bots-off> [query]
import { presenter } from "./env.ts"
console.log(JSON.stringify(await presenter(process.argv[2] ?? "", process.argv[3] ?? "")))
