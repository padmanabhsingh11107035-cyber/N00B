/**
 * Web Audio mixer with music and SFX buses, all synthesized (no audio files).
 *
 *   sources → sfx / music buses → master → warp low-pass → compressor → speakers
 *
 * - `play(name, opts)` fires a one-shot with optional volume / pitch / stereo pan and a per-sound
 *   throttle so a collapsing castle cannot trigger hundreds of overlapping voices.
 * - `setRumble(level)` drives a continuous low noise bed (collapse rumble).
 * - `setWarp(scale)` muffles everything during slow motion (hooked to the engine TimeScale).
 * - `startMusic()` plays a generative modal tune on a lookahead scheduler.
 *
 * Browsers only allow audio after a user gesture, so call `unlock()` from the first input.
 */
export type Sfx =
  | 'ui' | 'uiBack' | 'creak' | 'launch' | 'reload' | 'woodHit' | 'woodBreak' | 'stoneHit' | 'stoneBreak'
  | 'boom' | 'guard' | 'poof' | 'thud' | 'chain' | 'star' | 'win' | 'lose' | 'slowmo' | 'whistle'

export type PlayOptions = { volume?: number; pitch?: number; pan?: number }

const THROTTLE: Partial<Record<Sfx, number>> = {
  woodHit: 0.045, stoneHit: 0.05, woodBreak: 0.06, stoneBreak: 0.07, thud: 0.08, creak: 0.07, chain: 0.05, poof: 0.05, guard: 0.12, boom: 0.06,
}
const MAX_VOICES = 28

export class Audio {
  // The graph is created lazily on the first user gesture (`unlock`) so browsers never block or
  // warn about an AudioContext created before interaction. Until then every call is a no-op.
  ctx!: AudioContext
  private master!: GainNode
  private music!: GainNode
  private sfx!: GainNode
  private warp!: BiquadFilterNode
  private comp!: DynamicsCompressorNode
  private noise!: AudioBuffer
  private rumbleGain!: GainNode
  private rumbleFilter!: BiquadFilterNode
  private ready = false
  private volumes: [number, number, boolean, number] = [0.6, 0.8, false, 1]
  private wantMusic = false
  private last = new Map<Sfx, number>()
  private voices = 0
  private musicOn = false
  private musicTimer = 0
  private nextNote = 0
  private step16 = 0
  private phraseSeed = 1
  musicIntensity = 0.4

