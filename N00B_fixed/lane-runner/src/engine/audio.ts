/**
 * Audio mixer. Music tracks stream through <audio> elements (low memory, instant start) routed
 * into the Web Audio graph for crossfades; SFX are decoded buffers (loaded by Assets in groups)
 * with per-sound voice limits, rate limiting and pitch/volume jitter so repeated sounds stay alive.
 */
export type MusicName = 'title' | 'run' | 'boss'
export interface SfxOpts { vol?: number; rate?: number; jitter?: number; pan?: number; max?: number; gap?: number; delay?: number }

export class Audio {
  readonly ctx: AudioContext | null
  private master?: GainNode
  private musicBus?: GainNode
  private sfxBus?: GainNode
  private voices = new Map<string, { count: number; last: number }>()
  private music = new Map<MusicName, { el: HTMLAudioElement; gain: GainNode | null }>()
  private current: MusicName | null = null
  private wanted: MusicName | null = null
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; target: number }>()
  private musicVol = 0.6
  private sfxVol = 0.8
  private muted = false
  unlocked = false
  getBuffer: (key: string) => AudioBuffer | undefined = () => undefined

  constructor(private readonly base = 'assets/audio/') {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    this.ctx = Ctor ? new Ctor({ latencyHint: 'interactive' }) : null
    if (!this.ctx) return
    const c = this.ctx
    this.master = c.createGain()
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 5
    comp.attack.value = 0.004
    comp.release.value = 0.2
    this.musicBus = c.createGain()
    this.sfxBus = c.createGain()
    this.musicBus.connect(this.master)
    this.sfxBus.connect(comp)
    comp.connect(this.master)
    this.master.connect(c.destination)
    this.apply()
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) return
    if (this.ctx.state !== 'running') void this.ctx.resume()
    if (this.unlocked) return
    this.unlocked = true
    if (this.wanted) { const w = this.wanted; this.current = null; this.playMusic(w, 0.6) }
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVol = music; this.sfxVol = sfx; this.muted = muted
    this.apply()
  }
  private apply() {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03)
    this.musicBus!.gain.setTargetAtTime(this.musicVol * 0.7, t, 0.05)
    this.sfxBus!.gain.setTargetAtTime(this.sfxVol, t, 0.03)
    for (const m of this.music.values()) if (!m.gain) m.el.volume = this.muted ? 0 : this.musicVol * 0.7
  }

  private track(name: MusicName) {
    let m = this.music.get(name)
    if (m) return m
    const el = new window.Audio()
    el.loop = true
    el.preload = name === 'title' ? 'auto' : 'none'
    el.src = `${this.base}bgm_${name}.mp3`
    let gain: GainNode | null = null
    if (this.ctx) {
      try {
        const src = this.ctx.createMediaElementSource(el)
        gain = this.ctx.createGain()
        gain.gain.value = 0
        src.connect(gain).connect(this.musicBus!)
      } catch { gain = null }
    }
    m = { el, gain }
    this.music.set(name, m)
    return m
  }
  /** Warm a track's network buffer without playing it. */
  preloadMusic(name: MusicName) {
    const m = this.track(name)
    if (m.el.preload !== 'auto') { m.el.preload = 'auto'; m.el.load() }
  }

  playMusic(name: MusicName, fade = 1.2): void {
    this.wanted = name
    if (!this.unlocked || this.current === name) return
    const prev = this.current ? this.music.get(this.current) : undefined
    const next = this.track(name)
    this.current = name
    const t = this.ctx?.currentTime ?? 0
    if (prev && prev !== next) {
      prev.gain?.gain.cancelScheduledValues(t)
      prev.gain?.gain.setTargetAtTime(0, t, fade / 3)
      const el = prev.el
      setTimeout(() => { if (this.current === null || this.music.get(this.current)?.el !== el) el.pause() }, fade * 1000 + 250)
    }
    if (name !== 'title') { try { next.el.currentTime = 0 } catch { /* not seekable yet */ } }
    void next.el.play().catch(() => undefined)
    if (next.gain) {
      next.gain.gain.cancelScheduledValues(t)
      next.gain.gain.setValueAtTime(next.gain.gain.value, t)
      next.gain.gain.setTargetAtTime(1, t, fade / 3)
    } else next.el.volume = this.muted ? 0 : this.musicVol * 0.7
  }
  stopMusic(fade = 0.8) {
    this.wanted = null
    if (!this.current) return
    const m = this.music.get(this.current)!
    const t = this.ctx?.currentTime ?? 0
    m.gain?.gain.setTargetAtTime(0, t, fade / 3)
    const el = m.el
    setTimeout(() => { if (!this.current || this.music.get(this.current)?.el !== el) el.pause() }, fade * 1000 + 100)
    this.current = null
  }
  /** Briefly lower music (boss roar, big moments). */
  duck(amount = 0.35, seconds = 1.2) {
    if (!this.ctx || !this.musicBus) return
    const t = this.ctx.currentTime
    const g = this.musicBus.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(this.musicVol * 0.7 * amount, t, 0.05)
    g.setTargetAtTime(this.musicVol * 0.7, t + seconds, 0.4)
  }

  play(key: string, o: SfxOpts = {}): void {
    const c = this.ctx
    if (!c || !this.unlocked || this.muted || c.state !== 'running') return
    const buf = this.getBuffer(key)
    if (!buf) return
    const now = c.currentTime
    const v = this.voices.get(key) ?? { count: 0, last: -1 }
    if (v.count >= (o.max ?? 6) || now - v.last < (o.gap ?? 0.03)) return
    v.count++
    v.last = now
    this.voices.set(key, v)
    const src = c.createBufferSource()
    src.buffer = buf
    const j = o.jitter ?? 0.06
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j)
    const g = c.createGain()
    g.gain.value = (o.vol ?? 1) * (1 - Math.random() * j * 0.5)
    let node: AudioNode = src.connect(g)
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, o.pan))
      node = node.connect(p)
    }
    node.connect(this.sfxBus!)
    src.onended = () => { v.count = Math.max(0, v.count - 1) }
    src.start(now + (o.delay ?? 0))
  }

  /** Continuous loops (saw whirr, horde ambience) with a smoothed target volume. */
  loop(key: string, vol: number): void {
    const c = this.ctx
    if (!c || !this.unlocked) return
    let l = this.loops.get(key)
    if (!l) {
      if (vol <= 0.001) return
      const buf = this.getBuffer(key)
      if (!buf) return
      const src = c.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = c.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.sfxBus!)
      src.start()
      l = { src, gain, target: 0 }
      this.loops.set(key, l)
    }
    if (Math.abs(l.target - vol) > 0.01) {
      l.target = vol
      l.gain.gain.setTargetAtTime(vol, c.currentTime, 0.15)
    }
  }
  stopLoops() {
    for (const l of this.loops.values()) l.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.1)
    for (const l of this.loops.values()) l.target = 0
  }
  pauseAll(paused: boolean) {
    if (!this.ctx || !this.unlocked) return
    if (paused) void this.ctx.suspend()
    else void this.ctx.resume()
    const m = this.current ? this.music.get(this.current) : undefined
    if (m) { if (paused) m.el.pause(); else void m.el.play().catch(() => undefined) }
  }
}
