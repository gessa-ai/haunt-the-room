// L26 VOTE3D: a transparent three.js overlay over the cabal table plate (web/public/3d/cabal/table.png).
// The hunters' vote is physical: carved tokens arc from each seat, slam onto a room of the carved map, squash,
// puff dust and shake the camera; tokens on the same room pile up. burn(rooms) sets the swept rooms' tokens on
// fire (embers, glow, smoke) and the room glows red; safe rooms get a calm pale glow.
// Camera: perspective, straight down over the plate centre, so the y=0 plane maps 1:1 onto plate px (seats.json).
// Framing: the overlay draws the plate itself on the ground (so it can zoom); at rest it matches the DOM plate
// 1:1, on the first slam the camera dollies in until the map fills ~52% of the frame height, clear() eases back.
// Look: the project's dither (fx/ditherGlsl.ts hauntDither) with dithered alpha so the overlay stays transparent.
//   const v = mount(el, seats); v.slam("medium", "crypt"); v.burn(["crypt", "attic"]); v.clear(); v.dispose()
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { HUNTERS, type HunterId, type RoomId } from "../../../contract/protocol"
import { DEFAULT_LOOK, ditherChunk } from "../fx/ditherGlsl"

export interface SeatsJson {
  size: [number, number]
  seats: Record<HunterId, [number, number]>
  map: { x: number; y: number; w: number; h: number }
  rooms: Record<RoomId, [number, number]>
  candle: [number, number]
}

export interface Vote3D {
  slam(hunter: HunterId, room: RoomId): void
  burn(rooms: RoomId[]): void
  clear(): void
  dispose(): void
}

const W = 1920
const H = 1080
const FOV = 24
const CAM_D = H / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)
const R = 38 // token radius (plate px)
const T = 15 // token thickness
const FLIGHT_MS = 620
const ZOOM = 1.58 // map 355 px of 1080 -> ~52% of the frame height
const GLYPH: Record<HunterId, string> = { exorcist: "star", medium: "eye", skeptic: "ask", priest: "cross" } as const

/** plate px -> world (x right, z down the plate, y up) */
const wx = (px: number) => px - W / 2
const wz = (py: number) => py - H / 2

