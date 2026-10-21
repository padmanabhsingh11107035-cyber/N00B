import * as THREE from 'three'
import type { ClassmateId } from './content'

/**
 * Six hand-keyed victory dances, one per classmate, built at load time as real AnimationClips on
 * the shared UAL/UBC skeleton (the animation library only ships a single Dance_Loop).
 *
 * Poses are authored in *model space* (the glTF body faces +Z, +Y is up, the character's left
 * is +X) as Euler offsets in degrees from the idle pose, so they read like choreography notes:
 * "left upper arm 150° about Z" raises the left arm overhead through the side. Each offset is
 * converted into the bone's local frame against the idle pose, and carried by its parent (an
 * elbow bend is described as if the arm were hanging, then follows the upper arm).
 *
 * Conventions (left side; `mirror()` derives the right): arm/leg forward raise = -X,
 * sideways raise = +Z; forearm bend forward = -X; knee bend (shin back) = +X; spine lean
 * forward = +X, lean toward the left = -Z, twist = Y.
 */

export type DanceClip = 'Dance_Robot' | 'Dance_Flex' | 'Dance_Tornado' | 'Dance_Cheer' | 'Dance_TickTock' | 'Dance_Stomp'

export const DANCE_FOR: Record<ClassmateId, DanceClip> = {
  pixel: 'Dance_Robot', // Technopath: staccato robot
  rocky: 'Dance_Flex', // Stone Skin: bodybuilder flex routine
  zephyr: 'Dance_Tornado', // Windrunner: spin into a disco point
  mira: 'Dance_Cheer', // Sunmender: hopping sunshine cheer
  tock: 'Dance_TickTock', // Time-Slip: clockwork metronome
  blaze: 'Dance_Stomp', // Pyrokinetic: stomp and fist pumps
}

export const DANCE_NAMES: Record<DanceClip, string> = {
  Dance_Robot: 'The Robot', Dance_Flex: 'Muscle Flex', Dance_Tornado: 'Tornado Spin',
  Dance_Cheer: 'Sunshine Cheer', Dance_TickTock: 'Tick-Tock', Dance_Stomp: 'Fire Stomp',
}

type V3 = [number, number, number]
type Ease = 'smooth' | 'snap' | 'linear'
type Pose = { bones: Record<string, V3>; hip?: V3 }
type Key = Pose & { t: number; ease?: Ease }
type DanceDef = { duration: number; keys: Key[] }

// ─── Pose helpers ─────────────────────────────────────────────────────────

