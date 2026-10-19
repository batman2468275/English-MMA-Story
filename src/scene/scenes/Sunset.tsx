import { useMemo, useRef } from 'react'
import { AdditiveBlending, Group, Mesh, ShaderMaterial, Vector3 } from 'three'
import { createFigure, Figure, limitPose, liftAboveFloor, resetPose, setHand, solveArm, solveLeg } from '../figure'
import { resolveContacts } from '../contact'
import { rimMaterial } from '../materials'
import { GradientSky } from '../GradientSky'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, easeInOut, lerp, smooth } from '../../core/math'

/**
 * 07 — SUNSET ("two ways to win"): Pantoja takes Kara-France's back and finishes the rear-naked choke in the third round.
 * A real multi-phase grapple, every phase a pure function of scroll progress:
 *   0 → .14  approach + grip   A walks in behind B and wraps his arms round B's waist (chest meets back)
 *   .14 → .3 takedown          B is pulled back and down; both end seated on the mat, A's legs hooking round B's hips
 *   .3 → .4  climb + lock      the arms slide up B's torso; A's right forearm closes across the throat, left hand behind the head
 *   .4 → .62 squeeze           A tightens (visible resistance: B pulls at the forearm, heels drum, torso arches)
 *   .62 → .8 the tap           B slaps the mat while A holds on
 *   .8 → 1   release           A lets go; B goes limp and slumps, A sits back
 * Bodies are pushed into exact contact by the contact solver and rest on the mat; hands are IK-pinned to body *surfaces*.
 */
const SUN: [number, number, number] = [-0.15, 0.06, -1]
const T = {
  neck: new Vector3(), head: new Vector3(), pel: new Vector3(), chest: new Vector3(), tmp: new Vector3(),
  a: new Vector3(), b: new Vector3(), c: new Vector3(), pole: new Vector3(), elbow: new Vector3(), tip: new Vector3(),
}
const FWD = new Vector3(1, 0, 0) // both fighters face +X
const RIGHT = new Vector3(0, 0, 1) // a fighter facing +X has their right on +Z

function stand(f: Figure, t: number, ph: number) {
  const { j } = f
  j.spine.rotation.x = 0.03 + 0.01 * Math.sin(t * 1.4 + ph)
  j.hpL.rotation.z = 0.06
  j.hpR.rotation.z = -0.06
  j.knL.rotation.x = 0.06
  j.knR.rotation.x = 0.06
}

