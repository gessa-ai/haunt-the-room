// Post: render -> UnrealBloom (moon, wisps, cones bloom first) -> full-screen ordered dither, ported from lane
// L14's stage filter (web/src/fx/ditherFilter.ts): pixelate to `cell` px, 8x8 Bayer threshold, snap to the one
// Halloween palette (web/src/fx/palette.ts, ROOM_STYLE colours exact), plus a contrast curve and a breathing drift.
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { DITHER_PALETTE, paletteRgb } from "../fx/palette"

function ditherFrag(): string {
  const rgb = paletteRgb(DITHER_PALETTE)
  const entries = DITHER_PALETTE.map((_, i) => {
    const v = `vec3(${rgb[i * 3].toFixed(4)}, ${rgb[i * 3 + 1].toFixed(4)}, ${rgb[i * 3 + 2].toFixed(4)})`
    return `e = paletteErr(c, ${v}); if (e < best) { best = e; pick = ${v}; }`
  }).join("\n  ")
  return `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uCell;
uniform float uSpread;
uniform float uTime;
uniform float uContrast;
uniform float uStrength;
uniform float uFlash;
uniform vec3 uTint;
uniform float uExposure;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(floor(a * 0.5)) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(floor(a * 0.5)) * 0.25 + bayer2(a) + 0.5 / 64.0; }
float paletteErr(vec3 c, vec3 p) {
  vec3 d = c - p;
  float rm = 0.5 * (c.r + p.r);
  return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
}
vec3 nearest(vec3 c) {
  float best = 1e9;
  vec3 pick = vec3(0.0);
  float e;
  ${entries}
  return pick;
}
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 px = vUv * uRes;
  vec2 cellId = floor(px / uCell);
  vec2 uv = (cellId + 0.5) * uCell / uRes;
  vec3 lin = texture2D(tDiffuse, uv).rgb * uExposure;
  vec3 orig = toSrgb(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));
  // filmic-ish shoulder so blown highlights stay white, then an S-curve for punch
  lin = lin / (1.0 + lin * 0.6);
  vec3 c = toSrgb(clamp(lin * 1.25, 0.0, 1.0));
  c = mix(c, smoothstep(0.0, 1.0, c), uContrast);
  c = c * uTint + uFlash;
  float t = bayer8(cellId);
  t += 0.06 * (sin(uTime * 0.9 + cellId.x * 0.045 + cellId.y * 0.07) + 0.6 * sin(uTime * 1.7 - cellId.y * 0.11));
  vec3 q = nearest(c + (t - 0.5) * uSpread);
  gl_FragColor = vec4(mix(orig, q, uStrength), 1.0);
}`
}

export interface Post {
  composer: EffectComposer
  dither: ShaderPass
  bloom: UnrealBloomPass
  resize(w: number, h: number): void
  render(t: number): void
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number): Post {
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.5, 1.0)
  composer.addPass(bloom)
  const dither = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(w, h) },
      uCell: { value: 3 },
      uSpread: { value: 0.22 },
      uTime: { value: 0 },
      uContrast: { value: 0.55 },
      uStrength: { value: 1 },
      uFlash: { value: 0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uExposure: { value: 1 },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: ditherFrag(),
  })
  composer.addPass(dither)
  return {
    composer,
    dither,
    bloom,
    resize(nw, nh) {
      composer.setSize(nw, nh)
      dither.uniforms.uRes.value.set(nw, nh)
    },
    render(t) {
      dither.uniforms.uTime.value = t
      composer.render()
    },
  }
}
