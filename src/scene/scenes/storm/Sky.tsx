import { forwardRef, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'
import { store } from '../../../core/store'

/**
 * Storm sky dome: churning clouds lit from within by lightning, a faint horizon, and — as the storm calms —
 * stars and a golden-teal dawn glow low behind the cage.
 */
export interface SkyUniforms {
  uTime: { value: number }
  uFlash: { value: number }
  uCalm: { value: number }
  uHorizon: { value: Color }
  uZenith: { value: Color }
}

export const Sky = forwardRef<ShaderMaterial>((_p, ref) => {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uCalm: { value: 0 },
      uHorizon: { value: new Color('#0a1220') },
      uZenith: { value: new Color('#02040a') },
      uBoltDir: { value: new Vector3(0, 0.3, 1).normalize() }, // direction of the strongest active bolt
    }),
    [],
  )
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[320, 40, 24]} />
      <shaderMaterial
        ref={ref}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        fog={false}
        vertexShader={/* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={/* glsl */ `
          uniform float uTime; uniform float uFlash; uniform float uCalm; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uBoltDir;
          varying vec3 vDir;
          float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float a = 0.5; float s = 0.0; for(int i=0;i<${store.mobile ? 3 : 5};i++){ s += a*noise(p); p *= 2.07; a *= 0.5; } return s; }
          void main(){
            vec3 d = normalize(vDir);
            float up = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, up));
            vec2 uv = d.xz / (d.y + 0.35) * 2.2;
            float n = fbm(uv + vec2(uTime * 0.03, uTime * 0.012));
            float n2 = fbm(uv * 1.7 - uTime * 0.02 + 4.0);
            float cloud = smoothstep(0.36, 0.82, n * 0.7 + n2 * 0.5) * smoothstep(-0.02, 0.22, d.y);
            cloud *= 1.0 - 0.75 * uCalm;
            // clouds glow brightest around the bolt itself, as if lit from inside
            float nb = pow(max(dot(d, normalize(uBoltDir)), 0.0), 5.0);
            float lit = clamp(uFlash * (0.3 + 0.7 * n) * (0.55 + 1.6 * nb), 0.0, 1.0);
            vec3 cc = mix(vec3(0.015, 0.025, 0.04), vec3(0.62, 0.72, 0.92), lit);
            col = mix(col, cc, cloud * 0.9);
            col += uFlash * (0.14 + 0.5 * nb) * vec3(0.5, 0.6, 0.85) * (1.0 - up * 0.5);
            // stars + dawn glow once calm
            float st = step(0.9965, hash(floor(d * 380.0).xy + floor(d * 380.0).z)) * smoothstep(0.08, 0.5, d.y);
            col += st * uCalm * vec3(0.9, 0.95, 1.0) * (0.6 + 0.4 * sin(uTime * 3.0 + d.x * 90.0));
            float glow = exp(-pow(d.y * 5.0, 2.0)) * smoothstep(-0.2, 0.9, d.z);
            col += glow * uCalm * vec3(0.95, 0.55, 0.22) * 0.55;
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  )
})
