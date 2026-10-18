import { Fragment, useRef } from 'react'
import { SectionShell } from './SectionShell'
import { stormFragments, stormKeyLine, indexOf } from '../content/story'
import { store } from '../core/store'
import { smooth } from '../core/math'
import { useTicker } from '../core/useTicker'
import { STORM_GRAB } from '../core/fx'

const I = indexOf('storm')

/**
 * 05 — THE STORM (DOM layer). Fragments of text drift through the scene and the key line appears
 * at beat 3. Everything here is a pure function of the storm's scroll progress, so it scrubs both ways.
 */
export function StormSection() {
  const frags = useRef<(HTMLParagraphElement | null)[]>([])
  const key = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLSpanElement | null)[]>([])
  const beat = useRef<HTMLDivElement>(null)

  useTicker(() => {
    const p = store.local[I]
    if (store.reduced) return
    stormFragments.forEach((f, i) => {
      const el = frags.current[i]
      if (!el) return
      const span = f.p1 - f.p0
      const o = smooth(f.p0, f.p0 + span * 0.28, p) * (1 - smooth(f.p0 + span * 0.7, f.p1, p))
      const mid = (p - (f.p0 + f.p1) / 2) / span
      el.style.opacity = String(o)
      el.style.transform = `translate3d(${f.drift * mid * 220}px, ${-mid * 60}px, 0)`
      el.style.filter = o < 0.98 ? `blur(${(1 - o) * 9}px)` : 'none'
    })
    // key line
    const { p0, p1 } = stormKeyLine
    const vis = smooth(p0 - 0.005, p0 + 0.03, p) * (1 - smooth(p1 - 0.04, p1, p))
    if (key.current) {
      key.current.style.opacity = String(vis)
      key.current.style.transform = `translate3d(0, ${(1 - vis) * 30}px, 0) scale(${0.96 + 0.04 * vis})`
    }
    words.current.forEach((w, i) => {
      if (!w) return
      const a = p0 + i * 0.006
      w.style.opacity = String(0.1 + 0.9 * smooth(a, a + 0.012, p))
    })
    if (key.current) key.current.dataset.on = p >= STORM_GRAB ? '1' : '0'
    // beat captions
    if (beat.current) {
      const t = p < 0.2 ? 'I' : p < 0.6 ? 'II' : p < STORM_GRAB ? 'III' : p < 0.8 ? 'IV' : 'V'
      beat.current.textContent = t
    }
  })

  const kw = (stormKeyLine.before.trim().split(' ')).concat(stormKeyLine.hot.split(' ')).concat(stormKeyLine.after.trim().split(' '))
  const hotStart = stormKeyLine.before.trim().split(' ').length
  const hotLen = stormKeyLine.hot.split(' ').length

  return (
    <SectionShell index={I}>
      <div className="layer bgword storm-word" data-speed="0.5" aria-hidden="true"><span>STORM</span></div>
      <div className="layer hud" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="vlabel">The Storm</span>
        <div className="beat" aria-hidden="true"><small>BEAT</small><b ref={beat}>I</b></div>
      </div>
      <span className="eyebrow storm-eyebrow"><i />05 / 14 — The Storm</span>
      <h2 className="sr-only">The Storm</h2>

      {stormFragments.map((f, i) => (
        <p key={i} ref={(el) => (frags.current[i] = el)} className="frag" style={{ left: `${f.x}%`, top: `${f.y}%`, opacity: 0 }}>
          {f.t}
        </p>
      ))}

      <div ref={key} className="keyline" style={{ opacity: 0 }}>
        <p>
          {kw.map((w, i) => {
            const isHot = i >= hotStart && i < hotStart + hotLen
            return (
              <Fragment key={i}>
                <span ref={(el) => (words.current[i] = el)} className={isHot ? 'kw hotword' : 'kw'}>
                  {w}
                </span>{' '}
              </Fragment>
            )
          })}
        </p>
      </div>
    </SectionShell>
  )
}
