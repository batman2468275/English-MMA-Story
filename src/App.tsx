import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { store } from './core/store'
import { initScroll, unlockScroll, measure } from './core/scroll'
import { chapters } from './content/story'
import { Loader } from './ui/Loader'
import { Cursor } from './ui/Cursor'
import { ProgressFence } from './ui/ProgressFence'
import { AudioToggle } from './ui/AudioToggle'
import { FxOverlay } from './ui/FxOverlay'
import { Chapter } from './sections/Chapter'
import { HeroSection } from './sections/Hero'
import { StormSection } from './sections/Storm'
import { TimelineSection } from './sections/Timeline'
import { NowSection } from './sections/Now'

// The 3D experience (three.js is big) is split into its own chunk and loaded behind the loading screen.
const Experience = lazy(() => import('./scene/Experience'))

function renderSection(i: number) {
  switch (chapters[i].id) {
    case 'hero': return <HeroSection key={i} />
    case 'storm': return <StormSection key={i} />
    case 'timeline': return <TimelineSection key={i} />
    case 'now': return <NowSection key={i} />
    default: return <Chapter key={i} index={i} />
  }
}

export default function App() {
  const [ready, setReady] = useState(store.reduced)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => initScroll(), [])

  const onReady = useCallback(() => {
    store.ready = true
    setReady(true)
  }, [])

  const onDone = useCallback(() => {
    store.introStart = performance.now() / 1000
    setLoaded(true)
    document.documentElement.dataset.loaded = '1'
    measure()
    ScrollTrigger.refresh()
    unlockScroll()
    window.dispatchEvent(new Event('mma:loaded'))
  }, [])

  useEffect(() => {
    // reduced-motion / no-WebGL: there is no 3D to wait for — show the page as soon as the fonts are in
    if (store.reduced) {
      const go = () => {
        onReady()
        onDone()
      }
      if (document.fonts?.ready) document.fonts.ready.then(go)
      else go()
    }
  }, [onReady, onDone])

  return (
    <>
      {!store.reduced && (
        <Suspense fallback={null}>
          <Experience onReady={onReady} />
        </Suspense>
      )}
      <main className={`story ${loaded ? 'is-loaded' : ''}`}>{chapters.map((_, i) => renderSection(i))}</main>
      {!store.reduced && <FxOverlay />}
      {!store.reduced && <ProgressFence />}
      {!store.reduced && <AudioToggle />}
      <Cursor />
      {!store.reduced && <Loader ready={ready} onDone={onDone} />}
    </>
  )
}
