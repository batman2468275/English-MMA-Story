import { useState } from 'react'
import { audio, wireAudio } from '../audio/engine'

/** Visible sound toggle (bottom-left). Audio is muted by default. */
export function AudioToggle() {
  const [on, setOn] = useState(false)
  return (
    <button
      className={`audio-toggle ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Turn ambient sound off' : 'Turn ambient sound on'}
      data-hover
      onClick={() => {
        wireAudio()
        const next = !on
        audio.setOn(next)
        setOn(next)
      }}
    >
      <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="audio-label">Sound {on ? 'on' : 'off'}</span>
    </button>
  )
}