const THIGH = 0.43
const SHIN = 0.46
const pose = (bones: Record<string, V3> = {}, hip?: V3): Pose => ({ bones, hip })
/** Merge poses; later bone entries add to earlier ones, hips add. */
function mix(...ps: Pose[]): Pose {
  const bones: Record<string, V3> = {}
  let hip: V3 | undefined
  for (const p of ps) {
    for (const [b, v] of Object.entries(p.bones)) {
      const o = bones[b] ?? [0, 0, 0]
      bones[b] = [o[0] + v[0], o[1] + v[1], o[2] + v[2]]
    }
    if (p.hip) hip = hip ? [hip[0] + p.hip[0], hip[1] + p.hip[1], hip[2] + p.hip[2]] : [...p.hip]
  }
  return { bones, hip }
}
/** Mirror a pose across the character's midline (left <-> right). */
function mirror(p: Pose): Pose {
  const bones: Record<string, V3> = {}
  for (const [b, v] of Object.entries(p.bones)) {
    const n = b.endsWith('_l') ? b.slice(0, -2) + '_r' : b.endsWith('_r') ? b.slice(0, -2) + '_l' : b
    bones[n] = [v[0], -v[1], -v[2]]
  }
  return { bones, hip: p.hip ? [-p.hip[0], p.hip[1], p.hip[2]] : undefined }
}
/** Both sides from a left-side description. */
const both = (left: Pose): Pose => mix(left, mirror(left))
/** Knees-forward squat of `deg` at the hip with flat feet; the pelvis drops so feet stay planted. */
function squat(deg: number): Pose {
  const drop = (THIGH + SHIN) * (1 - Math.cos((deg * Math.PI) / 180))
  return both(pose({ thigh_l: [-deg, 0, 0], calf_l: [deg * 2, 0, 0], foot_l: [-deg, 0, 0] }, [0, -drop, 0]))
}
/** Lift one knee (left) while the other leg supports. */
const kneeUp = (deg: number): Pose => pose({ thigh_l: [-deg, 0, 0], calf_l: [deg * 1.3, 0, 0], foot_l: [-deg * 0.3, 0, 0] })
const arm = (upper: V3, lower: V3 = [0, 0, 0], hand: V3 = [0, 0, 0]): Pose => pose({ upperarm_l: upper, lowerarm_l: lower, hand_l: hand })
const armR = (upper: V3, lower: V3 = [0, 0, 0], hand: V3 = [0, 0, 0]): Pose => mirror(arm(upper, lower, hand))
const torso = (spine: V3, head: V3 = [0, 0, 0]): Pose => pose({ spine_01: [spine[0] * 0.4, spine[1] * 0.3, spine[2] * 0.4], spine_02: [spine[0] * 0.3, spine[1] * 0.35, spine[2] * 0.3], spine_03: [spine[0] * 0.3, spine[1] * 0.35, spine[2] * 0.3], Head: head })
const hip = (x: number, y = 0, z = 0): Pose => pose({}, [x, y, z])
const yaw = (deg: number): Pose => pose({ root: [0, deg, 0] })
const key = (t: number, p: Pose, ease?: Ease): Key => ({ t, ease, ...p })

// Recurring arm shapes (left side).
const FOREARM_FWD = arm([-10, 0, 18], [-90, 0, 0]) // robot "ready": forearm level, pointing forward
const FOREARM_UP = arm([0, 0, 85], [0, 0, 95]) // goal-post: upper arm out, forearm up
const FLEX = arm([-8, 0, 88], [0, 0, 118]) // double-biceps flex
const V_UP = arm([-8, 0, 150]) // cheer: arm up and out
const OUT = arm([-8, 0, 85]) // arm straight out to the side
const HAND_ON_HIP = arm([12, 0, 42], [0, 0, -105])
const FIST_UP = arm([-12, 0, 150], [-35, 0, 0])
const FIST_PULL = arm([-20, 0, 50], [-105, 0, 0])

// ─── The six routines ─────────────────────────────────────────────────────

const ROBOT: DanceDef = {
  duration: 3.2,
  keys: [
    key(0.0, mix(both(FOREARM_FWD), torso([0, 0, 0]), squat(6)), 'snap'),
    key(0.4, mix(FOREARM_FWD, mirror(FOREARM_UP), torso([0, -18, 0], [0, -30, 0]), squat(6)), 'snap'),
    key(0.8, mix(both(FOREARM_FWD), torso([0, 0, 0], [8, 0, 0]), squat(14)), 'snap'),
    key(1.2, mix(FOREARM_UP, mirror(FOREARM_FWD), torso([0, 18, 0], [0, 30, 0]), squat(6)), 'snap'),
    key(1.6, mix(both(FOREARM_FWD), torso([0, 0, 0], [8, 0, 0]), squat(14)), 'snap'),
    key(2.0, mix(both(FOREARM_UP), torso([-4, 0, 0], [-10, 0, 0]), squat(4)), 'snap'),
    key(2.4, mix(both(arm([-30, 0, 12], [-60, 0, 0])), torso([0, 24, 0], [0, -34, 0]), squat(10)), 'snap'),
    key(2.8, mix(both(arm([-30, 0, 12], [-60, 0, 0])), torso([0, -24, 0], [0, 34, 0]), squat(10)), 'snap'),
  ],
}

