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

/**
 * ?debug — an on-screen readout (build, renderer, pipeline, device detection) plus layer switches, so a screenshot
 * says exactly what a device runs and tapping a switch shows which layer a visual artefact comes from.
 */
function DebugPanel() {
  const { gl, scene, setDpr } = useThree()
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    const gpu = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    const root = document.createElement('div')
    root.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;max-width:92vw;padding:6px 9px;background:rgba(0,0,0,.82);color:#9f9;font:11px/1.45 monospace;border-radius:6px'
    const info = document.createElement('div')
    info.textContent = `build ${__BUILD__} | ${store.mobile ? 'touch pipeline (direct)' : 'desktop pipeline (post)'} | dpr ${gl.getPixelRatio().toFixed(2)} | ${store.detect} | ${gpu}`
    root.appendChild(info)
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px'
    root.appendChild(row)

    // layer switches (each hides one family of things; "hidden" = the layer is off)
    const off: Record<string, boolean> = {}
    const maps = new WeakMap<object, Record<string, unknown>>()
    const fog = scene.fog
    const MAP_KEYS = ['map', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap']
    const apply = () => {
      scene.fog = off.fog ? null : fog
      scene.traverse((o) => {
        const a = o as unknown as { isPoints?: boolean; isSprite?: boolean; isLine?: boolean; material?: unknown; userData: Record<string, unknown> }
        if (a.userData.__vis === undefined) a.userData.__vis = o.visible
        const mats = (Array.isArray(a.material) ? a.material : a.material ? [a.material] : []) as Array<Record<string, unknown> & { blending?: number; needsUpdate?: boolean }>
        let hide = false
        if (off.points && a.isPoints) hide = true
        if (off.sprites && a.isSprite) hide = true
        if (off.additive && mats.some((m) => m.blending === 2)) hide = true
        if (off.lines && a.isLine) hide = true
        // only touch objects this panel hid itself; everything else keeps whatever the scene set
        if (hide) {
          if (!a.userData.__hid) { a.userData.__hid = true; a.userData.__was = o.visible }
          o.visible = false
        } else if (a.userData.__hid) {
          a.userData.__hid = false
          o.visible = a.userData.__was as boolean
        }
        for (const m of mats) {
          const saved = maps.get(m) ?? {}
          for (const k of MAP_KEYS) {
            if (off.textures) {
              if (m[k]) { saved[k] = m[k]; m[k] = null; m.needsUpdate = true }
            } else if (saved[k]) { m[k] = saved[k]; delete saved[k]; m.needsUpdate = true }
          }
          maps.set(m, saved)
        }
      })
    }
    const switches: Array<[string, string]> = [
      ['points', 'dust/embers'],
      ['sprites', 'glow sprites'],
      ['additive', 'additive layers'],
      ['lines', 'lines'],
      ['textures', 'textures'],
      ['fog', 'fog'],
      ['css', 'page overlays'],
      ['dpr1', 'pixel ratio 1'],
    ]
    const timer = window.setInterval(() => { if (Object.values(off).some(Boolean)) apply() }, 400)
    for (const [key, label] of switches) {
      const b = document.createElement('button')
      const paint = () => { b.textContent = `${label}: ${off[key] ? 'OFF' : 'on'}`; b.style.background = off[key] ? '#7a1020' : '#123' }
      b.style.cssText = 'font:11px monospace;color:#fff;border:1px solid #567;border-radius:5px;padding:4px 7px'
      paint()
      b.onclick = () => {
        off[key] = !off[key]
        paint()
        if (key === 'css') document.documentElement.classList.toggle('dbg-no-overlays', !!off[key])
        else if (key === 'dpr1') setDpr(off[key] ? 1 : Math.min(window.devicePixelRatio, 1.75))
        else apply()
      }
      row.appendChild(b)
    }
    document.body.appendChild(root)
    return () => { window.clearInterval(timer); root.remove() }
  }, [gl, scene, setDpr])
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
  const [dpr, setDpr] = useState<number>(mobile ? Math.min(Math.max(window.devicePixelRatio, 1), 1.75) : 1.6)
  return (
    <div className="stage" aria-hidden="true">
      <Canvas
        dpr={store.lite ? 0.7 : dpr}
        camera={{ fov: 55, near: 0.1, far: 500, position: [0, 2, 12] }}
        // phones/tablets render straight to the screen (real MSAA, no post-processing buffers); desktops keep the full post chain
        flat={mobile}
        gl={{ antialias: mobile && !store.lite, powerPreference: 'high-performance', alpha: false, stencil: false }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(0.85, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(mobile ? 1.75 : 2, d + 0.15))}
        />
        <FrameClock />
        <DebugPanel />
        <Suspense fallback={null}>
          <Scenes />
          <Rig />
          {!mobile && <Post />}
          <Precompile onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  )
}
