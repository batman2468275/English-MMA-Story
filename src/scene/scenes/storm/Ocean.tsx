import { forwardRef, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, Vector4 } from 'three'
import { WAVES } from './waves'
import { store } from '../../../core/store'

/**
 * The storm ocean: a polar grid (dense near the camera, sparse at the horizon) displaced in the vertex shader by
 * the same sum-of-sines as waves.ts. Fragment shader adds fresnel sky reflection, crest foam, lightning specular and
 * a golden reflection of the glowing ring.
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

export interface OceanUniforms {
  uTime: { value: number }
  uAmp: { value: number }
  uFlash: { value: number }
  uCamPos: { value: Vector3 }
  uFog: { value: Color }
  uRing: { value: Vector4 } // xyz = position, w = glow strength
  uCalm: { value: number }
}

export const Ocean = forwardRef<ShaderMaterial>((_props, ref) => {
  const geom = useMemo(() => polarGeometry(store.mobile ? 70 : 110, store.mobile ? 110 : 190, 170), [])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uFlash: { value: 0 },
      uCamPos: { value: new Vector3() },
      uFog: { value: new Color('#0a1220') },
      uRing: { value: new Vector4(0, 0, 0, 0) },
      uCalm: { value: 0 },
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
          uniform float uTime; uniform float uAmp; uniform vec4 uWaves[5]; uniform float uSpeeds[5];
          varying vec3 vWorld; varying float vH; varying vec3 vN;
          void main(){
            vec3 p = position; float h = 0.0; float dhx = 0.0; float dhz = 0.0;
            for (int i = 0; i < 5; i++) {
              vec4 w = uWaves[i];
              float ph = w.z * (w.x * p.x + w.y * p.z) + uSpeeds[i] * uTime;
              h += w.w * sin(ph);
              float c = cos(ph) * w.w * w.z;
              dhx += c * w.x; dhz += c * w.y;
            }
            float pk = smoothstep(6.0, 22.0, length(p.xz));
            float f = uAmp * (0.45 + 0.55 * pk);
            h *= f; dhx *= f; dhz *= f;
            p.y = h; vH = h;
            vN = normalize(vec3(-dhx, 1.0, -dhz));
            vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uCamPos; uniform float uFlash; uniform vec3 uFog; uniform vec4 uRing; uniform float uAmp; uniform float uTime; uniform float uCalm;
          varying vec3 vWorld; varying float vH; varying vec3 vN;
          void main(){
            vec3 N = normalize(vN);
            vec3 V = normalize(uCamPos - vWorld);
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            vec3 deep = mix(vec3(0.004, 0.012, 0.024), vec3(0.01, 0.07, 0.10), uCalm);
            vec3 shallow = mix(vec3(0.02, 0.07, 0.11), vec3(0.06, 0.28, 0.32), uCalm);
            float hn = clamp(vH / (uAmp * 1.6 + 0.001) * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(deep, shallow, hn * 0.7);
            vec3 sky = mix(vec3(0.02, 0.04, 0.07), vec3(0.5, 0.62, 0.85), uFlash) + uCalm * vec3(0.04, 0.12, 0.16);
            col = mix(col, sky, fres * 0.85);
            vec3 L = normalize(vec3(-0.3, 0.7, 0.5));
            vec3 H = normalize(L + V);
            col += pow(max(dot(N, H), 0.0), 80.0) * (0.12 + uFlash * 5.0 + uCalm * 0.3) * vec3(0.7, 0.82, 1.0);
            // crest foam
            float foam = smoothstep(0.52, 0.85, hn) * smoothstep(0.25, 0.9, uAmp);
            foam *= 0.55 + 0.45 * sin(vWorld.x * 2.7 + vWorld.z * 2.3 + uTime * 1.5) * sin(vWorld.z * 1.9 - vWorld.x * 1.3);
            col = mix(col, vec3(0.7, 0.8, 0.9) * (0.18 + uFlash * 2.6), clamp(foam, 0.0, 1.0) * 0.75);
            // glow of the ring reflected on the water
            float gd = length(vWorld.xz - uRing.xz);
            float g = exp(-gd * 0.6) * uRing.w;
            col += g * vec3(1.0, 0.55, 0.22) * (0.25 + 0.8 * fres) * 0.9;
            // fog toward horizon colour
            float d = distance(uCamPos, vWorld);
            col = mix(col, uFog, smoothstep(30.0, 150.0, d));
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  )
})
