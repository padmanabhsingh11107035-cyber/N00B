/**
 * Web Audio mixer.
 *
 * - Sound effects: ElevenLabs-generated clips in /audio/sfx, fetched and decoded in groups by the
 *   asset streamer (`loadClips`) as each stage of play needs them. Every effect also has a
 *   synthesized version that plays until (or if never) its file is ready, so audio never goes
 *   silent on a slow or failed download.
 * - Music: Lyria-generated tracks in /audio/music, streamed through <audio> elements (a 100 s
 *   stereo track decoded to PCM would cost ~35 MB of memory) and crossfaded on track changes.
 *   A track only starts buffering when its stage is prefetched (`prefetch`) or it starts playing.
 *   While exploring, the floor track runs through a low-pass filter; `setIntensity(1)` opens the
 *   filter and lifts the level for fights. If a track can't load, a synthesized loop takes over.
 */
export type Sfx =
  | 'ui' | 'swing' | 'hit' | 'crit' | 'bolt' | 'nova' | 'dash' | 'hurt' | 'block' | 'enemyDie' | 'enemyShoot'
  | 'telegraph' | 'lock' | 'unlock' | 'reward' | 'coin' | 'heal' | 'roar' | 'bossDie' | 'win' | 'lose' | 'portal' | 'rescue' | 'slam'
  | 'shush' | 'shelf' | 'pages' | 'blink' | 'libRoar' | 'descend'

export type Track = 'hub' | 'floor1' | 'floor2' | 'boss1' | 'boss2' | 'victory'

/** Mix level per clip (files are pre-levelled to the same loudness by scripts/process-audio.sh). */
const SFX_GAIN: Partial<Record<Sfx, number>> = {
  ui: 0.45, swing: 0.5, hit: 0.8, crit: 0.95, bolt: 0.55, nova: 1, dash: 0.5, hurt: 0.9, block: 0.75, enemyDie: 0.6,
  enemyShoot: 0.35, telegraph: 0.45, lock: 0.7, unlock: 0.6, reward: 0.7, coin: 0.4, heal: 0.7, roar: 1, bossDie: 1,
  lose: 0.85, portal: 0.7, rescue: 0.8, slam: 0.85, shush: 1, shelf: 0.9, pages: 0.7, blink: 0.7, libRoar: 1, descend: 0.9,
}
/** Clips that get slight pitch variation so rapid repeats don't sound mechanical. */
const VARY = new Set<Sfx>(['swing', 'hit', 'crit', 'enemyDie', 'enemyShoot', 'coin', 'dash', 'slam', 'shelf'])
/** Every sound that has a file ('win' is the Lyria victory fanfare, a music cue, so it has none). */
export const FILE_SFX: Sfx[] = (Object.keys(SFX_GAIN) as Sfx[])

const TRACK_GAIN: Record<Track, number> = { hub: 0.8, floor1: 0.85, floor2: 0.9, boss1: 0.85, boss2: 0.85, victory: 0.9 }

