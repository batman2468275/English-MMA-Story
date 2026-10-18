import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SectionShell } from './SectionShell'
import { hero } from '../content/story'
import { store } from '../core/store'

gsap.registerPlugin(ScrollTrigger)

/** 01 — HERO DOM: title (character-by-character), subhead, scroll cue. */
export function HeroSection() {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (store.reduced || !root.current) return
    const host = root.current
    const ctx = gsap.context(() => {
      gsap.set('.hero-ch', { opacity: 0, yPercent: 60, filter: 'blur(10px)' })
      gsap.set('.hero-sub, .hero-cue', { opacity: 0, y: 20 })

      const intro = () => {
        gsap
          .timeline({ delay: 0.5 })
          .to('.hero-ch', { opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', stagger: 0.035 })
          .to('.hero-sub', { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, '-=0.5')
          .to('.hero-cue', { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, '-=0.6')
      }
      if (store.ready && document.documentElement.dataset.loaded) intro()
      else window.addEventListener('mma:loaded', intro, { once: true })

      // scroll-scrubbed outro (reversible)
      gsap.to(host, {
        opacity: 0,
        y: -80,
        filter: 'blur(8px)',
        ease: 'none',
        scrollTrigger: {
          trigger: host.closest('section'),
          start: () => 'top+=' + window.innerHeight * 0.25 + ' top',
          end: () => 'top+=' + window.innerHeight * 0.9 + ' top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
    }, host)
    return () => ctx.revert()
  }, [])

  return (
    <SectionShell index={0}>
      <div className="layer bgword hero-bgword" data-speed="0.4" aria-hidden="true"><span>UFC 317</span></div>
      <div className="layer rays" data-speed="0.2" aria-hidden="true" />
      <div className="layer scrim scrim-bottom" aria-hidden="true" />
      <div className="layer hud" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
      </div>
      <div ref={root} className="hero-copy">
        <span className="eyebrow"><i />A true story · 01 / 14</span>
        <h1 className="hero-title" aria-label={hero.titleLines.join(' ')}>
          {hero.titleLines.map((line, li) => (
            <span key={li} className={`hero-line ${li === hero.titleLines.length - 1 ? 'hero-line-last' : ''}`} aria-hidden="true">
              {line.split('').map((ch, i) => (
                <span key={i} className="hero-ch">{ch === ' ' ? ' ' : ch}</span>
              ))}
            </span>
          ))}
        </h1>
        <p className="hero-sub">{hero.subhead}</p>
        <div className="hero-cue" aria-hidden="true">
          <span className="cue-line" />
          <span>{hero.cue}</span>
        </div>
      </div>
    </SectionShell>
  )
}
