import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, Figure, groundFigure, limitPose, lookAt, palmFacing, resetPose, setHand, solveArm } from '../figure'
import { resolveContacts } from '../contact'
import { rimMaterial, setRimLight } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { easeInOut, lerp, smooth } from '../../core/math'
import { palette } from '../../theme'

/**
 * 10 — WHY IT STUCK: two silhouettes training *together*. A slow, cooperative pad-style drill — one holds open palms, the other
 * throws a jab–cross–jab–cross at them; fists meet palms exactly, the holder gives with each touch, and they swap roles every
 * six seconds. Two more pairs drill in the background on their own timing. Late in the chapter the main pair finish with a
 * fist bump and a bow (scroll-driven). Feet are planted; bodies keep a respectful, never-intersecting distance.
 */
const a = new Vector3(), b = new Vector3(), pole = new Vector3(), mid = new Vector3(), tmp = new Vector3()

const fwd = (f: Figure, o: Vector3) => o.set(Math.sin(f.root.rotation.y), 0, Math.cos(f.root.rotation.y))

/** Slow, readable punch: wind-up, reach, touch, ease back. */
function touch(u: number) {
  if (u < 0 || u > 1) return 0
  if (u < 0.22) return -0.08 * easeInOut(u / 0.22)
  if (u < 0.45) return lerp(-0.08, 1, easeInOut((u - 0.22) / 0.23))
  if (u < 0.55) return 1
  return 1 - easeInOut((u - 0.55) / 0.45)
}

function drillPair(s: Figure, h: Figure, cx: number, cz: number, gap: number, t: number, bumpW: number, bowW: number, flip = 1, strikerFirst = true) {
  resetPose(s); resetPose(h)
  const sw = Math.floor(t / 6) % 2 === 0
  const striker = (sw === strikerFirst) ? s : h
  const holder = striker === s ? h : s
  const turn = ((t % 6) / 6) // 0..1 within a role
  s.root.rotation.y = (Math.PI / 2) * flip
  h.root.rotation.y = (-Math.PI / 2) * flip
  const sg = (striker === s ? -1 : 1) * flip
  const hg = -sg
  const sx = cx + sg * gap, hx = cx + hg * gap
  striker.root.position.set(sx, 0.98, cz)
  holder.root.position.set(hx, 0.98, cz)
  // low, balanced, relaxed stances
  for (const f of [s, h]) {
    const sy = Math.sin(t * 2.2 + (f === s ? 0 : 1.5))
    f.j.spine.rotation.x = 0.1 + 0.02 * sy
    f.j.hpL.rotation.x = -0.28; f.j.hpR.rotation.x = 0.25; f.j.knL.rotation.x = 0.25; f.j.knR.rotation.x = 0.15
    f.j.hpL.rotation.z = 0.1; f.j.hpR.rotation.z = -0.14
    f.j.shL.rotation.x = -1.0; f.j.shL.rotation.z = 0.3; f.j.elL.rotation.x = -1.8
    f.j.shR.rotation.x = -0.95; f.j.shR.rotation.z = -0.3; f.j.elR.rotation.x = -1.8
    f.j.head.rotation.x = 0.06
  }
  // four touches per role: L, R, L, R at 0.7-ish second spacing
  const slot = turn * 6 / 1.1 // 0..5.45
  const seq = [0, 1, 2, 3].map((i) => touch(slot - 0.4 - i * 1.15))
  const reach = Math.max(...seq)
  striker.j.spine.rotation.y = 0.28 * Math.max(seq[1], seq[3]) - 0.2 * Math.max(seq[0], seq[2])
  holder.j.spine.rotation.x += 0.06 * reach // gives a little with each touch
  holder.j.head.rotation.x += 0.04 * reach
  limitPose(striker); limitPose(holder)
  groundFigure(striker, 0); groundFigure(holder, 0)
  resolveContacts([s, h], { iterations: 2, margin: 0.02 })
  groundFigure(striker, 0); groundFigure(holder, 0)

  // ----- palms: held open between them at chest height (holder's left is on the striker's right and vice-versa)
  const f1 = fwd(holder, tmp).clone() // holder faces the striker
  holder.root.getWorldPosition(mid)
  const give = 0.05 * reach
  const lat = new Vector3(-Math.cos(holder.root.rotation.y), 0, Math.sin(holder.root.rotation.y)) // holder's right
  const palmL = mid.clone().addScaledVector(f1, 0.36 - give).addScaledVector(lat, -0.17).setY(1.32) // holder's left palm
  const palmR = mid.clone().addScaledVector(f1, 0.36 - give).addScaledVector(lat, 0.17).setY(1.32)
  const bumpPoint = mid.clone().addScaledVector(f1, 0.42)
  bumpPoint.y = 1.25
  const hOpen = 1 - bumpW * 0.0
  solveArm(holder, 'L', palmL, hOpen * (1 - bumpW), pole.set(-lat.x, 0.2, -lat.z))
  solveArm(holder, 'R', palmR, hOpen * (1 - bumpW), pole.set(lat.x, 0.2, lat.z))
  // open palms present their faces to the striker's fists
  palmFacing(holder, 'L', f1, 1 - bumpW)
  palmFacing(holder, 'R', f1, 1 - bumpW)
  setHand(holder, 'L', 0.04)
  setHand(holder, 'R', 0.04)
  setHand(striker, 'L', 0.9)
  setHand(striker, 'R', 0.9)
  // ----- striker's fists stop on the palm surface (never through it)
  striker.root.updateWorldMatrix(true, true)
  const toS = fwd(striker, b).clone()
  const palmSurfL = palmL.clone().addScaledVector(toS, -0.05)
  const palmSurfR = palmR.clone().addScaledVector(toS, -0.05)
  const guardL = new Vector3(), guardR = new Vector3()
  striker.tipL.getWorldPosition(guardL)
  striker.tipR.getWorldPosition(guardR)
  // the striker's left hand lines up with the holder's right palm (they face each other)
  const eL = Math.max(seq[0], seq[2]) * (1 - bumpW)
  const eR = Math.max(seq[1], seq[3]) * (1 - bumpW)
  a.copy(guardL).lerp(palmSurfR, eL)
  b.copy(guardR).lerp(palmSurfL, eR)
  solveArm(striker, 'L', a, Math.abs(eL) > 0.001 ? 1 : 0, pole.set(0, 0.3, -toS.x * 0.0 - 1))
  solveArm(striker, 'R', b, Math.abs(eR) > 0.001 ? 1 : 0, pole.set(0, 0.3, 1))
  return { bumpPoint, f1 }
}

