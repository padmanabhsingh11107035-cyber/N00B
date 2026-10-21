import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = {
  'camera.fov': DEFAULT_CONFIG.camera.fov,
  'camera.distance': DEFAULT_CONFIG.camera.distance,
}

afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('run')
})

describe('Helix preview camera tuning', () => {
  it('exposes only live cosmetic camera controls with real renderer consumers', () => {
    expect(tuning.controls.map(control => control.id)).toEqual(['camera.fov', 'camera.distance'])
    expect(tuning.controls.every(control => control.integrity === 'COSMETIC' && control.applyMode === 'LIVE')).toBe(true)
    tuning.apply({ 'camera.distance': 12 })
    expect(CONFIG.camera.distance).toBe(12)
    expect(tuning.read().requested['camera.distance']).toBe(12)
  })

  it('rejects unknown or out-of-range parameters without partially applying changes', () => {
    expect(() => tuning.apply({ 'camera.fov': 60, 'player.walkSpeed': 10 })).toThrow('Invalid value')
    expect(() => tuning.apply({ 'camera.distance': 100 })).toThrow('Invalid value')
    expect(CONFIG.camera.fov).toBe(DEFAULT_CONFIG.camera.fov)
    expect(CONFIG.camera.distance).toBe(DEFAULT_CONFIG.camera.distance)
  })

  it('does not disqualify runs when visual camera settings change', () => {
    tuning.apply({ 'camera.fov': 60 })
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })
})
