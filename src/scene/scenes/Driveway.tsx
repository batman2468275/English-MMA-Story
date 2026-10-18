import { useMemo, useRef } from 'react'
import { Color, Group, MeshBasicMaterial, AdditiveBlending, Mesh } from 'three'
import { Box, Emit, Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { range, smooth, mulberry32 } from '../../core/math'
import { light } from '../Rig'
import { store } from '../../core/store'

/**
 * 02 — THE DRIVEWAY: a stylised low-poly night street. Warm glowing windows, a car sweeping past with
 * headlights, and the camera gliding up the driveway and through the front door.
 */
const HOUSE_Z = -27
const FRONT_Z = HOUSE_Z + 4.6

function Window({ x, y, w = 1.5, h = 1.1, tv = false, idx = 0 }: { x: number; y: number; w?: number; h?: number; tv?: boolean; idx?: number }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: tv ? '#8fb2ff' : '#ffb347', toneMapped: false }), [tv])
  const base = useMemo(() => new Color(tv ? '#8fb2ff' : '#ffb347'), [tv])
  useSceneFrame(1, (_p, _dt, s) => {
    const t = s.clock.elapsedTime
    const f = tv ? 1.1 + 0.7 * Math.sin(t * 11 + idx * 3) * Math.sin(t * 3.7 + idx) : 1.5 + 0.15 * Math.sin(t * 2 + idx)
    mat.color.copy(base).multiplyScalar(Math.max(0.5, f))
  })
  return (
    <group position={[x, y, FRONT_Z + 0.02]}>
      <mesh material={mat}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <Glow position={[0, 0, 0.3]} size={[w * 2.1, h * 2.1]} color={tv ? '#6f8fff' : '#ffb347'} opacity={0.3} boost={1.2} />
    </group>
  )
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <Box position={[0, 0.8, 0]} size={[0.35, 1.6, 0.35]} color="#1a1410" />
      <mesh position={[0, 2.8, 0]}>
        <coneGeometry args={[1.5, 3.4, 6]} />
        <meshStandardMaterial color="#0e2216" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 4.3, 0]}>
        <coneGeometry args={[1.1, 2.6, 6]} />
        <meshStandardMaterial color="#12301d" roughness={1} flatShading />
      </mesh>
    </group>
  )
}

function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 2.2, 0]} size={[0.12, 4.4, 0.12]} color="#15161a" />
      <Box position={[0.5, 4.35, 0]} size={[1.1, 0.1, 0.14]} color="#15161a" />
      <Emit position={[0.95, 4.28, 0]} size={[0.3, 0.1, 0.2]} color="#ffd9a0" boost={2.4} />
      <Glow position={[0.95, 4.1, 0]} size={3.2} color="#ffb871" opacity={0.5} boost={1.2} />
    </group>
  )
}