type Channel = { track: Track; el: HTMLAudioElement; gain: GainNode; failed: boolean; stopTimer: number }

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private musicBus: GainNode
  private sfx: GainNode
  private filter: BiquadFilterNode
  private level: GainNode
  private synthBus: GainNode
  private combat: GainNode
  private noise: AudioBuffer
  private buffers = new Map<Sfx, AudioBuffer>()
  private clipLoads = new Map<Sfx, Promise<void>>()
  private channels = new Map<Track, Channel>()
  private current: Track | null = null
  private synthOn = false
  private timer = 0
  private step = 0
  private nextTime = 0
  private intensity = 0
  private hidden = false
  private last = new Map<Sfx, number>()

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.musicBus = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    // Music chain: channels → filter → level → musicBus. The synth fallback shares the chain.
    this.filter = this.ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 20000
    this.filter.Q.value = 0.5
    this.level = this.ctx.createGain()
    this.synthBus = this.ctx.createGain()
    this.combat = this.ctx.createGain()
    this.combat.gain.value = 0
    this.combat.connect(this.synthBus)
    this.synthBus.connect(this.filter)
    this.filter.connect(this.level).connect(this.musicBus)
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 3
    this.musicBus.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(comp).connect(this.ctx.destination)
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1
  }

  /** Call from a user gesture: resumes the context (clips are loaded by the asset streamer). */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    // A track that was blocked by autoplay policy gets another chance on this gesture.
    const ch = this.current ? this.channels.get(this.current) : undefined
    if (ch && !ch.failed && ch.el.paused && !this.hidden) void ch.el.play().catch(() => undefined)
  }

  /**
   * Fetch + decode a group of clips (decoding works before the context is unlocked). Resolves
   * when all are ready or have failed; failures keep the synthesized fallback. Idempotent.
   */
  loadClips(names: readonly Sfx[]): Promise<void> {
    return Promise.all(names.filter(n => FILE_SFX.includes(n)).map(name => {
      let p = this.clipLoads.get(name)
      if (!p) {
        p = (async () => {
          try {
            const res = await fetch(`${BASE}audio/sfx/${name}.mp3`)
            if (!res.ok) return
            this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()))
          } catch {
            /* keep the synthesized fallback for this sound */
          }
        })()
        this.clipLoads.set(name, p)
      }
      return p
    })).then(() => undefined)
  }

  hasClip(name: Sfx): boolean {
    return this.buffers.has(name)
  }

  /** Number of decoded SFX clips (used by the debug overlay and smoke test). */
  get loadedClips(): number {
    return this.buffers.size
  }
  get currentTrack(): Track | null {
    return this.current
  }

  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.musicBus.gain.setTargetAtTime(muted ? 0 : music * 0.8, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.9, t, 0.05)
  }

  /** 0 = exploring (muffled, quieter floor music), 1 = full combat. */
  setIntensity(v: number): void {
    if (Math.abs(v - this.intensity) < 0.01) return
    this.intensity = v
    this.applyIntensity(0.5)
  }
  private applyIntensity(tc: number): void {
    const t = this.ctx.currentTime
    // Only dungeon floor tracks breathe with combat; hub, boss and victory cues play open.
    const breathes = this.current === 'floor1' || this.current === 'floor2' || (this.synthOn && !this.current)
    const k = breathes ? this.intensity : 1
    this.filter.frequency.setTargetAtTime(700 + 19300 * k * k, t, tc)
    this.level.gain.setTargetAtTime(0.62 + 0.38 * k, t, tc)
    this.combat.gain.setTargetAtTime(this.intensity * 0.9, t, tc)
  }

  /** Crossfade to a music track (null = silence). Safe to call repeatedly with the same track. */
  music(track: Track | null, fade = 1.4): void {
    if (track === this.current) return
    const prev = this.current ? this.channels.get(this.current) : undefined
    this.current = track
    const t = this.ctx.currentTime
    if (prev) {
      prev.gain.gain.cancelScheduledValues(t)
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, t)
      prev.gain.gain.linearRampToValueAtTime(0, t + fade)
      clearTimeout(prev.stopTimer)
      prev.stopTimer = window.setTimeout(() => {
        if (this.current !== prev.track) prev.el.pause()
      }, fade * 1000 + 100)
    }
    this.stopSynth()
    if (!track) return
    const ch = this.channel(track)
    clearTimeout(ch.stopTimer)
    if (ch.failed) {
      this.startSynth()
      this.applyIntensity(0.05)
      return
    }
    ch.el.preload = 'auto'
    if (track === 'victory') ch.el.currentTime = 0
    ch.gain.gain.cancelScheduledValues(t)
    ch.gain.gain.setValueAtTime(ch.gain.gain.value, t)
    ch.gain.gain.linearRampToValueAtTime(TRACK_GAIN[track], t + (track === 'victory' ? 0.05 : fade))
    if (!this.hidden) void ch.el.play().catch(() => undefined)
    this.applyIntensity(0.05)
  }

  private channel(track: Track): Channel {
    let ch = this.channels.get(track)
    if (ch) return ch
    const el = document.createElement('audio')
    el.src = `${BASE}audio/music/${track}.mp3`
    el.loop = track !== 'victory'
    // Nothing is downloaded until the track's stage prefetches it or it starts playing.
    el.preload = 'none'
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    this.ctx.createMediaElementSource(el).connect(gain).connect(this.filter)
    ch = { track, el, gain, failed: false, stopTimer: 0 }
    const c = ch
    el.addEventListener('error', () => {
      c.failed = true
      if (this.current === track && track !== 'victory') this.startSynth()
    })
    this.channels.set(track, ch)
    return ch
  }

  /**
   * Start buffering a track and resolve once the browser can play it through (or it fails, or
   * 12 s pass: slow networks keep streaming in the background; playback doesn't wait on this).
   */
  prefetch(track: Track): Promise<void> {
    const ch = this.channel(track)
    const el = ch.el
    if (ch.failed || el.readyState >= 4) return Promise.resolve()
    return new Promise<void>(resolve => {
      const done = (): void => {
        clearTimeout(timer)
        el.removeEventListener('canplaythrough', done)
        el.removeEventListener('error', done)
        resolve()
      }
      const timer = window.setTimeout(done, 12000)
      el.addEventListener('canplaythrough', done)
      el.addEventListener('error', done)
      if (el.preload !== 'auto') {
        el.preload = 'auto'
        el.load()
      }
    })
  }

  /** Legacy alias: warm a track without waiting for it. */
  preload(track: Track): void {
    void this.prefetch(track)
  }

  /** Tab hidden: pause streaming music; resume where it left off when visible again. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    const ch = this.current ? this.channels.get(this.current) : undefined
    if (!ch || ch.failed) return
    if (hidden) ch.el.pause()
    else void ch.el.play().catch(() => undefined)
  }

  /** Legacy entry point: start the campus theme if nothing is playing. */
  startMusic(): void {
    if (!this.current) this.music('hub')
  }
  stopMusic(): void {
    this.music(null)
  }

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return
    // Rate-limit identical sounds so big fights don't clip.
    const now = this.ctx.currentTime
    const minGap = name === 'hit' || name === 'enemyDie' || name === 'coin' ? 0.04 : name === 'enemyShoot' || name === 'pages' ? 0.08 : 0.02
    if (now - (this.last.get(name) ?? -1) < minGap) return
    this.last.set(name, now)
    const buf = this.buffers.get(name)
    if (buf) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      if (VARY.has(name)) src.playbackRate.value = 0.93 + Math.random() * 0.14
      const g = this.ctx.createGain()
      g.gain.value = SFX_GAIN[name] ?? 0.7
      src.connect(g).connect(this.sfx)
      src.start()
      return
    }
    this.synth(name)
  }

  // ─── Synthesized fallbacks ────────────────────────────────────────────

  private tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0, bus: AudioNode = this.sfx): void {
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(bus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  private hiss(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0, bus: AudioNode = this.sfx, sweepTo?: number): void {
    const t = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(bus)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }

  private synth(name: Sfx): void {
    switch (name) {
      case 'ui': this.tone(660, 720, 0.06, 'triangle', 0.16); break
      case 'swing': this.hiss(0.12, 0.22, 2400, 0.8, 'bandpass', 0, this.sfx, 900); break
      case 'hit': this.tone(180, 60, 0.12, 'square', 0.22); this.hiss(0.08, 0.35, 1800, 1.2); break
      case 'crit': this.tone(260, 70, 0.18, 'square', 0.28); this.hiss(0.14, 0.45, 3200, 1); this.tone(1200, 1800, 0.12, 'triangle', 0.14, 0.02); break
      case 'bolt': this.tone(900, 220, 0.18, 'sawtooth', 0.12); this.tone(1400, 500, 0.12, 'sine', 0.12); break
      case 'nova': this.tone(90, 40, 0.6, 'sine', 0.5); this.hiss(0.7, 0.5, 600, 0.6, 'lowpass', 0, this.sfx, 120); this.tone(700, 1400, 0.35, 'triangle', 0.14); break
      case 'dash': this.hiss(0.2, 0.28, 900, 0.7, 'bandpass', 0, this.sfx, 3000); break
      case 'hurt': this.tone(240, 90, 0.26, 'sawtooth', 0.24); this.hiss(0.15, 0.3, 700, 0.8); break
      case 'block': this.tone(1500, 1400, 0.18, 'triangle', 0.2); this.tone(2250, 2200, 0.22, 'sine', 0.12); break
      case 'enemyDie': this.tone(420, 60, 0.28, 'square', 0.14); this.hiss(0.25, 0.25, 1200, 0.6, 'bandpass', 0, this.sfx, 300); break
      case 'enemyShoot': this.tone(520, 300, 0.14, 'triangle', 0.1); break
      case 'telegraph': this.tone(300, 420, 0.22, 'sine', 0.08); break
      case 'slam': case 'shelf': this.tone(70, 35, 0.4, 'sine', 0.45); this.hiss(0.35, 0.4, 400, 0.6, 'lowpass'); break
      case 'lock': this.tone(160, 150, 0.3, 'square', 0.12); this.tone(120, 110, 0.35, 'square', 0.1, 0.08); break
      case 'unlock': [523, 784].forEach((f, i) => this.tone(f, f, 0.2, 'triangle', 0.18, i * 0.08)); break
      case 'reward': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, f * 1.01, 0.25, 'triangle', 0.16, i * 0.07)); break
      case 'coin': this.tone(1320, 1320, 0.05, 'square', 0.06); this.tone(1760, 1760, 0.12, 'square', 0.06, 0.05); break
      case 'heal': [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.4, 'sine', 0.14, i * 0.09)); break
      case 'rescue': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.35, 'triangle', 0.16, i * 0.08)); break
      case 'roar': case 'libRoar': this.tone(110, 55, 1.2, 'sawtooth', 0.25); this.tone(165, 70, 1.1, 'square', 0.12); this.hiss(1.2, 0.3, 300, 0.5, 'lowpass'); break
      case 'bossDie': this.tone(220, 30, 2.2, 'sawtooth', 0.3); this.hiss(2, 0.5, 900, 0.5, 'lowpass', 0, this.sfx, 80); break
      case 'portal': case 'descend': this.tone(200, 800, 0.9, 'sine', 0.18); this.tone(300, 1200, 0.9, 'triangle', 0.08, 0.1); break
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, f * 1.01, 0.32, 'triangle', 0.2, i * 0.12)); break
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.45, 'sine', 0.22, i * 0.18)); break
      case 'shush': this.hiss(1.0, 0.5, 5000, 0.7, 'bandpass', 0, this.sfx, 2500); break
      case 'pages': this.hiss(0.6, 0.25, 3500, 1.5); break
      case 'blink': this.tone(1600, 200, 0.4, 'sine', 0.15); break
    }
  }

  private startSynth(): void {
    if (this.synthOn) return
    this.synthOn = true
    this.synthBus.gain.value = 1
    this.nextTime = this.ctx.currentTime + 0.1
    const schedule = () => {
      if (!this.synthOn) return
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.step, this.nextTime)
        this.step += 1
        this.nextTime += 60 / 112 / 4
      }
      this.timer = window.setTimeout(schedule, 60)
    }
    schedule()
  }
  private stopSynth(): void {
    this.synthOn = false
    clearTimeout(this.timer)
  }

  /** 16th-note fallback sequencer. Am – F – C – G progression, mysterious pad + combat drums/bass. */
  private scheduleStep(step: number, t: number): void {
    const bar = Math.floor(step / 16) % 4
    const s = step % 16
    const roots = [110, 87.31, 130.81, 98]
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]]
    const osc = (freq: number, dur: number, type: OscillatorType, vol: number, bus: AudioNode, attack = 0.01) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol, t + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(bus)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    if (s === 0) for (const f of chords[bar]) for (const det of [-5, 5]) {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f / 2
      o.detune.value = det
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.035, t + 0.6)
      g.gain.linearRampToValueAtTime(0.0001, t + 2.3)
      o.connect(g).connect(this.synthBus)
      o.start(t)
      o.stop(t + 2.4)
    }
    if (s === 6 || s === 14) osc(chords[bar][(step >> 3) % 3] * 2, 0.5, 'triangle', 0.02, this.synthBus)
    if (s % 4 === 0) {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.frequency.setValueAtTime(140, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
      g.gain.setValueAtTime(0.4, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.connect(g).connect(this.combat)
      o.start(t)
      o.stop(t + 0.2)
    }
    if (s % 4 === 2) this.hissAt(t, 0.05, 0.1, 8000)
    if (s === 4 || s === 12) this.hissAt(t, 0.14, 0.22, 1800)
    const bassPattern = [0, 0, 12, 0, 7, 0, 12, 7]
    if (s % 2 === 0) osc(roots[bar] * Math.pow(2, bassPattern[(s / 2) % 8] / 12), 0.16, 'sawtooth', 0.07, this.combat)
  }
  private hissAt(t: number, dur: number, vol: number, freq: number): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.combat)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }
}
