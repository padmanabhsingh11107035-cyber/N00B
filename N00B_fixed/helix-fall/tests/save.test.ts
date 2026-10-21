import { describe, expect, it } from 'vitest'
import { defaultSave, insertScore, LEADERBOARD_SIZE, parseSave, SAVE_KEY, SaveStore } from '../src/engine/save'

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
    expect(s.playerName).toBe('a very long play')
  })

  it('keeps a bounded, ordered leaderboard', () => {
    let board = [] as ReturnType<typeof defaultSave>['leaderboard']
    for (let i = 0; i < LEADERBOARD_SIZE + 3; i += 1) board = insertScore(board, { name: `p${i}`, score: i * 10, seconds: 60, at: i }).board
    expect(board).toHaveLength(LEADERBOARD_SIZE)
    expect(board[0].score).toBe((LEADERBOARD_SIZE + 2) * 10)
    const tie = insertScore(board, { name: 'fast', score: board[0].score, seconds: 30, at: 999 })
    expect(tie.rank).toBe(0)
    expect(insertScore(board, { name: 'low', score: 0, seconds: 1, at: 1 }).rank).toBe(-1)
  })

  it('shows each player once: only their best score, per day', () => {
    const day1 = Date.UTC(2026, 9, 21, 1)
    const day2 = Date.UTC(2026, 9, 22, 1)
    let board = insertScore([], { name: 'Ann', score: 330, seconds: 50, at: day1 }).board
    board = insertScore(board, { name: 'Ann', score: 960, seconds: 60, at: day1 + 1000 }).board
    const worse = insertScore(board, { name: 'ann', score: 755, seconds: 40, at: day1 + 2000 })
    expect(worse.board.map(e => e.score)).toEqual([960])
    expect(worse.rank).toBe(0)
    board = insertScore(worse.board, { name: 'Bob', score: 500, seconds: 40, at: day1 + 3000 }).board
    expect(board.map(e => `${e.name}:${e.score}`)).toEqual(['Ann:960', 'Bob:500'])
    // the same player on the next day gets a row of that day (today's board must not lose to yesterday's high score)
    board = insertScore(board, { name: 'Ann', score: 100, seconds: 40, at: day2 }).board
    expect(board.filter(e => e.name === 'Ann').map(e => e.score).sort((a, b) => b - a)).toEqual([960, 100])
  })

  it('cleans up an old board that holds the same player many times', () => {
    const at = Date.UTC(2026, 9, 21, 1)
    const old = [960, 755, 330, 330, 330].map((score, i) => ({ name: 'Player7033', score, seconds: 60, at: at + i }))
    const parsed = parseSave(JSON.stringify({ ...defaultSave(), leaderboard: old }))
    expect(parsed.leaderboard.map(e => e.score)).toEqual([960])
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
