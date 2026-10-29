import { TimeScale } from './timescale'

/**
 * Fixed-step simulation loop with interpolated rendering.
 *
 * Gameplay and physics advance in constant `stepSeconds` increments so behaviour is identical on
 * 30 Hz phones and 144 Hz monitors. Rendering happens once per animation frame and receives the
 * interpolation factor `alpha` (0..1) between the previous and current simulation state.
 *
 * Slow motion: the loop owns a `TimeScale`. Wall time is multiplied by `time.scale` before it is
 * accumulated, so slow motion runs fewer (identical) fixed steps per second and interpolation keeps
 * the picture smooth. `render` receives both real and scaled frame seconds so visual-only effects
 * (particles, animation) can follow game time while UI and cameras follow real time.
 */
export type LoopCallbacks = {
  /** Advance simulation by exactly one fixed step. */
  step: (stepSeconds: number) => void
  /**
   * Draw the current frame; `alpha` blends the last two simulation states. `frameSeconds` is wall
   * time, `gameSeconds` is wall time multiplied by the current time scale (0 while paused).
   */
  render: (alpha: number, frameSeconds: number, gameSeconds: number) => void
}

export class GameLoop {
  readonly stepSeconds: number
  readonly time: TimeScale
  private accumulator = 0
  private last = 0
  private handle = 0
  private running = false
  /** Simulation is paused (menus); rendering continues so UI and backgrounds stay alive. */
  paused = false
  /** Guards against the "spiral of death" after a tab was hidden or the device stalled. */
  private readonly maxFrameSeconds = 0.25
  /** Most fixed steps per frame; beyond this the simulation slows down instead of stalling. */
  private readonly maxStepsPerFrame = 6
  /** Smoothed frames per second (debug overlay). */
  fps = 60

  constructor(private readonly callbacks: LoopCallbacks, stepHz = 60, time = new TimeScale()) {
    this.stepSeconds = 1 / stepHz
    this.time = time
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const frame = (now: number) => {
      if (!this.running) return
      const frameSeconds = Math.min((now - this.last) / 1000, this.maxFrameSeconds)
      this.last = now
      if (frameSeconds > 0) this.fps += (1 / frameSeconds - this.fps) * 0.05
      let gameSeconds = 0
      if (!this.paused) {
        const scale = this.time.update(frameSeconds)
        gameSeconds = frameSeconds * scale
        this.accumulator += gameSeconds
        let steps = 0
        while (this.accumulator >= this.stepSeconds && steps < this.maxStepsPerFrame) {
          this.callbacks.step(this.stepSeconds)
          this.accumulator -= this.stepSeconds
          steps += 1
        }
        if (steps === this.maxStepsPerFrame) this.accumulator = Math.min(this.accumulator, this.stepSeconds)
      }
      this.callbacks.render(this.paused ? 1 : this.accumulator / this.stepSeconds, frameSeconds, gameSeconds)
      this.handle = requestAnimationFrame(frame)
    }
    this.handle = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.handle)
  }

  /** Drop pending simulation time, e.g. when resuming from pause so the world does not jump. */
  resetAccumulator(): void {
    this.accumulator = 0
    this.last = performance.now()
  }
}
