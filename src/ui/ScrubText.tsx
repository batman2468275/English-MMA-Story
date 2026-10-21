import { Fragment, useLayoutEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { TextVariant } from '../content/story'
import { useSection, textWindow } from '../sections/SectionShell'
import { store } from '../core/store'

gsap.registerPlugin(ScrollTrigger)

/**
 * Scroll-scrubbed text. The paragraph is split into words / characters / sentences (rendered by React, so it
 * is fully accessible and SSR-safe) and revealed by a GSAP timeline whose playhead is the scroll position.
 * Scrolling back up un-reveals the text. Each chapter uses a different `variant`:
 *   chars  – character-by-character light-up         slide  – words rise out of a mask
 *   blur   – blur-fade per word                      mask   – sentence mask-wipe
 *   words  – calm word-by-word fade                  scale  – sentences scale in
 *   rotate – 3D flip of each sentence
 */
const sentences = (t: string) => t.match(/[^.!?]+[.!?]+['’”]?\s*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [t]

export function ScrubText({
  text,
  variant,
  className = '',
  header,
  noExit = false,
}: {
  text: string
  variant: TextVariant
  className?: string
  header?: React.ReactNode
  /** keep the text on screen once revealed (used by the final chapter) */
  noExit?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const { index, el } = useSection()

  const content = useMemo(() => {
    const words = (t: string, perChar: boolean, mask: boolean) =>
      t.split(' ').map((w, i, arr) => (
        <Fragment key={i}>
          <span className={mask ? 'w mask' : 'w'}>
            <span className="wi">
              {perChar ? w.split('').map((ch, k) => <span key={k} className="ch">{ch}</span>) : w}
            </span>
          </span>
          {i < arr.length - 1 ? ' ' : ''}
        </Fragment>
      ))
    switch (variant) {
      case 'chars':
        return <p className="para">{words(text, true, false)}</p>
      case 'slide':
        return <p className="para">{words(text, false, true)}</p>
      case 'blur':
      case 'words':
        return <p className="para">{words(text, false, false)}</p>
      case 'mask':
      case 'scale':
      case 'rotate':
        return (
          <p className="para sentences">
            {sentences(text).map((s, i) => (
              <span key={i} className="sent">{s}{' '}</span>
            ))}
          </p>
        )
    }
  }, [text, variant])

  useLayoutEffect(() => {
    const host = root.current
    const section = el.current
    if (!host || !section || store.reduced) return

    const ctx = gsap.context(() => {
      const q = (s: string) => host.querySelectorAll<HTMLElement>(s)
      const w = textWindow(section)
      const total = w.outEnd - w.inStart
      const a = (w.inEnd - w.inStart) / total
      const b = (w.outStart - w.inStart) / total

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: () => textWindow(section).inStart,
          end: () => textWindow(section).outEnd,
          scrub: 0.5,
          invalidateOnRefresh: true,
        },
      })
      tl.set({}, {}, 1) // timeline length = 1
      tl.fromTo(host, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: a * 0.18 }, 0)

      const targets = (s: string) => Array.from(q(s))

      switch (variant) {
        case 'slide': {
          const t = targets('.wi')
          tl.fromTo(t, { yPercent: 115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: a * 0.2, stagger: { amount: a * 0.8 } }, 0)
          break
        }
        case 'blur': {
          const t = targets('.w')
          tl.fromTo(t, store.mobile ? { opacity: 0, y: 14 } : { opacity: 0, filter: 'blur(14px)', y: 14 }, store.mobile ? { opacity: 1, y: 0, duration: a * 0.22, stagger: { amount: a * 0.78 } } : { opacity: 1, filter: 'blur(0px)', y: 0, duration: a * 0.22, stagger: { amount: a * 0.78 } }, 0)
          break
        }
        case 'chars': {
          const t = targets('.ch')
          tl.fromTo(t, { opacity: 0.08 }, { opacity: 1, duration: a * 0.1, stagger: { amount: a * 0.9 } }, 0)
          break
        }
        case 'words': {
          const t = targets('.w')
          tl.fromTo(t, { opacity: 0.0, y: 6 }, { opacity: 1, y: 0, duration: a * 0.18, stagger: { amount: a * 0.82 } }, 0)
          break
        }
        case 'mask': {
          const t = targets('.sent')
          tl.fromTo(t, { clipPath: 'inset(0 100% 0 0)', x: -24 }, { clipPath: 'inset(0 0% 0 0)', x: 0, duration: a * 0.3, stagger: { amount: a * 0.7 } }, 0)
          break
        }
        case 'scale': {
          const t = targets('.sent')
          tl.fromTo(t, store.mobile ? { scale: 1.5, opacity: 0, transformOrigin: '0% 50%' } : { scale: 1.5, opacity: 0, filter: 'blur(8px)', transformOrigin: '0% 50%' }, store.mobile ? { scale: 1, opacity: 1, duration: a * 0.3, stagger: { amount: a * 0.7 } } : { scale: 1, opacity: 1, filter: 'blur(0px)', duration: a * 0.3, stagger: { amount: a * 0.7 } }, 0)
          break
        }
        case 'rotate': {
          const t = targets('.sent')
          tl.fromTo(
            t,
            { rotationX: -85, yPercent: 40, opacity: 0, transformPerspective: 700, transformOrigin: '50% 100%' },
            { rotationX: 0, yPercent: 0, opacity: 1, duration: a * 0.3, stagger: { amount: a * 0.7 } },
            0,
          )
          break
        }
      }
      // exit
      if (!noExit) tl.to(host, store.mobile ? { opacity: 0, y: -50, duration: 1 - b } : { opacity: 0, y: -50, filter: 'blur(6px)', duration: 1 - b }, b)
    }, host)
    return () => ctx.revert()
  }, [variant, index, el, text, noExit])

  return (
    <div ref={root} className={`scrub ${className}`} data-variant={variant}>
      {header}
      {content}
    </div>
  )
}
