// Player-chosen ghost names (contract: letters, digits, spaces, . ' - ; trimmed; 1..NAME_MAX; small blocklist).
import { NAME_MAX } from "../../contract/protocol.ts"

const ALLOWED = /^[A-Za-z0-9 .'-]+$/
// Matched against the name lower-cased with digits read as letters and everything else removed.
const BLOCKED = [
  "fuck", "shit", "cunt", "nigg", "nigga", "fag", "retard", "rape", "nazi", "hitler", "bitch", "whore", "slut",
  "kike", "spic", "chink", "dick", "cock", "pussy", "penis", "vagina", "porn", "kys", "tranny", "jizz", "cum",
]
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" }

/** The cleaned name, or null when it breaks a rule (the caller keeps the old name). */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.normalize("NFKC").replace(/\s+/g, " ").trim()
  if (name.length < 1 || name.length > NAME_MAX || !ALLOWED.test(name)) return null
  const flat = name.toLowerCase().replace(/[0-9]/g, d => LEET[d] ?? "").replace(/[^a-z]/g, "")
  return BLOCKED.some(word => flat.includes(word)) ? null : name
}
