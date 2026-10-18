import { useMemo, useRef } from 'react'
import { AdditiveBlending, Group, Mesh, ShaderMaterial, Vector3 } from 'three'
import { createFigure, resetPose, solveArm, solveLeg } from '../figure'
import { rimMaterial } from '../materials'
import { GradientSky } from '../GradientSky'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { lerp, smooth } from '../../core/math'

/**
 * 07 — SUNSET ("two ways to win"): orange→purple sky, sun rays, and a golden-rim-lit silhouette pair on the mat:
 * Pantoja has Kara-France's back and locks in the rear-naked choke; at the end Kara-France taps.
 * The camera arcs around them.
 */
const SUN: [number, number, number] = [-0.15, 0.06, -1]
const tgt = new Vector3()
const head = new Vector3()
const pel = new Vector3()

export function Sunset() {
  const A = useMemo(() => createFigure(rimMaterial('#120712', '#ffc27a', 2.4, 2.2), 1), []) // Pantoja, behind
  const B = useMemo(() => createFigure(rimMaterial('#120712', '#ffb066', 2.4, 2.2), 1), []) // Kara-France, seated
  const rays = useRef<Mesh>(null)
  const grp = useRef<Group>(null)

  const rayMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
            float rays = 0.5 + 0.5 * sin(a * 18.0 + uTime * 0.15) * sin(a * 7.0 - uTime * 0.1);
            rays = pow(rays, 3.0);
            float fall = smoothstep(0.5, 0.0, r);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * rays * fall * 1.6, rays * fall * 0.55);
          }`,
      }),
    [],
  )

  useSceneFrame(6, (p, dt, state) => {
    const t = state.clock.elapsedTime
    rayMat.uniforms.uTime.value = t
    resetPose(A)
    resetPose(B)

    // B: seated on the mat, facing +X
    const struggle = Math.sin(t * 2.2) * 0.05 * (1 - smooth(0.78, 0.9, p))
    B.root.rotation.y = Math.PI / 2
    B.root.position.set(0.05 + struggle, 0.2, 0)
    B.root.rotation.x = -0.18
    B.j.hpL.rotation.x = B.j.hpR.rotation.x = -1.45
    B.j.hpL.rotation.z = 0.15
    B.j.hpR.rotation.z = -0.15
    B.j.knL.rotation.x = B.j.knR.rotation.x = 0.1
    B.j.head.rotation.x = 0.15 + smooth(0.55, 0.8, p) * 0.35
    // the tap: left hand slaps the mat / arm, right hand claws at the choke
    const tap = smooth(0.8, 0.9, p)
    B.j.shL.rotation.x = -0.5 - tap * 0.5 + Math.sin(p * 260) * 0.35 * tap
    B.j.shL.rotation.z = 0.7
    B.j.elL.rotation.x = -0.5

    // A: behind B, leaning back, hooks in
    A.root.rotation.y = Math.PI / 2
    A.root.position.set(-0.55, 0.3, 0)
    A.root.rotation.x = -0.55
    A.j.hpL.rotation.x = A.j.hpR.rotation.x = -1.0
    A.j.knL.rotation.x = A.j.knR.rotation.x = 1.1
    A.j.head.rotation.x = 0.25
    A.root.updateWorldMatrix(true, true)
    B.root.updateWorldMatrix(true, true)
    B.j.head.getWorldPosition(head)
    B.j.spine.getWorldPosition(pel)
    // rear-naked choke: arm across the throat, other hand behind the head, tightening with p
    const squeeze = smooth(0.1, 0.5, p)
    tgt.set(head.x + 0.12 - squeeze * 0.03, head.y - 0.02, head.z + 0.0)
    solveArm(A, 'R', tgt, 1, new Vector3(0.3, -1, 0.3))
    tgt.set(head.x - 0.12, head.y + 0.1, head.z - 0.08)
    solveArm(A, 'L', tgt, 1, new Vector3(0.3, 0.8, 0.5))
    // body triangle (hooks)
    tgt.set(pel.x + 0.12, 0.28, pel.z + 0.26)
    solveLeg(A, 'L', tgt, 0.85, new Vector3(0, 1, 0.5))
    tgt.set(pel.x + 0.12, 0.28, pel.z - 0.26)
    solveLeg(A, 'R', tgt, 0.85, new Vector3(0, 1, -0.5))

    if (grp.current) grp.current.rotation.y = 0
    if (rays.current) rays.current.rotation.z = t * 0.02
    const ang = lerp(-1.05, 1.25, p)
    const R = lerp(5.6, 4.6, smooth(0.2, 0.9, p))
    setCam(6, state.camera as never, [Math.sin(ang) * R, lerp(1.2, 1.5, p), Math.cos(ang) * R], [-0.1, 0.55, 0], 44, dt, { lambda: 4, parallax: 0.1 })
  })

  return (
    <group>
      <GradientSky top="#2a1148" mid="#c24a7c" horizon="#ff9a3d" sunDir={SUN} sunSize={0.028} sunColor="#ffe2a8" />
      {/* sun glare + rays far behind the pair */}
      <mesh ref={rays} position={[-6, 3, -40]} material={rayMat}>
        <planeGeometry args={[70, 70]} />
      </mesh>
      <Glow position={[-6, 2.2, -39]} size={30} color="#ff9d4a" opacity={0.45} boost={1.2} />
      {/* ground + mat */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[120, 48]} />
        <meshStandardMaterial color="#241035" roughness={0.5} metalness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[2.6, 8]} />
        <meshStandardMaterial color="#1b0d26" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, 0.01, 0]}>
        <ringGeometry args={[2.55, 2.65, 8]} />
        <meshBasicMaterial color="#ffb25a" toneMapped={false} />
      </mesh>
      <Glow position={[0, 0.05, 0]} size={[9, 3]} color="#ff8c42" opacity={0.35} />
      <group ref={grp}>
        <primitive object={A.root} />
        <primitive object={B.root} />
      </group>
      <ParticleField count={count(260)} box={[22, 9, 22]} vel={[0, 0.15, 0]} size={13} color="#ffc27a" opacity={0.6} position={[0, 3, 0]} seed={71} />
    </group>
  )
}
