import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../src/engine/renderer'

describe('renderer quality presets', () => {
  it('keeps default low and medium quality within reduced-cost bounds', () => {
    expect(QUALITY_PRESETS).toEqual({
      low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, samples: 0, particles: 0.3, post: false },
      medium: { pixelRatio: 1, shadows: true, shadowMap: 1024, bloom: false, samples: 0, particles: 0.6, post: true },
      high: { pixelRatio: 1.25, shadows: true, shadowMap: 2048, bloom: true, samples: 0, particles: 0.85, post: true },
    })
  })
})
