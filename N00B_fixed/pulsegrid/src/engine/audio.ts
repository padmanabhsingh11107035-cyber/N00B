/**
 * Web Audio mixer: music and SFX buses into a glue compressor, plus shared reverb and tempo
 * delay sends. Browsers only allow audio after a user gesture, so call `unlock()` from the first
 * click/key press. Generated samples (ElevenLabs SFX, TTS announcer) are registered with
 * `setSample` as they stream in; until a sample is ready the synthesized cue plays instead.
 */
export type Sfx =
  | 'ui' | 'select' | 'arrow' | 'wrong' | 'perfect' | 'great' | 'cool' | 'bad' | 'miss'
  | 'fever' | 'finish' | 'levelup' | 'cheer' | 'clear' | 'fail' | 'count' | 'go'

/** Which generated samples each game cue triggers (layered), with gain and optional pitch step. */
const CUES: Partial<Record<string, Array<[string, number]>>> = {
  ui: [['ui_click', 0.7]],
  hover: [['ui_hover', 0.35]],
  back: [['ui_back', 0.6]],
  select: [['ui_start', 0.8]],
  arrow: [['arrow_tick', 0.75]],
  wrong: [['arrow_wrong', 0.8]],
  lock: [['phrase_lock', 0.7]],
  perfect: [['hit_perfect', 0.9]],
  great: [['hit_great', 0.85]],
  cool: [['hit_cool', 0.8]],
  bad: [['hit_bad', 0.8]],
  miss: [['hit_miss', 0.75], ['crowd_aww', 0.35]],
  fever: [['fever_start', 0.9], ['vo_fever', 0.9]],
  finish: [['vo_finish', 0.9], ['spotlight', 0.5]],
  finishImpact: [['finish_impact', 1], ['pyro', 0.7], ['crowd_applause', 0.6]],
  spotlight: [['spotlight', 0.8], ['vo_spotlight', 0.85]],
  milestone: [['combo_milestone', 0.8], ['vo_combo', 0.85]],
  levelup: [['level_up', 0.7]],
  cheer: [['crowd_cheer', 0.6]],
  applause: [['crowd_applause', 0.7]],
  clear: [['vo_clear', 0.9]],
  fail: [['vo_fail', 0.9]],
  count: [['countdown_tick', 0.8]],
  go: [['vo_go', 0.95]],
  ready: [['vo_ready', 0.95]],
  voPerfect: [['vo_perfect', 0.8]],
  voGreat: [['vo_great', 0.75]],
  newBest: [['vo_newbest', 0.9]],
  welcome: [['vo_welcome', 0.8]],
  pyro: [['pyro', 0.7]],
  co2: [['co2_jet', 0.7]],
  stamp: [['rank_stamp', 0.9]],
  tick: [['count_tick', 0.35]],
  badge: [['badge', 0.7]],
  whoosh: [['transition_whoosh', 0.6]],
  aww: [['crowd_aww', 0.7]],
}
export type Cue = Sfx | 'hover' | 'back' | 'lock' | 'finishImpact' | 'spotlight' | 'milestone' | 'applause' | 'ready'
  | 'voPerfect' | 'voGreat' | 'newBest' | 'welcome' | 'pyro' | 'co2' | 'stamp' | 'tick' | 'badge' | 'whoosh' | 'aww'

