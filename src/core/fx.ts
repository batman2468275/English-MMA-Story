import { store } from './store'
import { smooth, range } from './math'
import { indexOf } from '../content/story'

/**
 * Screen-FX derived purely from scroll position (called every frame from the scroll driver).
 *
 *  • Progress-shaped effects (hand sweep, crack, heal, flare, time-dilation) are plain functions of
 *    scroll progress, so scrolling back reverses them.
 *  • "Hit" effects (white flash, shake, shockwave, glitch) fire when scroll *crosses* a threshold, then
 *    decay over a short real-time window so they never get stuck on screen if the user stops scrolling.
 */
const VAN = indexOf('van')
const STORM = indexOf('storm')
const FOOT = indexOf('foot')
const FLOW = indexOf('flow')

export const VAN_HIT = 0.4
export const STORM_GRAB = 0.74

type Listener = (name: 'van-hit' | 'storm-grab') => void
const listeners: Listener[] = []
export const onHit = (fn: Listener) => {
  listeners.push(fn)
  return () => listeners.splice(listeners.indexOf(fn), 1)
}

let prevVan = 0
let prevStorm = 0
let tVan = -99
let tStorm = -99

export function updateFx(now: number) {
  const f = store.fx
  const pv = store.local[VAN]
  const ps = store.local[STORM]

  if ((prevVan < VAN_HIT && pv >= VAN_HIT) || (prevVan >= VAN_HIT && pv < VAN_HIT && pv > VAN_HIT - 0.04)) {
    tVan = now
    if (pv >= VAN_HIT) listeners.forEach((l) => l('van-hit'))
  }
  if ((prevStorm < STORM_GRAB && ps >= STORM_GRAB) || (prevStorm >= STORM_GRAB && ps < STORM_GRAB && ps > STORM_GRAB - 0.03)) {
    tStorm = now
    if (ps >= STORM_GRAB) listeners.forEach((l) => l('storm-grab'))
  }
  prevVan = pv
  prevStorm = ps

  const active = store.active
  const dv = now - tVan
  const ds = now - tStorm

  // ---- Van knock-down impact
  const hitEnv = active === VAN ? Math.exp(-dv / 0.22) : 0
  const strikeBand = active === VAN ? smooth(VAN_HIT, VAN_HIT + 0.05, pv) * (1 - smooth(0.7, 0.8, pv)) : 0
  f.flash = hitEnv * 0.95
  f.shake = hitEnv * 0.45 + strikeBand * 0.025 * (0.6 + 0.4 * Math.sin(now * 40))
  f.aberration = hitEnv * 0.016 + (dv < 0.5 && active === VAN ? (Math.random() - 0.5) * 0.004 : 0)
  f.shockR = active === VAN && dv < 1.6 ? dv * 0.75 : -1
  f.shockAmp = active === VAN && dv < 1.6 ? Math.exp(-dv * 1.7) : 0

  // ---- hand covering the eyes (persists into the first moments of the storm, then lifts)
  f.hand = smooth(0.8, 0.96, store.local[VAN]) * (1 - smooth(0.0, 0.05, ps))

  // ---- storm payoff flare
  const shape = smooth(STORM_GRAB - 0.012, STORM_GRAB + 0.004, ps) * (1 - smooth(STORM_GRAB + 0.004, STORM_GRAB + 0.1, ps))
  const timeEnv = active === STORM && ds >= 0 && ds < 4 ? Math.exp(-ds / 0.9) : 0
  f.flare = Math.max(shape * 0.55, timeEnv)

  // ---- foot: crack draws, then heals with light
  const pf = store.local[FOOT]
  f.crack = smooth(0.15, 0.4, pf) // the screen crack races out right after the bone snaps (p ≈ .15)
  f.heal = smooth(0.52, 0.82, pf)

  // ---- flow: time dilation
  const pw = store.local[FLOW]
  f.warp = active === FLOW ? smooth(0.08, 0.3, pw) * (1 - smooth(0.88, 0.99, pw)) : 0

  f.grain = 0.045
  void range
}
