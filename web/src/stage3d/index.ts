// /stage3d: the live 3D board (lane L16), a primary candidate against the 2.5D /stage. Same 1920x1080 frame as
// /stage: the three.js house fills the mansion area (left 1306 px) and lane L7's DOM HUD (clock, top bar, podium,
// feed, council, banners, intro, finale, outage) sits on top, imported as-is. The director turns each StageSnap
// into a shot: HIDE = wide on the whole house, seats (candles) light as rooms fill; HUNTING = dark, slow orbit,
// flashlight cones searching; REVEAL = KILL CAM cuts into each swept room, cones slam on, caught ghosts burst,
// then a push-in on any room that became possessed; FINALE = the house floods red (or goes dark) as the camera
// pulls back. Data: the House socket (POST /api/stage/grant) or ?fake=<loop|hide|hunting|reveal|finale>.
import * as THREE from "three"
import "../feed/fonts"
import { HUNTERS, ROOMS, ROOM_STYLE, type HouseEvent, type HunterId, type Phase, type RoomId, type StageSnap } from "../../../contract/protocol"
import { initAudio, playCue, unlockAudio } from "../audio/index"
import { createFeed } from "../feed/index"
import { createCabal } from "../cabal/index"
import { stageCaptions } from "../captions/stage"
import { Hud, el } from "../stage/hud"
import { MANSION_W, STAGE_H, STAGE_W } from "../stage/layout"
import { startPresenter } from "../stage/presenter"
import { houseSource } from "../stage/source"
import "../stage/stage.css"
import { fakeSource3d } from "./dev"
import { buildHouse, flickerGlow, type Pose } from "./house"
import { Faces } from "./faces"
import { Hunters } from "./hunters"
import { createPost } from "./post"
import { Seats } from "./seats"
import "./stage3d.css"
import { Wisps } from "./wisps"

const IDS = ROOMS.map((r) => r.id) as RoomId[]
const ROOM_NAME = new Map(ROOMS.map((r) => [r.id, r.name]))
const HUNTER_IDS = HUNTERS.map((h) => h.id)
const KILL_SLAM = [0.3, 1.75] // s into REVEAL: cut + cones slam onto swept room 0, then room 1
const KILL_BACK = 3.1 // s into REVEAL: push-in on a fresh possession, else back to wide
const BLOOD = new THREE.Color("#c41a2c")
const WARM = new THREE.Color("#ffb070")
const evKey = (e: HouseEvent) => `${e.at}|${e.kind}|${e.room ?? ""}|${e.hunter ?? ""}|${e.count ?? ""}|${e.text ?? ""}`
const randomHunter = (): HunterId => HUNTER_IDS[Math.floor(Math.random() * HUNTER_IDS.length)]

function look(pos: THREE.Vector3, at: THREE.Vector3, fov: number): Pose {
  const o = new THREE.PerspectiveCamera() // a camera, so lookAt aims its -Z view axis
  o.position.copy(pos)
  o.lookAt(at)
  return { pos: pos.clone(), quat: o.quaternion.clone(), fov }
}

