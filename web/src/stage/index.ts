// The projector: 1920x1080 scaled to fit. Mansion (Pixi) left 68%, Agent Relay ledger right 32%, DOM HUD on top.
// Data: the House socket (POST /api/stage/grant) or /stage?fake=<scenario> before the actors are up.
import "../feed/fonts"
import { createDitherFilter } from "../fx/ditherFilter"
import { attachPhoneDither } from "../fx/phoneDither"
import { ShockwaveFilter } from "pixi-filters"
import { Application } from "pixi.js"
import { BEATS_PER_ROUND, HUNTERS, type HouseEvent, type HunterId, type Phase, type RoomId, type StageSnap } from "../../../contract/protocol"
import { createFeed } from "../feed/index"
import { setExpectTalk } from "../feed/relay"
import { initAudio, playCue, unlockAudio, type AnnounceEvent } from "../audio/index"
import { fakeSource } from "./dev/fake"
import { Fx } from "./fx"
import { Hud, el } from "./hud"
import { MANSION_W, ROOM_BOXES, ROOM_IDS, STAGE_H, STAGE_W } from "./layout"
import { Mansion } from "./mansion"
import { houseSource, type SnapSource } from "./source"
import { startPresenter } from "./presenter"
import { playShowpiece, preloadShowpieces, stopShowpiece } from "./showpiece"
import { mountDebug } from "./debug"
import { createCabal } from "../cabal/index"
import { stageCaptions } from "../captions/stage"
import { mountHeat } from "../cabal/heat"
import "./stage.css"
import { Wisps } from "./wisps"

const HUNTER_IDS = HUNTERS.map((h) => h.id)
const HUNTER_NAME = new Map<HunterId, string>(HUNTERS.map((h) => [h.id, h.name]))
const evKey = (e: HouseEvent) => `${e.at}|${e.kind}|${e.room ?? ""}|${e.hunter ?? ""}|${e.count ?? ""}|${e.text ?? ""}`
const randomHunter = (): HunterId => HUNTER_IDS[Math.floor(Math.random() * HUNTER_IDS.length)]