const FLEXING: DanceDef = {
  duration: 4.0,
  keys: [
    key(0.0, mix(both(FLEX), torso([-8, 0, 0], [-8, 0, 0]), squat(8))),
    key(0.8, mix(both(arm([-8, 0, 92], [0, 0, 128])), torso([4, 0, 0], [0, 0, 0]), squat(14))),
    // "Most muscular": crunch forward, fists meet in front of the belly.
    key(1.6, mix(both(arm([-38, 0, 26], [-70, 0, -38])), torso([22, 0, 0], [12, 0, 0]), squat(20))),
    key(2.4, mix(both(FLEX), torso([-10, 0, 0], [-16, 0, 0]), squat(6))),
    // Kiss the right biceps.
    key(3.2, mix(mirror(FLEX), arm([4, 0, 12], [-20, 0, 0]), torso([6, -20, -6], [18, -42, 0]), squat(10))),
  ],
}

const TORNADO: DanceDef = {
  duration: 3.6,
  keys: [
    key(0.0, mix(both(arm([-10, 0, 70])), squat(10), yaw(0)), 'linear'),
    key(0.3, mix(both(arm([-30, 0, 40], [-30, 0, 0])), torso([0, 20, 0]), squat(4), yaw(120)), 'linear'),
    key(0.6, mix(both(arm([-20, 0, 55])), torso([0, 10, 0]), squat(4), yaw(240)), 'smooth'),
    key(0.9, mix(both(arm([-8, 0, 88])), squat(10), yaw(360))),
    // Disco point: right arm up to the sky, left hand on the hip, hips swung left.
    key(1.35, mix(armR([-12, 0, 150]), HAND_ON_HIP, torso([0, -8, -8], [-16, -22, 0]), hip(0.06), squat(6), yaw(360))),
    key(1.8, mix(pose({ upperarm_r: [-32, 0, 38], lowerarm_r: [0, 0, 0] }), HAND_ON_HIP, torso([6, 12, 8], [16, 10, 0]), hip(-0.06), squat(12), yaw(360))),
    key(2.25, mix(armR([-12, 0, 150]), HAND_ON_HIP, torso([0, -8, -8], [-16, -22, 0]), hip(0.06), squat(6), yaw(360))),
    key(2.7, mix(pose({ upperarm_r: [-32, 0, 38], lowerarm_r: [0, 0, 0] }), HAND_ON_HIP, torso([6, 12, 8], [16, 10, 0]), hip(-0.06), squat(12), yaw(360))),
    key(3.15, mix(both(arm([-10, 0, 70])), squat(14), yaw(360))),
  ],
}

const CHEER: DanceDef = {
  duration: 3.2,
  keys: [
    key(0.0, mix(both(arm([-24, 0, -8], [-20, 0, 0])), torso([12, 0, 0], [10, 0, 0]), squat(24)), 'linear'),
    // Hop: pelvis up so the feet leave the floor, arms thrown up in a V.
    key(0.35, mix(both(V_UP), both(pose({ calf_l: [28, 0, 0], foot_l: [18, 0, 0] })), torso([-8, 0, 0], [-18, 0, 0]), hip(0, 0.13))),
    key(0.7, mix(both(V_UP), torso([0, 0, 0], [-10, 0, 0]), squat(14))),
    // Sun circles: arms sweep out and over while the hips sway.
    key(1.1, mix(both(OUT), torso([0, 0, -8], [0, 0, -10]), hip(0.05), squat(8))),
    key(1.5, mix(both(arm([-4, 0, 162])), torso([0, 0, 8], [-8, 0, 10]), hip(-0.05), squat(4))),
    key(1.9, mix(both(OUT), torso([0, 0, -8], [0, 0, -10]), hip(0.05), squat(8))),
    key(2.3, mix(both(arm([-24, 0, -8], [-20, 0, 0])), torso([12, 0, 0], [10, 0, 0]), squat(24)), 'linear'),
    key(2.65, mix(both(V_UP), both(pose({ calf_l: [28, 0, 0], foot_l: [18, 0, 0] })), torso([-8, 0, 0], [-18, 0, 0]), hip(0, 0.13))),
  ],
}

