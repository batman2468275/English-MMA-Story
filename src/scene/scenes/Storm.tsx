import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three'
import { createFigure, resetPose, solveArm } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Cage } from '../Cage'
import { Glow } from '../shapes'
import { useSceneFrame } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, lerp, mulberry32, smooth } from '../../core/math'
import { light } from '../Rig'
import { palette } from '../../theme'
import { STORM_GRAB } from '../../core/fx'
import { Ocean } from './storm/Ocean'
import { Sky } from './storm/Sky'
import { Rain } from './storm/Rain'
import { waveH, waveSlope } from './storm/waves'

/**
 * 05 — THE STORM (centerpiece). Everything below is a pure function of the scroll progress `p`, so scrolling back up
 * visibly reverses the swimmer's struggle.
 *
 *   beat 1  p 0.00–0.19  wide shot: storm + the struggling swimmer
 *   beat 2  p 0.20–0.58  close-up: hands reach for debris and slip off — three times
 *   beat 3  p 0.60–0.74  the key line appears as the swimmer makes one last attempt for the glowing octagon ring
 *   beat 4  p 0.74–0.80  grab! light flare, the swimmer holds on
 *   beat 5  p 0.80–1.00  the storm calms (waves flatten, rain stops, stars + dawn) as we pull away
 *
 * The swimmer swims toward +Z. The "near" side (toward the camera) is +X, so its LEFT arm does the reaching.
 */
const ATT = [0.2, 0.325, 0.45] // start of each debris attempt
const LEN = 0.125
const STRIKES: [number, number][] = [
  [0.02, 1], [0.07, 0.8], [0.12, 1], [0.19, 0.9], [0.27, 0.8], [0.35, 1], [0.43, 0.9], [0.51, 1], [0.585, 0.9], [0.64, 1], [0.7, 0.9], [STORM_GRAB, 1.2],
]
const BOLT_POS: [number, number][] = [[-30, 62], [26, 78], [-8, 95], [42, 52], [-46, 44]]

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const C_HORIZON_STORM = new Color('#0a1220')
const C_HORIZON_CALM = new Color('#1b4658')
const C_ZENITH_STORM = new Color('#02040a')
const C_ZENITH_CALM = new Color('#060f26')

function boltGeometry(seed: number, x0: number, z0: number): BufferGeometry {
  const r = mulberry32(seed)
  const pts: Vector3[] = []
  let x = x0
  let z = z0
  const n = 16
  for (let i = 0; i <= n; i++) {
    const y = 80 - (i / n) * 82
    pts.push(v(x, y, z))
    x += (r() - 0.5) * 9
    z += (r() - 0.5) * 5
  }
  return new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 60, 0.35, 4, false)
}

