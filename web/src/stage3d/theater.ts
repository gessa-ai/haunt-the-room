// The two live-3D showpieces a pre-render can't do, embeddable anywhere (lane L7 can mount them in /stage):
//   playIntroShot(el)            ~6.5 s: push in on the house under the moon while the wisps pour in through the
//                                door and the rooms light one by one, then glide into the rooms.
//   playFinaleShot(el, winner)   ~7 s: ghosts = the rooms flood blood red one by one, the moon turns, the wisps
//                                rise and swirl, the camera pulls back; hunters = the rooms go dark one by one
//                                under the flashlights and the wisps burst and sink.
// Each returns { done, stop }: `done` resolves when the shot ends (the last frame holds until stop()).
// Same house (L15 house.glb or the stand-in), wisps, cones and dither pass as /stage3d.
import * as THREE from "three"
import { GHOST_COLORS, ROOMS, type GhostTuple, type RoomId } from "../../../contract/protocol"
import { buildHouse, type House, type Pose } from "./house"
import { Hunters } from "./hunters"
import { createPost } from "./post"
import { Wisps } from "./wisps"

export interface Shot {
  done: Promise<void>
  stop(): void
}
export const INTRO_MS = 6500
export const FINALE_MS = 7000

const IDS = ROOMS.map((r) => r.id) as RoomId[]
const BOTTOM_UP: RoomId[] = ["crypt", "chapel", "ballroom", "library", "nursery", "attic"]
const BLOOD = new THREE.Color("#c41a2c")
const ease = (x: number) => x * x * (3 - 2 * x)

interface Key {
  t: number // seconds
  pose: Pose
}
function sample(keys: Key[], t: number, out: Pose): void {
  if (t <= keys[0].t) return copyPose(keys[0].pose, out)
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]
    const b = keys[i]
    if (t <= b.t) {
      const k = ease((t - a.t) / (b.t - a.t))
      out.pos.lerpVectors(a.pose.pos, b.pose.pos, k)
      out.quat.slerpQuaternions(a.pose.quat, b.pose.quat, k)
      out.fov = a.pose.fov + (b.pose.fov - a.pose.fov) * k
      return
    }
  }
  copyPose(keys[keys.length - 1].pose, out)
}
function copyPose(p: Pose, out: Pose): void {
  out.pos.copy(p.pos)
  out.quat.copy(p.quat)
  out.fov = p.fov
}
function look(pos: THREE.Vector3, at: THREE.Vector3, fov: number): Pose {
  const o = new THREE.PerspectiveCamera() // a camera, so lookAt aims its -Z view axis
  o.position.copy(pos)
  o.lookAt(at)
  return { pos: pos.clone(), quat: o.quaternion.clone(), fov }
}
/** A pose moved along its own view direction (negative = pull back). */
function push(p: Pose, d: number, up = 0): Pose {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat)
  return { pos: p.pos.clone().addScaledVector(fwd, d).add(new THREE.Vector3(0, up, 0)), quat: p.quat.clone(), fov: p.fov }
}

interface Stage {
  house: House
  wisps: Wisps
  hunters: Hunters
  facade: THREE.Box3
  mid: THREE.Vector3
}
type Frame = (s: Stage, t: number, dt: number, cam: Pose, post: ReturnType<typeof createPost>) => void

function crowd(n: number): GhostTuple[] {
  const weights: Record<RoomId, number> = { attic: 0.7, nursery: 1, library: 1.5, ballroom: 2, chapel: 1.1, crypt: 1.3 }
  const total = IDS.reduce((a, r) => a + weights[r], 0)
  return Array.from({ length: n }, (_, i): GhostTuple => {
    let x = ((i * 7919) % 1000) / 1000 * total
    const room = IDS.find((r) => (x -= weights[r]) <= 0) ?? "crypt"
    return [`s${i}`, i % GHOST_COLORS.length, room, 0]
  })
}

