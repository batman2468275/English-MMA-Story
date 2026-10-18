import { useMemo, useRef } from 'react'
import { Color, Group, Mesh, MeshStandardMaterial, Sprite } from 'three'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { heartbeat, lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { palette } from '../../theme'
import { light } from '../Rig'

/**
 * 11 — THE BROKEN FOOT: a stylised foot-bone graphic. A metatarsal breaks (the halves separate, shards fly), a crack is
 * drawn across the screen (DOM overlay in ui/FxOverlay.tsx), then the break closes and fills with golden light:
 * healing / determination instead of staying broken.
 */
const BONE = '#e8e2d2'

function Cap({ r, len, pos, rot = [Math.PI / 2, 0, 0], mat }: { r: number; len: number; pos: [number, number, number]; rot?: [number, number, number]; mat: MeshStandardMaterial }) {
  return (
    <mesh position={pos} rotation={rot} material={mat}>
      <capsuleGeometry args={[r, len, 6, 14]} />
    </mesh>
  )
}

export function Foot() {
  const accent = palette()
  const foot = useRef<Group>(null)
  const broken = useRef<Group>(null) // distal half of the fractured metatarsal
  const seam = useRef<Mesh>(null)
  const halo = useRef<Sprite>(null)
  const shards = useRef<(Mesh | null)[]>([])
  const mat = useMemo(() => new MeshStandardMaterial({ color: BONE, roughness: 0.5, metalness: 0.05, emissive: new Color('#000') }), [])
  const gold = useMemo(() => new Color(accent.warm), [accent])
  const seamMat = useMemo(() => new MeshStandardMaterial({ color: '#fff', emissive: gold, emissiveIntensity: 0, transparent: true, opacity: 0 }), [gold])

  const shardDirs = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2 + 0.4, s: 0.03 + (i % 3) * 0.02, r: 0.25 + (i % 4) * 0.12 })),
    [],
  )

  useSceneFrame(10, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const crack = smooth(0.08, 0.3, p)
    const heal = smooth(0.52, 0.8, p)
    const gap = crack * (1 - heal)
    const beat = heartbeat(t, 68)

    if (foot.current) {
      // toes point sideways so the camera sees the foot in profile (a recognisable foot, not an arm)
      foot.current.rotation.y = lerp(1.0, 2.15, p)
      foot.current.rotation.x = 0.1
      foot.current.position.set(0, -0.2 + Math.sin(t * 0.7) * 0.04, 0)
    }
    if (broken.current) {
      broken.current.position.set(0, gap * 0.1, gap * 0.26)
      broken.current.rotation.x = gap * 0.32
      broken.current.rotation.y = gap * 0.12
    }
    // bones glow gold as they knit back together
    mat.emissive.copy(gold)
    mat.emissiveIntensity = heal * (0.3 + beat * 0.25)
    seamMat.emissiveIntensity = (0.5 + beat * 1.4) * heal * 3
    seamMat.opacity = heal * (1 - smooth(0.95, 1, p) * 0.5)
    if (seam.current) seam.current.scale.setScalar(1 + beat * 0.2)
    if (halo.current) {
      halo.current.material.opacity = 0.18 + heal * 0.6 + gap * 0.2
      halo.current.material.color.copy(gap > 0.3 ? new Color('#ff4a4a') : gold).multiplyScalar(1.6)
    }
    shards.current.forEach((m, i) => {
      if (!m) return
      const d = shardDirs[i]
      m.visible = gap > 0.02
      m.position.set(Math.cos(d.a) * d.r * gap * 1.4, 0.05 + Math.sin(d.a * 2) * 0.15 * gap, 0.55 + gap * 0.2 + Math.sin(d.a) * d.r * gap * 0.8)
      m.rotation.set(t * 0.5 + i, t * 0.4, i)
      m.scale.setScalar(d.s * 3 * gap)
    })
    light.ptMul = 1 + heal * 1.4

    setCam(10, state.camera as never, [lerp(0.6, 0.2, p), lerp(1.5, 1.0, p), lerp(5.6, 4.7, p)], [0, 0.15, 0.2], 42, dt, { lambda: 4, parallax: 0.15 })
  })

  return (
    <group>
      <Glow ref={halo} position={[0, 0.3, -1.4]} size={[9, 7]} color="#ff4a4a" opacity={0.25} boost={1.6} />
      <group ref={foot} scale={1.35} position={[0, 0, 0]}>
        {/* tibia + ankle + heel */}
        <Cap r={0.15} len={1.3} pos={[0, 0.85, -0.78]} rot={[0.1, 0, 0]} mat={mat} />
        <Cap r={0.24} len={0.34} pos={[0, 0.02, -0.5]} mat={mat} />
        <Cap r={0.21} len={0.18} pos={[0, -0.08, -0.92]} rot={[1.2, 0, 0]} mat={mat} />
        {/* metatarsals + toes */}
        {[0, 1, 2, 3, 4].map((i) => {
          const x = (i - 2) * 0.175
          const fan = (i - 2) * 0.05
          const r = i === 0 ? 0.075 : 0.062
          if (i === 2) {
            // the fractured one: proximal half stays, distal half (in `broken`) separates
            return (
              <group key={i} position={[x, -0.02, 0]} rotation={[0, fan, 0]}>
                <Cap r={r} len={0.42} pos={[0, 0, -0.04]} mat={mat} />
                <mesh ref={seam} position={[0, 0, 0.2]} rotation={[0, 0, 0]} material={seamMat}>
                  <torusGeometry args={[r * 1.25, 0.022, 8, 24]} />
                </mesh>
                <group ref={broken}>
                  <Cap r={r} len={0.4} pos={[0, 0, 0.62]} mat={mat} />
                  <Cap r={0.045} len={0.15} pos={[0, 0, 0.98]} mat={mat} />
                  <Cap r={0.04} len={0.1} pos={[0, 0, 1.14]} mat={mat} />
                </group>
              </group>
            )
          }
          return (
            <group key={i} position={[x, -0.02, 0]} rotation={[0, fan, 0]}>
              <Cap r={r} len={0.9} pos={[0, 0, 0.35]} mat={mat} />
              <Cap r={i === 0 ? 0.062 : 0.045} len={0.16} pos={[0, 0, 0.98]} mat={mat} />
              <Cap r={i === 0 ? 0.055 : 0.04} len={0.1} pos={[0, 0, 1.14]} mat={mat} />
            </group>
          )
        })}
        {shardDirs.map((_, i) => (
          <mesh key={i} ref={(m) => (shards.current[i] = m)} visible={false} material={mat}>
            <tetrahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#0b0b0e" roughness={0.4} metalness={0.7} />
      </mesh>
      <ParticleField count={count(220)} box={[8, 6, 8]} vel={[0, 0.35, 0]} size={12} color="#ffc15a" opacity={0.55} position={[0, 1, 0]} seed={44} speed={() => 0.15 + smooth(0.5, 0.8, store.local[10]) * 1.2} />
    </group>
  )
}
