// L21 CHAOS harness. Own folder only. Coded today against contract/protocol.ts + deploy/RUNBOOK.md.
// Usage: bun qa-chaos/chaos.ts <cmd> [--base http://localhost:3300] [--n N] [--secs S]
// cmds: junk | wsjunk | backpressure | churn | joins | slowloris | spam | health
// Every attack is bounded; caller runs one, then checks health recovery separately.

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d
}
const BASE = flag("base", "http://localhost:3300")
const WSBASE = BASE.replace(/^http/, "ws")
const N = parseInt(flag("n", "50"), 10)
const SECS = parseInt(flag("secs", "30"), 10)
const now = () => Date.now()
const ms = (t: number) => `${Date.now() - t}ms`

async function health(base = BASE) {
  const t = now()
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    return { ok: r.ok, status: r.status, ms: Date.now() - t, body: body.slice(0, 120) }
  } catch (e: any) {
    return { ok: false, status: 0, ms: Date.now() - t, body: `ERR ${e.name}:${e.message}`.slice(0, 120) }
  }
}

async function joinOne(id: string, name?: string) {
  const t = now()
  const r = await fetch(`${BASE}/api/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(name ? { ghostId: id, name } : { ghostId: id }),
    signal: AbortSignal.timeout(15000),
  })
  const j = r.ok ? await r.json() : null
  return { status: r.status, ms: Date.now() - t, join: j as any }
}

// ---- junk HTTP: malformed bodies / wrong types / oversized against each endpoint ----
async function junk() {
  const cases: Array<[string, string, string, any]> = [
    ["join", "/api/join", "application/json", "{not json at all"],
    ["join", "/api/join", "application/json", JSON.stringify({})],
    ["join", "/api/join", "application/json", JSON.stringify({ ghostId: 12345 })],
    ["join", "/api/join", "application/json", JSON.stringify({ ghostId: { nested: true } })],
    ["join", "/api/join", "application/json", JSON.stringify({ ghostId: "x".repeat(100000) })],
    ["join", "/api/join", "application/json", JSON.stringify({ ghostId: "l21-junk", name: "x".repeat(100000) })],
    ["join", "/api/join", "application/json", JSON.stringify({ ghostId: "l21-junk", name: "\u0000\u0007<script>" })],
    ["join", "/api/join", "text/plain", JSON.stringify({ ghostId: "l21-junk" })],
    ["join-10MB", "/api/join", "application/json", `{"ghostId":"l21-junk","pad":"${"A".repeat(10_000_000)}"}`],
    ["name", "/api/name", "application/json", JSON.stringify({ ghostId: "l21-junk" })],
    ["name", "/api/name", "application/json", JSON.stringify({ ghostId: "l21-junk", ghostToken: "bad", name: "x".repeat(99999) })],
    ["whisper", "/api/whisper", "application/json", JSON.stringify({ ghostId: "l21-junk", ghostToken: "bad", room: "../../etc" })],
    ["whisper", "/api/whisper", "application/json", JSON.stringify({ ghostId: "l21-junk", ghostToken: "bad", room: 99 })],
    ["presenter", "/api/presenter/start", "application/json", "{}"], // no token, through base
    ["presenter", "/api/presenter/../health", "application/json", "{}"], // path traversal on presenter cmd
  ]
  for (const [label, path, ct, body] of cases) {
    const t = now()
    try {
      const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": ct }, body, signal: AbortSignal.timeout(15000) })
      const txt = (await r.text()).replace(/\s+/g, " ").slice(0, 100)
      console.log(`JUNK ${label.padEnd(10)} ${path.padEnd(26)} -> ${r.status} ${ms(t).padStart(7)}  ${txt}`)
    } catch (e: any) {
      console.log(`JUNK ${label.padEnd(10)} ${path.padEnd(26)} -> ERR ${ms(t)} ${e.name}:${e.message}`)
    }
  }
}

// ---- oversized / malformed WebSocket app frames on a legit socket ----
async function wsjunk() {
  const j = await joinOne("l21-wsjunk")
  if (!j.join) return console.log(`wsjunk: join failed ${j.status}`)
  const url = (j.join.websocketUrl as string).replace("ws://localhost:3300", WSBASE)
  const ws = new WebSocket(url)
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(e); setTimeout(() => rej(new Error("open timeout")), 8000) })
  let closed = false, closeInfo = ""
  ws.onclose = (e) => { closed = true; closeInfo = `code=${e.code}` }
  const send = (label: string, payload: string | ArrayBuffer) => {
    try { ws.send(payload as any); console.log(`WSJUNK sent ${label} (${typeof payload === "string" ? payload.length + "ch" : (payload as ArrayBuffer).byteLength + "b"})`) }
    catch (e: any) { console.log(`WSJUNK sent ${label} THREW ${e.message}`) }
  }
  send("not-json", "}{ not json")
  send("wrong-t", JSON.stringify({ t: "evil", room: "attic" }))
  send("bad-room", JSON.stringify({ t: "hide", room: "../../etc/passwd" }))
  send("num-room", JSON.stringify({ t: "hide", room: 42 }))
  send("deep-nest", JSON.stringify({ t: "hide", room: Array(5000).fill(0).reduce((a) => ({ a }), {} as any) }))
  send("huge-text", JSON.stringify({ t: "hide", room: "x".repeat(2_000_000) }))
  send("binary", new Uint8Array(1_000_000).fill(255).buffer)
  await new Promise((r) => setTimeout(r, 3000))
  console.log(`WSJUNK after barrage: socketClosed=${closed} ${closeInfo}`)
  try { ws.close() } catch {}
}

// ---- 50 sockets that connect and never read (backpressure) ----
async function backpressure() {
  const sockets: WebSocket[] = []
  let opened = 0, failed = 0
  const t = now()
  await Promise.all(Array.from({ length: N }, async (_, i) => {
    const j = await joinOne(`l21-bp-${i}`).catch(() => null)
    if (!j?.join) { failed++; return }
    const url = (j.join.websocketUrl as string).replace("ws://localhost:3300", WSBASE)
    await new Promise<void>((res) => {
      const ws = new WebSocket(url)
      ws.onopen = () => { opened++; sockets.push(ws); res() }
      ws.onerror = () => { failed++; res() }
      setTimeout(() => res(), 10000)
    })
  }))
  console.log(`BACKPRESSURE opened=${opened} failed=${failed} in ${ms(t)}; holding ${SECS}s, not reading`)
  // hold without reading; the House pushes 10Hz snaps + 2Hz rooms to each
  const during = await health()
  console.log(`BACKPRESSURE health during hold: ${JSON.stringify(during)}`)
  await new Promise((r) => setTimeout(r, SECS * 1000))
  for (const ws of sockets) try { ws.close() } catch {}
  console.log(`BACKPRESSURE released ${sockets.length} sockets`)
}

// ---- rapid connect/disconnect churn of N sockets ----
async function churn() {
  const t = now()
  let cycles = 0, errs = 0
  const end = now() + SECS * 1000
  while (now() < end) {
    await Promise.all(Array.from({ length: N }, async (_, i) => {
      const j = await joinOne(`l21-churn-${i}`).catch(() => null)
      if (!j?.join) { errs++; return }
      const url = (j.join.websocketUrl as string).replace("ws://localhost:3300", WSBASE)
      await new Promise<void>((res) => {
        const ws = new WebSocket(url)
        ws.onopen = () => { ws.close(); res() }
        ws.onerror = () => { errs++; res() }
        setTimeout(() => res(), 5000)
      })
    }))
    cycles++
  }
  console.log(`CHURN ${cycles} cycles x ${N} sockets (~${cycles * N} connects) in ${ms(t)}, errs=${errs}`)
}

// ---- 300 near-simultaneous joins through the public URL, bot:false, names chaos-N ----
async function joins() {
  const t = now()
  const results = await Promise.allSettled(
    Array.from({ length: N }, (_, i) => joinOne(`l21-join-${i}`, `chaos-${i}`))
  )
  const codes: Record<string, number> = {}
  let maxMs = 0, liveSockets = 0
  const sample: WebSocket[] = []
  for (const r of results) {
    if (r.status === "fulfilled") {
      codes[r.value.status] = (codes[r.value.status] || 0) + 1
      maxMs = Math.max(maxMs, r.value.ms)
    } else codes["rej"] = (codes["rej"] || 0) + 1
  }
  console.log(`JOINS n=${N} statuses=${JSON.stringify(codes)} joinMaxMs=${maxMs} in ${ms(t)}`)
  // open a sample of 30 sockets to see if they go live
  const ok = results.filter((r) => r.status === "fulfilled" && r.value.join).slice(0, 30) as any[]
  await Promise.all(ok.map((r) => new Promise<void>((res) => {
    const url = (r.value.join.websocketUrl as string).replace("ws://localhost:3300", WSBASE)
    const ws = new WebSocket(url)
    ws.onopen = () => { liveSockets++; sample.push(ws); res() }
    ws.onerror = () => res()
    setTimeout(() => res(), 12000)
  })))
  console.log(`JOINS sample sockets live: ${liveSockets}/30`)
  for (const ws of sample) try { ws.close() } catch {}
}

// ---- slowloris: open raw TCP, dribble a partial HTTP request, hold ----
async function slowloris() {
  const u = new URL(BASE)
  if (u.protocol !== "http:") return console.log("slowloris: raw TCP only vs local http base")
  const host = u.hostname, port = parseInt(u.port || "80", 10)
  const t = now()
  let open = 0
  const conns = await Promise.all(Array.from({ length: N }, async () => {
    try {
      const sock = await Bun.connect({
        hostname: host, port,
        socket: { data() {}, error() {}, close() {} },
      })
      sock.write(`GET /api/health HTTP/1.1\r\nHost: ${host}\r\n`)
      open++
      return sock
    } catch { return null }
  }))
  console.log(`SLOWLORIS opened ${open}/${N} half-open HTTP conns; dribbling headers for ${SECS}s`)
  const during = await health()
  console.log(`SLOWLORIS health during: ${JSON.stringify(during)}`)
  const end = now() + SECS * 1000
  while (now() < end) {
    for (const s of conns) try { s?.write(`X-Pad-${Math.random().toString(36).slice(2)}: 1\r\n`) } catch {}
    await new Promise((r) => setTimeout(r, 5000))
  }
  for (const s of conns) try { s?.end() } catch {}
  console.log(`SLOWLORIS done in ${ms(t)}`)
}

// ---- hide + whisper spam from one legit ghost ----
async function spam() {
  const j = await joinOne("l21-spam")
  if (!j.join) return console.log(`spam: join failed ${j.status}`)
  const token = j.join.ghostToken as string
  const rooms = ["attic", "nursery", "library", "ballroom", "chapel", "crypt"]
  // whisper spam over HTTP
  const t = now()
  let w: Record<string, number> = {}
  const end = now() + SECS * 1000
  let tries = 0
  while (now() < end) {
    await Promise.all(Array.from({ length: 20 }, async () => {
      tries++
      try {
        const r = await fetch(`${BASE}/api/whisper`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ghostId: "l21-spam", ghostToken: token, room: rooms[(Math.random() * 6) | 0] }), signal: AbortSignal.timeout(8000) })
        w[r.status] = (w[r.status] || 0) + 1
      } catch { w["err"] = (w["err"] || 0) + 1 }
    }))
  }
  console.log(`SPAM whisper tries=${tries} statuses=${JSON.stringify(w)} in ${ms(t)}`)
  // hide spam over WS
  const url = (j.join.websocketUrl as string).replace("ws://localhost:3300", WSBASE)
  const ws = new WebSocket(url)
  await new Promise<void>((res) => { ws.onopen = () => res(); ws.onerror = () => res(); setTimeout(res, 8000) })
  let sent = 0
  const t2 = now()
  const end2 = now() + 10_000
  while (now() < end2) { try { ws.send(JSON.stringify({ t: "hide", room: rooms[(Math.random() * 6) | 0] })); sent++ } catch { break } }
  console.log(`SPAM hide frames sent=${sent} in ${ms(t2)}; socket readyState=${ws.readyState}`)
  try { ws.close() } catch {}
}

const cmds: Record<string, () => Promise<void>> = { junk, wsjunk, backpressure, churn, joins, slowloris, spam }
if (cmd === "health") { console.log(JSON.stringify(await health())) }
else if (cmds[cmd!]) { await cmds[cmd!]!(); }
else console.log("cmds: junk wsjunk backpressure churn joins slowloris spam health")