function play(el: HTMLElement, ms: number, frame: Frame, setup: (s: Stage) => void): Shot {
  let stopped = false
  let raf = 0
  let finish = () => {}
  const done = new Promise<void>((res) => (finish = res))
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" })
  renderer.setPixelRatio(1)
  const canvas = renderer.domElement
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated"
  if (getComputedStyle(el).position === "static") el.style.position = "relative"
  el.append(canvas)
  const size = () => ({ w: Math.max(2, el.clientWidth), h: Math.max(2, el.clientHeight) })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1200)
  let disposePost = () => {}
  const stop = () => {
    stopped = true
    cancelAnimationFrame(raf)
    disposePost()
    renderer.dispose()
    canvas.remove()
    finish()
  }
  buildHouse(scene)
    .then((house) => {
      if (stopped) return
      const facade = new THREE.Box3()
      house.rooms.forEach((r) => facade.union(r.box))
      const mid = facade.getCenter(new THREE.Vector3())
      const wisps = new Wisps(house.rooms, new THREE.Vector3(mid.x, facade.min.y + 0.4, facade.max.z + 3))
      scene.add(wisps.group)
      const hunters = new Hunters(scene, facade)
      const st: Stage = { house, wisps, hunters, facade, mid }
      setup(st)
      let { w, h } = size()
      renderer.setSize(w, h, false)
      const post = createPost(renderer, scene, camera, w, h)
      disposePost = () => post.composer.dispose()
      const cam: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40 }
      const t0 = performance.now()
      let last = t0
      let frames = 0
      const tick = (now: number) => {
        if (stopped) return
        const s = size()
        if (s.w !== w || s.h !== h) {
          ;({ w, h } = s)
          renderer.setSize(w, h, false)
          post.resize(w, h)
        }
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const t = Math.min(ms, now - t0) / 1000
        frame(st, t, dt, cam, post)
        hunters.update(dt, now / 1000, false)
        wisps.update(dt, now / 1000)
        camera.position.copy(cam.pos)
        camera.quaternion.copy(cam.quat)
        camera.fov = cam.fov
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        wisps.setPixelScale(h, cam.fov)
        post.render(now / 1000)
        frames++
        Object.assign(window, { __shotT: t, __s3fps: (frames * 1000) / Math.max(1, now - t0) })
        if (now - t0 >= ms) finish()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    .catch((err: unknown) => {
      console.error("[stage3d] shot failed", err)
      stop()
    })
  return { done, stop }
}

function setRoom(house: House, id: RoomId, light: number, flood: number, color?: THREE.Color): void {
  const r = house.rooms.get(id)!
  r.light.color.copy(color ?? r.color)
  r.light.intensity = light
  for (const m of r.flood) {
    m.emissive.copy(color ?? r.color)
    m.emissiveIntensity = flood
  }
}
function moonColor(house: House): THREE.Color {
  const m = house.moon.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  return m instanceof THREE.MeshStandardMaterial ? m.emissive : m.color
}

export function playIntroShot(el: HTMLElement): Shot {
  const all = crowd(260)
  let keys: Key[] = []
  return play(
    el,
    INTRO_MS,
    (s, t, _dt, cam, post) => {
      sample(keys, t, cam)
      // the crowd pours in through the door over the first 4 s
      s.wisps.sync(all.slice(0, Math.floor(all.length * Math.min(1, t / 4))))
      // the rooms wake bottom-up with a flicker, from 1.6 s
      BOTTOM_UP.forEach((id, i) => {
        const on = THREE.MathUtils.clamp((t - 1.6 - i * 0.35) / 0.3, 0, 1)
        const flick = on > 0 && on < 1 ? (Math.random() < 0.5 ? 0.2 : 1) : 1
        setRoom(s.house, id, on * 3 * flick, on * 0.04)
      })
      s.house.moonLight.intensity = 1.1
      post.dither.uniforms.uFlash.value = Math.max(0, 0.25 - t * 0.25) // fade up from a pale flash
    },
    (s) => {
      const ov = s.house.cams.get("overview")!
      // far back over the lawn: a small black house under the huge moon, then the long push in
      const far = look(ov.pos.clone().add(new THREE.Vector3(-2, 3, 24)), s.mid.clone().add(new THREE.Vector3(-4, 7, 0)), 34)
      keys = [
        { t: 0, pose: far },
        { t: 3.2, pose: push(ov, -4, 0.5) },
        { t: 4.6, pose: push(ov, 14) },
        { t: 5.6, pose: s.house.cams.get("library")! },
        { t: 6.5, pose: s.house.cams.get("ballroom")! },
      ]
      IDS.forEach((id) => setRoom(s.house, id, 0, 0))
    },
  )
}

export function playFinaleShot(el: HTMLElement, winner: "ghosts" | "hunters"): Shot {
  const all = crowd(300)
  let keys: Key[] = []
  const flipped = new Set<RoomId>()
  const moonFrom = new THREE.Color()
  return play(
    el,
    FINALE_MS,
    (s, t, dt, cam, post) => {
      sample(keys, t, cam)
      const tint = post.dither.uniforms.uTint.value as THREE.Vector3
      let flash = (post.dither.uniforms.uFlash.value as number) * Math.exp(-5 * dt)
      BOTTOM_UP.forEach((id, i) => {
        const at = 0.6 + i * 0.5
        if (t >= at && !flipped.has(id)) {
          flipped.add(id)
          flash = winner === "ghosts" ? 0.3 : 0.18
          if (winner === "hunters") {
            const room = s.house.rooms.get(id)!
            s.hunters.rigs.forEach((r, j) => s.hunters.aimAt(r.id, room.center.clone().add(new THREE.Vector3((j - 1.5) * 1.2, -0.6, 0)), false))
            all.forEach((g) => g[2] === id && (g[3] |= 1))
            s.wisps.sync(all)
            s.wisps.burstRoom(id)
          }
        }
        const k = flipped.has(id) ? Math.min(1, (t - at) / 0.4) : 0
        if (winner === "ghosts") setRoom(s.house, id, 2 + k * (45 + 8 * Math.sin(t * 11 + i)), k * 0.45, k > 0 ? BLOOD : undefined)
        else setRoom(s.house, id, 2.5 * (1 - k), 0)
      })
      if (winner === "ghosts") {
        s.wisps.swirl = Math.min(1, Math.max(0, (t - 3.5) / 2.5))
        moonColor(s.house).lerpColors(moonFrom, new THREE.Color(0xff2a1a), Math.min(1, t / 4))
        const r = Math.min(1, t / 3.6)
        tint.set(1 + 0.3 * r, 1 - 0.3 * r, 1 - 0.3 * r)
      } else {
        if (t > 4.2) s.hunters.off()
        tint.set(0.85, 0.92, 1.12)
      }
      post.dither.uniforms.uFlash.value = flash
    },
    (s) => {
      s.wisps.sync(all)
      s.wisps.settle()
      moonFrom.copy(moonColor(s.house))
      const ov = s.house.cams.get("overview")!
      keys = [
        { t: 0, pose: push(ov, 12) },
        { t: 3.4, pose: push(ov, 3, 0.5) },
        { t: 7, pose: push(ov, -16, 5) },
      ]
      IDS.forEach((id) => setRoom(s.house, id, 2.5, 0))
    },
  )
}
