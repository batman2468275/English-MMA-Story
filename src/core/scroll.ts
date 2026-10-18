import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { store } from './store'
import { N } from '../content/story'
import { clamp01, smooth } from './math'
import { updateFx } from './fx'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null
const sectionEls: (HTMLElement | null)[] = new Array(N).fill(null)

export const getLenis = () => lenis

/** Sections call this on mount so the driver can measure them. */
export function registerSection(index: number, el: HTMLElement | null) {
  sectionEls[index] = el
}

/** Re-measure every section's document position/height. */
export function measure() {
  store.vh = window.innerHeight
  for (let i = 0; i < N; i++) {
    const el = sectionEls[i]
    if (!el) continue
    const r = el.getBoundingClientRect()
    store.tops[i] = r.top + window.scrollY
    store.heights[i] = r.height
  }
}

/** Colour of the fade-through at the boundary *into* section i. */
const veilColors: Record<number, string> = {
  1: '#1a0f06', // hero -> driveway: warm black
  2: '#0b1a3a', // door -> basement: deep blue
  3: '#000000',
  4: '#000000', // hand over the eyes -> storm
  5: '#cfe3ff', // storm payoff -> quiet
  6: '#2a1240', // quiet -> sunset
  7: '#ffd9a8', // sunset -> clouds
  8: '#eaf2ff', // clouds -> gym
  9: '#1a0f08',
  10: '#000000',
  11: '#05050a',
  12: '#05060a',
  13: '#02030a',
}

/** Per-frame: derive active section, per-section progress, fade-through value. */
function drive() {
  const y = window.scrollY
  const vh = store.vh
  store.scrollY = y
  const max = Math.max(1, document.documentElement.scrollHeight - vh)
  store.global = clamp01(y / max)

  let active = 0
  for (let i = 0; i < N; i++) if (y >= store.tops[i] - 1) active = i
  store.active = active

  for (let i = 0; i < N; i++) store.local[i] = clamp01((y - store.tops[i]) / store.heights[i])

  // fade-through around the nearest boundary
  let veil = 0
  let color = store.veilColor
  const w = vh * 0.45
  for (let i = 1; i < N; i++) {
    const d = Math.abs(y - store.tops[i])
    if (d < w) {
      const v = 1 - smooth(0, w, d)
      if (v > veil) {
        veil = v
        color = veilColors[i] ?? '#000'
      }
    }
  }
  store.veil = veil
  store.veilColor = color
  updateFx(performance.now() / 1000)
}

export function initScroll(): () => void {
  if (store.reduced) return () => {}

  // always start the story from the top (a reload mid-way would otherwise land in the middle of a scene)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)

  lenis = new Lenis({
    duration: 1.25,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.9,
  })
  lenis.stop() // locked until the loading screen finishes
  lenis.on('scroll', ScrollTrigger.update)

  const tick = (time: number) => {
    lenis?.raf(time * 1000)
    store.time = time
    store.frame++
    drive()
  }
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const onResize = () => {
    measure()
    ScrollTrigger.refresh()
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('load', onResize)
  // sections measure themselves once fonts + layout settle
  document.fonts?.ready.then(onResize)
  measure()

  const onMove = (e: PointerEvent) => {
    store.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    store.mouse.y = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onMove)

  return () => {
    gsap.ticker.remove(tick)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('load', onResize)
    window.removeEventListener('pointermove', onMove)
    lenis?.destroy()
    lenis = null
  }
}

export function unlockScroll() {
  lenis?.start()
}
