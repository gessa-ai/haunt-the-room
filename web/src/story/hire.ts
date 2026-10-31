// THE HIRING (lane L20b): the prelude that closes the reel and hands off to the stage's "Welcome, YC.".
// The landlord's ad (2.0 s) -> four hires, one HIRED stamp per beat (4 x 1.1 s) -> a fast-forward smear onto the
// cabal table (1.8 s), the ad 1.8 s: 8.0 s in all. Only type imports from panels.ts (panels.ts spreads HIRE into the reel).
import type { HunterId } from "../../../contract/protocol"
import { drawHunter, HUNTER_PX } from "../avatar/index.ts"
import type { LiveLayers, MapPt, Panel, StoryMeta } from "./panels"

const SW = 1920
const SH = 1080
const FONT = "GeistPixel"
// buffer coordinates (the live layers draw in the 480x270 dither buffer's frame)
const BW = 480
const BH = 270

const CREW: readonly { id: HunterId; name: string; color: string; line: string }[] = [
  { id: "exorcist", name: "The Exorcist", color: "#ffd27a", line: "Is it billed by the ghost or the hour?" },
  { id: "medium", name: "The Medium", color: "#b18cff", line: "I knew you'd call, darling. I felt it." },
  { id: "skeptic", name: "The Skeptic", color: "#7ad7ff", line: "I'll prove nothing's there. Hourly." },
  { id: "priest", name: "The Priest", color: "#ff8a7a", line: "Light me from the left. Good side." },
]

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let cur = ""
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w
    if (cur && g.measureText(t).width > maxW) {
      out.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) out.push(cur)
  return out
}

function darken(a: number) {
  return (g: CanvasRenderingContext2D): void => {
    g.fillStyle = `rgba(4,3,7,${a})`
    g.fillRect(0, 0, SW, SH)
  }
}

// ---------- 1. the ad ----------
function flyerLive(l: LiveLayers, _m: StoryMeta, _map: MapPt, now: number, _k: number, ms: number): void {
  const { g, hi } = l
  // the flyer is taped to the gate, it lands with a slap at 120 ms
  const land = Math.min(1, ms / 120)
  const x = 250
  const y = 30
  const w = 190
  const h = 175
  const rot = -0.05 + (1 - land) * 0.25
  const flutter = Math.sin(now / 90) * 0.006
  for (const ctx of [g, hi]) {
    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(rot + flutter)
    ctx.scale(0.6 + land * 0.4, 0.6 + land * 0.4)
    ctx.translate(-w / 2, -h / 2)
    if (ctx === g) {
      g.fillStyle = "#040307"
      g.fillRect(4, 5, w, h)
      g.fillStyle = "#efe6d2"
      g.fillRect(0, 0, w, h)
      g.fillStyle = "rgba(255,210,122,0.6)" // tape
      g.fillRect(w / 2 - 22, -6, 44, 12)
    } else {
      hi.fillStyle = "#1a1014"
      hi.textBaseline = "top"
      hi.font = `30px "${FONT}"`
      hi.fillText("Haunted.", 14, 14)
      hi.fillText("Must sell.", 14, 48)
      hi.fillStyle = "#b3202a"
      hi.font = `20px "${FONT}"`
      hi.fillText("Exorcists wanted.", 14, 96)
      hi.fillStyle = "#1a1014"
      hi.font = `13px "${FONT}"`
      hi.fillText("Cash. Tonight. No questions.", 14, 132)
      // the tear-off phone tabs
      hi.strokeStyle = "rgba(26,16,20,0.5)"
      hi.lineWidth = 0.6
      for (let i = 0; i < 6; i++) {
        hi.beginPath()
        hi.moveTo(14 + i * 28, 152)
        hi.lineTo(14 + i * 28, h)
        hi.stroke()
      }
    }
    ctx.restore()
  }
}

// ---------- 2. the hires ----------
const PORTRAIT = 7 // buffer px per portrait pixel (28 px on the projector)

