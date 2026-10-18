import { createContext, ReactNode, useContext, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { chapters } from '../content/story'
import { registerSection } from '../core/scroll'
import { store } from '../core/store'

gsap.registerPlugin(ScrollTrigger)

export const SectionCtx = createContext<{ index: number; el: React.RefObject<HTMLElement> } | null>(null)
export const useSection = () => useContext(SectionCtx)!

/**
 * Every chapter is a tall <section> containing one sticky full-viewport "stage" layer.
 * The section registers itself with the scroll driver (which turns scroll into per-section progress)
 * and wires up multi-layer parallax for every descendant carrying a `data-speed` attribute
 * (positive = drifts up faster than the scroll, negative = lags behind).
 */
export function SectionShell({ index, children, className = '' }: { index: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const c = chapters[index]

  useLayoutEffect(() => {
    registerSection(index, ref.current)
    if (store.reduced || !ref.current) return
    const ctx = gsap.context(() => {
      ref.current!.querySelectorAll<HTMLElement>('[data-speed]').forEach((el) => {
        const speed = parseFloat(el.dataset.speed || '0')
        gsap.fromTo(
          el,
          { y: () => -speed * window.innerHeight * 0.55 },
          {
            y: () => speed * window.innerHeight * 0.55,
            ease: 'none',
            scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          },
        )
      })
    }, ref)
    return () => ctx.revert()
  }, [index])

  return (
    <SectionCtx.Provider value={{ index, el: ref as React.RefObject<HTMLElement> }}>
      <section
        ref={ref}
        id={c.id}
        className={`section sec-${c.id} ${className}`}
        style={{ height: `${c.height}vh` }}
        data-index={index}
        aria-label={c.title}
      >
        <div className="stick">{children}</div>
      </section>
    </SectionCtx.Provider>
  )
}

/** Scroll window (absolute px) in which this section's text reveals / leaves. */
export function textWindow(el: HTMLElement) {
  const top = el.getBoundingClientRect().top + window.scrollY
  const H = el.offsetHeight
  const vh = window.innerHeight
  const inStart = top - 0.3 * vh
  const inEnd = top + 0.85 * vh
  const outStart = top + H - 1.75 * vh
  const outEnd = top + H - 1.0 * vh
  return { inStart, inEnd, outStart: Math.max(outStart, inEnd + 0.4 * vh), outEnd: Math.max(outEnd, inEnd + 1.0 * vh) }
}
