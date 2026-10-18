import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Center, Text3D } from '@react-three/drei'
import { Group, AdditiveBlending, Color, MeshStandardMaterial } from 'three'
import font from '../../assets/helvetiker_bold.typeface.json'
import { Cage } from '../Cage'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { store } from '../../core/store'
import { clamp01, damp, easeInOut } from '../../core/math'
import { palette } from '../../theme'
import { softTexture } from '../textures'

/** 01 — HERO: black void, a glowing octagon assembles itself from floating fragments, camera dives through the door. */
export function Hero() {
  const text = useRef<Group>(null)
  const aspectPush = useRef(0)
  const glowTex = useMemo(() => softTexture(), [])
  const accent = palette().glow
  const titleMat = useMemo(
    () => new MeshStandardMaterial({ color: '#121214', metalness: 0.85, roughness: 0.28, emissive: new Color(palette().accent).multiplyScalar(0.12) }),
    [],
  )

  const assemble = () => {
    if (!store.ready) return 0
    return clamp01((performance.now() / 1000 - store.introStart) / 3.8)
  }

  useSceneFrame(0, (p, dt, state) => {
    const portrait = state.size.width / state.size.height < 1
    aspectPush.current = damp(aspectPush.current, portrait ? 7 : 0, 3, dt)
    const k = aspectPush.current
    const e = easeInOut(clamp01(p / 0.85))
    const pos = keys(p, [
      { p: 0, v: [0, 2.4, 13.5 + k] },
      { p: 0.45, v: [0, 2.0, 8.6 + k * 0.7] },
      { p: 0.62, v: [0, 1.7, 5.6] },
      { p: 0.82, v: [0, 1.6, 0.8] },
      { p: 1, v: [0, 1.7, -1.6] },
    ])
    const look = keys(p, [
      { p: 0, v: [0, 1.9, 0] },
      { p: 0.7, v: [0, 1.9, -3] },
      { p: 1, v: [0, 2.0, -8] },
    ])
    setCam(0, state.camera as never, pos, look, 50 + e * 8, dt, { lambda: 6, parallax: 0.3 })

    if (text.current) {
      // the title "lands" with a little weighted bounce once the last cage bar locks in
      const s = clamp01((assemble() - 0.86) / 0.14)
      const c1 = 1.70158
      const back = 1 + (c1 + 1) * Math.pow(s - 1, 3) + c1 * Math.pow(s - 1, 2)
      text.current.scale.setScalar(0.9 + 0.1 * back)
      text.current.rotation.y = damp(text.current.rotation.y, store.mouse.x * 0.35, 3, dt)
      text.current.rotation.x = damp(text.current.rotation.x, store.mouse.y * 0.18, 3, dt)
      text.current.position.y = 2.4 + Math.sin(state.clock.elapsedTime * 0.8) * 0.06
    }
    store.fx.warp = 0
  })

  return (
    <group>
      <Cage assemble={assemble} radius={5} height={4} thickness={0.08} />
      {/* octagon floor + glow */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, -0.01, 0]}>
        <circleGeometry args={[5, 8]} />
        <meshStandardMaterial color="#0b0b0d" roughness={0.55} metalness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[16, 16]} />
        <meshBasicMaterial map={glowTex} color={accent} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* 3D extruded title */}
      <group ref={text} position={[0, 2.4, -3.6]}>
        <Center>
          <Text3D
            font={font as never}
            size={2.1}
            height={0.55}
            curveSegments={6}
            bevelEnabled
            bevelThickness={0.06}
            bevelSize={0.035}
            bevelSegments={3}
            letterSpacing={0.08}
            material={titleMat}
          >
            MMA
          </Text3D>
        </Center>
      </group>
      <ParticleField count={count(650)} box={[16, 10, 16]} vel={[0, 0.55, 0]} size={26} color="#ff6a3d" position={[0, 3, 0]} seed={3} />
      <ParticleField count={count(260)} box={[22, 12, 22]} vel={[0, 0.12, 0]} size={12} color="#ffffff" opacity={0.35} position={[0, 4, 0]} seed={9} />
    </group>
  )
}
