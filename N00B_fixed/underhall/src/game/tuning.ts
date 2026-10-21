import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'dash' | 'run'
type Integrity = 'COSMETIC' | 'GAMEPLAY'
type Control = {
  id: string
  type: 'number'
  category: string
  label: string
  description: string
  unit: string
  default: number
  min: number
  max: number
  step: number
  applyMode: Mode
  integrity: Integrity
}
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }
type TuningKey = keyof typeof CONFIG.superDungeon & string

const bindings: Binding[] = []
function number(
  key: TuningKey,
  category: string,
  label: string,
  description: string,
  min: number,
  max: number,
  step: number,
  unit: string,
  integrity: Integrity,
  boundary?: Boundary,
): void {
  const values = CONFIG.superDungeon as Record<TuningKey, number>
  const defaults = DEFAULT_CONFIG.superDungeon as Record<TuningKey, number>
  bindings.push({
    control: Object.freeze({
      id: `superDungeon.${key}`,
      type: 'number',
      category,
      label,
      description,
      unit,
      default: defaults[key],
      min,
      max,
      step,
      applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE',
      integrity,
    }),
    boundary,
    read: () => values[key],
    write: value => { values[key] = value },
  })
}

number('moveSpeedMultiplier', 'Movement', 'Move speed', 'Scales the hero’s current run speed, including drafted upgrades.', 0.5, 1.8, 0.05, '×', 'GAMEPLAY')
number('sprintMultiplier', 'Movement', 'Sprint multiplier', 'Scales speed while sprinting through the hub and dungeon.', 1, 2.2, 0.05, '×', 'GAMEPLAY')
number('jumpImpulse', 'Movement', 'Jump impulse', 'Applies when the next jump starts.', 6, 14, 0.25, 'm/s', 'GAMEPLAY', 'jump')
number('dashSpeed', 'Movement', 'Dash speed', 'Applies when the next dash starts.', 12, 32, 1, 'm/s', 'GAMEPLAY', 'dash')
number('dashDuration', 'Movement', 'Dash duration', 'Applies when the next dash starts.', 0.08, 0.4, 0.01, 's', 'GAMEPLAY', 'dash')
number('cameraDistance', 'Camera', 'Camera distance', 'Updates the over-the-shoulder camera immediately.', 2.5, 10, 0.1, 'm', 'COSMETIC')
number('cameraFollow', 'Camera', 'Camera follow speed', 'Updates camera follow smoothing immediately.', 4, 28, 1, '', 'COSMETIC')
number('cameraFov', 'Camera', 'Field of view', 'Updates camera field of view immediately.', 45, 85, 1, '°', 'COSMETIC')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default])) as Record<string, number>
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    requested = { ...requested, ...patch } as Record<string, number>
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value as number)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    // A new run starts a fresh eligibility snapshot; jumps/dashes cannot restore eligibility mid-run.
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
