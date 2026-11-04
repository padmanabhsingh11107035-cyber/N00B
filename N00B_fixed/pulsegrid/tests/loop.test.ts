import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoop } from '../src/engine/loop'

let frames: Map<number, FrameRequestCallback>
let time: number
let nextId: number
function frame(seconds = 1 / 60): void {
  time += seconds * 1000
  const [id, callback] = [...frames][0]!
  frames.delete(id)
  callback(time)
}
beforeEach(() => {
  frames = new Map(); time = 0; nextId = 0
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('GameLoop scheduling', () => {
  for (const phase of ['beforeFrame', 'step', 'render'] as const) {
    it(`continues after one ${phase} exception without accumulating failed time`, () => {
      const error = new Error('frame failure')
      const beforeFrame = vi.fn(); const step = vi.fn(); const render = vi.fn()
      const callbacks = { beforeFrame, step, render }
      const loop = new GameLoop(callbacks)
      callbacks[phase].mockImplementationOnce(() => { throw error })
      loop.start()
      expect(() => frame(0.25)).toThrow(error)
      expect(frames.size).toBe(1)
      step.mockClear(); render.mockClear()
      frame(0.02)
      expect(step).toHaveBeenCalledTimes(1)
      expect(render).toHaveBeenCalledTimes(1)
      loop.stop()
      expect(frames.size).toBe(0)
    })
  }

  it('caps long background frames and keeps rendering while paused', () => {
    const step = vi.fn(); const render = vi.fn()
    const loop = new GameLoop({ step, render })
    loop.start(); frame(3600)
    expect(step.mock.calls.length).toBeLessThanOrEqual(15)
    expect(render.mock.calls[0]![1]).toBe(0.25)
    loop.paused = true; step.mockClear(); frame()
    expect(step).not.toHaveBeenCalled()
    expect(render.mock.calls.at(-1)![0]).toBe(1)
    loop.stop()
    expect(frames.size).toBe(0)
  })
})
