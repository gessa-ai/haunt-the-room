// One glowing wisp per StageSnap.ghosts entry: a single additive THREE.Points cloud (1 draw call for 1000+),
// CPU-integrated springs so a room change becomes a river of light flowing out of the cutaway into the new room.
// Caught wisps burst (a second pooled Points cloud) and sink grey to the floor.
import * as THREE from "three"
import { GHOST_COLORS, type GhostTuple, type RoomId } from "../../../contract/protocol"
import type { FaceUV, Faces } from "./faces"
import type { RoomRig } from "./house"

// lane L19's pixel faces, billboarded: the same positions as the glow, alpha-tested (crisp, depth-correct, no sort)
const FACE_VERT = `attribute float aFace; attribute vec4 aUV; attribute float aAlpha; varying vec4 vUV; varying float vA; uniform float uScale;
void main(){ vUV = aUV; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aFace * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`
const FACE_FRAG = `uniform sampler2D uAtlas; uniform float uDim; varying vec4 vUV; varying float vA;
void main(){ if (vA <= 0.0) discard; vec2 uv = vec2(mix(vUV.x, vUV.z, gl_PointCoord.x), mix(vUV.w, vUV.y, gl_PointCoord.y));
  vec4 c = texture2D(uAtlas, uv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * uDim, 1.0); }`

const MAX = 1200
const BURST_MAX = 6000
const PALETTE = GHOST_COLORS.map((c) => new THREE.Color(c))

const VERT = `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.32, 0.0, d);
  float halo = pow(1.0 - d, 2.2) * 0.55;
  gl_FragColor = vec4((vColor * (halo * 0.3 + core * 0.95) + vec3(core * 0.25)) * vAlpha, 1.0);
}`

function cloud(n: number): { points: THREE.Points; pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array; mat: THREE.ShaderMaterial } {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
  g.setDrawRange(0, 0)
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 900 } } })
  const points = new THREE.Points(g, mat)
  points.frustumCulled = false
  return { points, pos, col, size, alpha, mat }
}

interface Wisp {
  id: string
  p: THREE.Vector3
  v: THREE.Vector3
  home: THREE.Vector3 // a random spot inside its room
  room: RoomId
  color: THREE.Color
  caught: boolean
  burstDone: boolean
  phase: number
  seen: number
  ci: number
  uv: FaceUV | null
  faceKey: string
  fire: boolean
  seat: number // seat index in its room (-1 = none: hovers loose, the musical-chairs loser)
}

export class Wisps {
  readonly group = new THREE.Group()
  private readonly main = cloud(MAX)
  private readonly burst = cloud(BURST_MAX)
  private readonly bv = new Float32Array(BURST_MAX * 3)
  private readonly blife = new Float32Array(BURST_MAX)
  private bnext = 0
  private readonly byId = new Map<string, Wisp>()
  private gen = 0
  /** 0..1: dims every wisp (the hunt's darkness) */
  dim = 1
  /** finale: wisps rise and swirl around the house */
  swirl = 0

  private readonly taken = new Map<RoomId, Set<number>>()
  /** Seat layout (musical chairs); without it wisps drift loose in their room. */
  seats: { seat(room: RoomId, i: number): THREE.Vector3; cap(room: RoomId): number } | null = null

  private faces: { points: THREE.Points; uv: Float32Array; face: Float32Array; mat: THREE.ShaderMaterial; atlas: Faces } | null = null
  /** ghostIds burning (streak >= 3): their faces get L19's animated flame */
  onFire = new Set<string>()

  constructor(private readonly rooms: Map<RoomId, RoomRig>, private readonly door: THREE.Vector3) {
    this.group.add(this.main.points, this.burst.points)
  }