function hiredLive(i: number) {
  const c = CREW[i]
  const art = document.createElement("canvas")
  return (l: LiveLayers, _m: StoryMeta, _map: MapPt, now: number, _k: number, ms: number): void => {
    const { g, hi } = l
    const size = HUNTER_PX * PORTRAIT
    const px = 34
    const py = (BH - size) / 2 - 6
    // the portrait slides in from the left and settles
    const slide = Math.min(1, ms / 160)
    const ox = (1 - slide) * -60
    // a candle-coloured plate behind the face, in the dither buffer
    g.fillStyle = "rgba(255,122,26,0.18)"
    g.fillRect(px - 6 + ox, py - 6, size + 12, size + 12)
    drawHunter(art, c.id, HUNTER_PX * 4, { talking: ms > 260 && ms < 900, frame: Math.floor(now / 140) })
    hi.save()
    hi.imageSmoothingEnabled = false
    hi.drawImage(art, px + ox, py, size, size)
    hi.restore()

    // name + line, crisp and big (name 64 px, line 56 px on the projector)
    const tx = px + size + 26
    const maxW = BW - tx - 18
    hi.save()
    hi.textBaseline = "top"
    hi.fillStyle = c.color
    hi.font = `16px "${FONT}"`
    hi.fillText(c.name, tx, 62)
    hi.fillStyle = "#efe6d2"
    hi.font = `14px "${FONT}"`
    hi.shadowColor = "#040307"
    hi.shadowOffsetX = 1
    hi.shadowOffsetY = 1
    const lines = wrap(hi, c.line, maxW)
    const shown = Math.max(0, Math.min(c.line.length, Math.floor((ms - 120) / 14)))
    let left = shown
    lines.forEach((ln, j) => {
      hi.fillText(ln.slice(0, Math.max(0, left)), tx, 90 + j * 18)
      left -= ln.length + 1
    })
    hi.restore()

    // HIRED: the stamp slams onto the portrait at 420 ms
    const st = ms - 420
    if (st > 0) {
      const s = st < 110 ? 2.4 - (st / 110) * 1.4 : 1
      const a = Math.min(1, st / 60)
      if (st < 110) {
        g.fillStyle = `rgba(255,59,59,${(0.25 * (1 - st / 110)).toFixed(3)})`
        g.fillRect(0, 0, BW, BH)
      }
      hi.save()
      hi.globalAlpha = a * 0.92
      hi.translate(px + size / 2, py + size * 0.72)
      hi.rotate(-0.14)
      hi.scale(s, s)
      hi.strokeStyle = "#ff3b3b"
      hi.fillStyle = "#ff3b3b"
      hi.lineWidth = 3
      hi.font = `30px "${FONT}"`
      hi.textAlign = "center"
      hi.textBaseline = "middle"
      const tw = hi.measureText("Hired.").width + 22
      hi.strokeRect(-tw / 2, -21, tw, 42)
      hi.fillText("Hired.", 0, 1)
      hi.restore()
    }

    // the crew so far, along the bottom
    for (let j = 0; j < CREW.length; j++) {
      const on = j < i || (j === i && st > 0)
      const sx = tx + j * 34
      g.fillStyle = on ? CREW[j].color : "rgba(239,230,210,0.15)"
      g.fillRect(sx, 214, 26, 6)
    }
  }
}

