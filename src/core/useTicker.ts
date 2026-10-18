import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/** Run `fn` on every animation frame (GSAP's shared ticker) without causing React renders. */
export function useTicker(fn: (time: number) => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const f = (t: number) => ref.current(t)
    gsap.ticker.add(f)
    return () => {
      gsap.ticker.remove(f)
    }
  }, [])
}
