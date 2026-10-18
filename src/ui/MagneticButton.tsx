import { ReactNode, useRef } from 'react'
import { gsap } from 'gsap'

/** A link-button whose label + body are pulled toward the cursor when it gets close. */
export function MagneticButton({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const inner = useRef<HTMLSpanElement>(null)

  const move = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    gsap.to(el, { x: x * 0.35, y: y * 0.45, duration: 0.5, ease: 'power3.out' })
    gsap.to(inner.current, { x: x * 0.18, y: y * 0.25, duration: 0.5, ease: 'power3.out' })
  }
  const leave = () => {
    gsap.to([ref.current, inner.current], { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' })
  }

  return (
    <a ref={ref} href={href} className={`magnetic ${className}`} data-hover onPointerMove={move} onPointerLeave={leave}>
      <span ref={inner} className="magnetic-inner">{children}</span>
    </a>
  )
}
