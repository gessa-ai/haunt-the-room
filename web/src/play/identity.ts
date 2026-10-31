// This phone's ghost id: a uuid kept in localStorage. Storage can be blocked (private mode, in-app browsers);
// then the id lives in memory for this page load and a reload makes a new ghost.

const KEY = "haunt.ghostId"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
let memory: string | null = null

/** RFC 4122 v4 from getRandomValues (crypto.randomUUID is missing on plain-http LAN origins). */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function ghostId(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && UUID.test(saved)) return saved
  } catch {
    // storage blocked: fall through to memory
  }
  memory ??= uuid()
  try {
    localStorage.setItem(KEY, memory)
  } catch {
    // storage blocked: memory copy is enough for this page load
  }
  return memory
}
