import fs from 'node:fs';
const env = fs.readFileSync(new URL('../../.env', import.meta.url), 'utf8');
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
const R = '../../web/public/';
const refs = ['art/bust/exorcist-open.png','art/bust/medium-open.png','art/bust/skeptic-open.png','art/bust/priest-open.png','3d/preview-night.png'];
const prompt = fs.readFileSync(process.argv[2],'utf8');
const out = process.argv[3];
const content = [{type:'text',text:prompt}, ...refs.map(p=>({type:'image_url',image_url:{url:'data:image/png;base64,'+fs.readFileSync(R+p).toString('base64')}}))];
const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:'google/gemini-2.5-flash-image',modalities:['image','text'],image_config:{aspect_ratio:'16:9'},messages:[{role:'user',content}]})});
const j = await r.json();
const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!url) { console.error('NO IMAGE', JSON.stringify(j).slice(0,600)); process.exit(1); }
fs.writeFileSync(out, Buffer.from(url.split(',')[1],'base64'));
console.log('wrote', out);