export function Partners() {
  const mat = useMemo(() => rimMaterial('#1a0e07', '#ffc77a', 2.5, 2.0), [])
  const matFar = useMemo(() => rimMaterial('#1a0e07', '#ff9a4a', 2.5, 1.6), [])
  const fig = useMemo(
    () => ({
      a: createFigure(mat), b: createFigure(mat),
      c: createFigure(matFar, 0.82), d: createFigure(matFar, 0.82),
      e: createFigure(matFar, 0.82), f: createFigure(matFar, 0.82),
    }),
    [mat, matFar],
  )
  const accent = palette()

  useSceneFrame(9, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const bump = smooth(0.74, 0.84, p) * (1 - smooth(0.9, 0.94, p))
    const bow = smooth(0.9, 0.98, p)
    // the room's warm glow lights the silhouettes
    setRimLight(mat, tmp.set(0, 3.5, 2), '#ffb070', 0.8)

    const main = drillPair(fig.a, fig.b, 0, 0, 0.74 - bump * 0.07, t, bump, bow)
    // finale: fists meet in the middle, then both bow (scroll-driven, so it scrubs both ways)
    if (bump > 0.01) {
      // right fists meet on the centre line: each stops 4 cm short of it, knuckles touching, one a hair across the other
      const mx = (fig.a.root.position.x + fig.b.root.position.x) / 2
      solveArm(fig.a, 'R', a.set(mx - 0.04, 1.25, 0.035), bump, pole.set(0, 0.3, 1))
      solveArm(fig.b, 'R', b.set(mx + 0.04, 1.25, -0.035), bump, pole.set(0, 0.3, -1))
    }
    void main
    if (bow > 0.001) {
      for (const f of [fig.a, fig.b]) {
        f.j.spine.rotation.x += 0.5 * bow
        f.j.head.rotation.x += 0.25 * bow
        f.j.hpL.rotation.x += -0.08 * bow
        f.j.hpR.rotation.x += -0.08 * bow
      }
    }
    drillPair(fig.c, fig.d, -4.2, -3.2, 0.7 * 0.82, t * 0.9 + 2, 0, 0, 1, false)
    drillPair(fig.e, fig.f, 4.5, -4.5, 0.7 * 0.82, t * 1.05 + 4, 0, 0, -1, true)
    for (const f of [fig.a, fig.b]) {
      f.root.updateWorldMatrix(true, true)
    }
    lookAt(fig.a, tmp.copy(fig.b.root.position).setY(1.65), 0.7)
    lookAt(fig.b, tmp.copy(fig.a.root.position).setY(1.65), 0.7)

    const ang = keys(p, [{ p: 0, v: [-0.55, 0, 0] }, { p: 0.5, v: [0.0, 0, 0] }, { p: 1, v: [0.5, 0, 0] }])[0]
    const h = keys(p, [{ p: 0, v: [1.2, 0, 0] }, { p: 1, v: [1.7, 0, 0] }])[0]
    setCam(9, state.camera as never, [Math.sin(ang) * 5.4, h, Math.cos(ang) * 5.4], [0, 1.15, 0], 46, dt, { lambda: 4, parallax: 0.12 })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[7, 8]} />
        <meshStandardMaterial color="#1d120a" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, 0.01, 0]}>
        <ringGeometry args={[6.9, 7.05, 8]} />
        <meshBasicMaterial color={accent.warm} toneMapped={false} />
      </mesh>
      <Glow position={[0, 0.05, 0]} size={[16, 7]} color="#ff9a3d" opacity={0.35} />
      {/* big warm halo behind them */}
      <mesh position={[0, 2, -7]}>
        <torusGeometry args={[4.2, 0.05, 8, 96]} />
        <meshBasicMaterial color={accent.warm.clone().multiplyScalar(2.2)} toneMapped={false} />
      </mesh>
      <Glow position={[0, 2, -7.2]} size={22} color="#ff8a2a" opacity={0.55} boost={1.2} />
      {Object.values(fig).map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}
      <ParticleField count={count(320)} box={[22, 9, 22]} vel={[0, 0.18, 0]} size={20} color="#ffb85a" opacity={0.6} position={[0, 4, -2]} seed={91} />
    </group>
  )
}