export class Audio {
  readonly ctx: AudioContext
  readonly master: GainNode
  readonly music: GainNode
  readonly sfx: GainNode
  readonly reverb: GainNode
  readonly delay: GainNode
  readonly noise: AudioBuffer
  /** Music spectrum for the LED wall visualizer. */
  readonly analyser: AnalyserNode
  private readonly delayNode: DelayNode
  /** Music-bus shaping driven by gameplay: sidechain duck, low-pass dip (misses), fever shelf. */
  private readonly duckGain: GainNode
  private readonly tone: BiquadFilterNode
  private readonly shelf: BiquadFilterNode
  /** Reverb send for feedback voices (kept off the music bus so ducks don't swallow tails). */
  readonly fxVerb: GainNode
  private readonly samples = new Map<string, AudioBuffer>()
  private readonly lastPlayed = new Map<string, number>()
  private ambience?: { src: AudioBufferSourceNode; gain: GainNode }

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.music = ctx.createGain()
    this.sfx = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.18
    this.duckGain = ctx.createGain()
    this.tone = ctx.createBiquadFilter()
    this.tone.type = 'lowpass'
    this.tone.frequency.value = 20000
    this.tone.Q.value = 0.8
    this.shelf = ctx.createBiquadFilter()
    this.shelf.type = 'highshelf'
    this.shelf.frequency.value = 3200
    this.shelf.gain.value = 0
    this.music.connect(this.duckGain).connect(this.tone).connect(this.shelf).connect(this.master)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.72
    this.music.connect(this.analyser)
    // SFX get their own fast limiter instead of sharing the music glue compressor, so hit
    // feedback punches through without pumping the song.
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = -6
    lim.knee.value = 3
    lim.ratio.value = 12
    lim.attack.value = 0.002
    lim.release.value = 0.1
    this.sfx.connect(lim).connect(ctx.destination)
    this.master.connect(comp).connect(ctx.destination)

    // White noise shared by drums, risers and crowd.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1

