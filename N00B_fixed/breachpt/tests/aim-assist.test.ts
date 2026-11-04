import { describe, expect, it } from 'vitest'
import { selectAimAssistTarget, type AimAssistTarget } from '../src/game/aim-assist'

const target = (id: number, x: number, z: number, team: AimAssistTarget['team'] = 'enemy', alive = true): AimAssistTarget => ({
  id,
  team,
  alive,
  point: { x, y: 0, z },
})
const visible = () => true

describe('enemy-only aim assist target selection', () => {
  it('prefers the target nearest the crosshair over a closer off-axis enemy', () => {
    const selected = selectAimAssistTarget(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      [target(1, 1.2, -6), target(2, 0.2, -18)],
      visible,
    )
    expect(selected?.id).toBe(2)
  })

  it('never selects teammates, dead targets, occluded enemies, or targets outside the cone', () => {
    const selected = selectAimAssistTarget(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      [target(1, 0, -8, 'friendly'), target(2, 0, -9, 'enemy', false), target(3, 0.9, -5), target(4, 0, -10)],
      candidate => candidate.id !== 4,
    )
    expect(selected).toBeUndefined()
  })

  it('rejects targets beyond its finite range and invalid forward vectors', () => {
    expect(selectAimAssistTarget({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, [target(1, 0, -80)], visible)).toBeUndefined()
    expect(selectAimAssistTarget({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, [target(2, 0, -4)], visible)).toBeUndefined()
  })
})
