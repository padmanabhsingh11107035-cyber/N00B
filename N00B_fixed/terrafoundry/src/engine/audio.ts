/**
 * Web Audio mixer with music and SFX buses.
 *
 * SFX: generated (ElevenLabs) samples are decoded once their stage loads and played with small
 * random pitch/gain variation; until then, and for sounds without a sample, a synthesized
 * fallback plays, so audio never goes silent while assets stream in.
 * Music: Lyria tracks stream through <audio> elements (no huge decoded buffers) and crossfade.
 * Ambience: looping day/night/campfire beds plus a synthesized wind layer.
 *
 * Base gain stages (music 3×, SFX 2× over the original starter mix) sit before the user
 * volume buses, and a limiter on the master keeps peaks at or below 0 dBFS.
 */
export type Sfx =
  | 'chop' | 'mine' | 'crystal' | 'dig' | 'soft' | 'break' | 'treefall' | 'pickup' | 'place' | 'placeStone' | 'remove' | 'craft'
  | 'eat' | 'hurt' | 'swing' | 'jump' | 'land' | 'ui' | 'click' | 'hover' | 'open' | 'close' | 'deny' | 'discover' | 'toolbreak'
  | 'grunt' | 'growl' | 'hit' | 'die' | 'death' | 'splash' | 'fire'
  | 'bowDraw' | 'bowRelease' | 'arrowHit' | 'howl' | 'wolfAttack' | 'ghoul' | 'roar' | 'levelup' | 'horn' | 'chest' | 'dawn'
  | 'doorOpen' | 'doorClose' | 'chestClose' | 'map'
export type Surface = 'grass' | 'stone' | 'wood' | 'sand' | 'water'
export type Track = 'title' | 'day' | 'night' | 'boss'
export type Bed = 'day' | 'night' | 'campfire'

/** Sample file (under /assets/audio/) and its mix gain for each sampled SFX. */
export const SAMPLES: Partial<Record<Sfx, { file: string; gain: number; vary?: number }>> = {
  chop: { file: 'sfx-chop', gain: 0.75 },
  mine: { file: 'sfx-stone', gain: 0.7 },
  crystal: { file: 'sfx-crystal', gain: 0.55 },
  dig: { file: 'sfx-dig', gain: 0.7 },
  treefall: { file: 'sfx-treefall', gain: 0.8, vary: 0.04 },
  pickup: { file: 'sfx-pickup', gain: 0.42 },
  craft: { file: 'sfx-craft', gain: 0.6, vary: 0.02 },
  place: { file: 'sfx-place-wood', gain: 0.7 },
  placeStone: { file: 'sfx-place-stone', gain: 0.7 },
  eat: { file: 'sfx-eat', gain: 0.6 },
  hurt: { file: 'sfx-hurt', gain: 0.65 },
  swing: { file: 'sfx-swing', gain: 0.4 },
  click: { file: 'sfx-ui-click', gain: 0.35, vary: 0.03 },
  hover: { file: 'sfx-ui-hover', gain: 0.16, vary: 0.05 },
  hit: { file: 'sfx-creature-hit', gain: 0.7 },
  die: { file: 'sfx-creature-die', gain: 0.65 },
  bowDraw: { file: 'sfx-bow-draw', gain: 0.5, vary: 0.03 },
  bowRelease: { file: 'sfx-bow-release', gain: 0.6 },
  arrowHit: { file: 'sfx-arrow-hit', gain: 0.65 },
  howl: { file: 'sfx-wolf-howl', gain: 0.55, vary: 0.05 },
  wolfAttack: { file: 'sfx-wolf-attack', gain: 0.6 },
  ghoul: { file: 'sfx-ghoul', gain: 0.55 },
  roar: { file: 'sfx-boss-roar', gain: 0.85, vary: 0.03 },
  levelup: { file: 'sfx-levelup', gain: 0.55, vary: 0 },
  horn: { file: 'sfx-wave-horn', gain: 0.7, vary: 0 },
  chest: { file: 'sfx-chest', gain: 0.6, vary: 0.02 },
  dawn: { file: 'sfx-dawn', gain: 0.6, vary: 0 },
  doorOpen: { file: 'sfx-door-open', gain: 0.6, vary: 0.05 },
  doorClose: { file: 'sfx-door-close', gain: 0.65, vary: 0.04 },
  chestClose: { file: 'sfx-chest-close', gain: 0.6, vary: 0.04 },
  map: { file: 'sfx-map-open', gain: 0.5, vary: 0.04 },
}
export const TRACK_FILES: Record<Track, string> = { title: 'music-title', day: 'music-day', night: 'music-night', boss: 'music-boss' }
export const BED_FILES: Record<Bed, string> = { day: 'amb-day', night: 'amb-night', campfire: 'amb-campfire' }
export const audioUrl = (file: string) => `./assets/audio/${file}.mp3`