    // Reverb: generated stereo impulse response.
    const conv = ctx.createConvolver()
    const len = Math.floor(ctx.sampleRate * 2.2)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch += 1) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
    }
    conv.buffer = ir
    this.reverb = ctx.createGain()
    this.reverb.gain.value = 0.32
    this.reverb.connect(conv).connect(this.music)
    const fxConv = ctx.createConvolver()
    fxConv.buffer = ir
    this.fxVerb = ctx.createGain()
    this.fxVerb.gain.value = 1
    const fxRet = ctx.createGain()
    fxRet.gain.value = 0.5
    this.fxVerb.connect(fxConv).connect(fxRet).connect(this.sfx)

    // Tempo delay with a darkening feedback loop; `setDelayTime` follows the song tempo.
    this.delay = ctx.createGain()
    this.delay.gain.value = 0.28
    this.delayNode = ctx.createDelay(2)
    this.delayNode.delayTime.value = 0.375
    const fb = ctx.createGain()
    fb.gain.value = 0.36
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    this.delay.connect(this.delayNode)
    this.delayNode.connect(damp).connect(fb).connect(this.delayNode)
    damp.connect(this.music)
  }

  /** Sidechain-style duck of the music bus (hit feedback pops out of the mix). */
  duck(depth = 0.55, at = this.ctx.currentTime, hold = 0.05, release = 0.22): void {
    const g = this.duckGain.gain
    const t = Math.max(at, this.ctx.currentTime)
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(depth, t + 0.008)
    g.setValueAtTime(depth, t + 0.008 + hold)
    g.setTargetAtTime(1, t + 0.008 + hold, release / 3)
  }

  /** Low-pass "muffle" dip on the music (misses, wrong keys); recovers over `dur`. */
  dip(freq = 650, dur = 0.55): void {
    const f = this.tone.frequency
    const t = this.ctx.currentTime
    f.cancelScheduledValues(t)
    f.setValueAtTime(Math.min(f.value, 20000), t)
    f.exponentialRampToValueAtTime(freq, t + 0.03)
    f.setTargetAtTime(20000, t + 0.08, dur / 3)
  }

  /** Fever brightness: a gentle high-shelf lift on the music bus. */
  setFever(on: boolean): void {
    this.shelf.gain.setTargetAtTime(on ? 3.5 : 0, this.ctx.currentTime, on ? 0.08 : 0.4)
  }

  /**
   * Pitched bell/pluck voice at context time `at` (in-key feedback). `bright` adds an FM-ish
   * overtone; `pan` places left/right arrows in the stereo field.
   */
  voice(midi: number, at: number, o: { gain?: number; dur?: number; pan?: number; bright?: number; type?: OscillatorType; verb?: number; dest?: AudioNode } = {}): void {
    if (this.ctx.state !== 'running') return
    const ctx = this.ctx
    const t = Math.max(at, ctx.currentTime + 0.001)
    const f = 440 * Math.pow(2, (midi - 69) / 12)
    const dur = o.dur ?? 0.35
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + 0.004)
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const pan = ctx.createStereoPanner()
    pan.pan.value = o.pan ?? 0
    out.connect(pan).connect(o.dest ?? this.sfx)
    if (o.verb) {
      const send = ctx.createGain()
      send.gain.value = o.verb
      pan.connect(send).connect(this.fxVerb)
    }
    const a = ctx.createOscillator()
    a.type = o.type ?? 'triangle'
    a.frequency.value = f
    a.connect(out)
    const b = ctx.createOscillator()
    b.type = 'sine'
    b.frequency.value = f * 2
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(0.5 * (o.bright ?? 0.6), t)
    bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5)
    b.connect(bg).connect(out)
    const c = ctx.createOscillator()
    c.type = 'sine'
    c.frequency.value = f * 3.01
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0.25 * (o.bright ?? 0.6), t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.22)
    c.connect(cg).connect(out)
    for (const osc of [a, b, c]) { osc.start(t); osc.stop(t + dur + 0.05) }
  }

  /** Sub-kick punch (pitch-swept sine) at context time `at`. */
  punch(at: number, gain = 0.8, dest: AudioNode = this.sfx): void {
    if (this.ctx.state !== 'running') return
    const ctx = this.ctx
    const t = Math.max(at, ctx.currentTime + 0.001)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + 0.3)
  }

  /** Filtered noise burst (clap / shimmer / thud / riser). `sweepTo` glides the filter; `swell` fades in. */
  burst(at: number, o: { dur: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; sweepTo?: number; swell?: boolean; pan?: number; dest?: AudioNode }): void {
    if (this.ctx.state !== 'running') return
    const ctx = this.ctx
    const t = Math.max(at, ctx.currentTime + 0.001)
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = o.type ?? 'bandpass'
    f.frequency.setValueAtTime(o.freq, t)
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur)
    f.Q.value = o.q ?? 1
    const g = ctx.createGain()
    if (o.swell) {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(o.gain, t + o.dur * 0.97)
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur + 0.04)
    } else {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(o.gain, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
    }
    const pan = ctx.createStereoPanner()
    pan.pan.value = o.pan ?? 0
    src.connect(f).connect(g).connect(pan).connect(o.dest ?? this.sfx)
    src.start(t, Math.random() * 0.5)
    src.stop(t + o.dur + 0.08)
  }

  /** Descending "tape stop" groan for misses. */
  groan(at: number, gain = 0.12): void {
    if (this.ctx.state !== 'running') return
    const ctx = this.ctx
    const t = Math.max(at, ctx.currentTime + 0.001)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2400, t)
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.4)
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(330, t)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.42)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    o.connect(lp).connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.5)
  }

  /** Play a cue's generated samples at context time `at` (scheduled, sample-accurate). */
  playAt(name: Cue, at: number, gainScale = 1): void {
    if (this.ctx.state !== 'running') return
    const delay = Math.max(0, at - this.ctx.currentTime)
    const layers = CUES[name]
    let any = false
    for (const [key, gain] of layers ?? []) if (this.samples.has(key)) any = this.sample(key, gain * gainScale, 1, delay) || any
    if (!any && delay < 0.01) this.play(name)
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.8, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.7, t, 0.05)
  }

  setDelayTime(seconds: number): void {
    this.delayNode.delayTime.setValueAtTime(Math.min(1.9, seconds), this.ctx.currentTime)
  }

  setSample(key: string, buf: AudioBuffer): void {
    this.samples.set(key, buf)
  }

  hasSample(key: string): boolean {
    return this.samples.has(key)
  }

  /** Play a registered sample on the SFX bus. Returns false when the sample is not loaded yet. */
  sample(key: string, gain = 1, rate = 1, delay = 0): boolean {
    const buf = this.samples.get(key)
    if (!buf || this.ctx.state !== 'running') return !!buf
    const now = this.ctx.currentTime
    // Avoid machine-gunning the exact same sample within 30 ms.
    if (now - (this.lastPlayed.get(key) ?? -1) < 0.03 && !delay) return true
    this.lastPlayed.set(key, now)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.sfx)
    src.start(now + delay)
    return true
  }

  /** Looping crowd bed under the music; level 0 stops it. */
  crowd(level: number): void {
    const buf = this.samples.get('crowd_ambience')
    if (!buf || this.ctx.state !== 'running') return
    if (!this.ambience && level > 0) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.sfx)
      src.start()
      this.ambience = { src, gain }
    }
    this.ambience?.gain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.4)
  }

  /** Play a game cue: generated samples when loaded, synthesized fallback otherwise. */
  play(name: Cue, step = 0): void {
    if (this.ctx.state !== 'running') return
    const layers = CUES[name]
    let any = false
    if (layers) {
      for (const [key, gain] of layers) {
        const rate = name === 'arrow' ? Math.pow(2, (step * 2) / 12) : 1
        if (this.samples.has(key)) any = this.sample(key, gain, rate) || any
      }
    }
    if (any) return
    if (['ui', 'select', 'arrow', 'wrong', 'perfect', 'great', 'cool', 'bad', 'miss', 'fever', 'finish', 'levelup', 'cheer', 'clear', 'fail', 'count', 'go'].includes(name))
      this.synth(name as Sfx, step)
  }

  /** Synthesized cue. `step` pitches arrow clicks up the scale as a sequence fills. */
  private synth(name: Sfx, step = 0): void {
    if (this.ctx.state !== 'running') return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.002
    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0, dest: AudioNode = this.sfx) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(dest)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }
    const noise = (dur: number, freq: number, q: number, vol: number, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo = 0) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.setValueAtTime(freq, t + delay)
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + delay + dur)
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol, t + delay + Math.min(0.08, dur * 0.3))
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      src.connect(f).connect(g).connect(this.sfx)
      src.start(t + delay, Math.random() * 0.5)
      src.stop(t + delay + dur + 0.05)
    }
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
    switch (name) {
      case 'ui': tone(880, 920, 0.05, 'triangle', 0.12); break
      case 'select': tone(660, 990, 0.09, 'square', 0.1); tone(990, 1320, 0.12, 'triangle', 0.12, 0.05); break
      case 'arrow': {
        const f = 523.25 * Math.pow(2, scale[Math.min(step, scale.length - 1)] / 12)
        tone(f, f * 1.01, 0.08, 'square', 0.07)
        tone(f * 2, f * 2, 0.05, 'sine', 0.05)
        break
      }
      case 'wrong': tone(180, 110, 0.18, 'sawtooth', 0.14); tone(190, 120, 0.18, 'square', 0.06); break
      case 'perfect':
        tone(1046.5, 1046.5, 0.16, 'triangle', 0.2); tone(1568, 1568, 0.22, 'sine', 0.14, 0.04); tone(2093, 2093, 0.3, 'sine', 0.08, 0.08)
        noise(0.25, 9000, 0.7, 0.05, 0, 'highpass')
        break
      case 'great': tone(880, 880, 0.14, 'triangle', 0.18); tone(1318.5, 1318.5, 0.18, 'sine', 0.1, 0.04); break
      case 'cool': tone(660, 660, 0.12, 'triangle', 0.16); break
      case 'bad': tone(330, 300, 0.14, 'square', 0.08); break
      case 'miss': tone(260, 130, 0.3, 'sawtooth', 0.12); noise(0.2, 400, 1, 0.08); break
      case 'fever':
        noise(1.1, 500, 2, 0.12, 0, 'bandpass', 7000)
        ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.25, 'square', 0.07, 0.6 + i * 0.05))
        break
      case 'finish': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.005, 0.4, 'sawtooth', 0.06, i * 0.07)); break
      case 'levelup': [659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'square', 0.07, i * 0.07)); break
      case 'cheer':
        for (let i = 0; i < 6; i += 1) noise(0.9 + Math.random() * 0.6, 900 + Math.random() * 1800, 1.4, 0.05, Math.random() * 0.25)
        break
      case 'clear': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.01, 0.5, 'triangle', 0.16, i * 0.1)); break
      case 'fail': [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.45, 'sawtooth', 0.08, i * 0.16)); break
      case 'count': tone(1200, 1200, 0.07, 'square', 0.1); break
      case 'go': tone(1600, 1600, 0.12, 'square', 0.12); tone(2400, 2400, 0.16, 'sine', 0.08, 0.02); break
    }
  }
}
