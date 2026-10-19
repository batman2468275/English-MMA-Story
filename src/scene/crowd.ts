import { CapsuleGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import { mulberry32 } from '../core/math'
import { store } from '../core/store'

/**
 * A standing arena crowd as two InstancedMeshes (bodies + heads) — 2 draw calls for ~150 people. Rows are tiered around a
 * centre; everyone sways on their own rhythm and the whole crowd surges (rises on its toes, arms-up lurch) with `surge`
 * (0..1, driven by hit events in real time).
 */
export interface Crowd {
  group: Group
  update: (t: number, surge: number) => void
}

const d = new Object3D()

export function createCrowd(opts: { rows?: number; r0?: number; gap?: number; perRow?: number; seed?: number; tier?: number } = {}): Crowd {
  const { rows = 4, r0 = 8.6, gap = 1.35, perRow = 30, seed = 5, tier = 0.5 } = opts
  const rnd = mulberry32(seed)
  const mobileK = store.mobile ? 0.5 : 1
  const people: { x: number; z: number; y: number; yaw: number; ph: number; sp: number; h: number }[] = []
  for (let k = 0; k < rows; k++) {
    const r = r0 + k * gap
    const n = Math.round((perRow + k * 7) * mobileK)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.08
      const rr = r + (rnd() - 0.5) * 0.5
      people.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, y: k * tier, yaw: a + Math.PI, ph: rnd() * 6.28, sp: 1.2 + rnd() * 1.6, h: 0.92 + rnd() * 0.18 })
    }
  }
  const mat = new MeshStandardMaterial({ color: '#17171d', roughness: 0.9, emissive: '#08080d' })
  const headMat = new MeshStandardMaterial({ color: '#2a2024', roughness: 0.8, emissive: '#0d0809' })
  const bodies = new InstancedMesh(new CapsuleGeometry(0.2, 0.75, 3, 8), mat, people.length)
  const heads = new InstancedMesh(new SphereGeometry(0.125, 8, 6), headMat, people.length)
  bodies.instanceMatrix.setUsage(DynamicDrawUsage)
  heads.instanceMatrix.setUsage(DynamicDrawUsage)
  bodies.frustumCulled = heads.frustumCulled = false
  const c = new Color()
  people.forEach((_, i) => {
    bodies.setColorAt(i, c.setHSL(0.02 + rnd() * 0.08, 0.2 + rnd() * 0.25, 0.07 + rnd() * 0.08))
  })
  const group = new Group()
  group.add(bodies, heads)

  return {
    group,
    update(t, surge) {
      people.forEach((p, i) => {
        const bob = Math.abs(Math.sin(t * p.sp + p.ph)) * 0.03
        const jump = surge * (0.12 + 0.12 * Math.sin(p.ph * 3 + t * 9)) * (0.6 + 0.4 * Math.sin(p.ph))
        const y = p.y + 0.7 * p.h + bob + Math.max(0, jump)
        d.position.set(p.x, y, p.z)
        d.rotation.set(0.04 * Math.sin(t * 0.8 + p.ph) + surge * 0.12, p.yaw, 0.05 * Math.sin(t * 0.6 + p.ph * 2))
        d.scale.set(1, p.h, 1)
        d.updateMatrix()
        bodies.setMatrixAt(i, d.matrix)
        d.position.set(p.x - Math.sin(p.yaw) * 0.02, y + 0.56 * p.h, p.z - Math.cos(p.yaw) * 0.02)
        d.rotation.set(0.1 * Math.sin(t * 0.7 + p.ph) - surge * 0.15, p.yaw, 0)
        d.scale.setScalar(1)
        d.updateMatrix()
        heads.setMatrixAt(i, d.matrix)
      })
      bodies.instanceMatrix.needsUpdate = true
      heads.instanceMatrix.needsUpdate = true
    },
  }
}
