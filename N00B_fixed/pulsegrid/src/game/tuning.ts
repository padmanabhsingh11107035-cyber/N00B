import { CONFIG, DEFAULT_CONFIG } from './config'

/**
 * Development-only parameter catalog for the tuning panel. Judge windows, energy and camera apply live;
 * fever length and rival skill apply when the next song starts. Any gameplay change marks the
 * current performance unranked so tuned runs never overwrite personal bests.
 */
type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'run'
type Control = {
  id: string; type: 'number'; category: string; label: string; description: string; unit: string
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY'
}
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }
const bindings: Binding[] = []
const CATEGORY: Record<string, string> = { judge: 'Timing', energy: 'Energy', fever: 'Fever', rivals: 'Rivals', camera: 'Camera', score: 'Scoring' }

function number<S extends keyof typeof CONFIG>(section: S, key: keyof (typeof CONFIG)[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as unknown as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as unknown as Record<string, number>
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`, type: 'number', category: CATEGORY[section] ?? section, label,
      description: boundary === 'run' ? 'Applies when the next song starts.' : 'Updates this preview immediately.',
      unit, default: defaults[key], min, max, step,
      applyMode: boundary === 'run' ? 'NEXT_RUN' : 'LIVE',
      integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY',
    }),
    boundary,
    read: () => values[key],
    write: value => { values[key] = value },
  })
}

number('judge', 'perfect', 'Perfect window', 15, 100, 5, 'ms')
number('judge', 'great', 'Great window', 30, 150, 5, 'ms')
number('judge', 'cool', 'Cool window', 50, 200, 5, 'ms')
number('judge', 'bad', 'Bad window', 80, 300, 5, 'ms')
number('energy', 'miss', 'Energy lost per miss', -40, 0, 1, '')
number('energy', 'perfect', 'Energy gained per Perfect', 0, 20, 1, '')
number('score', 'feverMultiplier', 'Fever score multiplier', 1, 4, 0.5, 'x')
number('fever', 'rounds', 'Fever length', 1, 10, 1, 'rounds', 'run')
number('rivals', 'skillBias', 'Rival skill bias', -0.5, 0.5, 0.05, '', 'run')
number('camera', 'fov', 'Field of view', 30, 70, 1, '°')
number('camera', 'distance', 'Camera distance', 5, 14, 0.1, 'm')
number('camera', 'sway', 'Camera drift', 0, 2, 0.1, '')
number('camera', 'beatPunch', 'Beat zoom punch', 0, 3, 0.1, '')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (v: Record<string, number>) => v['judge.perfect'] <= v['judge.great'] && v['judge.great'] <= v['judge.cool'] && v['judge.cool'] <= v['judge.bad']
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
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Timing windows must grow from Perfect to Bad')
    // Plain assignments committed synchronously before the next frame; no engine callbacks run here.
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    // Eligibility is only re-evaluated when a new song starts.
    unranked = gameplayModified()
  },
}
