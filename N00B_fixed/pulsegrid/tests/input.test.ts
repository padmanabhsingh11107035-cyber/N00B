import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Input } from '../src/engine/input'

let listeners: Map<string, Set<(event: any) => void>>
let pads: Array<Gamepad | null>
let input: Input
function makePad(): Gamepad {
  return {
    index: 0, id: 'test-pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  } as unknown as Gamepad
}
function emit(type: string, event: any): void {
  for (const listener of listeners.get(type) ?? []) listener(event)
}
function key(code: string, options: { repeat?: boolean; timeStamp?: number } = {}): void {
  const event = { code, repeat: options.repeat ?? false, timeStamp: options.timeStamp ?? 100, target: { matches: () => false }, preventDefault: vi.fn() }
  emit('keydown', event)
}
beforeEach(() => {
  listeners = new Map()
  pads = [makePad()]
  vi.stubGlobal('window', {
    addEventListener(type: string, listener: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type: string, listener: (event: any) => void) { listeners.get(type)?.delete(listener) },
  })
  vi.stubGlobal('navigator', { getGamepads: () => pads })
  input = new Input()
})
afterEach(() => { input.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('rhythm controls', () => {
  it('queues Arrow keys and WASD as timestamped directional hits while playing', () => {
    input.rhythm = true
    key('ArrowLeft', { timeStamp: 123 })
    key('KeyW', { timeStamp: 124 })
    key('Space', { timeStamp: 125 })
    expect(input.drainHits()).toEqual([
      { action: 'left', t: 123 },
      { action: 'up', t: 124 },
      { action: 'beat', t: 125 },
    ])
  })

  it('ignores key repeat events and uses Space as a beat hit', () => {
    input.rhythm = true
    key('Space', { timeStamp: 222 })
    key('Space', { repeat: true, timeStamp: 223 })
    expect(input.drainHits()).toEqual([{ action: 'beat', t: 222 }])
  })

  it('accepts touch-pad hits with their original timestamps', () => {
    input.rhythm = true
    input.pushHit('right', 330)
    input.pushHit('beat', 340)
    expect(input.method).toBe('touch')
    expect(input.drainHits()).toEqual([{ action: 'right', t: 330 }, { action: 'beat', t: 340 }])
  })

  it('maps gamepad D-pad directions and A to arrow/beat hits on new presses', () => {
    input.rhythm = true
    const pad = pads[0]!
    const buttons = pad.buttons as GamepadButton[]
    buttons[12] = { pressed: true, touched: true, value: 1 }
    buttons[0] = { pressed: true, touched: true, value: 1 }
    input.update()
    expect(input.drainHits().map(hit => hit.action)).toEqual(['up', 'beat'])
    input.update()
    expect(input.drainHits()).toEqual([])
  })

  it('maps an analog-stick flick once, then allows the same direction after recentering', () => {
    input.rhythm = true
    const pad = pads[0]!
    ;(pad.axes as number[])[1] = -0.8
    input.update()
    expect(input.move.y).toBeCloseTo(0.8)
    expect(input.drainHits().map(hit => hit.action)).toEqual(['up'])
    input.update()
    expect(input.drainHits()).toEqual([])
    ;(pad.axes as number[])[1] = 0
    input.update()
    ;(pad.axes as number[])[1] = -0.8
    input.update()
    expect(input.drainHits().map(hit => hit.action)).toEqual(['up'])
  })

  it('queues Escape for the game pause action', () => {
    key('Escape')
    expect(input.consume('pause')).toBe(true)
    expect(input.consume('pause')).toBe(false)
  })
})
