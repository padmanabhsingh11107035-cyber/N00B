import type { Vec3 } from './aim'

/** Where the catapult stands (on a small rise facing −Z) and where the stone leaves the bucket. */
export const CATAPULT_BASE: Vec3 = { x: 0, y: 1.4, z: 0 }
/** Release point (centre of the stone in the bucket at the release angle) relative to the catapult base, before yaw rotation. */
export const RELEASE_LOCAL: Vec3 = { x: 0, y: 3.77, z: 0.19 }
/** Throwing-arm geometry that produces RELEASE_LOCAL (see catapult.ts). */
export const ARM_PIVOT: Vec3 = { x: 0, y: 1.7, z: 0.3 }
export const ARM_LENGTH = 2.0
export const RELEASE_ANGLE = (72 * Math.PI) / 180
