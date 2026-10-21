import type { InputMethod } from '../engine/input'

/**
 * First-time movement training in the Hall of Origins: sprint, jump, dash.
 *
 * Pure state machine (no DOM, no three.js) so it can be unit tested. The game feeds it the hero's
 * per-step facts; the UI renders `view()`. Each step completes when the player actually performs the
 * move, never on a timer, so nobody is rushed and nobody can skip learning it by waiting.
 */
export type TutorialStepId = 'sprint' | 'jump' | 'dash'

export type TutorialStepDef = {
  id: TutorialStepId
  title: string
  /** Instruction with a `{key}` placeholder replaced by the key for the current input method. */
  action: string
  tip: string
  keys: Record<InputMethod, string>
  /** Amount of progress needed: seconds of sprinting, or number of performed moves. */
  goal: number
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    id: 'sprint', title: 'SPRINT', goal: 1.2,
    action: 'Hold {key} while moving',
    tip: 'Sprint to cross big rooms fast. Attacking or dashing ends it.',
    keys: { keyboard: 'SHIFT', gamepad: 'L3', touch: 'Tap RUN, or push the stick to its edge, and move' },
  },
  {
    id: 'jump', title: 'JUMP', goal: 2,
    action: 'Press {key} to jump',
    tip: 'Jump over shockwaves and ground slams.',
    keys: { keyboard: 'SPACE', gamepad: 'A', touch: 'the JUMP button' },
  },
  {
    id: 'dash', title: 'DASH', goal: 2,
    action: 'Press {key} to dash',
    tip: 'A dash makes you briefly untouchable. Dash through attacks.',
    keys: { keyboard: 'C', gamepad: 'B', touch: 'the DASH button' },
  },
]

/** Pause after a step completes so the "nice" feedback reads before the next card. */
export const STEP_CELEBRATE = 0.9

export type TutorialFacts = { sprinting: boolean; jumped: boolean; dashed: boolean }

export type TutorialView = {
  index: number
  total: number
  step: TutorialStepDef
  key: string
  action: string
  /** 0..1 progress of the current step. */
  progress: number
  /** True during the short celebration after the step is done. */
  celebrating: boolean
}

export class Tutorial {
  private index = 0
  private amount = 0
  private celebrate = 0
  private finishedFlag = false
  /** True when started by the player (Handbook / pause menu) rather than on first launch. */
  readonly manual: boolean

  constructor(manual = false) {
    this.manual = manual
  }

  get finished(): boolean {
    return this.finishedFlag
  }

  get stepIndex(): number {
    return this.index
  }

  /**
   * Advance with this step's facts. Returns 'step' when a step was just completed, 'done' when the
   * whole tutorial just finished, otherwise null.
   */
  update(dt: number, f: TutorialFacts): 'step' | 'done' | null {
    if (this.finishedFlag) return null
    if (this.celebrate > 0) {
      this.celebrate -= dt
      if (this.celebrate > 0) return null
      this.celebrate = 0
      this.index += 1
      this.amount = 0
      if (this.index >= TUTORIAL_STEPS.length) {
        this.finishedFlag = true
        return 'done'
      }
      return null
    }
    const s = TUTORIAL_STEPS[this.index]
    if (s.id === 'sprint' && f.sprinting) this.amount += dt
    else if (s.id === 'jump' && f.jumped) this.amount += 1
    else if (s.id === 'dash' && f.dashed) this.amount += 1
    if (this.amount >= s.goal) {
      this.amount = s.goal
      this.celebrate = STEP_CELEBRATE
      return 'step'
    }
    return null
  }

  view(method: InputMethod): TutorialView {
    const i = Math.min(this.index, TUTORIAL_STEPS.length - 1)
    const step = TUTORIAL_STEPS[i]
    const key = step.keys[method]
    // Touch hints are phrases ("the JUMP button"), not key caps.
    const action = method === 'touch' ? step.action.replace('Hold {key} while moving', '{key}').replace('Press {key}', 'Tap {key}') : step.action
    return {
      index: i,
      total: TUTORIAL_STEPS.length,
      step,
      key,
      action,
      progress: this.finishedFlag ? 1 : Math.min(1, this.amount / step.goal),
      celebrating: this.celebrate > 0 || this.finishedFlag,
    }
  }
}