  /** Show lane L19's avatar faces over the glow (the glow stays as each ghost's halo). */
  useAvatars(atlas: Faces): void {
    const g = new THREE.BufferGeometry()
    const mg = this.main.points.geometry
    g.setAttribute("position", mg.getAttribute("position"))
    g.setAttribute("aAlpha", mg.getAttribute("aAlpha"))
    const uv = new Float32Array(MAX * 4)
    const face = new Float32Array(MAX)
    g.setAttribute("aUV", new THREE.BufferAttribute(uv, 4).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute("aFace", new THREE.BufferAttribute(face, 1).setUsage(THREE.DynamicDrawUsage))
    const tex = atlas.texture
    const mat = new THREE.ShaderMaterial({ vertexShader: FACE_VERT, fragmentShader: FACE_FRAG, uniforms: { uScale: { value: 1000 }, uAtlas: { value: tex }, uDim: { value: 1 } } })
    const points = new THREE.Points(g, mat)
    points.frustumCulled = false
    points.renderOrder = 2
    this.group.add(points)
    this.faces = { points, uv, face, mat, atlas }
  }

  setPixelScale(heightPx: number, fov: number): void {
    const k = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))
    this.main.mat.uniforms.uScale.value = k
    this.burst.mat.uniforms.uScale.value = k
    if (this.faces) this.faces.mat.uniforms.uScale.value = k
  }

  private homeIn(room: RoomId): THREE.Vector3 {
    const b = this.rooms.get(room)!.box
    return new THREE.Vector3(THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random()), THREE.MathUtils.lerp(b.min.y, b.max.y, Math.random() ** 1.4), THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random()))
  }

  sync(ghosts: GhostTuple[]): void {
    const gen = ++this.gen
    for (const [id, ci, room, flags] of ghosts) {
      let w = this.byId.get(id)
      if (!w) {
        if (this.byId.size >= MAX) continue
        w = { id, p: this.door.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), Math.random() * 2)), v: new THREE.Vector3(0, 2, 4), home: this.homeIn(room), room, color: PALETTE[ci % PALETTE.length], caught: false, burstDone: false, phase: Math.random() * 100, seen: gen, ci, uv: null, faceKey: "", fire: false, seat: -1 }
        this.takeSeat(w)
        this.byId.set(id, w)
        // paint this ghost's live AND caught face now (the lobby), so a reveal paints nothing
        if (this.faces) {
          this.faces.atlas.uv(id, { colorIndex: ci, dim: true })
          w.uv = this.faces.atlas.uv(id, { colorIndex: ci, dim: false })
          w.faceKey = "0|-"
        }
      }
      w.seen = gen
      if (w.room !== room) {
        this.freeSeat(w)
        w.room = room
        w.home = this.homeIn(room)
        this.takeSeat(w)
        // leave through the open front: a kick toward the camera makes the flow read as a stream
        w.v.z += 5 + Math.random() * 3
      }
      const caught = (flags & 1) === 1
      if (caught && !w.caught) w.burstDone = false
      if (!caught) w.burstDone = false
      w.caught = caught
    }
    for (const [id, w] of this.byId)
      if (w.seen !== gen) {
        this.freeSeat(w)
        this.byId.delete(id)
      }
    // seats follow the live layout (cap changes with the crowd): re-home every seated wisp
    if (this.seats) for (const w of this.byId.values()) {
      if (w.seat < 0 || w.seat >= this.seats.cap(w.room)) {
        this.freeSeat(w)
        this.takeSeat(w)
      }
      if (w.seat >= 0) w.home = this.seats.seat(w.room, w.seat).add(new THREE.Vector3(0, 0.55, 0))
    }
  }

  private takeSeat(w: Wisp): void {
    if (!this.seats) return
    const used = this.taken.get(w.room) ?? new Set<number>()
    this.taken.set(w.room, used)
    const cap = this.seats.cap(w.room)
    w.seat = -1
    for (let i = 0; i < cap; i++)
      if (!used.has(i)) {
        used.add(i)
        w.seat = i
        return
      }
  }
  private freeSeat(w: Wisp): void {
    if (w.seat >= 0) this.taken.get(w.room)?.delete(w.seat)
    w.seat = -1
  }

  /** Burst every caught wisp in `room` (the kill cam calls this when the cones slam on). Returns how many burst. */
  burstRoom(room: RoomId): number {
    let n = 0
    for (const w of this.byId.values()) {
      if (w.room !== room || !w.caught || w.burstDone) continue
      w.burstDone = true
      n++
      for (let k = 0; k < 14; k++) {
        const i = this.bnext
        this.bnext = (this.bnext + 1) % BURST_MAX
        this.burst.pos.set([w.p.x, w.p.y, w.p.z], i * 3)
        const d = new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 7)
        this.bv.set([d.x, d.y + 2, d.z], i * 3)
        this.burst.col.set([w.color.r, w.color.g, w.color.b], i * 3)
        this.burst.size[i] = 0.25 + Math.random() * 0.35
        this.blife[i] = 1
      }
    }
    return n
  }

  /** Snap every wisp to its spot in its room (a shot that starts mid-scene, not at the door). */
  settle(): void {
    for (const w of this.byId.values()) {
      w.p.copy(w.home)
      w.v.set(0, 0, 0)
    }
  }

  count(): number {
    return this.byId.size
  }

  update(dt: number, t: number): void {
    const m = this.main
    let i = 0
    const target = new THREE.Vector3()
    for (const w of this.byId.values()) {
      if (w.caught && w.burstDone) {
        // sink to the floor, grey
        const floor = this.rooms.get(w.room)!.box.min.y + 0.1
        target.set(w.home.x, floor, w.home.z)
      } else if (this.swirl > 0) {
        const a = w.phase + t * (0.4 + (w.phase % 1) * 0.6)
        const r = 14 + (w.phase % 7)
        target.set(Math.cos(a) * r, 6 + (w.phase % 13) + Math.sin(t + w.phase) * 2, Math.sin(a) * r * 0.6 + 2)
        target.lerp(w.home, 1 - this.swirl)
      } else {
        const s = w.phase
        const a = w.seat >= 0 ? 0.08 : 0.9 // seated ghosts bob over their candle; loose ones wander
        target.set(w.home.x + Math.sin(t * 0.7 + s) * a, w.home.y + Math.sin(t * 1.1 + s * 1.7) * (a + 0.06), w.home.z + Math.cos(t * 0.6 + s * 0.8) * a)
      }
      // critically-damped-ish spring with a speed cap (keeps streams coherent)
      const k = 6
      w.v.addScaledVector(target.sub(w.p), k * dt)
      w.v.multiplyScalar(Math.exp(-2.6 * dt))
      const sp = w.v.length()
      if (sp > 16) w.v.multiplyScalar(16 / sp)
      w.p.addScaledVector(w.v, dt)
      m.pos[i * 3] = w.p.x
      m.pos[i * 3 + 1] = w.p.y
      m.pos[i * 3 + 2] = w.p.z
      const grey = w.caught && w.burstDone
      const c = grey ? 0.12 : 1
      m.col[i * 3] = grey ? 0.25 : w.color.r * c
      m.col[i * 3 + 1] = grey ? 0.25 : w.color.g * c
      m.col[i * 3 + 2] = grey ? 0.3 : w.color.b * c
      // with faces on, the glow is only a halo behind the face
      const halo = this.faces ? 0.55 : 1
      m.size[i] = (grey ? 0.2 : 0.5 + 0.1 * Math.sin(t * 3 + w.phase * 5)) * (this.faces ? 1.25 : 1)
      m.alpha[i] = (grey ? 0.25 : 1) * (0.35 + 0.65 * this.dim) * halo
      i++
    }
    m.points.geometry.setDrawRange(0, i)
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) (m.points.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true
    const f = this.faces
    if (f) {
      let j = 0
      const flame = Math.floor(t / 0.14) % 3
      for (const w of this.byId.values()) {
        const fire = this.onFire.has(w.id)
        const dimmed = w.caught && w.burstDone
        const key = `${dimmed ? 1 : 0}|${fire ? flame : "-"}`
        if (key !== w.faceKey || !w.uv) {
          w.faceKey = key
          w.uv = f.atlas.uv(w.id, { colorIndex: w.ci, dim: dimmed, fire, frame: fire ? flame : undefined })
        }
        f.uv.set([w.uv.u0, w.uv.v0, w.uv.u1, w.uv.v1], j * 4)
        f.face[j] = dimmed ? 0.32 : 0.62
        j++
      }
      f.points.geometry.setDrawRange(0, j)
      ;(f.points.geometry.getAttribute("aUV") as THREE.BufferAttribute).needsUpdate = true
      ;(f.points.geometry.getAttribute("aFace") as THREE.BufferAttribute).needsUpdate = true
      f.mat.uniforms.uDim.value = 0.45 + 0.55 * this.dim
      f.atlas.flush(performance.now())
    }

    const b = this.burst
    for (let j = 0; j < BURST_MAX; j++) {
      if (this.blife[j] <= 0) {
        b.alpha[j] = 0
        continue
      }
      this.blife[j] -= dt * 0.8
      this.bv[j * 3 + 1] -= 6 * dt
      for (let a = 0; a < 3; a++) {
        this.bv[j * 3 + a] *= Math.exp(-1.8 * dt)
        b.pos[j * 3 + a] += this.bv[j * 3 + a] * dt
      }
      b.alpha[j] = Math.max(0, this.blife[j]) ** 1.5 * 1.6
    }
    b.points.geometry.setDrawRange(0, BURST_MAX)
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) (b.points.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true
  }
}
