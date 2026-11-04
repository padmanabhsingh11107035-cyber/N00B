import type { Audio } from '../engine/audio'
import type { Dir, Timeline } from './chart'
import type { Grade } from './rules'
import type { Music } from './music'

/**
 * Gameplay audio feedback, scheduled on the AudioContext clock so it lands on the music grid
 * (frame-driven `play()` calls would arrive one output latency + a frame late).
 *
 * - Arrow inputs play in-key pentatonic notes that climb as the sequence fills (panned by direction).
 * - A completed sequence "locks" with a chime and, with beat assist, a riser that swells exactly
 *   into the target beat. Beat assist also ticks softly on each beat while a round is open.
 * - Hits are beat-quantized: an early Perfect's kick/clap accent is scheduled *on* the beat.
 *   Grade-scaled bell chords climb with the combo tier; misses groan and muffle the music.
 * - The intro count-in is scheduled on the grid too.
 */
export type KeyMode = 'major' | 'minor' | 'sus'
export type SongKey = { root: number; mode: KeyMode }

/** Detected with a chroma key profile on the locked tracks (docs/audio-sync-notes.md). */
export const SONG_KEYS: Record<string, SongKey> = {
  title: { root: 66, mode: 'minor' },
  warmup: { root: 64, mode: 'major' },
  'neon-heartbeat': { root: 64, mode: 'major' },
  'midnight-circuit': { root: 65, mode: 'minor' },
  // F major vs F minor is ambiguous in this track: use the shared 1-2-4-5 set so nothing clashes.
  'starlight-overdrive': { root: 65, mode: 'sus' },
}

const SCALES: Record<KeyMode, number[]> = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
  sus: [0, 2, 5, 7],
}

/** MIDI note of scale `degree` (0 = root; wraps into higher octaves). Pure; unit tested. */
export function scaleNote(key: SongKey, degree: number): number {
  const sc = SCALES[key.mode]
  const n = sc.length
  const oct = Math.floor(degree / n)
  const i = ((degree % n) + n) % n
  return key.root + oct * 12 + sc[i]
}

/** Accent time for a hit: early hits within `window` s snap onto the target beat. Pure; unit tested. */
export function accentTime(pressT: number, targetT: number, window = 0.09): number {
  const early = targetT - pressT
  return early > 0 && early <= window ? targetT : pressT
}

const PAN: Record<Dir, number> = { left: -0.45, right: 0.45, up: 0.08, down: -0.08 }
const LOOKAHEAD = 0.14

export class Feedback {
  private key: SongKey = SONG_KEYS.warmup
  private bus?: GainNode
  private lastBeat = Number.NEGATIVE_INFINITY
  private beat = 0.5
  /** Count-in bar index (the last intro bar), or -1. */
  private countBar = -1

  constructor(private readonly audio: Audio, private readonly music: Music) {}

  begin(songId: string, tl: Timeline): void {
    this.end()
    this.key = SONG_KEYS[songId] ?? SONG_KEYS.warmup
    this.beat = tl.beat
    const first = tl.rounds[0]
    this.countBar = first ? first.bar - 1 : -1
    this.lastBeat = Number.NEGATIVE_INFINITY
    const g = this.audio.ctx.createGain()
    g.gain.value = 1
    g.connect(this.audio.sfx)
    this.bus = g
    this.audio.setFever(false)
  }

  /** Stop feedback for the current song; already-scheduled grid sounds are faded out. */
  end(): void {
    const b = this.bus
    this.audio.setFever(false)
    if (!b) return
    const t = this.audio.ctx.currentTime
    b.gain.cancelScheduledValues(t)
    b.gain.setValueAtTime(b.gain.value, t)
    b.gain.linearRampToValueAtTime(0, t + 0.06)
    window.setTimeout(() => b.disconnect(), 400)
    this.bus = undefined
  }

  private get out(): AudioNode {
    return this.bus ?? this.audio.sfx
  }

  private now(): number {
    return this.audio.ctx.currentTime
  }

