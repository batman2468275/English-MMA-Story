import { photos, SHOW_EMPTY_PLACEHOLDERS } from '../content/photos'

/**
 * [PHOTO PLACEHOLDER] — a polaroid-style frame.
 * Set the image path for `slot` in src/content/photos.ts and it replaces the dashed placeholder automatically.
 */
export function PhotoSlot({ slot, side, tilt = -3 }: { slot: string; side: 'left' | 'right'; tilt?: number }) {
  const p = photos[slot]
  if (!p) return null
  if (!p.src && !SHOW_EMPTY_PLACEHOLDERS) return null
  return (
    <figure className={`photo photo-${side}`} style={{ ['--tilt' as string]: `${tilt}deg` }} data-speed="0.35">
      <div className="photo-frame">
        {p.src ? (
          <img src={p.src} alt={p.caption} loading="lazy" />
        ) : (
          <div className="photo-empty" role="img" aria-label={`Photo placeholder: ${p.caption}`}>
            <span>[PHOTO PLACEHOLDER]</span>
          </div>
        )}
      </div>
      <figcaption>{p.caption}</figcaption>
    </figure>
  )
}
