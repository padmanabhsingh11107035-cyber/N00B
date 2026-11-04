import { describe, expect, it } from 'vitest'
import { defaultSave, OFFSET_LIMIT, parseSave, SAVE_KEY, SaveStore } from '../src/engine/save'

describe('parseSave', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{nope')).toEqual(defaultSave())
    expect(parseSave('[1,2]')).toEqual(defaultSave())
    expect(parseSave(JSON.stringify({ version: 99, muted: true }))).toEqual(defaultSave())
  })

  it('clamps values and drops invalid best records', () => {
    const s = parseSave(JSON.stringify({
      version: 1, musicVolume: 3, sfxVolume: -1, muted: true, quality: 'ultra', offsetMs: 999, tutorialDone: true,
      best: { good: { score: 1234.7, rank: 'A', combo: 12, accuracy: 0.9 }, bad: { score: 'x', rank: 'A' }, weird: { score: 5, rank: 'Z' } },
    }))
    expect(s.musicVolume).toBe(1)
    expect(s.sfxVolume).toBe(0)
    expect(s.muted).toBe(true)
    expect(s.quality).toBe('high')
    expect(s.offsetMs).toBe(OFFSET_LIMIT)
    expect(s.tutorialDone).toBe(true)
    expect(Object.keys(s.best)).toEqual(['good'])
    expect(s.best.good.score).toBe(1234)
  })
})

describe('SaveStore', () => {
  it('round-trips through storage and survives storage failures', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    const a = new SaveStore(storage)
    a.update({ offsetMs: 40, lastSong: 'neon-heartbeat' })
    expect(JSON.parse(mem.get(SAVE_KEY)!).offsetMs).toBe(40)
    expect(new SaveStore(storage).data.lastSong).toBe('neon-heartbeat')

    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    const b = new SaveStore(broken)
    expect(() => b.update({ muted: true })).not.toThrow()
    expect(b.data.muted).toBe(true)
  })
})
