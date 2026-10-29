/**
 * Reusable slow-motion / time-warp controller.
 *
 * The fixed-step loop multiplies wall time by `scale` before accumulating simulation time, so a
 * slow-motion pulse means *fewer fixed steps per second* — physics stays deterministic (every step
 * is still exactly `stepSeconds`) and render interpolation keeps motion smooth.
 *
 * Several effects may request slow motion at once (an impact, an explosion, a finale). Each
 * request is a "pulse" with an ease-in, a hold and an ease-out, all measured in *real* seconds so
 * the effect feels the same no matter how slow the world runs. The strongest (lowest) active
 * request wins. A global `override` (e.g. a debug slider) and a `paused` flag are also supported.
 *
 * Nothing here knows about gameplay: callers decide when to pulse and how hard.
 */
export type PulseOptions = {
  /** Target time scale during the hold, 0 < scale <= 1 (0.2 = five times slower). */
  scale: number
  /** Real seconds to hold the target scale. */
  hold: number
  /** Real seconds to blend from normal speed into the target. Defaults to 0.04 (a near cut). */
  easeIn?: number
  /** Real seconds to blend back to normal speed. Defaults to 0.35. */
  easeOut?: number
  /** Optional id: a new pulse with the same id replaces the previous one instead of stacking. */
  id?: string
}

type Pulse = Required<Omit<PulseOptions, 'id'>> & { id?: string; age: number }

export class TimeScale {
  /** Current multiplier applied to simulation time (read every frame by the loop). */
  scale = 1
  /** When set, replaces the pulse result entirely (debug / photo mode). */
  override: number | null = null
  /** Upper bound on simultaneous pulses; the oldest is dropped beyond this. */
  private readonly maxPulses = 8
  private pulses: Pulse[] = []
  private listeners = new Set<(scale: number) => void>()
  /** Global multiplier on pulse strength: 0 disables slow motion (accessibility), 1 = full. */
  intensity = 1

  /** Request a slow-motion pulse. Returns a function that cancels it early (eases out). */
  pulse(options: PulseOptions): () => void {
    const p: Pulse = {
      scale: clamp(options.scale, 0.02, 1),
      hold: Math.max(0, options.hold),
      easeIn: Math.max(0, options.easeIn ?? 0.04),
      easeOut: Math.max(0.001, options.easeOut ?? 0.35),
      id: options.id,
      age: 0,
    }
    if (p.id) this.pulses = this.pulses.filter(q => q.id !== p.id)
    this.pulses.push(p)
    if (this.pulses.length > this.maxPulses) this.pulses.shift()
    return () => {
      // Jump to the start of the ease-out so cancelling never snaps.
      const inOut = p.easeIn + p.hold
      if (p.age < inOut) p.age = inOut
    }
  }

  /** Drop every pulse immediately (level restart, menus). */
  clear(): void {
    this.pulses = []
    this.set(1)
  }

  get active(): boolean {
    return this.scale < 0.999
  }

  /** Advance pulses by real (unscaled) seconds and recompute `scale`. Called by the loop. */
  update(realSeconds: number): number {
    let lowest = 1
    for (const p of this.pulses) {
      p.age += realSeconds
      lowest = Math.min(lowest, pulseValue(p))
    }
    this.pulses = this.pulses.filter(p => p.age < p.easeIn + p.hold + p.easeOut)
    const blended = 1 - (1 - lowest) * clamp(this.intensity, 0, 1)
    this.set(this.override ?? blended)
    return this.scale
  }

  /** Subscribe to scale changes (audio filters, UI tint). */
  onChange(fn: (scale: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(value: number): void {
    if (Math.abs(value - this.scale) < 1e-4) return
    this.scale = value
    for (const fn of this.listeners) fn(value)
  }
}

/** Scale requested by one pulse at its current age (pure; unit tested). */
export function pulseValue(p: { scale: number; hold: number; easeIn: number; easeOut: number; age: number }): number {
  const { scale, hold, easeIn, easeOut, age } = p
  if (age < easeIn) return lerp(1, scale, smooth(age / easeIn))
  if (age < easeIn + hold) return scale
  const t = (age - easeIn - hold) / easeOut
  if (t >= 1) return 1
  return lerp(scale, 1, smooth(t))
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)
