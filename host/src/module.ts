// Static handling of a generated game module (contract/GAME-CONTRACT.md): export scanning, the transform that
// turns the ES module into one evaluable script, a static read of the `meta` literal, and the one meta law.
import { MIN_TICK_MS, TABLE_CAP, type GameMeta } from "../../contract/protocol.ts"

export const MAX_SOURCE_BYTES = 60 * 1024
export const EXPORT_NAMES = ["meta", "init", "reduce", "view", "render"] as const
export type ExportName = (typeof EXPORT_NAMES)[number]
const DEFAULT_BINDING = "__conjure_default"

export interface ScannedModule {
  /** The module as a script whose completion value is the exports object; line numbers match the source. */
  script: string
  /** Contract names the source visibly exports (named, listed or as keys of a default object). */
  exported: Set<ExportName>
  issues: string[]
}

const IDENT = String.raw`[A-Za-z_$][\w$]*`
const isExportName = (n: string): n is ExportName => (EXPORT_NAMES as readonly string[]).includes(n)
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length
const blankKeepingLines = (text: string) => text.replace(/[^\n]/g, "")

export function scanModule(src: string): ScannedModule {
  const issues: string[] = []
  const exported = new Set<ExportName>()
  const aliases = new Map<ExportName, string>() // export { local as name }

  for (const m of src.matchAll(/^[ \t]*import\b(?!\s*\()/gm)) issues.push(`import statement at line ${lineOf(src, m.index)} (the contract forbids imports)`)
  for (const m of src.matchAll(/\bimport\s*\(|\bimport\.meta\b/g)) issues.push(`dynamic import at line ${lineOf(src, m.index)} (the contract forbids imports)`)

  let s = src.replace(
    new RegExp(String.raw`^[ \t]*export\s*\{([^}]*)\}(\s*from\s*(['"])[^'"\n]*\3)?[ \t]*;?`, "gm"),
    (whole, list: string, from: string | undefined, _q, offset: number) => {
      if (from) { issues.push(`re-export "from" at line ${lineOf(src, offset)} (the contract forbids imports)`); return blankKeepingLines(whole) }
      for (const spec of list.split(",").map((x) => x.trim()).filter(Boolean)) {
        const m = new RegExp(String.raw`^(${IDENT})(?:\s+as\s+(${IDENT}))?$`).exec(spec)
        if (!m || !m[1]) { issues.push(`unsupported export specifier "${spec}" at line ${lineOf(src, offset)}`); continue }
        const name = m[2] ?? m[1]
        if (isExportName(name)) { exported.add(name); aliases.set(name, m[1]) }
      }
      return blankKeepingLines(whole)
    },
  )
  for (const m of s.matchAll(/^[ \t]*export\s*\*/gm)) issues.push(`export * at line ${lineOf(s, m.index)} (the contract forbids imports)`)

  s = s.replace(/^([ \t]*)export\s+default\s+/gm, (_w, indent: string, offset: number) => {
    const open = s.indexOf("{", offset)
    const between = open >= 0 ? s.slice(offset, open) : ""
    if (/^\s*export\s+default\s*$/.test(between)) {
      const body = balanced(s, open)
      if (body) for (const n of EXPORT_NAMES) if (new RegExp(String.raw`(?:^|[{,\s])${n}\s*[,:(}\s]`).test(body)) exported.add(n)
    }
    return `${indent}const ${DEFAULT_BINDING} = `
  })
  s = s.replace(new RegExp(String.raw`^([ \t]*)export\s+((?:async\s+)?function\b\s*\*?\s*(${IDENT}))`, "gm"), (_w, indent: string, decl: string, name: string) => {
    if (isExportName(name)) exported.add(name)
    return indent + decl
  })
  s = s.replace(new RegExp(String.raw`^([ \t]*)export\s+((?:const|let|var|class)\s+(${IDENT}))`, "gm"), (_w, indent: string, decl: string, name: string) => {
    if (isExportName(name)) exported.add(name)
    return indent + decl
  })
  for (const m of s.matchAll(/^[ \t]*export\b.*$/gm)) issues.push(`unsupported export form at line ${lineOf(s, m.index)}: ${m[0].trim().slice(0, 60)}`)

  const pick = (n: ExportName) => {
    const local = aliases.get(n)
    if (local) return `${n}: ${local}`
    return `${n}: typeof ${n} !== "undefined" ? ${n} : (typeof ${DEFAULT_BINDING} === "object" && ${DEFAULT_BINDING} !== null ? ${DEFAULT_BINDING}.${n} : undefined)`
  }
  const script = `(function () {${s}\n;return { ${EXPORT_NAMES.map(pick).join(", ")} };\n})()`
  return { script, exported, issues }
}

// ---------- the meta law (shared by checkModule and createHost) ----------

/** Validate a raw meta value and clamp it to the table: maxPlayers <= TABLE_CAP, tickMs >= MIN_TICK_MS. */
export function parseMeta(raw: unknown): { meta?: GameMeta; issues: string[] } {
  const issues: string[] = []
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { issues: ["meta must be an object"] }
  const r = raw as Record<string, unknown>
  const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)
  if (typeof r.title !== "string" || !r.title.trim()) issues.push("meta.title must be a non-empty string")
  if (!int(r.minPlayers) || r.minPlayers < 1 || r.minPlayers > TABLE_CAP) issues.push(`meta.minPlayers must be an integer 1..${TABLE_CAP} (got ${String(r.minPlayers)})`)
  if (!int(r.maxPlayers) || (int(r.minPlayers) && r.maxPlayers < r.minPlayers)) issues.push(`meta.maxPlayers must be an integer >= minPlayers (got ${String(r.maxPlayers)})`)
  if (r.tickMs != null && !(typeof r.tickMs === "number" && Number.isFinite(r.tickMs) && r.tickMs > 0)) issues.push(`meta.tickMs must be a positive number when set (got ${String(r.tickMs)})`)
  if (issues.length) return { issues }
  const meta: GameMeta = {
    title: (r.title as string).trim(),
    minPlayers: r.minPlayers as number,
    maxPlayers: Math.min(r.maxPlayers as number, TABLE_CAP),
  }
  if (typeof r.tickMs === "number") meta.tickMs = Math.max(MIN_TICK_MS, Math.round(r.tickMs))
  return { meta, issues }
}

// ---------- static read of the meta literal ----------

/** Read `meta` without running code: a literal object, whose values may name top-level `const X = <literal>`. */
export function readStaticMeta(src: string): { raw?: unknown; issue?: string } {
  const decl = /^[ \t]*(?:export\s+)?(?:const|let|var)\s+meta\s*=\s*/m.exec(src) ?? /\bmeta\s*:\s*(?=\{)/.exec(src)
  if (!decl) return { issue: "no meta object found" }
  try {
    return { raw: new LiteralReader(src).value(decl.index + decl[0].length, 0).value }
  } catch (e) {
    return { issue: `meta must be a literal object (${(e as Error).message})` }
  }
}

/** The text of the balanced {...} starting at `open`, skipping strings and comments; null if unbalanced. */
function balanced(src: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) return null; continue }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; if (i <= 0) return null; continue }
    if (c === "{") depth++
    else if (c === "}" && --depth === 0) return src.slice(open, i + 1)
  }
  return null
}
function skipString(src: string, i: number): number {
  const q = src[i]
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue }
    if (src[j] === q) return j
  }
  return src.length
}