// ---------- 3. fast-forward to the table ----------
function paintTable(g: CanvasRenderingContext2D): void {
  const room = g.createRadialGradient(SW / 2, SH / 2, 60, SW / 2, SH / 2, SW * 0.7)
  room.addColorStop(0, "#2a1810")
  room.addColorStop(0.5, "#0d0816")
  room.addColorStop(1, "#040307")
  g.fillStyle = room
  g.fillRect(0, 0, SW, SH)
  // the round table, seen from above
  const cx = SW / 2
  const cy = SH / 2 + 20
  g.fillStyle = "#3a2214"
  g.beginPath()
  g.ellipse(cx, cy, 560, 400, 0, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = "#1a0e08"
  g.lineWidth = 18
  g.stroke()
  // the house carved into it: six rooms, 3 x 2
  const rooms = ["#e2364f", "#2f7de1", "#e0a400", "#2fa84f", "#9b4dff", "#1fb5b5"]
  for (let i = 0; i < 6; i++) {
    const rx = cx - 330 + (i % 3) * 220
    const ry = cy - 200 + Math.floor(i / 3) * 210
    g.strokeStyle = rooms[i]
    g.globalAlpha = 0.55
    g.lineWidth = 8
    g.strokeRect(rx, ry, 200, 190)
    g.globalAlpha = 1
  }
  // one candle
  const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 520)
  glow.addColorStop(0, "rgba(255,210,122,0.75)")
  glow.addColorStop(0.25, "rgba(255,122,26,0.22)")
  glow.addColorStop(1, "rgba(255,122,26,0)")
  g.fillStyle = glow
  g.fillRect(0, 0, SW, SH)
  g.fillStyle = "#efe6d2"
  g.fillRect(cx - 16, cy - 50, 32, 70)
  g.fillStyle = "#ffd27a"
  g.beginPath()
  g.ellipse(cx, cy - 72, 12, 24, 0, 0, Math.PI * 2)
  g.fill()
  // the four of them around it
  const seats: [number, number][] = [[cx - 760, cy - 140], [cx + 520, cy - 140], [cx - 560, cy + 220], [cx + 320, cy + 220]]
  const art = document.createElement("canvas")
  g.imageSmoothingEnabled = false
  CREW.forEach((c, i) => {
    drawHunter(art, c.id, HUNTER_PX * 10)
    const [x, y] = seats[i]
    g.drawImage(art, x, y - 120, 240, 240)
  })
  g.imageSmoothingEnabled = true
}

function tableLive(l: LiveLayers, _m: StoryMeta, _map: MapPt, now: number, _k: number, ms: number): void {
  const { g, hi } = l
  const ff = Math.max(0, 1 - ms / 760) // the smear runs out by 760 ms
  if (ff > 0) {
    // VHS fast-forward: horizontal echoes + tracking bands that tear the rows sideways
    const src = g.getImageData(0, 0, BW, BH)
    const tmp = document.createElement("canvas")
    tmp.width = BW
    tmp.height = BH
    tmp.getContext("2d")!.putImageData(src, 0, 0)
    for (let e = 1; e <= 4; e++) {
      g.globalAlpha = 0.28 * ff
      g.drawImage(tmp, -e * 14 * ff, 0)
    }
    g.globalAlpha = 1
    const bands = 5
    for (let b = 0; b < bands; b++) {
      const y = (Math.floor(now / 7) * 37 + b * 61) % BH
      const hgt = 4 + ((b * 7) % 11)
      g.drawImage(tmp, 0, y, BW, hgt, (Math.random() - 0.3) * 80 * ff, y, BW, hgt)
      g.fillStyle = `rgba(239,230,210,${(0.18 * ff).toFixed(3)})`
      g.fillRect(0, y + hgt - 1, BW, 1)
    }
    // the deck's fast-forward glyph + speed, crisp, top left
    hi.save()
    hi.globalAlpha = Math.min(1, ff * 2)
    hi.fillStyle = "#efe6d2"
    for (const dx of [0, 16]) {
      hi.beginPath()
      hi.moveTo(28 + dx, 22)
      hi.lineTo(44 + dx, 32)
      hi.lineTo(28 + dx, 42)
      hi.closePath()
      hi.fill()
    }
    hi.font = `18px "${FONT}"`
    hi.textBaseline = "middle"
    hi.fillText("x32", 70, 33)
    hi.restore()
  }
}

export const HIRE: readonly Panel[] = [
  {
    id: "ad",
    caption: "The landlord wants you gone by midnight.",
    render: "house-gate",
    overlay: darken(0.25),
    live: flyerLive,
    ms: 1800,
    from: { s: 1.0, x: 0.5, y: 0.5 },
    to: { s: 1.08, x: 0.55, y: 0.48 },
  },
  ...CREW.map(
    (c, i): Panel => ({
      id: `hired-${c.id}`,
      caption: "",
      fallback: "/3d/stage/killcam-ballroom-dark.webp",
      overlay: darken(0.72),
      live: hiredLive(i),
      ms: 1100,
      from: { s: 1.06, x: 0.5, y: 0.5 },
      to: { s: 1.0, x: 0.5, y: 0.5 },
    }),
  ),
  {
    id: "table",
    caption: "Midnight. They vote on who dies first.",
    paint: paintTable,
    live: tableLive,
    ms: 1800,
    from: { s: 1.5, x: 0.5, y: 0.5 },
    to: { s: 1.0, x: 0.5, y: 0.5 },
  },
]
