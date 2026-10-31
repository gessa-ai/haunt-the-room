// L10b: the listen-back section (every rendered line + one reel per speaker). Used by voice-catalog.ts (top of /voices.html)
// and written standalone to demo/dialogue/index.html. base = where the voice/ and dialogue/ files live relative to the page.
import { readFileSync } from "node:fs"
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" } as Record<string, string>)[c]};`)
export function dialogueSection(voiceBase: string, reelBase: string): string {
  const idx = JSON.parse(readFileSync(new URL("../web/public/audio/voice/index.json", import.meta.url).pathname, "utf8"))
  const cast = JSON.parse(readFileSync(new URL("./cast.json", import.meta.url).pathname, "utf8"))
  let html = `<h2>Dialogue: every rendered line (${Object.values(idx.voices).flatMap((e: any) => Object.values(e).flat()).length})</h2><div class="grid">`
  for (const sp of Object.keys(idx.voices)) html += `<div class="v cur"><button data-src="${reelBase}${sp}.mp3">&#9654;</button><div><b>${sp} reel</b><small>${esc(cast[sp]?.name ?? "")} · every line, 0.4 s gaps</small></div></div>`
  html += `</div><table><tr><th></th><th>speaker</th><th>key</th><th>text</th></tr>`
  for (const [sp, ev] of Object.entries(idx.voices) as [string, Record<string, { file: string; text: string }[]>][])
    for (const [key, ls] of Object.entries(ev)) for (const l of ls)
      html += `<tr><td><button class="s" data-src="${voiceBase}${l.file}">&#9654;</button></td><td>${sp}</td><td><code>${esc(l.file.replace(/^[^/]+\//, "").replace(/\.mp3$/, ""))}</code></td><td>${esc(l.text)}</td></tr>`
  return html + `</table>`
}
export const PAGE_CSS = `:root{color-scheme:dark}body{background:#0d0b10;color:#eee;font:15px/1.4 system-ui;margin:0;padding:16px 24px 60px}h1{margin:0 0 4px}h2{margin:28px 0 8px;color:#ffd27a}h3{margin:16px 0 6px}h3 em{color:#999;font-weight:400;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px}.v{display:flex;gap:10px;align-items:flex-start;background:#1a1620;border-radius:8px;padding:8px 10px}.cur{border:1px solid #ffd27a55}
button{width:36px;height:36px;border-radius:50%;border:0;background:#b18cff;color:#000;font-size:14px;cursor:pointer;flex:none}button.s{width:26px;height:26px;font-size:11px}button.on{background:#ffd27a}button:disabled{opacity:.3}
table{border-collapse:collapse;width:100%;margin-top:12px}td,th{padding:3px 8px;border-bottom:1px solid #222;text-align:left;vertical-align:middle}th{color:#999;font-weight:500}
small{display:block;color:#aaa;font-size:12px}code{font-size:11px;color:#888}.star{color:#ffd27a;font-size:12px}.rec{color:#7ad7ff;font-size:12px}`
export const PLAYER_JS = `<script>const a=new Audio();let cur=null;document.addEventListener("click",e=>{const b=e.target.closest("button[data-src]");if(!b)return;if(cur===b&&!a.paused){a.pause();b.classList.remove("on");return}cur&&cur.classList.remove("on");a.src=b.dataset.src;a.play();b.classList.add("on");cur=b});a.onended=()=>cur&&cur.classList.remove("on")</script>`
