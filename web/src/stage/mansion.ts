// The mansion cross-section: sky, rain, roof and clock tower, six painted rooms in ROOM_STYLE frames, floor beams,
// the central stairwell, the front door. Per-room beats for THE LOOP: hiding counts glow in the room colour, the
// house dims while the hunters choose, flashlight beams slam onto the swept rooms, safe rooms glow, possessed
// rooms flood with their colour.
import { Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js"
import { ROOM_STYLE, type RoomId, type RoomState } from "../../../contract/protocol"
import {
  BEAM,
  CLOCK,
  DOOR,
  EAVES_Y,
  FLOOR_H,
  GROUND_Y,
  HOUSE_L,
  HOUSE_R,
  MANSION_W,
  ROOM_BOXES,
  ROOM_IDS,
  SHAFT_L,
  SHAFT_R,
  STAGE_H,
  hexToNum,
  type RoomBox,
} from "./layout"
import { bandTexture, coneTexture, rainTexture, roomPlaceholder, skyPlaceholder } from "./textures"

interface RoomView {
  box: RoomBox
  color: number
  painting: Sprite
  tint: ColorMatrixFilter
  flash: Sprite
  wipe: Sprite
  wash: Sprite // room-colour wash (possessed) / white (safe glow)
  beam: Sprite // a hunter's flashlight from above, slammed onto a swept room
  outline: Graphics
  possessed: boolean
  possessK: number
  flashT: number
  wipeT: number
  lure: number
  beamT: number // seconds since the beam slammed (-1 = off)
  safeT: number // seconds of safe glow left
}

function coverTexture(tex: Texture, w: number, h: number): Texture {
  const s = Math.max(w / tex.width, h / tex.height)
  const fw = w / s
  const fh = h / s
  return new Texture({ source: tex.source, frame: new Rectangle((tex.width - fw) / 2, (tex.height - fh) / 2, fw, fh) })
}

/** Load /art/<file>; on a miss keep the placeholder and look again later (the art lane delivers during the day). */
function loadArt(url: string, apply: (t: Texture) => void): void {
  const attempt = (): void => {
    Assets.load<Texture>(url).then(apply, () => window.setTimeout(attempt, 15_000))
  }
  attempt()
}

/** Possessed: the painting floods with the room's colour (k = 0 normal .. 1 full). */
function possessMatrix(f: ColorMatrixFilter, color: number, k: number): void {
  const r = ((color >> 16) & 255) / 255
  const g = ((color >> 8) & 255) / 255
  const b = (color & 255) / 255
  const a = 1 - k
  const L = [0.3, 0.59, 0.11]
  f.matrix = [
    a + k * L[0] * r * 1.6, k * L[1] * r * 1.6, k * L[2] * r * 1.6, 0, k * r * 0.08,
    k * L[0] * g * 1.6, a + k * L[1] * g * 1.6, k * L[2] * g * 1.6, 0, k * g * 0.08,
    k * L[0] * b * 1.6, k * L[1] * b * 1.6, a + k * L[2] * b * 1.6, 0, k * b * 0.08,
    0, 0, 0, 1, 0,
  ]
}

export class Mansion {
  readonly world = new Container() // shaken as a whole
  readonly roomLayer = new Container()
  private beams = new Container()
  readonly wispLayer = new Container()
  readonly fxLayer = new Container()
  private sky: Sprite
  private rain: TilingSprite
  private lightning: Sprite
  private lightningT = 0
  private nextLightning = 12
  private rooms = new Map<RoomId, RoomView>()
  private dim = new Sprite(Texture.WHITE)
  private dimK = 0
  private dimTo = 0
  private shakeT = 0
  private shakeAmp = 0
  private doorGlow: Sprite
  private doorGlowT = 0
  private time = 0

  constructor() {
    this.sky = new Sprite(skyPlaceholder(MANSION_W, STAGE_H))
    this.sky.width = MANSION_W
    this.sky.height = STAGE_H
    loadArt("/art/sky.webp", (t) => {
      this.sky.texture = coverTexture(t, MANSION_W, STAGE_H)
      this.sky.width = MANSION_W
      this.sky.height = STAGE_H
    })
    this.rain = new TilingSprite({ texture: rainTexture(), width: MANSION_W, height: STAGE_H })
    this.rain.alpha = 0.55
    this.lightning = new Sprite(Texture.WHITE)
    this.lightning.width = MANSION_W
    this.lightning.height = STAGE_H
    this.lightning.tint = 0xcfd6ff
    this.lightning.alpha = 0
    this.lightning.blendMode = "add"

    const back = new Graphics()
    // house body behind the rooms
    back.rect(HOUSE_L, EAVES_Y, HOUSE_R - HOUSE_L, GROUND_Y - EAVES_Y).fill(0x0b0810)
    // stairwell: dark hall with a zig-zag stair per floor
    back.rect(SHAFT_L, EAVES_Y, SHAFT_R - SHAFT_L, GROUND_Y - EAVES_Y).fill(0x110c17)
    for (let f = 0; f < 3; f++) {
      const top = EAVES_Y + f * FLOOR_H + BEAM
      const bot = EAVES_Y + (f + 1) * FLOOR_H - BEAM / 2
      const ltr = f % 2 === 0
      const steps = 9
      const pts: number[] = []
      for (let s = 0; s <= steps; s++) {
        const x = ltr ? SHAFT_L + 8 + (s * (SHAFT_R - SHAFT_L - 16)) / steps : SHAFT_R - 8 - (s * (SHAFT_R - SHAFT_L - 16)) / steps
        const y = bot - (s * (bot - top - 20)) / steps
        pts.push(x, y)
      }
      back.poly(pts, false).stroke({ width: 5, color: 0x2a2033, alpha: 0.9 })
    }

    const front = new Graphics()
    // ground, foundation, a path to the door
    front.rect(0, GROUND_Y, MANSION_W, STAGE_H - GROUND_Y).fill(0x050407)
    front.rect(HOUSE_L - 18, GROUND_Y - 4, HOUSE_R - HOUSE_L + 36, 16).fill(0x16111a)
    for (let x = 0; x < MANSION_W; x += 7) {
      const h = 6 + ((x * 7919) % 13)
      front.poly([x, GROUND_Y + 2, x + 3, GROUND_Y - h, x + 6, GROUND_Y + 2]).fill(0x050407)
    }
    // outer walls
    front.rect(HOUSE_L, EAVES_Y, 32, GROUND_Y - EAVES_Y).fill(0x0e0a12)
    front.rect(HOUSE_R - 32, EAVES_Y, 32, GROUND_Y - EAVES_Y).fill(0x0e0a12)
    front.rect(HOUSE_L, EAVES_Y, 3, GROUND_Y - EAVES_Y).fill({ color: 0x5b4a7a, alpha: 0.45 })
    // floor beams with joists
    for (let k = 0; k <= 3; k++) {
      const y = EAVES_Y + k * FLOOR_H - BEAM / 2
      front.rect(HOUSE_L, y, HOUSE_R - HOUSE_L, BEAM).fill(0x1c1410)
      front.rect(HOUSE_L, y, HOUSE_R - HOUSE_L, 2).fill({ color: 0x6a5236, alpha: 0.5 })
      for (let x = HOUSE_L + 20; x < HOUSE_R - 10; x += 46) front.rect(x, y + 3, 4, BEAM - 6).fill(0x0c0907)
    }
    // shaft walls
    front.rect(SHAFT_L - 6, EAVES_Y, 6, GROUND_Y - EAVES_Y).fill(0x15101a)
    front.rect(SHAFT_R, EAVES_Y, 6, GROUND_Y - EAVES_Y).fill(0x15101a)
    // roof: two gables and the clock tower, moonlit rim
    const roof = [
      60, EAVES_Y + 6, 330, 132, 548, EAVES_Y - 40, 548, 70, CLOCK.cx, -10, 758, 70, 758, EAVES_Y - 40, 980, 132,
      MANSION_W - 60, EAVES_Y + 6,
    ]
    front.poly(roof).fill(0x07060b)
    front.poly(roof, false).stroke({ width: 3, color: 0x6c5a92, alpha: 0.55 })
    front.rect(196, 150, 40, 120).fill(0x07060b)
    front.rect(1076, 140, 40, 130).fill(0x07060b)
    front.rect(192, 144, 48, 12).fill(0x07060b)
    front.rect(1072, 134, 48, 12).fill(0x07060b)
    // gable windows: warm candlelight behind four panes
    for (const gx of [330, 980]) {
      front.circle(gx, 220, 27).fill({ color: 0xffb35c, alpha: 0.85 })
      front.circle(gx, 220, 18).fill({ color: 0xffe2a8, alpha: 0.9 })
      front.rect(gx - 2, 193, 4, 54).fill(0x07060b)
      front.rect(gx - 27, 218, 54, 4).fill(0x07060b)
      front.circle(gx, 220, 27).stroke({ width: 5, color: 0x07060b })
    }
    // clock face rim (the numerals and hands are DOM)
    front.circle(CLOCK.cx, CLOCK.cy, CLOCK.r + 14).fill(0x0d0a12)
    front.circle(CLOCK.cx, CLOCK.cy, CLOCK.r + 14).stroke({ width: 3, color: 0x8a6d42, alpha: 0.8 })
    // front door
    front.roundRect(DOOR.x - DOOR.w / 2 - 8, DOOR.y - DOOR.h - 8, DOOR.w + 16, DOOR.h + 8, 38).fill(0x1c1410)
    front.roundRect(DOOR.x - DOOR.w / 2, DOOR.y - DOOR.h, DOOR.w, DOOR.h, 34).fill(0x2a1a0e)

    this.doorGlow = new Sprite(Texture.WHITE)
    this.doorGlow.anchor.set(0.5, 1)
    this.doorGlow.position.set(DOOR.x, DOOR.y)
    this.doorGlow.width = DOOR.w - 10
    this.doorGlow.height = DOOR.h - 8
    this.doorGlow.tint = 0xffc27a
    this.doorGlow.alpha = 0.12
    this.doorGlow.blendMode = "add"

    const band = bandTexture()
    const cone = coneTexture()
    for (const id of ROOM_IDS) {
      const box = ROOM_BOXES[id]
      const color = hexToNum(ROOM_STYLE[id].color)
      const layer = new Container()
      const frame = new Graphics()
      frame.rect(box.outer.x, box.outer.y, box.outer.w, box.outer.h).fill(0x140e0a)
      frame.rect(box.inner.x - 5, box.inner.y - 5, box.inner.w + 10, box.inner.h + 10).fill(color)
      frame.rect(box.inner.x - 2, box.inner.y - 2, box.inner.w + 4, box.inner.h + 4).fill(0x0b0810)
      const painting = new Sprite(roomPlaceholder(id))
      painting.position.set(box.inner.x, box.inner.y)
      painting.width = box.inner.w
      painting.height = box.inner.h
      const tint = new ColorMatrixFilter()
      possessMatrix(tint, color, 0)
      painting.filters = [tint]
      loadArt(`/art/room-${id}.webp`, (t) => {
        painting.texture = coverTexture(t, box.inner.w, box.inner.h)
        painting.width = box.inner.w
        painting.height = box.inner.h
      })
      const mk = (tex: Texture, tintC: number) => {
        const sp = new Sprite(tex)
        sp.position.set(box.inner.x, box.inner.y)
        sp.width = box.inner.w
        sp.height = box.inner.h
        sp.tint = tintC
        sp.alpha = 0
        sp.blendMode = "add"
        return sp
      }
      const wash = mk(Texture.WHITE, color)
      const flash = mk(Texture.WHITE, 0xffffff)
      const wipe = new Sprite(band)
      wipe.anchor.set(0.5, 0)
      wipe.y = box.inner.y
      wipe.height = box.inner.h
      wipe.width = 160
      wipe.tint = 0xfff1c9
      wipe.alpha = 0
      wipe.blendMode = "add"
      const outline = new Graphics()
      // the beam: apex high above the house, opening onto the room
      const beam = new Sprite(cone)
      beam.anchor.set(0.03, 0.5)
      const apex = { x: box.center.x + (box.side === 0 ? -260 : 260), y: -80 }
      beam.position.set(apex.x, apex.y)
      beam.rotation = Math.atan2(box.center.y - apex.y, box.center.x - apex.x)
      const dist = Math.hypot(box.center.y - apex.y, box.center.x - apex.x)
      beam.scale.set((dist + 120) / 512, 1.25)
      beam.tint = 0xfff4dc
      beam.alpha = 0
      beam.blendMode = "add"
      layer.addChild(frame, painting, wash, flash, wipe, outline)
      this.roomLayer.addChild(layer)
      this.beams.addChild(beam)
      this.rooms.set(id, { box, color, painting, tint, flash, wipe, wash, beam, outline, possessed: false, possessK: 0, flashT: 0, wipeT: 0, lure: 0, beamT: -1, safeT: 0 })
    }
    this.dim.width = MANSION_W
    this.dim.height = STAGE_H
    this.dim.tint = 0x000000
    this.dim.alpha = 0

    this.world.addChild(this.sky, this.rain, this.lightning, back, this.roomLayer, front, this.doorGlow, this.wispLayer, this.dim, this.beams, this.fxLayer)
  }

  applyRooms(rooms: RoomState[]): void {
    for (const r of rooms) {
      const v = this.rooms.get(r.id)
      if (v) v.possessed = r.possessed
    }
  }

  /** HUNTING: the house goes dark while the hunters choose. */
  setDim(on: boolean): void {
    this.dimTo = on ? 0.62 : 0
  }
  /** REVEAL: beams slam onto the swept rooms; every other room glows safe. */
  reveal(swept: RoomId[]): void {
    for (const [id, v] of this.rooms) {
      if (swept.includes(id)) {
        v.beamT = 0
        v.flashT = 0.8
      } else v.safeT = 2.2
    }
    this.lightningT = Math.max(this.lightningT, 0.18)
  }
  clearReveal(): void {
    for (const v of this.rooms.values()) {
      v.beamT = -1
      v.safeT = 0
    }
  }
  lure(room: RoomId): void {
    const v = this.rooms.get(room)
    if (v) v.lure = 2.4
  }
  cleanse(room: RoomId): void {
    const v = this.rooms.get(room)
    if (v) v.wipeT = 0.9
  }
  shake(amp: number, seconds: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp)
    this.shakeT = Math.max(this.shakeT, seconds)
  }
  doorPulse(): void {
    this.doorGlowT = 0.6
  }
  isPossessed(room: RoomId): boolean {
    return this.rooms.get(room)?.possessed ?? false
  }
  colorOf(room: RoomId): number {
    return this.rooms.get(room)?.color ?? 0xffffff
  }

  update(dt: number, _now: number): void {
    this.time += dt
    this.rain.tilePosition.x -= dt * 90
    this.rain.tilePosition.y += dt * 520
    this.nextLightning -= dt
    if (this.nextLightning <= 0) {
      this.lightningT = 0.32
      this.nextLightning = 18 + Math.random() * 26
    }
    if (this.lightningT > 0) {
      this.lightningT -= dt
      const t = this.lightningT
      this.lightning.alpha = t > 0.22 ? 0.22 : t > 0.14 ? 0.04 : Math.max(0, t) * 1.6
    } else this.lightning.alpha = 0
    this.doorGlowT = Math.max(0, this.doorGlowT - dt)
    this.doorGlow.alpha = 0.1 + this.doorGlowT * 0.9 + Math.sin(this.time * 2.1) * 0.02
    this.dimK += (this.dimTo - this.dimK) * Math.min(1, dt * 4)
    this.dim.alpha = this.dimK

    for (const v of this.rooms.values()) {
      const b = v.box.inner
      v.possessK += ((v.possessed ? 0.9 : 0) - v.possessK) * Math.min(1, dt * (v.possessed ? 3 : 1.5))
      possessMatrix(v.tint, v.color, v.possessK + (v.possessed ? Math.sin(this.time * 3) * 0.05 : 0))
      v.outline.clear()
      if (v.lure > 0) {
        v.lure = Math.max(0, v.lure - dt)
        const a = (0.5 + 0.5 * Math.abs(Math.sin(this.time * 7))) * Math.min(1, v.lure)
        v.outline.rect(b.x - 6, b.y - 6, b.w + 12, b.h + 12).stroke({ width: 8, color: 0x7af0ff, alpha: a })
      }
      if (v.possessed) {
        const a = 0.65 + 0.3 * Math.sin(this.time * 4)
        v.outline.rect(b.x - 7, b.y - 7, b.w + 14, b.h + 14).stroke({ width: 10, color: v.color, alpha: a })
        v.outline.rect(b.x - 16, b.y - 16, b.w + 32, b.h + 32).stroke({ width: 5, color: v.color, alpha: a * 0.35 })
      }
      // safe glow (reveal)
      let wash = v.possessed ? 0.1 + 0.05 * Math.sin(this.time * 4) : 0
      if (v.safeT > 0) {
        v.safeT = Math.max(0, v.safeT - dt)
        wash = Math.max(wash, 0.22 * Math.min(1, v.safeT))
        v.outline.rect(b.x - 4, b.y - 4, b.w + 8, b.h + 8).stroke({ width: 6, color: 0xc8ffd9, alpha: Math.min(1, v.safeT) * 0.8 })
      }
      v.wash.alpha = wash
      // beam: slams in fast, holds, breathes
      if (v.beamT >= 0) {
        v.beamT += dt
        const slam = Math.min(1, v.beamT / 0.12)
        v.beam.alpha = slam * (0.85 + 0.15 * Math.sin(this.time * 20)) * (v.beamT > 3.6 ? Math.max(0, 1 - (v.beamT - 3.6) * 3) : 1)
      } else v.beam.alpha = 0
      if (v.flashT > 0) {
        v.flashT = Math.max(0, v.flashT - dt)
        v.flash.alpha = Math.pow(v.flashT / 0.8, 1.6)
      } else v.flash.alpha = 0
      if (v.wipeT > 0) {
        v.wipeT = Math.max(0, v.wipeT - dt)
        const p = 1 - v.wipeT / 0.9
        v.wipe.x = b.x - 80 + (b.w + 160) * p
        v.wipe.alpha = Math.sin(p * Math.PI)
      } else v.wipe.alpha = 0
    }

    if (this.shakeT > 0) {
      this.shakeT -= dt
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 2
      this.world.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a)
      if (this.shakeT <= 0) {
        this.shakeAmp = 0
        this.world.position.set(0, 0)
      }
    }
  }
}
