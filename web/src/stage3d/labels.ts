// Room billboards in the world (so the dither pass grains them like everything else): the room glyph in its
// ROOM_STYLE colour, the live count huge, the room name small. Redrawn only when the number changes.
import * as THREE from "three"
import { ROOM_STYLE, type RoomId } from "../../../contract/protocol"

const W = 512
const H = 300

function glyph(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number): void {
  ctx.beginPath()
  if (kind === "circle") ctx.arc(x, y, r, 0, Math.PI * 2)
  else if (kind === "square") ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
  else if (kind === "triangle") {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y + r * 0.8)
    ctx.lineTo(x - r, y + r * 0.8)
  } else if (kind === "diamond") {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
  } else if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
  } else {
    ctx.arc(x, y, r, 0.6, Math.PI * 2 - 0.6)
    ctx.arc(x + r * 0.55, y - r * 0.15, r * 0.75, Math.PI * 2 - 0.9, 0.9, true)
  }
  ctx.closePath()
  ctx.fill()
}

export class RoomLabel {
  readonly sprite: THREE.Sprite
  private readonly ctx: CanvasRenderingContext2D
  private readonly tex: THREE.CanvasTexture
  private last = ""

  constructor(private readonly id: RoomId) {
    const c = document.createElement("canvas")
    c.width = W
    c.height = H
    this.ctx = c.getContext("2d")!
    this.tex = new THREE.CanvasTexture(c)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, fog: false }))
    this.sprite.scale.set(4.2, (4.2 * H) / W, 1)
    this.sprite.renderOrder = 10
    this.draw(0, false)
  }

  draw(count: number, possessed: boolean): void {
    const key = `${count}|${possessed}`
    if (key === this.last) return
    this.last = key
    const ctx = this.ctx
    const st = ROOM_STYLE[this.id]
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = possessed ? st.color : "rgba(4,3,7,0.82)"
    ctx.beginPath()
    ctx.roundRect(8, 8, W - 16, H - 16, 28)
    ctx.fill()
    ctx.lineWidth = 10
    ctx.strokeStyle = st.color
    ctx.stroke()
    ctx.strokeStyle = possessed ? "#ffffff" : st.color
    ctx.stroke()
    ctx.fillStyle = possessed ? "#ffffff" : st.color
    glyph(ctx, st.glyph, 110, H / 2, 70)
    ctx.fillStyle = "#ffffff"
    ctx.font = "700 190px GeistPixel, monospace"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(String(count), 205, H / 2 + 6)
    this.tex.needsUpdate = true
  }
}
