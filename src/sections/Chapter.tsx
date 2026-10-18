import { chapters } from '../content/story'
import { SectionShell } from './SectionShell'
import { ScrubText } from '../ui/ScrubText'
import { PhotoSlot } from '../ui/PhotoSlot'

/** Which chapters carry a [PHOTO PLACEHOLDER] frame (and on which side). */
const photoFor: Record<string, { slot: string; tilt: number }> = {
  driveway: { slot: 'driveway', tilt: 3 },
  basement: { slot: 'basement', tilt: -4 },
  gym: { slot: 'gym', tilt: 4 },
  mma: { slot: 'mma', tilt: -3 },
}

/**
 * Generic text chapter: layered background (giant outlined word, chapter number, light rays, HUD corners),
 * a legibility scrim, the scrubbed copy and an optional photo frame. Used by most sections.
 */
export function Chapter({ index }: { index: number }) {
  const c = chapters[index]
  const photo = photoFor[c.id]
  const opposite = c.side === 'left' ? 'right' : 'left'
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
      {photo && <PhotoSlot slot={photo.slot} side={opposite === 'left' ? 'left' : 'right'} tilt={photo.tilt} />}
    </SectionShell>
  )
}
