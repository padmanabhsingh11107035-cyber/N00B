import { describe, expect, it } from 'vitest'
import { managedMediaUrl } from '../src/engine/media-url'

describe('game media paths', () => {
  it('points at plain files next to the page', () => {
    expect(managedMediaUrl('fx/particles.webp')).toContain('assets/performance/fx/particles.webp')
    expect(managedMediaUrl('audio/sfx/ui_click.mp3')).toContain('assets/performance/audio/sfx/ui_click.mp3')
  })

  it('refuses a file that is not registered', () => {
    expect(() => managedMediaUrl('audio/sfx/nope.mp3')).toThrow()
  })
})
