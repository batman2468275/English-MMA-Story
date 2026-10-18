import { chapters } from '../content/story'
import { SectionShell } from './SectionShell'
import { ScrubText } from '../ui/ScrubText'

/**
 * Generic text chapter: layered background (giant outlined word, chapter number, light rays, HUD corners),
 * a legibility scrim and the scrubbed copy. The 3D subject is composed on the opposite side of the screen
 * (see `setCam` in scene/camera.ts), so the text column and the scene balance each other. Used by most sections.
 */
export function Chapter({ index }: { index: number }) {
  const c = chapters[index]
  return (
    <SectionShell index={index}>
      <div className="layer bgword" data-speed="0.55" aria-hidden="true">
        <span>{c.bgWord}</span>
      </div>
      <div className="layer bignum" data-speed="-0.35" aria-hidden="true">{c.num}</div>
      <div className="layer rays" data-speed="0.2" aria-hidden="true" />
      <div className={`layer scrim scrim-${c.side}`} aria-hidden="true" />
      <div className="layer hud" data-speed="-0.15" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="vlabel">{c.title}</span>
      </div>
      <div className={`copy copy-${c.side}`}>
        <ScrubText
          text={c.text ?? ''}
          variant={c.variant}
          header={
            <>
              <span className="eyebrow"><i />{c.num} / 14 — {c.title}</span>
              <h2 className="chapter-title">{c.title}</h2>
            </>
          }
        />
      </div>
    </SectionShell>
  )
}
