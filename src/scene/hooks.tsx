import { ReactNode, useRef } from 'react'
import { useFrame, RootState } from '@react-three/fiber'
import { Group } from 'three'
import { store } from '../core/store'
import { updateFigures } from './figure'

/** Runs `fn` every frame, but only while section `index` is the active one. */
export function useSceneFrame(
  index: number,
  fn: (p: number, dt: number, state: RootState) => void,
) {
  useFrame((state, dt) => {
    if (store.active !== index) return
    const d = Math.min(dt, 0.05)
    fn(store.local[index], d, state)
    // life + secondary motion + contact shadows for every visible figure (once per frame, after the scene has posed them)
    updateFigures(d, state.clock.elapsedTime)
  })
}

/** Wrapper that only makes a scene visible while it is active (all scenes share one canvas). */
export function SceneGroup({ index, children }: { index: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.visible = store.active === index || store.forceVisible
  })
  return (
    <group ref={ref} visible={index === 0}>
      {children}
    </group>
  )
}

/** Particle count scaler: fewer particles on mobile. */
export const count = (n: number) => (store.mobile ? Math.ceil(n * 0.4) : n)