  /**
   * Per frame: schedule grid-locked sounds for beats entering the lookahead window.
   * `round` is the next unresolved round (or undefined), `locked` whether its sequence is complete.
   */
  schedule(t: number, round: { openAt: number; target: number } | undefined, locked: boolean, assist: boolean): void {
    if (!this.bus) return
    const B = this.beat
    if (!Number.isFinite(this.lastBeat)) this.lastBeat = Math.floor((t + LOOKAHEAD) / B) - 1
    while ((this.lastBeat + 1) * B <= t + LOOKAHEAD) {
      const b = (this.lastBeat += 1)
      const bt = b * B
      if (bt < t - 0.03) continue
      const at = this.music.ctxAt(bt)
      if (at === undefined) continue
      const bar = Math.floor(b / 4)
      const k = ((b % 4) + 4) % 4
      if (b >= 0 && bar === this.countBar) {
        // Count-in: 3, 2, 1, Dance! — sample-accurate on the beat.
        this.note(k < 3 ? 'count' : 'go', at, bt)
        if (k === 0) this.audio.playAt('ready', at)
        if (k < 3) {
          this.audio.playAt('count', at)
          this.audio.voice(scaleNote(this.key, 5 + k), at, { gain: 0.09, dur: 0.18, bright: 0.4, dest: this.out })
        } else {
          this.audio.playAt('go', at)
          this.audio.punch(at, 0.7, this.out)
          for (const d of [5, 7, 9]) this.audio.voice(scaleNote(this.key, d), at, { gain: 0.08, dur: 0.5, verb: 0.3, dest: this.out })
        }
        continue
      }
      if (!assist || !round) continue
      // Beat assist: soft ticks on the beats leading into the target (the last one before the
      // target carries an accent), skipped once a riser is already carrying the player in.
      if (bt >= round.openAt - 1e-3 && bt < round.target - 1e-3 && bt > round.target - 4.01 * B) {
        if (locked && bt >= this.riserFrom()) continue
        const last = bt >= round.target - B * 1.01
        this.note('assist', at, bt)
        this.audio.voice(scaleNote(this.key, last ? 10 : 5), at, { gain: last ? 0.07 : 0.045, dur: 0.07, bright: 0.25, type: 'sine', dest: this.out })
        this.audio.burst(at, { dur: 0.035, freq: 9000, q: 0.7, gain: last ? 0.05 : 0.03, type: 'highpass', dest: this.out })
      }
    }
  }

  private riserStart = Number.POSITIVE_INFINITY
  /** Ring buffer of scheduled grid sounds (kind, context time, song time) for sync probes. */
  readonly log: Array<{ kind: string; at: number; songT: number }> = []
  private note(kind: string, at: number, songT: number): void {
    this.log.push({ kind, at, songT })
    if (this.log.length > 400) this.log.shift()
  }
  private riserFrom(): number {
    return this.riserStart
  }

  /** One correct arrow. `step` is 0-based within the sequence. */
  arrow(step: number, total: number, dir: Dir, reversed: boolean): void {
    const at = this.now()
    // Spread longer sequences over ~1.6 octaves so the final arrow always tops the phrase.
    const span = Math.max(4, Math.min(total - 1, 8))
    const deg = total > 1 ? Math.round((step / (total - 1)) * span) : 0
    const midi = scaleNote(this.key, deg)
    const up = dir === 'up', down = dir === 'down'
    this.audio.voice(midi, at, { gain: 0.15, dur: 0.24, pan: PAN[dir], bright: up ? 0.95 : down ? 0.3 : 0.6, verb: 0.18, dest: this.out })
    if (reversed) this.audio.voice(midi - 12, at, { gain: 0.07, dur: 0.2, pan: PAN[dir], type: 'square', bright: 0.1, dest: this.out })
    if (!this.audio.sample('arrow_tick', 0.42)) this.audio.burst(at, { dur: 0.03, freq: 5000, gain: 0.05, type: 'highpass', dest: this.out })
  }

  /** Wrong key: dissonant buzz, a quick muffle of the music. */
  wrong(): void {
    const at = this.now()
    this.audio.play('wrong')
    this.audio.voice(this.key.root - 12, at, { gain: 0.07, dur: 0.2, type: 'square', bright: 0.1, dest: this.out })
    this.audio.voice(this.key.root - 11, at, { gain: 0.07, dur: 0.2, type: 'square', bright: 0.1, dest: this.out })
    this.audio.dip(900, 0.35)
    this.audio.duck(0.72, at, 0.04, 0.2)
  }

  /** Sequence complete: lock chime plus (with assist) a riser that peaks exactly on the target. */
  locked(target: number, assist: boolean): void {
    const at = this.now()
    this.audio.play('lock')
    this.audio.voice(scaleNote(this.key, 5), at, { gain: 0.1, dur: 0.3, verb: 0.25, dest: this.out })
    this.audio.voice(scaleNote(this.key, 7), at + 0.05, { gain: 0.09, dur: 0.35, verb: 0.25, dest: this.out })
    const end = this.music.ctxAt(target)
    if (!assist || end === undefined) return
    const dur = Math.min(1.6, Math.max(0.12, end - at))
    this.riserStart = target - dur
    this.audio.burst(end - dur, { dur, freq: 380, sweepTo: 6500, q: 2.2, gain: 0.09, swell: true, dest: this.out })
  }