class LiteralReader {
  private readonly src: string
  constructor(src: string) { this.src = src }

  value(i: number, depth: number): { value: unknown; end: number } {
    i = this.ws(i)
    const c = this.src[i]
    if (c === "{") return this.object(i, depth)
    if (c === "[") return this.array(i, depth)
    if (c === '"' || c === "'") { const end = skipString(this.src, i); return { value: unescapeJs(this.src.slice(i + 1, end)), end: end + 1 } }
    if (c === "`") {
      const end = skipString(this.src, i)
      const body = this.src.slice(i + 1, end)
      if (body.includes("${")) throw new Error("template with ${} is not a literal")
      return { value: unescapeJs(body), end: end + 1 }
    }
    const num = /^[+-]?(?:0[xX][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)/.exec(this.src.slice(i, i + 40))
    if (num) {
      const end = this.ws(i + num[0].length)
      if (/^[*/%+\-]/.test(this.src[end] ?? "") && this.src.slice(end, end + 2) !== "//" && this.src.slice(end, end + 2) !== "/*") throw new Error("arithmetic is not a literal")
      return { value: Number(num[0].replace(/_/g, "")), end: i + num[0].length }
    }
    const id = new RegExp(`^${IDENT}`).exec(this.src.slice(i, i + 80))
    if (id) {
      const word = id[0]
      const end = i + word.length
      if (word === "true" || word === "false") return { value: word === "true", end }
      if (word === "null" || word === "undefined") return { value: null, end }
      if (depth > 2) throw new Error(`cannot resolve ${word}`)
      const decl = new RegExp(String.raw`^[ \t]*(?:export\s+)?const\s+${word.replace(/\$/g, "\\$")}\s*=\s*`, "m").exec(this.src)
      if (!decl) throw new Error(`${word} is not a top-level const literal`)
      return { value: this.value(decl.index + decl[0].length, depth + 1).value, end }
    }
    throw new Error(`unexpected "${this.src.slice(i, i + 12)}"`)
  }

  private object(i: number, depth: number): { value: unknown; end: number } {
    const out: Record<string, unknown> = {}
    i++
    for (;;) {
      i = this.ws(i)
      if (this.src[i] === "}") return { value: out, end: i + 1 }
      let key: string
      const c = this.src[i]
      if (c === '"' || c === "'") { const end = skipString(this.src, i); key = unescapeJs(this.src.slice(i + 1, end)); i = end + 1 }
      else {
        const id = /^[A-Za-z_$\d][\w$]*/.exec(this.src.slice(i, i + 80))
        if (!id) throw new Error(`unexpected "${this.src.slice(i, i + 12)}" in object`)
        key = id[0]; i += key.length
      }
      i = this.ws(i)
      if (this.src[i] === ":") { const v = this.value(i + 1, depth); out[key] = v.value; i = v.end }
      else if (this.src[i] === "," || this.src[i] === "}") out[key] = this.value(i - key.length, depth).value
      else throw new Error(`unexpected "${this.src.slice(i, i + 12)}" after ${key}`)
      i = this.ws(i)
      if (this.src[i] === ",") { i++; continue }
      if (this.src[i] === "}") return { value: out, end: i + 1 }
      throw new Error(`unexpected "${this.src.slice(i, i + 12)}" in object`)
    }
  }

  private array(i: number, depth: number): { value: unknown; end: number } {
    const out: unknown[] = []
    i++
    for (;;) {
      i = this.ws(i)
      if (this.src[i] === "]") return { value: out, end: i + 1 }
      const v = this.value(i, depth); out.push(v.value); i = this.ws(v.end)
      if (this.src[i] === ",") { i++; continue }
      if (this.src[i] === "]") return { value: out, end: i + 1 }
      throw new Error(`unexpected "${this.src.slice(i, i + 12)}" in array`)
    }
  }

  private ws(i: number): number {
    for (;;) {
      while (i < this.src.length && /\s/.test(this.src[i] as string)) i++
      if (this.src.startsWith("//", i)) { const n = this.src.indexOf("\n", i); i = n < 0 ? this.src.length : n; continue }
      if (this.src.startsWith("/*", i)) { const n = this.src.indexOf("*/", i); i = n < 0 ? this.src.length : n + 2; continue }
      return i
    }
  }
}

function unescapeJs(s: string): string {
  return s.replace(/\\(u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r?\n|.)/g, (_m, e: string) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e[1] === "{" ? e.slice(2, -1) : e.slice(1), 16))
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16))
    if (e === "\n" || e === "\r\n") return ""
    return ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" } as Record<string, string>)[e] ?? e
  })
}
