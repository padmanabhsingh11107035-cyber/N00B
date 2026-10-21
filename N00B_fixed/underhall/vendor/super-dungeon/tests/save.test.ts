import { describe, expect, it } from 'vitest'
import { defaultSave, parseSave, SAVE_KEY, SaveStore } from '../src/engine/save'

describe('save', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{nope')).toEqual(defaultSave())
    expect(parseSave('[]')).toEqual(defaultSave())
    expect(parseSave(JSON.stringify({ version: 1, musicVolume: 0.1 }))).toEqual(defaultSave())
  })
  it('clamps and validates fields', () => {
    const s = parseSave(JSON.stringify({
      version: 2, musicVolume: 5, sfxVolume: -1, quality: 'ultra', sensitivity: 9, merits: -4,
      dev: { vitality: 99, training: 2.7, focus: 'x' }, rescued: ['pixel', 'pixel', 'nobody'], relics: ['cape', 7], lore: ['l1', 'zzz'],
    }))
    expect(s.musicVolume).toBe(1)
    expect(s.sfxVolume).toBe(0)
    expect(s.quality).toBe('high')
    expect(s.sensitivity).toBe(1)
    expect(s.merits).toBe(0)
    expect(s.dev).toEqual({ vitality: 5, training: 2, focus: 0, insight: 0 })
    expect(s.rescued).toEqual(['pixel'])
    expect(s.relics).toEqual(['cape'])
    expect(s.lore).toEqual(['l1'])
  })
  it('adds the movement-training flag without invalidating older v2 saves', () => {
    expect(defaultSave().tutorialDone).toBe(false)
    const old = parseSave(JSON.stringify({ version: 2, merits: 9, introSeen: true }))
    expect(old.merits).toBe(9)
    expect(old.introSeen).toBe(true)
    expect(old.tutorialDone).toBe(false)
    expect(parseSave(JSON.stringify({ version: 2, tutorialDone: true })).tutorialDone).toBe(true)
    expect(parseSave(JSON.stringify({ version: 2, tutorialDone: 'yes' })).tutorialDone).toBe(false)
  })
  it('persists through storage and survives storage errors', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    new SaveStore(storage).update({ musicVolume: 0.3, merits: 42 })
    expect(JSON.parse(mem.get(SAVE_KEY)!).merits).toBe(42)
    expect(new SaveStore(storage).data.musicVolume).toBe(0.3)
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    const store = new SaveStore(broken)
    expect(() => store.update({ muted: true })).not.toThrow()
    expect(store.data.muted).toBe(true)
  })
})
