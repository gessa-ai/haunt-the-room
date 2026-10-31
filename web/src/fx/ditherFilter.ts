// Full-screen DITHER post-process for the stage (lane L14). One PixiJS v8 Filter, GLSL written today:
//   1. pixelate: every `cell` stage units (3 = 3 css px at 1080p) sample once at the cell centre (crisp blocks)
//   2. ordered dither: an 8x8 Bayer threshold per cell jitters the colour by +-spread/2
//   3. quantize: snap to the nearest colour of the Halloween palette (fx/palette.ts: ROOM_STYLE + white kept)
//   4. bloom: bright pixels spill a halo first, so flashes and reveals glow through the grain
//   5. drift: a slow travelling wave nudges the thresholds so the grain breathes instead of sitting dead
//   6. strength 0..1 mixes the untouched frame back in (0 = off, 1 = full dither)
//
// ATTACH (L7, web/src/stage/index.ts, after `app.stage.addChild(mansion.world)`):
//   import { createDitherFilter } from "../fx/ditherFilter"
//   app.stage.filters = [createDitherFilter()]
//   app.stage.filterArea = app.screen      // fixed bounds: the grain is anchored to the screen, never swims
//
// Recommended: the stage ROOT (above), not mansion.world. All stage text (feed, clock, HUD) is DOM over the
// canvas, so it stays crisp either way; on the root the grain is screen-anchored like a real low-res display,
// while on the shaking world layer the bounds move every frame and the whole pattern crawls with the shake.
// For the DOM feed/HUD use the same look via fx/phoneDither.ts `attachPhoneDither(feedBox, { strength: 0.5 })`.
// WebGL only (the stage boots with preference "webgl"); the filter refuses loudly on WebGPU.
import { Filter, GlProgram, defaultFilterVert, type FilterSystem, type RenderSurface, type Texture } from "pixi.js"
import { DEFAULT_LOOK, ditherChunk } from "./ditherGlsl"
import { DITHER_PALETTE } from "./palette"

export interface DitherOptions {
  /** One dither cell in stage units (stage = 1920x1080 logical). Default 3. */
  cell?: number
  /** 0 = off, 1 = full effect. Default 1. */
  strength?: number
  /** Look knobs, defaults in fx/ditherGlsl.ts DEFAULT_LOOK (spread, drift, gamma, contrast S-curve). */
  spread?: number
  drift?: number
  gamma?: number
  contrast?: number
  /** Halo strength for bright pixels (flashes, bursts, reveals) before quantizing. 0 = none. Default 1. */
  bloom?: number
  /** Halo reach in stage units. Default 26. */
  bloomRadius?: number
  /** Override the palette (#rrggbb list). Default fx/palette.ts DITHER_PALETTE. */
  palette?: readonly string[]
}

function fragment(palette: readonly string[]): string {
  return `precision highp float;
#if __VERSION__ >= 300
#define texture2D texture
#endif
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uDither;   // x cell, y strength, z time (s), w bloom
uniform vec4 uLook;     // spread, drift, gamma, contrast
uniform float uBloomRadius;
${ditherChunk(palette)}
void main(void) {
  float cell = max(1.0, uDither.x);
  vec2 px = vTextureCoord * uInputSize.xy;            // logical units inside the filter frame
  vec2 cellId = floor(px / cell);
  vec2 uv = clamp((cellId + 0.5) * cell * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);

  vec4 src = texture2D(uTexture, uv);
  vec4 orig = texture2D(uTexture, vTextureCoord);
  vec3 glow = uDither.w > 0.0 ? hauntBloom(uTexture, uv, uBloomRadius * uInputSize.zw, uInputClamp) * uDither.w : vec3(0.0);
  vec3 q = hauntDither(hauntUnpremul(src) + glow, cellId, uDither.z, uLook);

  float a = max(src.a, clamp(dot(glow, vec3(2.0)), 0.0, 1.0)); // halos may light transparent pixels
  finalColor = mix(orig, vec4(q * a, a), clamp(uDither.y, 0.0, 1.0));
}
`
}

export class DitherFilter extends Filter {
  private readonly t0 = performance.now()

  constructor(opts: DitherOptions = {}) {
    const palette = opts.palette ?? DITHER_PALETTE
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: fragment(palette), name: "haunt-dither" }),
      resources: {
        ditherUniforms: {
          uDither: { value: new Float32Array([opts.cell ?? 3, opts.strength ?? 1, 0, opts.bloom ?? 1]), type: "vec4<f32>" },
          uLook: {
            value: new Float32Array([
              opts.spread ?? DEFAULT_LOOK.spread,
              opts.drift ?? DEFAULT_LOOK.drift,
              opts.gamma ?? DEFAULT_LOOK.gamma,
              opts.contrast ?? DEFAULT_LOOK.contrast,
            ]),
            type: "vec4<f32>",
          },
          uBloomRadius: { value: opts.bloomRadius ?? 26, type: "f32" },
        },
      },
    })
  }

  private get u(): { uDither: Float32Array; uLook: Float32Array } {
    return this.resources.ditherUniforms.uniforms
  }
  get cell(): number { return this.u.uDither[0] }
  set cell(v: number) { this.u.uDither[0] = v }
  get strength(): number { return this.u.uDither[1] }
  set strength(v: number) { this.u.uDither[1] = Math.min(1, Math.max(0, v)); this.enabled = v > 0 }
  get bloom(): number { return this.u.uDither[3] }
  set bloom(v: number) { this.u.uDither[3] = v }
  get spread(): number { return this.u.uLook[0] }
  set spread(v: number) { this.u.uLook[0] = v }
  get drift(): number { return this.u.uLook[1] }
  set drift(v: number) { this.u.uLook[1] = v }
  get gamma(): number { return this.u.uLook[2] }
  set gamma(v: number) { this.u.uLook[2] = v }
  get contrast(): number { return this.u.uLook[3] }
  set contrast(v: number) { this.u.uLook[3] = v }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    if (filterManager.renderer.type !== 1 /* RendererType.WEBGL */) {
      throw new Error("haunt-dither: the stage dither filter is WebGL only; boot Pixi with preference \"webgl\"")
    }
    this.u.uDither[2] = (performance.now() - this.t0) / 1000
    filterManager.applyFilter(this, input, output, clearMode)
  }
}

export function createDitherFilter(opts: DitherOptions = {}): DitherFilter {
  return new DitherFilter(opts)
}
