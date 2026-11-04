import { describe, expect, it } from 'vitest'
import { accentTime, scaleNote, SONG_KEYS } from '../src/game/feedback'
import { TRACKS } from '../src/game/manifest'
import { SONGS } from '../src/game/songs'
import { defaultSave, parseSave } from '../src/engine/save'
import analysisJson from '../assets/performance/audio/music/analysis.json'


const analysis = analysisJson as Record<string, { bpm: number; firstBeat: number; bars: number }>

describe('in-key feedback notes', () => {
  it('walks the pentatonic scale and wraps octaves', () => {
    const E = { root: 64, mode: 'major' as const }
    expect([0, 1, 2, 3, 4, 5].map(d => scaleNote(E, d))).toEqual([64, 66, 68, 71, 73, 76])
    expect(scaleNote({ root: 65, mode: 'minor' }, 2)).toBe(70)
    expect(scaleNote({ root: 65, mode: 'sus' }, 4)).toBe(77)
    expect(scaleNote(E, -1)).toBe(61)
  })
  it('gives every song and the title a key', () => {
    for (const s of SONGS) expect(SONG_KEYS[s.id], s.id).toBeDefined()
    expect(SONG_KEYS.title).toBeDefined()
  })
})

describe('beat-quantized accents', () => {
  it('snaps slightly early hits onto the target beat', () => {
    expect(accentTime(9.95, 10)).toBe(10)
    expect(accentTime(9.91, 10)).toBe(10)
  })
  it('plays late or very early hits when pressed', () => {
    expect(accentTime(10.03, 10)).toBe(10.03)
    expect(accentTime(9.8, 10)).toBe(9.8)
  })
})

describe('music sync invariants', () => {
  it('uses the beat-locked grid for every song chart', () => {
    for (const s of SONGS) {
      const tr = TRACKS[s.id]
      expect(tr, s.id).toBeDefined()
      expect(s.bpm, s.id).toBe(tr.bpm)
      expect(tr.bpm, s.id).toBe(analysis[s.id].bpm)
      expect(tr.firstBeat, s.id).toBe(analysis[s.id].firstBeat)
    }
    expect(TRACKS.title.bpm).toBe(analysis.title.bpm)
  })
  it('never charts past the locked audio', () => {
    for (const s of SONGS) {
      const bars = s.sections.reduce((a, x) => a + x.bars, 0)
      expect(bars, s.id).toBe(analysis[s.id].bars)
    }
  })
})

describe('beat assist setting', () => {
  it('defaults on and round-trips off', () => {
    expect(defaultSave().beatAssist).toBe(true)
    expect(parseSave(JSON.stringify({ ...defaultSave(), beatAssist: false })).beatAssist).toBe(false)
    expect(parseSave(JSON.stringify({ version: 1 })).beatAssist).toBe(true)
  })
})