function glyphTexture(hunter: HunterId, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(54, 50, 6, 64, 64, 64)
  grad.addColorStop(0, "#ffffff")
  grad.addColorStop(0.25, color)
  grad.addColorStop(1, "#1a0d08")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = "rgba(20,8,4,0.85)"
  g.lineWidth = 6
  g.beginPath()
  g.arc(64, 64, 52, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = "#1a0b06"
  g.strokeStyle = "#1a0b06"
  g.lineWidth = 9
  g.lineCap = "round"
  g.lineJoin = "round"
  const kind = GLYPH[hunter]
  g.beginPath()
  if (kind === "star") {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5
      const x = 64 + Math.cos(a) * 36
      const y = 66 + Math.sin(a) * 36
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.stroke()
  } else if (kind === "eye") {
    g.moveTo(24, 64)
    g.quadraticCurveTo(64, 26, 104, 64)
    g.quadraticCurveTo(64, 102, 24, 64)
    g.stroke()
    g.beginPath()
    g.arc(64, 64, 11, 0, Math.PI * 2)
    g.fill()
  } else if (kind === "ask") {
    g.arc(64, 50, 20, Math.PI * 1.1, Math.PI * 0.45)
    g.lineTo(64, 80)
    g.stroke()
    g.beginPath()
    g.arc(64, 98, 6, 0, Math.PI * 2)
    g.fill()
  } else {
    g.moveTo(64, 24)
    g.lineTo(64, 106)
    g.moveTo(38, 50)
    g.lineTo(90, 50)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // extrude cap UVs are raw shape coords in [-R*1.1, R*1.1]
  const span = R * 2
  tex.repeat.set(1 / span, 1 / span)
  tex.offset.set(0.5, 0.5)
  return tex
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.55, "rgba(255,255,255,0.85)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

const DITHER_FRAG = `uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uCell;
uniform float uTime;
uniform vec4 uLook;
varying vec2 vUv;
${ditherChunk()}
void main() {
  vec2 px = vUv * uResolution;
  vec2 cellId = floor(px / max(1.0, uCell));
  vec2 uv = (cellId + 0.5) * max(1.0, uCell) / uResolution;
  vec4 src = texture2D(tDiffuse, uv);
  float a = src.a;
  float th = hauntBayer8(cellId);
  if (a < 0.02 || a < th * 0.9) discard;
  vec3 c = src.rgb / max(a, 0.001);
  gl_FragColor = vec4(hauntDither(c, cellId, uTime, uLook), 1.0);
}`

interface Token {
  hunter: HunterId
  room: RoomId
  mesh: THREE.Group
  body: THREE.Mesh
  from: THREE.Vector3
  to: THREE.Vector3
  spin: number
  t0: number
  landed: boolean
  landT: number
  burning: boolean
  emberAcc: number
}

interface Particle {
  alive: boolean
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  max: number
  size: number
  color: THREE.Color
  kind: 0 | 1 | 2 // dust, ember, smoke
}

export function mount(el: HTMLElement, seats: SeatsJson): Vote3D {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const canvas = renderer.domElement
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" })
  el.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 10, CAM_D * 2)
  const camBase = new THREE.Vector3(0, CAM_D, 0)
  camera.position.copy(camBase)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)

  // light: warm candle point light at the plate's candle + a dim cool fill so the dark sides still read
  const [cx, cy] = seats.candle
  const candle = new THREE.PointLight(0xffb060, 3.4, 0, 0)
  candle.position.set(wx(cx), 170, wz(cy))
  candle.castShadow = true
  candle.shadow.mapSize.set(1024, 1024)
  candle.shadow.radius = 6
  candle.shadow.camera.near = 5
  candle.shadow.camera.far = 1200
  scene.add(candle)
  scene.add(new THREE.HemisphereLight(0xd8cce8, 0x402010, 1.6))

  // the plate itself (same image as the DOM plate) so the camera can dolly in without tokens drifting off the map
  const plateMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: new THREE.Color(1.8, 1.7, 1.75) }) // lifted: the dither crushes the dark plate tones
  new THREE.TextureLoader().load(
    "/3d/cabal/table.png",
    (t) => { t.colorSpace = THREE.SRGBColorSpace; plateMat.map = t; plateMat.opacity = 1; plateMat.needsUpdate = true },
    undefined,
    (e) => console.error("[vote3d] plate failed to load", e),
  )
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(W, H), plateMat)
  plate.rotation.x = -Math.PI / 2
  plate.position.y = -0.5
  scene.add(plate)
  const mapC = new THREE.Vector3(wx(seats.map.x + seats.map.w / 2), 0, wz(seats.map.y + seats.map.h / 2))
  let zoomCur = 1
  let zoomTarget = 1
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShadowMaterial({ opacity: 0.55 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // room glow quads (burn red / safe pale), sized to the map cell
  const cellW = seats.map.w / 2
  const cellH = seats.map.h / 3
  const glowTex = glowTexture()
  const roomGlow = new Map<RoomId, THREE.Mesh>()
  for (const [room, [rx, ry]] of Object.entries(seats.rooms) as [RoomId, [number, number]][]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(cellW * 1.25, cellH * 1.25),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff2a10 }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(wx(rx), 0.5, wz(ry))
    m.visible = false
    scene.add(m)
    roomGlow.set(room, m)
  }

  // token assets per hunter
  const shape = new THREE.Shape().absarc(0, 0, R, 0, Math.PI * 2, false)
  const tokenGeo = new THREE.ExtrudeGeometry(shape, { depth: T - 6, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 3, curveSegments: 40 })
  tokenGeo.rotateX(-Math.PI / 2) // extrude along +y
  tokenGeo.translate(0, 3, 0) // bottom bevel sits on y=0
  const mats = new Map<HunterId, THREE.MeshStandardMaterial[]>()
  for (const h of HUNTERS) {
    const cap = new THREE.MeshStandardMaterial({ map: glyphTexture(h.id, h.color), roughness: 0.45, metalness: 0.1, emissive: 0x000000 })
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(h.color).multiplyScalar(0.55), roughness: 0.6, metalness: 0.1, emissive: 0x000000 })
    mats.set(h.id, [cap, side])
  }

  // particles: one Points cloud, CPU-updated pool
  const MAXP = 900
  const parts: Particle[] = Array.from({ length: MAXP }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1, color: new THREE.Color(), kind: 0 }))
  const pPos = new Float32Array(MAXP * 3)
  const pCol = new Float32Array(MAXP * 4)
  const pSize = new Float32Array(MAXP)
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 4))
  pGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1))
  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 1 } },
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale * (${CAM_D.toFixed(1)} / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = vC.a * smoothstep(1.0, 0.2, d); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * a, a); }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
  const points = new THREE.Points(pGeo, pMat)
  points.frustumCulled = false
  scene.add(points)
  let pCursor = 0
  function emit(kind: 0 | 1 | 2, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: number) {
    const q = parts[pCursor]
    pCursor = (pCursor + 1) % MAXP
    q.alive = true
    q.kind = kind
    q.p.copy(p)
    q.v.copy(v)
    q.life = 0
    q.max = life
    q.size = size
    q.color.setHex(color)
  }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }))
  const rp = new RenderPass(scene, camera)
  rp.clearColor = new THREE.Color(0, 0, 0)
  rp.clearAlpha = 0
  composer.addPass(rp)
  const dither = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(W, H) },
      uCell: { value: 3 },
      uTime: { value: 0 },
      uLook: { value: new THREE.Vector4(DEFAULT_LOOK.spread, DEFAULT_LOOK.drift, DEFAULT_LOOK.gamma, DEFAULT_LOOK.contrast) },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: DITHER_FRAG,
  })
  composer.addPass(dither)

  let cssW = 0
  let cssH = 0
  function resize() {
    const r = el.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    if (w === cssW && h === cssH) return
    cssW = w
    cssH = h
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)
    dither.uniforms.uResolution.value.set(w, h)
    dither.uniforms.uCell.value = Math.max(1, Math.round((3 * h) / H))
    pMat.uniforms.uScale.value = (h / H) * dpr
  }
  const ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()

  const tokens: Token[] = []
  let shake = 0
  const pile = new Map<RoomId, number>()

  function slam(hunter: HunterId, room: RoomId) {
    const seat = seats.seats[hunter]
    const target = seats.rooms[room]
    if (!seat || !target) throw new Error(`vote3d: unknown hunter ${hunter} or room ${room}`)
    zoomTarget = ZOOM
    const n = pile.get(room) ?? 0
    pile.set(room, n + 1)
    const ang = n * 2.4
    const jitter = n === 0 ? 0 : 18
    const to = new THREE.Vector3(wx(target[0]) + Math.cos(ang) * jitter, n * T, wz(target[1]) + Math.sin(ang) * jitter)
    const from = new THREE.Vector3(wx(seat[0]), 260, wz(seat[1]))
    const body = new THREE.Mesh(tokenGeo, mats.get(hunter)!.map((m) => m.clone()))
    body.castShadow = true
    body.receiveShadow = true
    const mesh = new THREE.Group()
    mesh.add(body)
    mesh.position.copy(from)
    scene.add(mesh)
    tokens.push({ hunter, room, mesh, body, from, to, spin: (Math.random() < 0.5 ? -1 : 1) * (Math.PI * 2 + Math.random()), t0: performance.now(), landed: false, landT: 0, burning: false, emberAcc: 0 })
  }

  function land(tk: Token, now: number) {
    tk.landed = true
    tk.landT = now
    shake = 1
    const at = tk.mesh.position
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + Math.random() * 0.2
      const s = 110 + Math.random() * 120
      emit(0, new THREE.Vector3(at.x + Math.cos(a) * R, at.y + 2, at.z + Math.sin(a) * R), new THREE.Vector3(Math.cos(a) * s, 30 + Math.random() * 60, Math.sin(a) * s), 0.55 + Math.random() * 0.35, 14 + Math.random() * 12, 0xb8a080)
    }
  }

  function burn(rooms: RoomId[]) {
    const swept = new Set(rooms)
    for (const [room, m] of roomGlow) {
      const mat = m.material as THREE.MeshBasicMaterial
      mat.color.setHex(swept.has(room) ? 0xff2a10 : 0x9fc8ff)
      m.userData.burn = swept.has(room)
      m.userData.t0 = performance.now()
      m.visible = true
    }
    for (const tk of tokens) {
      if (!swept.has(tk.room)) continue
      tk.burning = true
      for (const m of tk.body.material as THREE.MeshStandardMaterial[]) m.emissive.setHex(0xff3a08)
    }
  }

  function clear() {
    for (const tk of tokens) {
      scene.remove(tk.mesh)
      for (const m of tk.body.material as THREE.Material[]) m.dispose()
    }
    tokens.length = 0
    zoomTarget = 1
    pile.clear()
    for (const p of parts) p.alive = false
    for (const m of roomGlow.values()) m.visible = false
  }

  const easeOut = (x: number) => 1 - (1 - x) ** 3
  let last = performance.now()
  let raf = 0
  const tmp = new THREE.Vector3()
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const ts = now / 1000
    for (const tk of tokens) {
      const k = Math.min(1, (now - tk.t0) / FLIGHT_MS)
      if (!tk.landed) {
        // horizontal glides out fast, vertical falls with gravity after a lift: a heavy lob
        const h = easeOut(k)
        tk.mesh.position.lerpVectors(tk.from, tk.to, h)
        tk.mesh.position.y = THREE.MathUtils.lerp(tk.from.y, tk.to.y, k * k) + Math.sin(k * Math.PI) * 220
        tk.mesh.rotation.set(Math.sin(k * Math.PI) * 0.9, tk.spin * (1 - h), Math.sin(k * Math.PI * 1.5) * 0.5)
        if (k >= 1) {
          tk.mesh.position.copy(tk.to)
          tk.mesh.rotation.set(0, 0, 0)
          land(tk, now)
        }
      } else {
        const s = (now - tk.landT) / 1000
        const sq = s < 0.45 ? Math.exp(-s * 9) * Math.cos(s * 34) : 0
        tk.mesh.scale.set(1 + sq * 0.22, 1 - sq * 0.45, 1 + sq * 0.22)
      }
      if (tk.burning) {
        const flick = 0.75 + 0.25 * Math.sin(ts * 23 + tk.to.x) * Math.sin(ts * 7.3 + tk.to.z)
        for (const m of tk.body.material as THREE.MeshStandardMaterial[]) m.emissiveIntensity = 0.35 + flick * 0.5
        tk.emberAcc += dt * 70
        while (tk.emberAcc > 1) {
          tk.emberAcc -= 1
          tmp.set(tk.mesh.position.x + (Math.random() - 0.5) * R * 1.6, tk.mesh.position.y + T, tk.mesh.position.z + (Math.random() - 0.5) * R * 1.6)
          if (Math.random() < 0.72) emit(1, tmp, new THREE.Vector3((Math.random() - 0.5) * 50, 120 + Math.random() * 160, (Math.random() - 0.5) * 50 - 40), 0.7 + Math.random() * 0.6, 7 + Math.random() * 9, Math.random() < 0.5 ? 0xffd040 : 0xff5a10)
          else emit(2, tmp, new THREE.Vector3((Math.random() - 0.5) * 30, 70 + Math.random() * 50, -30 - Math.random() * 40), 1.4 + Math.random() * 0.8, 16 + Math.random() * 12, 0x3a3038)
        }
      }
    }
    for (const m of roomGlow.values()) {
      if (!m.visible) continue
      const mat = m.material as THREE.MeshBasicMaterial
      const up = Math.min(1, (now - (m.userData.t0 as number)) / 500)
      mat.opacity = m.userData.burn ? up * (1.0 + 0.0 * Math.sin(ts * 9 + m.position.x)) : up * (0.45 + 0.08 * Math.sin(ts * 1.6 + m.position.z))
    }
    // particles
    for (let i = 0; i < MAXP; i++) {
      const q = parts[i]
      if (q.alive) {
        q.life += dt
        if (q.life >= q.max) q.alive = false
      }
      if (!q.alive) {
        pCol[i * 4 + 3] = 0
        pSize[i] = 0
        continue
      }
      const u = q.life / q.max
      if (q.kind === 0) q.v.multiplyScalar(1 - dt * 5)
      else if (q.kind === 1) q.v.x += Math.sin(ts * 6 + i) * dt * 60
      else q.v.multiplyScalar(1 - dt * 0.8)
      q.p.addScaledVector(q.v, dt)
      pPos[i * 3] = q.p.x
      pPos[i * 3 + 1] = q.p.y
      pPos[i * 3 + 2] = q.p.z
      const a = q.kind === 0 ? 0.6 * (1 - u) : q.kind === 1 ? 1 - u * u : 0.35 * Math.sin(u * Math.PI)
      pCol[i * 4] = q.color.r
      pCol[i * 4 + 1] = q.color.g
      pCol[i * 4 + 2] = q.color.b
      pCol[i * 4 + 3] = a
      pSize[i] = q.size * (q.kind === 2 ? 1 + u * 1.6 : q.kind === 0 ? 1 + u : 1 - u * 0.5)
    }
    pGeo.attributes.position.needsUpdate = true
    pGeo.attributes.color.needsUpdate = true
    pGeo.attributes.size.needsUpdate = true
    // camera micro-shake
    zoomCur += (zoomTarget - zoomCur) * (1 - Math.exp(-dt * 5))
    const zk = (zoomCur - 1) / (ZOOM - 1)
    camBase.set(mapC.x * zk, CAM_D / zoomCur, mapC.z * zk)
    if (shake > 0.001) {
      shake *= Math.exp(-dt * 14)
      camera.position.set(camBase.x + (Math.random() - 0.5) * 9 * shake, camBase.y, camBase.z + (Math.random() - 0.5) * 9 * shake)
    } else camera.position.copy(camBase)
    candle.intensity = 3.4 + Math.sin(ts * 11) * 0.12 + Math.sin(ts * 3.1) * 0.1
    dither.uniforms.uTime.value = ts
    resize()
    composer.render()
  }
  raf = requestAnimationFrame(frame)

  return {
    slam,
    burn,
    clear,
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      clear()
      tokenGeo.dispose()
      for (const ms of mats.values()) for (const m of ms) { m.map?.dispose(); m.dispose() }
      glowTex.dispose()
      plateMat.map?.dispose()
      plateMat.dispose()
      pGeo.dispose()
      pMat.dispose()
      composer.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
