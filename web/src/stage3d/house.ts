// The house and its night. Lane L15's Blender house (web/public/3d/house.glb, nodes room_<id>, cam_<id>,
// cam_overview, room_<id>_light) when it exists; otherwise a box-model dollhouse cutaway with the same names,
// so the stage code never knows which one it got. The night (moon, stars, fog, lawn, trees) is always ours.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { ROOMS, ROOM_GRID, ROOM_STYLE, type RoomId } from "../../../contract/protocol"

export interface RoomRig {
  id: RoomId
  box: THREE.Box3 // world-space volume the wisps drift in
  center: THREE.Vector3
  light: THREE.PointLight
  flood: THREE.MeshStandardMaterial[] // wall materials that take the possession colour
  color: THREE.Color
}
export interface Pose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  fov: number
}
export interface House {
  rooms: Map<RoomId, RoomRig>
  cams: Map<string, Pose> // "overview" | RoomId
  moonLight: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  moon: THREE.Mesh
  sky: THREE.Mesh
  source: "glb" | "stand-in"
}

const IDS = ROOMS.map((r) => r.id) as RoomId[]
const RW = 9 // room width
const RH = 5 // room height
const RD = 7 // room depth
const GAP = 0.35

function poseLookingAt(pos: THREE.Vector3, at: THREE.Vector3, fov: number): Pose {
  const o = new THREE.PerspectiveCamera() // a camera, so lookAt aims its -Z view axis
  o.position.copy(pos)
  o.lookAt(at)
  return { pos: pos.clone(), quat: o.quaternion.clone(), fov }
}

function standIn(scene: THREE.Scene): Omit<House, "moonLight" | "hemi" | "moon" | "sky" | "source"> {
  const rooms = new Map<RoomId, RoomRig>()
  const cams = new Map<string, Pose>()
  const house = new THREE.Group()
  house.name = "house_standin"
  scene.add(house)
  const wood = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.9 })
  const beam = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood)
    m.position.set(x, y, z)
    house.add(m)
  }
  ROOM_GRID.forEach((row, r) =>
    row.forEach((id, c) => {
      const cx = (c === 0 ? -1 : 1) * (RW / 2 + GAP / 2)
      const cy = (2 - r) * (RH + GAP) + RH / 2 + GAP
      const g = new THREE.Group()
      g.name = `room_${id}`
      g.position.set(cx, cy, 0)
      house.add(g)
      const tint = new THREE.Color(ROOM_STYLE[id].color)
      const wallMat = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.18).add(new THREE.Color(0x15101c)), roughness: 0.85, emissive: tint, emissiveIntensity: 0 })
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.7, emissive: tint, emissiveIntensity: 0 })
      const plane = (w: number, h: number, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
        m.position.set(...pos)
        m.rotation.set(...rot)
        g.add(m)
      }
      plane(RW, RH, wallMat, [0, 0, -RD / 2], [0, 0, 0]) // back
      plane(RD, RH, wallMat, [-RW / 2, 0, 0], [0, Math.PI / 2, 0])
      plane(RD, RH, wallMat, [RW / 2, 0, 0], [0, -Math.PI / 2, 0])
      plane(RW, RD, floorMat, [0, -RH / 2, 0], [-Math.PI / 2, 0, 0])
      plane(RW, RD, wallMat, [0, RH / 2, 0], [Math.PI / 2, 0, 0])
      // a window on the back wall and a little furniture so the room reads at a glance
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ color: 0x6f8fb8 }))
      win.position.set(-RW / 4, 0.4, -RD / 2 + 0.02)
      g.add(win)
      const prop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.0), wood)
      prop.position.set(RW / 4, -RH / 2 + 0.55, -RD / 2 + 0.8)
      g.add(prop)
      const light = new THREE.PointLight(tint, 6, 16, 1.6)
      light.name = `room_${id}_light`
      light.position.set(0, RH / 2 - 0.8, -0.5)
      g.add(light)
      g.updateMatrixWorld(true)
      const center = new THREE.Vector3(cx, cy, 0)
      const box = new THREE.Box3(new THREE.Vector3(cx - RW / 2 + 0.7, cy - RH / 2 + 0.5, -RD / 2 + 0.8), new THREE.Vector3(cx + RW / 2 - 0.7, cy + RH / 2 - 0.7, RD / 2 - 1.2))
      rooms.set(id, { id, box, center, light, flood: [wallMat, floorMat], color: tint })
      cams.set(id, poseLookingAt(center.clone().add(new THREE.Vector3(0, 0.3, 9.5)), center.clone().add(new THREE.Vector3(0, -0.2, -1)), 46))
    }),
  )
  // the frame of the cutaway: floors, outer walls, roof
  const H = 3 * (RH + GAP) + GAP
  const W = 2 * RW + 3 * GAP
  for (let r = 0; r <= 3; r++) beam(W, GAP, RD, 0, r * (RH + GAP) + GAP / 2, 0)
  beam(GAP, H, RD, -W / 2 + GAP / 2, H / 2, 0)
  beam(GAP, H, RD, W / 2 - GAP / 2, H / 2, 0)
  beam(GAP, H, RD, 0, H / 2, 0)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.62, 6.5, 4, 1), new THREE.MeshStandardMaterial({ color: 0x120c16, roughness: 1 }))
  roof.rotation.y = Math.PI / 4
  roof.scale.set(1, 1, RD / W + 0.15)
  roof.position.set(0, H + 3.2, 0)
  house.add(roof)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), wood)
  tower.position.set(W / 2 - 2, H + 3.5, -1)
  house.add(tower)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), roof.material)
  spire.position.set(W / 2 - 2, H + 9.5, -1)
  spire.rotation.y = Math.PI / 4
  house.add(spire)
  const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshBasicMaterial({ color: 0xffd27a }))
  lit.position.set(W / 2 - 2, H + 3.8, 0.52)
  house.add(lit)
  cams.set("overview", poseLookingAt(new THREE.Vector3(0, 9.5, 33), new THREE.Vector3(0, 8.6, 0), 42))
  return { rooms, cams }
}

