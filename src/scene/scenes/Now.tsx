import { useMemo, useRef } from 'react'
import type { ShaderMaterial } from 'three'
import { Cage } from '../Cage'
import { GradientSky } from '../GradientSky'
import { ParticleField } from '../particles'
import { Glow } from '../shapes'
import { glowMaterial } from '../materials'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { heartbeat, lerp, smooth } from '../../core/math'
import { palette } from '../../theme'
import { pinnedProgress } from '../../core/store'

/**
 * 14 — NOW (closing): the camera pulls back out through the cage's open door into a night sky. The octagon reassembles in
 * light as stars appear, then breathes gently (like the CTA button).
 */
export function Now() {
  const accent = palette()
  const sky = useRef<ShaderMaterial>(null)
  const beam = useMemo(() => glowMaterial(accent.glow, 0.0), [accent])
  const assemble = useRef(0)

  useSceneFrame(13, (_raw, dt, state) => {
    const p = pinnedProgress(13) // last chapter: the page ends when it is fully pinned, so use its pinned progress
    const t = state.clock.elapsedTime
    assemble.current = smooth(0.04, 0.58, p)
    if (sky.current) {
      sky.current.uniforms.uStars.value = smooth(0.05, 0.5, p) * 1.4
      sky.current.uniforms.uTime.value = t
    }
    beam.uniforms.uOpacity.value = smooth(0.35, 0.8, p) * 0.45
    const z = lerp(0.6, 25, smooth(0.0, 0.78, p))
    const y = lerp(1.7, 6.5, smooth(0.1, 0.9, p))
    setCam(13, state.camera as never, [0, y, z], [0, lerp(2.2, -2.2, p), -2], lerp(60, 52, p), dt, { lambda: 4, parallax: 0.2 })
  })

  return (
    <group>
      <GradientSky top="#01020a" mid="#070d24" horizon="#1d1030" sunDir={[0, -0.5, -1]} sunSize={0.0001} sunColor="#000000" stars={0} ref={sky} />
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[5, 8]} />
        <meshStandardMaterial color="#0a0a10" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[200, 48]} />
        <meshStandardMaterial color="#05060d" roughness={0.6} metalness={0.5} />
      </mesh>
      <Cage assemble={() => assemble.current} glow={() => 0.9 + heartbeat(performance.now() / 1000, 52) * 0.35} radius={5} height={4} thickness={0.13} scatter={22} seed={13} scale={1.5} />
      <mesh position={[0, 12, 0]} material={beam} rotation={[0, 0, 0]}>
        <coneGeometry args={[4.4, 24, 8, 1, true]} />
      </mesh>
      <Glow position={[0, 0.2, 0]} size={[22, 8]} color={`#${accent.glow.getHexString()}`} opacity={0.5} />
      <ParticleField count={count(420)} box={[30, 16, 30]} vel={[0, 0.5, 0]} size={16} color={`#${accent.glow.getHexString()}`} opacity={0.7} position={[0, 7, 0]} seed={33} />
      <ParticleField count={count(300)} box={[80, 40, 80]} vel={[0, 0.03, 0]} size={7} color="#ffffff" opacity={0.5} position={[0, 20, 0]} seed={34} />
    </group>
  )
}
