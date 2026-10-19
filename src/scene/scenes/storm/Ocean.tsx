import { forwardRef, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, Vector4 } from 'three'
import { WAVES, CREST_PUSH } from './waves'
import { store } from '../../../core/store'

/**
 * The storm ocean: a polar grid (dense near the camera, sparse at the horizon) displaced in the vertex shader by
 * the same peaky wave sum as waves.ts (plus Gerstner-style crest bunching).
 * Fragment shader: choppy micro-normals (fbm), fresnel sky reflection, lacy whitecap foam on steep/high crests,
 * lightning specular (glitter streak pointing at the active bolt), crest sub-surface glow and the ring's golden reflection.
 * Mobile keeps the displacement + foam but skips the fbm detail.
 */
function polarGeometry(radial: number, angular: number, R: number) {
  const pos: number[] = []
  const idx: number[] = []
  pos.push(0, 0, 0)
  for (let i = 1; i <= radial; i++) {
    const r = R * Math.pow(i / radial, 2.2)
    for (let j = 0; j < angular; j++) {
      const a = (j / angular) * Math.PI * 2
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r)
    }
  }
  for (let j = 0; j < angular; j++) idx.push(0, 1 + ((j + 1) % angular), 1 + j)
  for (let i = 1; i < radial; i++) {
    const a0 = 1 + (i - 1) * angular
    const a1 = 1 + i * angular
    for (let j = 0; j < angular; j++) {
      const j2 = (j + 1) % angular
      idx.push(a0 + j, a0 + j2, a1 + j)
      idx.push(a0 + j2, a1 + j2, a1 + j)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.boundingSphere = null
  return g
}

const N_WAVES = WAVES.length

export const Ocean = forwardRef<ShaderMaterial>((_props, ref) => {
  const geom = useMemo(() => polarGeometry(store.mobile ? 70 : 120, store.mobile ? 110 : 210, 170), [])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uFlash: { value: 0 },
      uCamPos: { value: new Vector3() },
      uFog: { value: new Color('#0a1220') },
      uRing: { value: new Vector4(0, 0, 0, 0) },
      uCalm: { value: 0 },
      uBoltPos: { value: new Vector3(0, 12, 60) },
      uBoltI: { value: 0 },
      uDetail: { value: store.mobile ? 0 : 1 },
      uPush: { value: CREST_PUSH },
      uWaves: { value: WAVES.map((w) => new Vector4(w.dx, w.dz, w.k, w.a)) },
      uSpeeds: { value: WAVES.map((w) => w.s) },
    }),
    [],
  )
  return (
    <mesh geometry={geom} frustumCulled={false}>
      <shaderMaterial
        ref={ref}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          uniform float uTime; uniform float uAmp; uniform float uPush;
          uniform vec4 uWaves[${N_WAVES}]; uniform float uSpeeds[${N_WAVES}];
          varying vec3 vWorld; varying float vH; varying vec3 vN; varying float vSlope;
          void main(){
            vec3 p = position;
            float h = 0.0; float dhx = 0.0; float dhz = 0.0; vec2 push = vec2(0.0);
            for (int i = 0; i < ${N_WAVES}; i++) {
              vec4 w = uWaves[i];
              float ph = w.z * (w.x * p.x + w.y * p.z) + uSpeeds[i] * uTime;
              float g = 0.5 + 0.5 * sin(ph);
              h += w.w * (2.0 * g * g - 1.0);
              float c = 2.0 * g * cos(ph) * w.w * w.z;
              dhx += c * w.x; dhz += c * w.y;
              push += vec2(w.x, w.y) * (w.w * 0.5 * cos(ph));
            }
            float pk = smoothstep(6.0, 22.0, length(p.xz));
            float f = uAmp * (0.45 + 0.55 * pk);
            h *= f; dhx *= f; dhz *= f;
            p.xz += push * uPush * f;      // crests bunch up and lean over a little
            p.y = h; vH = h;
            vSlope = length(vec2(dhx, dhz));
            vN = normalize(vec3(-dhx, 1.0, -dhz));
            vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uCamPos; uniform float uFlash; uniform vec3 uFog; uniform vec4 uRing; uniform float uAmp; uniform float uTime;
          uniform float uCalm; uniform vec3 uBoltPos; uniform float uBoltI; uniform float uDetail;
          varying vec3 vWorld; varying float vH; varying vec3 vN; varying float vSlope;

          float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
          float fbm(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

          void main(){
            vec3 N = normalize(vN);
            vec2 wp = vWorld.xz;
            float amp = clamp(uAmp, 0.0, 1.0);
            if (uDetail > 0.5) {
              // wind chop: two drifting noise layers tilt the normal so the surface never looks glassy
              vec2 q = wp * 0.55;
              float n1 = fbm(q + vec2(uTime * 0.35, uTime * 0.12));
              float n2 = fbm(q * 1.7 - vec2(uTime * 0.2, -uTime * 0.3) + 7.3);
              N = normalize(N + vec3(n1 - 0.5, 0.0, n2 - 0.5) * (0.12 + 0.6 * amp));
            }
            vec3 V = normalize(uCamPos - vWorld);
            float ndv = max(dot(N, V), 0.0);
            float fres = pow(1.0 - ndv, 3.0);

            vec3 deep = mix(vec3(0.004, 0.012, 0.024), vec3(0.01, 0.07, 0.10), uCalm);
            vec3 shallow = mix(vec3(0.02, 0.07, 0.11), vec3(0.06, 0.28, 0.32), uCalm);
            float hn = clamp(vH / (uAmp * 1.5 + 0.001) * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(deep, shallow, hn * 0.7);

            // sky reflection — near black in the storm, lit up when lightning flashes
            vec3 sky = mix(vec3(0.02, 0.04, 0.07), vec3(0.5, 0.62, 0.85), uFlash) + uCalm * vec3(0.04, 0.12, 0.16);
            col = mix(col, sky, fres * 0.85);

            // lightning: a hard glitter streak toward the bolt + a broad sheen over every wave face
            vec3 Lb = normalize(uBoltPos - vWorld);
            vec3 Hb = normalize(Lb + V);
            float nh = max(dot(N, Hb), 0.0);
            col += (pow(nh, 150.0) * 16.0 + pow(nh, 20.0) * 0.9) * uBoltI * vec3(0.75, 0.85, 1.0);
            // soft general specular (cloud glow / dawn)
            vec3 L = normalize(vec3(-0.3, 0.7, 0.5));
            col += pow(max(dot(N, normalize(L + V)), 0.0), 80.0) * (0.1 + uFlash * 3.0 + uCalm * 0.3) * vec3(0.7, 0.82, 1.0);
            // light shining through thin crests
            col += pow(hn, 3.0) * (uFlash * 0.9 + uBoltI * 0.4) * vec3(0.05, 0.22, 0.2);

            // whitecaps: foam where the swell is both high and steep, broken up into lace
            float crest = smoothstep(0.5, 0.9, hn);
            float steep = smoothstep(0.25, 0.75, vSlope);
            float lace = uDetail > 0.5 ? fbm(wp * 1.25 + vec2(uTime * 0.25, uTime * 0.1)) : 0.5 + 0.5 * sin(wp.x * 2.7 + wp.y * 2.3 + uTime);
            float foam = clamp(crest * 0.8 + steep * 0.7 - 0.35, 0.0, 1.0) * smoothstep(0.3, 0.62, lace + 0.15) * smoothstep(0.2, 0.9, uAmp);
            foam += smoothstep(0.55, 0.8, lace) * 0.22 * smoothstep(0.3, 1.0, uAmp); // trailing patches in the troughs
            foam = clamp(foam, 0.0, 1.0);
            vec3 foamCol = vec3(0.72, 0.8, 0.9) * (0.15 + uFlash * 2.2 + uBoltI * 0.7) + vec3(0.04, 0.06, 0.08);
            col = mix(col, foamCol, foam * 0.85);

            // golden glow of the ring on the water
            float gd = length(vWorld.xz - uRing.xz);
            float g = exp(-gd * 0.6) * uRing.w;
            col += g * vec3(1.0, 0.55, 0.22) * (0.25 + 0.8 * fres) * 0.9;

            float d = distance(uCamPos, vWorld);
            col = mix(col, uFog, smoothstep(30.0, 150.0, d));
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  )
})
