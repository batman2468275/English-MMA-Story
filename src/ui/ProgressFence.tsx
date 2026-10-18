import { useRef } from 'react'
import { store } from '../core/store'
import { useTicker } from '../core/useTicker'
import { chapters, N } from '../content/story'
import { getLenis } from '../core/scroll'

/** Scroll progress indicator along the right edge, styled as a chain-link cage fence that fills with accent light. */
export function ProgressFence() {
  const fill = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const ticks = useRef<(HTMLButtonElement | null)[]>([])

  useTicker(() => {
    const g = store.global
    if (fill.current) fill.current.style.transform = `scaleY(${g})`
    if (head.current) head.current.style.top = `${g * 100}%`
    ticks.current.forEach((t, i) => {
      if (t) t.dataset.on = store.active === i ? '1' : store.active > i ? 'p' : '0'
    })
  })

  const total = chapters.reduce((a, c) => a + c.height, 0)
  let acc = 0
  const positions = chapters.map((c) => {
    const pos = acc / total
    acc += c.height
    return pos
  })

  return (
    <nav className="fence" aria-label="Story progress">
      <div className="fence-mesh" />
      <div className="fence-fill-wrap">
        <div ref={fill} className="fence-fill" />
      </div>
      <div ref={head} className="fence-head" />
      {positions.map((p, i) => (
        <button
          key={i}
          ref={(el) => (ticks.current[i] = el)}
          className="fence-tick"
          style={{ top: `${p * 100}%` }}
          aria-label={`Jump to ${chapters[i].title}`}
          data-hover
          onClick={() => {
            const el = document.getElementById(chapters[i].id)
            if (!el) return
            const y = el.getBoundingClientRect().top + window.scrollY
            const l = getLenis()
            if (l) l.scrollTo(y, { duration: 2.2 })
            else window.scrollTo({ top: y })
          }}
        >
          <span>{chapters[i].num}</span>
        </button>
      ))}
      <span className="sr-only">{N} chapters</span>
    </nav>
  )
}
