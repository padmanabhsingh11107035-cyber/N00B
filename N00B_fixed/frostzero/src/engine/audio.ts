/**
 * Web Audio mixer with music and SFX buses. Everything is synthesized (no audio files): one-shot
 * SFX, looping wind / avalanche rumble / rail-grind layers driven every frame by the game, and a
 * small step sequencer for the driving soundtrack. Call `unlock()` from a user gesture.
 */
export type Sfx = 'jump' | 'land' | 'slam' | 'perfect' | 'boost' | 'death' | 'checkpoint' | 'crumble' | 'grind' | 'ui' | 'win' | 'section'

type Layer = { gain: GainNode; filter: BiquadFilterNode }

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private noise: AudioBuffer
  private wind?: Layer
  private rumble?: Layer
  private grind?: Layer
  private seqTimer = 0
  private nextNote = 0
  private stepIndex = 0
  private musicOn = false
  private intensity = 0

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(comp).connect(this.ctx.destination)
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (!this.wind) this.startLayers()
  }

  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.5, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.85, t, 0.05)
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    return src
  }

  private layer(type: BiquadFilterType, freq: number, q: number): Layer {
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    const src = this.noiseSource()
    src.connect(filter).connect(gain).connect(this.sfx)
    src.start(0, Math.random() * 1.5)
    return { gain, filter }
  }

  private startLayers(): void {
    this.wind = this.layer('bandpass', 600, 0.6)
    this.rumble = this.layer('lowpass', 140, 1.2)
    this.grind = this.layer('bandpass', 2400, 4)
    const sub = this.ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 38
    sub.connect(this.rumble.gain)
    sub.start()
  }

  /** Continuous layers, 0..1 each; called every rendered frame. */
  setLayers(wind: number, rumble: number, grind: number): void {
    if (!this.wind || !this.rumble || !this.grind) return
    const t = this.ctx.currentTime
    this.wind.gain.gain.setTargetAtTime(wind * 0.16, t, 0.08)
    this.wind.filter.frequency.setTargetAtTime(400 + wind * 1400, t, 0.1)
    this.rumble.gain.gain.setTargetAtTime(rumble * rumble * 0.5, t, 0.1)
    this.grind.gain.gain.setTargetAtTime(grind * 0.07, t, 0.03)
    this.grind.filter.frequency.setTargetAtTime(2000 + grind * 900 + Math.random() * 300, t, 0.05)
  }

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(this.sfx)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }
    const hiss = (dur: number, freq: number, vol: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) => {
      const src = this.noiseSource()
      const f = this.ctx.createBiquadFilter()
      f.type = type
      f.frequency.setValueAtTime(freq, t)
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(f).connect(g).connect(this.sfx)
      src.start(t, Math.random())
      src.stop(t + dur + 0.05)
    }
    switch (name) {
      case 'jump': tone(260, 560, 0.12, 'triangle', 0.18); hiss(0.14, 1800, 0.12, 'highpass'); break
      case 'land': tone(140, 60, 0.12, 'sine', 0.3); hiss(0.12, 900, 0.18, 'lowpass', 300); break
      case 'slam': tone(900, 120, 0.2, 'sawtooth', 0.08); hiss(0.2, 3000, 0.12, 'bandpass', 500); break
      case 'perfect': tone(110, 40, 0.3, 'sine', 0.5); [660, 990].forEach((f, i) => tone(f, f * 1.02, 0.16, 'square', 0.06, 0.03 + i * 0.05)); break
      case 'boost': tone(220, 880, 0.35, 'sawtooth', 0.09); hiss(0.4, 800, 0.16, 'bandpass', 5000); break
      case 'death': tone(180, 40, 0.5, 'sawtooth', 0.22); hiss(0.6, 2500, 0.35, 'lowpass', 120); break
      case 'checkpoint': [784, 988, 1319].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.18, i * 0.07)); break
      case 'crumble': hiss(0.35, 3500, 0.18, 'highpass'); tone(90, 50, 0.25, 'square', 0.05); break
      case 'grind': tone(1400, 1800, 0.08, 'square', 0.05); break
      case 'ui': tone(700, 760, 0.05, 'triangle', 0.14); break
      case 'section': tone(392, 392, 0.16, 'triangle', 0.12); tone(587, 587, 0.24, 'triangle', 0.12, 0.09); break
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.01, 0.36, 'triangle', 0.2, i * 0.1)); break
    }
  }

  // ─── Music: 128 BPM, A minor, 16-step patterns ─────────────────────────
  /** 0 = title (pads + arp), 1 = run (drums and bass join). */
  setIntensity(level: number): void {
    this.intensity = level
  }

  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    this.nextNote = this.ctx.currentTime + 0.1
    this.stepIndex = 0
    const tick = () => {
      if (!this.musicOn || this.ctx.state !== 'running') return
      if (this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + 0.05
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.stepIndex, this.nextNote)
        this.nextNote += 60 / 128 / 4
        this.stepIndex += 1
      }
    }
    this.seqTimer = window.setInterval(tick, 40)
    tick()
  }

  stopMusic(): void {
    this.musicOn = false
    clearInterval(this.seqTimer)
  }

  private scheduleStep(i: number, t: number): void {
    const step = i % 16
    const bar = Math.floor(i / 16) % 4
    const roots = [55, 43.65, 49, 41.2] // A1 F1 G1 E1
    const root = roots[bar]
    const full = this.intensity > 0.5
    const out = this.music
    const env = (node: AudioNode, vol: number, dur: number) => {
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      node.connect(g).connect(out)
    }
    const noiseHit = (type: BiquadFilterType, freq: number, vol: number, dur: number) => {
      const src = this.noiseSource()
      const f = this.ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      src.connect(f)
      env(f, vol, dur)
      src.start(t, Math.random())
      src.stop(t + dur + 0.02)
    }
    if (full && step % 4 === 0) {
      const o = this.ctx.createOscillator()
      o.frequency.setValueAtTime(150, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      env(o, 0.8, 0.22)
      o.start(t)
      o.stop(t + 0.25)
    }
    if (full && step % 4 === 2) noiseHit('highpass', 7000, 0.12, 0.05)
    if (full && (step === 4 || step === 12)) noiseHit('bandpass', 1800, 0.22, 0.14)
    if (full && step % 2 === 1) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = root * (step % 8 === 7 ? 2 : 1)
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(900, t)
      f.frequency.exponentialRampToValueAtTime(180, t + 0.12)
      o.connect(f)
      env(f, 0.2, 0.14)
      o.start(t)
      o.stop(t + 0.16)
    }
    const chord = bar === 1 || bar === 2 ? [1, 1.26, 1.5, 2] : [1, 1.19, 1.5, 2]
    if (step % 2 === 0 || full) {
      const o = this.ctx.createOscillator()
      o.type = full ? 'square' : 'triangle'
      o.frequency.value = chord[(step * 3) % 4] * root * 8
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = full ? 2600 : 1600
      o.connect(f)
      env(f, full ? 0.05 : 0.07, 0.18)
      o.start(t)
      o.stop(t + 0.2)
    }
    if (step === 0) {
      for (const m of chord.slice(0, 3)) {
        for (const det of [-7, 7]) {
          const o = this.ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = root * 4 * m
          o.detune.value = det
          const f = this.ctx.createBiquadFilter()
          f.type = 'lowpass'
          f.frequency.value = 900
          const g = this.ctx.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(0.028, t + 0.4)
          g.gain.linearRampToValueAtTime(0.0001, t + 1.85)
          o.connect(f).connect(g).connect(out)
          o.start(t)
          o.stop(t + 1.9)
        }
      }
    }
  }
}
