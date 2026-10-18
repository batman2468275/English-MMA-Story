import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Sprite,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createFigure, resetPose, solveArm } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Cage } from '../Cage'
import { Glow, sharedSoft } from '../shapes'
import { useSceneFrame } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, damp, lerp, mulberry32, smooth } from '../../core/math'
import { light } from '../Rig'
import { palette } from '../../theme'
import { STORM_GRAB } from '../../core/fx'
import { Ocean } from './storm/Ocean'
import { Sky } from './storm/Sky'
import { Rain } from './storm/Rain'
import { createStormObjects } from './storm/objects'
import { waveH, waveSlope } from './storm/waves'

/**
 * 05 — THE STORM (centerpiece). Everything below is a pure function of the scroll progress `p`, so scrolling back up
 * visibly reverses the swimmer's struggle.
 *
 *   beat 1  p 0.00–0.19  wide shot: storm + the struggling swimmer
 *   beat 2  p 0.19–0.60  close-up: the hand reaches for four things that drift past — a basketball, a laptop, a paint
 *                        palette and a plank with woodworking tools — and slips off every one of them
 *   beat 3  p 0.60–0.74  the key line appears as the swimmer makes one last attempt for the glowing octagon ring
 *   beat 4  p 0.74–0.80  grab! light flare, ripples spread across the water, the swimmer holds on (and stays up)
 *   beat 5  p 0.80–1.00  the storm calms (waves flatten, rain stops, stars + dawn) as we pull away
 *
 * The swimmer swims toward +Z. The "near" side (toward the camera) is +X, so its LEFT arm does the reaching.
 */
const LEN = 0.105 // scroll length of one attempt
interface ObjSpec { a0: number; S: [number, number]; R: [number, number]; E: [number, number]; ho: number; sink: number; dipK: number; float: number; spin: number }
const OBJS: ObjSpec[] = [
  { a0: 0.19, S: [0.85, 0], R: [0.58, 1.1], E: [2.9, -3.6], ho: 0, sink: 0, dipK: 0.7, float: 0.14, spin: 7 }, // basketball: bounces away
  { a0: 0.29, S: [0.55, 0], R: [0.55, 1.14], E: [1.7, -1.8], ho: 0.02, sink: 0.6, dipK: 0.9, float: 0.05, spin: 1.2 }, // laptop: goes under
  { a0: 0.39, S: [1.0, 0], R: [0.6, 1.12], E: [3.4, -5.0], ho: 0, sink: 0.05, dipK: 0.8, float: 0.07, spin: 5.5 }, // palette: spins off
  { a0: 0.49, S: [0.7, 0], R: [0.58, 1.18], E: [1.1, -2.4], ho: 0.06, sink: 0.2, dipK: 1.7, float: 0.06, spin: 2 }, // wood: the hardest to lose
]

const STRIKES: [number, number][] = [
  [0.02, 1], [0.07, 0.8], [0.12, 1], [0.19, 0.9], [0.27, 0.8], [0.35, 1], [0.43, 0.9], [0.51, 1], [0.585, 0.9], [0.64, 1], [0.7, 0.9], [STORM_GRAB, 1.2],
]
const BOLT_POS: [number, number][] = [[-30, 62], [26, 78], [-8, 95], [42, 52], [-46, 44]]

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const C_HORIZON_STORM = new Color('#0a1220')
const C_HORIZON_CALM = new Color('#1b4658')
const C_ZENITH_STORM = new Color('#02040a')
const C_ZENITH_CALM = new Color('#060f26')
const C_RIM = new Color('#d6e6ff')
const C_RIM_FLASH = new Color('#ffffff')
const C_BASE = new Color('#15233a')
const C_BASE_FLASH = new Color('#3d5a82')
const C_BOLT_LIGHT = new Color('#cfe0ff')
const ease = (x: number) => x * x * (3 - 2 * x)