/** Mastered tracks are far louder than the old synth pad; this trims them under the base gain. */
const TRACK_TRIM = 0.34
const BED_TRIM: Record<Bed, number> = { day: 0.22, night: 0.26, campfire: 0.45 }

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private limiter: DynamicsCompressorNode
  private music: GainNode
  private sfx: GainNode
  private musicBase: GainNode
  private sfxBase: GainNode
  private ambBus: GainNode
  private noise: AudioBuffer
  private wind?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }
  private ambTimer = 0
  private day = 1
  private night = 0
  private buffers = new Map<string, AudioBuffer>()
  private pendingBytes = new Map<string, ArrayBuffer>()
  private lastPlay = new Map<Sfx, number>()
  private decks: { el: HTMLAudioElement; gain: GainNode; track: Track | null }[] = []
  private deck = 0
  private wantTrack: Track | null = null
  private beds = new Map<Bed, { src: AudioBufferSourceNode; gain: GainNode }>()
  private bedLevel: Record<Bed, number> = { day: 0, night: 0, campfire: 0 }
  private duck = 1

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -2
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.12
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.musicBase = this.ctx.createGain()
    this.sfxBase = this.ctx.createGain()
    this.musicBase.gain.value = 3
    this.sfxBase.gain.value = 2
    this.ambBus = this.ctx.createGain()
    this.musicBase.connect(this.music)
    this.sfxBase.connect(this.sfx)
    this.ambBus.connect(this.sfxBase)
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.limiter)
    this.limiter.connect(this.ctx.destination)
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.resumeMusic())
    this.decodePending()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.55, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.8, t, 0.05)
  }

  // ─── Samples ──────────────────────────────────────────────────────────────

  /** Registers encoded sample bytes (decoded immediately if possible, else on unlock). */
  addSample(file: string, bytes: ArrayBuffer): Promise<void> {
    if (this.buffers.has(file)) return Promise.resolve()
    this.pendingBytes.set(file, bytes)
    return this.decode(file)
  }
  hasSample(file: string): boolean {
    return this.buffers.has(file)
  }
  private decodePending(): void {
    for (const file of this.pendingBytes.keys()) void this.decode(file)
  }
  private async decode(file: string): Promise<void> {
    const bytes = this.pendingBytes.get(file)
    if (!bytes) return
    this.pendingBytes.delete(file)
    try {
      this.buffers.set(file, await this.ctx.decodeAudioData(bytes.slice(0)))
    } catch {
      this.pendingBytes.set(file, bytes)
    }
  }
  private sample(file: string, vol: number, rate: number, dest: AudioNode = this.sfxBase, pan = 0): boolean {
    const buf = this.buffers.get(file)
    if (!buf) return false
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = vol
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      src.connect(g).connect(p).connect(dest)
    } else src.connect(g).connect(dest)
    src.start()
    return true
  }

  // ─── Synth primitives (fallbacks + sweeteners) ───────────────────────────

  private tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0, dest: AudioNode = this.sfxBase): void {
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private burst(filter: BiquadFilterType, freq: number, q: number, dur: number, vol: number, delay = 0, sweepTo?: number, dest: AudioNode = this.sfxBase): void {
    const t = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(dest)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.05)
  }

  /**
   * Play a sound; `vol` scales loudness (e.g. distance falloff), `pitch` shifts it and `pan`
   * places it left/right (-1..1). Rapid repeats of the same sound are rate-limited.
   */
  play(name: Sfx, vol = 1, pitch = 1, pan = 0): void {
    if (this.ctx.state !== 'running' || vol <= 0.01) return
    const now = this.ctx.currentTime
    const last = this.lastPlay.get(name) ?? -1
    if (now - last < (name === 'hover' ? 0.05 : 0.025)) return
    this.lastPlay.set(name, now)
    const spec = SAMPLES[name]
    const vary = spec?.vary ?? 0.07
    const p = pitch * (1 - vary + Math.random() * vary * 2)
    if (spec && this.sample(spec.file, spec.gain * vol * (0.9 + Math.random() * 0.2), p, this.sfxBase, pan)) {
      // Low-end sweeteners give impacts extra weight on top of the sample.
      if (name === 'chop') this.tone(150 * p, 90, 0.1, 'sine', 0.18 * vol)
      if (name === 'mine') this.tone(120 * p, 70, 0.1, 'sine', 0.16 * vol)
      if (name === 'roar') this.tone(55, 38, 1.2, 'sine', 0.35 * vol)
      return
    }
    this.synth(name, vol, p)
  }

  private synth(name: Sfx, v: number, p: number): void {
    switch (name) {
      case 'chop':
        this.burst('bandpass', 900 * p, 1.4, 0.11, 0.5 * v)
        this.tone(190 * p, 110, 0.12, 'triangle', 0.35 * v)
        break
      case 'mine':
        this.burst('bandpass', 2600 * p, 3, 0.07, 0.45 * v)
        this.tone(820 * p, 520, 0.06, 'square', 0.08 * v)
        this.tone(140 * p, 80, 0.1, 'sine', 0.3 * v)
        break
      case 'crystal':
        this.tone(1560 * p, 1540, 0.5, 'sine', 0.18 * v)
        this.tone(2340 * p, 2300, 0.35, 'sine', 0.1 * v, 0.02)
        this.burst('highpass', 5000, 1, 0.05, 0.2 * v)
        break
      case 'dig':
        this.burst('lowpass', 700 * p, 1, 0.2, 0.55 * v, 0, 250)
        this.tone(95 * p, 60, 0.14, 'sine', 0.25 * v)
        break
      case 'soft':
        this.burst('highpass', 2600 * p, 0.8, 0.12, 0.28 * v)
        break
      case 'break':
        this.burst('lowpass', 1800 * p, 0.8, 0.35, 0.6 * v, 0, 200)
        this.tone(110 * p, 50, 0.3, 'sine', 0.45 * v)
        break
      case 'treefall':
        this.tone(95, 55, 0.9, 'sawtooth', 0.06 * v)
        this.burst('bandpass', 400, 4, 0.8, 0.2 * v, 0, 180)
        this.burst('lowpass', 500, 0.7, 0.6, 0.7 * v, 0.95, 90)
        this.tone(70, 38, 0.5, 'sine', 0.6 * v, 0.95)
        break
      case 'pickup':
        this.tone(660 * p, 990 * p, 0.09, 'triangle', 0.18 * v)
        this.tone(990 * p, 1320 * p, 0.12, 'sine', 0.1 * v, 0.05)
        break
      case 'place':
      case 'placeStone':
        this.tone(210 * p, 105, 0.16, 'sine', 0.5 * v)
        this.burst('lowpass', 600, 0.8, 0.12, 0.4 * v)
        break
      case 'remove':
        this.tone(160 * p, 240, 0.14, 'triangle', 0.3 * v)
        this.burst('bandpass', 1200, 1, 0.1, 0.25 * v)
        break
      case 'craft':
        this.burst('bandpass', 1500, 2, 0.05, 0.3 * v)
        this.burst('bandpass', 1100, 2, 0.05, 0.3 * v, 0.09)
        this.tone(784, 790, 0.3, 'triangle', 0.16 * v, 0.16)
        this.tone(1175, 1180, 0.35, 'sine', 0.1 * v, 0.22)
        break
      case 'eat':
        for (let i = 0; i < 3; i++) this.burst('bandpass', 1300 + Math.random() * 400, 1.5, 0.07, 0.35 * v, i * 0.13)
        break
      case 'hurt':
        this.tone(220, 95, 0.26, 'sawtooth', 0.2 * v)
        this.burst('lowpass', 900, 1, 0.18, 0.4 * v)
        break
      case 'swing':
        this.burst('bandpass', 500 * p, 1.2, 0.16, 0.18 * v, 0, 2200)
        break
      case 'jump':
        this.burst('lowpass', 800, 0.7, 0.08, 0.15 * v)
        break
      case 'land':
        this.tone(130, 65, 0.1, 'sine', 0.35 * v)
        this.burst('lowpass', 500, 0.7, 0.1, 0.3 * v)
        break
      case 'ui':
      case 'click':
        this.tone(660, 700, 0.05, 'triangle', 0.12 * v)
        break
      case 'hover':
        this.tone(1200, 1250, 0.03, 'sine', 0.035 * v)
        break
      case 'doorOpen':
      case 'map':
      case 'open':
        this.tone(440, 660, 0.09, 'triangle', 0.12 * v)
        this.burst('highpass', 3000, 0.7, 0.06, 0.08 * v)
        break
      case 'doorClose':
      case 'chestClose':
      case 'close':
        this.tone(620, 420, 0.09, 'triangle', 0.12 * v)
        break
      case 'deny':
        this.tone(200, 160, 0.14, 'square', 0.08 * v)
        this.tone(150, 120, 0.16, 'square', 0.08 * v, 0.08)
        break
      case 'discover':
      case 'levelup':
      case 'dawn':
        ;[523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, f * 1.002, 0.6, 'sine', 0.14 * v, i * 0.12))
        ;[784, 1046.5].forEach((f, i) => this.tone(f, f, 0.8, 'triangle', 0.06 * v, 0.5 + i * 0.1))
        break
      case 'chest':
        this.tone(300, 200, 0.3, 'triangle', 0.2 * v)
        ;[784, 988, 1175].forEach((f, i) => this.tone(f, f, 0.4, 'sine', 0.08 * v, 0.2 + i * 0.08))
        break
      case 'toolbreak':
        this.burst('bandpass', 3000, 2, 0.2, 0.4 * v, 0, 800)
        this.tone(600, 200, 0.25, 'square', 0.1 * v)
        break
      case 'grunt':
        this.tone(120 * p, 80, 0.22, 'sawtooth', 0.12 * v)
        this.burst('lowpass', 400, 2, 0.18, 0.25 * v)
        break
      case 'growl':
      case 'ghoul':
      case 'wolfAttack':
      case 'roar':
      case 'howl':
        this.growl(v * (name === 'roar' ? 1.6 : 1), p * (name === 'roar' ? 0.6 : name === 'howl' ? 1.8 : 1))
        break
      case 'hit':
      case 'arrowHit':
        this.burst('bandpass', 700, 1.2, 0.1, 0.45 * v)
        this.tone(170, 90, 0.12, 'sine', 0.35 * v)
        break
      case 'bowDraw':
        this.burst('bandpass', 900, 3, 0.4, 0.12 * v, 0, 1600)
        break
      case 'bowRelease':
        this.tone(180, 90, 0.12, 'triangle', 0.3 * v)
        this.burst('bandpass', 1200, 1, 0.12, 0.2 * v, 0, 3000)
        break
      case 'horn':
        this.tone(110, 108, 2.2, 'sawtooth', 0.08 * v)
        this.tone(165, 162, 2.2, 'sawtooth', 0.05 * v, 0.1)
        break
      case 'die':
        this.tone(300 * p, 90, 0.45, 'triangle', 0.18 * v)
        this.burst('lowpass', 1200, 0.8, 0.4, 0.3 * v, 0, 150)
        break
      case 'death':
        ;[392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.5, 'sine', 0.18 * v, i * 0.2))
        break
      case 'splash':
        this.burst('lowpass', 2400, 0.7, 0.4, 0.45 * v, 0, 300)
        break
      case 'fire':
        this.burst('bandpass', 1800 + Math.random() * 1200, 3, 0.03, 0.12 * v)
        break
    }
  }

  private growl(v: number, p: number): void {
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const lfo = this.ctx.createOscillator()
    const lg = this.ctx.createGain()
    const g = this.ctx.createGain()
    const f = this.ctx.createBiquadFilter()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(72 * p, t)
    o.frequency.linearRampToValueAtTime(55 * p, t + 0.9)
    lfo.frequency.value = 11
    lg.gain.value = 0.5
    f.type = 'lowpass'
    f.frequency.value = 520
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)
    lfo.connect(lg).connect(g.gain)
    o.connect(f).connect(g).connect(this.sfxBase)
    o.start(t)
    lfo.start(t)
    o.stop(t + 1)
    lfo.stop(t + 1)
  }

  step(surface: Surface, vol = 1): void {
    if (this.ctx.state !== 'running') return
    const v = 0.22 * vol
    switch (surface) {
      case 'grass': this.burst('bandpass', 1500 + Math.random() * 500, 0.9, 0.08, v); this.burst('lowpass', 500, 0.8, 0.06, v * 0.5); break
      case 'sand': this.burst('lowpass', 1300, 0.7, 0.1, v); break
      case 'stone': this.burst('bandpass', 2600, 2, 0.04, v * 0.9); this.tone(180, 120, 0.04, 'sine', v * 0.5); break
      case 'wood': this.tone(150 + Math.random() * 30, 110, 0.07, 'triangle', v * 1.1); this.burst('lowpass', 900, 1, 0.05, v * 0.6); break
      case 'water': this.burst('lowpass', 1500, 0.7, 0.18, v * 1.2, 0, 400); break
    }
  }

  // ─── Ambience ─────────────────────────────────────────────────────────────

  /** Ambient mix: `day` 0..1 crossfades day/night beds, wind scales with exposure, `fire` = campfire proximity 0..1. */
  setAmbient(day: number, wind: number, fire = 0): void {
    this.day = day
    this.night = 1 - day
    const t = this.ctx.currentTime
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0.02 + wind * 0.07, t, 0.8)
      this.wind.filter.frequency.setTargetAtTime(350 + wind * 500, t, 0.8)
    }
    this.bedLevel.day = day
    this.bedLevel.night = 1 - day
    this.bedLevel.campfire = fire
    for (const [bed, b] of this.beds) b.gain.gain.setTargetAtTime(this.bedLevel[bed] * BED_TRIM[bed], t, 0.9)
  }

  startAmbient(): void {
    if (this.ctx.state === 'closed') return
    if (!this.wind) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 450
      const gain = this.ctx.createGain()
      gain.gain.value = 0.03
      const lfo = this.ctx.createOscillator()
      const lg = this.ctx.createGain()
      lfo.frequency.value = 0.08
      lg.gain.value = 0.02
      lfo.connect(lg).connect(gain.gain)
      src.connect(filter).connect(gain).connect(this.ambBus)
      src.start()
      lfo.start()
      this.wind = { src, gain, filter }
      const tick = () => {
        if (this.ctx.state === 'running') {
          // Synth birds/crickets only until the recorded beds arrive.
          if (!this.beds.has('day') && Math.random() < this.day * 0.5) this.bird()
          if (!this.beds.has('night') && Math.random() < this.night * 0.7) this.cricket()
          this.startBeds()
        }
        this.ambTimer = window.setTimeout(tick, 700 + Math.random() * 1600)
      }
      tick()
    }
    this.startBeds()
  }

  private startBeds(): void {
    for (const bed of Object.keys(BED_FILES) as Bed[]) {
      if (this.beds.has(bed)) continue
      const buf = this.buffers.get(BED_FILES[bed])
      if (!buf) continue
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.ambBus)
      src.start(0, Math.random() * buf.duration)
      gain.gain.setTargetAtTime(this.bedLevel[bed] * BED_TRIM[bed], this.ctx.currentTime, 1.5)
      this.beds.set(bed, { src, gain })
    }
  }

  private bird(): void {
    const base = 2400 + Math.random() * 1600
    const notes = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < notes; i++) this.tone(base * (1 + Math.random() * 0.2), base * (0.8 + Math.random() * 0.5), 0.07 + Math.random() * 0.05, 'sine', 0.025, i * 0.11, this.ambBus)
  }

  private cricket(): void {
    const f = 4200 + Math.random() * 600
    for (let i = 0; i < 6; i++) this.tone(f, f, 0.025, 'triangle', 0.012, i * 0.045, this.ambBus)
  }

  // ─── Music ────────────────────────────────────────────────────────────────

  private ensureDecks(): void {
    if (this.decks.length) return
    for (let i = 0; i < 2; i++) {
      const el = document.createElement('audio')
      el.loop = true
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      const src = this.ctx.createMediaElementSource(el)
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.musicBase)
      this.decks.push({ el, gain, track: null })
    }
  }

  /** Crossfades to a streamed music track (null fades out). */
  playMusic(track: Track | null, fade = 2.5): void {
    this.wantTrack = track
    if (typeof document === 'undefined') return
    this.ensureDecks()
    const cur = this.decks[this.deck]
    if (cur.track === track && track !== null) {
      if (cur.el.paused && this.ctx.state === 'running') void cur.el.play().catch(() => undefined)
      return
    }
    const t = this.ctx.currentTime
    cur.gain.gain.cancelScheduledValues(t)
    cur.gain.gain.setTargetAtTime(0, t, fade / 4)
    const old = cur
    window.setTimeout(() => { if (old.track !== this.wantTrack) old.el.pause() }, fade * 1000 + 200)
    if (!track) return
    this.deck = 1 - this.deck
    const next = this.decks[this.deck]
    if (next.track !== track) {
      next.el.src = audioUrl(TRACK_FILES[track])
      next.track = track
    }
    next.el.currentTime = 0
    next.gain.gain.cancelScheduledValues(t)
    next.gain.gain.setValueAtTime(0.0001, t)
    next.gain.gain.setTargetAtTime(TRACK_TRIM * this.duck, t + 0.05, fade / 4)
    if (this.ctx.state === 'running') void next.el.play().catch(() => undefined)
  }

  /** Temporarily lowers music (e.g. under a boss roar or level-up sting). */
  duckMusic(amount: number, seconds: number): void {
    if (!this.decks.length) return
    const g = this.decks[this.deck].gain.gain
    const t = this.ctx.currentTime
    this.duck = 1 - amount
    g.setTargetAtTime(TRACK_TRIM * this.duck, t, 0.08)
    window.setTimeout(() => {
      this.duck = 1
      g.setTargetAtTime(TRACK_TRIM, this.ctx.currentTime, 0.6)
    }, seconds * 1000)
  }

  private resumeMusic(): void {
    if (this.wantTrack) {
      const d = this.decks[this.deck]
      if (d && d.el.paused) void d.el.play().catch(() => undefined)
    }
  }

  /** Legacy API: start/stop the music layer (plays the day track). */
  startMusic(): void {
    this.playMusic(this.wantTrack ?? 'day')
  }

  stopMusic(): void {
    this.playMusic(null, 1)
  }

  get track(): Track | null {
    return this.wantTrack
  }

  dispose(): void {
    this.stopMusic()
    clearTimeout(this.ambTimer)
    for (const d of this.decks) d.el.pause()
    void this.ctx.close()
  }
}
