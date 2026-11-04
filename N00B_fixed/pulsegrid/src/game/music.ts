import type { Audio } from '../engine/audio'
import type { ChordDef, MusicStyle, SectionKind } from './chart'

/**
 * Procedural club-music sequencer. Schedules sixteenth-note steps ~0.2 s ahead on the
 * AudioContext clock so the groove is sample-accurate, and exposes `songTime()`: the song
 * position the player is *hearing* right now, which drives every judgment and visual.
 */
export type BarKind = SectionKind | 'lobby'
export type MusicBar = { kind: BarKind; pos: number; len: number; finish: boolean }

type Session = {
  style: MusicStyle
  beat: number
  bars: MusicBar[] | null
  start: number
  step: number
  out: GainNode
  synth: GainNode
  ended: boolean
  /** Sample-playback session (generated track) instead of the procedural sequencer. */
  src?: AudioBufferSourceNode
}

const LOOKAHEAD = 0.2
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export class Music {
  private s?: Session
  private paused = false
  private frozen = 0
  private perfAnchor = { perf: 0, song: 0 }
  private lastHeard = 0

  constructor(private readonly audio: Audio) {
    window.setInterval(() => this.pump(), 25)
  }

  get active(): boolean {
    return !!this.s && !this.s.ended
  }

  /** Start a song. Bar 0 begins `leadIn` seconds from now; returns nothing — use `songTime()`. */
  playSong(style: MusicStyle, bpm: number, bars: MusicBar[], leadIn = 0.35): void {
    this.begin(style, bpm, bars, leadIn)
  }

  /**
   * Play a decoded track. Song time 0 is the track's first detected beat (bar 0 of the chart);
   * playback starts `leadIn` seconds from now. Loops for the title groove.
   */
  playTrack(buf: AudioBuffer, bpm: number, firstBeat: number, leadIn = 0.35, loop = false, gain = 1): void {
    this.stop(0.08)
    const ctx = this.audio.ctx
    this.paused = false
    const out = ctx.createGain()
    out.gain.value = gain
    out.connect(this.audio.music)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = loop
    src.connect(out)
    const at = ctx.currentTime + leadIn
    src.start(at)
    const beat = 60 / bpm
    this.audio.setDelayTime(beat * 0.75)
    const s: Session = { style: undefined as unknown as MusicStyle, beat, bars: loop ? null : [], start: at + firstBeat, step: 0, out, synth: out, ended: false, src }
    src.onended = () => { if (this.s === s && !loop) s.ended = true }
    this.s = s
    this.lobbyTrack = loop
    this.perfAnchor = { perf: performance.now(), song: -leadIn - firstBeat }
    this.lastHeard = -leadIn - firstBeat
  }

  /** True while the looping title track (sample session) plays. */
  lobbyTrack = false

  playLobby(style: MusicStyle, bpm: number): void {
    if (this.s && this.s.bars === null && !this.s.ended) return
    this.begin(style, bpm, null, 0.1)
  }

  stop(fade = 0.12): void {
    const s = this.s
    if (!s) return
    s.ended = true
    const t = this.audio.ctx.currentTime
    s.out.gain.cancelScheduledValues(t)
    s.out.gain.setValueAtTime(s.out.gain.value, t)
    s.out.gain.linearRampToValueAtTime(0, t + fade)
    try { s.src?.stop(t + fade + 0.05) } catch { /* already stopped */ }
    window.setTimeout(() => s.out.disconnect(), (fade + 1.5) * 1000)
    this.lobbyTrack = false
    this.s = undefined
  }

  /** Freeze the whole mix (and the song clock) — used by the pause menu. */
  pause(): void {
    if (this.paused) return
    this.frozen = this.songTime()
    this.paused = true
    void this.audio.ctx.suspend().catch(() => undefined)
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.perfAnchor = { perf: performance.now(), song: this.frozen }
    void this.audio.ctx.resume().catch(() => undefined)
  }

  /**
   * AudioContext time at which song time `songT` is *played* (scheduled). Sounds scheduled here
   * land exactly on the music grid, since both go through the same output latency.
   */
  ctxAt(songT: number): number | undefined {
    const s = this.s
    if (!s || s.ended || this.paused) return undefined
    return s.start + songT
  }

  /** Seconds since bar 0 as currently heard through the speakers (negative during lead-in). */
  songTime(perfNow = performance.now()): number {
    const s = this.s
    if (!s) return 0
    if (this.paused) return this.frozen
    const ctx = this.audio.ctx
    let song: number
    if (ctx.state === 'running') {
      const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0
      let heard = ctx.currentTime - latency
      const ts = ctx.getOutputTimestamp?.()
      if (ts && ts.contextTime && ts.performanceTime) {
        const est = ts.contextTime + (perfNow - ts.performanceTime) / 1000
        // Reject stale timestamps (e.g. right after a resume) that would run ahead of the clock.
        if (est <= ctx.currentTime + 0.02 && est > heard - 0.25) heard = est
      }
      song = heard - s.start
      this.perfAnchor = { perf: perfNow, song }
    } else {
      // Audio blocked by the browser: keep the show running on the wall clock.
      song = this.perfAnchor.song + (perfNow - this.perfAnchor.perf) / 1000
    }
    // Monotonic within a frame's jitter.
    if (song < this.lastHeard && this.lastHeard - song < 0.03) song = this.lastHeard
    this.lastHeard = song
    return song
  }

  private begin(style: MusicStyle, bpm: number, bars: MusicBar[] | null, leadIn: number): void {
    this.stop(0.08)
    const ctx = this.audio.ctx
    this.paused = false
    const out = ctx.createGain()
    out.gain.value = bars ? 1 : 0.55
    out.connect(this.audio.music)
    const synth = ctx.createGain()
    synth.connect(out)
    const beat = 60 / bpm
    this.audio.setDelayTime(beat * 0.75)
    const start = ctx.currentTime + leadIn
    this.s = { style, beat, bars, start, step: 0, out, synth, ended: false }
    this.perfAnchor = { perf: performance.now(), song: -leadIn }
    this.lastHeard = -leadIn
    this.pump()
  }

  private pump(): void {
    const s = this.s
    if (!s || s.ended || this.paused || s.src) return
    const ctx = this.audio.ctx
    const horizon = ctx.currentTime + LOOKAHEAD
    const stepDur = s.beat / 4
    for (;;) {
      const bar = Math.floor(s.step / 16)
      if (s.bars && bar >= s.bars.length) return
      const swing = s.step % 2 === 1 ? s.style.swing * stepDur : 0
      const t = s.start + s.step * stepDur + swing
      if (t > horizon) return
      if (t >= ctx.currentTime - 0.02) this.scheduleStep(s, s.step, t)
      s.step += 1
    }
  }

  private scheduleStep(s: Session, step: number, t: number): void {
    const bar = Math.floor(step / 16)
    const i = step % 16
    const info: MusicBar = s.bars ? s.bars[bar] : { kind: 'lobby', pos: bar % 8, len: 8, finish: false }
    const st = s.style
    const chord = st.chords[bar % st.chords.length]
    const kind = info.kind
    const on = (pattern: string, ch = 'x') => pattern[i] === ch
    const lastBars = info.len - info.pos
    const sectionStart = info.pos === 0 && i === 0

    // ── drums ──
    const kickOn =
      kind === 'intro' ? on(st.kick) :
      kind === 'break' ? false :
      kind === 'outro' ? info.pos === 0 && on(st.kick) :
      kind === 'build' && lastBars === 1 && i >= 8 ? false :
      on(st.kick)
    if (kickOn) {
      this.kick(s, t, kind === 'lobby' ? 0.6 : 1)
      this.duck(s, t)
    }
    const clapOn = (kind === 'verse' || kind === 'build' || kind === 'drop' || kind === 'lobby' || (kind === 'intro' && info.pos >= 2)) && on(st.clap)
    if (clapOn) this.clap(s, t, kind === 'lobby' ? 0.35 : 0.7)
    const hatPattern = kind === 'drop' ? st.hatDrop : st.hat
    if (kind !== 'outro' && (hatPattern[i] === 'x' || hatPattern[i] === 'o')) {
      const quiet = kind === 'break' || (kind === 'intro' && info.pos < 2) || kind === 'lobby'
      this.hat(s, t, hatPattern[i] === 'o', quiet ? 0.18 : 0.32)
    }
    if (kind === 'build' && lastBars <= 2) {
      const dense = lastBars === 1
      if (dense || i % 2 === 0) this.snare(s, t, 0.12 + (info.pos / info.len) * 0.3 + (dense ? i / 40 : 0))
      if (lastBars === 2 && i === 0) this.riser(s, t, s.beat * 8)
    }
    if (kind === 'intro' && info.pos === info.len - 1 && i % 4 === 0) this.tick(s, t, i === 12)
    if (sectionStart && (kind === 'drop' || kind === 'verse' || kind === 'outro')) this.crash(s, t)
    if (info.finish && i === 0) this.crash(s, t)

    // ── bass ──
    const bassOn = kind === 'verse' || kind === 'build' || kind === 'drop' || kind === 'lobby' || (kind === 'intro' && info.pos >= 2)
    const b = st.bass[i]
    if (bassOn && b !== '.') {
      const base = st.key - 24 + chord.root
      const note = b === 'o' ? base + 12 : b === 'f' ? base + 7 : base
      this.bass(s, t, note, s.beat * 0.45, kind === 'drop' ? 1 : 0.8)
    }

    // ── chords ──
    if ((kind === 'verse' || kind === 'drop' || kind === 'build') && on(st.stab)) this.stab(s, t, chord, s.beat * 0.4, kind === 'drop' ? 0.12 : 0.08)
    if (i === 0 && (kind === 'break' || kind === 'outro' || kind === 'lobby' || kind === 'drop' || (kind === 'intro' && info.pos < 2))) {
      this.pad(s, t, chord, s.beat * 4, kind === 'drop' ? 0.035 : 0.06)
    }

    // ── lead arpeggio ──
    const arpOn = kind === 'drop' || kind === 'break' || kind === 'lobby' || (kind === 'build' && info.pos >= info.len / 2)
    const a = st.arp[i]
    if (arpOn && a >= 0) {
      const tones = chord.tones
      const note = st.key + 12 + tones[a % tones.length] - 12 + Math.floor(a / tones.length) * 12
      this.lead(s, t, note, s.beat * 0.22, kind === 'drop' ? 0.07 : 0.045, st.lead)
    }
  }

  // ─── instruments ─────────────────────────────────────────────────────────

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private duck(s: Session, t: number): void {
    const g = s.synth.gain
    g.setValueAtTime(0.35, t)
    g.linearRampToValueAtTime(1, t + s.beat * 0.55)
  }

  private kick(s: Session, t: number, vol: number): void {
    const ctx = this.audio.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(165, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.1)
    this.env(g, t, 0.95 * vol, 0.003, 0.36)
    o.connect(g).connect(s.out)
    o.start(t)
    o.stop(t + 0.45)
    this.noiseHit(s.out, t, 0.012, 3000, 'highpass', 0.22 * vol)
  }

  private clap(s: Session, t: number, vol: number): void {
    for (let k = 0; k < 3; k += 1) this.noiseHit(s.out, t + k * 0.011, 0.02, 1300, 'bandpass', vol * 0.6)
    this.noiseHit(s.out, t + 0.033, 0.16, 1200, 'bandpass', vol * 0.5, this.audio.reverb)
  }

  private snare(s: Session, t: number, vol: number): void {
    this.noiseHit(s.out, t, 0.12, 1900, 'bandpass', vol)
    const ctx = this.audio.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(160, t + 0.06)
    this.env(g, t, vol * 0.6, 0.002, 0.07)
    o.connect(g).connect(s.out)
    o.start(t)
    o.stop(t + 0.12)
  }

  private hat(s: Session, t: number, open: boolean, vol: number): void {
    this.noiseHit(s.out, t, open ? 0.2 : 0.035, 8200, 'highpass', vol)
  }

  private crash(s: Session, t: number): void {
    this.noiseHit(s.out, t, 1.6, 5200, 'highpass', 0.18, this.audio.reverb)
  }

  private tick(s: Session, t: number, high: boolean): void {
    const ctx = this.audio.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = high ? 1760 : 1175
    this.env(g, t, 0.12, 0.002, 0.06)
    o.connect(g).connect(s.out)
    o.start(t)
    o.stop(t + 0.1)
  }

  private riser(s: Session, t: number, dur: number): void {
    const ctx = this.audio.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.audio.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 3
    f.frequency.setValueAtTime(300, t)
    f.frequency.exponentialRampToValueAtTime(7500, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.95)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(f).connect(g).connect(s.out)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  private noiseHit(dest: AudioNode, t: number, dur: number, freq: number, type: BiquadFilterType, vol: number, send?: AudioNode): void {
    const ctx = this.audio.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.audio.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = type === 'bandpass' ? 0.9 : 0.7
    const g = ctx.createGain()
    this.env(g, t, vol, 0.002, dur)
    src.connect(f).connect(g).connect(dest)
    if (send) g.connect(send)
    src.start(t, Math.random() * 0.8)
    src.stop(t + dur + 0.05)
  }

  private bass(s: Session, t: number, note: number, dur: number, vol: number): void {
    const ctx = this.audio.ctx
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 6
    f.frequency.setValueAtTime(220, t)
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.02)
    f.frequency.exponentialRampToValueAtTime(260, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.3 * vol, 0.004, dur)
    for (const [type, mult, detune] of [['sawtooth', 1, -6], ['square', 0.5, 6]] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = midiHz(note) * mult
      o.detune.value = detune
      o.connect(f)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    f.connect(g).connect(s.synth)
  }

  private stab(s: Session, t: number, chord: ChordDef, dur: number, vol: number): void {
    const ctx = this.audio.ctx
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(3200, t)
    f.frequency.exponentialRampToValueAtTime(700, t + dur)
    const g = ctx.createGain()
    this.env(g, t, vol, 0.004, dur)
    for (const tone of chord.tones) {
      for (const detune of [-9, 9]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midiHz(s.style.key + tone - 12)
        o.detune.value = detune
        o.connect(f)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
    }
    f.connect(g).connect(s.synth)
    g.connect(this.audio.delay)
  }

  private pad(s: Session, t: number, chord: ChordDef, dur: number, vol: number): void {
    const ctx = this.audio.ctx
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25)
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8)
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05)
    for (const tone of chord.tones) {
      for (const detune of [-12, 0, 12]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midiHz(s.style.key + tone - 12)
        o.detune.value = detune
        o.connect(f)
        o.start(t)
        o.stop(t + dur * 1.1)
      }
    }
    f.connect(g).connect(s.synth)
    g.connect(this.audio.reverb)
  }

  private lead(s: Session, t: number, note: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.audio.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = midiHz(note)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(5200, t)
    f.frequency.exponentialRampToValueAtTime(1200, t + dur)
    const g = ctx.createGain()
    this.env(g, t, vol, 0.003, dur)
    o.connect(f).connect(g).connect(s.synth)
    g.connect(this.audio.delay)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}
