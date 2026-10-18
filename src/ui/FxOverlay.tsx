import { useRef } from 'react'
import { store } from '../core/store'
import { useTicker } from '../core/useTicker'

/**
 * Fixed full-screen DOM effects, all driven from `store` every frame (no React re-renders):
 *  veil (fade-through between scenes) · white flash · warm storm flare · hand over the eyes ·
 *  the crack across the screen (broken foot) that fills with golden light.
 */
export function FxOverlay() {
  const veil = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const flare = useRef<HTMLDivElement>(null)
  const hand = useRef<HTMLDivElement>(null)
  const handBlack = useRef<HTMLDivElement>(null)
  const crack = useRef<SVGSVGElement>(null)
  const crackMain = useRef<SVGGElement>(null)
  const crackGlow = useRef<SVGGElement>(null)

  useTicker(() => {
    const f = store.fx
    if (veil.current) {
      veil.current.style.opacity = String(Math.min(1, store.veil * 1.05))
      veil.current.style.background = store.veilColor
    }
    if (flash.current) flash.current.style.opacity = String(f.flash)
    if (flare.current) flare.current.style.opacity = String(f.flare)
    if (hand.current) {
      const h = f.hand
      hand.current.style.opacity = h > 0.001 ? '1' : '0'
      const x = -105 + h * 105 // % of its own width
      hand.current.style.transform = `translate3d(${x}%, ${(1 - h) * 8}%, 0) rotate(${(1 - h) * -14}deg) scale(${1.05 + (1 - h) * 0.1})`
      if (handBlack.current) handBlack.current.style.opacity = String(Math.max(0, (h - 0.82) / 0.18))
    }
    if (crack.current) {
      const visible = f.crack > 0.002 && store.active === 10
      crack.current.style.opacity = visible ? '1' : '0'
      if (crackMain.current) {
        crackMain.current.querySelectorAll('path').forEach((p) => {
          ;(p as SVGPathElement).style.strokeDashoffset = String(1 - f.crack)
        })
        crackMain.current.style.opacity = String(1 - f.heal * 0.35)
      }
      if (crackGlow.current) {
        crackGlow.current.style.opacity = String(f.heal)
        crackGlow.current.querySelectorAll('path').forEach((p) => {
          ;(p as SVGPathElement).style.strokeDashoffset = String(1 - Math.min(1, f.heal * 1.15))
        })
      }
    }
  })

  return (
    <div className="fx" aria-hidden="true">
      <div ref={flare} className="fx-flare" />
      <svg ref={crack} className="fx-crack" viewBox="0 0 1000 600" preserveAspectRatio="none">
        <defs>
          <filter id="glowf" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g ref={crackMain} fill="none" stroke="#f4f1ea" strokeWidth="2.2" strokeLinejoin="miter">
          <path pathLength="1" strokeDasharray="1" d="M-10 90 L120 130 L170 105 L290 200 L330 180 L450 300 L520 285 L610 380 L690 360 L790 470 L850 455 L1010 590" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="1.3" d="M290 200 L270 290 L310 330" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="1.3" d="M450 300 L420 400 L470 450" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="1.3" d="M610 380 L650 270 L720 240" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="1.1" d="M790 470 L760 540" />
        </g>
        <g ref={crackGlow} fill="none" stroke="var(--accent-2)" strokeWidth="4" filter="url(#glowf)" style={{ opacity: 0 }}>
          <path pathLength="1" strokeDasharray="1" d="M-10 90 L120 130 L170 105 L290 200 L330 180 L450 300 L520 285 L610 380 L690 360 L790 470 L850 455 L1010 590" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="2.5" d="M290 200 L270 290 L310 330" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="2.5" d="M450 300 L420 400 L470 450" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="2.5" d="M610 380 L650 270 L720 240" />
          <path pathLength="1" strokeDasharray="1" strokeWidth="2" d="M790 470 L760 540" />
        </g>
      </svg>
      <div ref={hand} className="fx-hand" style={{ opacity: 0 }}>
        {/* A stylised silhouette of a hand: dad covering my eyes */}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="handg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#06070c" />
              <stop offset="1" stopColor="#000" />
            </linearGradient>
            <filter id="handsoft"><feGaussianBlur stdDeviation="2.5" /></filter>
          </defs>
          <g fill="url(#handg)" stroke="rgba(120,150,255,.55)" strokeWidth="5" filter="url(#handsoft)">
            <rect x="300" y="430" width="420" height="640" rx="170" />
            <rect x="305" y="130" width="86" height="400" rx="43" />
            <rect x="405" y="60" width="90" height="470" rx="45" />
            <rect x="509" y="105" width="88" height="430" rx="44" />
            <rect x="610" y="205" width="80" height="340" rx="40" />
            <rect x="190" y="470" width="92" height="330" rx="46" transform="rotate(-38 236 640)" />
          </g>
        </svg>
        <div ref={handBlack} className="fx-hand-black" />
      </div>
      <div ref={flash} className="fx-flash" />
      <div ref={veil} className="fx-veil" />
    </div>
  )
}
