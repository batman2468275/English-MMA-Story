import '@fontsource/bebas-neue/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import 'lenis/dist/lenis.css'
import './theme.css'
import './styles.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { store } from './core/store'
import App from './App'

// ---- environment detection (before anything renders) ------------------------------------------
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const forceReduced = new URLSearchParams(location.search).has('reduced')
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
})()

store.reduced = prefersReduced || forceReduced || !hasWebGL
const q = new URLSearchParams(location.search)
store.mobile = q.has('mobile')
  ? true
  : q.has('desktop')
    ? false
    : window.innerWidth <= 820 || (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches)
store.lite = q.has('lite')
document.documentElement.classList.toggle('reduced', store.reduced)
document.documentElement.classList.toggle('mobile', store.mobile)

if (import.meta.env.DEV) {
  // dev-only debugging helper: window.__go(sectionIndex, progress0to1)
  ;(window as unknown as Record<string, unknown>).__store = store
  ;(window as unknown as Record<string, unknown>).__go = (i: number, p = 0) =>
    window.scrollTo(0, store.tops[i] + p * store.heights[i])
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
