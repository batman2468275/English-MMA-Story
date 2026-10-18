import { chapters, closing, indexOf } from '../content/story'
import { SectionShell } from './SectionShell'
import { ScrubText } from '../ui/ScrubText'
import { MagneticButton } from '../ui/MagneticButton'
import { PhotoSlot } from '../ui/PhotoSlot'
import { store, pinnedProgress } from '../core/store'
import { useRef } from 'react'
import { smooth } from '../core/math'
import { useTicker } from '../core/useTicker'

const I = indexOf('now')

/** 14 — NOW (closing): final words and the "This is just the beginning." call to action. */
export function NowSection() {
  const c = chapters[I]
  const cta = useRef<HTMLDivElement>(null)

  // the button arrives late in the section as the camera clears the cage
  useTicker(() => {
    if (store.reduced || !cta.current) return
    const p = pinnedProgress(I)
    const v = smooth(0.5, 0.72, p)
    cta.current.style.opacity = String(v)
    cta.current.style.transform = `translate3d(0, ${(1 - v) * 40}px, 0)`
    cta.current.style.pointerEvents = v > 0.6 ? 'auto' : 'none'
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
        <div ref={cta} className="cta-wrap">
          {/* [CONTACT PLACEHOLDER] set closing.ctaHref in src/content/story.ts to your real link */}
          <MagneticButton href={closing.ctaHref} className="cta">{closing.cta}</MagneticButton>
        </div>
      </div>
      <PhotoSlot slot="now" side="right" tilt={3} />
    </SectionShell>
  )
}