export async function mountStage(root: HTMLElement, opts: { watch?: boolean } = {}): Promise<void> {
  const watch = opts.watch === true
  root.innerHTML = ""
  const viewport = el("div", "st-viewport")
  const st = el("div", "st")
  viewport.append(st)
  root.append(viewport)
  let scale = 1
  const res = () => Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * scale))

  const app = new Application()
  await app.init({ width: MANSION_W, height: STAGE_H, backgroundAlpha: 0, antialias: true, resolution: res(), autoDensity: false, preference: "webgl" })
  app.canvas.classList.add("st-canvas")
  // the camera: canvas + everything pinned to rooms move together (zoom onto swept rooms, pull back to count)
  const cam = el("div", "st-cam")
  cam.append(app.canvas)
  st.append(cam)
  const feedBox = el("div", "st-feed")
  st.append(feedBox)
  // ROOM HEAT on the house during hide (lies per room as ember + smoke), in the camera layer so it zooms with the rooms
  const heatLayer = el("div", "st-heat")
  Object.assign(heatLayer.style, { position: "absolute", left: "0", top: "0", width: `${MANSION_W}px`, height: `${STAGE_H}px`, pointerEvents: "none" })
  cam.append(heatLayer)
  const heat = mountHeat({ layer: heatLayer, rects: Object.fromEntries(ROOM_IDS.map((id) => [id, ROOM_BOXES[id].inner])) as Record<RoomId, { x: number; y: number; w: number; h: number }> })

  const fit = () => {
    scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
    st.style.transform = `translate(${(window.innerWidth - STAGE_W * scale) / 2}px, ${(window.innerHeight - STAGE_H * scale) / 2}px) scale(${scale})`
    const r = res()
    if (app.renderer.resolution !== r) {
      app.renderer.resolution = r
      app.renderer.resize(MANSION_W, STAGE_H)
    }
  }
  fit()
  window.addEventListener("resize", fit)

  const mansion = new Mansion()
  app.stage.addChild(mansion.world)
  // lane L14's full-screen dither, screen-anchored on the root
  const dither = createDitherFilter()
  const baseBloom = dither.bloom
  let bloomT = 0
  /** big flashes bloom through the grain for a moment */
  const bloomPulse = () => {
    bloomT = 0.3
  }
  app.stage.filters = [dither]
  app.stage.filterArea = app.screen
  attachPhoneDither(st, { cell: 3, contrast: 0.55, zIndex: 50 }) // the DOM HUD and feed get the same grain
  const fx = new Fx(mansion.fxLayer)
  const wisps = new Wisps(mansion.wispLayer, fx, () => {
    mansion.doorPulse()
    joinWhoosh()
  })
  const hud = new Hud(st, cam)
  hud.onIntroSegment = (seg) => {
    if (seg > 0) playCue("card")
  }

  // ---------- audio: one click anywhere unlocks it ----------
  initAudio().catch((err: unknown) => console.error("[stage] initAudio failed", err))
  window.addEventListener("keydown", () => unlockAudio(), { once: true })
  viewport.addEventListener(
    "pointerdown",
    () => {
      unlockAudio()
      
    },
    { once: true },
  )
  let lastJoinCue = 0
  const joinWhoosh = () => {
    const t = performance.now()
    if (t - lastJoinCue > 140) {
      lastJoinCue = t
      playCue("join")
    }
  }

  // ---------- feed (right column) ----------
  let relayMessages = 0
  let lastWhisper = 0
  const cabal = createCabal(st) // L7b: full-screen table during hunting
  const captions = stageCaptions(st, MANSION_W) // voiced lines (taunts, announcer) as captions
  const feed = createFeed(feedBox, {
    stage: true,
    watch,
    onWhisper: () => {
      lastWhisper = Date.now()
      playCue("whisper")
    },
    onItem: (i) => {
      relayMessages = Math.max(relayMessages + 1, i.seq ?? 0)
      cabal.item(i)
    },
  })
  hud.mountBoard(feed.slot)

  // ---------- shockwaves ----------
  const waves: { f: ShockwaveFilter; t: number }[] = []
  const shockwave = (x: number, y: number, amp = 26) => {
    const f = new ShockwaveFilter({ center: { x, y }, amplitude: amp, wavelength: 180, speed: 900, brightness: 1.15, radius: 900 })
    waves.push({ f, t: 0 })
    mansion.world.filters = waves.map((w) => w.f)
  }

  // ---------- state from snapshots ----------
  let snap: StageSnap | null = null
  let offset = 0 // house clock - local clock
  let first = true
  let phase: Phase | null = null
  let restoredAt: number | null = null
  let peakOnline = 0
  let lastJoined = 0
  let houseUp = true
  let hitStop = 0
  // the announcer: at most one line per beat (the finale is its own beat)
  let annBeat = -1
  let caughtThisRound = false
  const say = (ev: AnnounceEvent, room?: RoomId) => {
    const b = snap?.phase === "finale" ? -2 : snap?.beat ?? 0
    if (b === annBeat) return
    annBeat = b
    captions.announce(ev, room)
  }
  let lastTick = 0
  let resync = false
  let revealed = false
  let lastLieRoom: RoomId | null = null
  const sweptCounts = new Map<RoomId, number>()
  const lastCounts = new Map<RoomId, number>()
  const seen = new Set<string>()
  const clockNow = () => Date.now() + offset

  const handle = (e: HouseEvent) => {
    const room = e.room
    const box = room ? ROOM_BOXES[room] : null
    switch (e.kind) {
      case "join":
      case "vote":
      case "phase":
      case "revived":
        break // wisps pour in; votes show on the council cards at reveal; phase and restoredAt drive the rest
      case "sweep":
        if (room) sweptCounts.set(room, e.count ?? 0)
        if (room && box) {
          hitStop = 0.055
          wisps.scatter(room)
          shockwave(box.center.x, box.center.y, 34)
          mansion.shake(14, 0.55)
          fx.burst(box.center.x, box.center.y, 0xffffff, 34, 480, 0.9)
          if (!e.count) hud.stamp(box.center.x, box.center.y, "Empty.", "#c9f7ff")
        }
        playCue("sweep", room ? { room } : {})
        {
          const voter = snap?.hunters.find((h) => h.vote === room)?.id ?? randomHunter()
          if (e.count) captions.voice(voter, "caught")
          else captions.voice(voter, lastLieRoom === room ? "fooled" : "missed")
        }
        break
      case "caught":
        if (!caughtThisRound && (e.count ?? 0) > 0) {
          caughtThisRound = true
          say("first-blood")
        }
        playCue("caught", room ? { room } : {})
        if (box) hud.stamp(box.center.x, box.center.y, `${e.count ?? 0} CAUGHT`, "#ffffff")
        break
      case "possessed":
        if (room) say("haunted", room)
        bloomPulse()
        if (room && box) {
          const c = mansion.colorOf(room)
          mansion.shake(18, 0.8)
          shockwave(box.center.x, box.center.y, 42)
          fx.burst(box.center.x, box.center.y, c, 60, 600, 1.4)
          fx.ring2(box.center.x, box.center.y, c, 0.3, 4.5, 1.1)
          hud.stamp(box.center.x, box.center.y + 40, "HAUNTED", "#ffffff")
        }
        playCue("possessed")
        window.setTimeout(() => playCue("crash"), 380)
        captions.voice(randomHunter(), "possessed")
        break
      case "cleansed":
        if (room && box) {
          mansion.cleanse(room)
          fx.burst(box.center.x, box.center.y, 0xfff1c9, 24, 300, 1)
        }
        playCue("cleansed")
        break
      case "taunt":
        if (e.hunter && e.text) captions.taunt(e.hunter, e.text) // caption + speak()
        break
      case "lie": {
        const fooled = e.hunter ? HUNTER_NAME.get(e.hunter) ?? e.hunter : "the hunters"
        const liar = e.name ?? "Someone"
        hud.lie(e.text ?? `${liar} lied to ${fooled}. It worked.`)
        if (e.ghostId) wisps.highlight(e.ghostId, 3) // named in the lie banner, not on the board
        if (room) mansion.lure(room)
        lastLieRoom = room ?? null
        if (box) fx.ring2(box.center.x, box.center.y, 0x7af0ff, 0.3, 3, 1.1)
        playCue("whisper")
        if (e.hunter) captions.voice(e.hunter, "fooled")
        break
      }
      case "lead":
        if (phase === "lobby" || phase === "finale") break
        // after the caught stamps: never stack over them
        hud.newLeader(e.name ?? "someone")
        playCue("lead")
        mansion.shake(8, 0.4)
        if (e.ghostId) wisps.highlight(e.ghostId, 2.5)
        break
      case "onfire":
        say("on-fire")
        if (e.ghostId && wisps.highlight(e.ghostId, 2)) hud.tagWisp(e.ghostId, `${e.name ?? "someone"}, three in a row`, "#ffb347", 2.2, "fire")
        playCue("onfire")
        break
      case "wave":
        if (e.ghostId && wisps.highlight(e.ghostId, 2)) hud.tagWisp(e.ghostId, e.name ?? "that's me", wisps.colorOf(e.ghostId), 2.2)
        joinWhoosh()
        break
    }
  }

  const startIntroShot = () =>
    void playShowpiece(hud.introEl, "intro").then((shot) => {
      if (!shot) return
      if (phase !== "intro") return stopShowpiece()
      hud.introShot(true)
      // the 3D push-in ends at 6.5 s: the cards play over the 2D board after it
      void shot.done.then(() => {
        if (phase !== "intro") return
        stopShowpiece()
        hud.introShot(false)
      })
    })
  const startFinaleShot = (s: StageSnap) =>
    void playShowpiece(hud.finaleEl, "finale", s.winner ?? "ghosts").then((shot) => {
      if (!shot) return hud.scheduleEpilogue(s.winner) // 2D podium is already up
      if (phase !== "finale") return stopShowpiece()
      hud.finaleShot(true)
      // the flood plays first, then the podium and socials
      void Promise.race([shot.done, new Promise((r) => window.setTimeout(r, shot.ms + 500))]).then(() => {
        if (phase !== "finale") return
        stopShowpiece()
        hud.finaleShot(false)
        hud.scheduleEpilogue(s.winner)
      })
    })

  const onPhase = (s: StageSnap, prev: Phase | null) => {
    stopShowpiece() // a phase change always ends a running 3D shot
    hud.introShot(false)
    hud.finaleShot(false)
    if (s.phase === "lobby") preloadShowpieces()
    setExpectTalk(s.phase === "hide" || s.phase === "hunting" || s.phase === "reveal")
    hud.setPhase(s.phase)
    mansion.setDim(s.phase === "hunting")
    if (s.phase !== "reveal") mansion.clearReveal()
    hud.camera(s.phase === "reveal" ? s.sweptRooms : [])
    if (prev === null) {
      if (s.phase === "finale") {
        hud.showFinale(s, relayMessages, peakOnline)
        startFinaleShot(s)
      }
      if (s.phase === "intro") startIntroShot()
      return
    }
    if (s.phase === "intro") {
      caughtThisRound = false
      startIntroShot()
      playCue("intro")
      HUNTER_IDS.forEach((h, i) => window.setTimeout(() => captions.voice(h, "arrive"), 4400 + i * 3000))
    } else if (s.phase === "hide") {
      if (s.beat === 1) say("round-one")
      playCue("hide", { endsAt: s.endsAt - offset })
      playCue("tension", { level: Math.ceil((s.beat * 5) / BEATS_PER_ROUND) })
      lastLieRoom = null
    } else if (s.phase === "hunting") {
      playCue("bell")
      playCue("hunting", { endsAt: s.endsAt - offset })
      if (s.beat === 1 || Math.random() < 0.25) say("hunters-choosing")
      captions.voice(randomHunter(), "sweep")
    } else if (s.phase === "reveal") {
      hitStop = 0.06
      bloomPulse()
      playCue("reveal", s.sweptRooms[0] ? { room: s.sweptRooms[0] } : {})
      window.setTimeout(() => playCue("safe"), 900)
      playCue("ticker", { endsAt: s.endsAt - offset })
      mansion.shake(12, 0.5)
      // between beats: the top 5 slides in near the end of the reveal
      window.setTimeout(() => snap && snap.phase === "reveal" && hud.slideTop5(snap), Math.max(0, s.endsAt - s.now - 1600))
    } else if (s.phase === "finale") {
      hud.showFinale(s, relayMessages, peakOnline)
      startFinaleShot(s)
      bloomPulse()
      mansion.shake(24, 1.2)
      playCue("tension", { level: 0 })
      say(s.winner === "ghosts" ? "house-yours" : "exorcised")
      if (s.winner === "ghosts") {
        playCue("finale-ghosts")
        HUNTER_IDS.forEach((h, i) => window.setTimeout(() => captions.voice(h, "lose"), 1200 + i * 1400))
      } else {
        playCue("finale-hunters")
        HUNTER_IDS.forEach((h, i) => window.setTimeout(() => captions.voice(h, "win"), 1200 + i * 1400))
      }
    } else if (s.phase === "lobby") {
      hud.showBanner("The door's open.", "Scan the code. Leave your body at the door.", "", 3)
    }
  }

  const onSnap = (s: StageSnap) => {
    cabal.snap(s)
    heat.apply(s.rumors, s.phase === "hide")
    offset = s.now - Date.now()
    peakOnline = Math.max(peakOnline, s.counters.humans)
    const prevPhase = phase
    if (s.phase !== phase) {
      phase = s.phase
      onPhase(s, prevPhase)
    }
    // first snapshot, or the first after an outage: the backlog is history, not news
    if (first || resync) for (const e of s.events) seen.add(evKey(e))
    else
      for (const e of s.events) {
        const k = evKey(e)
        if (seen.has(k)) continue
        seen.add(k)
        handle(e)
      }
    if (seen.size > 2000) {
      seen.clear()
      for (const e of s.events) seen.add(evKey(e))
    }
    if (s.restoredAt !== restoredAt) {
      if (s.restoredAt !== null && (!first || s.now - s.restoredAt < 15_000)) {
        // lastRecoveryMs: L2 is adding it to StageSnap; read it optionally until the contract carries it
        hud.setDown(false, clockNow())
        hud.showRevive((s as StageSnap & { lastRecoveryMs?: number }).lastRecoveryMs ?? 0)
        playCue("revive")
        captions.voice(randomHunter(), "back", 1)
        mansion.shake(14, 0.8)
      }
      restoredAt = s.restoredAt
    }
    wisps.apply(s.ghosts, first)
    mansion.applyRooms(s.rooms)
    for (const r of s.rooms) {
      const before = lastCounts.get(r.id) ?? r.count
      if (s.phase === "hide" && r.count > before && !first) playCue("tap", { room: r.id })
      lastCounts.set(r.id, r.count)
    }
    if (s.phase === "reveal" && s.sweptRooms.length) {
      if (!revealed) {
        mansion.reveal(s.sweptRooms)
        hud.killcam(s.sweptRooms, sweptCounts)
      }
      revealed = true
      hud.camera(s.sweptRooms)
    } else {
      revealed = false
      sweptCounts.clear()
    }
    hud.apply(s, clockNow())
    if (s.phase === "finale" && prevPhase === s.phase) hud.showFinale(s, relayMessages, peakOnline)
    if (s.counters.joinedToday > lastJoined && !first) hud.bump("joinedToday")
    lastJoined = s.counters.joinedToday
    peakOnline = Math.max(peakOnline, s.counters.online)
    snap = s
    first = false
    resync = false
  }

  const fake = new URLSearchParams(location.search).get("fake")
  const source: SnapSource = fake ? fakeSource(fake) : houseSource(watch)
  source.start({
    snap: onSnap,
    status(up, why) {
      // the outage card only after a socket that WAS live drops; before the first snapshot the title card stays
      if (!up && snap === null) return console.error(`[stage] house not connected yet: ${why}`)
      hud.setDown(!up, clockNow(), up ? "" : why)
      if (up === houseUp) return
      houseUp = up
      if (up) resync = true
      if (!up) {
        playCue("static")
        mansion.shake(16, 0.5)
      }
    },
  })

  if (!watch) startPresenter((msg, err) => hud.toast(msg, err), () => hud.toggleQr(), () => hud.stopEpilogue())
  if (!watch) mountDebug(st, {
    read: () => ({
      online: snap?.counters.online ?? 0,
      humans: snap?.counters.humans ?? 0,
      bots: snap?.counters.bots ?? 0,
      phase: snap?.phase ?? "-",
      beat: snap?.beat ?? 0,
      fps: fps.textContent ?? "",
      recoveryMs: (snap as (StageSnap & { lastRecoveryMs?: number }) | null)?.lastRecoveryMs ?? null,
      up: houseUp,
    }),
    setDither: (v) => {
      dither.strength = v
    },
    toast: (m, e) => hud.toast(m, e),
  })

  // ---------- frame loop ----------
  const fps = el("div", "st-fps", "")
  st.append(fps)
  let frames = 0
  let fpsAt = performance.now()
  let riseAcc = 0
  app.ticker.add((ticker) => {
    let dt = Math.min(0.05, ticker.deltaMS / 1000)
    const now = clockNow()
    if (hitStop > 0) {
      // a sweep lands: the world holds its breath for a few frames
      hitStop -= dt
      dt = 0
    }
    if (bloomT > 0) {
      bloomT -= ticker.deltaMS / 1000
      dither.bloom = bloomT > 0 ? 2.5 : baseBloom
    }
    mansion.update(dt, now)
    wisps.update(dt)
    // possessed rooms breathe ectoplasm
    riseAcc += dt
    if (riseAcc > 0.08) {
      riseAcc = 0
      for (const id of ROOM_IDS) {
        if (!mansion.isPossessed(id)) continue
        const b = ROOM_BOXES[id].inner
        fx.rise(b.x, b.y, b.w, b.h, 0x6dff9b, 2)
      }
    }
    fx.update(dt)
    for (let i = waves.length - 1; i >= 0; i--) {
      waves[i].t += dt
      waves[i].f.time = waves[i].t
      if (waves[i].t > 1.1) {
        waves.splice(i, 1)
        mansion.world.filters = waves.length ? waves.map((w) => w.f) : null
      }
    }
    hud.frame(now, snap?.endsAt ?? 0, (id) => wisps.positionOf(id))
    // the last three seconds of HIDE tick
    if (snap?.phase === "hide") {
      const secs = Math.ceil((snap.endsAt - now) / 1000)
      if (secs !== lastTick && secs >= 1 && secs <= 3) playCue("tick")
      lastTick = secs
    }
    frames++
    const t = performance.now()
    if (t - fpsAt > 1000) {
      fps.textContent = `${frames} fps · ${wisps.size} wisps · ${fx.count} fx${houseUp ? "" : " · house down"}`
      frames = 0
      fpsAt = t
    }
  })
}
