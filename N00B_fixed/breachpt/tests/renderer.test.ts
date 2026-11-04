import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../src/engine/renderer'

describe('renderer quality presets', () => {
  it('keeps default low and medium quality within reduced-cost bounds', () => {
    expect(QUALITY_PRESETS).toEqual({
      low: { pixelRatio: 0.78, shadows: false, shadowMap: 512, bloom: false, samples: 0, particles: 0.35 },
      medium: { pixelRatio: 0.9, shadows: true, shadowMap: 1024, bloom: false, samples: 0, particles: 0.6 },
      high: { pixelRatio: 1, shadows: true, shadowMap: 2048, bloom: true, samples: 0, particles: 0.85 },
    })
  })
})
