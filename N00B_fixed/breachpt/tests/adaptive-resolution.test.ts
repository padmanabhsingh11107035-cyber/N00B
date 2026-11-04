import { describe, expect, it } from 'vitest'
import { AdaptiveResolution, RESOLUTION_RANGES } from '../src/engine/adaptive-resolution'

describe('adaptive resolution', () => {
  it('uses conservative bounded pixel-ratio ranges for each quality preset', () => {
    expect(RESOLUTION_RANGES).toEqual({
      low: { min: 0.55, max: 0.78 },
      medium: { min: 0.62, max: 0.9 },
      high: { min: 0.68, max: 1 },
    })
  })

  it('lowers only after sustained slow frames and clamps at the preset minimum', () => {
    const resolution = new AdaptiveResolution('low')
    for (let i = 0; i < 44; i += 1) expect(resolution.observe(0.024)).toBeUndefined()
    expect(resolution.observe(0.024)).toBeCloseTo(0.7)
    expect(resolution.ratio).toBeCloseTo(0.7)
    for (let i = 0; i < 180; i += 1) resolution.observe(0.024)
    expect(resolution.ratio).toBe(RESOLUTION_RANGES.low.min)
    expect(resolution.observe(0.024)).toBeUndefined()
  })

  it('recovers slowly after sustained good frames', () => {
    const resolution = new AdaptiveResolution('medium')
    for (let i = 0; i < 45; i += 1) resolution.observe(0.024)
    expect(resolution.ratio).toBeCloseTo(0.82)
    for (let i = 0; i < 239; i += 1) expect(resolution.observe(0.016)).toBeUndefined()
    expect(resolution.observe(0.016)).toBeCloseTo(0.86)
    expect(resolution.ratio).toBeCloseTo(0.86)
  })

  it('resets counters and starts at the new quality ceiling when quality changes', () => {
    const resolution = new AdaptiveResolution('low')
    for (let i = 0; i < 44; i += 1) resolution.observe(0.024)
    expect(resolution.setQuality('high')).toBe(RESOLUTION_RANGES.high.max)
    for (let i = 0; i < 44; i += 1) expect(resolution.observe(0.024)).toBeUndefined()
    expect(resolution.observe(0.024)).toBeCloseTo(RESOLUTION_RANGES.high.max - 0.08)
  })

  it('ignores invalid and background-stall samples without disturbing a sustained window', () => {
    const resolution = new AdaptiveResolution('high')
    for (let i = 0; i < 44; i += 1) resolution.observe(0.024)
    for (const frameSeconds of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, 0.201, 3]) {
      expect(resolution.observe(frameSeconds)).toBeUndefined()
    }
    expect(resolution.observe(0.024)).toBeCloseTo(RESOLUTION_RANGES.high.max - 0.08)
  })
})
