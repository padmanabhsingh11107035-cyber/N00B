import type { ArchetypeLook } from './vat'

export interface Look extends ArchetypeLook { scale: number }

/** Visual build for every character that uses the shared VAT mesh. */
export const ARCHETYPE_LOOKS: Record<string, Look> = {
  soldier: { inflate: [0.018, 0.03, 0.02, 0.012, 0.012], showRifle: true, scale: 0.98 },
  walker: { inflate: [0, 0.005, 0.01, 0, 0.004], showRifle: false, scale: 1.0 },
  walker2: { inflate: [0.01, 0.012, 0.015, 0.004, 0.008], showRifle: false, scale: 1.02 },
  runner: { inflate: [0, 0, 0, 0, 0], showRifle: false, scale: 0.96 },
  brute: { inflate: [0.02, 0.12, 0.08, 0.075, 0.06], showRifle: false, scale: 1.45 },
  retcher: { inflate: [0.03, 0, -0.005, -0.005, -0.005], showRifle: false, scale: 0.98 },
  blister: { inflate: [0.02, 0.1, 0.2, 0.04, 0.05], showRifle: false, scale: 1.1 },
  riot: { inflate: [0.035, 0.05, 0.04, 0.03, 0.03], showRifle: false, scale: 1.05 },
  wailer: { inflate: [0.01, -0.005, -0.01, -0.006, -0.006], showRifle: false, scale: 0.95 },
  abomination: { inflate: [0.03, 0.14, 0.1, 0.09, 0.07], showRifle: false, scale: 1.0, emissive: 0xff2aa0, emissiveIntensity: 0 },
}
