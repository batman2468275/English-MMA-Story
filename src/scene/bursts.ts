import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three'

/**
 * Impact particle bursts (sweat spray + dust) as ONE InstancedMesh, so they cost a single draw call.
 * `spawn()` is called from hit events (core/fx.ts cue names) or directly by a scene; `update(dt)` runs once per frame.
 * They are a short real-time effect (like the screen flash), not part of the scrubbed timeline, so they never get stuck.
 */
export interface Bursts {
  object: InstancedMesh
  spawn: (at: Vector3, n: number, o?: { speed?: number; up?: number; size?: number; life?: number; color?: string; gravity?: number }) => void
  update: (dt: number) => void
}

interface P {
  p: Vector3
  v: Vector3
  life: number
  max: number
  size: number
  g: number
}

const dummy = new Object3D()
const col = new Color()

export function createBursts(max = 80): Bursts {
  const geo = new SphereGeometry(1, 6, 5)
  const mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, opacity: 0.9 })
  const mesh = new InstancedMesh(geo, mat, max)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  const ps: P[] = Array.from({ length: max }, () => ({ p: new Vector3(), v: new Vector3(), life: 0, max: 1, size: 0.02, g: 6 }))
  for (let i = 0; i < max; i++) {
    dummy.position.set(0, -50, 0)
    dummy.scale.setScalar(0.0001)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, col.set('#ffffff'))
  }
  let cursor = 0
  return {
    object: mesh,
    spawn(at, n, o = {}) {
      const { speed = 1.8, up = 0.8, size = 0.018, life = 0.7, color = '#cfe6ff', gravity = 6 } = o
      for (let k = 0; k < n; k++) {
        const idx = cursor++ % max
        const q = ps[idx]
        q.p.copy(at)
        const a = Math.random() * Math.PI * 2
        const s = speed * (0.35 + Math.random() * 0.75)
        q.v.set(Math.cos(a) * s, up * (0.4 + Math.random()) * speed * 0.5, Math.sin(a) * s)
        q.max = q.life = life * (0.6 + Math.random() * 0.7)
        q.size = size * (0.6 + Math.random() * 0.9)
        q.g = gravity
        mesh.setColorAt(idx, col.set(color))
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const q = ps[i]
        if (q.life <= 0) {
          if (q.max > 0) {
            q.max = 0 // park it once
            dummy.position.set(0, -50, 0)
            dummy.scale.setScalar(0.0001)
            dummy.updateMatrix()
            mesh.setMatrixAt(i, dummy.matrix)
          }
          continue
        }
        q.life -= dt
        q.v.y -= q.g * dt
        q.v.multiplyScalar(1 - 0.8 * dt) // air drag
        q.p.addScaledVector(q.v, dt)
        if (q.p.y < 0.02) {
          q.p.y = 0.02
          q.v.y *= -0.25
          q.v.x *= 0.6
          q.v.z *= 0.6
        }
        const k = Math.max(0, q.life / q.max)
        dummy.position.copy(q.p)
        dummy.scale.setScalar(q.size * (0.4 + 0.6 * k))
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}
