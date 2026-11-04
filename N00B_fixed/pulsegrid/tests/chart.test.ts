import { describe, expect, it } from 'vitest'
import { arrowsForLevel, buildTimeline, expectedKey, makeArrows, OPEN_LEAD_BEATS, reversedForLevel, rng, TARGET_BEAT } from '../src/game/chart'
import { SONGS } from '../src/game/songs'

describe('arrows', () => {
  it('never repeats a direction three times in a row and places the requested reversals', () => {
    const r = rng(42)
    for (let k = 0; k < 200; k += 1) {
      const { arrows, reversed } = makeArrows(10, 3, r)
      expect(arrows).toHaveLength(10)
      expect(reversed.filter(Boolean)).toHaveLength(3)
      for (let i = 2; i < arrows.length; i += 1) expect(arrows[i] === arrows[i - 1] && arrows[i] === arrows[i - 2]).toBe(false)
    }
  })

  it('reversed arrows expect the opposite key', () => {
    expect(expectedKey('up', true)).toBe('down')
    expect(expectedKey('left', true)).toBe('right')
    expect(expectedKey('right', false)).toBe('right')
  })

  it('scales arrow count and reversals with level', () => {
    expect(arrowsForLevel(1)).toBe(3)
    expect(arrowsForLevel(8)).toBe(10)
    const song = { reverse: { from: 5, max: 2 } }
    expect(reversedForLevel(song, 4)).toBe(0)
    expect(reversedForLevel(song, 5)).toBe(1)
    expect(reversedForLevel(song, 7)).toBe(2)
    expect(reversedForLevel(song, 20)).toBe(2)
  })
})

describe('timeline', () => {
  it('is deterministic for a seed', () => {
    const a = buildTimeline(SONGS[2], 7)
    const b = buildTimeline(SONGS[2], 7)
    expect(a.rounds.map(r => r.arrows.join())).toEqual(b.rounds.map(r => r.arrows.join()))
  })

  for (const song of SONGS) {
    it(`builds a playable chart for ${song.title}`, () => {
      const tl = buildTimeline(song, 1)
      const bars = song.sections.reduce((n, s) => n + s.bars, 0)
      expect(tl.bars).toHaveLength(bars)
      expect(tl.duration).toBeCloseTo(bars * (240 / song.bpm))
      expect(tl.rounds.length).toBeGreaterThan(10)
      // Exactly one finish move: the last round, with the song's finish length.
      const finishes = tl.rounds.filter(r => r.finish)
      expect(finishes).toHaveLength(1)
      expect(tl.rounds[tl.rounds.length - 1].finish).toBe(true)
      expect(finishes[0].arrows).toHaveLength(song.finish.arrows)
      tl.rounds.forEach((r, i) => {
        expect(r.target).toBeCloseTo((r.bar * 4 + TARGET_BEAT) * tl.beat)
        expect(r.openAt).toBeCloseTo(r.target - OPEN_LEAD_BEATS * tl.beat)
        if (i > 0) expect(r.target).toBeGreaterThan(tl.rounds[i - 1].target)
      })
      // Levels never go down across the song's playable sections.
      const levels = tl.rounds.filter(r => !r.finish).map(r => r.level)
      for (let i = 1; i < levels.length; i += 1) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1])
      // Songs start with an intro to count in and end with an outro.
      expect(song.sections[0].kind).toBe('intro')
      expect(song.sections[song.sections.length - 1].kind).toBe('outro')
    })
  }

  it('orders the setlist by difficulty with a no-fail warm-up first', () => {
    expect(SONGS[0].noFail).toBe(true)
    expect(SONGS.map(s => s.bpm)).toEqual([...SONGS.map(s => s.bpm)].sort((a, b) => a - b))
    expect(SONGS.every((s, i) => i === 0 || s.stars >= SONGS[i - 1].stars)).toBe(true)
  })

  it('teaches every hint in the warm-up', () => {
    const tl = buildTimeline(SONGS[0], 3)
    const hints = new Set(tl.rounds.map(r => r.hint))
    for (const h of ['arrows', 'beat', 'reverse', 'finish']) expect(hints.has(h as never)).toBe(true)
  })
})
