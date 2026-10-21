import { describe, expect, it } from 'vitest'
import { AssetStreamer } from '../src/engine/streamer'

const STAGES = ['title', 'wave1', 'hub', 'floor1', 'boss1', 'floor2'] as const
const flush = () => new Promise(r => setTimeout(r, 0))

function setup(heat = { v: 0 }) {
  const clock = { t: 0 }
  const log: string[] = []
  const s = new AssetStreamer({ stages: STAGES, heat: () => heat.v, now: () => clock.t, calmFor: 1, gap: 0 })
  for (const stage of STAGES) for (const n of [1, 2]) s.add(stage, `${stage}-${n}`, () => { log.push(`${stage}-${n}`) })
  const frame = async (dt = 0.1) => { clock.t += dt; s.update(); await flush() }
  return { s, log, clock, heat, frame }
}

describe('AssetStreamer', () => {
  it('require() loads a stage without waiting for frames and resolves when it is done', async () => {
    const { s, log } = setup()
    await s.require('title')
    expect(log.sort()).toEqual(['title-1', 'title-2'])
    expect(s.isReady('title')).toBe(true)
    expect(s.isReady('wave1')).toBe(false)
  })

  it('background loads the focus stage and the next one before later stages', async () => {
    const { s, log, frame } = setup()
    s.focus('hub')
    for (let i = 0; i < 6; i += 1) await frame()
    expect(log.slice(0, 4)).toEqual(['hub-1', 'hub-2', 'floor1-1', 'floor1-2'])
    for (let i = 0; i < 30; i += 1) await frame()
    // Later stages, then the earlier leftovers.
    expect(log.slice(4, 8)).toEqual(['boss1-1', 'boss1-2', 'floor2-1', 'floor2-2'])
    expect(log.slice(8)).toEqual(['title-1', 'title-2', 'wave1-1', 'wave1-2'])
    expect(s.stats.done).toBe(s.stats.total)
  })

  it('pauses background loading while hot and resumes only after a calm period', async () => {
    const { s, log, frame, heat } = setup()
    s.focus('floor1')
    await frame()
    await frame()
    const before = log.length
    heat.v = 0.9
    for (let i = 0; i < 20; i += 1) await frame()
    expect(log.length).toBe(before)
    expect(s.paused).toBe(true)
    // Cooling below resumeAt starts the calm timer; 0.4 (between thresholds) doesn't count.
    heat.v = 0.4
    for (let i = 0; i < 20; i += 1) await frame()
    expect(log.length).toBe(before)
    heat.v = 0.1
    for (let i = 0; i < 8; i += 1) await frame()
    expect(log.length).toBe(before)
    for (let i = 0; i < 6; i += 1) await frame()
    expect(log.length).toBeGreaterThan(before)
    expect(s.stats.hotStarts).toBe(0)
  })

  it('required stages still load while hot (a transition is waiting on them)', async () => {
    const { s, frame, heat } = setup()
    heat.v = 1
    await frame()
    await s.require('boss1')
    expect(s.isReady('boss1')).toBe(true)
    expect(s.isReady('floor1')).toBe(false)
  })

  it('runs background tasks one at a time', async () => {
    const clock = { t: 0 }
    const s = new AssetStreamer({ stages: ['a'], heat: () => 0, now: () => clock.t, gap: 0 })
    let active = 0
    let peak = 0
    const release: Array<() => void> = []
    for (let i = 0; i < 3; i += 1) s.add('a', `t${i}`, () => new Promise<void>(r => { active += 1; peak = Math.max(peak, active); release.push(() => { active -= 1; r() }) }))
    for (let i = 0; i < 5; i += 1) { clock.t += 0.1; s.update(); await flush() }
    expect(peak).toBe(1)
    while (release.length) { release.shift()!(); await flush(); clock.t += 0.1; s.update(); await flush() }
    expect(s.isReady('a')).toBe(true)
  })

  it('treats failing tasks as done so a bad download never blocks play', async () => {
    const s = new AssetStreamer({ stages: ['a'], heat: () => 0, now: () => 0 })
    s.add('a', 'boom', () => { throw new Error('boom') })
    s.add('a', 'reject', () => Promise.reject(new Error('404')))
    await s.require('a')
    expect(s.stats.failed).toBe(2)
    expect(s.isReady('a')).toBe(true)
  })

  it('rejects unknown stages and reports progress', async () => {
    const { s } = setup()
    expect(() => s.add('nope', 'x', () => undefined)).toThrow()
    expect(s.progress(['title'])).toBe(0)
    expect(s.progress(['title', 'wave1'])).toBe(0)
    await s.require('title')
    expect(s.progress(['title', 'wave1'])).toBe(0.5)
  })
})

describe('AssetStreamer essential tasks', () => {
  it('require() waits only for essential tasks; the rest load in the background', async () => {
    const clock = { t: 0 }
    const s = new AssetStreamer({ stages: ['a', 'b'], heat: () => 0, now: () => clock.t, gap: 0 })
    let musicStarted = false
    s.add('a', 'clip', () => undefined)
    s.add('a', 'music', () => { musicStarted = true; return new Promise(() => undefined) }, { essential: false })
    await s.require('a')
    expect(s.isReady('a', true)).toBe(true)
    expect(s.isReady('a')).toBe(false)
    expect(musicStarted).toBe(false)
    clock.t += 0.1
    s.update()
    expect(musicStarted).toBe(true)
  })
})