// L30: emissive strengths that read on the projector under bloom (threshold 1.0) + dither without blowing out
const GLOW_BASE: Record<string, number> = { warmglass: 1.3, glass_0: 1.4, glass_1: 1.4, glass_2: 1.4, glass_3: 1.4, glass_4: 1.4, moonglass: 1.3, bulb: 1.6, flame: 1.8, fire: 1.6, mobile_star: 1.2, sanctuary_lamp: 1.5 }
const glowMats: { m: THREE.MeshStandardMaterial; base: number; seed: number }[] = []
/** candle flicker on window glass and flames; `gain` dims them with the house light (hunting, reveal) */
export function flickerGlow(t: number, gain: number): void {
  for (const g of glowMats) {
    const f = 0.88 + 0.07 * Math.sin(t * 7.3 + g.seed) + 0.05 * Math.sin(t * 13.1 + g.seed * 2.3)
    g.m.emissiveIntensity = g.base * f * gain
  }
}

async function fromGlb(scene: THREE.Scene): Promise<Omit<House, "moonLight" | "hemi" | "moon" | "sky" | "source"> | null> {
  const head = await fetch("/3d/house.glb", { method: "HEAD" }).catch(() => null)
  if (!head?.ok || !(head.headers.get("content-type") ?? "").match(/gltf|octet|model/)) return null
  const gltf = await new GLTFLoader().loadAsync("/3d/house.glb")
  scene.add(gltf.scene)
  gltf.scene.updateMatrixWorld(true)
  // Blender emissive strengths (fire 6, flames 8, moon 3.6) blow out under bloom + dither; keep them glowing, not nuclear
  gltf.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material
    if (m instanceof THREE.MeshStandardMaterial && m.emissiveIntensity > 1) m.emissiveIntensity = o.name === "moon" ? 1.6 : 1.1
    // L30: window glass and flames glow warm and flicker like candlelight (flickerGlow); glass stays crisp (no mips blur)
    if (m instanceof THREE.MeshStandardMaterial && GLOW_BASE[m.name] !== undefined && !glowMats.some((g) => g.m === m)) {
      m.emissiveIntensity = GLOW_BASE[m.name]
      if (m.name === "warmglass") m.emissive.setRGB(1, 0.55, 0.18)
      glowMats.push({ m, base: GLOW_BASE[m.name], seed: glowMats.length * 1.7 })
    }
  })
  const rooms = new Map<RoomId, RoomRig>()
  const cams = new Map<string, Pose>()
  for (const id of IDS) {
    const node = gltf.scene.getObjectByName(`room_${id}`)
    if (!node) throw new Error(`house.glb has no node room_${id}`)
    // L15's room_<id> is an empty marker at the floor centre of a 6 w x 3.4 h x 4 d room opening toward +Z
    // (lanes/L15.md); the ghost volume is that room inset from the walls. A meshed node gives its own bounds.
    const box = new THREE.Box3().setFromObject(node)
    if (box.isEmpty()) {
      const f = node.getWorldPosition(new THREE.Vector3())
      box.set(new THREE.Vector3(f.x - 2.7, f.y + 0.3, f.z - 1.6), new THREE.Vector3(f.x + 2.7, f.y + 3.0, f.z + 1.5))
    } else box.expandByScalar(-0.6)
    const center = box.getCenter(new THREE.Vector3())
    const tint = new THREE.Color(ROOM_STYLE[id].color)
    const named = gltf.scene.getObjectByName(`room_${id}_light`)
    let light = named instanceof THREE.PointLight ? named : null
    if (!light) {
      const p = named ? named.getWorldPosition(new THREE.Vector3()) : center.clone()
      light = new THREE.PointLight(tint, 6, 16, 1.6)
      light.position.copy(p)
      scene.add(light)
    }
    light.color.copy(tint)
    const flood: THREE.MeshStandardMaterial[] = []
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      // the room's own surfaces: L15 names them wall_<id>, floor_<id>, wainscot_<id>, accent_<id>
      if (m instanceof THREE.MeshStandardMaterial && m.name.endsWith(`_${id}`) && !m.name.startsWith("curtain") && !flood.includes(m)) {
        m.emissive = tint.clone()
        m.emissiveIntensity = 0
        flood.push(m)
      }
    })
    rooms.set(id, { id, box, center, light, flood, color: tint })
  }
  const camPose = (name: string, fallback: Pose): Pose => {
    const n = gltf.scene.getObjectByName(name)
    if (!n) return fallback
    const pos = n.getWorldPosition(new THREE.Vector3())
    const quat = n.getWorldQuaternion(new THREE.Quaternion())
    // glTF cameras sit under a node: the camera itself looks down its local -Z, the same as ours
    const cam = n instanceof THREE.PerspectiveCamera ? n : (n.children.find((c) => c instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera | undefined)
    if (cam && cam !== n) cam.getWorldQuaternion(quat)
    return { pos, quat, fov: cam?.fov ?? fallback.fov }
  }
  const all = new THREE.Box3()
  rooms.forEach((r) => all.union(r.box))
  const mid = all.getCenter(new THREE.Vector3())
  cams.set("overview", camPose("cam_overview", poseLookingAt(mid.clone().add(new THREE.Vector3(0, 1, 34)), mid, 42)))
  for (const [id, r] of rooms) cams.set(id, camPose(`cam_${id}`, poseLookingAt(r.center.clone().add(new THREE.Vector3(0, 0.3, 9.5)), r.center, 46)))
  // our moon is the hero (one clean disc we can tint); L15's moon steps aside
  const theirMoon = gltf.scene.getObjectByName("moon")
  if (theirMoon) theirMoon.visible = false
  return { rooms, cams }
}

