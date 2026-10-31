// The dither as portable GLSL (lane L14): the ONE source of the look. The Pixi stage filter (fx/ditherFilter.ts)
// and the three.js stage (/stage3d, `threeDitherShader()` below for a ShaderPass) both build from ditherChunk().
// GLSL ES 1.0 safe (no int bit ops, no const arrays): runs in WebGL1, WebGL2, Pixi and three.js unchanged.
//
// three.js (no import needed here; the object is a plain ShaderPass definition):
//   import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js"
//   import { threeDitherShader } from "../fx/ditherGlsl"
//   const dither = new ShaderPass(threeDitherShader())
//   composer.addPass(dither)                                   // LAST pass (after bloom / output)
//   per frame: dither.uniforms.uTime.value = t; on resize: dither.uniforms.uResolution.value = [cssW, cssH]
//   uCell is in CSS px of the canvas (3 = 3 css px); uStrength 0..1.
import { DITHER_PALETTE, paletteRgb } from "./palette"

export interface DitherLook {
  /** Dither amplitude in 0..1 colour units: higher = more grain. Default 0.13. */
  spread: number
  /** Threshold drift amplitude (the "alive" shimmer). 0 = static. Default 0.04. */
  drift: number
  /** Gamma before quantizing; < 1 lifts dark art. Default 0.9. */
  gamma: number
  /** S-curve 0..1 before quantizing: pushes muddy midtones to the dark or the bright side. Default 0.45. */
  contrast: number
}
export const DEFAULT_LOOK: DitherLook = { spread: 0.13, drift: 0.04, gamma: 0.9, contrast: 0.45 }

/**
 * GLSL functions (no uniforms, no main):
 *   float hauntBayer8(vec2 cellId)                      8x8 ordered threshold in (0,1)
 *   vec3  hauntNearest(vec3 c)                          nearest palette colour
 *   vec3  hauntUnpremul(vec4 c)
 *   vec3  hauntBloom(sampler2D t, vec2 uv, vec2 radiusUv, vec4 clampUv)   bright-pass halo energy around uv
 *   vec3  hauntDither(vec3 c, vec2 cellId, float time, vec4 look)        look = (spread, drift, gamma, contrast)
 */
export function ditherChunk(palette: readonly string[] = DITHER_PALETTE): string {
  const rgb = paletteRgb(palette)
  const entries = palette
    .map((_, i) => {
      const v = `vec3(${rgb[i * 3].toFixed(4)}, ${rgb[i * 3 + 1].toFixed(4)}, ${rgb[i * 3 + 2].toFixed(4)})`
      return `  e = hauntPaletteErr(c, ${v}); if (e < best) { best = e; pick = ${v}; }`
    })
    .join("\n")
  return `
// ---- haunt dither (fx/ditherGlsl.ts) ----
// 8x8 Bayer threshold, recursive 2x2: the low coordinate bits pick the coarse threshold
float hauntBayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float hauntBayer4(vec2 a) { return hauntBayer2(floor(a * 0.5)) * 0.25 + hauntBayer2(a); }
float hauntBayer8(vec2 a) { return hauntBayer4(floor(a * 0.5)) * 0.25 + hauntBayer2(a) + 0.5 / 64.0; }

// "redmean" weighted distance: cheap, keeps hues apart better than plain RGB
float hauntPaletteErr(vec3 c, vec3 p) {
  vec3 d = c - p;
  float rm = 0.5 * (c.r + p.r);
  return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
}
// the palette is unrolled into the source: no arrays or uniform arrays needed
vec3 hauntNearest(vec3 c) {
  float best = 1e9;
  vec3 pick = vec3(0.0);
  float e;
${entries}
  return pick;
}

vec3 hauntUnpremul(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }

// bright-pass energy on two rings of taps: flashes, bursts and reveals spill a halo that the quantizer breaks
// into dithered falloff (the glow blooms THROUGH the grain instead of being flattened by it)
vec3 hauntBloom(sampler2D t, vec2 uv, vec2 r, vec4 cl) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.3927;
    vec2 d = vec2(cos(a), sin(a));
    vec3 s1 = hauntUnpremul(texture2D(t, clamp(uv + d * r * 0.45, cl.xy, cl.zw)));
    vec3 s2 = hauntUnpremul(texture2D(t, clamp(uv + d * r, cl.xy, cl.zw)));
    acc += max(s1 - 0.62, 0.0) * 1.6 + max(s2 - 0.62, 0.0);
  }
  return acc / 8.0;
}

vec3 hauntDither(vec3 c, vec2 cellId, float time, vec4 look) {
  c = pow(clamp(c, 0.0, 1.0), vec3(look.z));
  c = mix(c, c * c * (3.0 - 2.0 * c), look.w);            // S-curve: no muddy midtones
  float t = hauntBayer8(cellId);
  t += look.y * (sin(time * 0.9 + cellId.x * 0.045 + cellId.y * 0.07) + 0.6 * sin(time * 1.7 - cellId.y * 0.11));
  return hauntNearest(c + (t - 0.5) * look.x);
}
// ---- end haunt dither ----
`
}

/** A three.js ShaderPass definition (plain object; three is not imported here). */
export function threeDitherShader(opts: Partial<DitherLook> & { cell?: number; strength?: number; bloom?: number; palette?: readonly string[] } = {}) {
  const look = { ...DEFAULT_LOOK, ...opts }
  return {
    name: "HauntDither",
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: [1920, 1080] }, // css px of the render target
      uCell: { value: opts.cell ?? 3 },
      uStrength: { value: opts.strength ?? 1 },
      uBloom: { value: opts.bloom ?? 1 },
      uTime: { value: 0 },
      uLook: { value: [look.spread, look.drift, look.gamma, look.contrast] },
    },
    vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uCell;
uniform float uStrength;
uniform float uBloom;
uniform float uTime;
uniform vec4 uLook;
varying vec2 vUv;
${ditherChunk(opts.palette)}
void main() {
  vec2 px = vUv * uResolution;
  vec2 cellId = floor(px / max(1.0, uCell));
  vec2 uv = (cellId + 0.5) * max(1.0, uCell) / uResolution;
  vec4 src = texture2D(tDiffuse, uv);
  vec3 c = src.rgb + (uBloom > 0.0 ? hauntBloom(tDiffuse, uv, vec2(26.0) / uResolution, vec4(0.0, 0.0, 1.0, 1.0)) * uBloom : vec3(0.0));
  vec3 q = hauntDither(c, cellId, uTime, uLook);
  gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, q, uStrength), 1.0);
}`,
  }
}
