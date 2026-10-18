import { store, pinnedProgress } from '../core/store'
import { onHit, STORM_GRAB } from '../core/fx'
import type { HitName } from '../core/fx'
import { indexOf } from '../content/story'
import { lerp, mulberry32, smooth } from '../core/math'

/**
 * Procedural score — no audio files. Everything is synthesised with the Web Audio API and scheduled ahead of time.
 *
 * Ambient layer (unchanged palette): rain · crowd murmur · low drone · heartbeat, mixed per chapter.
 * Music layer: every chapter group has its own musical identity (key, mode, chord pool, tempo feel, instrument layers):
 *
 *   hero · driveway · basement  D minor/phrygian, slow, sub-heavy, a lone cello and a faint pulse     → tense, quiet
 *   van                         A phrygian, driving drums + bass; a stinger on the knock-down + a thud on every ground strike
 *   storm                       E minor, 16th-note ostinato that climbs with the scroll; tempo + brightness rise  → urgent
 *   storm (after the grab)      G major: the sea lets go — violin, warm pad, bells                                → release
 *   quiet                       B minor, almost nothing: a sustained fifth and a lone violin with long silences  → still, sparse
 *   sunset · cloud              D major / G lydian, warm pad + violin + soft plucks (low strings swell for the choke)
 *   gym · flow                  A dorian groove (kick/snare/hat/bass) · D dorian "time stretched" flowing arpeggios
 *   partners · foot             C major cello + piano plucks · A minor lone violin, heartbeat, near silence      → intimate
 *   timeline · now              building, then a C-major resolution that sits still and finishes
 *
 * Nothing repeats for long: chord progressions are drawn from a pool and never repeated back-to-back, melodic phrases are
 * generated from the scale with a mutating motif (seeded per phrase), arpeggios are probabilistic, note timing/velocity are
 * humanised, and pad filters drift slowly. Stingers are tied to visual beats (see core/fx.ts). The mix is bus-based with a
 * gentle ducking of the music under rain/crowd, a bus compressor and a hard cap on simultaneous voices.
 * Muted by default; the toggle starts it.
 */

type Mix = { rain: number; crowd: number; drone: number; heart: number; bpm?: number }
const mixes: Record<string, Mix> = {
  hero: { rain: 0, crowd: 0, drone: 0.55, heart: 0 },
  driveway: { rain: 0, crowd: 0.12, drone: 0.25, heart: 0 },
  basement: { rain: 0, crowd: 0.55, drone: 0.15, heart: 0.18 },
  van: { rain: 0, crowd: 0.8, drone: 0.1, heart: 0.4, bpm: 96 },
  storm: { rain: 1, crowd: 0, drone: 0.6, heart: 0.28, bpm: 80 },
  quiet: { rain: 0, crowd: 0, drone: 0.15, heart: 0.7, bpm: 62 },
  sunset: { rain: 0, crowd: 0.1, drone: 0.4, heart: 0 },
  cloud: { rain: 0, crowd: 0, drone: 0.32, heart: 0 },
  gym: { rain: 0, crowd: 0.16, drone: 0.12, heart: 0.15, bpm: 76 },
  mma: { rain: 0, crowd: 0, drone: 0.2, heart: 0 },
  foot: { rain: 0, crowd: 0, drone: 0.08, heart: 0.42, bpm: 68 },
  flow: { rain: 0, crowd: 0, drone: 0.2, heart: 0.8, bpm: 44 },
  timeline: { rain: 0, crowd: 0, drone: 0.25, heart: 0.3, bpm: 84 },
  now: { rain: 0, crowd: 0, drone: 0.3, heart: 0.12, bpm: 66 },
}
const ids = Object.keys(mixes)
const STORM = indexOf('storm')
const NOW = indexOf('now')

// ---------------------------------------------------------------------------------------------------- sections
const MIN = [0, 2, 3, 5, 7, 8, 10]
const DOR = [0, 2, 3, 5, 7, 9, 10]
const PHR = [0, 1, 3, 5, 7, 8, 10]
const MAJ = [0, 2, 4, 5, 7, 9, 11]
const LYD = [0, 2, 4, 6, 7, 9, 11]

type Voice = 'violin' | 'cello'
interface Sect {
  root: number // MIDI tonic (D3 = 50)
  mode: number[]
  prog: number[][] // pool of 4-chord progressions (scale degrees, 0 = tonic); a new one is drawn every cycle
  bpm: number
  beats: number // beats per chord
  pad: number
  cut: number // pad low-pass centre (Hz)
  sus?: number // chance a chord trades its 3rd for a 4th (suspended tension)
  ext?: number // chance of a 9th colour tone (warmth)
  lead?: { voice: Voice; lvl: number; len: [number, number]; rest: number; oct: number }
  arp?: { every: number; prob: number; lvl: number; oct: number; voice: 'pluck' | 'piano' | 'bell'; shape: 'up' | 'rand' | 'updown' }
  kick?: string // 16-step patterns: '0' rest, '1' hit, '2' accent
  snare?: string
  hat?: string
  bass?: string
  drumLvl?: number
  bassLvl?: number
}

