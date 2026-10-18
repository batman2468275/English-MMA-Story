/**
 * TEMPORARY REVIEW SCAFFOLDING — remove once the experimental score is adopted or discarded.
 *
 * Picks which audio engine the site uses:
 *   • normal visit (no query)              → ./engine.ts            (the live score, completely unchanged)
 *   • visit with  ?music=experimental       → ./engine.experimental.ts (draft score for listening review)
 *
 * To remove: delete this file and change the one import in src/ui/AudioToggle.tsx back to '../audio/engine'
 * (or, to adopt the draft, replace engine.ts with engine.experimental.ts and do the same).
 */
import * as live from './engine'
import * as experimental from './engine.experimental'

const useExperimental = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('music') === 'experimental'
const impl = useExperimental ? experimental : live

export const audio = impl.audio
export const wireAudio = impl.wireAudio
