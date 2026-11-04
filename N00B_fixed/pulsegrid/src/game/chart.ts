/**
 * Song timelines and arrow charts (pure, unit tested).
 *
 * A song is a list of sections measured in 4/4 bars. Every bar in a verse, build or drop is one
 * "round": an arrow sequence is shown, the player types it, then taps the beat key when the
 * timing marker reaches beat 4 of that bar. Intros, breaks and outros are free-dance bars.
 */
export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: readonly Dir[] = ['left', 'up', 'down', 'right']
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export type SectionKind = 'intro' | 'verse' | 'build' | 'drop' | 'break' | 'outro'
export type HintKey = 'arrows' | 'beat' | 'reverse' | 'finish' | 'freestyle'
export type Section = {
  kind: SectionKind
  bars: number
  /** Difficulty level; a level-L round has L + 2 arrows. */
  level?: number
  /** Explicit reversed-arrow count (tutorial); otherwise derived from the song's reverse rule. */
  reversed?: number
  /** Tutorial coaching shown during this section. */
  hint?: HintKey
}

export type ChordDef = { root: number; tones: number[] }
export type MusicStyle = {
  /** MIDI note of the key centre for pads/stabs; bass plays two octaves lower. */
  key: number
  chords: ChordDef[]
  kick: string
  clap: string
  hat: string
  hatDrop: string
  bass: string
  stab: string
  arp: number[]
  lead: OscillatorType
  swing: number
}

export type Palette = { a: string; b: string; c: string }
export type Song = {
  id: string
  title: string
  artist: string
  tagline: string
  bpm: number
  difficulty: 'Warm-Up' | 'Easy' | 'Normal' | 'Hard'
  stars: number
  noFail: boolean
  rivalSkill: [number, number, number]
  /** Reversed arrows appear from `from` level, one more every two levels, up to `max`. */
  reverse: { from: number; max: number }
  finish: { arrows: number; reversed: number }
  /** Freestyle bonus: this many round bars right before the finish become chain links (0 = none). */
  freestyle?: number
  sections: Section[]
  style: MusicStyle
  palette: Palette
}

export type BarInfo = { kind: SectionKind; section: number; level: number; round: number; finish: boolean; freestyle: boolean; hint?: HintKey }
export type Round = {
  index: number
  bar: number
  /** Song time (s) of the beat the player must hit: beat 4 of the round's bar. */
  target: number
  /** Earliest song time the sequence may appear (it also waits for the previous round). */
  openAt: number
  arrows: Dir[]
  reversed: boolean[]
  level: number
  finish: boolean
  /** Freestyle bonus link: chained power-move rounds right before the finish. */
  freestyle: boolean
  /** 0-based link index inside the freestyle run (-1 outside it). */
  link: number
  section: number
  hint?: HintKey
}
export type Timeline = { beat: number; barSeconds: number; bars: BarInfo[]; rounds: Round[]; duration: number }

export const PLAYABLE: ReadonlySet<SectionKind> = new Set(['verse', 'build', 'drop'])
/** Target beat inside a round bar (0-based): the 4th beat. */
export const TARGET_BEAT = 3
/** How many beats before its target a round's arrows may appear at the earliest. */
export const OPEN_LEAD_BEATS = 4.25
/** Freestyle links start at this many arrows and grow by one per link up to the cap; never reversed. */
export const FREESTYLE_ARROWS = { start: 4, max: 6 }
export function freestyleArrows(link: number): number {
  return Math.min(FREESTYLE_ARROWS.max, FREESTYLE_ARROWS.start + link)
}

export function arrowsForLevel(level: number): number {
  return Math.max(1, level + 2)
}

export function reversedForLevel(song: Pick<Song, 'reverse'>, level: number): number {
  if (level < song.reverse.from) return 0
  return Math.min(song.reverse.max, 1 + Math.floor((level - song.reverse.from) / 2))
}

/** The key the player must press for an arrow: reversed arrows want the opposite direction. */
export function expectedKey(dir: Dir, reversed: boolean): Dir {
  return reversed ? OPPOSITE[dir] : dir
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random arrow run with no direction repeated three times in a row. */
export function makeArrows(count: number, reversedCount: number, rand: () => number): { arrows: Dir[]; reversed: boolean[] } {
  const arrows: Dir[] = []
  for (let i = 0; i < count; i += 1) {
    let d: Dir
    do d = DIRS[Math.floor(rand() * 4)]
    while (i >= 2 && arrows[i - 1] === d && arrows[i - 2] === d)
    arrows.push(d)
  }
  const reversed = arrows.map(() => false)
  const slots = arrows.map((_, i) => i)
  for (let n = 0; n < Math.min(reversedCount, count); n += 1) {
    const pick = Math.floor(rand() * slots.length)
    reversed[slots[pick]] = true
    slots.splice(pick, 1)
  }
  return { arrows, reversed }
}

export function buildTimeline(song: Song, seed: number): Timeline {
  const beat = 60 / song.bpm
  const barSeconds = beat * 4
  const rand = rng(seed)
  const bars: BarInfo[] = []
  song.sections.forEach((section, si) => {
    for (let b = 0; b < section.bars; b += 1) {
      bars.push({ kind: section.kind, section: si, level: section.level ?? 0, round: -1, finish: false, freestyle: false, hint: section.hint })
    }
  })
  const roundBars = bars.map((b, i) => (PLAYABLE.has(b.kind) ? i : -1)).filter(i => i >= 0)
  const last = roundBars[roundBars.length - 1]
  // Freestyle links: the round bars immediately before the finish (never the finish itself).
  const fsCount = Math.max(0, Math.min(song.freestyle ?? 0, roundBars.length - 1))
  const fsFirst = roundBars.length - 1 - fsCount
  const rounds: Round[] = roundBars.map((bar, index) => {
    const info = bars[bar]
    const section = song.sections[info.section]
    const finish = bar === last
    const freestyle = !finish && fsCount > 0 && index >= fsFirst
    const link = freestyle ? index - fsFirst : -1
    const count = finish ? song.finish.arrows : freestyle ? freestyleArrows(link) : arrowsForLevel(info.level)
    const rev = finish ? song.finish.reversed : freestyle ? 0 : section.reversed ?? reversedForLevel(song, info.level)
    const { arrows, reversed } = makeArrows(count, rev, rand)
    info.round = index
    info.finish = finish
    info.freestyle = freestyle
    const target = (bar * 4 + TARGET_BEAT) * beat
    return {
      index,
      bar,
      target,
      openAt: target - OPEN_LEAD_BEATS * beat,
      arrows,
      reversed,
      level: info.level,
      finish,
      freestyle,
      link,
      section: info.section,
      hint: finish && song.noFail ? 'finish' : freestyle && link === 0 ? 'freestyle' : info.hint,
    }
  })
  return { beat, barSeconds, bars, rounds, duration: bars.length * barSeconds }
}
