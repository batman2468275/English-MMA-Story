import { chapters, closing, indexOf } from '../content/story'
import { SectionShell } from './SectionShell'
import { ScrubText } from '../ui/ScrubText'
import { store, pinnedProgress } from '../core/store'
import { useRef } from 'react'
import { smooth } from '../core/math'
import { useTicker } from '../core/useTicker'

const I = indexOf('now')

/** 14 — NOW (closing): the final words, then "This is just the beginning." as a glowing closing statement (no link). */
export function NowSection() {
  const c = chapters[I]
  const line = useRef<HTMLDivElement>(null)

  // the closing line arrives late in the section, as the music swells and the camera clears the cage
  useTicker(() => {
    if (store.reduced || !line.current) return
    const v = smooth(0.5, 0.72, pinnedProgress(I))
    line.current.style.opacity = String(v)
    line.current.style.transform = `translate3d(0, ${(1 - v) * 30}px, 0) scale(${0.94 + 0.06 * v})`
  })

  return (
    <SectionShell index={I}>
      <div className="layer bgword" data-speed="0.5" aria-hidden="true"><span>{c.bgWord}</span></div>
      <div className="layer rays rays-soft" data-speed="0.2" aria-hidden="true" />
      <div className="layer scrim scrim-center" aria-hidden="true" />
      <div className="layer hud" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="vlabel">Now</span>
      </div>
      <div className="copy copy-center now-copy">
        <ScrubText
          text={c.text ?? ''}
          variant={c.variant}
          noExit
          header={<span className="eyebrow"><i />14 / 14 — Now</span>}
        />
        <div ref={line} className="closing-line">
          <span className="closing-rule" aria-hidden="true" />
          <p>{closing.line}</p>
          <span className="closing-rule" aria-hidden="true" />
        </div>
      </div>
    </SectionShell>
  )
}