  private init(): void {
    if (this.ready) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ready = true
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.warp = this.ctx.createBiquadFilter()
    this.warp.type = 'lowpass'
    this.warp.frequency.value = 20000
    this.warp.Q.value = 0.8
    this.comp = this.ctx.createDynamicsCompressor()
    this.comp.threshold.value = -12
    this.comp.ratio.value = 4
    this.comp.attack.value = 0.003
    this.comp.release.value = 0.2
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.warp).connect(this.comp).connect(this.ctx.destination)
    // Shared white noise buffer.
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1
    // Rumble bed: looping noise through a low-pass, gain driven by the scene.
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    this.rumbleFilter = this.ctx.createBiquadFilter()
    this.rumbleFilter.type = 'lowpass'
    this.rumbleFilter.frequency.value = 140
    this.rumbleGain = this.ctx.createGain()
    this.rumbleGain.gain.value = 0
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.sfx)
    src.start()
  }

  unlock(): void {
    if (!this.ready) {
      this.init()
      if (!this.ready) return
      this.setVolumes(...this.volumes)
      if (this.wantMusic) {
        this.wantMusic = false
        this.startMusic()
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. `master` scales both buses. */
  setVolumes(music: number, sfx: number, muted = false, master = 1): void {
    this.volumes = [music, sfx, muted, master]
    if (!this.ready) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(muted ? 0 : master, t, 0.05)
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.05)
    this.sfx.gain.setTargetAtTime(sfx * 0.9, t, 0.05)
  }

  /** 1 = normal, lower = slow motion (muffled, darker). */
  setWarp(scale: number): void {
    if (!this.ready) return
    const k = Math.min(1, Math.max(0, (scale - 0.15) / 0.85))
    this.warp.frequency.setTargetAtTime(500 + 19500 * k * k * k, this.ctx.currentTime, 0.04)
  }

  /** Continuous collapse rumble, 0..1. */
  setRumble(level: number): void {
    if (!this.ready) return
    const l = Math.min(1, Math.max(0, level))
    const t = this.ctx.currentTime
    this.rumbleGain.gain.setTargetAtTime(l * 0.55, t, 0.15)
    this.rumbleFilter.frequency.setTargetAtTime(90 + l * 160, t, 0.2)
  }

  play(name: Sfx, opts: PlayOptions = {}): void {
    if (!this.ready || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    const gap = THROTTLE[name]
    if (gap && now - (this.last.get(name) ?? -1) < gap) return
    if (this.voices >= MAX_VOICES && name !== 'ui' && name !== 'boom') return
    this.last.set(name, now)
    const vol = opts.volume ?? 1
    const p = opts.pitch ?? 1
    const out = this.ctx.createStereoPanner()
    out.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0))
    out.connect(this.sfx)
    this.voices += 1
    window.setTimeout(() => {
      this.voices -= 1
      out.disconnect()
    }, 2600)
    const t = now + 0.005
    switch (name) {
      case 'ui':
        this.tone(out, t, 720 * p, 760 * p, 0.07, 'triangle', 0.22 * vol)
        this.tone(out, t + 0.03, 1080 * p, 1100 * p, 0.06, 'sine', 0.1 * vol)
        break
      case 'uiBack':
        this.tone(out, t, 520 * p, 380 * p, 0.09, 'triangle', 0.2 * vol)
        break
      case 'creak':
        this.noiseBurst(out, t, 0.035, 'bandpass', 1400 * p, 6, 0.12 * vol)
        this.tone(out, t, 180 * p, 140 * p, 0.05, 'square', 0.03 * vol)
        break
      case 'launch':
        this.tone(out, t, 90, 42, 0.35, 'sine', 0.75 * vol)
        this.noiseBurst(out, t, 0.12, 'lowpass', 900, 1, 0.5 * vol)
        this.noiseSweep(out, t + 0.03, 0.55, 500, 2600, 0.22 * vol)
        this.tone(out, t + 0.02, 240, 120, 0.12, 'triangle', 0.25 * vol)
        break
      case 'whistle':
        this.noiseSweep(out, t, 0.9, 2400 * p, 900 * p, 0.08 * vol)
        break
      case 'reload':
        this.noiseBurst(out, t, 0.04, 'bandpass', 2200, 4, 0.25 * vol)
        this.noiseBurst(out, t + 0.11, 0.05, 'bandpass', 1500, 4, 0.3 * vol)
        this.tone(out, t + 0.11, 160, 110, 0.1, 'sine', 0.3 * vol)
        break
      case 'woodHit':
        this.tone(out, t, 210 * p, 120 * p, 0.12, 'triangle', 0.45 * vol)
        this.noiseBurst(out, t, 0.06, 'bandpass', 900 * p, 2.5, 0.35 * vol)
        break
      case 'woodBreak':
        this.noiseBurst(out, t, 0.18, 'bandpass', 1800 * p, 1.2, 0.5 * vol)
        for (let i = 0; i < 4; i += 1) this.noiseBurst(out, t + 0.02 + i * 0.03 + Math.random() * 0.02, 0.03, 'highpass', 2500, 1, 0.3 * vol)
        this.tone(out, t, 160 * p, 70 * p, 0.2, 'triangle', 0.4 * vol)
        break
      case 'stoneHit':
        this.tone(out, t, 110 * p, 55 * p, 0.2, 'sine', 0.7 * vol)
        this.noiseBurst(out, t, 0.1, 'lowpass', 1100 * p, 1, 0.45 * vol)
        break
      case 'stoneBreak':
        this.tone(out, t, 80 * p, 36 * p, 0.45, 'sine', 0.85 * vol)
        this.noiseBurst(out, t, 0.35, 'lowpass', 1600 * p, 0.8, 0.6 * vol)
        for (let i = 0; i < 5; i += 1) this.noiseBurst(out, t + 0.04 + i * 0.045 + Math.random() * 0.03, 0.05, 'bandpass', 700 + Math.random() * 900, 3, 0.28 * vol)
        break
      case 'boom':
        this.tone(out, t, 70, 24, 1.1, 'sine', 1.0 * vol)
        this.tone(out, t, 140, 40, 0.4, 'sawtooth', 0.22 * vol)
        this.noiseBurst(out, t, 0.9, 'lowpass', 2400, 0.7, 0.9 * vol, 1.8)
        this.noiseBurst(out, t + 0.05, 1.4, 'lowpass', 500, 0.7, 0.5 * vol, 1.2)
        break
      case 'guard':
        // Comic yelp: a quick formant-ish vowel glide.
        this.tone(out, t, 520 * p, 760 * p, 0.09, 'sawtooth', 0.09 * vol, 1400)
        this.tone(out, t + 0.08, 760 * p, 300 * p, 0.28, 'sawtooth', 0.1 * vol, 1100)
        break
      case 'poof':
        this.noiseSweep(out, t, 0.35, 3000, 600, 0.3 * vol)
        this.tone(out, t, 880 * p, 1320 * p, 0.12, 'sine', 0.12 * vol)
        break
      case 'thud':
        this.tone(out, t, 95 * p, 45 * p, 0.25, 'sine', 0.6 * vol)
        this.noiseBurst(out, t, 0.08, 'lowpass', 600, 1, 0.35 * vol)
        break
      case 'chain':
        this.tone(out, t, 880 * p, 880 * p, 0.18, 'triangle', 0.16 * vol)
        this.tone(out, t, 1320 * p, 1320 * p, 0.22, 'sine', 0.08 * vol)
        break
      case 'star':
        this.tone(out, t, 988 * p, 988 * p, 0.35, 'triangle', 0.3 * vol)
        this.tone(out, t + 0.05, 1480 * p, 1480 * p, 0.45, 'sine', 0.18 * vol)
        this.noiseSweep(out, t, 0.3, 5000, 9000, 0.05 * vol)
        break
      case 'slowmo':
        this.noiseSweep(out, t, 0.7, 300, 90, 0.35 * vol)
        this.tone(out, t, 110, 55, 0.8, 'sine', 0.35 * vol)
        break
      case 'win':
        ;[587, 740, 880, 1175].forEach((f, i) => {
          this.tone(out, t + i * 0.12, f, f, 0.42, 'triangle', 0.26 * vol)
          this.tone(out, t + i * 0.12, f * 2, f * 2, 0.2, 'sine', 0.07 * vol)
        })
        this.tone(out, t + 0.5, 1175, 1175, 0.9, 'triangle', 0.22 * vol)
        break
      case 'lose':
        ;[440, 392, 349, 294].forEach((f, i) => this.tone(out, t + i * 0.2, f, f * 0.97, 0.45, 'triangle', 0.22 * vol))
        break
    }
  }

  private tone(out: AudioNode, t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number, lowpass?: number): void {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(Math.max(20, f0), t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    if (lowpass) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = lowpass
      o.connect(f).connect(g)
    } else o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private noiseBurst(out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, decay = 1): void {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(Math.max(0.0002, vol), t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay)
    s.connect(f).connect(g).connect(out)
    s.start(t, Math.random() * 1.5)
    s.stop(t + dur * decay + 0.05)
  }

  private noiseSweep(out: AudioNode, t: number, dur: number, f0: number, f1: number, vol: number): void {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.4
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f).connect(g).connect(out)
    s.start(t, Math.random() * 1.5)
    s.stop(t + dur + 0.05)
  }

  // ─── generative music ───────────────────────────────────────────────────
  // D dorian, 88 BPM, lute-like plucks over a drone with a soft frame drum.

  startMusic(): void {
    if (!this.ready) {
      this.wantMusic = true
      return
    }
    if (this.musicOn) return
    this.musicOn = true
    this.nextNote = this.ctx.currentTime + 0.1
    this.step16 = 0
    const tick = () => {
      if (!this.musicOn) return
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.step16, this.nextNote)
        this.nextNote += 60 / 88 / 4
        this.step16 += 1
      }
      this.musicTimer = window.setTimeout(tick, 60)
    }
    tick()
  }

  stopMusic(): void {
    this.musicOn = false
    clearTimeout(this.musicTimer)
  }

  private rand(): number {
    this.phraseSeed = (this.phraseSeed * 16807) % 2147483647
    return this.phraseSeed / 2147483647
  }

  private scheduleStep(i: number, t: number): void {
    const bar = Math.floor(i / 16)
    const s = i % 16
    const D = 146.83
    const scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17]
    const chords = [0, 0, -2, 3, 0, 5, -2, 0]
    const root = chords[bar % chords.length]
    const hz = (semi: number) => D * Math.pow(2, semi / 12)
    if (s === 0) {
      // Drone: root + fifth, soft and long.
      for (const [semi, v] of [[root - 12, 0.05], [root - 5, 0.03]] as const) this.pad(hz(semi), t, (60 / 88) * 4, v)
    }
    const intensity = this.musicIntensity
    if (s === 0 || s === 10 || (intensity > 0.6 && s === 6)) this.drum(t, s === 0 ? 0.3 : 0.16)
    if (s % 4 === 2 && intensity > 0.3) this.tick(t, 0.035 + intensity * 0.03)
    // Melody: phrase-structured random walk, denser with intensity.
    if (bar % 8 === 0 && s === 0) this.phraseSeed = 1 + ((bar / 8) % 4) * 977
    const density = 0.28 + intensity * 0.3
    if (s % 2 === 0 && this.rand() < (s % 4 === 0 ? density + 0.25 : density)) {
      const deg = Math.floor(this.rand() * 7)
      const note = scale[deg] + root + (this.rand() < 0.2 ? 12 : 0)
      this.pluck(hz(note), t, 0.12)
      if (s === 0 && this.rand() < 0.5) this.pluck(hz(note - 12), t, 0.06)
    }
  }

  private pluck(f: number, t: number, vol: number): void {
    const o = this.ctx.createOscillator()
    const o2 = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const lp = this.ctx.createBiquadFilter()
    o.type = 'triangle'
    o2.type = 'sawtooth'
    o.frequency.value = f
    o2.frequency.value = f * 2.003
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3200, t)
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.5)
    const g2 = this.ctx.createGain()
    g2.gain.value = 0.18
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    o.connect(lp)
    o2.connect(g2).connect(lp)
    lp.connect(g).connect(this.music)
    o.start(t)
    o2.start(t)
    o.stop(t + 1)
    o2.stop(t + 1)
  }

  private pad(f: number, t: number, dur: number, vol: number): void {
    for (const detune of [-7, 7]) {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      const lp = this.ctx.createBiquadFilter()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = detune
      lp.type = 'lowpass'
      lp.frequency.value = 420
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.8)
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4)
      o.connect(lp).connect(g).connect(this.music)
      o.start(t)
      o.stop(t + dur + 0.5)
    }
  }

  private drum(t: number, vol: number): void {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(120, t)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(g).connect(this.music)
    o.start(t)
    o.stop(t + 0.4)
    this.noiseBurst(this.music, t, 0.05, 'lowpass', 1200, 1, vol * 0.3)
  }

  private tick(t: number, vol: number): void {
    this.noiseBurst(this.music, t, 0.03, 'highpass', 6000, 1, vol)
  }
}
