import { CONFIG, DEFAULT_CONFIG } from './config'

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
  applyMode: 'LIVE'
  integrity: 'COSMETIC'
}
type Binding = { control: Control; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number(key: keyof typeof CONFIG.camera & string, label: string, min: number, max: number, step: number, unit: string): void {
  bindings.push({
    control: Object.freeze({
      id: `camera.${key}`,
      type: 'number',
      category: 'Camera',
      label,
      description: 'Updates the preview camera immediately; this is a visual-only setting.',
      unit,
      default: DEFAULT_CONFIG.camera[key],
      min,
      max,
      step,
      applyMode: 'LIVE',
      integrity: 'COSMETIC',
    }),
    read: () => CONFIG.camera[key],
    write: value => { CONFIG.camera[key] = value },
  })
}

number('fov', 'Camera field of view', 42, 68, 1, '°')
number('distance', 'Camera distance', 8, 14, 0.5, 'm')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
let unranked = false

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
    for (const [id, value] of entries) byId.get(id)!.write(value as number)
    // Camera controls are cosmetic and never make a score unranked.
  },
  activate(_boundary: 'jump' | 'dash' | 'run'): void {
    unranked = false
  },
}