const P_MIN: number[][] = [[0, 5, 3, 4], [0, 3, 5, 6], [0, 6, 5, 4], [0, 2, 5, 3]]
const P_PHR: number[][] = [[0, 1, 0, 6], [0, 1, 5, 3], [0, 6, 1, 0]]
const P_MAJ: number[][] = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4]]
const P_DOR: number[][] = [[0, 3, 0, 6], [0, 6, 3, 4], [0, 4, 3, 6]]
const P_STILL: number[][] = [[0, 4, 0, 5], [0, 5, 0, 3]]

const S: Record<string, Sect> = {
  hero: { root: 50, mode: MIN, prog: P_MIN, bpm: 58, beats: 16, pad: 0.2, cut: 380, sus: 0.5, lead: { voice: 'cello', lvl: 0.3, len: [4, 7], rest: 0.6, oct: 0 } },
  driveway: {
    root: 50, mode: PHR, prog: P_PHR, bpm: 62, beats: 14, pad: 0.28, cut: 430, sus: 0.5,
    lead: { voice: 'cello', lvl: 0.28, len: [3.5, 6], rest: 0.5, oct: 0 },
    arp: { every: 4, prob: 0.3, lvl: 0.05, oct: -1, voice: 'pluck', shape: 'rand' },
  },
  basement: {
    root: 50, mode: MIN, prog: P_MIN, bpm: 70, beats: 12, pad: 0.3, cut: 520, sus: 0.4,
    kick: '1000000010000000', drumLvl: 0.32, bass: '1000001000100000', bassLvl: 0.3,
    arp: { every: 2, prob: 0.22, lvl: 0.05, oct: -1, voice: 'pluck', shape: 'rand' },
  },
  van: {
    root: 45, mode: PHR, prog: P_PHR, bpm: 98, beats: 8, pad: 0.22, cut: 800, sus: 0.3,
    kick: '2000100020001000', snare: '0000100000001000', hat: '0010001000100010', drumLvl: 0.75,
    bass: '1010101010101010', bassLvl: 0.45,
  },
  storm: {
    root: 52, mode: MIN, prog: [[0, 5, 2, 6], [0, 3, 6, 5], [0, 5, 3, 4]], bpm: 124, beats: 8, pad: 0.3, cut: 600, sus: 0.3,
    kick: '1000100010001000', drumLvl: 0.5, bass: '1011101110111011', bassLvl: 0.36,
    arp: { every: 1, prob: 0.85, lvl: 0.09, oct: 0, voice: 'pluck', shape: 'up' },
  },
  storm2: {
    root: 55, mode: MAJ, prog: P_MAJ, bpm: 62, beats: 12, pad: 0.42, cut: 1000, ext: 0.5,
    lead: { voice: 'violin', lvl: 0.55, len: [2.5, 5], rest: 0.25, oct: 0 },
    arp: { every: 4, prob: 0.55, lvl: 0.06, oct: 1, voice: 'bell', shape: 'up' },
  },
  quiet: { root: 47, mode: MIN, prog: P_STILL, bpm: 54, beats: 16, pad: 0.1, cut: 320, sus: 0.6, lead: { voice: 'violin', lvl: 0.5, len: [4, 6.5], rest: 0.55, oct: 0 } },
  sunset: {
    root: 50, mode: MAJ, prog: P_MAJ, bpm: 68, beats: 12, pad: 0.36, cut: 900, ext: 0.5,
    lead: { voice: 'violin', lvl: 0.55, len: [2.5, 4.5], rest: 0.25, oct: 0 },
    arp: { every: 4, prob: 0.5, lvl: 0.06, oct: 0, voice: 'pluck', shape: 'updown' },
  },
  cloud: {
    root: 55, mode: LYD, prog: P_MAJ, bpm: 74, beats: 10, pad: 0.4, cut: 1000, ext: 0.6,
    lead: { voice: 'violin', lvl: 0.5, len: [2, 4], rest: 0.3, oct: 0 },
    arp: { every: 2, prob: 0.5, lvl: 0.07, oct: 0, voice: 'piano', shape: 'up' },
  },
  gym: {
    root: 45, mode: DOR, prog: P_DOR, bpm: 106, beats: 8, pad: 0.16, cut: 700, sus: 0.2,
    kick: '2000100020001000', snare: '0000100000001000', hat: '0010001000100011', drumLvl: 0.6,
    bass: '1010011010100110', bassLvl: 0.42,
    arp: { every: 2, prob: 0.4, lvl: 0.07, oct: 0, voice: 'pluck', shape: 'rand' },
  },
  mma: {
    root: 48, mode: MAJ, prog: [[0, 5, 3, 4], [0, 2, 3, 4], [5, 3, 0, 4]], bpm: 64, beats: 12, pad: 0.3, cut: 750, ext: 0.5,
    lead: { voice: 'cello', lvl: 0.5, len: [3, 5.5], rest: 0.25, oct: 0 },
    arp: { every: 2, prob: 0.6, lvl: 0.09, oct: 0, voice: 'piano', shape: 'updown' },
  },
  foot: {
    root: 45, mode: MIN, prog: P_MIN, bpm: 60, beats: 16, pad: 0.07, cut: 380, sus: 0.3,
    lead: { voice: 'violin', lvl: 0.62, len: [3.5, 6], rest: 0.4, oct: 0 },
    arp: { every: 8, prob: 0.35, lvl: 0.06, oct: 1, voice: 'bell', shape: 'rand' },
  },
  flow: {
    root: 50, mode: DOR, prog: P_DOR, bpm: 72, beats: 12, pad: 0.4, cut: 800,
    lead: { voice: 'violin', lvl: 0.4, len: [3.5, 6], rest: 0.25, oct: 0 },
    arp: { every: 2, prob: 0.8, lvl: 0.08, oct: 0, voice: 'piano', shape: 'updown' },
    kick: '1000000000000000', drumLvl: 0.3, bass: '1000000000000000', bassLvl: 0.3,
  },
  timeline: {
    root: 45, mode: MIN, prog: P_MIN, bpm: 88, beats: 8, pad: 0.5, cut: 900,
    lead: { voice: 'violin', lvl: 0.62, len: [0.9, 2], rest: 0.1, oct: 0 },
    arp: { every: 2, prob: 0.8, lvl: 0.09, oct: 0, voice: 'pluck', shape: 'up' },
    kick: '1000100010001000', drumLvl: 0.4,
  },
  now: {
    root: 48, mode: MAJ, prog: P_MAJ, bpm: 72, beats: 8, pad: 0.6, cut: 1200, ext: 0.6,
    lead: { voice: 'violin', lvl: 0.7, len: [2, 3.6], rest: 0.1, oct: 1 },
    arp: { every: 2, prob: 0.85, lvl: 0.09, oct: 1, voice: 'pluck', shape: 'up' },
    kick: '1000000010000000', drumLvl: 0.45,
  },
  // after the closing resolution: the music sits still and finishes
  now2: {
    root: 48, mode: MAJ, prog: [[0, 4, 5, 0], [0, 3, 0, 4]], bpm: 60, beats: 12, pad: 0.6, cut: 1300, ext: 0.6,
    lead: { voice: 'violin', lvl: 0.55, len: [4, 7], rest: 0.35, oct: 1 },
    arp: { every: 8, prob: 0.4, lvl: 0.06, oct: 1, voice: 'bell', shape: 'up' },
  },
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const MAX_VOICES = 44

interface Chord {
  deg: number
  tones: number[] // midi, bass first
}

class Engine {
  ctx: AudioContext | null = null
  master!: GainNode
  music!: GainNode
  gains: Record<'rain' | 'crowd' | 'drone' | 'heart' | 'pad' | 'lead' | 'pulse' | 'drums' | 'bass' | 'riser', GainNode> = {} as never
  send!: GainNode
  riserBp!: BiquadFilterNode
  noiseBuf!: AudioBuffer
  bpm = 70 // heartbeat tempo
  nextBeat = 0
  timer = 0
  on = false
  live = 0 // simultaneous short voices (arp / drums / lead), capped
  // arrangement state
  key = 'hero'
  pendKey = 'hero'
  pendSince = 0
  sect: Sect = S.hero
  chord: Chord = { deg: 0, tones: [38, 50, 53, 57] }
  progPool = 0
  progCur: number[] = [0, 5, 3, 4]
  progStep = 0
  nextChord = 0
  nextNote = 0
  nextStep = 0
  stepN = 0
  arpN = 0
  phraseCount = 0
  phrase: { deg: number; dur: number; rest: boolean }[] = []
  leadDeg = 4
  motif: number[] = []
  lastFreq = 0
  rnd: () => number = mulberry32(1)
  tempoMul = 1
  intensity = 0 // 0..1, set by update() for chapters that build (storm, timeline)
  // closing chapter
  resolved = false
  resolveAt = -99
  prevPn = 0
  // stingers
  duckUntil = 0
  lastHit: Record<string, number> = {}

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
    // bus compressor + a ceiling so stacked layers never clip
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 18
    comp.ratio.value = 4
    comp.attack.value = 0.01
    comp.release.value = 0.25
    this.master.connect(comp)
    comp.connect(c.destination)
    const mk = (dest: AudioNode = this.master) => {
      const g = c.createGain()
      g.gain.value = 0
      g.connect(dest)
      return g
    }
    this.music = c.createGain()
    this.music.gain.value = 1
    this.music.connect(this.master)
    this.gains = {
      rain: mk(), crowd: mk(), drone: mk(), heart: mk(),
      pad: mk(this.music), lead: mk(this.music), pulse: mk(this.music), drums: mk(this.music), bass: mk(this.music), riser: mk(this.music),
    }

    // echo / "hall" for strings, violin and plucks: two feedback delays through a dark low-pass
    this.send = c.createGain()
    const d1 = c.createDelay(1); d1.delayTime.value = 0.29
    const d2 = c.createDelay(1); d2.delayTime.value = 0.47
    const fb = c.createGain(); fb.gain.value = 0.38
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400
    const wet = c.createGain(); wet.gain.value = 0.5
    this.send.connect(d1); this.send.connect(d2)
    d1.connect(dlp); d2.connect(dlp); dlp.connect(fb); fb.connect(d1); fb.connect(d2)
    dlp.connect(wet); wet.connect(this.music)
    this.gains.pad.connect(this.send)
    this.gains.lead.connect(this.send)
    this.gains.pulse.connect(this.send)

    this.noiseBuf = (() => {
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      return buf
    })()

    // riser: band-passed noise whose centre frequency climbs (closing chapter, the choke)
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

    // drone: three low oscillators
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 340
    for (const f of [55, 55.4, 82.4]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f
      const g = c.createGain(); g.gain.value = 0.18
      o.connect(g); g.connect(dl); o.start()
    }
    dl.connect(this.gains.drone)

    const t0 = c.currentTime
    this.nextBeat = t0 + 0.2
    this.nextChord = t0 + 0.5
    this.nextNote = t0 + 1.5
    this.nextStep = t0 + 0.4
    this.timer = window.setInterval(() => this.schedule(), 100)
  }

  // ------------------------------------------------------------------------------------------------ scheduling
  /** look-ahead scheduler: heartbeat, chords, the lead voice, and the 16th-note grid (arp, drums, bass) */
  private schedule() {
    const c = this.ctx
    if (!c || !this.on) return
    const now = c.currentTime
    const horizon = now + 0.3
    while (this.nextBeat < horizon) {
      this.thump(this.nextBeat, 1)
      this.thump(this.nextBeat + 0.22, 0.65)
      this.nextBeat += 60 / this.bpm
    }
    const s = this.sect
    const bpm = s.bpm * this.tempoMul
    while (this.nextChord < horizon) {
      this.newChord(Math.max(this.nextChord, now), (s.beats * 60) / bpm)
      this.nextChord += (s.beats * 60) / bpm
    }
    while (this.nextNote < horizon) {
      this.nextNote += this.leadStep(Math.max(this.nextNote, now))
    }
    const step = 60 / bpm / 4
    while (this.nextStep < horizon) {
      this.gridStep(Math.max(this.nextStep, now), step)
      this.nextStep += step
      this.stepN++
    }
  }

  /** a fresh chord from the current section: voicing from the scale, progression drawn from the pool (never twice in a row) */
  private newChord(t: number, len: number) {
    const s = this.sect
    const r = this.rnd
    if (this.progStep % 4 === 0) {
      let next = Math.floor(r() * s.prog.length)
      if (s.prog.length > 1 && next === this.progPool) next = (next + 1) % s.prog.length
      this.progPool = next
      this.progCur = s.prog[next]
    }
    const deg = this.progCur[this.progStep % 4]
    this.progStep++
    const n = (k: number) => s.root + s.mode[(((deg + k) % 7) + 7) % 7] + 12 * Math.floor((deg + k) / 7)
    const third = r() < (s.sus ?? 0) ? n(3) : n(2)
    const tones = [n(0) - 12, n(0), third, n(4)]
    if (r() < (s.ext ?? 0)) tones.push(n(8))
    this.chord = { deg, tones }
    this.pad(t, len, tones)
  }

  /** string pad: detuned saw voices through ONE slowly-moving low-pass per chord, slow bloom, long release */
  private pad(t: number, len: number, tones: number[]) {
    const c = this.ctx!
    const s = this.sect
    const hold = len + 3
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.5
    const cut = s.cut * (1 + 0.35 * this.intensity)
    lp.frequency.setValueAtTime(cut * 0.7, t)
    lp.frequency.linearRampToValueAtTime(cut * (1.05 + this.rnd() * 0.25), t + len * 0.6) // slow filter automation
    lp.frequency.linearRampToValueAtTime(cut * 0.8, t + hold)
    const amp = 0.05 * (0.9 + this.rnd() * 0.2)
    lp.connect(this.gains.pad)
    tones.forEach((m, i) => {
      for (const det of [-7, 7]) {
        const o = c.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(m)
        o.detune.value = det + i * 1.3
        const g = c.createGain()
        const st = t + this.rnd() * 0.06 // humanised entries
        g.gain.setValueAtTime(0, st)
        g.gain.linearRampToValueAtTime(i === 0 ? amp * 1.2 : amp, st + 2.4)
        g.gain.setValueAtTime(i === 0 ? amp * 1.2 : amp, st + Math.max(2.5, len - 0.2))
        g.gain.linearRampToValueAtTime(0, st + hold)
        o.connect(g); g.connect(lp)
        o.start(st); o.stop(st + hold + 0.1)
      }
    })
  }

  /** the next lead note/rest; returns the time to wait before the following one */
  private leadStep(t: number): number {
    const s = this.sect
    const L = s.lead
    if (!L) return 1.5
    if (!this.phrase.length) this.phrase = this.makePhrase(s)
    const n = this.phrase.shift()!
    if (!n.rest) {
      const base = s.root + 12 + 12 * L.oct
      const deg = n.deg
      const midi = base + s.mode[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7)
      const vel = 0.85 + this.rnd() * 0.3
      this.note(t + (this.rnd() - 0.5) * 0.06, n.dur * 1.05, mtof(midi), L.lvl * 0.4 * vel, L.voice)
    }
    return n.dur
  }

  /** a short melodic phrase: stepwise motion from the previous note, chord-tone landings, a motif that mutates as it recurs */
  private makePhrase(s: Sect) {
    const L = s.lead!
    const r = mulberry32((this.phraseCount++ * 7919 + this.key.length * 104729 + 17) >>> 0)
    const chordDegs = [this.chord.deg, this.chord.deg + 2, this.chord.deg + 4].map((d) => ((d % 7) + 7) % 7)
    const n = 3 + Math.floor(r() * 3)
    const steps: number[] = []
    if (this.motif.length && r() < 0.5) {
      // recur: the previous contour, one step changed
      for (let i = 0; i < n; i++) steps.push(this.motif[i % this.motif.length])
      steps[Math.floor(r() * steps.length)] = [-2, -1, 1, 2, 0][Math.floor(r() * 5)]
    } else {
      const moves = [-3, -2, -1, -1, 0, 1, 1, 2, 3]
      for (let i = 0; i < n; i++) steps.push(moves[Math.floor(r() * moves.length)])
    }
    this.motif = steps.slice()
    const out: { deg: number; dur: number; rest: boolean }[] = []
    let d = this.leadDeg
    steps.forEach((m, i) => {
      d += m
      if (d < 0) d = 1
      if (d > 9) d = 8
      if (i === n - 1) {
        // land on the nearest chord tone
        for (const k of [0, 1, -1, 2, -2, 3, -3]) {
          if (chordDegs.includes((((d + k) % 7) + 7) % 7)) {
            d = Math.max(0, Math.min(9, d + k))
            break
          }
        }
      }
      const dur = L.len[0] + r() * (L.len[1] - L.len[0])
      out.push({ deg: d, dur: dur * (i === n - 1 ? 1.35 : 1), rest: r() < L.rest * 0.9 })
    })
    this.leadDeg = d
    // a breath between phrases
    out.push({ deg: d, dur: L.len[0] * (0.6 + r() * 1.2), rest: true })
    return out
  }

  /** the 16th-note grid: drums, bass and the arpeggio */
  private gridStep(t: number, step: number) {
    const s = this.sect
    const i = this.stepN % 16
    const r = this.rnd
    const hum = (r() - 0.5) * 0.012 // humanised timing
    const dl = s.drumLvl ?? 0
    if (dl > 0 && this.live < MAX_VOICES) {
      const lvl = dl * (0.6 + 0.6 * this.intensity * (this.key === 'storm' ? 1 : 0.3))
      const k = s.kick?.[i]
      if (k && k !== '0') this.kick(t + hum, lvl * (k === '2' ? 1 : 0.75) * (0.9 + r() * 0.2))
      if (s.snare?.[i] === '1') this.snare(t + hum, lvl * 0.55)
      if (s.hat?.[i] && s.hat[i] !== '0' && r() < 0.85) this.hat(t + hum, lvl * 0.3 * (0.7 + r() * 0.6))
    }
    const bl = s.bassLvl ?? 0
    if (bl > 0 && s.bass?.[i] === '1' && this.live < MAX_VOICES) {
      this.bassNote(t + hum, this.chord.tones[0], step * 1.8, bl * (0.9 + r() * 0.2))
    }
    const a = s.arp
    if (a && this.stepN % a.every === 0 && r() < a.prob && this.live < MAX_VOICES - 6) {
      const tones = this.chord.tones.slice(1)
      const span = tones.length * 2
      let k: number
      if (a.shape === 'up') k = this.arpN % span
      else if (a.shape === 'updown') {
        const q = this.arpN % (span * 2 - 2)
        k = q < span ? q : span * 2 - 2 - q
      } else k = Math.floor(r() * span)
      this.arpN++
      const midi = tones[k % tones.length] + 12 * Math.floor(k / tones.length) + 12 * a.oct + (this.key === 'storm' ? 12 * Math.round(this.intensity) : 0)
      this.pluck(t + hum, mtof(midi), a.lvl * (0.7 + r() * 0.6), a.voice, step * a.every)
    }
  }

  // ------------------------------------------------------------------------------------------------ voices
  private track(o: AudioScheduledSourceNode) {
    this.live++
    o.onended = () => {
      this.live--
    }
  }

  private pluck(t: number, f: number, lvl: number, voice: 'pluck' | 'piano' | 'bell', span: number) {
    const c = this.ctx!
    const o = c.createOscillator()
    const g = c.createGain()
    const dec = voice === 'bell' ? 2.2 : voice === 'piano' ? 1.1 : Math.min(0.55, span * 1.6 + 0.15)
    o.type = voice === 'bell' ? 'sine' : 'triangle'
    o.frequency.value = f
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(lvl, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dec)
    o.connect(g)
    g.connect(this.gains.pulse)
    o.start(t)
    o.stop(t + dec + 0.05)
    this.track(o)
    if (voice !== 'pluck') {
      // upper partial: a glassy shimmer (bell) or the hammer's overtone (piano)
      const p = c.createOscillator()
      const pg = c.createGain()
      p.type = 'sine'
      p.frequency.value = f * (voice === 'bell' ? 2.76 : 2)
      pg.gain.setValueAtTime(0, t)
      pg.gain.linearRampToValueAtTime(lvl * (voice === 'bell' ? 0.35 : 0.22), t + 0.004)
      pg.gain.exponentialRampToValueAtTime(0.0008, t + dec * 0.5)
      p.connect(pg); pg.connect(this.gains.pulse)
      p.start(t); p.stop(t + dec * 0.5 + 0.05)
    }
  }

  private kick(t: number, v: number) {
    const c = this.ctx!
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13)
    const g = c.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g); g.connect(this.gains.drums)
    o.start(t); o.stop(t + 0.32)
    this.track(o)
  }

  private hat(t: number, v: number) {
    const c = this.ctx!
    const s = c.createBufferSource()
    s.buffer = this.noiseBuf
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000
    const g = c.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    s.connect(hp); hp.connect(g); g.connect(this.gains.drums)
    s.start(t, Math.random() * 0.8, 0.06)
    this.track(s)
  }

  private snare(t: number, v: number) {
    const c = this.ctx!
    const s = c.createBufferSource()
    s.buffer = this.noiseBuf
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7
    const g = c.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    s.connect(bp); bp.connect(g); g.connect(this.gains.drums)
    s.start(t, Math.random() * 0.8, 0.18)
    this.track(s)
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.1)
    const og = c.createGain(); og.gain.setValueAtTime(v * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    o.connect(og); og.connect(this.gains.drums); o.start(t); o.stop(t + 0.14)
  }

  private bassNote(t: number, midi: number, dur: number, v: number) {
    const c = this.ctx!
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = mtof(midi)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.12, dur))
    o.connect(lp); lp.connect(g); g.connect(this.gains.bass)
    o.start(t); o.stop(t + dur + 0.05)
    this.track(o)
  }

  /** solo violin / cello: sawtooth through a body-resonance filter, delayed vibrato, a little portamento, soft bow attack */
  private note(t: number, dur: number, f: number, level = 0.2, voice: Voice = 'violin') {
    const c = this.ctx!
    const cello = voice === 'cello'
    const o = c.createOscillator()
    o.type = 'sawtooth'
    const fr = cello ? f / 2 : f
    if (this.lastFreq && Math.abs(this.lastFreq - fr) / fr < 1.5) {
      o.frequency.setValueAtTime(this.lastFreq, t)
      o.frequency.exponentialRampToValueAtTime(fr, t + (cello ? 0.14 : 0.09))
    } else o.frequency.setValueAtTime(fr, t)
    this.lastFreq = fr
    const lfo = c.createOscillator()
    lfo.frequency.value = (cello ? 4.6 : 5.2) + Math.random() * 0.5
    const lg = c.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(fr * (cello ? 0.007 : 0.011), t + (cello ? 0.9 : 0.7))
    lfo.connect(lg); lg.connect(o.frequency)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cello ? 1500 : 3000
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = cello ? 320 : 1100; body.gain.value = cello ? 6 : 5
    const g = c.createGain()
    const att = cello ? 0.34 : 0.18
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level, t + att)
    g.gain.setValueAtTime(level * 0.9, t + Math.max(0.3, dur - 0.1))
    g.gain.linearRampToValueAtTime(0, t + dur + 0.5)
    o.connect(lp); lp.connect(body); body.connect(g); g.connect(this.gains.lead)
    o.start(t); lfo.start(t)
    o.stop(t + dur + 0.6); lfo.stop(t + dur + 0.6)
    this.track(o)
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

  /** the closing resolution: C-major swell across strings, a high violin line and a shimmer of bells */
  private resolve() {
    const c = this.ctx!
    const t = c.currentTime + 0.05
    this.resolved = true
    this.resolveAt = t
    const out = c.createGain()
    out.connect(this.music); out.connect(this.send)
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
      o.connect(g); g.connect(this.send); g.connect(this.music)
      o.start(s); o.stop(s + 2.5)
    })
    // sub-boom under the downbeat (the cage locks)
    const b = c.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(70, t); b.frequency.exponentialRampToValueAtTime(32, t + 1.4)
    const bg = c.createGain(); bg.gain.setValueAtTime(0.9, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
    b.connect(bg); bg.connect(this.master); b.start(t); b.stop(t + 1.9)
  }

  setOn(on: boolean) {
    this.on = on
    store.audioOn = on
    if (on) {
      this.init()
      this.ctx!.resume()
      this.master.gain.cancelScheduledValues(0)
      this.master.gain.setTargetAtTime(0.85, this.ctx!.currentTime, 0.4)
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
    }
  }

  // ------------------------------------------------------------------------------------------------ per-tick control
  private sectionKey(): string {
    const id = ids[store.active] ?? 'hero'
    if (id === 'storm' && store.local[STORM] >= STORM_GRAB - 0.005) return 'storm2' // the sea lets go
    if (id === 'now' && this.resolved && this.ctx && this.ctx.currentTime - this.resolveAt > 2) return 'now2'
    return id
  }

  private enter(key: string) {
    const c = this.ctx!
    this.key = key
    this.sect = S[key] ?? S.hero
    this.rnd = mulberry32((key.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) + this.phraseCount * 977) >>> 0)
    this.progStep = 0
    this.phrase = []
    this.motif = []
    this.leadDeg = 4
    this.arpN = 0
    // start the new key promptly with a slow bloom; the previous chord's tail overlaps as the crossfade
    this.nextChord = c.currentTime + 0.25
    this.nextNote = c.currentTime + 1.6
    this.nextStep = Math.max(this.nextStep, c.currentTime + 0.1)
    this.stepN = 0
  }

  /** called ~10×/sec */
  update() {
    if (!this.ctx || !this.on) return
    const t = this.ctx.currentTime
    const id = ids[store.active] ?? 'hero'
    const m = mixes[id] ?? mixes.hero

    // section changes only after the new chapter has been "current" for a moment (fast scrubbing never thrashes the arrangement)
    const want = this.sectionKey()
    if (want !== this.pendKey) {
      this.pendKey = want
      this.pendSince = t
    }
    if (this.pendKey !== this.key && t - this.pendSince > 0.45) this.enter(this.pendKey)
    const s = this.sect

    let rain = m.rain
    let drone = m.drone
    let heart = m.heart
    this.intensity = 0
    this.tempoMul = 1
    if (store.active === STORM) {
      const p = store.local[STORM]
      rain = 1 - smooth(0.745, 0.9, p) * 0.97
      drone = 0.6 - smooth(0.745, 0.9, p) * 0.2
      if (this.key === 'storm') {
        this.intensity = smooth(0.02, 0.72, p) // urgency climbs through the four failed grabs
        this.tempoMul = lerp(0.95, 1.2, this.intensity)
      }
    }
    if (id === 'timeline') {
      this.intensity = smooth(0.1, 0.95, store.local[store.active])
      this.tempoMul = lerp(0.95, 1.12, this.intensity)
    }
    this.bpm = m.bpm ?? 70

    // closing chapter: strings swell with its pinned scroll progress, a noise riser climbs, then the
    // resolution lands exactly as "This is just the beginning." appears
    let pad = s.pad * (1 + 0.5 * this.intensity)
    let lead = s.lead?.lvl ?? 0
    let riser = 0
    const pn = store.active === NOW ? pinnedProgress(NOW) : 0
    if (store.active === NOW) {
      if (!this.resolved) {
        pad = lerp(0.45, 0.95, smooth(0.2, 0.72, pn))
        lead = lerp(0.55, 0.85, smooth(0.2, 0.72, pn))
        riser = smooth(0.38, 0.72, pn) * 0.22
        this.riserBp.frequency.setTargetAtTime(300 + pn * 4800, t, 0.3)
      }
      if (pn >= 0.72 && this.prevPn < 0.72 && t - this.resolveAt > 8) this.resolve()
    }
    if (store.active !== NOW || pn < 0.45) this.resolved = false
    this.prevPn = pn

    // the choke: low strings swell and a riser climbs as it tightens, then it all lets go
    if (id === 'sunset') {
      const p = store.local[store.active]
      const tight = smooth(0.38, 0.62, p) * (1 - smooth(0.78, 0.84, p))
      pad *= 1 + 0.9 * tight
      riser = Math.max(riser, tight * 0.16)
      this.riserBp.frequency.setTargetAtTime(220 + tight * 1500, t, 0.3)
      heart = Math.max(heart, tight * 0.6)
      this.bpm = 72 + tight * 24
    }
    // the bone snaps: the score ducks for a breath (stingers do the rest)
    const duck = t < this.duckUntil ? 0.25 : 1

    const set = (g: GainNode, v: number, tc = 0.35) => g.gain.setTargetAtTime(v, t, tc)
    set(this.gains.rain, rain * 0.35)
    set(this.gains.crowd, m.crowd * 0.45)
    set(this.gains.drone, drone * 0.5)
    set(this.gains.heart, heart * 0.9)
    // music sits under the ambience: the louder the rain / crowd, the further it ducks (and fast duck for stingers)
    const amb = Math.min(1, rain * 0.9 + m.crowd * 0.8)
    this.music.gain.setTargetAtTime((1 - 0.28 * amb) * duck, t, duck < 1 ? 0.03 : 0.5)
    // slow fades so the arrangement changes feel like a crossfade, never a cut
    set(this.gains.pad, pad * 0.9, 1.4)
    set(this.gains.lead, Math.min(1, lead) * 0.9, 1.1)
    set(this.gains.pulse, 1, 0.5)
    set(this.gains.drums, 1, 0.3)
    set(this.gains.bass, 1, 0.3)
    set(this.gains.riser, riser, 0.5)
  }

  // ------------------------------------------------------------------------------------------------ stingers
  oneShot(kind: HitName) {
    if (!this.ctx || !this.on) return
    const c = this.ctx
    const t = c.currentTime
    if (t - (this.lastHit[kind] ?? -9) < (kind === 'ground-hit' ? 0.12 : 0.8)) return
    this.lastHit[kind] = t
    const out = c.createGain()
    out.connect(this.master)
    const sub = (f0: number, f1: number, len: number, v: number, at = t) => {
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len)
      const g = c.createGain(); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + len * 1.4)
      o.connect(g); g.connect(out); o.start(at); o.stop(at + len * 1.5)
    }
    const burst = (freq: number, q: number, len: number, v: number, type: BiquadFilterType = 'bandpass', at = t) => {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
      const g = c.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + Math.min(0.02, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.001, at + len)
      n.connect(f); f.connect(g); g.connect(out); n.start(at, Math.random() * 0.5, len + 0.05)
    }
    const chordSwell = (freqs: number[], attack: number, hold: number, v: number, cut: number, wave: OscillatorType = 'sawtooth') => {
      const bus = c.createGain()
      bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(1, t + attack); bus.gain.setValueAtTime(1, t + attack + hold); bus.gain.linearRampToValueAtTime(0, t + attack + hold + 3)
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cut * 0.4, t); lp.frequency.linearRampToValueAtTime(cut, t + attack)
      lp.connect(bus); bus.connect(out); bus.connect(this.send)
      freqs.forEach((f, i) => {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(); o.type = wave; o.frequency.value = f; o.detune.value = det + i
          const g = c.createGain(); g.gain.value = v
          o.connect(g); g.connect(lp); o.start(t); o.stop(t + attack + hold + 3.2)
        }
      })
    }

    if (kind === 'van-hit') {
      sub(120, 34, 0.35, 1)
      burst(900, 0.5, 1.6, 0.9, 'bandpass') // crowd gasp/roar
      this.duckUntil = t + 0.5
    } else if (kind === 'ground-hit') {
      sub(95, 38, 0.2, 0.7)
      burst(1400, 0.8, 0.07, 0.35)
    } else if (kind === 'storm-grab') {
      // payoff: deep boom + a rising major shimmer chord as the sea lets go
      sub(90, 30, 1.2, 1.2)
      ;[261.6, 329.6, 392, 523.3, 659.3].forEach((fr, i) => {
        const s = c.createOscillator(); s.type = 'triangle'; s.frequency.value = fr
        const sg = c.createGain()
        sg.gain.setValueAtTime(0, t + 0.1 * i)
        sg.gain.linearRampToValueAtTime(0.16, t + 0.1 * i + 0.5)
        sg.gain.exponentialRampToValueAtTime(0.001, t + 4.2)
        s.connect(sg); sg.connect(out); s.start(t + 0.1 * i); s.stop(t + 4.4)
      })
    } else if (kind === 'choke-tight') {
      // low strings groan up and tighten
      chordSwell([73.42, 110, 146.83, 174.61], 3.5, 1.5, 0.07, 1500)
      burst(300, 1.4, 3.5, 0.18, 'bandpass')
    } else if (kind === 'choke-release') {
      // the hold lets go: a long exhale and a warm major chord blooming
      burst(1300, 0.5, 1.1, 0.3, 'lowpass')
      sub(70, 40, 1.2, 0.6)
      chordSwell([146.83, 185, 220, 293.66, 369.99], 1.3, 3.5, 0.045, 1700, 'triangle')
    } else if (kind === 'foot-crack') {
      burst(2200, 0.6, 0.07, 1.1, 'highpass') // the snap
      sub(70, 28, 0.3, 1)
      burst(500, 0.8, 0.4, 0.3, 'bandpass', t + 0.05)
      this.duckUntil = t + 1.4
    } else if (kind === 'foot-heal') {
      // glassy shimmer rising into a warm A-major-add9 bloom with a high violin line
      ;[880, 1318.5, 1760, 2637].forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f
        const g = c.createGain()
        const s = t + i * 0.18
        g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.07, s + 0.4); g.gain.exponentialRampToValueAtTime(0.001, s + 3)
        o.connect(g); g.connect(out); g.connect(this.send); o.start(s); o.stop(s + 3.1)
      })
      chordSwell([220, 277.18, 329.63, 554.37], 1.8, 2.5, 0.04, 2000, 'triangle')
      this.note(t + 0.7, 5, 880, 0.24, 'violin')
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
