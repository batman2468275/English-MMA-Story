import { useRef } from 'react'
import { SectionShell } from './SectionShell'
import { milestones, milestoneP, indexOf } from '../content/story'
import { store } from '../core/store'
import { smooth } from '../core/math'
import { useTicker } from '../core/useTicker'

const I = indexOf('timeline')

/**
 * 13 — THEN → NOW (DOM layer). Each milestone card and rail dot lights up as the camera
 * (scroll progress) reaches its node on the glowing 3D path.
 */
export function TimelineSection() {
  const cards = useRef<(HTMLElement | null)[]>([])
  const dots = useRef<(HTMLElement | null)[]>([])
  const fill = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)

  useTicker(() => {
    if (store.reduced) return
    const p = store.local[I]
    milestones.forEach((_, i) => {
      const c = milestoneP[i]
      const last = i === milestones.length - 1
      const vis = smooth(c - 0.095, c - 0.045, p) * (last ? 1 : 1 - smooth(c + 0.05, c + 0.1, p))
      const el = cards.current[i]
      if (el) {
        el.style.opacity = String(vis)
        el.style.transform = `translate3d(0, ${(1 - vis) * 40}px, 0) scale(${0.94 + 0.06 * vis})`
        el.style.pointerEvents = vis > 0.5 ? 'auto' : 'none'
      }
      const d = dots.current[i]
      if (d) d.dataset.lit = p >= c - 0.03 ? '1' : '0'
    })
    const prog = smooth(milestoneP[0] - 0.08, milestoneP[milestoneP.length - 1] + 0.03, p)
    if (fill.current) fill.current.style.transform = `scaleX(${prog})`
    if (head.current) head.current.style.opacity = String(1 - smooth(0.05, 0.11, p))
  })

  return (
    <SectionShell index={I}>
      <div className="layer bgword" data-speed="0.4" aria-hidden="true"><span>THEN → NOW</span></div>
      <div className="layer hud" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="vlabel">Then to Now</span>
      </div>
      <div ref={head} className="tl-head">
        <span className="eyebrow"><i />13 / 14 — Then to Now</span>
        <h2 className="chapter-title">Then to Now</h2>
      </div>

      {milestones.map((m, i) => (
        <article
          key={i}
          ref={(el) => (cards.current[i] = el)}
          className={`tl-card ${i % 2 ? 'tl-right' : 'tl-left'}`}
          style={{ opacity: 0 }}
        >
          <span className="tl-when">{m.when}</span>
          <h3>{m.title}</h3>
          <p>{m.body}</p>
        </article>
      ))}

      <div className="tl-rail" aria-hidden="true">
        <div className="tl-line"><div ref={fill} className="tl-fill" /></div>
        {milestones.map((m, i) => (
          <div key={i} ref={(el) => (dots.current[i] = el)} className="tl-dot" data-lit="0" style={{ left: `${8 + i * 21}%` }}>
            <i />
            <span>{m.when}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
