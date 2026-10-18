import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

/**
 * One custom full-screen effect that handles all the "film look" and special FX:
 *  - chromatic aberration (glitch on Van's knock-down)
 *  - shockwave ripple ring
 *  - time-dilation (radial wobble + radial blur) for the flow state
 *  - colour saturation, vignette, film grain
 * All uniforms are driven from `store.fx` (see scene/Post.tsx).
 */
const fragment = /* glsl */ `
uniform float uTime;
uniform float uAberration;
uniform float uSat;
uniform float uVignette;
uniform float uWarp;
uniform float uShockR;
uniform float uShockAmp;
uniform float uGrain;
uniform vec2 uShockC;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 p = uv - 0.5;
  float r = length(p);
  vec2 dir = p / (r + 1e-5);
  vec2 d = vec2(0.0);

  // shockwave ring
  vec2 sc = uv - uShockC;
  float sr = length(sc);
  float ring = exp(-pow((sr - uShockR) * 11.0, 2.0)) * uShockAmp;
  d += (sc / (sr + 1e-5)) * ring * 0.05;

  // time dilation: slow radial wobble
  d += dir * sin(r * 16.0 - uTime * 1.2) * 0.004 * uWarp;

  vec2 uv2 = uv + d;
  vec2 ca = dir * uAberration * (0.35 + r);
  vec3 col;
  col.r = texture2D(inputBuffer, uv2 + ca).r;
  col.g = texture2D(inputBuffer, uv2).g;
  col.b = texture2D(inputBuffer, uv2 - ca).b;

  if (uWarp > 0.01) {
    vec3 acc = col;
    for (int i = 1; i < 6; i++) {
      acc += texture2D(inputBuffer, uv2 - p * 0.016 * uWarp * float(i)).rgb;
    }
    col = acc / 6.0;
  }

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col *= 1.0 - uVignette * smoothstep(0.28, 0.95, r * 1.45);
  col += (hash(uv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
  outputColor = vec4(col, inputColor.a);
}
`

export class GradeEffect extends Effect {
  constructor() {
    // CONVOLUTION => gets its own pass *after* bloom, so texture2D(inputBuffer, …) already contains the bloom.
    super('GradeEffect', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uAberration', new Uniform(0)],
        ['uSat', new Uniform(1)],
        ['uVignette', new Uniform(0.5)],
        ['uWarp', new Uniform(0)],
        ['uShockR', new Uniform(-1)],
        ['uShockAmp', new Uniform(0)],
        ['uGrain', new Uniform(0.05)],
        ['uShockC', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    })
  }
  set(name: string, v: number) {
    const u = this.uniforms.get(name)
    if (u) u.value = v
  }
}
