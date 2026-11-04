import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without type declarations
import { maxPlausibleScore as serverMax, validateDriftRun } from '../server/leaderboard/drift-rules.mjs'
import en from '../src/driftking/i18n/en.json'
import zh from '../src/driftking/i18n/zh-CN.json'
import { detectLocale, resolveLocale } from '../src/driftking/engine/i18n'
import { CONFIG } from '../src/driftking/game/config'
import { dailyFor, dayKey } from '../src/driftking/game/daily'
import { createRun, type DriftEvent, type DriftSample, maxPlausibleScore, ratingFor, stepReady, stepRun } from '../src/driftking/game/rules'
import { buildTrack, findCorners } from '../src/driftking/game/track'
import { challengeUrl, decodeChallenge, encodeChallenge } from '../src/driftking/online/challenge'

const DT = 1 / 60
const idle: DriftSample = { drifting: false, angle: 0, speed: 20, inClip: false, clipEntered: false, nearMiss: false, crash: false, spin: false }
const slide = (o: Partial<DriftSample> = {}): DriftSample => ({ ...idle, drifting: true, angle: 35, speed: 24, ...o })

function playing() {
  const run = createRun()
  stepReady(run, DT, true, [])
  return run
}
function steps(run: ReturnType<typeof createRun>, n: number, s: DriftSample, events: DriftEvent[] = []) {
  for (let i = 0; i < n; i += 1) stepRun(run, DT, s, events)
  return events
}

describe('Drift King scoring and run rules', () => {
  it('banks a drift after its chain grace expires', () => {
    const run = playing()
    const events = steps(run, 90, slide())
    expect(events.some(e => e.type === 'segmentStart')).toBe(true)
    expect(run.score).toBe(0)
    steps(run, 120, idle, events)
    expect(events.some(e => e.type === 'bank')).toBe(true)
    expect(run.score).toBeGreaterThan(0)
    expect(run.stats.segments).toBe(1)
  })

  it('rewards greater angle and longer slides', () => {
    const bankFor = (angle: number, frames: number) => {
      const run = playing()
      steps(run, frames, slide({ angle }))
      steps(run, 120, idle)
      return run.score
    }
    expect(bankFor(45, 120)).toBeGreaterThan(bankFor(20, 120))
    expect(bankFor(35, 360)).toBeGreaterThan(bankFor(35, 120) * 3)
  })

  it('clears an active segment on a wall hit but keeps banked score', () => {
    const run = playing()
    steps(run, 90, slide())
    steps(run, 120, idle)
    const banked = run.score
    const events = steps(run, 90, slide())
    steps(run, 1, { ...idle, crash: true }, events)
    expect(events.some(e => e.type === 'lost')).toBe(true)
    expect(run.seg.active).toBe(false)
    steps(run, 120, idle)
    expect(run.score).toBe(banked)
  })

  it('awards clip bonuses, advances heat and banks a live segment at time-up', () => {
    const plain = playing()
    steps(plain, 90, slide())
    steps(plain, 120, idle)
    const clipped = playing()
    steps(clipped, 1, slide({ inClip: true, clipEntered: true }))
    steps(clipped, 89, slide({ inClip: true }))
    steps(clipped, 120, idle)
    expect(clipped.score).toBeGreaterThan(plain.score * 1.8)
    expect(clipped.stats.clips).toBe(1)

    const run = playing()
    const events: DriftEvent[] = []
    steps(run, 60 * 58, idle, events)
    expect(events.filter(e => e.type === 'heat').length).toBe(CONFIG.score.heatAt.length - 1)
    steps(run, 60 * 3, slide(), events)
    expect(run.phase).toBe('ended')
    expect(events.some(e => e.type === 'bank')).toBe(true)
    expect(events.at(-1)?.type).toBe('end')
  })

  it('keeps score ratings within the six source-defined tiers', () => {
    expect(ratingFor(0)).toBe(0)
    expect(ratingFor(CONFIG.score.ratings[0])).toBeGreaterThanOrEqual(1)
    expect(ratingFor(10_000_000)).toBe(CONFIG.score.ratings.length)
  })
})

describe('server score plausibility', () => {
  it('uses the client score ceiling formula', () => {
    for (const [ms, events] of [[0, 0], [12_000, 3], [45_000, 11], [60_000, 40]]) {
      expect(serverMax(ms, events)).toBe(maxPlausibleScore(ms, events))
    }
  })

  it('accepts a plausible completed run and rejects impossible run data', () => {
    const run = playing()
    let clips = 0
    while (run.phase === 'playing') {
      const enter = run.elapsed % 6 < DT
      if (enter) clips += 1
      stepRun(run, DT, slide({ angle: 90, speed: 60, inClip: true, clipEntered: enter }), [])
    }
    const stats = { driftMs: Math.round(run.stats.driftMs), clips, nearMisses: 0, segments: run.stats.segments, maxMult: run.stats.maxMult, crashes: 0 }
    expect(() => validateDriftRun({ score: Math.round(run.score), durationMs: 60_400, stats })).not.toThrow()
    expect(() => validateDriftRun({ score: 500_000, durationMs: 61_000, stats: { ...stats, driftMs: 1000 } })).toThrow('score_implausible')
    expect(() => validateDriftRun({ score: 100, durationMs: 20_000, stats })).toThrow('run_too_short')
    expect(() => validateDriftRun({ score: 100, durationMs: 61_000, stats: { ...stats, maxMult: 99 } })).toThrow('stats_outside_rules')
  })
})

describe("today's seeded challenge", () => {
  const track = buildTrack()
  const corners = findCorners(track)
  it('is identical for everyone on the same UTC day', () => {
    const a = dailyFor('2026-09-26', track, corners)
    const b = dailyFor('2026-09-26', track, corners)
    expect(a).toEqual(b)
    expect(a.clips.length).toBe(Math.min(CONFIG.clip.perDay, corners.length))
  })
  it('rotates through all five weather conditions over five seeded days', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 5; d += 1) seen.add(dailyFor(dayKey(new Date(Date.UTC(2026, 8, 20 + d))), track, corners).condition.id)
    expect(seen.size).toBe(5)
  })
})

describe('challenge links and bilingual catalog', () => {
  it('round-trips daily scores and CJK nicknames and rejects hostile tokens', () => {
    const challenge = { score: 30736, name: '阿飞 Drift', day: '2026-09-26' }
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge)
    const url = new URL(challengeUrl(challenge, 'https://example.test/play?x=1#top'))
    expect(decodeChallenge(url.searchParams.get('vs'))).toEqual(challenge)
    expect(decodeChallenge('%%%')).toBeNull()
    expect(decodeChallenge(null)).toBeNull()
    expect(decodeChallenge(encodeChallenge({ score: -5, name: 'x', day: challenge.day }))).toBeNull()
  })

  it('detects Chinese, honors saved choice and has key/placeholder parity', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('zh-CN')
    expect(detectLocale(['en-US', 'zh-CN'])).toBe('en')
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const vars = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((zh as Record<string, string>)[key]), key).toEqual(vars(value))
    for (const key of ['title.play', 'title.daily', 'end.unranked', 'board.day']) expect(en).toHaveProperty(key)
  })
})
