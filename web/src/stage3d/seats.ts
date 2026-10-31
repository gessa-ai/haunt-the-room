// MUSICAL CHAIRS on the 3D board: every room shows RoomState.cap seats as candles on its floor, in rows from the
// front lip back. A taken seat burns (warm flame in the room's colour) with its ghost hovering over it; a free seat
// is a cold stub. The count reads without numbers: how much of the floor is lit. One Points cloud for all flames.
import * as THREE from "three"
import { ROOMS, roomCapacity, type RoomId } from "../../../contract/protocol"
import type { RoomRig } from "./house"

const MAX_PER_ROOM = 256
const IDS = ROOMS.map((r) => r.id) as RoomId[]

const VERT = `attribute vec3 aColor; attribute float aSize; varying vec3 vColor; uniform float uScale;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`
// a little teardrop flame: narrow at the top, round at the bottom
const FRAG = `varying vec3 vColor;
void main(){ vec2 p = gl_PointCoord - vec2(0.5, 0.62); p.x *= 1.0 + max(0.0, -p.y) * 2.2; float d = length(p) * 2.3; if (d > 1.0) discard;
  gl_FragColor = vec4(vColor * pow(1.0 - d, 1.4) * 1.6, 1.0); }`

export class Seats {
  readonly group = new THREE.Group()
  private readonly pos = new Float32Array(IDS.length * MAX_PER_ROOM * 3)
  private readonly col = new Float32Array(IDS.length * MAX_PER_ROOM * 3)
  private readonly size = new Float32Array(IDS.length * MAX_PER_ROOM)
  private readonly geo = new THREE.BufferGeometry()
  private readonly mat: THREE.ShaderMaterial
  private readonly stubs: THREE.InstancedMesh
  private readonly caps = new Map<RoomId, number>()
  private readonly filled = new Map<RoomId, number>()
  private layoutKey = ""

  constructor(private readonly rooms: Map<RoomId, RoomRig>) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3))
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1))
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 1000 } } })
    const flames = new THREE.Points(this.geo, this.mat)
    flames.frustumCulled = false
    this.stubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 }), IDS.length * MAX_PER_ROOM)
    this.stubs.count = 0
    this.stubs.frustumCulled = false
    this.group.add(this.stubs, flames)
  }

  setPixelScale(k: number): void {
    this.mat.uniforms.uScale.value = k
  }

  cap(room: RoomId): number {
    return this.caps.get(room) ?? 0
  }

  /** Floor position of seat `i` in `room` for the current cap (also where that ghost hovers). */
  seat(room: RoomId, i: number): THREE.Vector3 {
    const cap = Math.max(1, this.caps.get(room) ?? 1)
    const b = this.rooms.get(room)!.box
    const w = b.max.x - b.min.x
    const d = b.max.z - b.min.z
    // at most 3 rows, filled column by column from the left: a room's seats read as a bar of light filling up
    const rows = Math.min(3, cap)
    const cols = Math.ceil(cap / rows)
    const c = Math.floor(i / rows)
    const r = i % rows
    return new THREE.Vector3(b.min.x + (w * (c + 0.5)) / cols, b.min.y + 0.11, b.max.z - 0.3 - (Math.min(d, 1.8) * (r + 0.5)) / rows)
  }

  apply(rooms: { id: RoomId; cap: number; count: number }[], online: number): void {
    for (const r of rooms) {
      // a House that predates the seats field still gets seats: the contract's own formula
      const cap = Number.isFinite(r.cap) ? r.cap : roomCapacity(online)
      if (!Number.isFinite(r.cap)) console.warn(`[stage3d] room ${r.id} has no cap; using roomCapacity(${online}) = ${cap}`)
      this.caps.set(r.id, Math.min(MAX_PER_ROOM, Math.max(1, cap)))
      this.filled.set(r.id, Math.min(r.count, this.caps.get(r.id) ?? 0))
    }
    const key = IDS.map((id) => this.caps.get(id) ?? 0).join(",")
    if (key === this.layoutKey) return
    this.layoutKey = key
    const m = new THREE.Matrix4()
    let n = 0
    for (const id of IDS) {
      const cap = this.caps.get(id) ?? 0
      for (let i = 0; i < cap; i++) {
        const p = this.seat(id, i)
        m.makeTranslation(p.x, p.y, p.z)
        this.stubs.setMatrixAt(n, m)
        this.pos.set([p.x, p.y + 0.2, p.z], n * 3)
        n++
      }
    }
    this.stubs.count = n
    this.stubs.instanceMatrix.needsUpdate = true
    this.geo.setDrawRange(0, n)
    ;(this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
  }

  update(t: number, flood: (id: RoomId) => boolean): void {
    let n = 0
    for (const id of IDS) {
      const cap = this.caps.get(id) ?? 0
      const lit = this.filled.get(id) ?? 0
      const rc = this.rooms.get(id)!.color
      const red = flood(id)
      for (let i = 0; i < cap; i++) {
        const on = i < lit
        const f = on ? 0.85 + 0.15 * Math.sin(t * 13 + i * 2.3) : 0.1
        // a lit seat: warm candle core tinted toward the room colour; a free seat: a faint cold ember
        // a free seat is a dim mark in the room's colour, so the empty part of the bar still reads
        const r = on ? (red ? 1 : 0.55 + rc.r * 0.6) : rc.r * 2
        const g = on ? (red ? 0.25 : 0.4 + rc.g * 0.5) : rc.g * 2
        const b = on ? (red ? 0.2 : 0.15 + rc.b * 0.6) : rc.b * 2
        this.col.set([r * f, g * f, b * f], n * 3)
        this.size[n] = on ? 0.5 : 0.3
        n++
      }
    }
    ;(this.geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true
  }
}
