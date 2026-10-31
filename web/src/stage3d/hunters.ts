// The four AI hunters on the lawn: a dark figure, a lamp, a real SpotLight and a visible volumetric cone.
// search(): the cones wander over the facade (HUNTING). aim(): slam onto a room (REVEAL kill cam). off(): dark.
import * as THREE from "three"
import { HUNTERS, type HunterId } from "../../../contract/protocol"

const CONE_VERT = `varying float vAlong; varying vec3 vN; varying vec3 vV;
void main(){ vAlong = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const CONE_FRAG = `uniform vec3 uColor; uniform float uPower; varying float vAlong; varying vec3 vN; varying vec3 vV;
void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fall = mix(0.15, 1.0, pow(vAlong, 1.6)); gl_FragColor = vec4(uColor * edge * fall * uPower, 1.0); }`

export interface HunterRig {
  id: HunterId
  root: THREE.Group
  spot: THREE.SpotLight
  cone: THREE.Mesh
  coneMat: THREE.ShaderMaterial
  aim: THREE.Vector3 // where the cone points now
  goal: THREE.Vector3 // where it is heading
  power: number
  powerGoal: number
  seed: number
}

export class Hunters {
  readonly rigs: HunterRig[] = []
  readonly group = new THREE.Group()
  /** Light gain: the kill cam sits metres from the beams, so the director turns them down there. */
  gain = 1

  constructor(scene: THREE.Scene, private readonly facade: THREE.Box3) {
    scene.add(this.group)
    const body = new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 1 })
    HUNTERS.forEach((h, i) => {
      const root = new THREE.Group()
      root.position.set(-10.5 + i * 7, 0, 15 + (i % 2) * 2.5)
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.5, 4, 8), body)
      torso.position.y = 1.25
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8), body)
      head.position.y = 2.45
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(h.color).multiplyScalar(3) }))
      lamp.position.set(0.35, 1.75, -0.3)
      root.add(torso, head, lamp)
      const spot = new THREE.SpotLight(new THREE.Color(h.color).lerp(new THREE.Color(0xffffff), 0.6), 0, 70, 0.2, 0.45, 1.2)
      spot.position.copy(lamp.position)
      root.add(spot)
      this.group.add(root)
      this.group.add(spot.target)
      const coneMat = new THREE.ShaderMaterial({
        vertexShader: CONE_VERT,
        fragmentShader: CONE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(h.color).lerp(new THREE.Color(0xffffff), 0.35) }, uPower: { value: 0 } },
      })
      // unit cone along +Y with the apex at the origin, uv.y = 1 at the apex; stretched each frame to the aim point
      const geo = new THREE.CylinderGeometry(0.02, 1, 1, 32, 1, true)
      geo.translate(0, -0.5, 0)
      geo.rotateX(-Math.PI / 2) // now along -Z from the apex
      const cone = new THREE.Mesh(geo, coneMat)
      cone.frustumCulled = false
      this.group.add(cone)
      const c = facade.getCenter(new THREE.Vector3())
      this.rigs.push({ id: h.id, root, spot, cone, coneMat, aim: c.clone(), goal: c.clone(), power: 0, powerGoal: 0, seed: i * 17.3 + 1 })
    })
  }

  off(): void {
    for (const r of this.rigs) r.powerGoal = 0
  }
  search(): void {
    for (const r of this.rigs) r.powerGoal = 0.6
  }
  /** Point this hunter at a spot; `slam` snaps the cone there at full power this frame. */
  aimAt(id: HunterId, p: THREE.Vector3, slam: boolean, power = 1): void {
    const r = this.rigs.find((x) => x.id === id)
    if (!r) return
    r.goal.copy(p)
    r.powerGoal = power
    if (slam) {
      r.aim.copy(p)
      r.power = 1.25
    }
  }

  update(dt: number, t: number, searching: boolean): void {
    const tmp = new THREE.Vector3()
    for (const r of this.rigs) {
      if (searching) {
        const b = this.facade
        r.goal.set(
          THREE.MathUtils.lerp(b.min.x, b.max.x, 0.5 + 0.5 * Math.sin(t * 0.55 + r.seed)),
          THREE.MathUtils.lerp(b.min.y, b.max.y, 0.5 + 0.5 * Math.sin(t * 0.37 + r.seed * 2.1)),
          b.max.z * 0.2,
        )
      }
      r.aim.lerp(r.goal, 1 - Math.exp(-(searching || r.powerGoal < 0.5 ? 2.2 : 9) * dt))
      r.power += (r.powerGoal - r.power) * (1 - Math.exp(-6 * dt))
      const apex = r.spot.getWorldPosition(tmp).clone()
      r.spot.target.position.copy(r.aim)
      r.spot.intensity = r.power * 220 * this.gain
      const len = apex.distanceTo(r.aim) + 2
      const radius = Math.tan(r.spot.angle) * len
      r.cone.position.copy(apex)
      r.cone.lookAt(r.aim)
      r.cone.scale.set(radius, radius, len)
      r.coneMat.uniforms.uPower.value = r.power * (r.powerGoal < 0.6 ? 0.42 : 0.22) * Math.sqrt(this.gain) // a lean beam is drawn brighter than its light
      r.cone.visible = r.power > 0.02
    }
  }
}
