import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'dodge' | 'run'
type Section = 'hunter' | 'grapple' | 'monster' | 'camera' | 'hunt'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string;
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const CATEGORY: Record<Section, string> = { hunter: 'Hunter', grapple: 'Grapple', monster: 'Monster', camera: 'Camera', hunt: 'Hunt' }
const bindings: Binding[] = []

function number<S extends Section>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category: CATEGORY[section],
    label, description: boundary === 'dodge' ? 'Applies when the next dodge starts.' : boundary === 'run' ? 'Applies when a new hunt starts.' : 'Updates this preview immediately.',
    unit, default: defaults[key], min, max, step,
    applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE',
    integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY' }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}

number('hunter', 'walkSpeed', 'Walking speed', 2, 10, 0.1, 'm/s')
number('hunter', 'sprintSpeed', 'Sprint speed', 3, 14, 0.1, 'm/s')
number('hunter', 'staminaRegen', 'Stamina regeneration', 5, 80, 1, '/s')
number('hunter', 'attackPower', 'Weapon attack power', 30, 300, 5, '')
number('hunter', 'dodgeSpeed', 'Dodge roll speed', 5, 18, 0.5, 'm/s', 'dodge')
number('grapple', 'range', 'Grapple range', 12, 60, 1, 'm')
number('grapple', 'gripDrain', 'Grip stamina drain', 0, 12, 0.1, '/s')
number('monster', 'damageScale', 'Monster damage', 0.2, 3, 0.05, '×')
number('monster', 'aggression', 'Monster aggression', 0.4, 2, 0.05, '×')
number('monster', 'healthScale', 'Monster health', 0.2, 3, 0.05, '×', 'run')
number('hunt', 'timeLimit', 'Quest time limit', 180, 3000, 60, 's', 'run')
number('hunt', 'maxFaints', 'Faints allowed', 1, 9, 1, '', 'run')
number('camera', 'fov', 'Field of view', 40, 100, 1, '°')
number('camera', 'distance', 'Camera distance', 3, 12, 0.1, 'm')
number('camera', 'shoulder', 'Shoulder offset', -2, 2, 0.05, 'm')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (values: Record<string, number>) => values['hunter.walkSpeed'] <= values['hunter.sprintSpeed']
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
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Walking speed must not exceed sprint speed')
    // All writes are simple assignments, synchronously committed before the next
    // simulation/render callback. No engine callbacks run during this transaction.
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
