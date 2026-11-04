import { CONFIG, DEFAULT_CONFIG } from '../driftking/game/config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'dash' | 'run'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string;
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  const category = section === 'car' ? 'Vehicle' : section === 'drift' ? 'Drift' : section === 'score' ? 'Scoring' : section === 'camera' ? 'Camera' : 'Run'
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category,
    label, description: boundary === 'run' ? 'Applies when a new run starts.' : 'Updates this preview immediately.',
    unit, default: defaults[key], min, max, step,
    applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE',
    integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY' }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}
number('car', 'maxSpeed', 'Top speed', 30, 60, 1, 'm/s')
number('car', 'engineForce', 'Engine force', 8, 28, 1, 'm/s²')
number('car', 'brakeForce', 'Brake force', 15, 45, 1, 'm/s²')
number('car', 'grip', 'Road grip', 3, 12, 0.5, '1/s')
number('car', 'driftGrip', 'Drift grip', 0.5, 3, 0.1, '1/s')
number('car', 'steerRate', 'Steering rate', 1, 4, 0.1, 'rad/s')
number('car', 'driftSteerRate', 'Drift steering rate', 1, 5, 0.1, 'rad/s')
number('drift', 'minAngle', 'Drift entry angle', 8, 25, 1, '°')
number('drift', 'minSpeed', 'Drift entry speed', 4, 14, 0.5, 'm/s')
number('score', 'rate', 'Base drift points', 30, 100, 2, 'pt/s')
number('score', 'clipBonus', 'Clip-zone bonus', 100, 500, 25, 'pts')
number('camera', 'distance', 'Camera distance', 5, 12, 0.1, 'm')
number('camera', 'height', 'Camera height', 1, 5, 0.1, 'm')
number('camera', 'fov', 'Field of view', 45, 80, 1, '°')
number('run', 'seconds', 'Time limit', 30, 90, 5, 's', 'run')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (_values: Record<string, number>) => true

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
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Invalid tuning combination')
    // All writes are simple assignments, synchronously committed before the next
    // physics/render callback. No engine callbacks run during this transaction.
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    // Reset only at a new run; resetting values mid-run cannot restore eligibility.
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