/** A jagged main bolt with two forked branches, merged into one geometry. */
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
  const parts: BufferGeometry[] = [new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 60, 0.35, 4, false)]
  for (let b = 0; b < 2; b++) {
    const start = pts[3 + Math.floor(r() * 8)]
    const side = r() > 0.5 ? 1 : -1
    const bp: Vector3[] = [start.clone()]
    for (let k = 1; k <= 6; k++) {
      const q = bp[k - 1]
      bp.push(v(q.x + side * (1.5 + r() * 3.5), q.y - (5 + r() * 4), q.z + (r() - 0.5) * 4))
    }
    parts.push(new TubeGeometry(new CatmullRomCurve3(bp, false, 'catmullrom', 0.2), 20, 0.16, 4, false))
  }
  return mergeGeometries(parts) ?? parts[0]
}

/** Crawl-stroke joint angles for one arm. Slow, strained "catch & pull" under water, fast high-elbow recovery in the air. */
function crawl(ph: number, side: 1 | -1) {
  const u = (((ph / (Math.PI * 2)) % 1) + 1) % 1
  if (u < 0.58) {
    const e = ease(u / 0.58)
    return { x: lerp(-3.0, -0.5, e), el: -1.1 * Math.sin(Math.PI * e) * 0.85, z: side * 0.12 * Math.sin(Math.PI * e) }
  }
  const e = ease((u - 0.58) / 0.42)
  return { x: lerp(-0.5, -3.0, e), el: -1.5 * Math.sin(Math.PI * e), z: side * 0.55 * Math.sin(Math.PI * e) }
}

