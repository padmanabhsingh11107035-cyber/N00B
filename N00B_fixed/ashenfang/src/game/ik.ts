import * as THREE from 'three'

/**
 * Analytic two-bone IK. `upper` is the root joint (its position is the joint origin in its
 * parent's space); `lower` is a child of `upper` positioned at (0, -l1, 0). Both bones extend
 * along their local −Y. `target` and `pole` are expressed in `upper.parent` space.
 */
const DOWN = new THREE.Vector3(0, -1, 0)
const _d = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _u = new THREE.Vector3()
const _elbow = new THREE.Vector3()
const _f = new THREE.Vector3()
const _qInv = new THREE.Quaternion()
const _pole = new THREE.Vector3()

export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): void {
  _d.subVectors(target, upper.position)
  let dist = _d.length()
  if (dist < 1e-5) return
  const maxReach = (l1 + l2) * 0.999
  const minReach = Math.abs(l1 - l2) + 1e-3
  dist = Math.min(maxReach, Math.max(minReach, dist))
  _dir.copy(_d).normalize()
  // Angle at the root joint between the target direction and the upper bone (law of cosines).
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)))
  _pole.copy(pole)
  _axis.crossVectors(_dir, _pole)
  if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0)
  _axis.normalize()
  _u.copy(_dir).applyAxisAngle(_axis, a)
  upper.quaternion.setFromUnitVectors(DOWN, _u)
  _elbow.copy(upper.position).addScaledVector(_u, l1)
  _f.copy(upper.position).addScaledVector(_dir, dist).sub(_elbow).normalize()
  _qInv.copy(upper.quaternion).invert()
  _f.applyQuaternion(_qInv)
  lower.quaternion.setFromUnitVectors(DOWN, _f)
}
