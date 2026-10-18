import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from 'three'
import { mulberry32 } from '../core/math'

/**
 * Generic GPU particle field. Positions are computed in the vertex shader:
 *   p = base + velocity * time, wrapped inside `box` (so it loops forever).
 * `speed()` scales time (0 = frozen mid-air, used in the Quiet scene),
 * `shock()` returns {r, amp, c} for a shockwave ripple pushing particles outward.
 */
interface Props {
  count: number
  box: [number, number, number]
  vel?: [number, number, number]
  size?: number
  color?: string
  opacity?: number
  seed?: number
  speed?: () => number
  shock?: () => { r: number; amp: number }
  position?: [number, number, number]
}

export function ParticleField({
  count,
  box,
  vel = [0, 0.6, 0],
  size = 22,
  color = '#ff6a3d',
  opacity = 1,
  seed = 1,
  speed,
  shock,
  position,
}: Props) {
  const mat = useRef<ShaderMaterial>(null)
  const t = useRef(0)

  const geom = useMemo(() => {
    const rnd = mulberry32(seed)
    const g = new BufferGeometry()
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new BufferAttribute(seeds, 4))
    g.boundingSphere = null
    return g
  }, [count, seed])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBox: { value: new Vector3(...box) },
      uVel: { value: new Vector3(...vel) },
      uSize: { value: size },
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uShockR: { value: -10 },
      uShockAmp: { value: 0 },
      uPR: { value: Math.min(window.devicePixelRatio, 2) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((_, dt) => {
    const m = mat.current
    if (!m) return
    t.current += Math.min(dt, 0.05) * (speed ? speed() : 1)
    m.uniforms.uTime.value = t.current
    if (shock) {
      const s = shock()
      m.uniforms.uShockR.value = s.r
      m.uniforms.uShockAmp.value = s.amp
    }
    m.uniforms.uOpacity.value = opacity
    m.uniforms.uColor.value.set(color)
  })

  return (
    <points geometry={geom} position={position} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={/* glsl */ `
          uniform float uTime; uniform vec3 uBox; uniform vec3 uVel; uniform float uSize; uniform float uPR;
          uniform float uShockR; uniform float uShockAmp;
          attribute vec4 aSeed; varying float vA;
          void main(){
            vec3 p = (aSeed.xyz - 0.5) * uBox;
            float t = uTime * (0.55 + aSeed.w * 0.9);
            p += uVel * t;
            p.x += sin(t * 0.7 + aSeed.x * 20.0) * 0.35;
            p.z += cos(t * 0.6 + aSeed.y * 20.0) * 0.35;
            p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;
            float d = length(p);
            float ring = exp(-pow((d - uShockR) * 0.9, 2.0)) * uShockAmp;
            p += normalize(p + 1e-4) * ring * 2.2;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * uPR * (0.5 + aSeed.w) * (10.0 / max(0.5, -mv.z));
            float tw = 0.65 + 0.35 * sin(uTime * 2.0 + aSeed.x * 40.0);
            vA = (0.35 + 0.65 * aSeed.w) * tw * (1.0 + ring * 4.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uColor; uniform float uOpacity; varying float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(uColor, a * a * vA * uOpacity);
          }`}
      />
    </points>
  )
}