export function Storm() {
  const accent = palette()
  const skyMat = useRef<ShaderMaterial>(null)
  const oceanMat = useRef<ShaderMaterial>(null)
  const rainMat = useRef<ShaderMaterial>(null)
  const ringRef = useRef<Group>(null)
  const beamRef = useRef<Mesh>(null)
  const bolts = useRef<(Mesh | null)[]>([])
  const wake = useRef<Mesh>(null)
  const splash = useRef<Sprite>(null)
  const ripples = useRef<(Mesh | null)[]>([])
  const cageGlow = useRef(0.05)

  const swimMat = useMemo(() => rimMaterial('#15233a', '#d6e6ff', 3.0, 1.5), [])
  const swimmer = useMemo(() => createFigure(swimMat, 1), [swimMat])
  const objs = useMemo(() => createStormObjects(), [])
  const boltGeoms = useMemo(() => BOLT_POS.map(([x, z], i) => boltGeometry(100 + i, x, z)), [])
  const boltMats = useMemo(
    () => BOLT_POS.map(() => new MeshBasicMaterial({ color: new Color('#cfe0ff').multiplyScalar(4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })),
    [],
  )
  const beamMat = useMemo(() => glowMaterial(accent.glow, 0.0), [accent])
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: accent.glow.clone().multiplyScalar(2.2), toneMapped: false, fog: false }), [accent])
  const wakeMat = useMemo(() => new MeshBasicMaterial({ map: sharedSoft(), color: '#cfe3f2', transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), [])
  const rippleMats = useMemo(
    () => [0, 1].map(() => new MeshBasicMaterial({ color: accent.warm.clone().multiplyScalar(2.4), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false })),
    [accent],
  )

  // mutable per-frame state
  const st = useMemo(
    () => ({
      waveT: 0,
      phi: 0,
      prevP: 0,
      tHit: STRIKES.map(() => -99),
      target: new Vector3(),
      tmp: new Vector3(),
      tmp2: new Vector3(),
      ringPos: new Vector3(0.9, 0, 30),
      grip: new Vector3(),
      grip2: new Vector3(),
      keyDir: new Vector3(),
      boltPos: new Vector3(0, 14, 60),
      objPos: OBJS.map(() => new Vector3(0, 0, 14)),
      j: {} as Record<string, number>,
    }),
    [],
  )

  useSceneFrame(4, (p, dt, state) => {
    const now = performance.now() / 1000
    const calm = smooth(0.755, 0.96, p)
    const amp = lerp(0.7 + 0.3 * smooth(0, 0.3, p) - 0.12 * smooth(0.18, 0.22, p), 0.09, calm)
    st.waveT += dt * lerp(1, 0.55, calm)
    const t = st.waveT

    // -------- lightning envelope (progress-shaped × real-time decay, so a flash never "sticks") ---------
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
    // each bolt mesh shows the strongest of its strikes; the brightest bolt also aims the dynamic light
    let boltI = 0
    let boltIdx = 0
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
      if (o > boltI) {
        boltI = o
        boltIdx = bi
      }
    })
    st.prevP = p
    flash *= 1 - calm
    boltI = Math.min(1, boltI) * (1 - calm)
    const [bx, bz] = BOLT_POS[boltIdx]
    st.boltPos.set(bx, 14, bz)

    // -------- the sea state under the swimmer -----------------------------------------------------------------
    const surf = waveH(0, 0.6, t, amp)
    const [sx, sz] = waveSlope(0, 0.6, t, amp)
    const ring = smooth(0.735, 0.78, p) // 0 → 1 after the grab
    const exhaust = 1 - ring * 0.8

    // -------- the four things I tried before MMA ------------------------------------------------------------------
    let reachW = 0
    let dip = 0
    st.target.set(0, 0, 0)
    OBJS.forEach((o, i) => {
      const s = (p - o.a0) / LEN
      const ho = o.ho
      const approach = smooth(0, 0.3, s)
      const away = smooth(0.6 + ho, 0.82 + ho, s)
      const hold = smooth(0.4, 0.5, s) * (1 - smooth(0.64 + ho, 0.72 + ho, s))
      const rW = smooth(0.2, 0.45, s) * (1 - smooth(0.76 + ho, 0.9 + ho * 0.5, s))
      const dp = smooth(0.48, 0.6, s) * (1 - smooth(0.7 + ho, 0.92 + ho * 0.5, s))
      const pos = st.objPos[i]
      if (s < 0) pos.set(o.S[0], 0, 14 + -s * 24)
      else if (s > 1) pos.set(o.E[0] + (s - 1) * 1.5, 0, o.E[1] - (s - 1) * 14)
      else {
        pos.set(lerp(o.S[0], o.R[0], approach), 0, lerp(14, o.R[1], approach))
        pos.x = lerp(pos.x, o.E[0], away)
        pos.z = lerp(pos.z, o.E[1], away)
      }
      let y = waveH(pos.x, pos.z, t, amp) * 0.95 + o.float + Math.sin(t * 2 + i) * 0.025
      if (s > 0.45 && s < 0.95) y -= dp * 0.12 * (0.4 + hold)
      y -= o.sink * smooth(0.55 + ho, 0.98, s)
      pos.y = y

      const g = objs.groups[i]
      g.visible = s > -0.5 && s < 1.9
      if (g.visible) {
        const [ox, oz] = waveSlope(pos.x, pos.z, t, amp)
        const gone = Math.max(0, s - 0.55)
        g.position.copy(pos)
        g.rotation.set(-oz * 0.7, i * 1.1 + 0.4 * Math.sin(t * 0.6 + i) + o.spin * gone * 0.9, ox * 0.7)
        if (i === 0) g.rotation.x += gone * o.spin * 0.9 // the ball rolls
        if (i === 1) g.rotation.x += smooth(0.55, 0.95, s) * 0.9 // the laptop tips as it goes under
        if (i === 2) g.rotation.z += Math.sin(t * 2.3) * 0.12 * (1 + away)
      }
      if (rW > reachW) {
        reachW = rW
        st.target.copy(pos)
        st.target.y += i === 1 ? 0.16 : 0.1
      }
      dip = Math.max(dip, dp * o.dipK)
    })
    // laptop screen dies as the water takes it; the tools slide off the plank
    {
      const sL = (p - OBJS[1].a0) / LEN
      objs.screenMat.emissiveIntensity = 1.5 * (1 - smooth(0.5, 0.85, sL)) * (0.9 + 0.1 * Math.sin(now * 30))
      const sW = (p - OBJS[3].a0) / LEN
      const slide = smooth(0.62 + OBJS[3].ho, 0.9 + OBJS[3].ho, sW)
      objs.tools.position.set(slide * 0.55, 0.06 - slide * 0.35, slide * 0.45)
      objs.tools.rotation.set(slide * 0.9, slide * 0.7, slide * 0.4)
    }

    // -------- the ring (octagon cage fragment) approaches from the far dark, then is pulled in -----------------
    const rp = smooth(0.52, 0.725, p)
    st.ringPos.set(lerp(2.6, 0.89, rp), 0, lerp(40, 1.55, rp))
    st.ringPos.x = lerp(st.ringPos.x, 0.8, ring)
    st.ringPos.z = lerp(st.ringPos.z, 1.5, ring)
    // once held it rides the (now calming) swell far more steadily than the debris did — stable, safe
    st.ringPos.y = waveH(st.ringPos.x, st.ringPos.z, t, amp) * lerp(0.95, 0.35, ring) + 0.1
    st.grip.set(st.ringPos.x - 0.39, st.ringPos.y + 0.06, st.ringPos.z - 0.39)
    st.grip2.set(st.ringPos.x - 0.3, st.ringPos.y + 0.06, st.ringPos.z + 0.45)
    const ringReach = smooth(0.655, 0.73, p)
    if (ringReach > reachW) {
      reachW = ringReach
      st.target.copy(st.grip)
    }
    if (p > 0.73) reachW = 1

    // -------- swimmer: weight, drag and inertia ------------------------------------------------------------------
    resetPose(swimmer)
    // joint values are low-pass filtered, so limbs have momentum instead of snapping to the animation curve
    const sm = (key: string, target: number, lambda = 12) => {
      const cur = st.j[key] ?? target
      const nv = damp(cur, target, lambda, dt)
      st.j[key] = nv
      return nv
    }
    // stroke rate: irregular and laboured while fighting, slow and deep once safe
    const rate = (2.35 + 0.8 * Math.sin(t * 1.1) + 0.4 * Math.sin(t * 2.7)) * (1 - 0.55 * ring) * (1 - 0.25 * reachW * (1 - ring))
    st.phi += dt * rate
    const phi = st.phi
    const strain = 1 - ring
    const body = swimmer.root
    const lean = 0.14 * reachW * strain // lunges into each reach
    body.position.set(0, sm('by', surf * 0.9 - 0.05 - Math.min(0.3, dip * 0.2), 9), 0)
    body.rotation.x = sm('bp', Math.PI / 2 - Math.atan(sz) * 0.9 - ring * 0.28 + dip * 0.2 + lean, 8)
    body.rotation.z = sm('bz', Math.sin(t * 1.9) * 0.1 * exhaust + sx * 0.25 + Math.sin(phi) * 0.05 * exhaust, 7)
    body.rotation.y = Math.sin(t * 0.8) * 0.05
    // shoulders roll with the stroke, hips counter-roll; the head lifts to gasp and turns to breathe
    swimmer.j.spine.rotation.y = sm('roll', 0.42 * Math.sin(phi) * exhaust, 9)
    swimmer.j.spine.rotation.z = sm('sway', Math.sin(phi) * 0.1 * exhaust, 9)
    swimmer.j.head.rotation.x = sm('hx', -0.55 - ring * 0.2 + Math.sin(t * 2.4) * 0.08, 10)
    swimmer.j.head.rotation.y = sm('hy', -0.65 * Math.max(0, Math.sin(phi * 0.5 + 0.6)) * exhaust, 9)

    // arms: crawl (FK) — then IK takes over while reaching / holding
    const k = strain * (1 - reachW * 0.3)
    const aR = crawl(phi, -1)
    const aL = crawl(phi + Math.PI, 1)
    swimmer.j.shR.rotation.x = sm('rx', lerp(-0.5, aR.x, k), 13)
    swimmer.j.shR.rotation.z = sm('rz', aR.z * k, 13)
    swimmer.j.elR.rotation.x = sm('rel', aR.el * k, 14)
    swimmer.j.shL.rotation.x = sm('lx', lerp(-0.5, aL.x, k), 13)
    swimmer.j.shL.rotation.z = sm('lz', aL.z * k, 13)
    swimmer.j.elL.rotation.x = sm('lel', aL.el * k, 14)
    // legs: two-beat flutter kick, knees trailing the hips; tired, dragging behind the body
    const kick = Math.sin(phi * 2)
    swimmer.j.hpL.rotation.x = sm('hl', 0.3 * kick * exhaust, 16)
    swimmer.j.hpR.rotation.x = sm('hr', -0.3 * kick * exhaust, 16)
    swimmer.j.hpL.rotation.z = 0.05 + 0.04 * Math.sin(phi)
    swimmer.j.hpR.rotation.z = -0.05 - 0.04 * Math.sin(phi)
    swimmer.j.knL.rotation.x = sm('kl', 0.18 + 0.5 * Math.max(0, Math.sin(phi * 2 - 0.9)) * exhaust, 14)
    swimmer.j.knR.rotation.x = sm('kr', 0.18 + 0.5 * Math.max(0, Math.sin(phi * 2 + Math.PI - 0.9)) * exhaust, 14)
    body.updateWorldMatrix(true, true)
    if (reachW > 0.001) solveArm(swimmer, 'L', st.target, reachW, v(0.8, 0.7, -0.4))
    if (ring > 0.001) solveArm(swimmer, 'R', st.grip2, smooth(0.75, 0.8, p), v(-0.8, 0.7, -0.3))

    // wake foam around the body + a splash where the free hand dips in
    if (wake.current) {
      wake.current.position.set(0, surf * 0.9 + 0.04, 0.35)
      wake.current.rotation.set(-Math.PI / 2, 0, Math.sin(t * 0.8) * 0.08)
      wake.current.scale.set(1.7 + 0.25 * Math.sin(phi), 3.0, 1)
      wakeMat.opacity = (0.05 + 0.1 * Math.abs(Math.sin(phi))) * exhaust + flash * 0.25
    }
    if (splash.current) {
      swimmer.tipR.getWorldPosition(st.tmp2)
      const dipHand = clamp01((surf * 0.9 + 0.35 - st.tmp2.y) * 2.4) * exhaust
      splash.current.position.set(st.tmp2.x, surf * 0.9 + 0.12, st.tmp2.z)
      splash.current.material.opacity = dipHand * 0.22
      splash.current.scale.setScalar(0.28 + dipHand * 0.3)
    }
    // lightning rim: the silhouette catches a hard white edge for the length of each flash
    swimMat.uniforms.uInt.value = 1.5 + flash * 5.5
    swimMat.uniforms.uPow.value = 3.0 - flash * 1.4
    swimMat.uniforms.uRim.value.copy(C_RIM).lerp(C_RIM_FLASH, clamp01(flash))
    swimMat.uniforms.uBase.value.copy(C_BASE).lerp(C_BASE_FLASH, clamp01(flash))

    // -------- ring visuals + the payoff ripples ------------------------------------------------------------------
    if (ringRef.current) {
      ringRef.current.position.copy(st.ringPos)
      ringRef.current.rotation.set(Math.sin(t * 1.2) * 0.07 * (1 - 0.7 * ring), t * 0.25 * (1 - ring), Math.cos(t * 0.9) * 0.07 * (1 - 0.7 * ring))
      ringRef.current.visible = p > 0.45
    }
    const ringGlow = smooth(0.48, 0.66, p)
    beamMat.uniforms.uOpacity.value = ringGlow * 0.5 * (1 - 0.4 * ring)
    if (beamRef.current) beamRef.current.position.set(st.ringPos.x, st.ringPos.y + 7, st.ringPos.z)
    ripples.current.forEach((m, i) => {
      if (!m) return
      const q = smooth(STORM_GRAB - 0.004 + i * 0.02, 0.92, p)
      const on = smooth(STORM_GRAB - 0.006 + i * 0.02, STORM_GRAB + 0.002 + i * 0.02, p)
      m.visible = on > 0.01 && q < 0.995
      m.position.set(st.ringPos.x, st.ringPos.y + 0.03, st.ringPos.z)
      m.scale.setScalar(lerp(0.7, 18, q))
      rippleMats[i].opacity = on * (1 - q) * 0.85
    })

    // -------- lights, sky, ocean uniforms ----------------------------------------------------------------------
    light.keyMul = 1 + flash * 9
    light.hemiAdd = flash * 2.4 + calm * 0.7
    if (flash > 0.04) {
      // dynamic lightning: the key light jumps to the bolt's direction, so waves and the swimmer get a hard rim from that side
      light.keyPos = st.keyDir.set(bx, 40, bz).normalize().multiplyScalar(30)
      light.keyColor = C_BOLT_LIGHT
    }
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
      sky.uniforms.uBoltDir.value.set(bx, 30, bz).normalize()
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
      oc.uniforms.uBoltPos.value.copy(st.boltPos)
      oc.uniforms.uBoltI.value = boltI
    }
    const rain = rainMat.current
    if (rain) {
      rain.uniforms.uTime.value = state.clock.elapsedTime
      rain.uniforms.uCenter.value.copy(state.camera.position)
      rain.uniforms.uAlpha.value = (1 - smooth(0.74, 0.92, p)) * (0.55 + 0.45 * smooth(0, 0.2, p)) * (1 + flash * 0.8)
      rain.visible = rain.uniforms.uAlpha.value > 0.01
    }
    cageGlow.current = clamp01(0.05 + flash * 1.5 + calm * 0.95)

    // -------- camera ---------------------------------------------------------------------------------------------
    const pos = keys(p, [
      { p: 0, v: [9.5, 5.6, -8.5] },
      { p: 0.13, v: [10.5, 4.4, -2.5] },
      { p: 0.18, v: [7, 2.6, -2.5] },
      { p: 0.205, v: [3.1, 1.15, -1.0] },
      { p: 0.27, v: [3.3, 1.35, -0.5] },
      { p: 0.34, v: [2.8, 1.0, -1.2] },
      { p: 0.43, v: [3.4, 1.4, -0.8] },
      { p: 0.53, v: [2.9, 1.1, -1.3] },
      { p: 0.6, v: [3.9, 2.0, -1.8] },
      { p: 0.72, v: [3.7, 1.8, -1.2] },
      { p: 0.755, v: [3.0, 1.1, 0.0] },
      { p: 0.81, v: [3.5, 1.3, -0.6] },
      { p: 0.88, v: [8.5, 3.2, -7.5] },
      { p: 1, v: [12, 6.5, -14] },
    ])
    const look = keys(p, [
      { p: 0, v: [0, 0.3, 2.5] },
      { p: 0.17, v: [0, 0.2, 2.2] },
      { p: 0.21, v: [0.35, 0.15, 1.1] },
      { p: 0.55, v: [0.45, 0.15, 1.2] },
      { p: 0.62, v: [0.9, 0.4, 3.4] },
      { p: 0.72, v: [0.9, 0.35, 2.3] },
      { p: 0.77, v: [0.7, 0.3, 1.4] },
      { p: 0.88, v: [0.2, 0.7, 2.6] },
      { p: 1, v: [0, 1.4, 6] },
    ])
    const fov = keys(p, [
      { p: 0, v: [52, 0, 0] },
      { p: 0.19, v: [48, 0, 0] },
      { p: 0.205, v: [42, 0, 0] },
      { p: 0.6, v: [44, 0, 0] },
      { p: 0.76, v: [38, 0, 0] },
      { p: 0.9, v: [50, 0, 0] },
    ])[0]
    // close beats: the camera rides the same swell as the swimmer so the framing stays steady while the sea heaves
    const follow = smooth(0.16, 0.2, p) * (1 - smooth(0.82, 0.9, p))
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
      <mesh ref={wake} material={wakeMat} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <Glow ref={splash} position={[0, 0, 0]} size={1} color="#dff0ff" opacity={0} boost={1.2} />

      {/* basketball · laptop · palette · plank with tools */}
      {objs.groups.map((g, i) => (
        <primitive key={i} object={g} />
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
      {/* golden ripples spreading over the water at the moment of the grab */}
      {rippleMats.map((m, i) => (
        <mesh key={i} ref={(r) => (ripples.current[i] = r)} material={m} rotation={[-Math.PI / 2, 0, 0]} visible={false} frustumCulled={false}>
          <ringGeometry args={[0.92, 1, 56]} />
        </mesh>
      ))}
    </group>
  )
}
