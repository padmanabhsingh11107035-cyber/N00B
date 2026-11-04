/**
 * Fully synthesized audio: every sound effect, the wilderness ambience and the adaptive score are
 * generated with Web Audio, so the game ships no audio files. Voices are bounded and throttled.
 *
 * Mix: Music and SFX routes each cross one base gain (music 3× and SFX 2× over the inherited
 * template levels) before a master limiter that keeps the combined peak under 0 dBFS.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'hitWeak' | 'hitVital' | 'charge' | 'dodge' | 'hurt' | 'roar' | 'stomp'
  | 'slam' | 'grapple' | 'clamp' | 'buck' | 'potion' | 'gather' | 'break' | 'victory' | 'fail' | 'ui'
  | 'uiConfirm' | 'bite' | 'whoosh' | 'volley' | 'blast' | 'splash' | 'banner' | 'step' | 'faint' | 'evade' | 'brace'
  | 'trueSlash' | 'zip' | 'crumble' | 'stamp' | 'metal1' | 'metal2'

/** Recorded SFX mix trims (the generated files are loudness-normalised; this balances roles). */
const SAMPLE_GAIN: Partial<Record<Sfx, number>> = {
  step: 0.55, ui: 0.5, uiConfirm: 0.7, swing: 0.8, stomp: 0.9, roar: 1, banner: 0.7, clamp: 0.8, gather: 0.8, zip: 0.7, charge: 0.8, evade: 0.9,
}
/** Synth fallback for new sample-only cues when their file has not streamed in yet. */
const SYNTH_FALLBACK: Partial<Record<Sfx, Sfx>> = { trueSlash: 'slam', zip: 'whoosh', crumble: 'slam', stamp: 'banner', metal1: 'hit', metal2: 'hitWeak' }

export type MusicCue = 'explore' | 'battle' | 'enraged' | 'victory'
type Track = { el: HTMLAudioElement; gain: GainNode; started: boolean; idleSince: number }

type PlayOpts = { volume?: number; pitch?: number }

const MUSIC_BASE = 1.65
const SFX_BASE = 1.6
const MAX_VOICES = 28

export class AudioEngine {
  private ctx?: AudioContext
  private master?: GainNode
  private musicBus?: GainNode
  private sfxBus?: GainNode
  private noise?: AudioBuffer
  private voices = 0
  private lastPlayed = new Map<Sfx, number>()
  private volumes = { music: 0.7, sfx: 0.85, muted: false }
  private ambience?: { wind: GainNode; water: GainNode; windFilter: BiquadFilterNode }
  private musicState = { intensity: 0, target: 0, nextBeat: 0, beat: 0, nextChord: 0, chord: 0, nextPluck: 0, paused: false }
  private padVoices: { osc: OscillatorNode[]; gain: GainNode }[] = []
  private padFilter?: BiquadFilterNode
  private drumBus?: GainNode
  private scheduler = 0
  private nextBird = 0
  /** Sample lookup (set by main from the staged asset loader). */
  buffers: ((name: string) => AudioBuffer | undefined) | null = null
  private musicUrls: Partial<Record<MusicCue, string>> | null = null
  private tracks = new Map<MusicCue, Track>()
  private cue: MusicCue = 'explore'
  private stingerUntil = 0
  private ambLoops: { wind?: AudioBufferSourceNode; water?: AudioBufferSourceNode; heart?: AudioBufferSourceNode } = {}
  private ambSample?: { wind: GainNode; water: GainNode; heart: GainNode }
  private heart = 0

  /** Use recorded music cues (streamed via media elements) instead of the synthesized score. */
  setMusic(urls: Partial<Record<MusicCue, string>>): void {
    this.musicUrls = urls
  }

  /** One-shot musical stinger over the adaptive mix (victory fanfare). */
  stinger(cue: MusicCue, seconds: number): void {
    if (!this.ctx) return
    this.stingerUntil = this.ctx.currentTime + seconds
    this.switchCue(cue, true)
  }

  /** Low-health heartbeat loop level 0..1. */
  setHeartbeat(k: number): void {
    this.heart = Math.max(0, Math.min(1, k))
  }

