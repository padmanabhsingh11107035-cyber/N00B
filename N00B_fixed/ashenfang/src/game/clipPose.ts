import * as THREE from 'three'

/**
 * Snapshot of every node an AnimationMixer drives, taken right after `mixer.update()`.
 *
 * three.js' PropertyMixer only writes a binding when its blended value differs from the value
 * it wrote on the previous frame. Any procedural layer applied on top of the clip (spine bend,
 * head aim, arm IK, root-motion lock) therefore survives into the next frame whenever a clip
 * holds a bone still, and compounds every frame after. Call `restore()` before the mixer update
 * and `capture()` right after it so procedural layers always start from the pure clip pose.
 */
export class ClipPoseCache {
  private readonly nodes: { node: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3; s: THREE.Vector3 }[] = []

  constructor(root: THREE.Object3D, clips: Iterable<THREE.AnimationClip>) {
    const names = new Set<string>()
    for (const clip of clips) for (const t of clip.tracks) names.add(THREE.PropertyBinding.parseTrackName(t.name).nodeName)
    for (const n of names) {
      const node = root.getObjectByName(n)
      if (node) this.nodes.push({ node, q: node.quaternion.clone(), p: node.position.clone(), s: node.scale.clone() })
    }
  }

  get size(): number {
    return this.nodes.length
  }

  restore(): void {
    for (const n of this.nodes) {
      n.node.quaternion.copy(n.q)
      n.node.position.copy(n.p)
      n.node.scale.copy(n.s)
    }
  }

  capture(): void {
    for (const n of this.nodes) {
      n.q.copy(n.node.quaternion)
      n.p.copy(n.node.position)
      n.s.copy(n.node.scale)
    }
  }
}
