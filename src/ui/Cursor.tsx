import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/** Glowing ring cursor that trails the pointer and expands over interactive elements. Hidden on touch devices. */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    document.documentElement.classList.add('has-cursor')
    const rx = gsap.quickTo(ring.current, 'x', { duration: 0.35, ease: 'power3.out' })
    const ry = gsap.quickTo(ring.current, 'y', { duration: 0.35, ease: 'power3.out' })
    const dx = gsap.quickTo(dot.current, 'x', { duration: 0.08, ease: 'none' })
    const dy = gsap.quickTo(dot.current, 'y', { duration: 0.08, ease: 'none' })
    const move = (e: PointerEvent) => {
      rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY)
    }
    const over = (e: Event) => {
      const t = e.target as HTMLElement | null
      const hot = !!t?.closest?.('a, button, [data-hover], [data-magnetic]')
      ring.current?.classList.toggle('is-hover', hot)
    }
    const down = () => ring.current?.classList.add('is-down')
    const up = () => ring.current?.classList.remove('is-down')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      document.documentElement.classList.remove('has-cursor')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  )
}
