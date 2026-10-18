import { store } from '../core/store'
import { onHit } from '../core/fx'
import { indexOf } from '../content/story'
import { smooth } from '../core/math'

/**
 * Procedural ambient audio — no files to download. Built with the Web Audio API:
 *   rain · crowd murmur · low drone · heartbeat, mixed per chapter, plus two one-shots
 *   (the knock-down thump and the Storm "grab" payoff). Muted by default; the toggle starts it.
 */
type Mix = { rain: number; crowd: number; drone: number; heart: number; bpm?: number }

const mixes: Record<string, Mix> = {
  hero: { rain: 0, crowd: 0, drone: 0.55, heart: 0 },
  driveway: { rain: 0, crowd: 0.12, drone: 0.25, heart: 0 },
  basement: { rain: 0, crowd: 0.55, drone: 0.15, heart: 0.18 },
  van: { rain: 0, crowd: 0.8, drone: 0.1, heart: 0.4, bpm: 96 },
  storm: { rain: 1, crowd: 0, drone: 0.6, heart: 0.28, bpm: 80 },
  quiet: { rain: 0, crowd: 0, drone: 0.15, heart: 0.7, bpm: 62 },
  sunset: { rain: 0, crowd: 0.1, drone: 0.4, heart: 0, },
  cloud: { rain: 0, crowd: 0, drone: 0.32, heart: 0 },
  gym: { rain: 0, crowd: 0.18, drone: 0.12, heart: 0.15, bpm: 76 },
  mma: { rain: 0, crowd: 0, drone: 0.34, heart: 0 },
  foot: { rain: 0, crowd: 0, drone: 0.18, heart: 0.45, bpm: 68 },
  flow: { rain: 0, crowd: 0, drone: 0.3, heart: 0.9, bpm: 44 },
  timeline: { rain: 0, crowd: 0, drone: 0.4, heart: 0, },
  now: { rain: 0, crowd: 0, drone: 0.6, heart: 0, },
}
const ids = Object.keys(mixes)
const STORM = indexOf('storm')

class Engine {
  ctx: AudioContext | null = null
  master!: GainNode
  gains: Record<'rain' | 'crowd' | 'drone' | 'heart', GainNode> = {} as never
  bpm = 70
  nextBeat = 0
  timer = 0
  on = false

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
    this.master.connect(c.destination)
    const mk = () => {
      const g = c.createGain()
      g.gain.value = 0
      g.connect(this.master)
      return g
    }
    this.gains = { rain: mk(), crowd: mk(), drone: mk(), heart: mk() }

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
    this.timer = window.setInterval(() => this.schedule(), 100)
  }

  /** heartbeat scheduler: "lub-dub" at the current bpm */
  private schedule() {
    const c = this.ctx
    if (!c || !this.on) return
    while (this.nextBeat < c.currentTime + 0.3) {
      this.thump(this.nextBeat, 1)
      this.thump(this.nextBeat + 0.22, 0.65)
      this.nextBeat += 60 / this.bpm
    }
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
    const set = (g: GainNode, v: number, tc = 0.35) => g.gain.setTargetAtTime(v, t, tc)
    set(this.gains.rain, rain * 0.35)
    set(this.gains.crowd, m.crowd * 0.45)
    set(this.gains.drone, drone * 0.5)
    set(this.gains.heart, m.heart * 0.9)
  }

  oneShot(kind: 'van-hit' | 'storm-grab') {
    if (!this.ctx || !this.on) return
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
