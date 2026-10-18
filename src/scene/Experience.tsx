import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Rig } from './Rig'
import { Post } from './Post'
import { Scenes } from './scenes'
import { store } from '../core/store'

/**
 * Pre-compiles every shader once (all scenes made visible for a few frames) so scene switches never hitch,
 * then reports `ready` to the loading screen. (Add ?skipcompile to the URL to skip this while developing.)
 */
function Precompile({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree()
  const frames = useRef(0)
  const started = useRef(false)

  useEffect(() => {
    if (new URLSearchParams(location.search).has('skipcompile')) {
      onReady()
      return
    }
    store.forceVisible = true
    return () => {
      store.forceVisible = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(() => {
    if (started.current || store.ready) return
    frames.current++
    if (frames.current < 3) return // let every SceneGroup flip to visible first
    started.current = true
    const done = () => {
      store.forceVisible = false
      onReady()
    }
    const compile = (gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<void> }).compileAsync
    const timeout = new Promise<void>((r) => window.setTimeout(r, 9000))
    Promise.race([compile ? compile.call(gl, scene, camera) : Promise.resolve(), timeout]).catch(() => {}).finally(done)
  })
  return null
}

function FrameClock() {
  useFrame((state) => {
    store.time = state.clock.elapsedTime
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__three = state
  })
  return null
}

/** The single fixed WebGL canvas that sits behind all of the DOM content. */
export default function Experience({ onReady }: { onReady: () => void }) {
  const mobile = store.mobile
  // adaptive resolution: if the frame rate drops, render at a lower pixel ratio; recover when it's healthy again
  const [dpr, setDpr] = useState<number>(mobile ? 1.25 : 1.6)
  return (
    <div className="stage" aria-hidden="true">
      <Canvas
        dpr={store.lite ? 0.7 : dpr}
        camera={{ fov: 55, near: 0.1, far: 500, position: [0, 2, 12] }}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(0.85, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(mobile ? 1.5 : 2, d + 0.15))}
        />
        <FrameClock />
        <Suspense fallback={null}>
          <Scenes />
          <Rig />
          <Post />
          <Precompile onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  )
}
