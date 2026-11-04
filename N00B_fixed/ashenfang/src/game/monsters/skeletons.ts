import type { MonsterId } from '../manifest'

/**
 * Skeleton specs for the sculpted (generated) monster meshes. All points are in the normalised
 * model frame produced by scripts/assets/build_meshes.py: metres, glTF +Z forward, +Y up, the
 * bounding box centred on X/Z and the lowest vertex at y = 0. Joints were placed against
 * orthographic side/top renders of each mesh with a 1 m grid.
 *
 * Group origins sit on the joints with identity rotation, so the procedural animator's pitch/yaw
 * offsets keep working unchanged. Legs are posed to the mesh's own bend before binding, and the
 * IK pole is derived from that rest bend so knees and elbows fold the way the sculpt does.
 */
export type V3 = readonly [number, number, number]
export type LegSpec = {
  hip: V3
  knee: V3
  foot: V3
  front: boolean
  /** Gait group for hexapods (tripod gait). Legs in the same group may step together. */
  gait?: 0 | 1
  /** Attach to the chest instead of the body (forelimbs follow the chest's pitch). */
  chest?: boolean
}
export type SkeletonSpec = {
  model: string
  /** Target length the build step scaled the mesh to (documentation / sanity check). */
  length: number
  /** Height of the body pivot (x = 0, z = 0). */
  bodyY: number
  pelvis: V3
  chest: V3
  neck: V3[]
  head: V3
  headTip: V3
  jaw?: { at: V3; tip: V3 }
  tail: V3[]
  tailTip: V3
  legs: LegSpec[]
  /** Vital points on the surface (the glowing weak spots). */
  vitals: { head: V3; back: V3; tail: V3 }
}

const mirror = (l: LegSpec, gait?: 0 | 1): LegSpec => ({
  ...l,
  hip: [-l.hip[0], l.hip[1], l.hip[2]],
  knee: [-l.knee[0], l.knee[1], l.knee[2]],
  foot: [-l.foot[0], l.foot[1], l.foot[2]],
  gait,
})

export const SKELETONS: Record<MonsterId, SkeletonSpec> = {
  // Hulking moss-and-bark ape-bear with an antlered bone skull; knuckle-walks on huge claws.
  mossback: {
    model: 'model.mossback',
    length: 14,
    bodyY: 7.4,
    pelvis: [0, 6.9, -3.6],
    chest: [0, 8.0, 2.4],
    neck: [
      [0, 8.1, 3.6],
      [0, 7.9, 4.7],
    ],
    head: [0, 7.6, 5.5],
    headTip: [0, 6.6, 7.2],
    jaw: { at: [0, 6.8, 6.0], tip: [0, 6.0, 7.0] },
    tail: [
      [0, 7.3, -5.0],
      [0, 7.1, -6.2],
    ],
    tailTip: [0, 6.9, -7.2],
    legs: [
      { hip: [-2.4, 6.6, 3.0], knee: [-2.6, 3.6, 3.6], foot: [-2.4, 0.35, 5.2], front: true, chest: true },
      { hip: [2.4, 6.6, 3.0], knee: [2.6, 3.6, 3.0], foot: [2.4, 0.35, 3.6], front: true, chest: true },
      { hip: [-2.6, 6.0, -4.2], knee: [-2.9, 3.4, -3.4], foot: [-2.9, 0.35, -4.4], front: false },
      { hip: [2.6, 6.0, -4.2], knee: [2.9, 3.4, -3.9], foot: [2.8, 0.35, -5.2], front: false },
    ],
    vitals: { head: [0, 8.6, 5.6], back: [0, 9.6, 0.2], tail: [0, 7.6, -6.6] },
  },
  // Obsidian wyvern: folded wing-arms it walks on, a long whip neck and a fanned tail blade.
  ashwing: {
    model: 'model.ashwing',
    length: 16,
    bodyY: 5.2,
    pelvis: [0, 4.9, -1.0],
    chest: [0, 5.6, 3.0],
    neck: [
      [0, 5.9, 4.2],
      [0, 6.8, 5.0],
      [0, 7.6, 5.6],
    ],
    head: [0, 7.9, 6.3],
    headTip: [0, 7.2, 8.1],
    jaw: { at: [0, 7.45, 6.7], tip: [0, 6.9, 7.9] },
    tail: [
      [0.1, 4.7, -1.8],
      [0.2, 3.8, -3.3],
      [0.4, 2.9, -4.9],
      [0.8, 2.6, -6.4],
      [1.3, 3.2, -7.6],
    ],
    tailTip: [1.7, 5.2, -7.8],
    legs: [
      { hip: [-1.7, 5.0, 3.4], knee: [-2.6, 3.4, 5.2], foot: [-2.6, 0.5, 6.6], front: true, chest: true },
      { hip: [1.7, 5.0, 3.4], knee: [2.2, 3.4, 4.6], foot: [2.1, 0.5, 5.6], front: true, chest: true },
      { hip: [-1.4, 4.4, -0.8], knee: [-2.0, 2.6, -0.2], foot: [-2.3, 0.3, -0.2], front: false },
      { hip: [1.4, 4.4, -0.8], knee: [1.9, 2.6, -1.2], foot: [1.8, 0.3, -2.0], front: false },
    ],
    vitals: { head: [0, 9.0, 6.2], back: [0, 6.6, 1.6], tail: [1.6, 6.2, -7.6] },
  },
  // Armoured reef crawler: six lance legs, a hooked horn-maw and a barnacled tail club.
  tidehorn: (() => {
    const fl: LegSpec = { hip: [-2.3, 4.4, 3.2], knee: [-3.9, 3.1, 4.1], foot: [-4.6, 0.1, 4.9], front: true, gait: 0 }
    const ml: LegSpec = { hip: [-2.8, 4.4, 0.3], knee: [-4.7, 3.1, 0.3], foot: [-5.5, 0.1, 0.2], front: false, gait: 1 }
    const rl: LegSpec = { hip: [-2.4, 4.4, -2.3], knee: [-3.9, 3.1, -3.2], foot: [-4.4, 0.1, -4.2], front: false, gait: 0 }
    return {
      model: 'model.tidehorn',
      length: 15,
      bodyY: 5.4,
      pelvis: [0, 5.2, -3.2],
      chest: [0, 5.5, 2.8],
      neck: [[0, 5.3, 4.2]],
      head: [0, 5.4, 5.4],
      headTip: [0, 5.6, 7.4],
      jaw: { at: [0, 4.8, 5.8], tip: [0, 4.4, 6.8] },
      tail: [
        [0, 5.3, -4.4],
        [0.2, 5.4, -5.4],
        [0.6, 6.1, -6.2],
      ],
      tailTip: [1.0, 7.3, -6.4],
      legs: [fl, mirror(fl, 1), ml, mirror(ml, 0), rl, mirror(rl, 1)],
      vitals: { head: [0, 6.6, 5.6], back: [0, 7.6, -0.4], tail: [1.0, 7.9, -6.5] },
    }
  })(),
}