export async function mountStage3d(root: HTMLElement): Promise<void> {
  const tBoot = performance.now()
  root.innerHTML = ""
  const viewport = el("div", "st-viewport")
  const st = el("div", "st s3-board")
  viewport.append(st)
  root.append(viewport)
  let scale = 1

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" })
  renderer.setPixelRatio(1)
  const canvas = renderer.domElement
  canvas.className = "s3-canvas"
  st.append(canvas)
  const feedBox = el("div", "st-feed")
  st.append(feedBox)
  // L7's HUD: its room plaques/tags/floaters live in a 2.5D camera layer we don't have; the 3D house draws rooms
  // and seats itself, so that layer stays hidden
  const camLayer = el("div", "s3-hidden")
  const hud = new Hud(st, camLayer)
  hud.setLayout("3d")
  const stampEl = el("div", "s3-stamp")
  st.append(stampEl)
  const fpsEl = new URLSearchParams(location.search).has("fps") ? el("div", "s3-fps") : null
  if (fpsEl) st.append(fpsEl)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, MANSION_W / STAGE_H, 0.1, 1200)
  const house = await buildHouse(scene)
  const facade = new THREE.Box3()
  house.rooms.forEach((r) => facade.union(r.box))
  const mid = facade.getCenter(new THREE.Vector3())
  const seats = new Seats(house.rooms)
  scene.add(seats.group)
  const wisps = new Wisps(house.rooms, new THREE.Vector3(mid.x, facade.min.y + 0.4, facade.max.z + 3))
  wisps.seats = seats
  wisps.useAvatars(new Faces())
  scene.add(wisps.group)
  const hunters = new Hunters(scene, facade)
  const post = createPost(renderer, scene, camera, MANSION_W, STAGE_H)

  // ---------- framing: the rooms fill the mansion area; the top 150 px (HUD bar, clock) sit over sky ----------
  const W_FOV = 30
  const fitDist = (halfW: number, halfH: number) => {
    const tv = Math.tan(THREE.MathUtils.degToRad(W_FOV / 2))
    return Math.max(halfH / tv, halfW / (tv * (MANSION_W / STAGE_H)))
  }
  const wideAt = new THREE.Vector3(mid.x, mid.y + 0.7, mid.z)
  const wideDist = fitDist((facade.max.x - facade.min.x) / 2 + 0.5, (facade.max.y - facade.min.y) / 2 + 2.3)
  const wide = look(new THREE.Vector3(wideAt.x, wideAt.y + 0.6, facade.max.z + wideDist), wideAt, W_FOV)
  const roomShot = (id: RoomId): Pose => {
    const r = house.rooms.get(id)!
    const c = r.box.getCenter(new THREE.Vector3())
    const d = fitDist((r.box.max.x - r.box.min.x) / 2 + 0.5, (r.box.max.y - r.box.min.y) / 2 + 0.6)
    return look(new THREE.Vector3(c.x + (c.x < mid.x ? 0.9 : -0.9), c.y + 0.5, r.box.max.z + d), c, W_FOV)
  }

  const fit = () => {
    scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
    st.style.transform = `translate(${(window.innerWidth - STAGE_W * scale) / 2}px, ${(window.innerHeight - STAGE_H * scale) / 2}px) scale(${scale})`
    // render at screen pixels (capped at 1080p-equivalent x1.25), CSS keeps the stage's 1306x1080 box
    const k = Math.min(1.25, Math.max(0.5, scale * (window.devicePixelRatio || 1)))
    const w = Math.round(MANSION_W * k)
    const h = Math.round(STAGE_H * k)
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false)
      post.resize(w, h)
    }
  }
  fit()
  window.addEventListener("resize", fit)

  // ---------- audio, presenter, feed (all lane-shared modules, imported as-is) ----------
  initAudio().catch((err: unknown) => console.error("[stage3d] initAudio failed", err))
  window.addEventListener("keydown", () => unlockAudio(), { once: true })
  viewport.addEventListener("pointerdown", () => unlockAudio(), { once: true })
  startPresenter((msg, err) => hud.toast(msg, err), () => hud.toggleQr())
  let relayMessages = 0
  const cabal = createCabal(st) // L7b: full-screen table during hunting
  const captions = stageCaptions(st, MANSION_W) // voiced taunts as captions
  const feed = createFeed(feedBox, {
    stage: true,
    onWhisper: () => playCue("whisper"),
    onItem: (i) => {
      cabal.item(i)
      relayMessages = Math.max(relayMessages + 1, i.seq ?? 0)
    },
  })
  hud.mountBoard(feed.slot)

  // ---------- camera rig ----------
  const cam: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: W_FOV }
  const goal: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: W_FOV }
  const setGoal = (p: Pose) => {
    goal.pos.copy(p.pos)
    goal.quat.copy(p.quat)
    goal.fov = p.fov
  }
  const cut = (p: Pose) => {
    setGoal(p)
    cam.pos.copy(p.pos)
    cam.quat.copy(p.quat)
    cam.fov = p.fov
  }
  cut(wide)
  // PRELOAD (owner: nothing loads mid-game): the house, its textures and every shader are ready before the first
  // beat. Cones are hidden until a hunt, so they would otherwise compile on the first reveal cut (a hitch).
  hunters.rigs.forEach((r) => (r.cone.visible = true))
  camera.position.copy(wide.pos)
  camera.quaternion.copy(wide.quat)
  renderer.compile(scene, camera)
  post.render(0)
  hunters.rigs.forEach((r) => (r.cone.visible = false))

  // ---------- director state ----------
  let snap: StageSnap | null = null
  let offset = 0
  let phase: Phase | null = null
  let phaseAt = performance.now()
  let killStep = -1
  let flash = 0
  let houseUp = true
  let first = true
  let peakOnline = 0
  let pushRoom: RoomId | null = null
  const seen = new Set<string>()
  const roomGlow = new Map<RoomId, number>(IDS.map((id) => [id, 0]))
  const clockNow = () => Date.now() + offset

  const showStamp = (room: RoomId, text: string) => {
    stampEl.style.setProperty("--c", ROOM_STYLE[room].color)
    stampEl.innerHTML = ""
    stampEl.append(el("div", "n", text), el("div", "r", ROOM_NAME.get(room) ?? room))
    stampEl.classList.remove("on")
    void stampEl.offsetWidth
    stampEl.classList.add("on")
  }
  const caughtIn = (room: RoomId) => (snap ? snap.ghosts.filter((g) => g[2] === room && (g[3] & 1) === 1).length : 0)

  const handle = (e: HouseEvent) => {
    const room = e.room
    switch (e.kind) {
      case "possessed":
        if (room) {
          roomGlow.set(room, 3)
          pushRoom = room
        }
        playCue("possessed")
        window.setTimeout(() => playCue("crash"), 380)
        captions.voice(randomHunter(), "possessed")
        break
      case "cleansed":
        playCue("cleansed")
        break
      case "taunt":
        if (e.hunter && e.text) captions.taunt(e.hunter, e.text) // caption + speak()
        break
      case "lie":
        hud.lie(e.text ?? `${e.name ?? "Someone"} lied to the hunters. It worked.`)
        playCue("whisper")
        if (e.hunter) captions.voice(e.hunter, "fooled")
        break
      case "lead":
        if (phase !== "lobby" && phase !== "finale") {
          hud.newLeader(e.name ?? "someone")
          playCue("lead")
        }
        break
      case "onfire":
        playCue("onfire")
        break
      case "join":
        playCue("join")
        break
      default:
        break
    }
  }

  const onPhase = (s: StageSnap) => {
    phase = s.phase
    phaseAt = performance.now()
    killStep = -1
    pushRoom = null
    stampEl.classList.remove("on")
    for (const c of [...st.classList]) if (c.startsWith("s3-ph-")) st.classList.remove(c)
    st.classList.add(`s3-ph-${s.phase}`)
    if (s.phase === "reveal" || s.phase === "finale" || s.phase === "lobby") playCue("tension", { level: 0 }) // L27: the cabal heartbeat never carries past the table
    hud.setPhase(s.phase)
    if (s.phase === "hide") playCue("hide", { endsAt: s.endsAt - offset })
    if (s.phase === "hunting") {
      playCue("bell")
      playCue("hunting", { endsAt: s.endsAt - offset })
      captions.voice(randomHunter(), "sweep")
    }
    if (s.phase === "reveal") {
      playCue("reveal", s.sweptRooms[0] ? { room: s.sweptRooms[0] } : {})
      hunters.off()
      window.setTimeout(() => snap && snap.phase === "reveal" && hud.slideTop5(snap), Math.max(0, s.endsAt - s.now - 1600))
    }
    if (s.phase === "intro") playCue("intro")
    if (s.phase === "finale") {
      hud.showFinale(s, relayMessages, peakOnline)
      hud.finaleShot(true) // the 3D flood plays first; the podium follows
      window.setTimeout(() => phase === "finale" && hud.finaleShot(false), 6500)
      playCue(s.winner === "hunters" ? "finale-hunters" : "finale-ghosts")
    }
    if (s.phase === "lobby") hud.showBanner("The door's open.", "Scan the code. Leave your body at the door.", "", 3)
  }

  const source = new URLSearchParams(location.search).get("fake")
  ;(source ? fakeSource3d(source) : houseSource()).start({
    snap(s) {
      cabal.snap(s)
      snap = s
      offset = s.now - Date.now()
      peakOnline = Math.max(peakOnline, s.counters.humans)
      if (s.phase !== phase) onPhase(s)
      for (const e of s.events) {
        const k = evKey(e)
        if (seen.has(k)) continue
        seen.add(k)
        if (!first) handle(e)
      }
      if (seen.size > 2000) seen.clear()
      first = false
      wisps.onFire = new Set(s.top.filter((x) => x[4] >= 3).map((x) => x[0]))
      seats.apply(s.rooms, s.counters.online)
      wisps.sync(s.ghosts)
      hud.apply(s, clockNow())
      if (s.phase === "finale") hud.showFinale(s, relayMessages, peakOnline)
    },
    status(up, why) {
      // the outage card only after a socket that WAS live drops; before the first snapshot the title card stays
      if (!up && snap === null) return console.error(`[stage3d] house not connected yet: ${why}`)
      if (up === houseUp) return
      houseUp = up
      hud.setDown(!up, clockNow(), why)
      playCue(up ? "revive" : "static")
      if (up) first = true
    },
  })

  // ---------- frame loop ----------
  const clockT = new THREE.Clock()
  let frames = 0
  let fpsAt = performance.now()
  let firstFrame = true
  const moonMat = house.moon.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  const moonC = moonMat instanceof THREE.MeshStandardMaterial ? moonMat.emissive : moonMat.color
  const moonWhite = moonC.clone()
  const roomAim = (room: RoomId) => {
    const r = house.rooms.get(room)!
    return new THREE.Vector3(r.center.x, r.box.min.y + 1, (r.box.min.z + r.box.max.z) / 2)
  }

  // ?perf: per-frame timings for the headed measurement (shots.mjs PERF=1): [ms since mount, frame ms, phase, killStep]
  const perf: [number, number, string, number][] | null = new URLSearchParams(location.search).has("perf") ? [] : null
  if (perf) Object.assign(window, { __s3perf: perf })
  let lastNow = performance.now()
  const tick = () => {
    if (perf) {
      const n = performance.now()
      perf.push([n - tBoot, n - lastNow, phase ?? "", killStep])
      lastNow = n
    }
    const dt = Math.min(0.05, clockT.getDelta())
    const t = clockT.elapsedTime
    const e = (performance.now() - phaseAt) / 1000
    const p = phase ?? "lobby"
    const s = snap
    const finale = p === "finale"
    const ghostsWin = finale && s?.winner !== "hunters"

    let moon = 1
    let hemi = 0.35
    let roomBase = 4
    let camRate = 2
    let exposure = 1
    let tint = 1
    wisps.dim = 1
    hunters.gain = p === "reveal" ? 0.3 : 1
    wisps.swirl += ((ghostsWin && e > 3 ? 1 : 0) - wisps.swirl) * (1 - Math.exp(-0.8 * dt))
    if (p === "lobby" || p === "intro") {
      // a slow drift across the facade under the moon
      const a = Math.sin(t * 0.12) * 0.22
      setGoal(look(wideAt.clone().add(new THREE.Vector3(Math.sin(a) * wideDist * 1.15, 1.5, Math.cos(a) * wideDist * 1.15 + facade.max.z)), wideAt, W_FOV))
      camRate = 1
      hunters.off()
    } else if (p === "hide") {
      setGoal(wide)
      // POKER: each hunter's open lean is a faint beam drifting onto that room (it may be a bluff; votes stay
      // hidden until reveal); no lean = beam off
      for (const h of s?.hunters ?? []) {
        if (h.lean) hunters.aimAt(h.id, roomAim(h.lean).add(new THREE.Vector3((HUNTER_IDS.indexOf(h.id) - 1.5) * 0.9, 0.6, 0)), false, 0.5)
        else hunters.aimAt(h.id, wideAt, false, 0)
      }
    } else if (p === "hunting") {
      // dark, a slow orbit (+-14 deg) and a slight push, cones searching the facade
      const a = Math.sin(e * 0.45) * 0.24
      const d = wideDist * (1 - Math.min(e, 3.5) * 0.03)
      setGoal(look(wideAt.clone().add(new THREE.Vector3(Math.sin(a) * d, 0.8, Math.cos(a) * d + facade.max.z)), wideAt, W_FOV))
      camRate = 1.4
      moon = 0.22
      hemi = 0.06
      roomBase = 0.7
      wisps.dim = 0.5
      tint = 0.9
      hunters.search()
    } else if (p === "reveal") {
      const swept = s?.sweptRooms ?? []
      moon = 0.15
      hemi = 0.05
      roomBase = 0.5
      wisps.dim = 0.7
      exposure = 0.62 // the kill cam is lit by four flashlights at close range: cap it, keep the grain
      camRate = 7
      for (let k = 0; k < Math.min(2, swept.length); k++) {
        if (e >= KILL_SLAM[k] && killStep < k) {
          killStep = k
          const room = swept[k]
          cut(roomShot(room))
          const voters = (s?.hunters ?? []).filter((h) => h.vote === room).map((h) => h.id)
          const ids: HunterId[] = voters.length ? voters : (hunters.rigs.slice(k * 2, k * 2 + 2).map((r) => r.id) as HunterId[])
          ids.forEach((id, j) => hunters.aimAt(id, roomAim(room).add(new THREE.Vector3((j - (ids.length - 1) / 2) * 1.4, 0, 0)), true))
          flash = 0.3
          const n = Math.max(wisps.burstRoom(room), caughtIn(room))
          showStamp(room, n ? `${n} CAUGHT` : "EMPTY.")
          playCue("sweep", { room })
          if (n) playCue("caught", { room })
          captions.voice(ids[0] ?? randomHunter(), n ? "caught" : "missed")
        }
      }
      if (e >= KILL_BACK && killStep < 2) {
        killStep = 2
        stampEl.classList.remove("on")
        hunters.off()
        if (pushRoom) {
          setGoal(roomShot(pushRoom))
          showStamp(pushRoom, "HAUNTED")
        } else setGoal(wide)
      }
      if (killStep >= 2) {
        camRate = 2.2
        moon = 0.7
        hemi = 0.25
        roomBase = 3.5
        exposure = 1
      }
    } else if (finale) {
      // the flood plays bottom-up while the camera pulls back from the house
      const back = Math.min(1, e / 7)
      setGoal(look(wideAt.clone().add(new THREE.Vector3(0, 1 + back * 4, facade.max.z + wideDist * (0.85 + back * 0.7))), wideAt, W_FOV))
      camRate = 1.5
      if (!ghostsWin) hunters.rigs.forEach((h, i) => hunters.aimAt(h.id, roomAim(IDS[(i + Math.floor(e / 1.2)) % IDS.length]), false))
      else hunters.off()
    }

    flickerGlow(t, Math.min(1, 0.45 + roomBase * 0.14))
    house.moonLight.intensity += (moon - house.moonLight.intensity) * (1 - Math.exp(-4 * dt))
    house.hemi.intensity += (hemi - house.hemi.intensity) * (1 - Math.exp(-4 * dt))
    const order: RoomId[] = ["crypt", "chapel", "ballroom", "library", "nursery", "attic"]
    for (const id of IDS) {
      const r = house.rooms.get(id)!
      const poss = s?.rooms.find((x) => x.id === id)?.possessed ?? false
      const red = ghostsWin && e > 0.5 + order.indexOf(id) * 0.45
      const dark = finale && !ghostsWin && e > 0.5 + order.indexOf(id) * 0.45
      const g0 = roomGlow.get(id)!
      const target = red ? 1.2 : poss ? 1 : 0
      const g = g0 + (target - g0) * (1 - Math.exp(-(g0 > 1.2 ? 1.5 : 3) * dt))
      roomGlow.set(id, g)
      r.light.color.copy(red ? BLOOD : r.color)
      // L30: candle flicker per room; possession lights the room in its colour without washing props to white
      const candle = 0.9 + 0.06 * Math.sin(t * 6.1 + r.center.x * 1.3) + 0.04 * Math.sin(t * 11.7 + r.center.y)
      r.light.intensity = dark ? 0 : roomBase * candle + g * 11 * (0.85 + 0.15 * Math.sin(t * 9 + r.center.x))
      // a lived-in room glows warm against the dark house (L15 13:58); possession floods it in its own colour
      const warmth = (roomBase / 2.5) * 0.045
      for (const m of r.flood) {
        if (g > 0.05 || red) {
          m.emissive.copy(red ? BLOOD : r.color)
          m.emissiveIntensity = Math.max(g * 0.12, warmth)
        } else {
          m.emissive.copy(WARM)
          m.emissiveIntensity = warmth
        }
      }
    }
    moonC.lerp(ghostsWin ? new THREE.Color(0xff2a1a) : moonWhite, 1 - Math.exp(-1.2 * dt))
    hunters.update(dt, t, p === "hunting")
    wisps.update(dt, t)
    seats.update(t, (id) => ghostsWin && e > 0.5 + order.indexOf(id) * 0.45)

    const k = 1 - Math.exp(-camRate * dt)
    cam.pos.lerp(goal.pos, k)
    cam.quat.slerp(goal.quat, k)
    cam.fov += (goal.fov - cam.fov) * k
    if (p === "reveal" && killStep >= 0 && killStep < 2) cam.pos.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quat), dt * 0.9)
    camera.position.copy(cam.pos)
    camera.quaternion.copy(cam.quat)
    const shake = flash * 0.2
    if (shake > 0.01) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0))
    camera.fov = cam.fov
    camera.updateProjectionMatrix()
    const pxScale = canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
    wisps.setPixelScale(canvas.height, cam.fov)
    seats.setPixelScale(pxScale)

    flash *= Math.exp(-5 * dt)
    const u = post.dither.uniforms
    u.uFlash.value = flash
    u.uExposure.value += (exposure - u.uExposure.value) * (1 - Math.exp(-10 * dt))
    post.bloom.strength = 0.45 + flash * 1.2
    const tv = u.uTint.value as THREE.Vector3
    if (ghostsWin) tv.set(1.2, 0.8, 0.8)
    else tv.set(tint, tint, Math.min(1.1, tint + 0.12))

    if (s) hud.frame(clockNow(), s.endsAt, () => null)
    post.render(t)
    if (firstFrame) {
      firstFrame = false
      const ms = performance.now() - tBoot
      Object.assign(window, { __s3first: ms })
      console.info(`[stage3d] first frame ${ms.toFixed(0)} ms after mount (house: ${house.source})`)
    }
    frames++
    const now = performance.now()
    if (now - fpsAt > 1000) {
      const fps = (frames * 1000) / (now - fpsAt)
      Object.assign(window, { __s3fps: fps })
      if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${wisps.count()} ghosts · ${house.source}`
      frames = 0
      fpsAt = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
