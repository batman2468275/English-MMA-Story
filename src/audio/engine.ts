import { store, pinnedProgress } from '../core/store'
import { onHit } from '../core/fx'
import { indexOf } from '../content/story'
import { lerp, smooth } from '../core/math'

/**
 * Procedural ambient audio — no files to download. Built with the Web Audio API:
 *   rain · crowd murmur · low drone · heartbeat, mixed per chapter, plus two one-shots
 *   (the knock-down thump and the Storm "grab" payoff). Muted by default; the toggle starts it.
 */
/**
 * Back half (gym → now) adds two layers on top of the same sonic world: a warm string pad (slow A-minor progression)
 * and a solo violin voice (vibrato, portamento, echo) that moves through arrangements:
 *   gym   – strings creep in under the room noise            mma   – the violin enters, warm and open
 *   foot  – stripped back: violin alone, sparse, intimate     flow  – pad returns, long slow notes (time stretches)
 *   timeline – builds: busier violin, quicker chords          now   – swells to a resolved major chord with the closing line
 */
type Mix = {
  rain: number
  crowd: number
  drone: number
  heart: number
  bpm?: number
  pad?: number
  lead?: number
  chordLen?: number // seconds per chord
  note?: [number, number] // violin note length range (s)
  rest?: number // chance (0..1) the violin rests instead of playing the next note
  oct?: number // violin octave shift
}

const mixes: Record<string, Mix> = {
  hero: { rain: 0, crowd: 0, drone: 0.55, heart: 0 },
  driveway: { rain: 0, crowd: 0.12, drone: 0.25, heart: 0 },
  basement: { rain: 0, crowd: 0.55, drone: 0.15, heart: 0.18 },
  van: { rain: 0, crowd: 0.8, drone: 0.1, heart: 0.4, bpm: 96 },
  storm: { rain: 1, crowd: 0, drone: 0.6, heart: 0.28, bpm: 80 },
  quiet: { rain: 0, crowd: 0, drone: 0.15, heart: 0.7, bpm: 62 },
  sunset: { rain: 0, crowd: 0.1, drone: 0.4, heart: 0, },
  cloud: { rain: 0, crowd: 0, drone: 0.32, heart: 0 },
  gym: { rain: 0, crowd: 0.16, drone: 0.12, heart: 0.15, bpm: 76, pad: 0.22, lead: 0, chordLen: 8 },
  mma: { rain: 0, crowd: 0, drone: 0.2, heart: 0, pad: 0.42, lead: 0.6, chordLen: 8, note: [1.6, 3.2], rest: 0.15 },
  foot: { rain: 0, crowd: 0, drone: 0.08, heart: 0.42, bpm: 68, pad: 0.06, lead: 0.55, chordLen: 10, note: [3, 5], rest: 0.35 },
  flow: { rain: 0, crowd: 0, drone: 0.2, heart: 0.8, bpm: 44, pad: 0.38, lead: 0.45, chordLen: 12, note: [3.5, 6], rest: 0.2 },
  timeline: { rain: 0, crowd: 0, drone: 0.25, heart: 0.3, bpm: 84, pad: 0.5, lead: 0.62, chordLen: 6, note: [0.9, 2], rest: 0.1 },
  now: { rain: 0, crowd: 0, drone: 0.3, heart: 0.12, bpm: 66, pad: 0.6, lead: 0.7, chordLen: 5, note: [2, 3.6], rest: 0.1, oct: 1 },
}
const ids = Object.keys(mixes)
const STORM = indexOf('storm')
const NOW = indexOf('now')

