// L25: key art via OpenRouter image output. usage: bun demo/video/art/gen.ts <name> <ref1,ref2> <prompt>
import { readFileSync, writeFileSync } from "fs";
const env = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("OPENROUTER_API_KEY missing");
const [name, refs, prompt] = process.argv.slice(2);
const STYLE = " Style: matches the reference images exactly: low-poly stylized 3D render, night, deep navy and violet palette, warm amber window light, soft fog, moonlit, cinematic 16:9 widescreen, simple bold shapes, no text unless asked, no watermark, no people's faces in detail (hunters are faceless cloaked silhouettes with a thin glowing outline).";
const content: any[] = [{ type: "text", text: prompt + STYLE }];
for (const r of (refs || "").split(",").filter(Boolean)) content.push({ type: "image_url", image_url: { url: "data:image/png;base64," + readFileSync(r).toString("base64") } });
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "google/gemini-2.5-flash-image", modalities: ["image", "text"], messages: [{ role: "user", content }], image_config: { aspect_ratio: "16:9" } }) });
const j: any = await res.json();
const url = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!url) { console.error(name, "FAIL", res.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
writeFileSync(new URL(`gen/${name}.png`, import.meta.url), Buffer.from(url.split(",")[1], "base64"));
console.log(name, "ok");