function night(scene: THREE.Scene, withLawn: boolean): Pick<House, "moonLight" | "hemi" | "moon" | "sky"> {
  scene.background = new THREE.Color(0x05060f)
  scene.fog = new THREE.FogExp2(0x0b1022, 0.008)
  // sky dome: a vertical gradient so the horizon glows under the moon
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x02030a) }, uHorizon: { value: new THREE.Color(0x1b2a4a) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6,0.0,1.0); gl_FragColor = vec4(mix(uHorizon,uTop,pow(h,0.6)),1.0); }",
    }),
  )
  scene.add(sky)
  // stars
  const n = 2600
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection()
    v.y = Math.abs(v.y) * 0.9 + 0.05
    v.normalize().multiplyScalar(360)
    pos.set([v.x, v.y, v.z], i * 3)
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })))
  // the moon: huge, low, behind the house
  const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.92, 0.84), fog: false }))
  moon.position.set(-58, 62, -260)
  scene.add(moon)
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec2 vU; void main(){ float d = length(vU-0.5)*2.0; float a = smoothstep(1.0,0.25,d)*0.28; gl_FragColor = vec4(vec3(0.55,0.68,1.0)*a,1.0); }",
    }),
  )
  halo.position.set(0, 0, 1)
  halo.scale.setScalar(1 / 1)
  moon.add(halo)
  const moonLight = new THREE.DirectionalLight(0x9db8ff, 1)
  moonLight.position.set(-30, 40, -60)
  scene.add(moonLight)
  const rim = new THREE.DirectionalLight(0x6f8fb8, 0.6)
  rim.position.set(20, 15, 40)
  scene.add(rim)
  const hemi = new THREE.HemisphereLight(0x3b4c7a, 0x0a0710, 0.6)
  scene.add(hemi)
  if (!withLawn) return { moonLight, hemi, moon, sky }
  // lawn, path, graves, dead trees (the stand-in only; L15's house brings its own)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 48), new THREE.MeshStandardMaterial({ color: 0x0e1410, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.9 })
  const bark = new THREE.MeshStandardMaterial({ color: 0x0b0809, roughness: 1 })
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1
    const g = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.7, 1.1), rnd(1, 1.8), 0.25), stone)
    g.position.set(side * rnd(13, 30), 0.5, rnd(-8, 24))
    g.rotation.set(rnd(-0.1, 0.1), rnd(-0.4, 0.4), rnd(-0.12, 0.12))
    scene.add(g)
  }
  const tree = (x: number, z: number, s: number) => {
    const t = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.6 * s, 9 * s, 6), bark)
    trunk.position.y = 4.5 * s
    t.add(trunk)
    for (let b = 0; b < 6; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.22 * s, rnd(3, 5) * s, 5), bark)
      br.position.y = rnd(5, 8.5) * s
      br.rotation.z = (b % 2 ? 1 : -1) * rnd(0.5, 1.1)
      br.rotation.y = rnd(0, Math.PI * 2)
      br.translateY(1.5 * s)
      t.add(br)
    }
    t.position.set(x, 0, z)
    scene.add(t)
  }
  tree(-21, 4, 1.4)
  tree(23, -2, 1.6)
  tree(-34, -14, 1.9)
  tree(36, 10, 1.2)
  return { moonLight, hemi, moon, sky }
}

export async function buildHouse(scene: THREE.Scene): Promise<House> {
  let built: Awaited<ReturnType<typeof fromGlb>> = null
  try {
    built = await fromGlb(scene)
  } catch (err) {
    console.error("[stage3d] house.glb failed, using the stand-in", err)
  }
  if (built) {
    return { ...built, ...night(scene, false), source: "glb" }
  }
  return { ...standIn(scene), ...night(scene, true), source: "stand-in" }
}