const TICK = (s: 1 | -1, arms: number, crouch: number): Pose => {
  const p = mix(armR([-6, 0, arms]), arm([0, 0, 18], [-15, 0, 0]), torso([0, 0, 6], [0, 0, 14]), hip(-0.045), squat(crouch))
  return s > 0 ? p : mirror(p)
}
const TICKTOCK: DanceDef = {
  duration: 3.2,
  keys: [
    key(0.0, TICK(1, 100, 6), 'snap'),
    key(0.4, TICK(-1, 100, 6), 'snap'),
    key(0.8, TICK(1, 100, 6), 'snap'),
    key(1.2, TICK(-1, 100, 6), 'snap'),
    key(1.6, TICK(1, 150, 14), 'snap'),
    key(2.0, TICK(-1, 150, 14), 'snap'),
    // Midnight: both hands at twelve, then both at six.
    key(2.4, mix(both(arm([-4, 0, 172])), torso([-4, 0, 0], [-14, 0, 0]), squat(2)), 'snap'),
    key(2.8, mix(both(arm([-30, 0, -14], [-10, 0, 0])), torso([14, 0, 0], [16, 0, 0]), squat(22)), 'snap'),
  ],
}

const STOMP_L = mix(kneeUp(48), FIST_UP, mirror(arm([24, 0, 14], [-95, 0, 0])), torso([6, 0, -6], [10, 0, 0]))
const STOMP_DOWN = mix(FIST_PULL, mirror(arm([20, 0, 16], [-80, 0, 0])), torso([12, 0, 0], [22, 0, 0]), squat(18))
const STOMP: DanceDef = {
  duration: 2.4,
  keys: [
    key(0.0, STOMP_L),
    key(0.3, STOMP_DOWN, 'linear'),
    key(0.6, mirror(STOMP_L)),
    key(0.9, mirror(STOMP_DOWN), 'linear'),
    key(1.2, mix(both(FIST_UP), torso([-8, 0, 0], [-22, 0, 0]), hip(0, 0.02), squat(4))),
    key(1.5, mix(both(FIST_PULL), torso([14, 0, 0], [22, 0, 0]), squat(24)), 'linear'),
    key(1.8, mix(both(FIST_UP), torso([-8, 0, 0], [-22, 0, 0]), hip(0, 0.02), squat(4))),
    key(2.1, mix(both(FIST_PULL), torso([14, 0, 0], [22, 0, 0]), squat(24)), 'linear'),
  ],
}

const DEFS: Record<DanceClip, DanceDef> = {
  Dance_Robot: ROBOT, Dance_Flex: FLEXING, Dance_Tornado: TORNADO,
  Dance_Cheer: CHEER, Dance_TickTock: TICKTOCK, Dance_Stomp: STOMP,
}

// ─── Clip building ────────────────────────────────────────────────────────

const FPS = 30
const DEG = Math.PI / 180

function ease(u: number, e: Ease): number {
  if (e === 'linear') return u
  if (e === 'snap') {
    // Pop into the pose in the first 30% of the beat, then hold (with a tiny settle).
    const k = Math.min(1, u / 0.3)
    return 1 - (1 - k) ** 3
  }
  return u * u * (3 - 2 * u)
}

/**
 * Build all dance clips against a body's hierarchy (`bodyScene`, model space) and its retargeted
 * idle clip, which supplies the base pose and every bone track so untouched bones hold idle.
 */
