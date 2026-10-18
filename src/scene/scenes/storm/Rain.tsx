import { forwardRef, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { mulberry32 } from '../../../core/math'
import { store } from '../../../core/store'

/** Wind-driven rain streaks wrapped around the camera (so the whole sky always rains on the shot). */
const BOX = new Vector3(56, 34, 56)

export const Rain = forwardRef<ShaderMaterial>((_p, ref) => {
  const n = store.mobile ? 1800 : 5200
  const geom = useMemo(() => {
    const r = mulberry32(77)
    const pos = new Float32Array(n * 2 * 3)
    const end = new Float32Array(n * 2)
    const seed = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * BOX.x
      const y = (r() - 0.5) * BOX.y
      const z = (r() - 0.5) * BOX.z
      const s = 0.7 + r() * 0.6
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z
        end[i * 2 + k] = k
        seed[i * 2 + k] = s
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aEnd', new BufferAttribute(end, 1))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    g.boundingSphere = null
    return g
  }, [n])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCenter: { value: new Vector3() },
      uAlpha: { value: 1 },
      uBox: { value: BOX },
      uVel: { value: new Vector3(7, -30, 2) },
    }),
    [],
  )
  return (
    <lineSegments geometry={geom} frustumCulled={false}>
      <shaderMaterial
        ref={ref}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={/* glsl */ `
          uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform vec3 uVel;
          attribute float aEnd; attribute float aSeed; varying float vA;
          void main(){
            vec3 base = position;
            vec3 q = mod(base + uVel * uTime * aSeed - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
            vec3 wp = uCenter + q;
            wp -= normalize(uVel) * aEnd * (0.9 + aSeed * 0.5);
            vA = (1.0 - aEnd * 0.9) * (0.4 + 0.6 * aSeed);
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform float uAlpha; varying float vA;
          void main(){ gl_FragColor = vec4(0.62, 0.76, 1.0, vA * 0.5 * uAlpha); }`}
      />
    </lineSegments>
  )
})
