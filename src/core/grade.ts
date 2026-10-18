// ============================================================================
// COLOUR GRADE TABLE — lighting / fog / post settings for every section.
// The Rig (scene/Rig.tsx) smoothly eases the shared lights + fog toward the
// active section's entry, so lighting transitions are tied to scroll.
// Order must match `chapters` in content/story.ts.
// ============================================================================

export interface Grade {
  bg: string
  fogNear: number
  fogFar: number
  hemiSky: string
  hemiGround: string
  hemi: number
  key: string
  keyI: number
  keyPos: [number, number, number]
  pt: string
  ptI: number
  ptPos: [number, number, number]
  bloom: number
  sat: number
  vig: number
}

export const grades: Grade[] = [
  // 0 hero — black void with red ember glow
  { bg: '#040405', fogNear: 14, fogFar: 70, hemiSky: '#2a2a3a', hemiGround: '#000000', hemi: 0.35, key: '#ff5a5a', keyI: 0.8, keyPos: [3, 6, 6], pt: '#ff3b3b', ptI: 6, ptPos: [0, 2, 1], bloom: 1.1, sat: 1.05, vig: 0.75 },
  // 1 driveway — warm amber night
  { bg: '#0a0c18', fogNear: 18, fogFar: 85, hemiSky: '#46588c', hemiGround: '#1c1208', hemi: 0.7, key: '#9db0ff', keyI: 0.7, keyPos: [-6, 10, 6], pt: '#ffb347', ptI: 10, ptPos: [0, 3, -6], bloom: 0.9, sat: 1.08, vig: 0.55 },
  // 2 basement — dim, blue screen light
  { bg: '#04060c', fogNear: 6, fogFar: 36, hemiSky: '#20305f', hemiGround: '#02030a', hemi: 0.45, key: '#4a6bff', keyI: 0.35, keyPos: [0, 4, -4], pt: '#4d7cff', ptI: 14, ptPos: [0, 2.5, -4], bloom: 1.25, sat: 1.0, vig: 0.7 },
  // 3 Van — hard arena light
  { bg: '#050609', fogNear: 10, fogFar: 50, hemiSky: '#3a3a55', hemiGround: '#000000', hemi: 0.35, key: '#ffffff', keyI: 1.4, keyPos: [0, 10, 3], pt: '#ff3b3b', ptI: 6, ptPos: [0, 3, 2], bloom: 1.1, sat: 1.0, vig: 0.7 },
  // 4 storm — near black teal
  { bg: '#03060c', fogNear: 10, fogFar: 85, hemiSky: '#3b5878', hemiGround: '#02050a', hemi: 0.35, key: '#8fb2d9', keyI: 0.6, keyPos: [-10, 15, 6], pt: '#cfe3ff', ptI: 0, ptPos: [0, 12, 4], bloom: 1.25, sat: 0.95, vig: 0.7 },
  // 5 quiet — desaturated, a single spotlight
  { bg: '#0a0a0b', fogNear: 5, fogFar: 32, hemiSky: '#8a8a90', hemiGround: '#101010', hemi: 0.18, key: '#ffffff', keyI: 0.0, keyPos: [0, 8, 2], pt: '#ffffff', ptI: 9, ptPos: [0, 6, 0.5], bloom: 0.9, sat: 0.12, vig: 0.95 },
  // 6 sunset — orange to purple
  { bg: '#2a1240', fogNear: 30, fogFar: 160, hemiSky: '#ff9a5a', hemiGround: '#3a1a5a', hemi: 0.9, key: '#ffb06a', keyI: 2.2, keyPos: [-8, 3, -10], pt: '#ffd27a', ptI: 5, ptPos: [0, 3, 4], bloom: 1.15, sat: 1.15, vig: 0.5 },
  // 7 cloud — bright, soft
  { bg: '#6f93c9', fogNear: 18, fogFar: 90, hemiSky: '#ffffff', hemiGround: '#8fa8d8', hemi: 1.1, key: '#fff4e0', keyI: 0.9, keyPos: [5, 10, 5], pt: '#ffffff', ptI: 3, ptPos: [0, 4, 4], bloom: 0.7, sat: 1.0, vig: 0.35 },
  // 8 gym — cool fluorescent
  { bg: '#0b0b0e', fogNear: 8, fogFar: 44, hemiSky: '#cfd8ff', hemiGround: '#222226', hemi: 0.55, key: '#ffffff', keyI: 0.7, keyPos: [0, 5, 3], pt: '#fff3dd', ptI: 8, ptPos: [0, 3.4, 2], bloom: 0.8, sat: 0.95, vig: 0.7 },
  // 9 mma — warm gold
  { bg: '#1a0f08', fogNear: 10, fogFar: 56, hemiSky: '#ffcf99', hemiGround: '#2a1408', hemi: 0.8, key: '#ffb46b', keyI: 1.6, keyPos: [-4, 6, 4], pt: '#ff9a3d', ptI: 8, ptPos: [0, 2.5, 2], bloom: 1.05, sat: 1.12, vig: 0.55 },
  // 10 foot — dark, clinical, gold heal
  { bg: '#060608', fogNear: 8, fogFar: 50, hemiSky: '#8890a8', hemiGround: '#000000', hemi: 0.35, key: '#ffffff', keyI: 0.8, keyPos: [3, 6, 5], pt: '#ffc15a', ptI: 6, ptPos: [0, 1, 3], bloom: 1.35, sat: 0.9, vig: 0.75 },
  // 11 flow — violet slow-mo
  { bg: '#07070e', fogNear: 8, fogFar: 46, hemiSky: '#6677ff', hemiGround: '#110a1a', hemi: 0.4, key: '#ffd9a8', keyI: 1.1, keyPos: [-4, 6, 4], pt: '#8a7bff', ptI: 9, ptPos: [0, 3, 3], bloom: 1.3, sat: 1.1, vig: 0.8 },
  // 12 timeline
  { bg: '#05060a', fogNear: 12, fogFar: 60, hemiSky: '#334466', hemiGround: '#000000', hemi: 0.45, key: '#ffffff', keyI: 0.35, keyPos: [0, 8, 4], pt: '#ff4757', ptI: 6, ptPos: [0, 3, 3], bloom: 1.3, sat: 1.0, vig: 0.65 },
  // 13 now — night sky, stars
  { bg: '#02030a', fogNear: 30, fogFar: 140, hemiSky: '#223355', hemiGround: '#000000', hemi: 0.5, key: '#aabbdd', keyI: 0.5, keyPos: [0, 10, 6], pt: '#ff4757', ptI: 8, ptPos: [0, 2, 0], bloom: 1.3, sat: 1.05, vig: 0.6 },
]