export function buildDanceClips(bodyScene: THREE.Object3D, idle: THREE.AnimationClip): THREE.AnimationClip[] {
  const baseLocal = new Map<string, THREE.Quaternion>()
  const bones = new Map<string, THREE.Object3D>()
  bodyScene.traverse(o => {
    if ((o as THREE.Bone).isBone) {
      bones.set(o.name, o)
      baseLocal.set(o.name, o.quaternion.clone())
    }
  })
  let pelvisBase = bones.get('pelvis')?.position.clone() ?? new THREE.Vector3()
  const idleQuat: THREE.KeyframeTrack[] = []
  for (const t of idle.tracks) {
    const b = t.name.slice(0, t.name.lastIndexOf('.'))
    if (t.name.endsWith('.quaternion')) {
      idleQuat.push(t)
      if (baseLocal.has(b)) baseLocal.set(b, new THREE.Quaternion().fromArray(t.values, 0))
    } else if (t.name === 'pelvis.position') pelvisBase = new THREE.Vector3().fromArray(t.values, 0)
  }
  // Model-space rotation of each node in the base pose.
  const worldCache = new Map<THREE.Object3D, THREE.Quaternion>()
  const world = (o: THREE.Object3D | null): THREE.Quaternion => {
    if (!o || o === bodyScene) return new THREE.Quaternion()
    const hit = worldCache.get(o)
    if (hit) return hit
    const q = world(o.parent).clone().multiply(baseLocal.get(o.name) ?? o.quaternion)
    worldCache.set(o, q)
    return q
  }
  const pelvisParentInv = world(bones.get('pelvis')?.parent ?? null).clone().invert()

  const clips: THREE.AnimationClip[] = []
  const e = new THREE.Euler()
  const qa = new THREE.Quaternion()
  const qb = new THREE.Quaternion()
  const tmp = new THREE.Quaternion()
  for (const [name, def] of Object.entries(DEFS) as Array<[DanceClip, DanceDef]>) {
    const keys = def.keys
    const used = new Set<string>()
    for (const k of keys) for (const b of Object.keys(k.bones)) if (bones.has(b)) used.add(b)
    const n = Math.round(def.duration * FPS) + 1
    const times = new Float32Array(n)
    for (let i = 0; i < n; i++) times[i] = Math.min(def.duration, i / FPS)
    const segment = (t: number): { a: Key; b: Key; u: number } => {
      let i = keys.length - 1
      while (i > 0 && keys[i].t > t) i--
      const a = keys[i]
      const b = keys[(i + 1) % keys.length]
      const tb = i + 1 < keys.length ? b.t : def.duration
      const u = tb > a.t ? Math.min(1, Math.max(0, (t - a.t) / (tb - a.t))) : 0
      return { a, b, u: ease(u, a.ease ?? 'smooth') }
    }
    const tracks: THREE.KeyframeTrack[] = []
    for (const b of used) {
      const bone = bones.get(b)!
      const P = world(bone.parent)
      const Pinv = P.clone().invert()
      const L = baseLocal.get(b)!
      const values = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        const { a, b: kb, u } = segment(times[i])
        const va = a.bones[b] ?? [0, 0, 0]
        const vb = kb.bones[b] ?? [0, 0, 0]
        qa.setFromEuler(e.set(va[0] * DEG, va[1] * DEG, va[2] * DEG, 'XYZ'))
        qb.setFromEuler(e.set(vb[0] * DEG, vb[1] * DEG, vb[2] * DEG, 'XYZ'))
        qa.slerp(qb, u)
        // local' = P0^-1 · D · P0 · L0  (model-space offset D, carried by the parent)
        tmp.copy(Pinv).multiply(qa).multiply(P).multiply(L)
        tmp.toArray(values, i * 4)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, values))
    }
    // Everything the dance doesn't move holds the idle pose.
    for (const t of idleQuat) {
      const b = t.name.slice(0, t.name.lastIndexOf('.'))
      if (used.has(b)) continue
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0, def.duration], [...t.values.slice(0, 4), ...t.values.slice(0, 4)]))
    }
    const hipValues = new Float32Array(n * 3)
    const v = new THREE.Vector3()
    const va = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const { a, b, u } = segment(times[i])
      va.fromArray(a.hip ?? [0, 0, 0]).lerp(v.fromArray(b.hip ?? [0, 0, 0]), u)
      va.applyQuaternion(pelvisParentInv).add(pelvisBase)
      va.toArray(hipValues, i * 3)
    }
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, hipValues))
    clips.push(new THREE.AnimationClip(name, def.duration, tracks))
  }
  return clips
}
