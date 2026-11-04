import { describe, expect, it } from 'vitest'
import { defaultSave, isNewBest, parseSave, SAVE_KEY, SaveStore } from '../src/engine/save'
import { CONFIG } from '../src/game/config'
import { betterRank, createRun, die, finish, formatTime, PAR_SECONDS, rankOf, reachCheckpoint, tick } from '../src/game/rules'

describe('save', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{nope')).toEqual(defaultSave())
    expect(parseSave('[]')).toEqual(defaultSave())
    expect(parseSave(JSON.stringify({ version: 99, musicVolume: 0.1 }))).toEqual(defaultSave())
  })

  it('clamps and validates fields', () => {
    const s = parseSave(JSON.stringify({ version: 1, musicVolume: 5, sfxVolume: -1, locale: 'fr', quality: 'ultra', bestTime: -3, bestRank: 'Z', clears: 2.7, attempts: 'x' }))
    expect(s.musicVolume).toBe(1)
    expect(s.sfxVolume).toBe(0)
    expect(s.locale).toBe('')
    expect(s.quality).toBe('high')
    expect(s.bestTime).toBe(0)
    expect(s.bestRank).toBe('')
    expect(s.clears).toBe(2)
    expect(s.attempts).toBe(0)
  })

  it('compares personal bests by time', () => {
    const s = defaultSave()
    expect(isNewBest(s, 120)).toBe(true)
    expect(isNewBest({ ...s, bestTime: 90 }, 95)).toBe(false)
    expect(isNewBest({ ...s, bestTime: 90 }, 89.5)).toBe(true)
  })

  it('persists through storage and survives storage errors', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    new SaveStore(storage).update({ bestTime: 88.2, locale: 'zh-CN' })
    expect(JSON.parse(mem.get(SAVE_KEY)!).bestTime).toBe(88.2)
    expect(new SaveStore(storage).data.locale).toBe('zh-CN')
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    const store = new SaveStore(broken)
    expect(() => store.update({ muted: true })).not.toThrow()
    expect(store.data.muted).toBe(true)
  })
})

describe('run rules', () => {
  it('counts time, deaths and checkpoint streaks', () => {
    let r = tick(createRun(), 1.5)
    r = die(die(r))
    expect(r.deaths).toBe(2)
    expect(r.streak).toBe(2)
    r = reachCheckpoint(r, 1)
    expect(r.streak).toBe(0)
    expect(reachCheckpoint(r, 1)).toBe(r)
    expect(r.elapsed).toBeCloseTo(1.5)
  })

  it('freezes after the finish and assigns a rank', () => {
    const won = finish(tick(createRun(), PAR_SECONDS))
    expect(won.phase).toBe('won')
    expect(won.rank).toBe('S')
    expect(tick(won, 5)).toBe(won)
    expect(die(won)).toBe(won)
  })

  it('ranks by time with a death penalty', () => {
    expect(rankOf(PAR_SECONDS, 0)).toBe('S')
    expect(rankOf(PAR_SECONDS, 2)).not.toBe('S')
    expect(rankOf(PAR_SECONDS * 1.3, 0)).toBe('A')
    expect(rankOf(PAR_SECONDS, 20)).toBe(rankOf(PAR_SECONDS + 20 * CONFIG.run.deathPenalty, 0))
    expect(rankOf(PAR_SECONDS * 4, 30)).toBe('C')
    expect(betterRank('', 'C')).toBe(true)
    expect(betterRank('A', 'S')).toBe(true)
    expect(betterRank('S', 'A')).toBe(false)
  })

  it('formats split times', () => {
    expect(formatTime(83.456)).toBe('1:23.45')
    expect(formatTime(5)).toBe('0:05.00')
    expect(formatTime(-1)).toBe('0:00.00')
  })
})
