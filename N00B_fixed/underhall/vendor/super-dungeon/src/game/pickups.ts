import * as THREE from 'three'
import { glow } from './toon'

/** Small floating reward visuals. Each returns a group whose child 0 bobs/spins. */

export function makeUpgradeOrb(): THREE.Group {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 0.08), glow('#ffd35c'))
  const face = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glow('#ffffff'))
  face.position.z = 0.06
  inner.add(card, face)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 32), glow('#ffd35c', 0.8))
  ring.rotation.x = Math.PI / 2
  ring.position.y = -1.1
  inner.position.y = 1.4
  g.add(inner, ring)
  return g
}

export function makeOrb(color: string, r = 0.35): THREE.Group {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  inner.add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), glow(color)))
  const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, 0.04, 6, 24), glow(color, 0.7))
  inner.add(halo)
  if (color === '#6dff9e') {
    // Heal orbs carry a plus sign so they read without colour.
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, r * 0.35, r * 0.35), glow('#ffffff')))
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, r * 1.2, r * 0.35), glow('#ffffff')))
  }
  inner.position.y = 1
  g.add(inner)
  return g
}

export function makeCoin(): THREE.Group {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), glow('#ffcf4d'))
  coin.rotation.x = Math.PI / 2
  inner.add(coin)
  inner.position.y = 0.6
  g.add(inner)
  return g
}

export function makeRelicGem(): THREE.Group {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  inner.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), glow('#c58cff')))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 24), glow('#ffcf4d'))
  ring.rotation.x = Math.PI / 2.5
  inner.add(ring)
  inner.position.y = 1.85
  g.add(inner)
  return g
}
