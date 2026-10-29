import { describe, expect, it } from 'vitest'
import { defaultSave, insertScore, LEADERBOARD_SIZE, mergeProgress, parseSave, SAVE_KEY, SaveStore, type ScoreEntry } from '../src/engine/save'

describe('save', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{nope')).toEqual(defaultSave())
    expect(parseSave('[]')).toEqual(defaultSave())
    expect(parseSave(JSON.stringify({ version: 99, musicVolume: 0.1 }))).toEqual(defaultSave())
  })

  it('clamps and validates fields', () => {
    const s = parseSave(JSON.stringify({ version: 1, musicVolume: 5, sfxVolume: -1, locale: 'fr', quality: 'ultra', sensitivity: 9, playerName: '  a very long player name here ' }))
    expect(s.musicVolume).toBe(1)
    expect(s.sfxVolume).toBe(0)
    expect(s.locale).toBe('')
    expect(s.quality).toBe('high')
    expect(s.sensitivity).toBe(1)
    expect(s.playerName).toBe('a very long')
  })

  it('keeps a bounded, ordered leaderboard', () => {
    let board: ScoreEntry[] = []
    for (let i = 0; i < LEADERBOARD_SIZE + 3; i += 1) board = insertScore(board, { name: `p${i}`, score: i * 10, stars: 1, shots: 4, at: i }).board
    expect(board).toHaveLength(LEADERBOARD_SIZE)
    expect(board[0].score).toBe((LEADERBOARD_SIZE + 2) * 10)
    // Equal score: fewer shots ranks higher.
    const tie = insertScore(board, { name: 'sharp', score: board[0].score, stars: 3, shots: 2, at: 999 })
    expect(tie.rank).toBe(0)
    expect(insertScore(board, { name: 'low', score: 0, stars: 1, shots: 1, at: 1 }).rank).toBe(-1)
  })
  it('keeps the best stars and score per level', () => {
    let p = mergeProgress({}, 'timber', 2, 12000)
    p = mergeProgress(p, 'timber', 1, 15000)
    expect(p.timber).toEqual({ stars: 2, best: 15000 })
    const restored = parseSave(JSON.stringify({ version: 1, progress: { timber: { stars: 9, best: -5 }, bad: 3 }, boards: { timber: [{ name: 'a', score: 5, stars: 2, shots: 3, at: 1 }, { nope: 1 }] } }))
    expect(restored.progress.timber.stars).toBeLessThanOrEqual(3)
    expect(restored.progress.timber.best).toBeGreaterThanOrEqual(0)
    expect(restored.boards.timber).toHaveLength(1)
  })

  it('persists through storage and survives storage errors', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    new SaveStore(storage).update({ musicVolume: 0.3, locale: 'zh-CN' })
    expect(JSON.parse(mem.get(SAVE_KEY)!).musicVolume).toBe(0.3)
    expect(new SaveStore(storage).data.locale).toBe('zh-CN')
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    const store = new SaveStore(broken)
    expect(() => store.update({ muted: true })).not.toThrow()
    expect(store.data.muted).toBe(true)
  })
})