  /**
   * Beat judgement. `pressT` is the (offset-corrected) song time of the press; `targetT` the beat.
   * `combo` is the combo *after* this hit.
   */
  hit(grade: Grade, pressT: number, targetT: number, combo: number, fever: boolean): void {
    const now = this.now()
    const accentAt = Math.max(now, this.music.ctxAt(accentTime(pressT, targetT)) ?? now)
    this.note(`hit:${grade}`, accentAt, targetT)
    this.riserStart = Number.POSITIVE_INFINITY
    const tier = Math.min(4, Math.floor(combo / 10))
    const K = this.key
    const o = this.out
    switch (grade) {
      case 'perfect': {
        this.audio.punch(accentAt, 0.95, o)
        this.audio.burst(accentAt, { dur: 0.13, freq: 1700, q: 0.9, gain: 0.24, dest: o })
        this.audio.burst(accentAt, { dur: 0.38, freq: 8500, q: 0.6, gain: 0.07, type: 'highpass', dest: o })
        for (const [i, d] of [0, 2, 4].entries()) this.audio.voice(scaleNote(K, 5 + tier + d), accentAt + i * 0.012, { gain: 0.11, dur: 0.7, verb: 0.4, bright: 0.8, dest: o })
        if (fever) this.audio.voice(scaleNote(K, 10 + tier), accentAt, { gain: 0.08, dur: 0.8, verb: 0.5, bright: 1, dest: o })
        this.audio.duck(0.5, accentAt, 0.06, 0.26)
        break
      }
      case 'great':
        this.audio.punch(accentAt, 0.7, o)
        this.audio.burst(accentAt, { dur: 0.11, freq: 1700, q: 0.9, gain: 0.17, dest: o })
        for (const d of [0, 2]) this.audio.voice(scaleNote(K, 5 + tier + d), accentAt, { gain: 0.1, dur: 0.5, verb: 0.3, bright: 0.6, dest: o })
        this.audio.duck(0.64, accentAt, 0.05, 0.22)
        break
      case 'cool':
        this.audio.punch(accentAt, 0.4, o)
        this.audio.voice(scaleNote(K, 5 + tier), accentAt, { gain: 0.09, dur: 0.32, verb: 0.2, bright: 0.4, dest: o })
        this.audio.duck(0.8, accentAt, 0.04, 0.2)
        break
      case 'bad':
        this.audio.punch(now, 0.3, o)
        this.audio.burst(now, { dur: 0.16, freq: 260, q: 0.7, gain: 0.14, type: 'lowpass', dest: o })
        this.audio.dip(1500, 0.3)
        break
      case 'miss':
        this.audio.groan(now, 0.12)
        this.audio.dip(520, 0.75)
        this.audio.duck(0.6, now, 0.1, 0.5)
        break
    }
  }

  /** Combo milestone: a quick in-key arpeggio run. */
  milestone(big: boolean): void {
    const at = this.now()
    const n = big ? 8 : 5
    for (let i = 0; i < n; i += 1) this.audio.voice(scaleNote(this.key, 5 + i), at + i * 0.045, { gain: 0.085, dur: 0.4, verb: 0.4, bright: 0.8, dest: this.out })
  }

  /** Fever on/off: brighten the music; on entry, a sweep and a wide chord. */
  fever(on: boolean): void {
    this.audio.setFever(on)
    if (!on) return
    const at = this.now()
    this.audio.burst(at, { dur: 0.7, freq: 500, sweepTo: 9000, q: 1.8, gain: 0.08, dest: this.out })
    for (const d of [0, 2, 4, 5]) this.audio.voice(scaleNote(this.key, 5 + d), at + 0.1, { gain: 0.08, dur: 1.1, verb: 0.55, bright: 0.9, dest: this.out })
  }

  /** Freestyle chain link: each link rings a step higher. */
  chain(n: number): void {
    const at = this.now()
    this.audio.voice(scaleNote(this.key, 7 + Math.min(n, 6) * 2), at, { gain: 0.1, dur: 0.6, verb: 0.45, bright: 1, dest: this.out })
  }
}
