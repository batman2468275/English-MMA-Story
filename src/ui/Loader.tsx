import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

/**
 * Loading screen with a progress indicator. Progress is the real state of the page:
 * fonts loaded + 3D shaders compiled (`ready`), with a minimum on-screen time so it never flashes.
 */
export function Loader({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [pct, setPct] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const shown = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    const skip = new URLSearchParams(location.search).has('skipcompile')
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000
      const timeFloor = Math.min(0.9, elapsed / 2.4) // creeps up to 90% on its own
      if (skip) shown.current = 1 // dev shortcut (?skipcompile): no waiting
      const target = ready ? 1 : timeFloor
      shown.current += (target - shown.current) * 0.08
      if (ready && (skip || elapsed > 1.4) && shown.current > 0.985 && !done.current) {
        done.current = true
        setPct(100)
        gsap.to(root.current, {
          opacity: 0,
          duration: 0.9,
          ease: 'power2.inOut',
          onComplete: () => {
            if (root.current) root.current.style.display = 'none'
            onDone()
          },
        })
        return
      }
      setPct(Math.round(shown.current * 100))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div ref={root} className="loader" role="status" aria-live="polite">
      <svg className="loader-oct" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="35,5 65,5 95,35 95,65 65,95 35,95 5,65 5,35" pathLength="100" style={{ strokeDashoffset: 100 - pct }} />
      </svg>
      <div className="loader-pct">{pct}<small>%</small></div>
      <div className="loader-label">Loading the fight night…</div>
    </div>
  )
}