// ---- harmony (A-minor world: Am – F – C – G), as note frequencies in Hz ------------------------------------
const CHORDS: number[][] = [
  [110, 164.81, 220, 261.63, 329.63], // Am
  [87.31, 130.81, 174.61, 220, 261.63], // F
  [130.81, 196, 261.63, 329.63, 392], // C
  [98, 146.83, 196, 246.94, 293.66], // G
]
const CHORD_PCS = [['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['G', 'B', 'D']]
/** the closing resolution: C major, wide and bright (add9) */
const RESOLVED_CHORD = [65.41, 130.81, 196, 261.63, 329.63, 392, 587.33]
// violin range: A minor natural, A3 → E5
const SCALE = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25, 587.33, 659.25]
const SCALE_PC = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']

class Engine {
  ctx: AudioContext | null = null
  master!: GainNode
  gains: Record<'rain' | 'crowd' | 'drone' | 'heart' | 'pad' | 'lead' | 'riser', GainNode> = {} as never
  send!: GainNode // echo/reverb bus for the strings + violin
  riserBp!: BiquadFilterNode
  bpm = 70
  nextBeat = 0
  timer = 0
  on = false
  // music
  mix: Mix = mixes.hero
  nextChord = 0
  chordIdx = 0
  nextNote = 0
  noteIdx = 5
  lastFreq = 0
  resolved = false
  resolveAt = -99
  prevPn = 0

  private noise(type: 'white' | 'brown') {
    const c = this.ctx!
    const len = c.sampleRate * 3
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (type === 'white') d[i] = w
      else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    return src
  }

  init() {
    if (this.ctx) return
    const c = new AudioContext()
    this.ctx = c
    this.master = c.createGain()
    this.master.gain.value = 0
    // gentle bus compressor so the extra back-half layers never clip
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 3
    this.master.connect(comp)
    comp.connect(c.destination)
    const mk = () => {
      const g = c.createGain()
      g.gain.value = 0
      g.connect(this.master)
      return g
    }
    this.gains = { rain: mk(), crowd: mk(), drone: mk(), heart: mk(), pad: mk(), lead: mk(), riser: mk() }

    // echo / "hall" for strings + violin: two feedback delays through a dark low-pass
    this.send = c.createGain()
    const d1 = c.createDelay(1); d1.delayTime.value = 0.29
    const d2 = c.createDelay(1); d2.delayTime.value = 0.47
    const fb = c.createGain(); fb.gain.value = 0.38
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400
    const wet = c.createGain(); wet.gain.value = 0.5
    this.send.connect(d1); this.send.connect(d2)
    d1.connect(dlp); d2.connect(dlp); dlp.connect(fb); fb.connect(d1); fb.connect(d2)
    dlp.connect(wet); wet.connect(this.master)
    this.gains.pad.connect(this.send)
    this.gains.lead.connect(this.send)

    // riser: band-passed noise whose centre frequency climbs through the closing chapter
    const rs = this.noise('white')
    this.riserBp = c.createBiquadFilter(); this.riserBp.type = 'bandpass'; this.riserBp.frequency.value = 400; this.riserBp.Q.value = 1.1
    rs.connect(this.riserBp); this.riserBp.connect(this.gains.riser)
    rs.start()

    // rain: filtered white noise
    const rain = this.noise('white')
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000
    rain.connect(hp); hp.connect(lp); lp.connect(this.gains.rain)
    rain.start()

    // crowd: brown noise through formant-ish band-passes with a slow swell
    const crowd = this.noise('brown')
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6
    const bp2 = c.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1500; bp2.Q.value = 0.9
    const swell = c.createGain(); swell.gain.value = 0.7
    const lfo = c.createOscillator(); lfo.frequency.value = 0.23
    const lfoG = c.createGain(); lfoG.gain.value = 0.3
    lfo.connect(lfoG); lfoG.connect(swell.gain); lfo.start()
    crowd.connect(bp); crowd.connect(bp2); bp.connect(swell); bp2.connect(swell); swell.connect(this.gains.crowd)
    crowd.start()

    // drone: two detuned low oscillators
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 340
    for (const f of [55, 55.4, 82.4]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f
      const g = c.createGain(); g.gain.value = 0.18
      o.connect(g); g.connect(dl); o.start()
    }
    dl.connect(this.gains.drone)

    this.nextBeat = c.currentTime + 0.2
    this.nextChord = c.currentTime + 0.5
    this.nextNote = c.currentTime + 1.2
    this.timer = window.setInterval(() => this.schedule(), 100)
  }

  /** look-ahead scheduler: heartbeat "lub-dub", string chords and the violin line */
  private schedule() {
    const c = this.ctx
    if (!c || !this.on) return
    const horizon = c.currentTime + 0.3
    while (this.nextBeat < horizon) {
      this.thump(this.nextBeat, 1)
      this.thump(this.nextBeat + 0.22, 0.65)
      this.nextBeat += 60 / this.bpm
    }
    const m = this.mix
    const wantsMusic = (m.pad ?? 0) > 0.02 || (m.lead ?? 0) > 0.02
    while (this.nextChord < horizon) {
      const len = m.chordLen ?? 8
      if (wantsMusic) this.chord(Math.max(this.nextChord, c.currentTime), len)
      this.chordIdx++
      this.nextChord += len
    }
    while (this.nextNote < horizon) {
      const [a, b] = m.note ?? [2, 4]
      const dur = a + Math.random() * (b - a)
      if ((m.lead ?? 0) > 0.02 && Math.random() >= (m.rest ?? 0.2)) this.note(Math.max(this.nextNote, c.currentTime), dur * 1.05)
      this.nextNote += dur
    }
  }

  /** string pad: five detuned saw voices per chord, slow bloom, long release (so chords overlap smoothly) */
  private chord(t: number, len: number) {
    const c = this.ctx!
    const tones = this.resolved ? RESOLVED_CHORD : CHORDS[this.chordIdx % CHORDS.length]
    const hold = len + 3
    tones.forEach((f, i) => {
      for (const det of [-7, 7]) {
        const o = c.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = det + i * 1.3
        const g = c.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.045, t + 2.4)
        g.gain.setValueAtTime(0.045, t + Math.max(2.5, len - 0.2))
        g.gain.linearRampToValueAtTime(0, t + hold)
        const lp = c.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 520 + i * 90
        lp.Q.value = 0.4
        o.connect(lp); lp.connect(g); g.connect(this.gains.pad)
        o.start(t); o.stop(t + hold + 0.1)
      }
    })
  }

  /** the next violin note: stepwise motion that likes to land on the current chord's tones */
  private pickNote(): number {
    const pcs = this.resolved ? ['C', 'E', 'G'] : CHORD_PCS[(this.chordIdx - 1 + CHORDS.length * 4) % CHORDS.length]
    const cands: number[] = []
    for (let d = -2; d <= 2; d++) {
      const idx = this.noteIdx + d
      if (idx >= 0 && idx < SCALE.length && !(d === 0 && Math.random() < 0.6)) cands.push(idx)
    }
    const tonal = cands.filter((i) => pcs.includes(SCALE_PC[i]))
    const pool = tonal.length && Math.random() < 0.6 ? tonal : cands
    this.noteIdx = pool[Math.floor(Math.random() * pool.length)] ?? this.noteIdx
    return SCALE[this.noteIdx] * Math.pow(2, this.mix.oct ?? 0)
  }

  /** solo violin: sawtooth through a body-resonance filter, delayed vibrato, a little portamento, soft bow attack */
  private note(t: number, dur: number, freq?: number, level = 0.2) {
    const c = this.ctx!
    const f = freq ?? this.pickNote()
    const o = c.createOscillator()
    o.type = 'sawtooth'
    if (this.lastFreq && Math.abs(this.lastFreq - f) / f < 1.5) {
      o.frequency.setValueAtTime(this.lastFreq, t)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09)
    } else o.frequency.setValueAtTime(f, t)
    this.lastFreq = f
    const lfo = c.createOscillator()
    lfo.frequency.value = 5.2 + Math.random() * 0.5
    const lg = c.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(f * 0.011, t + 0.7)
    lfo.connect(lg); lg.connect(o.frequency)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1100; body.gain.value = 5
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level, t + 0.18)
    g.gain.setValueAtTime(level * 0.9, t + Math.max(0.3, dur - 0.1))
    g.gain.linearRampToValueAtTime(0, t + dur + 0.5)
    o.connect(lp); lp.connect(body); body.connect(g); g.connect(this.gains.lead)
    o.start(t); lfo.start(t)
    o.stop(t + dur + 0.6); lfo.stop(t + dur + 0.6)
  }

  /** the closing resolution: C-major swell across strings, a high violin line and a shimmer of bells */
  private resolve() {
    const c = this.ctx!
    const t = c.currentTime + 0.05
    this.resolved = true
    this.resolveAt = t
    this.chordIdx = 0
    this.nextChord = t + 6 // the regular pad continues in C major afterwards
    const out = c.createGain()
    out.connect(this.master); out.connect(this.send)
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(1, t + 1.1)
    out.gain.setValueAtTime(1, t + 6)
    out.gain.linearRampToValueAtTime(0, t + 11)
    ;[130.81, 196, 261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((f, i) => {
      for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = i > 4 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + i * 220
        const g = c.createGain(); g.gain.value = 0.05
        o.connect(lp); lp.connect(g); g.connect(out)
        o.start(t); o.stop(t + 11.2)
      }
    })
    this.note(t + 0.4, 6.5, 1046.5, 0.26) // high C
    this.note(t + 3.2, 5, 783.99, 0.2) // answering G
    ;[1318.5, 1046.5, 987.77, 783.99, 659.25].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f
      const g = c.createGain()
      const s = t + 0.9 + i * 0.22
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.09, s + 0.02); g.gain.exponentialRampToValueAtTime(0.001, s + 2.4)
      o.connect(g); g.connect(this.send); g.connect(this.master)
      o.start(s); o.stop(s + 2.5)
    })
    // sub-boom under the downbeat
    const b = c.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(70, t); b.frequency.exponentialRampToValueAtTime(32, t + 1.4)
    const bg = c.createGain(); bg.gain.setValueAtTime(0.9, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
    b.connect(bg); bg.connect(this.master); b.start(t); b.stop(t + 1.9)
  }

  private thump(t: number, v: number) {
    const c = this.ctx!
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(95, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    o.connect(g); g.connect(this.gains.heart)
    o.start(t); o.stop(t + 0.25)
  }

  setOn(on: boolean) {
    this.on = on
    store.audioOn = on
    if (on) {
      this.init()
      this.ctx!.resume()
      this.master.gain.cancelScheduledValues(0)
      this.master.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.4)
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
    }
  }

  /** called ~10×/sec */
  update() {
    if (!this.ctx || !this.on) return
    const m = mixes[ids[store.active]] ?? mixes.hero
    const t = this.ctx.currentTime
    let rain = m.rain
    let drone = m.drone
    if (store.active === STORM) {
      // rain follows the storm intensity: full until the grab, then fades as the sea calms
      const p = store.local[STORM]
      rain = 1 - smooth(0.745, 0.9, p) * 0.97
      drone = 0.6 - smooth(0.745, 0.9, p) * 0.2
    }
    this.bpm = m.bpm ?? 70
    this.mix = m

    // closing chapter: strings swell with its pinned scroll progress, a noise riser climbs, then the
    // resolution lands exactly as "This is just the beginning." appears
    let pad = m.pad ?? 0
    let lead = m.lead ?? 0
    let riser = 0
    const pn = store.active === NOW ? pinnedProgress(NOW) : 0
    if (store.active === NOW) {
      pad = lerp(0.45, 0.95, smooth(0.2, 0.72, pn))
      lead = lerp(0.55, 0.85, smooth(0.2, 0.72, pn))
      riser = smooth(0.38, 0.72, pn) * (this.resolved ? 0 : 0.22)
      this.riserBp.frequency.setTargetAtTime(300 + pn * 4800, t, 0.3)
      if (pn >= 0.72 && this.prevPn < 0.72 && t - this.resolveAt > 8) this.resolve()
    }
    if (store.active !== NOW || pn < 0.45) this.resolved = false
    this.prevPn = pn

    const set = (g: GainNode, v: number, tc = 0.35) => g.gain.setTargetAtTime(v, t, tc)
    set(this.gains.rain, rain * 0.35)
    set(this.gains.crowd, m.crowd * 0.45)
    set(this.gains.drone, drone * 0.5)
    set(this.gains.heart, m.heart * 0.9)
    // slow fades so the arrangement changes feel like a crossfade, never a cut
    set(this.gains.pad, pad * 0.9, 1.4)
    set(this.gains.lead, lead * 0.9, 1.1)
    set(this.gains.riser, riser, 0.5)
  }

  oneShot(kind: string) {
    if (!this.ctx || !this.on) return
    // fx.ts also emits newer cues (ground-hit, choke-*, foot-*); this original score only voices these two
    if (kind !== 'van-hit' && kind !== 'storm-grab') return
    const c = this.ctx
    const t = c.currentTime
    const out = c.createGain()
    out.connect(this.master)
    if (kind === 'van-hit') {
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35)
      const g = c.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55)
      // crowd gasp/roar burst
      const n = this.noise('brown')
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5
      const ng = c.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.9, t + 0.15); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.6)
      n.connect(f); f.connect(ng); ng.connect(out); n.start(t); n.stop(t + 1.7)
    } else {
      // payoff: deep boom + rising shimmer chord as the sea lets go
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2)
      const g = c.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6)
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.7)
      ;[261.6, 329.6, 392, 523.3, 659.3].forEach((fr, i) => {
        const s = c.createOscillator(); s.type = 'triangle'; s.frequency.value = fr
        const sg = c.createGain()
        sg.gain.setValueAtTime(0, t + 0.1 * i)
        sg.gain.linearRampToValueAtTime(0.16, t + 0.1 * i + 0.5)
        sg.gain.exponentialRampToValueAtTime(0.001, t + 4.2)
        s.connect(sg); sg.connect(out); s.start(t + 0.1 * i); s.stop(t + 4.4)
      })
    }
  }
}

export const audio = new Engine()
let wired = false
export function wireAudio() {
  if (wired) return
  wired = true
  onHit((name) => audio.oneShot(name))
  window.setInterval(() => audio.update(), 100)
}
