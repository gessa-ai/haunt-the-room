// The 3D board's own face atlas, painted with lane L19's drawAvatar (their art, our packing). L19's avatarAtlas()
// holds 256 cells and clears when full; 400 ghosts x (live, caught) + flame frames need ~820, and a clear or a burst
// of new faces at a kill-cam cut is a visible hitch. Here: 2048 px, 40 px cells (20 px art at 2x), 2601 cells, never
// cleared; every ghost's live AND caught face is painted the moment it joins (the lobby), and the GPU copy is
// re-uploaded at most every 300 ms, so a reveal never paints or uploads anything new.
import * as THREE from "three"
import { drawAvatar, type AvatarOpts } from "../avatar/index"

const SIZE = 2048
const CELL = 40
const COLS = Math.floor(SIZE / CELL)
const UPLOAD_MS = 300

export interface FaceUV {
  u0: number
  v0: number
  u1: number
  v1: number
}

export class Faces {
  readonly texture: THREE.CanvasTexture
  private readonly canvas = document.createElement("canvas")
  private readonly ctx: CanvasRenderingContext2D
  private readonly slots = new Map<string, number>()
  private dirty = false
  private lastUpload = 0
  private warned = false

  constructor() {
    this.canvas.width = this.canvas.height = SIZE
    this.ctx = this.canvas.getContext("2d")!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace
  }

  uv(ghostId: string, opts: AvatarOpts): FaceUV {
    const key = `${ghostId}|${opts.colorIndex ?? ""}|${opts.dim ? 1 : 0}|${opts.fire ? opts.frame ?? 0 : "-"}`
    let i = this.slots.get(key)
    if (i === undefined) {
      i = this.slots.size
      if (i >= COLS * COLS) {
        if (!this.warned) console.error(`[stage3d] face atlas full (${COLS * COLS} faces): reusing cell 0`)
        this.warned = true
        i = 0
      } else {
        this.slots.set(key, i)
        drawAvatar(this.ctx, ghostId, CELL, { ...opts, x: (i % COLS) * CELL, y: Math.floor(i / COLS) * CELL })
        this.dirty = true
      }
    }
    const x = (i % COLS) * CELL
    const y = Math.floor(i / COLS) * CELL
    return { u0: x / SIZE, u1: (x + CELL) / SIZE, v0: 1 - (y + CELL) / SIZE, v1: 1 - y / SIZE }
  }

  /** Once per frame: push new faces to the GPU, at most every 300 ms. */
  flush(now: number): void {
    if (!this.dirty || now - this.lastUpload < UPLOAD_MS) return
    this.dirty = false
    this.lastUpload = now
    this.texture.needsUpdate = true
  }
}
