// Everything a hunter says is projected in front of judges. One rule in every prompt, one sanitizer before every post.

export const PG13 =
  "Everything you write is projected on a big screen in front of judges: keep it PG-13. No slurs, no sexual " +
  "content, no real people, no politics. Witty and menacing, never cruel. Short, specific, in character: name rooms " +
  "and rivals, no stock horror phrases, no emoji, no dashes."

// Stems, matched at word starts. HARD = never on the projector; STYLE = also kept out of model lines.
const HARD = [
  // sexual
  "sex", "porn", "nude", "naked", "horny", "orgasm", "boob", "dick", "cock", "pussy", "penis", "vagina", "erotic",
  "fetish", "slut", "whore", "rape", "molest",
  // profanity and slurs
  "fuck", "shit", "bitch", "cunt", "bastard", "asshole", "nigg", "fag", "retard", "tranny", "spic", "chink", "kike",
  "wetback", "dyke",
  // politics and real people
  "trump", "biden", "obama", "putin", "musk", "harris", "maga", "democrat", "republican", "election", "president",
  "senator", "congress", "nazi", "hitler", "isis", "terroris",
  // cruelty
  "suicide", "kill yourself", "kys", "cancer",
]
const STYLE = [
  // AI-ish and stock phrases
  "chef's kiss", "delve", "let's", "buckle up", "tapestry", "testament to", "game changer", "the air is cold",
  "i sense a presence", "beware", "you can't hide",
]
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const stems = (ws: string[]) => new RegExp(`(^|[^a-z])(${ws.map(esc).join("|")})`, "i")
const HARD_RE = stems(HARD)
const STYLE_RE = stems(STYLE)
const plain = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2018\u2019]/g, "'")
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

/** Every line we post, ours or the model's: no emoji anywhere (the stage draws its own icons). */
export const noEmoji = (text: string): string => text.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim()

export const LINE_WORDS = 10 // the stage chat is Discord-style: name, then up to two lines
export const LINE_CHARS = 70
const fits = (t: string) => t.length > 0 && t.length <= LINE_CHARS && t.split(" ").length <= LINE_WORDS
/** One projector line (<= LINE_WORDS words, <= LINE_CHARS chars): the whole line, else whole sentences from the
 *  start, else whole sentences from the end, else a cut at a word boundary. Never a half word. */
export function fit(text: string): string {
  const t = noEmoji(text)
  if (fits(t)) return t
  const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [t]
  for (let n = sentences.length - 1; n > 0; n--) {
    const head = sentences.slice(0, n).join(" ")
    if (fits(head)) return head
  }
  for (let n = 1; n < sentences.length; n++) {
    const tail = sentences.slice(n).join(" ")
    if (fits(tail)) return tail
  }
  let out = ""
  for (const w of t.split(" ").slice(0, LINE_WORDS)) {
    const next = out ? `${out} ${w}` : w
    if (next.length > LINE_CHARS) break
    out = next
  }
  return (out || t.slice(0, LINE_CHARS)).replace(/[,;:]+$/, "")
}
/** True when the line fits one projector line as written. */
export const fitsWhole = (text: string): boolean => fits(noEmoji(text))

/** PG-13 for any line on the projector, ours or the model's. */
export const pg13 = (text: string): boolean => !HARD_RE.test(plain(text))

/** A model line as it may go on the projector (dashes and emoji stripped), or null when it must not go at all. */
export function sanitize(text: string): string | null {
  const t = text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim()
  if (!t) return null
  return HARD_RE.test(plain(t)) || STYLE_RE.test(plain(t)) ? null : t
}
