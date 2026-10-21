import { describe, expect, it } from 'vitest'
import { STEP_CELEBRATE, Tutorial, TUTORIAL_STEPS } from '../src/game/tutorial'

const none = { sprinting: false, jumped: false, dashed: false }
const run = (t: Tutorial, seconds: number, f = none, dt = 1 / 60) => {
  const out: string[] = []
  for (let s = 0; s < seconds; s += dt) {
    const r = t.update(dt, f)
    if (r) out.push(r)
  }
  return out
}

describe('movement tutorial', () => {
  it('teaches sprint, jump, dash in that order', () => {
    expect(TUTORIAL_STEPS.map(s => s.id)).toEqual(['sprint', 'jump', 'dash'])
  })

  it('never advances on its own', () => {
    const t = new Tutorial()
    expect(run(t, 30)).toEqual([])
    expect(t.stepIndex).toBe(0)
    expect(t.view('keyboard').progress).toBe(0)
  })

  it('needs sustained sprinting, then celebrates before moving on', () => {
    const t = new Tutorial()
    run(t, 0.6, { ...none, sprinting: true })
    expect(t.view('keyboard').progress).toBeCloseTo(0.5, 1)
    expect(run(t, 0.7, { ...none, sprinting: true })).toEqual(['step'])
    expect(t.view('keyboard').celebrating).toBe(true)
    expect(t.stepIndex).toBe(0)
    run(t, STEP_CELEBRATE + 0.05)
    expect(t.stepIndex).toBe(1)
    expect(t.view('keyboard').celebrating).toBe(false)
  })

  it('ignores moves that belong to other steps', () => {
    const t = new Tutorial()
    run(t, 1, { sprinting: false, jumped: true, dashed: true })
    expect(t.stepIndex).toBe(0)
    expect(t.view('keyboard').progress).toBe(0)
  })

  it('finishes after two jumps and two dashes and reports done once', () => {
    const t = new Tutorial()
    const events: string[] = []
    events.push(...run(t, 1.3, { ...none, sprinting: true }), ...run(t, 1))
    for (const k of ['jumped', 'jumped'] as const) events.push(t.update(1 / 60, { ...none, [k]: true }) ?? '')
    events.push(...run(t, 1))
    for (let i = 0; i < 2; i += 1) events.push(t.update(1 / 60, { ...none, dashed: true }) ?? '')
    events.push(...run(t, 2))
    expect(events.filter(Boolean)).toEqual(['step', 'step', 'step', 'done'])
    expect(t.finished).toBe(true)
    expect(t.update(1, { sprinting: true, jumped: true, dashed: true })).toBeNull()
    expect(t.view('keyboard').progress).toBe(1)
  })

  it('shows the right prompt for each input method', () => {
    const t = new Tutorial(true)
    expect(t.manual).toBe(true)
    expect(t.view('keyboard').key).toBe('SHIFT')
    expect(t.view('gamepad').key).toBe('L3')
    expect(t.view('touch').action).toBe('{key}')
    run(t, 1.3, { ...none, sprinting: true })
    run(t, 1)
    expect(t.view('keyboard').action.replace('{key}', t.view('keyboard').key)).toBe('Press SPACE to jump')
    expect(t.view('touch').action.replace('{key}', t.view('touch').key)).toBe('Tap the JUMP button to jump')
  })
})
