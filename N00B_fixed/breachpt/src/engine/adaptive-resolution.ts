import type { Quality } from './save'

export type ResolutionRange = { min: number; max: number }
export const RESOLUTION_RANGES: Record<Quality, ResolutionRange> = {
  low: { min: 0.55, max: 0.78 },
  medium: { min: 0.62, max: 0.9 },
  high: { min: 0.68, max: 1 },
}

/** Adjust pixel ratio only after sustained pressure; ignore background stalls and isolated spikes. */
export class AdaptiveResolution {
  private slowFrames = 0
  private fastFrames = 0
  private current: number

  constructor(private quality: Quality) {
    this.current = RESOLUTION_RANGES[quality].max
  }

  get ratio(): number {
    return this.current
  }

  setQuality(quality: Quality): number {
    this.quality = quality
    this.slowFrames = 0
    this.fastFrames = 0
    this.current = RESOLUTION_RANGES[quality].max
    return this.current
  }

  /** Returns a new pixel-ratio ceiling only when it changes. */
  observe(frameSeconds: number): number | undefined {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0 || frameSeconds > 0.2) return undefined
    const range = RESOLUTION_RANGES[this.quality]
    if (frameSeconds >= 0.022) {
      this.slowFrames += 1
      this.fastFrames = 0
      if (this.slowFrames >= 45 && this.current > range.min) {
        this.current = Math.max(range.min, Math.round((this.current - 0.08) * 100) / 100)
        this.slowFrames = 0
        return this.current
      }
    } else if (frameSeconds <= 0.0165) {
      this.fastFrames += 1
      this.slowFrames = 0
      if (this.fastFrames >= 240 && this.current < range.max) {
        this.current = Math.min(range.max, Math.round((this.current + 0.04) * 100) / 100)
        this.fastFrames = 0
        return this.current
      }
    } else {
      this.slowFrames = 0
      this.fastFrames = 0
    }
    return undefined
  }
}
