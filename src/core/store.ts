import { N } from '../content/story'

/**
 * Global, non-React scroll/animation state.
 * The ScrollDriver (core/scroll.ts) writes it every frame, scenes + overlays read it.
 * Keeping it outside React means 60fps updates without any re-renders.
 */
export const store = {
  // ---- environment flags
  reduced: false,
  mobile: false,
  /** dev/testing shortcut (?lite): no bloom/MSAA, low resolution — for slow software renderers */
  lite: false,
  ready: false,
  /** true while shaders are being pre-compiled: every scene is made visible once */
  forceVisible: false,
  introStart: 0,
  frame: 0,
  time: 0,

  // ---- scroll
  scrollY: 0,
  global: 0, // 0..1 over the entire page
  active: 0, // index of the section whose 3D scene is on screen
  /** per-section progress 0..1 (clamped) */
  local: new Array(N).fill(0) as number[],
  tops: new Array(N).fill(0) as number[],
  heights: new Array(N).fill(1) as number[],
  vh: 800,

  /** 0..1 — strength of the fade-through between two scenes (peaks at a section boundary) */
  veil: 0,
  veilColor: '#000000',

  mouse: { x: 0, y: 0 }, // -1..1

  // ---- screen effects, written by scenes, consumed by post-processing + overlays
  fx: {
    flash: 0, // white flash overlay
    flare: 0, // warm radial flare overlay (storm payoff)
    shake: 0, // camera shake magnitude
    aberration: 0, // chromatic aberration
    shockR: -1, // screen-space shockwave radius (-1 = off)
    shockAmp: 0,
    warp: 0, // time-dilation strength
    hand: 0, // 0..1 hand-silhouette sweep
    crack: 0, // 0..1 crack drawing progress (foot scene)
    heal: 0, // 0..1 crack filling with light
    saturation: 1,
    vignette: 0.5,
    bloom: 1,
    grain: 0.05,
  },

  audioOn: false,

  /** screen-space anchors (px) + opacity of the four storm object labels, written by the Storm scene, read by sections/Storm.tsx */
  stormLabels: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, o: 0 })),
}

export type Store = typeof store

/**
 * Progress of section `i` measured over its *pinned* phase only (0 when it pins, 1 when it is about to release).
 * Use for the last section, whose scroll range ends at the bottom of the page rather than at the next section.
 */
export const pinnedProgress = (i: number) => {
  const H = store.heights[i]
  return Math.min(1, Math.max(0, (store.local[i] * H) / Math.max(1, H - store.vh)))
}