function Car({ pFn }: { pFn: () => number }) {
  const g = useRef<Group>(null)
  const beams = useMemo(
    () => new MeshBasicMaterial({ color: new Color('#fff1cf').multiplyScalar(0.5), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  )
  useSceneFrame(1, () => {
    if (!g.current) return
    const t = pFn()
    g.current.position.x = -40 + t * 80
  })
  return (
    <group ref={g} position={[-40, 0, 1.6]} rotation={[0, 0, 0]}>
      <Box position={[0, 0.65, 0]} size={[4.2, 0.9, 1.9]} color="#1a1c24" metal={0.6} rough={0.35} />
      <Box position={[-0.2, 1.3, 0]} size={[2.3, 0.7, 1.7]} color="#14161d" metal={0.6} rough={0.3} />
      <Emit position={[2.12, 0.7, 0.65]} size={[0.06, 0.18, 0.4]} color="#fff6dc" boost={3} />
      <Emit position={[2.12, 0.7, -0.65]} size={[0.06, 0.18, 0.4]} color="#fff6dc" boost={3} />
      <Emit position={[-2.12, 0.7, 0.65]} size={[0.06, 0.15, 0.4]} color="#ff2a2a" boost={2} />
      <Emit position={[-2.12, 0.7, -0.65]} size={[0.06, 0.15, 0.4]} color="#ff2a2a" boost={2} />
      {/* headlight shafts */}
      <mesh position={[7.4, 0.55, 0.65]} rotation={[0, 0, -Math.PI / 2]} material={beams}>
        <coneGeometry args={[1.9, 10, 16, 1, true]} />
      </mesh>
      <mesh position={[7.4, 0.55, -0.65]} rotation={[0, 0, -Math.PI / 2]} material={beams}>
        <coneGeometry args={[1.9, 10, 16, 1, true]} />
      </mesh>
      <Glow position={[2.6, 0.7, 0]} size={4.5} color="#fff1cf" opacity={0.6} />
    </group>
  )
}

export function Driveway() {
  const trees = useMemo(() => {
    const r = mulberry32(5)
    const out: { x: number; z: number; s: number }[] = []
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1
      out.push({ x: side * (9 + r() * 12), z: -6 - r() * 40, s: 0.8 + r() * 0.8 })
    }
    return out
  }, [])
  const door = useRef<Mesh>(null)

  useSceneFrame(1, (p, dt, state) => {
    const pos = keys(p, [
      { p: 0, v: [-13, 1.75, 5.5] },
      { p: 0.22, v: [-4.5, 1.7, 3.2] },
      { p: 0.4, v: [0, 1.65, -3.5] },
      { p: 0.7, v: [0, 1.55, -14] },
      { p: 0.9, v: [0, 1.6, -22] },
      { p: 1, v: [0, 1.6, -25.8] },
    ])
    const look = keys(p, [
      { p: 0, v: [0, 3.5, -26] },
      { p: 0.4, v: [0, 2.6, -26] },
      { p: 1, v: [0, 1.6, -30] },
    ])
    setCam(1, state.camera as never, pos, look, 58 - smooth(0.6, 1, p) * 8, dt, { lambda: 7 })
    // the front door glow floods the camera at the end
    light.ptMul = 1 + smooth(0.75, 1, p) * 0.8
    if (door.current) door.current.scale.setScalar(1 + smooth(0.8, 1, p) * 0.1)
  })

  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -20]}>
        <planeGeometry args={[220, 160]} />
        <meshStandardMaterial color="#0b140e" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[220, 8]} />
        <meshStandardMaterial color="#0e0f14" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* road dashes */}
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-60 + i * 6.5, 0.01, 0]}>
          <planeGeometry args={[2.6, 0.18]} />
          <meshBasicMaterial color="#6d6a5e" />
        </mesh>
      ))}
      {/* driveway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -14]}>
        <planeGeometry args={[4.4, 21]} />
        <meshStandardMaterial color="#25262d" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -14]}>
        <planeGeometry args={[11, 21]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.04} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* house */}
      <Box position={[0, 3.2, HOUSE_Z]} size={[15, 6.4, 9.2]} color="#3a4160" rough={0.9} />
      <mesh position={[0, 8.0, HOUSE_Z]} rotation={[0, Math.PI / 4, 0]} scale={[1.18, 1, 0.86]}>
        <coneGeometry args={[8.2, 3.4, 4]} />
        <meshStandardMaterial color="#10131c" roughness={0.95} flatShading />
      </mesh>
      <Box position={[5.2, 9.2, HOUSE_Z + 1]} size={[1, 2.4, 1]} color="#14151c" />
      {/* upstairs windows (TV light), downstairs windows (warm) */}
      <Window x={-4.6} y={4.3} tv idx={1} />
      <Window x={-1.6} y={4.3} idx={2} />
      <Window x={1.6} y={4.3} tv idx={3} />
      <Window x={4.6} y={4.3} idx={4} />
      <Window x={-4.6} y={1.7} w={1.8} idx={5} />
      <Window x={4.6} y={1.7} w={1.8} idx={6} />
      {/* basement windows at ground level */}
      <Window x={-3} y={0.55} w={1.1} h={0.45} tv idx={7} />
      <Window x={3} y={0.55} w={1.1} h={0.45} tv idx={8} />
      {/* front door */}
      <mesh ref={door} position={[0, 1.15, FRONT_Z + 0.03]}>
        <planeGeometry args={[1.7, 2.3]} />
        <meshBasicMaterial color={new Color('#ffc477').multiplyScalar(2.2)} toneMapped={false} />
      </mesh>
      <Glow position={[0, 1.4, FRONT_Z + 0.6]} size={[5, 4.4]} color="#ffb347" opacity={0.6} boost={1.3} />
      <Glow position={[0, 0.2, FRONT_Z + 3]} size={[8, 4]} color="#ffb347" opacity={0.22} />
      <Box position={[0, 0.12, FRONT_Z + 0.9]} size={[3, 0.24, 1.8]} color="#2a2b33" />

      {/* trees, lamps, parked cars */}
      {trees.map((t, i) => <Tree key={i} {...t} />)}
      <Lamp x={-14} z={-3.6} />
      <Lamp x={13} z={-3.6} />
      <Lamp x={-3.4} z={-12} />
      <Lamp x={3.4} z={-18} />
      <group position={[-6.5, 0, -15]} rotation={[0, Math.PI / 2, 0]}>
        <Box position={[0, 0.65, 0]} size={[4.2, 0.9, 1.9]} color="#241a1a" metal={0.6} rough={0.4} />
        <Box position={[-0.2, 1.3, 0]} size={[2.3, 0.7, 1.7]} color="#1b1414" metal={0.6} rough={0.3} />
      </group>
      <group position={[6.5, 0, -19]} rotation={[0, Math.PI / 2, 0]}>
        <Box position={[0, 0.65, 0]} size={[4.2, 0.9, 1.9]} color="#1a2230" metal={0.6} rough={0.4} />
        <Box position={[-0.2, 1.3, 0]} size={[2.3, 0.7, 1.7]} color="#131a26" metal={0.6} rough={0.3} />
      </group>
      {/* the passing car's position is a pure function of scroll, so the headlight sweep scrubs both ways */}
      <Car pFn={() => range(store.local[1], 0.0, 0.55)} />

      {/* sky */}
      <mesh position={[-34, 34, -90]}>
        <sphereGeometry args={[3.2, 20, 16]} />
        <meshBasicMaterial color={new Color('#dfe8ff').multiplyScalar(1.8)} toneMapped={false} />
      </mesh>
      <Glow position={[-34, 34, -88]} size={40} color="#8fa6ff" opacity={0.5} />
      <ParticleField count={count(420)} box={[240, 70, 160]} vel={[0, 0, 0]} size={7} color="#cfd9ff" opacity={0.8} position={[0, 45, -40]} seed={21} />
      <ParticleField count={count(120)} box={[20, 8, 24]} vel={[0, 0.2, 0]} size={9} color="#ffb347" opacity={0.7} position={[0, 3, -16]} seed={4} />
    </group>
  )
}