export function Storm() {
  const accent = palette()
  const skyMat = useRef<ShaderMaterial>(null)
  const oceanMat = useRef<ShaderMaterial>(null)
  const rainMat = useRef<ShaderMaterial>(null)
  const ringRef = useRef<Group>(null)
  const beamRef = useRef<Mesh>(null)
  const debrisRef = useRef<(Mesh | null)[]>([])
  const bolts = useRef<(Mesh | null)[]>([])
  const cageGlow = useRef(0.05)

  const swimmer = useMemo(() => createFigure(rimMaterial('#15233a', '#d6e6ff', 3.0, 1.5), 1), [])
  const debrisMat = useMemo(
    () => new MeshStandardMaterial({ color: '#5a4228', roughness: 0.85, metalness: 0.05, emissive: '#2a1a0a', emissiveIntensity: 0.6 }),
    [],
  )
  const boltGeoms = useMemo(() => BOLT_POS.map(([x, z], i) => boltGeometry(100 + i, x, z)), [])
  const boltMats = useMemo(
    () => BOLT_POS.map(() => new MeshBasicMaterial({ color: new Color('#cfe0ff').multiplyScalar(4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })),
    [],
  )
  const beamMat = useMemo(() => glowMaterial(accent.glow, 0.0), [accent])
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: accent.glow.clone().multiplyScalar(2.2), toneMapped: false, fog: false }), [accent])

  // mutable per-frame state
  const st = useMemo(
    () => ({
      waveT: 0,
      prevP: 0,
      tHit: STRIKES.map(() => -99),
      target: new Vector3(),
      tmp: new Vector3(),
      ringPos: new Vector3(0.9, 0, 30),
      grip: new Vector3(),
      grip2: new Vector3(),
      debris: [v(0, 0, 12), v(0, 0, 12), v(0, 0, 12)],
    }),
    [],
  )

  const debrisGeoms = useMemo(() => [{ s: [2.4, 0.13, 0.55] as const }, { s: [1.0, 0.8, 1.0] as const }, { s: [1.8, 0.16, 0.7] as const }], [])

  useSceneFrame(4, (p, dt, state) => {
    const now = performance.now() / 1000
    const calm = smooth(0.755, 0.96, p)
    const amp = lerp(0.7 + 0.3 * smooth(0, 0.3, p) - 0.12 * smooth(0.18, 0.22, p), 0.09, calm)
    st.waveT += dt * lerp(1, 0.55, calm)
    const t = st.waveT

    // -------- lightning envelope (progress-shaped × real-time decay, so a flash never "sticks")
    let flash = 0
    STRIKES.forEach(([ps, s], i) => {
      const crossed = (st.prevP < ps && p >= ps) || (st.prevP >= ps && p < ps && ps - p < 0.02)
      if (crossed) st.tHit[i] = now
      const dp = p - ps
      const prog = dp >= 0 ? Math.exp(-dp / 0.014) : dp > -0.01 ? Math.exp(dp / 0.003) : 0
      const time = Math.exp(-(now - st.tHit[i]) / 0.32)
      const e = prog * (0.15 + 0.85 * time) * s * (0.8 + 0.2 * Math.sin(now * 70))
      flash = Math.max(flash, e)
    })
    // each bolt mesh shows the strongest of its strikes
    boltMats.forEach((m, bi) => {
      let o = 0
      STRIKES.forEach(([ps, s], i) => {
        if (i % boltMats.length !== bi) return
        const dp = p - ps
        const prog = dp >= 0 ? Math.exp(-dp / 0.01) : 0
        const time = Math.exp(-(now - st.tHit[i]) / 0.25)
        o = Math.max(o, prog * (0.1 + 0.9 * time) * s * (0.75 + 0.25 * Math.sin(now * 90 + bi)))
      })
      m.opacity = o > 0.04 ? Math.min(1, o) : 0
      const mesh = bolts.current[bi]
      if (mesh) mesh.visible = m.opacity > 0.01
    })
    st.prevP = p
    flash *= 1 - calm

    // -------- swimmer (stylised prone figure) ------------------------------------------------------------
    resetPose(swimmer)
    const surf = waveH(0, 0.6, t, amp)
    const [sx, sz] = waveSlope(0, 0.6, t, amp)
    const phi = t * 3.3 + 0.9 * Math.sin(t * 1.6)
    const stroke = (ph: number) => -0.35 - 2.7 * (0.5 - 0.5 * Math.cos(ph))
    const ring = smooth(0.735, 0.78, p) // 0 → 1 after the grab

    // debris attempts
    let reachW = 0
    let dip = 0
    st.target.set(0, 0, 0)
    ATT.forEach((a0, i) => {
      const s = (p - a0) / LEN
      const approach = smooth(0, 0.3, s)
      const away = smooth(0.6, 0.82, s)
      const hold = smooth(0.4, 0.5, s) * (1 - smooth(0.64, 0.72, s))
      const rW = smooth(0.2, 0.45, s) * (1 - smooth(0.76, 0.9, s))
      const dp = smooth(0.48, 0.6, s) * (1 - smooth(0.7, 0.92, s))
      const R = v(0.58 + i * 0.03, 0, 1.12 + i * 0.05)
      const S = v(0.7 + i * 0.25, 0, 14)
      const E = v(2.2 + i * 0.4, 0, -4)
      const pos = st.debris[i]
      if (s < 0) pos.set(S.x, 0, 14 + -s * 24)
      else if (s > 1) pos.set(E.x + (s - 1) * 1.5, 0, E.z - (s - 1) * 14)
      else {
        pos.lerpVectors(S, R, approach)
        pos.lerp(E, away)
      }
      pos.y = waveH(pos.x, pos.z, t, amp) * 0.95 + 0.06
      if (s > 0.45 && s < 0.9) pos.y -= dp * 0.14 * (0.4 + hold)
      const m = debrisRef.current[i]
      if (m) {
        m.position.copy(pos)
        m.rotation.set(0.15 * Math.sin(t * 1.3 + i), s * 1.8 + i, 0.2 * Math.sin(t * 0.9 + i * 2))
        m.visible = s < 1.6
      }
      if (rW > reachW) {
        reachW = rW
        st.target.copy(pos)
        st.target.y += 0.07
      }
      dip = Math.max(dip, dp)
    })

    // the ring (octagon cage fragment) approaches from the far dark, then is pulled in
    const rp = smooth(0.52, 0.725, p)
    st.ringPos.set(lerp(2.6, 0.89, rp), 0, lerp(40, 1.55, rp))
    st.ringPos.x = lerp(st.ringPos.x, 0.8, ring)
    st.ringPos.z = lerp(st.ringPos.z, 1.5, ring)
    st.ringPos.y = waveH(st.ringPos.x, st.ringPos.z, t, amp) * 0.95 + 0.1
    // rim point nearest the swimmer
    st.grip.set(st.ringPos.x - 0.39, st.ringPos.y + 0.06, st.ringPos.z - 0.39)
    st.grip2.set(st.ringPos.x - 0.3, st.ringPos.y + 0.06, st.ringPos.z + 0.45)
    const ringReach = smooth(0.655, 0.73, p)
    if (ringReach > reachW) {
      reachW = ringReach
      st.target.copy(st.grip)
    }
    if (p > 0.73) reachW = 1

    // body
    const exhaust = 1 - ring * 0.8
    const body = swimmer.root
    body.position.set(0.0, surf * 0.9 - 0.05 - dip * 0.2, 0)
    body.rotation.x = Math.PI / 2 - Math.atan(sz) * 0.9 - ring * 0.28 + dip * 0.2
    body.rotation.z = Math.sin(t * 1.9) * 0.1 * exhaust + sx * 0.25
    body.rotation.y = Math.sin(t * 0.8) * 0.05
    swimmer.j.head.rotation.x = -0.55 - ring * 0.2 + Math.sin(t * 2.4) * 0.08
    swimmer.j.spine.rotation.z = Math.sin(phi) * 0.12 * exhaust

    // arms: crawl strokes (FK) …
    const struggle = (1 - ring) * (1 - reachW * 0.3)
    const k = struggle
    swimmer.j.shR.rotation.x = lerp(-0.5, stroke(phi), k)
    swimmer.j.elR.rotation.x = -0.9 * Math.max(0, Math.sin(phi)) * k
    swimmer.j.shL.rotation.x = lerp(-0.5, stroke(phi + Math.PI), k)
    swimmer.j.elL.rotation.x = -0.9 * Math.max(0, Math.sin(phi + Math.PI)) * k
    // legs: tired flutter kick
    swimmer.j.hpL.rotation.x = 0.35 * Math.sin(phi * 2) * exhaust
    swimmer.j.hpR.rotation.x = -0.35 * Math.sin(phi * 2) * exhaust
    swimmer.j.knL.rotation.x = 0.4 * (0.5 + 0.5 * Math.sin(phi * 2 + 1)) * exhaust
    swimmer.j.knR.rotation.x = 0.4 * (0.5 + 0.5 * Math.sin(phi * 2 + 3)) * exhaust
    // … blended with IK pinning the hand to the debris / ring
    body.updateWorldMatrix(true, true)
    if (reachW > 0.001) solveArm(swimmer, 'L', st.target, reachW, v(0.8, 0.7, -0.4))
    if (ring > 0.001) solveArm(swimmer, 'R', st.grip2, smooth(0.75, 0.8, p), v(-0.8, 0.7, -0.3))

    // -------- ring visuals
    if (ringRef.current) {
      ringRef.current.position.copy(st.ringPos)
      ringRef.current.rotation.set(Math.sin(t * 1.2) * 0.07, t * 0.25 * (1 - ring), Math.cos(t * 0.9) * 0.07)
      ringRef.current.visible = p > 0.45
    }
    const ringGlow = smooth(0.48, 0.66, p)
    beamMat.uniforms.uOpacity.value = ringGlow * 0.5 * (1 - 0.4 * ring)
    if (beamRef.current) beamRef.current.position.set(st.ringPos.x, st.ringPos.y + 7, st.ringPos.z)

    // -------- lights, sky, ocean uniforms
    light.keyMul = 1 + flash * 9
    light.hemiAdd = flash * 2.4 + calm * 0.7
    if (p > 0.5) {
      light.ptPos = st.tmp.copy(st.ringPos).add(v(0, 1.1, 0))
      light.ptColor = accent.glow
      light.ptAbs = ringGlow * 3 + ring * 4 + smooth(0.735, 0.76, p) * (1 - smooth(0.76, 0.84, p)) * 12
    }
    const sky = skyMat.current
    if (sky) {
      sky.uniforms.uTime.value = t
      sky.uniforms.uFlash.value = flash
      sky.uniforms.uCalm.value = calm
      sky.uniforms.uHorizon.value.copy(C_HORIZON_STORM).lerp(C_HORIZON_CALM, calm)
      sky.uniforms.uZenith.value.copy(C_ZENITH_STORM).lerp(C_ZENITH_CALM, calm)
    }
    const oc = oceanMat.current
    if (oc) {
      oc.uniforms.uTime.value = t
      oc.uniforms.uAmp.value = amp
      oc.uniforms.uFlash.value = flash
      oc.uniforms.uCalm.value = calm
      oc.uniforms.uCamPos.value.copy(state.camera.position)
      oc.uniforms.uFog.value.copy(C_HORIZON_STORM).lerp(C_HORIZON_CALM, calm)
      oc.uniforms.uRing.value.set(st.ringPos.x, st.ringPos.y, st.ringPos.z, ringGlow * (0.55 + ring * 0.7))
    }
    const rain = rainMat.current
    if (rain) {
      rain.uniforms.uTime.value = state.clock.elapsedTime
      rain.uniforms.uCenter.value.copy(state.camera.position)
      rain.uniforms.uAlpha.value = (1 - smooth(0.74, 0.92, p)) * (0.55 + 0.45 * smooth(0, 0.2, p))
      rain.visible = rain.uniforms.uAlpha.value > 0.01
    }
    cageGlow.current = clamp01(0.05 + flash * 1.5 + calm * 0.95)

    // -------- camera ---------------------------------------------------------------------------------------
    const pos = keys(p, [
      { p: 0, v: [9.5, 5.6, -8.5] },
      { p: 0.13, v: [10.5, 4.4, -2.5] },
      { p: 0.185, v: [7, 2.6, -2.5] },
      { p: 0.215, v: [3.1, 1.15, -1.0] },
      { p: 0.31, v: [3.2, 1.35, -0.5] },
      { p: 0.42, v: [2.8, 1.0, -1.1] },
      { p: 0.55, v: [3.3, 1.3, -0.7] },
      { p: 0.6, v: [3.9, 2.0, -1.8] },
      { p: 0.72, v: [3.7, 1.8, -1.2] },
      { p: 0.755, v: [3.0, 1.1, 0.0] },
      { p: 0.81, v: [3.5, 1.3, -0.6] },
      { p: 0.88, v: [8.5, 3.2, -7.5] },
      { p: 1, v: [12, 6.5, -14] },
    ])
    const look = keys(p, [
      { p: 0, v: [0, 0.3, 2.5] },
      { p: 0.18, v: [0, 0.2, 2.2] },
      { p: 0.22, v: [0.35, 0.15, 1.1] },
      { p: 0.55, v: [0.45, 0.15, 1.2] },
      { p: 0.62, v: [0.9, 0.4, 3.4] },
      { p: 0.72, v: [0.9, 0.35, 2.3] },
      { p: 0.77, v: [0.7, 0.3, 1.4] },
      { p: 0.88, v: [0.2, 0.7, 2.6] },
      { p: 1, v: [0, 1.4, 6] },
    ])
    const fov = keys(p, [
      { p: 0, v: [52, 0, 0] },
      { p: 0.2, v: [48, 0, 0] },
      { p: 0.215, v: [42, 0, 0] },
      { p: 0.6, v: [44, 0, 0] },
      { p: 0.76, v: [38, 0, 0] },
      { p: 0.9, v: [50, 0, 0] },
    ])[0]
    // close beats: the camera rides the same swell as the swimmer so the framing stays steady while the sea heaves
    const follow = smooth(0.17, 0.21, p) * (1 - smooth(0.82, 0.9, p))
    pos[1] += surf * 0.95 * follow
    look[1] += surf * 0.95 * follow
    const ride = waveH(pos[0], pos[2], t, amp)
    pos[1] = Math.max(pos[1], ride + 0.35)
    setCam(4, state.camera as never, pos, look, fov, dt, { lambda: 5.5, parallax: 0.15, roll: Math.sin(t * 0.9) * 0.012 * (1 - calm) })
  })

  return (
    <group>
      <Sky ref={skyMat} />
      <Ocean ref={oceanMat} />
      <Rain ref={rainMat} />

      {/* the octagon cage glimpsed on the horizon whenever lightning strikes — steady and bright once calm */}
      <Cage assemble={() => 1} glow={() => cageGlow.current} door={false} radius={5} height={4} thickness={0.07} scale={10} position={[0, -3, 150]} />

      {BOLT_POS.map((_, i) => (
        <mesh key={i} ref={(m) => (bolts.current[i] = m)} geometry={boltGeoms[i]} material={boltMats[i]} visible={false} frustumCulled={false} />
      ))}

      <primitive object={swimmer.root} />

      {debrisGeoms.map((d, i) => (
        <mesh key={i} ref={(m) => (debrisRef.current[i] = m)} material={debrisMat} position={[0, 0, 14]}>
          {i === 1 ? <cylinderGeometry args={[0.38, 0.38, 0.95, 10]} /> : <boxGeometry args={[...d.s]} />}
        </mesh>
      ))}

      {/* the glowing solid thing: an octagon ring (cage fragment) with a beacon of light */}
      <group ref={ringRef} visible={false}>
        <mesh material={ringMat} rotation={[Math.PI / 2, Math.PI / 8, 0]}>
          <torusGeometry args={[0.55, 0.13, 8, 8]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, Math.PI / 8, 0]} scale={1.18}>
          <torusGeometry args={[0.55, 0.13, 8, 8]} />
          <meshBasicMaterial color={accent.glow} transparent opacity={0.25} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        <Glow position={[0, 0.25, 0]} size={3.4} color="#ff9a4a" opacity={0.45} boost={1.4} />
      </group>
      <mesh ref={beamRef} material={beamMat} frustumCulled={false}>
        <coneGeometry args={[0.9, 14, 16, 1, true]} />
      </mesh>
    </group>
  )
}
