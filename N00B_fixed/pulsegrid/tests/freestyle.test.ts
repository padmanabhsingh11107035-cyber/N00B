import { describe, expect, it } from 'vitest'
import { buildTimeline, freestyleArrows, FREESTYLE_ARROWS } from '../src/game/chart'
import { CONFIG } from '../src/game/config'
import { applyGrade, createPerf, freestyleBonus, type Grade } from '../src/game/rules'
import { SONGS } from '../src/game/songs'

describe('freestyle chart', () => {
  it('places the freestyle links right before the finish and never on it', () => {
    for (const song of SONGS) {
      const tl = buildTimeline(song, 7)
      const links = tl.rounds.filter((r) => r.freestyle)
      expect(links.length).toBe(song.freestyle ?? 0)
      if (!links.length) continue
      const finish = tl.rounds[tl.rounds.length - 1]
      expect(finish.finish).toBe(true)
      expect(finish.freestyle).toBe(false)
      // Contiguous, ending on the round just before the finish, links numbered 0..n-1.
      links.forEach((r, i) => {
        expect(r.link).toBe(i)
        expect(r.index).toBe(finish.index - links.length + i)
        expect(tl.bars[r.bar].freestyle).toBe(true)
        expect(r.arrows.length).toBe(freestyleArrows(i))
        expect(r.reversed.every((x) => !x)).toBe(true)
      })
      expect(links[0].hint).toBe('freestyle')
      // Freestyle links sit in the song's final drop.
      expect(links.every((r) => tl.bars[r.bar].kind === 'drop')).toBe(true)
    }
  })
  it('keeps non-freestyle rounds unflagged', () => {
    const tl = buildTimeline(SONGS[0], 3)
    expect(tl.rounds.every((r) => !r.freestyle && r.link === -1)).toBe(true)
  })
  it('grows link length up to the cap', () => {
    expect(freestyleArrows(0)).toBe(FREESTYLE_ARROWS.start)
    expect(freestyleArrows(99)).toBe(FREESTYLE_ARROWS.max)
  })
})

describe('freestyle scoring', () => {
  it('pays a bonus that grows with the chain and scales by grade', () => {
    expect(freestyleBonus(1, 'perfect')).toBe(CONFIG.score.freestyleLink)
    expect(freestyleBonus(3, 'perfect')).toBe(CONFIG.score.freestyleLink * 3)
    expect(freestyleBonus(2, 'great')).toBeLessThan(freestyleBonus(2, 'perfect'))
    expect(freestyleBonus(2, 'miss')).toBe(0)
    expect(freestyleBonus(0, 'perfect')).toBe(0)
  })
  it('chains good links, breaks on bad/miss, and tracks best and total bonus', () => {
    let s = createPerf()
    const seq: Grade[] = ['perfect', 'great', 'miss', 'perfect']
    const broken: boolean[] = []
    for (const g of seq) {
      const res = applyGrade(s, g, { arrows: 4, finish: false, freestyle: true })
      broken.push(res.chainBroken)
      s = res.state
    }
    expect(broken).toEqual([false, false, true, false])
    expect(s.fsChain).toBe(1)
    expect(s.fsBest).toBe(2)
    expect(s.fsBonus).toBe(freestyleBonus(1, 'perfect') + freestyleBonus(2, 'great') + freestyleBonus(1, 'perfect'))
  })
  it('does not touch the chain outside freestyle rounds', () => {
    const s = applyGrade(createPerf(), 'perfect', { arrows: 4, finish: false }).state
    expect(s.fsChain).toBe(0)
    expect(s.fsBonus).toBe(0)
  })
})