export function Sunset() {
  const A = useMemo(() => createFigure(rimMaterial('#120712', '#ffc27a', 2.4, 2.2), 1), []) // Pantoja, behind
  const B = useMemo(() => createFigure(rimMaterial('#120712', '#ffb066', 2.4, 2.2), 1), []) // Kara-France, in front
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
            rays = pow(max(rays, 0.0), 3.0);
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
    stand(A, t, 0)
    stand(B, t, 2)

    // ---------------------------------------------------------------------------------- phase variables
    const approach = easeInOut(clamp01(p / 0.12))
    const sit = easeInOut(smooth(0.14, 0.3, p)) // takedown: both end up seated
    const climb = easeInOut(smooth(0.3, 0.4, p)) // arms climb waist → neck
    const sq = smooth(0.38, 0.6, p) // squeeze
    const struggle = smooth(0.34, 0.45, p) * (1 - smooth(0.58, 0.68, p)) // B's fight, fading as the oxygen goes
    const tapW = smooth(0.6, 0.66, p) * (1 - smooth(0.78, 0.82, p))
    const release = easeInOut(smooth(0.8, 0.93, p))
    const limp = smooth(0.74, 0.92, p)
    const hold = 1 - release

    // ---------------------------------------------------------------------------------- positions & FK poses
    // B: stands, is dragged back and down into a seated position leaning on A, then slumps when released
    B.root.rotation.y = Math.PI / 2
    B.root.position.set(lerp(0.0, 0.06, sit) + 0.012 * Math.sin(t * 5) * struggle, 0.98, 0)
    // seated with the knees drawn up and apart (never two straight rods): they kick and push while he fights, then fall slack
    const kick = Math.max(0, Math.sin(t * 8.5)) * struggle
    const kick2 = Math.max(0, Math.sin(t * 8.5 + 2.4)) * struggle
    B.j.hpL.rotation.x = lerp(0.0, -2.0, sit) + 0.18 * kick
    B.j.hpR.rotation.x = lerp(0.0, -1.95, sit) + 0.18 * kick2
    B.j.knL.rotation.x = lerp(0.06, 2.45, sit) - 0.55 * kick + 0.35 * limp
    B.j.knR.rotation.x = lerp(0.06, 2.35, sit) - 0.55 * kick2 + 0.3 * limp
    B.j.hpL.rotation.z = lerp(0.06, 0.28, sit) + 0.22 * limp
    B.j.hpR.rotation.z = lerp(-0.06, -0.28, sit) - 0.22 * limp
    B.j.spine.rotation.x = lerp(0.03, -0.3, sit) + 0.14 * limp // leans back onto A, then slumps forward
    B.j.spine.rotation.y = Math.sin(t * 6) * 0.16 * struggle // twisting against the hold
    B.j.head.rotation.x = lerp(0, 0.28, sq) * hold + 0.35 * limp // chin tucked against the choke, then head drops
    B.j.head.rotation.z = 0.08 * Math.sin(t * 5) * struggle
    // his arms flail up to post during the takedown, then go to the forearm
    const flail = Math.sin(Math.PI * clamp01((p - 0.1) / 0.2))
    B.j.shL.rotation.x = -0.9 * flail
    B.j.shR.rotation.x = -0.9 * flail
    B.j.shL.rotation.z = 0.15 + 0.3 * flail
    B.j.shR.rotation.z = -0.15 - 0.3 * flail
    // limp: the whole body rolls toward his left onto the mat
    B.root.rotation.z = -0.55 * limp * release

    // A: walks in, gets chest-to-back, sits down behind B with his hips under him and leans back, then relaxes
    const walkPhase = (1 - approach) * 7.5
    const stride = Math.sin(walkPhase * 2) * 0.5 * (1 - approach) * (1 - sit)
    A.root.rotation.y = Math.PI / 2
    A.root.position.set(lerp(-1.55, -0.28, approach), 0.98, 0.01 * Math.sin(t * 3) * struggle)
    A.root.position.x += lerp(0, -0.1, sit)
    A.j.hpL.rotation.x = lerp(stride, -1.15, sit)
    A.j.hpR.rotation.x = lerp(-stride, -1.15, sit)
    A.j.knL.rotation.x = lerp(0.2 + Math.max(0, -stride) * 0.6, 1.2, sit)
    A.j.knR.rotation.x = lerp(0.2 + Math.max(0, stride) * 0.6, 1.2, sit)
    A.j.hpL.rotation.z = lerp(0.06, 0.55, sit)
    A.j.hpR.rotation.z = lerp(-0.06, -0.55, sit)
    A.j.head.rotation.z = -0.22 * smooth(0.3, 0.42, p) * hold // his head tucks in beside B's
    A.j.spine.rotation.x = lerp(0.1, -0.4, sit) + 0.1 * sq * hold - 0.2 * release
    A.j.head.rotation.x = 0.1

    limitPose(A)
    limitPose(B)
    // feet/hips on the mat, then bodies pressed into exact chest-to-back contact (forearms are placed by IK below)
    A.root.updateWorldMatrix(true, true)
    B.root.updateWorldMatrix(true, true)
    liftAboveFloor(A, 0, true)
    liftAboveFloor(B, 0, true)
    resolveContacts([A, B], { iterations: 4, margin: 0.006 })
    liftAboveFloor(A, 0, true)
    liftAboveFloor(B, 0, true)

    // ---------------------------------------------------------------------------------- landmarks on B
    B.neck.getWorldPosition(T.neck)
    B.headC.getWorldPosition(T.head)
    B.root.getWorldPosition(T.pel)
    B.j.spine.getWorldPosition(T.chest)

    // ---------------------------------------------------------------------------------- A's arms
    // (1) wrap at the waist during the approach, (2) climb up B's torso, (3) the rear-naked choke
    const wrapW = smooth(0.03, 0.1, p) * hold // arms engage as A arrives, and let go smoothly at the release
    for (const sd of [1, -1] as const) {
      const lat = RIGHT.clone().multiplyScalar(-sd * 0.115) // sd = +1 → A's left hand (on world −Z)
      // waist grip: front of B's belly, on the surface, hands meeting round the front
      const waist = T.a.copy(T.pel).addScaledVector(FWD, 0.15).add(lat).setY(T.pel.y + 0.14)
      // climb: path up the front of the torso toward the neck
      const rise = easeInOut(climb)
      const up = T.b.copy(T.pel).setY(lerp(T.pel.y + 0.14, T.neck.y + 0.02, rise))
      up.addScaledVector(FWD, lerp(0.15, 0.1, rise)).add(lat.multiplyScalar(lerp(1, 0.6, rise)))
      const grip = T.tmp.copy(waist).lerp(up, rise)
      if (sd === -1) {
        // RIGHT arm (A's right is on +Z): crosses the throat to B's far (−Z) side and stays locked there
        const far = T.c.copy(T.neck).addScaledVector(RIGHT, -(0.052 + 0.045)).addScaledVector(FWD, 0.035)
        far.y += 0.03
        far.addScaledVector(FWD, -0.025 * sq) // tightening: draws B's head back into his chest
        const target = grip.clone().lerp(far, climb)
        T.pole.copy(FWD).multiplyScalar(0.7).addScaledVector(RIGHT, 0.5).setY(0.25)
        solveArm(A, 'R', target, wrapW, T.pole)
      } else {
        // LEFT hand: first the waist, then behind B's head, pushing it forward into the choke
        const behind = T.c.copy(T.head).addScaledVector(FWD, -0.125).add(T.tmp.set(0, 0.02, 0)).addScaledVector(RIGHT, -0.03)
        behind.addScaledVector(FWD, 0.02 * sq)
        const target = grip.clone().lerp(behind, climb)
        T.pole.copy(RIGHT).multiplyScalar(-0.7).setY(0.8).addScaledVector(FWD, -0.2)
        solveArm(A, 'L', target, wrapW, T.pole)
      }
    }
    // body triangle: A's knees swing out round B's hips and his feet hook over B's thighs at the waist, ankles crossing
    const hooks = smooth(0.24, 0.34, p) * hold
    for (const sd of [1, -1] as const) {
      const foot = T.a.copy(T.pel).addScaledVector(FWD, 0.2).addScaledVector(RIGHT, sd * 0.035)
      foot.y = T.pel.y + 0.3 + 0.02 * Math.sin(t * 8.5) * struggle
      T.pole.set(0.1, 0.25, -sd * 1)
      solveLeg(A, sd === 1 ? 'L' : 'R', foot, hooks, T.pole)
    }

    // ---------------------------------------------------------------------------------- B's hands: fight the choke, then tap
    A.j.elR.getWorldPosition(T.elbow)
    A.tipR.getWorldPosition(T.tip)
    const forearm = T.a.copy(T.elbow).lerp(T.tip, 0.55)
    const pull = Math.sin(t * 7.5) * 0.02 * struggle
    // B's right hand (his +Z side) claws at the forearm near the elbow, left hand at the wrist
    solveArm(B, 'R', T.b.copy(forearm).add(T.c.set(-pull, 0.045, 0.06)), struggle * (1 - tapW), T.pole.set(0, -0.3, 1))
    solveArm(B, 'L', T.c.copy(T.tip).add(T.tmp.set(pull, -0.03, -0.05)), struggle * (1 - tapW), T.pole.set(0, -0.3, -1))
    // the tap: his left hand slaps the mat beside him (three clear taps), body otherwise still
    if (tapW > 0.01) {
      const tap = Math.max(0, Math.sin(p * 330))
      const slap = T.a.copy(T.pel).add(T.tmp.set(0.12, 0.05 + 0.2 * tap, -0.36))
      solveArm(B, 'L', slap, tapW, T.pole.set(0, 0.3, -1))
    }
    // after the release: arms hang limp and heavy
    if (limp > 0.01) {
      B.j.shL.rotation.x = lerp(B.j.shL.rotation.x, -0.15, limp)
      B.j.shR.rotation.x = lerp(B.j.shR.rotation.x, -0.15, limp)
      B.j.shL.rotation.z = lerp(B.j.shL.rotation.z, 0.5, limp)
      B.j.shR.rotation.z = lerp(B.j.shR.rotation.z, -0.5, limp)
    }
    // grips: A's choking hand and the hand behind the head close; B claws at the forearm, then goes slack
    setHand(A, 'R', 0.75 * wrapW)
    setHand(A, 'L', 0.7 * wrapW)
    setHand(B, 'R', 0.85 * struggle + 0.2)
    setHand(B, 'L', 0.85 * struggle + 0.2)
    liftAboveFloor(B, 0, true)

    if (grp.current) grp.current.rotation.y = 0
    if (rays.current) rays.current.rotation.z = t * 0.02

    // camera arcs round the pair, framed on their midpoint so the grapple is always centre-stage
    A.root.getWorldPosition(T.a)
    const cx = (T.a.x + T.pel.x) / 2
    const ang = keys(p, [{ p: 0, v: [-1.05, 0, 0] }, { p: 0.35, v: [-0.35, 0, 0] }, { p: 0.7, v: [0.55, 0, 0] }, { p: 1, v: [1.25, 0, 0] }])[0]
    const R = keys(p, [{ p: 0, v: [5.4, 0, 0] }, { p: 0.3, v: [3.7, 0, 0] }, { p: 0.55, v: [2.9, 0, 0] }, { p: 0.85, v: [3.2, 0, 0] }, { p: 1, v: [3.9, 0, 0] }])[0]
    const ly = lerp(0.55, 0.78, smooth(0.25, 0.5, p))
    setCam(6, state.camera as never, [cx + Math.sin(ang) * R, lerp(1.2, 1.15, smooth(0.2, 0.5, p)), Math.cos(ang) * R], [cx, ly, 0], 42, dt, { lambda: 4, parallax: 0.1 })
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
