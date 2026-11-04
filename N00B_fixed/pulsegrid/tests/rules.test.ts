import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/game/config'
import { accuracy, applyGrade, clearPerf, comboMultiplier, createPerf, judge, ordinal, placement, rankFor, rivalGrade, roundPoints, type Grade } from '../src/game/rules'

const round = { arrows: 4, finish: false }

describe('judge', () => {
  it('grades by distance from the beat, symmetric for early and late', () => {
    expect(judge(0)).toBe('perfect')
    expect(judge(0.04)).toBe('perfect')
    expect(judge(-0.07)).toBe('great')
    expect(judge(0.12)).toBe('cool')
    expect(judge(-0.18)).toBe('bad')
    expect(judge(0.25)).toBe('miss')
  })
})

describe('applyGrade', () => {
  it('builds combo and chain on good grades and resets on bad/miss', () => {
    let s = createPerf()
    for (const g of ['perfect', 'perfect', 'great'] as Grade[]) s = applyGrade(s, g, round).state
    expect(s.combo).toBe(3)
    expect(s.chain).toBe(0)
    expect(s.maxCombo).toBe(3)
    s = applyGrade(s, 'bad', round).state
    expect(s.combo).toBe(0)
    expect(s.maxCombo).toBe(3)
    expect(s.counts).toMatchObject({ perfect: 2, great: 1, bad: 1 })
  })

  it('scales points with arrows, combo, fever and finish', () => {
    const base = roundPoints('perfect', { arrows: 0, finish: false }, 0, false)
    expect(base).toBe(CONFIG.score.perfect)
    expect(roundPoints('perfect', { arrows: 4, finish: false }, 0, false)).toBeGreaterThan(base)
    expect(roundPoints('perfect', round, 10, false)).toBeGreaterThan(roundPoints('perfect', round, 0, false))
    expect(roundPoints('perfect', round, 0, true)).toBe(roundPoints('perfect', round, 0, false) * CONFIG.score.feverMultiplier)
    expect(roundPoints('miss', round, 20, true)).toBe(0)
    expect(comboMultiplier(1000)).toBeCloseTo(1 + CONFIG.score.comboCap * CONFIG.score.comboStep)
  })

  it('starts fever when the gauge fills and counts rounds down', () => {
    let s = createPerf()
    let started = 0
    for (let i = 0; i < 5; i += 1) {
      const r = applyGrade(s, 'perfect', round)
      s = r.state
      if (r.feverStarted) started += 1
    }
    expect(started).toBe(1)
    expect(s.feverRounds).toBe(CONFIG.fever.rounds)
    s = applyGrade(s, 'miss', round).state
    expect(s.feverRounds).toBe(CONFIG.fever.rounds - 1)
  })

  it('fails when energy runs out, except in no-fail mode', () => {
    let s = createPerf()
    let failed = false
    for (let i = 0; i < 20 && !failed; i += 1) {
      const r = applyGrade(s, 'miss', round)
      s = r.state
      failed = r.failed
    }
    expect(failed).toBe(true)
    expect(s.phase).toBe('failed')
    expect(rankFor(s)).toBe('F')
    // Frozen after failing.
    expect(applyGrade(s, 'perfect', round).state).toBe(s)

    let safe = createPerf(true)
    for (let i = 0; i < 30; i += 1) safe = applyGrade(safe, 'miss', round).state
    expect(safe.phase).toBe('playing')
    expect(safe.energy).toBeGreaterThan(0)
  })

  it('marks finish moves only when landed with a good grade', () => {
    expect(applyGrade(createPerf(), 'great', { arrows: 9, finish: true }).state.finishHit).toBe(true)
    expect(applyGrade(createPerf(), 'bad', { arrows: 9, finish: true }).state.finishHit).toBe(false)
  })
})

describe('ranks and standings', () => {
  it('ranks by accuracy and requires no misses for S', () => {
    let s = createPerf()
    for (let i = 0; i < 10; i += 1) s = applyGrade(s, 'perfect', round).state
    expect(rankFor(clearPerf(s))).toBe('S')
    s = applyGrade(s, 'miss', round).state
    expect(accuracy(s)).toBeCloseTo(10 / 11)
    expect(rankFor(clearPerf(s))).toBe('A')
  })

  it('places the player with ties in their favour', () => {
    expect(placement([500, 900, 500, 100], 500)).toBe(2)
    expect(placement([100, 200], 300)).toBe(1)
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(4)).toBe('4th')
  })

  it('skilled rivals land more perfects than weak ones', () => {
    const count = (skill: number) => Array.from({ length: 1000 }, (_, i) => rivalGrade(skill, (i + 0.5) / 1000)).filter(g => g === 'perfect').length
    expect(count(0.9)).toBeGreaterThan(count(0.3))
    expect(rivalGrade(1, 0.999)).toBe('miss')
  })
})