  private track(cue: MusicCue): Track | undefined {
    const url = this.musicUrls?.[cue]
    if (!url || !this.ctx || !this.musicBus) return undefined
    let tr = this.tracks.get(cue)
    if (!tr) {
      const el = new Audio()
      el.src = url
      el.loop = cue !== 'victory'
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      const src = this.ctx.createMediaElementSource(el)
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.musicBus)
      tr = { el, gain, started: false, idleSince: 0 }
      this.tracks.set(cue, tr)
    }
    return tr
  }

  private switchCue(cue: MusicCue, restart = false): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.cue = cue
    for (const [name, tr] of this.tracks) if (name !== cue) tr.gain.gain.setTargetAtTime(0, now, cue === 'victory' ? 0.25 : 0.9)
    const tr = this.track(cue)
    if (!tr) return
    if (restart || (tr.el.paused && now - tr.idleSince > 40)) tr.el.currentTime = 0
    if (tr.el.paused) void tr.el.play().catch(() => undefined)
    tr.started = true
    tr.gain.gain.setTargetAtTime(cue === 'victory' ? 0.95 : cue === 'explore' ? 0.62 : 0.72, now, cue === 'victory' ? 0.05 : 0.8)
  }

  private updateTracks(): void {
    const ctx = this.ctx
    if (!ctx || !this.musicUrls) return
    const now = ctx.currentTime
    const ms = this.musicState
    if (now >= this.stingerUntil) {
      const want: MusicCue = ms.target >= 0.95 ? 'enraged' : ms.target >= 0.5 ? 'battle' : 'explore'
      if (want !== this.cue || !this.tracks.get(want)?.started) this.switchCue(want)
    }
    // Park silent tracks so only one or two ever decode at once.
    for (const [name, tr] of this.tracks) {
      if (name === this.cue || tr.el.paused) continue
      if (tr.gain.gain.value < 0.01) {
        if (!tr.idleSince || tr.idleSince < now - 60) tr.idleSince = now
        if (now - tr.idleSince > 2.5) tr.el.pause()
      } else tr.idleSince = 0
    }
    if (ms.paused) for (const tr of this.tracks.values()) tr.el.volume = 0.6
    else for (const tr of this.tracks.values()) tr.el.volume = 1
  }

  /** Swap synthesized ambience for recorded loops as soon as their buffers arrive. */
  private updateAmbienceSamples(): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxBus || !this.buffers) return
    if (!this.ambSample) {
      const mk = () => {
        const g = ctx.createGain()
        g.gain.value = 0
        g.connect(this.sfxBus!)
        return g
      }
      this.ambSample = { wind: mk(), water: mk(), heart: mk() }
    }
    const loop = (key: 'wind' | 'water' | 'heart', name: string) => {
      if (this.ambLoops[key]) return
      const buf = this.buffers!(name)
      if (!buf) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(this.ambSample![key])
      src.start()
      this.ambLoops[key] = src
      // Mute the synthesized counterpart.
      if (key === 'wind') this.ambience?.wind.disconnect()
      if (key === 'water') this.ambience?.water.disconnect()
    }
    loop('wind', 'amb_wind')
    loop('water', 'amb_water')
    loop('heart', 'heartbeat')
    this.ambSample.heart.gain.setTargetAtTime(this.heart * 0.7, ctx.currentTime, 0.3)
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      const limiter = this.ctx.createDynamicsCompressor()
      limiter.threshold.value = -6
      limiter.knee.value = 4
      limiter.ratio.value = 16
      limiter.attack.value = 0.003
      limiter.release.value = 0.2
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(limiter).connect(this.ctx.destination)
      this.musicBus = this.ctx.createGain()
      this.sfxBus = this.ctx.createGain()
      this.musicBus.connect(this.master)
      this.sfxBus.connect(this.master)
      this.noise = this.makeNoise(2)
      this.applyVolumes()
      this.startAmbience()
      this.startMusic()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.volumes = { music, sfx, muted }
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return
    const t = this.ctx.currentTime
    const m = this.volumes.muted ? 0 : this.volumes.music * MUSIC_BASE
    const s = this.volumes.muted ? 0 : this.volumes.sfx * SFX_BASE
    this.musicBus.gain.setTargetAtTime(m * (this.musicState.paused ? 0.45 : 1), t, 0.05)
    this.sfxBus.gain.setTargetAtTime(s, t, 0.05)
  }

  /** Pause ducks the music and silences ambience movement; nothing restarts on resume. */
  setPaused(paused: boolean): void {
    this.musicState.paused = paused
    this.applyVolumes()
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend()
  }
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  /** 0 = exploring, 1 = full battle (drums). */
  setIntensity(v: number): void {
    this.musicState.target = Math.max(0, Math.min(1, v))
  }

  /** Wind 0..1, water proximity 0..1. */
  setAmbience(wind: number, water: number): void {
    if (!this.ctx || !this.ambience) return
    const t = this.ctx.currentTime
    this.ambience.wind.gain.setTargetAtTime(0.05 + wind * 0.12, t, 0.5)
    this.ambience.water.gain.setTargetAtTime(water * 0.22, t, 0.4)
    if (this.ambSample) {
      this.ambSample.wind.gain.setTargetAtTime(this.musicState.paused ? 0.05 : 0.12 + wind * 0.3, t, 0.6)
      this.ambSample.water.gain.setTargetAtTime(water * 0.55, t, 0.4)
    }
  }

  play(name: Sfx, opts: PlayOpts = {}): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return
    const vol = opts.volume ?? 1
    if (vol < 0.02) return
    const now = ctx.currentTime
    const last = this.lastPlayed.get(name) ?? -1
    if (now - last < 0.035) return
    if (this.voices >= MAX_VOICES) return
    this.lastPlayed.set(name, now)
    const out = ctx.createGain()
    out.gain.value = vol
    out.connect(this.sfxBus)
    const p = opts.pitch ?? 1
    this.voices += 1
    const buf = this.buffers?.(name)
    let dur: number
    if (buf) {
      const src = ctx.createBufferSource()
      src.buffer = buf
      // Small random detune so repeated hits never sound identical.
      src.playbackRate.value = p * (0.96 + Math.random() * 0.08)
      out.gain.value = vol * (SAMPLE_GAIN[name] ?? 1)
      src.connect(out)
      src.start(now)
      dur = buf.duration / src.playbackRate.value
    } else dur = this.synth(SYNTH_FALLBACK[name] ?? name, out, now, p)
    window.setTimeout(() => {
      this.voices -= 1
      out.disconnect()
    }, (dur + 0.2) * 1000)
  }

  // ─── synthesis ──────────────────────────────────────────────────────────

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1
    return buf
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private noiseHit(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    this.env(g, t, attack, peak, dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 1.2)
    src.stop(t + attack + dur + 0.05)
  }

  private tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    this.env(g, t, attack, peak, dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + attack + dur + 0.05)
  }

  private synth(name: Sfx, out: GainNode, t: number, p: number): number {
    switch (name) {
      case 'swing':
        this.noiseHit(out, t, 0.28, 'bandpass', 500 * p, 2400 * p, 1.4, 0.5, 0.06)
        return 0.4
      case 'swingHeavy':
        this.noiseHit(out, t, 0.45, 'bandpass', 260 * p, 1400 * p, 1.2, 0.7, 0.09)
        this.tone(out, t + 0.05, 'sine', 90 * p, 50 * p, 0.35, 0.25, 0.08)
        return 0.6
      case 'hit':
        this.tone(out, t, 'sine', 150 * p, 55 * p, 0.22, 0.9)
        this.noiseHit(out, t, 0.16, 'lowpass', 2600 * p, 400, 0.8, 0.7)
        return 0.3
      case 'hitWeak':
        this.tone(out, t, 'sine', 180 * p, 60 * p, 0.28, 1)
        this.noiseHit(out, t, 0.22, 'lowpass', 4200 * p, 500, 0.9, 0.8)
        this.tone(out, t, 'triangle', 900 * p, 700 * p, 0.25, 0.12)
        return 0.35
      case 'hitVital':
        this.tone(out, t, 'sine', 120 * p, 38 * p, 0.55, 1)
        this.noiseHit(out, t, 0.35, 'lowpass', 5000 * p, 300, 0.7, 0.9)
        this.tone(out, t + 0.02, 'triangle', 1320 * p, 1250 * p, 0.7, 0.14, 0.01)
        this.tone(out, t + 0.02, 'sine', 1980 * p, 1900 * p, 0.8, 0.08, 0.01)
        return 0.9
      case 'charge':
        this.tone(out, t, 'triangle', 420 * p, 840 * p, 0.22, 0.28)
        this.tone(out, t + 0.04, 'sine', 1260 * p, 1300 * p, 0.35, 0.12)
        return 0.45
      case 'dodge':
        this.noiseHit(out, t, 0.3, 'bandpass', 900 * p, 300 * p, 0.9, 0.35, 0.03)
        this.tone(out, t + 0.22, 'sine', 90, 60, 0.12, 0.25)
        return 0.4
      case 'evade':
        this.tone(out, t, 'sine', 1400 * p, 2100 * p, 0.18, 0.14)
        return 0.25
      case 'hurt':
        this.tone(out, t, 'sine', 120 * p, 45, 0.3, 0.9)
        this.noiseHit(out, t, 0.25, 'lowpass', 1800, 200, 0.7, 0.7)
        return 0.4
      case 'roar': {
        const ctx = this.ctx!
        const dur = 2.1
        for (const [mul, gain] of [[1, 0.5], [1.51, 0.28], [0.5, 0.45]] as const) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          const base = 68 * p * mul
          o.frequency.setValueAtTime(base * 0.8, t)
          o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.35)
          o.frequency.linearRampToValueAtTime(base * 0.9, t + dur)
          const lfo = ctx.createOscillator()
          lfo.frequency.value = 23 + mul * 3
          const lfoGain = ctx.createGain()
          lfoGain.gain.value = base * 0.08
          lfo.connect(lfoGain).connect(o.frequency)
          const f = ctx.createBiquadFilter()
          f.type = 'lowpass'
          f.frequency.setValueAtTime(600, t)
          f.frequency.linearRampToValueAtTime(1500, t + 0.3)
          f.frequency.linearRampToValueAtTime(500, t + dur)
          const g = ctx.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(gain, t + 0.18)
          g.gain.setValueAtTime(gain, t + dur * 0.6)
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
          o.connect(f).connect(g).connect(out)
          o.start(t)
          lfo.start(t)
          o.stop(t + dur + 0.05)
          lfo.stop(t + dur + 0.05)
        }
        this.noiseHit(out, t, dur * 0.9, 'bandpass', 700, 300, 0.6, 0.45, 0.15)
        return dur + 0.1
      }
      case 'stomp':
        this.tone(out, t, 'sine', 70 * p, 32, 0.35, 0.9)
        this.noiseHit(out, t, 0.25, 'lowpass', 500, 80, 0.7, 0.5)
        return 0.4
      case 'slam':
        this.tone(out, t, 'sine', 80 * p, 25, 0.9, 1)
        this.noiseHit(out, t, 0.9, 'lowpass', 1400, 60, 0.6, 0.9)
        this.noiseHit(out, t + 0.05, 0.4, 'highpass', 3000, 800, 0.5, 0.25)
        return 1
      case 'grapple':
        this.noiseHit(out, t, 0.22, 'bandpass', 1200 * p, 4200 * p, 3, 0.35, 0.02)
        this.tone(out, t, 'square', 1800 * p, 600 * p, 0.12, 0.05)
        return 0.3
      case 'clamp':
        this.tone(out, t, 'triangle', 2400 * p, 2200 * p, 0.12, 0.25)
        this.tone(out, t, 'square', 800 * p, 400, 0.05, 0.12)
        this.noiseHit(out, t, 0.08, 'highpass', 3000, 2000, 0.8, 0.3)
        return 0.2
      case 'buck':
        this.tone(out, t, 'sine', 95 * p, 40, 0.4, 0.8)
        this.noiseHit(out, t, 0.3, 'lowpass', 900, 100, 0.6, 0.5)
        return 0.45
      case 'brace':
        this.tone(out, t, 'triangle', 520, 480, 0.12, 0.2)
        return 0.2
      case 'potion':
        for (let i = 0; i < 4; i += 1) this.tone(out, t + i * 0.12, 'sine', (380 + i * 60) * p, (520 + i * 60) * p, 0.1, 0.22)
        this.tone(out, t + 0.55, 'triangle', 880, 1320, 0.4, 0.14)
        return 1
      case 'gather':
        this.noiseHit(out, t, 0.3, 'highpass', 2500, 5000, 0.7, 0.25, 0.04)
        this.tone(out, t + 0.2, 'triangle', 988, 1318, 0.3, 0.14)
        return 0.6
      case 'break':
        this.noiseHit(out, t, 0.6, 'highpass', 5000, 1200, 0.6, 0.6)
        this.tone(out, t, 'sine', 110, 40, 0.6, 0.9)
        this.tone(out, t + 0.05, 'triangle', 1500, 900, 0.5, 0.15)
        return 0.8
      case 'bite':
        this.noiseHit(out, t, 0.12, 'bandpass', 1800, 700, 1.2, 0.7)
        this.tone(out, t, 'square', 220 * p, 90, 0.1, 0.18)
        return 0.2
      case 'whoosh':
        this.noiseHit(out, t, 0.7, 'bandpass', 200 * p, 900 * p, 0.9, 0.7, 0.2)
        return 0.9
      case 'volley':
        for (let i = 0; i < 5; i += 1) this.noiseHit(out, t + i * 0.07, 0.12, 'bandpass', 700 + i * 90, 300, 1.5, 0.4)
        return 0.6
      case 'blast':
        this.tone(out, t, 'sine', 110 * p, 35, 0.45, 0.8)
        this.noiseHit(out, t, 0.4, 'lowpass', 3500, 200, 0.6, 0.7)
        return 0.5
      case 'splash':
        this.noiseHit(out, t, 0.35, 'bandpass', 1500 * p, 600, 0.8, 0.45, 0.01)
        return 0.4
      case 'step':
        this.noiseHit(out, t, 0.06, 'lowpass', 900 * p, 300, 0.7, 0.18)
        return 0.1
      case 'banner':
        this.tone(out, t, 'sine', 196, 194, 1.6, 0.3, 0.01)
        this.tone(out, t, 'triangle', 392, 390, 1.2, 0.12, 0.01)
        this.tone(out, t, 'sine', 587, 585, 1.0, 0.06, 0.01)
        return 1.7
      case 'victory': {
        const notes = [392, 494, 587, 784]
        notes.forEach((f, i) => {
          this.tone(out, t + i * 0.16, 'triangle', f, f, 0.9, 0.22, 0.02)
          this.tone(out, t + i * 0.16, 'sawtooth', f / 2, f / 2, 0.8, 0.05, 0.02)
        })
        this.tone(out, t + 0.7, 'sine', 784, 784, 2, 0.18, 0.05)
        return 2.8
      }
      case 'fail':
        ;[294, 262, 196].forEach((f, i) => this.tone(out, t + i * 0.35, 'triangle', f, f * 0.98, 0.8, 0.2, 0.03))
        return 1.9
      case 'faint':
        this.tone(out, t, 'sine', 300, 80, 1.2, 0.3, 0.05)
        return 1.3
      case 'ui':
        this.tone(out, t, 'triangle', 660 * p, 700 * p, 0.06, 0.12)
        return 0.1
      case 'uiConfirm':
        this.tone(out, t, 'triangle', 523, 523, 0.1, 0.16)
        this.tone(out, t + 0.07, 'triangle', 784, 784, 0.18, 0.16)
        return 0.3
    }
    return 0.1
  }

  // ─── ambience ────────────────────────────────────────────────────────────

  private startAmbience(): void {
    const ctx = this.ctx!
    const mk = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noise!
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(f).connect(g).connect(this.sfxBus!)
      src.start()
      return { g, f }
    }
    const wind = mk('bandpass', 420, 0.6)
    const water = mk('lowpass', 1100, 0.4)
    this.ambience = { wind: wind.g, water: water.g, windFilter: wind.f }
    // Slow gusts.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const depth = ctx.createGain()
    depth.gain.value = 180
    lfo.connect(depth).connect(wind.f.frequency)
    lfo.start()
  }

  // ─── adaptive music ──────────────────────────────────────────────────────

  private startMusic(): void {
    const ctx = this.ctx!
    this.nextBird = ctx.currentTime + 4
    if (this.musicUrls) {
      this.switchCue('explore')
      this.scheduler = window.setInterval(() => this.schedule(), 120)
      return
    }
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 900
    this.padFilter.Q.value = 0.5
    const padGain = ctx.createGain()
    padGain.gain.value = 0.16
    this.padFilter.connect(padGain).connect(this.musicBus!)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 350
    lfo.connect(lfoDepth).connect(this.padFilter.frequency)
    lfo.start()
    for (let v = 0; v < 4; v += 1) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.padFilter)
      const oscs = [0, 1].map(k => {
        const o = ctx.createOscillator()
        o.type = k === 0 ? 'sawtooth' : 'triangle'
        o.detune.value = (k === 0 ? -7 : 6) + v
        o.connect(g)
        o.start()
        return o
      })
      this.padVoices.push({ osc: oscs, gain: g })
    }
    this.drumBus = ctx.createGain()
    this.drumBus.gain.value = 0
    this.drumBus.connect(this.musicBus!)
    this.musicState.nextChord = ctx.currentTime + 0.1
    this.musicState.nextBeat = ctx.currentTime + 0.5
    this.musicState.nextPluck = ctx.currentTime + 3
    this.nextBird = ctx.currentTime + 4
    this.scheduler = window.setInterval(() => this.schedule(), 120)
  }

  private schedule(): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const ms = this.musicState
    ms.intensity += (ms.target - ms.intensity) * 0.06
    const now = ctx.currentTime
    const ahead = now + 0.3
    this.updateAmbienceSamples()
    if (this.musicUrls) {
      this.updateTracks()
      this.birds(now)
      return
    }
    // Chords: D minor modal progression, one chord every 8 s (6 s in battle).
    const CHORDS = [
      [146.83, 220.0, 293.66, 349.23],
      [116.54, 174.61, 233.08, 293.66],
      [130.81, 196.0, 261.63, 329.63],
      [110.0, 164.81, 220.0, 277.18],
    ]
    if (ms.nextChord < ahead) {
      const chord = CHORDS[ms.chord % CHORDS.length]
      const t = Math.max(now, ms.nextChord)
      this.padVoices.forEach((v, i) => {
        const f = chord[i]
        v.osc.forEach(o => o.frequency.setTargetAtTime(f, t, 0.6))
        v.gain.gain.setTargetAtTime(0.18 - i * 0.025, t, 0.8)
      })
      this.padFilter?.frequency.setTargetAtTime(700 + ms.intensity * 900, t, 1)
      ms.chord += 1
      ms.nextChord = t + (ms.intensity > 0.5 ? 6 : 8)
    }
    // Sparse pentatonic plucks while exploring.
    if (ms.nextPluck < ahead) {
      const t = Math.max(now, ms.nextPluck)
      if (ms.intensity < 0.6) {
        const scale = [587.33, 659.25, 698.46, 880, 987.77, 1174.66]
        const f = scale[Math.floor(Math.random() * scale.length)]
        const g = ctx.createGain()
        g.connect(this.musicBus!)
        this.tone(g, t, 'triangle', f, f, 1.6, 0.05 * (1 - ms.intensity), 0.01)
        this.tone(g, t + 0.32, 'sine', f * 1.5, f * 1.5, 1.2, 0.025 * (1 - ms.intensity), 0.01)
        window.setTimeout(() => g.disconnect(), 3000)
      }
      ms.nextPluck = t + 2.2 + Math.random() * 3.5
    }
    // Battle drums fade in with intensity: taiko-style pattern at 96 bpm.
    this.drumBus!.gain.setTargetAtTime(ms.intensity * 0.55, now, 0.5)
    const beatLen = 60 / 96 / 2
    const PATTERN = [1, 0, 0.4, 0, 0.8, 0, 0.35, 0.5, 1, 0, 0.4, 0, 0.8, 0.3, 0.6, 0.7]
    while (ms.nextBeat < ahead) {
      const t = Math.max(now, ms.nextBeat)
      const hit = PATTERN[ms.beat % PATTERN.length]
      if (hit > 0 && ms.intensity > 0.05) {
        this.tone(this.drumBus!, t, 'sine', 120, 42, 0.35, 0.9 * hit)
        this.noiseHit(this.drumBus!, t, 0.12, 'lowpass', 900, 200, 0.6, 0.35 * hit)
        if (ms.beat % 4 === 2) this.noiseHit(this.drumBus!, t, 0.05, 'highpass', 6000, 4000, 0.6, 0.12)
      }
      ms.beat += 1
      ms.nextBeat = t + beatLen
    }
    this.birds(now)
  }

  private birds(now: number): void {
    const ctx = this.ctx!
    const ms = this.musicState
    // Birdsong when calm.
    if (now > this.nextBird) {
      this.nextBird = now + 3 + Math.random() * 7
      if (ms.intensity < 0.3 && this.sfxBus) {
        const g = ctx.createGain()
        g.gain.value = 0.35
        g.connect(this.sfxBus)
        const base = 2400 + Math.random() * 1600
        const n = 2 + Math.floor(Math.random() * 4)
        for (let i = 0; i < n; i += 1) this.tone(g, now + i * 0.13, 'sine', base, base * (1.2 + Math.random() * 0.3), 0.08, 0.05, 0.01)
        window.setTimeout(() => g.disconnect(), 2000)
      }
    }
  }

  dispose(): void {
    window.clearInterval(this.scheduler)
    for (const tr of this.tracks.values()) tr.el.pause()
    void this.ctx?.close()
  }
}
