import { useMemo, useRef } from 'react'
import { ShaderMaterial, Group } from 'three'
import { createFigure, Figure } from '../figure'
import { rimMaterial } from '../materials'
import { Emit, Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { heartbeat, lerp, mulberry32 } from '../../core/math'
import { light } from '../Rig'
import { store } from '../../core/store'

/**
 * 03 — THE BASEMENT: a dim room, a huge screen flickering blue over crowd silhouettes,
 * a slow camera orbit and a glow that pulses like a heartbeat.
 */
const screenMat = () =>
  new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 } },
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; varying vec2 vUv;
      float blob(vec2 p, vec2 c, float r){ return smoothstep(r, 0.0, length(p - c)); }
      void main(){
        vec2 uv = vUv; vec2 p = uv - 0.5; p.x *= 1.78;
        vec3 col = vec3(0.03, 0.06, 0.16);
        float oct = max(max(abs(p.x), abs(p.y)), (abs(p.x) + abs(p.y)) * 0.7071);
        col += smoothstep(0.36, 0.34, oct) * vec3(0.10, 0.13, 0.26);
        col += smoothstep(0.014, 0.0, abs(oct - 0.36)) * vec3(0.7, 0.8, 1.0);
        vec2 a = vec2(-0.12 + 0.12 * sin(uTime * 0.9), 0.02 * sin(uTime * 1.9));
        vec2 b = vec2( 0.12 + 0.12 * sin(uTime * 0.8 + 2.0), 0.02 * sin(uTime * 1.3));
        col += blob(p, a, 0.07) * vec3(1.0, 0.25, 0.2) + blob(p, b, 0.07) * vec3(0.3, 0.55, 1.0);
        col += blob(p, (a + b) * 0.5, 0.2) * vec3(0.18, 0.2, 0.35);
        // broadcast lower-third
        col += step(0.06, uv.y) * step(uv.y, 0.1) * step(0.08, uv.x) * step(uv.x, 0.6) * vec3(0.5, 0.1, 0.12);
        col *= 0.88 + 0.12 * sin(uv.y * 420.0 + uTime * 12.0);
        col *= 0.9 + 0.14 * sin(uTime * 31.0) * sin(uTime * 7.0);
        col *= 1.5 + uBeat * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })

interface Spec { x: number; z: number; seated: boolean; point: number; scale: number; me?: boolean }

export function Basement() {
  const root = useRef<Group>(null)
  const screen = useMemo(screenMat, [])
  const crowdMat = useMemo(() => rimMaterial('#04060c', '#4d7cff', 2.2, 2.2), [])
  const meMat = useMemo(() => rimMaterial('#06080f', '#ffb347', 2.2, 2.0), [])

  const specs = useMemo<Spec[]>(() => {
    const r = mulberry32(11)
    const n = store.mobile ? 9 : 17
    const out: Spec[] = []
    for (let i = 0; i < n; i++) {
      const row = i % 3
      out.push({
        x: -5.2 + (i / n) * 10.4 + (r() - 0.5) * 0.8,
        z: -2.2 + row * 1.7 + (r() - 0.5) * 0.5,
        seated: row > 0 && r() > 0.35,
        point: r() * 6,
        scale: 0.95 + r() * 0.2,
      })
    }
    out.push({ x: -1.0, z: 3.6, seated: true, point: 2, scale: 0.85, me: true })
    out.push({ x: -0.1, z: 3.6, seated: true, point: 4.5, scale: 0.85, me: true })
    return out
  }, [])

  const figs = useMemo<Figure[]>(
    () =>
      specs.map((s) => {
        const f = createFigure(s.me ? meMat : crowdMat, s.scale)
        f.root.rotation.y = Math.PI // face the screen (-Z)
        f.root.position.set(s.x, s.seated ? 0.62 * s.scale : 0.98 * s.scale, s.z)
        if (s.seated) {
          f.j.hpL.rotation.x = f.j.hpR.rotation.x = -1.45
          f.j.knL.rotation.x = f.j.knR.rotation.x = 1.5
        }
        return f
      }),
    [specs, crowdMat, meMat],
  )

  useSceneFrame(2, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const beat = heartbeat(t, 66)
    screen.uniforms.uTime.value = t
    screen.uniforms.uBeat.value = beat
    light.ptMul = 1 + beat * 1.1
    light.hemiAdd = beat * 0.25

    figs.forEach((f, i) => {
      const s = specs[i]
      const lean = Math.sin(t * 0.8 + s.point) * 0.04
      f.j.spine.rotation.x = -0.05 + lean + beat * 0.06
      f.j.head.rotation.y = Math.sin(t * 0.5 + s.point) * 0.25
      // some people throw an arm toward the screen in time with the "action"
      const arm = Math.max(0, Math.sin(t * 0.7 + s.point * 1.7)) ** 3
      f.j.shR.rotation.x = -1.2 * arm
      f.j.elR.rotation.x = -0.3 * arm
      f.j.shL.rotation.z = 0.12
      f.j.shR.rotation.z = -0.12
    })

    // slow orbit around the room, always facing the screen
    const a = lerp(-0.6, 0.55, p)
    const R = 8.8
    setCam(2, state.camera as never, [Math.sin(a) * R, lerp(2.7, 1.9, p), Math.cos(a) * R * 0.85 + 1.2], [0, 1.5, -3], 60 - p * 6, dt, { lambda: 5 })
  })

  return (
    <group ref={root}>
      {/* room shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#10131c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#080a10" roughness={1} />
      </mesh>
      <mesh position={[0, 2, -6.4]}>
        <planeGeometry args={[16, 4]} />
        <meshStandardMaterial color="#0c101a" roughness={0.95} />
      </mesh>
      <mesh position={[-8, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[14, 4]} />
        <meshStandardMaterial color="#0a0d16" roughness={0.95} />
      </mesh>
      <mesh position={[8, 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[14, 4]} />
        <meshStandardMaterial color="#0a0d16" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2, 7]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[16, 4]} />
        <meshStandardMaterial color="#0a0d16" roughness={0.95} />
      </mesh>

      {/* the big screen */}
      <mesh position={[0, 2.3, -6.3]} material={screen}>
        <planeGeometry args={[8.4, 4.7]} />
      </mesh>
      <Emit position={[0, 2.3, -6.34]} size={[8.7, 4.95, 0.05]} color="#4a6bff" boost={0.6} />
      <Glow position={[0, 2.3, -5.6]} size={[18, 11]} color="#4d7cff" opacity={0.5} />
      <Glow position={[0, 0.2, -3]} size={[16, 5]} color="#4d7cff" opacity={0.28} />

      {figs.map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}

      <ParticleField count={count(300)} box={[14, 4, 12]} vel={[0, 0.05, 0.03]} size={9} color="#8fb2ff" opacity={0.5} position={[0, 2, 0]} seed={8} />
    </group>
  )
}
