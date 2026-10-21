import * as THREE from 'three'
import { canvasTexture, glow, mesh, outline, paperTexture, toon } from './toon'
import { createCharacter } from './character'

/**
 * Procedural comic-book characters. Everything is primitive geometry + toon shading + ink
 * outlines. All rigs face -Z (forward) and stand with feet at y = 0.
 */

const G = {
  capsule: (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10),
  sphere: (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h),
}

// ─── Hero / students ─────────────────────────────────────────────────────

export type HeroLook = { suit: string; accent: string; cape: string | null; hair: string; skin: string; mask: string | null; eyes: string }
export const HERO_LOOK: HeroLook = { suit: '#1d2a63', accent: '#e0b54e', cape: '#c99a34', hair: '#3a1f5c', skin: '#f0b98f', mask: '#141d45', eyes: '#ffe3a1' }

export type HeroRig = {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  fistL: THREE.Mesh
  fistR: THREE.Mesh
  legL: THREE.Group
  legR: THREE.Group
  cape?: THREE.Mesh
  aura: THREE.Mesh
  barrier: THREE.Mesh
}

export function makeHero(look: HeroLook = HERO_LOOK, withAura = true): HeroRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const suit = toon(look.suit)
  const accent = toon(look.accent)
  const skin = toon(look.skin)
  const hairM = toon(look.hair)
  const boots = toon('#1b1838')
  const gloves = toon('#f5f1e6')
  // Legs
  const leg = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.9, 0)
    mesh(G.capsule(0.13, 0.42), suit, 0, -0.38, 0, g)
    const boot = mesh(new THREE.BoxGeometry(0.26, 0.26, 0.38), boots, 0, -0.78, -0.04, g)
    boot.userData.part = 'boot'
    body.add(g)
    return g
  }
  const legL = leg(-0.17)
  const legR = leg(0.17)
  // Torso
  const torso = mesh(G.capsule(0.33, 0.42), suit, 0, 1.28, 0, body)
  torso.scale.set(1.12, 1, 0.82)
  const belt = mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 20), accent, 0, 0.97, 0, body)
  belt.rotation.x = Math.PI / 2
  belt.scale.set(1.1, 0.85, 1)
  const emblem = mesh(new THREE.CircleGeometry(0.16, 3), glow(look.accent), 0, 1.38, -0.285, body)
  emblem.rotation.set(0, Math.PI, -Math.PI / 2)
  // Arms
  const arm = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 1.6, 0)
    mesh(G.capsule(0.1, 0.4), suit, 0, -0.28, 0, g)
    const fist = mesh(G.sphere(0.14, 12, 10), gloves.clone(), 0, -0.6, 0, g)
    body.add(g)
    return { g, fist }
  }
  const L = arm(-0.46)
  const R = arm(0.46)
  // Head
  const head = new THREE.Group()
  head.position.set(0, 1.92, 0)
  body.add(head)
  mesh(G.sphere(0.27), skin, 0, 0, 0, head)
  const hair = mesh(new THREE.SphereGeometry(0.295, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, 0, 0.03, 0.03, head)
  hair.rotation.x = -0.25
  for (let i = 0; i < 3; i += 1) {
    const spike = mesh(new THREE.ConeGeometry(0.1, 0.32, 6), hairM, (i - 1) * 0.12, 0.26, 0.1, head)
    spike.rotation.set(0.9, 0, (i - 1) * -0.35)
  }
  if (look.mask) {
    const band = mesh(new THREE.CylinderGeometry(0.283, 0.283, 0.1, 20, 1, true), toon(look.mask), 0, 0.02, 0, head)
    band.userData.noOutline = true
  }
  for (const x of [-0.095, 0.095]) mesh(new THREE.BoxGeometry(0.07, 0.035, 0.02), glow(look.eyes), x, 0.025, -0.268, head)
  // Cape
  let cape: THREE.Mesh | undefined
  if (look.cape) {
    const geo = new THREE.PlaneGeometry(0.8, 1.2, 1, 5)
    geo.translate(0, -0.6, 0)
    const m = new THREE.MeshStandardMaterial({ color: look.cape, side: THREE.DoubleSide })
    // The rig faces -Z, so the cape hangs at +Z; negative X rotation swings its hem further back.
    cape = mesh(geo, m, 0, 1.66, 0.29, body)
    cape.rotation.x = -0.12
    const collar = mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), accent, 0, 1.68, 0.04, body)
    collar.rotation.x = Math.PI / 2
  }
  outline(body, 0.035)
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), glow('#7ef9ff', 0.55))
  aura.rotation.x = -Math.PI / 2
  aura.position.y = 0.04
  aura.visible = withAura
  root.add(aura)
  const barrier = new THREE.Mesh(G.sphere(1.15, 20, 14), new THREE.MeshBasicMaterial({ color: '#7ef9ff', transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }))
  barrier.position.y = 1.1
  barrier.visible = false
  root.add(barrier)
  return { root, body, head, armL: L.g, armR: R.g, fistL: L.fist, fistR: R.fist, legL, legR, cape, aura, barrier }
}

// ─── Enemies ──────────────────────────────────────────────────────────────

export type EnemyRig = { root: THREE.Group; body: THREE.Group; parts: Record<string, THREE.Object3D>; flash: THREE.MeshStandardMaterial[]; char?: import('./character').Character }

/** Clone toon materials per enemy so a hit-flash only lights up the enemy that was hit. */
function ownMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = []
  const map = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !(m.material instanceof THREE.MeshStandardMaterial)) return
    let c = map.get(m.material)
    if (!c) {
      c = m.material.clone()
      c.emissive = new THREE.Color('#ffffff')
      c.emissiveIntensity = 0
      map.set(m.material, c)
      out.push(c)
    }
    m.material = c
  })
  return out
}

function finish(root: THREE.Group, body: THREE.Group, parts: Record<string, THREE.Object3D>, elite: boolean, thickness = 0.05): EnemyRig {
  const flash = ownMaterials(body)
  outline(body, thickness, elite)
  if (elite) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), glow('#ffcf4d'))
    halo.rotation.x = Math.PI / 2
    parts.halo = halo
    body.add(halo)
  }
  body.traverse(o => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = !((o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial)
  })
  return { root, body, parts, flash }
}

export function makeShade(tint: string, elite = false): EnemyRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const robe = toon('#2b1840')
  mesh(new THREE.ConeGeometry(0.62, 1.55, 12, 1, true), robe, 0, 0.9, 0, body)
  mesh(G.sphere(0.4), robe, 0, 1.72, 0.02, body)
  const face = mesh(G.sphere(0.3), new THREE.MeshBasicMaterial({ color: '#07040d' }), 0, 1.68, -0.16, body)
  face.scale.set(1, 1.05, 0.6)
  for (const x of [-0.11, 0.11]) mesh(G.sphere(0.06, 8, 6), glow('#ff4fd8'), x, 1.72, -0.34, body)
  const scarf = mesh(new THREE.TorusGeometry(0.34, 0.08, 6, 16), toon(tint), 0, 1.38, 0, body)
  scarf.rotation.x = Math.PI / 2
  const claws: THREE.Group[] = []
  for (const x of [-0.55, 0.55]) {
    const g = new THREE.Group()
    g.position.set(x, 1.3, -0.1)
    const c = mesh(new THREE.ConeGeometry(0.1, 0.7, 6), robe, 0, -0.3, 0, g)
    c.rotation.x = Math.PI
    mesh(new THREE.ConeGeometry(0.05, 0.25, 4), glow('#ff4fd8'), 0, -0.72, 0, g).rotation.x = Math.PI
    body.add(g)
    claws.push(g)
  }
  if (elite) body.scale.setScalar(1.2)
  return finish(root, body, { clawL: claws[0], clawR: claws[1] }, elite)
}

/** Folded exam-sheet texture: ruled lines, handwriting scribbles and a red grade. */
function examTexture(): THREE.Texture {
  return canvasTexture('exam-sheet', 256, 256, g => {
    g.fillStyle = '#f3efe4'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(80,120,200,0.45)'
    g.lineWidth = 2
    for (let y = 28; y < 256; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke() }
    g.strokeStyle = 'rgba(220,60,70,0.5)'
    g.beginPath(); g.moveTo(34, 0); g.lineTo(34, 256); g.stroke()
    g.strokeStyle = 'rgba(40,40,60,0.55)'
    g.lineWidth = 1.5
    for (let y = 26; y < 250; y += 18) {
      g.beginPath()
      let x = 42
      g.moveTo(x, y)
      while (x < 230) { x += 6 + Math.random() * 8; g.lineTo(x, y - 3 - Math.random() * 6) }
      g.stroke()
    }
    g.fillStyle = 'rgba(210,30,50,0.85)'
    g.font = 'bold 72px Georgia, serif'
    g.fillText('F', 170, 110)
    g.strokeStyle = 'rgba(210,30,50,0.8)'
    g.lineWidth = 4
    g.beginPath(); g.arc(190, 86, 40, 0, Math.PI * 2); g.stroke()
  })
}

/** Triangle-soup geometry helper (flat-shaded folds). */
function folds(tris: number[][]): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  for (const t of tris) for (let i = 0; i < 9; i += 3) {
    pos.push(t[i], t[i + 1], t[i + 2])
    uv.push(t[i] * 0.9 + 0.5, t[i + 2] * 0.9 + 0.5)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

export function makeSwarm(elite = false): EnemyRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const paper = new THREE.MeshStandardMaterial({ map: examTexture(), side: THREE.DoubleSide, roughness: 0.92, metalness: 0 })
  // Origami body: a folded diamond keel with a raised crease.
  const keel = folds([
    [0, 0.09, -0.36, -0.1, 0, 0.05, 0, 0, 0.3],
    [0, 0.09, -0.36, 0, 0, 0.3, 0.1, 0, 0.05],
    [0, 0.09, -0.36, -0.1, 0, 0.05, 0, -0.05, -0.05],
    [0, 0.09, -0.36, 0, -0.05, -0.05, 0.1, 0, 0.05],
    [0, 0, 0.3, -0.04, 0.16, 0.44, 0.04, 0.16, 0.44],
  ])
  mesh(keel, paper, 0, 0, 0, body)
  const wings: THREE.Group[] = []
  for (const sgn of [-1, 1]) {
    const g = new THREE.Group()
    // Two-panel wing with a mid crease, like a folded paper bat.
    const w = folds([
      [0, 0, -0.22, sgn * 0.3, 0.04, -0.12, 0, 0, 0.2],
      [sgn * 0.3, 0.04, -0.12, sgn * 0.62, -0.06, 0.08, 0, 0, 0.2],
      [sgn * 0.3, 0.04, -0.12, sgn * 0.62, -0.06, 0.08, sgn * 0.5, 0.02, -0.28],
    ])
    mesh(w, paper, 0, 0.02, 0, g)
    body.add(g)
    wings.push(g)
  }
  // Glowing red-ink eyes and a faint under-glow.
  for (const x of [-0.045, 0.045]) mesh(G.sphere(0.028, 8, 6), glow(new THREE.Color('#ff4f6d').multiplyScalar(2).getStyle()), x, 0.07, -0.27, body)
  const under = mesh(new THREE.CircleGeometry(0.35, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3355', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, -0.05, 0, body)
  under.userData.noOutline = true
  body.position.y = 1.05
  body.scale.setScalar(elite ? 1.7 : 1.3)
  return finish(root, body, { wingL: wings[0], wingR: wings[1] }, elite, 0.02)
}

export function makeMonitor(elite = false): EnemyRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const shell = new THREE.MeshPhysicalMaterial({ color: '#ece6d6', roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 })
  const metal = toon('#2a2d36', { roughness: 0.3, metalness: 1, key: 'drone-metal' })
  const chrome = toon('#c9ccd6', { roughness: 0.18, metalness: 1, key: 'drone-chrome' })
  const hazard = toon('#ff7a45', { roughness: 0.45, key: 'drone-orange' })
  const hull = mesh(G.sphere(0.46, 32, 24), shell, 0, 0, 0, body)
  hull.scale.set(1, 0.82, 1)
  const band = mesh(new THREE.TorusGeometry(0.465, 0.045, 10, 40), metal, 0, 0, 0, body)
  band.rotation.x = Math.PI / 2
  const sash = mesh(new THREE.TorusGeometry(0.44, 0.035, 8, 40, Math.PI * 1.2), hazard, 0, 0, 0, body)
  sash.rotation.set(Math.PI / 2, 0, 0.6)
  // Police-style cap with a glowing badge.
  const capMat = toon('#1f3558', { roughness: 0.8, key: 'drone-cap' })
  mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 24), capMat, 0, 0.4, 0, body)
  const brim = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.03, 24, 1, false, -Math.PI / 2 - 0.9, 1.8), metal, 0, 0.33, -0.12, body)
  brim.scale.z = 1.3
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12).rotateX(Math.PI / 2), glow('#ffd35c'), 0, 0.42, -0.35, body)
  // Lens: dark housing, chrome rim, glowing iris behind a glass dome.
  const housing = mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.14, 28).rotateX(Math.PI / 2), metal, 0, -0.02, -0.38, body)
  void housing
  mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 32), chrome, 0, -0.02, -0.455, body)
  const eye = mesh(G.sphere(0.13, 20, 14), glow(new THREE.Color('#ff3b3b').multiplyScalar(2.2).getStyle()), 0, -0.02, -0.42, body)
  eye.scale.z = 0.5
  const dome = mesh(new THREE.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false }), 0, -0.02, -0.45, body)
  dome.userData.noOutline = true
  // Four rotor arms with motor pods and translucent blur discs.
  const rotor = new THREE.Group()
  rotor.position.y = 0.12
  body.add(rotor)
  const blurMat = new THREE.MeshBasicMaterial({ color: '#dfe6ff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.07), metal, Math.cos(a) * 0.52, 0.12, Math.sin(a) * 0.52, body)
    arm.rotation.y = -a
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 14), chrome, Math.cos(a) * 0.76, 0.16, Math.sin(a) * 0.76, body)
    const disc = mesh(new THREE.CircleGeometry(0.24, 24).rotateX(-Math.PI / 2), blurMat, Math.cos(a) * 0.76, 0.24, Math.sin(a) * 0.76, rotor)
    disc.position.y = 0.12
    disc.castShadow = false
    const blade = mesh(new THREE.BoxGeometry(0.44, 0.012, 0.04), metal, Math.cos(a) * 0.76, 0.12, Math.sin(a) * 0.76, rotor)
    blade.userData.spin = true
  }
  // Under-glow ring.
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 28), glow(new THREE.Color('#ff5a5a').multiplyScalar(1.5).getStyle()), 0, -0.36, 0, body)
  ring.rotation.x = Math.PI / 2
  body.position.y = 1.9
  if (elite) body.scale.setScalar(1.25)
  return finish(root, body, { eye, rotor }, elite)
}

export function makeBruiser(tint: string, elite = false): EnemyRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const fur = toon('#6b5a8f')
  for (const x of [-0.45, 0.45]) mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.8, 10), fur, x, 0.4, 0, body)
  const torso = mesh(G.sphere(0.95, 18, 14), fur, 0, 1.55, 0, body)
  torso.scale.set(1, 1.08, 0.88)
  const jersey = mesh(new THREE.CylinderGeometry(0.97, 0.9, 0.7, 18, 1, true), toon(tint), 0, 1.5, 0, body)
  jersey.scale.z = 0.9
  const num = mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: canvasTexture('num00', 128, 96, g => {
    g.fillStyle = '#fff'
    g.font = '86px Bangers, Impact, sans-serif'
    g.textAlign = 'center'
    g.fillText('00', 64, 84)
  }), transparent: true }), 0, 1.52, -0.9, body)
  num.rotation.y = Math.PI
  const head = new THREE.Group()
  head.position.set(0, 2.55, -0.1)
  body.add(head)
  mesh(G.sphere(0.56), fur, 0, 0, 0, head)
  const beak = mesh(new THREE.ConeGeometry(0.2, 0.5, 8), toon('#ffb347'), 0, -0.08, -0.6, head)
  beak.rotation.x = -Math.PI / 2
  for (const x of [-0.2, 0.2]) {
    mesh(G.sphere(0.09, 8, 6), glow('#c58cff'), x, 0.12, -0.48, head)
    const brow = mesh(new THREE.BoxGeometry(0.26, 0.07, 0.07), toon('#1b1838'), x, 0.27, -0.46, head)
    brow.rotation.z = x > 0 ? 0.4 : -0.4
  }
  for (const x of [-0.28, 0.28]) {
    const ear = mesh(new THREE.ConeGeometry(0.14, 0.4, 6), fur, x, 0.52, 0.05, head)
    ear.rotation.z = x > 0 ? -0.35 : 0.35
  }
  const arms: THREE.Group[] = []
  for (const x of [-1.05, 1.05]) {
    const g = new THREE.Group()
    g.position.set(x, 2.0, 0)
    mesh(G.capsule(0.22, 0.6), fur, 0, -0.45, 0, g)
    mesh(G.sphere(0.42, 12, 10), toon('#f5f1e6'), 0, -0.98, 0, g)
    body.add(g)
    arms.push(g)
  }
  if (elite) body.scale.setScalar(1.15)
  return finish(root, body, { head, armL: arms[0], armR: arms[1] }, elite, 0.06)
}

// ─── Boss: The Proctor ───────────────────────────────────────────────────

/** Objects that track a bone's position (in body space) without inheriting its axes. */
export type Follower = { obj: THREE.Object3D; bone: THREE.Object3D; up: number; fwd: number }
const fv = new THREE.Vector3()
export function updateFollowers(rig: EnemyRig & { followers?: Follower[] }): void {
  if (!rig.followers?.length) return
  rig.root.updateMatrixWorld(true)
  for (const f of rig.followers) {
    f.bone.getWorldPosition(fv)
    rig.body.worldToLocal(fv)
    f.obj.position.set(fv.x, fv.y + f.up, fv.z - f.fwd)
  }
}
export type BossRig = EnemyRig & { eye: THREE.Mesh; pages: THREE.Group; handL: THREE.Group; handR: THREE.Group; hem: THREE.Mesh; followers?: Follower[] }

/** Floating exam pages orbiting a boss. */
function pageRing(): THREE.Group {
  const pages = new THREE.Group()
  pages.position.y = 3.2
  const paper = new THREE.MeshStandardMaterial({ map: paperTexture(), side: THREE.DoubleSide, roughness: 0.9, emissive: '#fff4d6', emissiveIntensity: 0.15, emissiveMap: paperTexture() })
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.84, 4, 1), paper)
    // Slight curl so pages read as paper rather than cards.
    const pos = p.geometry.attributes.position
    for (let k = 0; k < pos.count; k += 1) pos.setZ(k, Math.pow(pos.getX(k) / 0.31, 2) * 0.05)
    p.geometry.computeVertexNormals()
    p.position.set(Math.cos(a) * 3, Math.sin(i * 1.7) * 0.4, Math.sin(a) * 3)
    p.rotation.set(Math.sin(i) * 0.3, -a, Math.cos(i * 2) * 0.2)
    p.castShadow = true
    pages.add(p)
  }
  return pages
}

/** The Proctor on the realistic body: gowned, mortarboarded, a single burning eye and a red pen. */
function makeProctorChar(): BossRig | null {
  const char = createCharacter({ variant: 'proctor', rim: '#c58cff', rimStrength: 0.7, dissolve: true })
  if (!char) return null
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const S = 2.6
  char.root.scale.setScalar(S)
  body.add(char.root)
  const hem = mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 48), glow(new THREE.Color('#c58cff').multiplyScalar(1.8).getStyle()), 0, 0.12, 0, body)
  hem.rotation.x = Math.PI / 2
  const followers: Follower[] = []
  const head = char.bone('Head')
  // Mortarboard.
  const cap = new THREE.Group()
  const felt = toon('#15131f', { roughness: 0.85, key: 'mortar' })
  const board = mesh(new THREE.BoxGeometry(0.95, 0.05, 0.95), felt, 0, 0.14, 0, cap)
  board.rotation.y = Math.PI / 4
  mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 20), felt, 0, 0.02, 0, cap)
  mesh(new THREE.SphereGeometry(0.04, 8, 6), toon('#ffcf4d', { metalness: 1, roughness: 0.3, key: 'gold' }), 0, 0.18, 0, cap)
  const tassel = mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.45, 8), glow(new THREE.Color('#ffcf4d').multiplyScalar(1.5).getStyle()), 0.45, -0.05, 0, cap)
  tassel.rotation.z = 0.12
  body.add(cap)
  // Cyclopean eye in front of the face (flares on wind-ups).
  const eye = mesh(G.sphere(0.1, 14, 10), glow(new THREE.Color('#ff3b5c').multiplyScalar(2.4).getStyle()), 0, 0, 0, body)
  eye.scale.z = 0.5
  if (head) {
    followers.push({ obj: cap, bone: head, up: 0.62, fwd: 0.02 })
    followers.push({ obj: eye, bone: head, up: 0.26, fwd: 0.3 })
  }
  // Red pen, held like a sword in the right hand.
  const handBone = char.bone('hand_r')
  const handR = new THREE.Group()
  const handL = new THREE.Group()
  body.add(handL, handR)
  if (handBone) {
    const pen = new THREE.Group()
    const ws = new THREE.Vector3()
    char.root.updateWorldMatrix(true, true)
    handBone.getWorldScale(ws)
    pen.scale.setScalar(1 / (ws.x || 1))
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 12), toon('#b3122e', { roughness: 0.3, metalness: 0.2, key: 'pen' }), 0, 0.55, 0, pen)
    mesh(new THREE.ConeGeometry(0.05, 0.22, 12), toon('#d9d9e0', { roughness: 0.2, metalness: 1, key: 'nib' }), 0, 1.36, 0, pen)
    mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(new THREE.Color('#ff3b5c').multiplyScalar(2).getStyle()), 0, 1.5, 0, pen)
    pen.rotation.x = Math.PI / 2
    handBone.add(pen)
  }
  const pages = pageRing()
  root.add(pages)
  root.add(contactShadow(1.4))
  char.play('Spell_Simple_Idle_Loop')
  return { root, body, parts: {}, flash: [], eye, pages, handL, handR, hem, char, followers }
}

/** Soft dark blob under a character (cheap contact shadow). */
function contactShadow(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    color: '#000', transparent: true, depthWrite: false, opacity: 0.45,
    alphaMap: canvasTexture('blob-shadow', 64, 64, g => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0, '#fff')
      grd.addColorStop(1, '#000')
      g.fillStyle = grd
      g.fillRect(0, 0, 64, 64)
    }),
  }))
  m.position.y = 0.02
  return m
}

export function makeProctor(): BossRig {
  const real = makeProctorChar()
  if (real) return real
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const robe = toon('#231a4a')
  mesh(new THREE.ConeGeometry(1.7, 3.4, 18, 1, true), robe, 0, 1.9, 0, body)
  const hem = mesh(new THREE.TorusGeometry(1.62, 0.07, 6, 40), glow('#c58cff'), 0, 0.22, 0, body)
  hem.rotation.x = Math.PI / 2
  mesh(new THREE.CylinderGeometry(0.75, 1.05, 1.3, 16), robe, 0, 3.7, 0, body)
  const stole = mesh(new THREE.TorusGeometry(0.82, 0.14, 8, 24), toon('#ffcf4d'), 0, 4.2, 0, body)
  stole.rotation.x = Math.PI / 2
  mesh(G.sphere(0.62), toon('#d9d4e8'), 0, 4.8, 0, body)
  const eyeWhite = mesh(G.sphere(0.32), glow('#fff4c2'), 0, 4.82, -0.4, body)
  eyeWhite.scale.z = 0.6
  const eye = mesh(G.sphere(0.13, 10, 8), glow('#e8384f'), 0, 4.82, -0.6, body)
  const board = mesh(new THREE.BoxGeometry(1.8, 0.12, 1.8), toon('#1b1838'), 0, 5.42, 0, body)
  board.rotation.y = Math.PI / 4
  mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.3, 14), toon('#1b1838'), 0, 5.25, 0, body)
  const tassel = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), glow('#ffcf4d'), 0.85, 5.05, 0, body)
  tassel.rotation.z = 0.15
  const hand = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 3.4, -0.5)
    mesh(G.sphere(0.48, 14, 10), toon('#f5f1e6'), 0, 0, 0, g)
    for (let i = 0; i < 3; i += 1) mesh(G.capsule(0.1, 0.3), toon('#f5f1e6'), (i - 1) * 0.2, 0.05, -0.45, g).rotation.x = Math.PI / 2
    body.add(g)
    return g
  }
  const handL = hand(-2.1)
  const handR = hand(2.1)
  const pen = mesh(new THREE.CylinderGeometry(0.09, 0.05, 2.2, 8), glow('#e8384f'), 0, 0.2, -0.7, handR)
  pen.rotation.x = Math.PI / 2.4
  const pages = new THREE.Group()
  pages.position.y = 3.2
  const paper = new THREE.MeshBasicMaterial({ map: paperTexture(), side: THREE.DoubleSide })
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), paper)
    p.position.set(Math.cos(a) * 3, Math.sin(i * 1.7) * 0.4, Math.sin(a) * 3)
    p.rotation.y = -a
    pages.add(p)
  }
  root.add(pages)
  const flash = ownMaterials(body)
  outline(body, 0.07)
  return { root, body, parts: {}, flash, eye, pages, handL, handR, hem }
}

// ─── Boss: The Librarian ────────────────────────────────────────────────

export type LibrarianRig = EnemyRig & {
  followers?: Follower[]
  lenses: THREE.Mesh[]
  books: THREE.Group
  handL: THREE.Group
  handR: THREE.Group
  tome: THREE.Group
  hem: THREE.Mesh
}

/** Tall spectral librarian: teal cardigan robe, hair bun with a pencil, glowing spectacles,
 *  a floating open tome and a ring of orbiting books. Faces -Z like every other rig. */
/** The Librarian on the realistic body: spectral cardigan, bun, glowing spectacles, a floating tome. */
function makeLibrarianChar(): LibrarianRig | null {
  const char = createCharacter({ variant: 'librarian', rim: '#7effd4', rimStrength: 0.8, dissolve: true })
  if (!char) return null
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  char.root.scale.setScalar(3.0)
  body.add(char.root)
  const hem = mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 48), glow(new THREE.Color('#7effd4').multiplyScalar(1.6).getStyle()), 0, 0.12, 0, body)
  hem.rotation.x = Math.PI / 2
  const followers: Follower[] = []
  const head = char.bone('Head')
  const specs = new THREE.Group()
  const frame = toon('#ffcf4d', { metalness: 1, roughness: 0.25, key: 'gold' })
  const lenses: THREE.Mesh[] = []
  for (const x of [-0.11, 0.11]) {
    mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24), frame, x, 0, 0, specs)
    const lens = mesh(new THREE.CircleGeometry(0.068, 20), glow('#5fd9b8', 0.75), x, 0, -0.004, specs)
    lens.rotation.y = Math.PI
    lenses.push(lens)
  }
  mesh(new THREE.BoxGeometry(0.07, 0.015, 0.015), frame, 0, 0.01, 0, specs)
  body.add(specs)
  if (head) followers.push({ obj: specs, bone: head, up: 0.3, fwd: 0.33 })
  const handL = new THREE.Group()
  const handR = new THREE.Group()
  body.add(handL, handR)
  // The open tome she reads from.
  const tome = new THREE.Group()
  tome.position.set(0, 3.5, -1.3)
  const cover = toon('#5a2b6e', { roughness: 0.6, key: 'tome-cover' })
  const pageMat = new THREE.MeshStandardMaterial({ map: paperTexture(), side: THREE.DoubleSide, roughness: 0.9, emissive: '#bfffe9', emissiveMap: paperTexture(), emissiveIntensity: 0.35 })
  for (const side of [-1, 1]) {
    const half = new THREE.Group()
    half.rotation.z = side * 0.3
    mesh(new THREE.BoxGeometry(0.75, 0.06, 1.0), cover, side * 0.38, 0, 0, half)
    const block = mesh(new THREE.BoxGeometry(0.68, 0.08, 0.92), toon('#efe6cf', { roughness: 0.95, key: 'pageblock' }), side * 0.37, 0.06, 0, half)
    void block
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.92), pageMat)
    page.rotation.x = -Math.PI / 2
    page.position.set(side * 0.37, 0.105, 0)
    half.add(page)
    tome.add(half)
  }
  const tomeGlow = mesh(G.sphere(0.2, 10, 8), glow('#4fbfa0', 0.35), 0, 0.3, 0, tome)
  tomeGlow.scale.set(1.8, 0.5, 1.8)
  body.add(tome)
  const books = new THREE.Group()
  books.position.y = 3.4
  const spines = ['#8e1b2c', '#1f2f7a', '#b8892b', '#2f6b45', '#5a2b6e', '#9a4b1f']
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2
    const b = new THREE.Group()
    mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), toon(spines[i % spines.length], { roughness: 0.65, key: 'book' }), 0, 0, 0, b)
    mesh(new THREE.BoxGeometry(0.46, 0.66, 0.12), toon('#efe6cf', { roughness: 0.95, key: 'pageblock' }), 0.03, 0, 0, b)
    b.position.set(Math.cos(a) * 3.1, Math.sin(i * 1.3) * 0.5, Math.sin(a) * 3.1)
    b.rotation.set(0.3 * Math.sin(i), -a, 0.2 * Math.cos(i))
    books.add(b)
  }
  books.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true })
  root.add(books)
  root.add(contactShadow(1.3))
  char.play('Spell_Simple_Idle_Loop')
  return { root, body, parts: {}, flash: [], lenses, books, handL, handR, tome, hem, char, followers }
}

export function makeLibrarian(): LibrarianRig {
  const real = makeLibrarianChar()
  if (real) return real
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const coat = toon('#1f4a47')
  const trim = toon('#c58cff')
  const skin = toon('#8fb5ad')
  const hair = toon('#3a2b4a')
  mesh(new THREE.ConeGeometry(1.35, 3.7, 20, 1, true), coat, 0, 1.95, 0, body)
  const hem = mesh(new THREE.TorusGeometry(1.28, 0.07, 6, 40), glow('#7effd4'), 0, 0.22, 0, body)
  hem.rotation.x = Math.PI / 2
  // Cardigan torso with buttons down the front.
  mesh(new THREE.CylinderGeometry(0.62, 0.95, 1.6, 16), coat, 0, 4.05, 0, body)
  for (let i = 0; i < 3; i += 1) mesh(G.sphere(0.07, 8, 6), toon('#ffd35c'), 0, 3.6 + i * 0.35, -0.72 + i * 0.05, body)
  const shawl = mesh(new THREE.TorusGeometry(0.68, 0.16, 8, 24), trim, 0, 4.78, 0, body)
  shawl.rotation.x = Math.PI / 2
  // Head, tight bun and a pencil stuck through it.
  mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 10), skin, 0, 5.0, 0, body)
  mesh(G.sphere(0.56), skin, 0, 5.45, 0, body)
  const cap = mesh(G.sphere(0.6), hair, 0, 5.6, 0.1, body)
  cap.scale.set(1, 0.72, 1)
  mesh(G.sphere(0.36), hair, 0, 6.02, 0.32, body)
  const pencil = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), toon('#ffd35c'), 0, 6.05, 0.32, body)
  pencil.rotation.z = Math.PI / 2.6
  // Spectacles: gold frames with glowing lenses (the "eyes" that flare on wind-ups).
  const frame = toon('#ffcf4d')
  const lenses: THREE.Mesh[] = []
  for (const x of [-0.22, 0.22]) {
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 18), frame, x, 5.45, -0.52, body)
    ring.rotation.y = 0
    const lens = mesh(new THREE.CircleGeometry(0.15, 18), glow('#5fd9b8', 0.9), x, 5.45, -0.535, body)
    lens.rotation.y = Math.PI
    lenses.push(lens)
  }
  mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), frame, 0, 5.47, -0.53, body)
  // Long ghostly hands.
  const hand = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 3.8, -0.5)
    mesh(G.sphere(0.4, 14, 10), skin, 0, 0, 0, g)
    for (let i = 0; i < 4; i += 1) mesh(G.capsule(0.07, 0.42), skin, (i - 1.5) * 0.15, 0.05, -0.42, g).rotation.x = Math.PI / 2
    body.add(g)
    return g
  }
  const handL = hand(-1.9)
  const handR = hand(1.9)
  // The open tome she reads from (floats between the hands).
  const tome = new THREE.Group()
  tome.position.set(0, 3.5, -1.3)
  const cover = toon('#5a2b6e')
  const pageMat = new THREE.MeshBasicMaterial({ map: paperTexture(), side: THREE.DoubleSide })
  for (const side of [-1, 1]) {
    const half = new THREE.Group()
    half.rotation.z = side * 0.35
    mesh(new THREE.BoxGeometry(0.75, 0.06, 1.0), cover, side * 0.38, 0, 0, half)
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.92), pageMat)
    page.rotation.x = -Math.PI / 2
    page.position.set(side * 0.37, 0.04, 0)
    half.add(page)
    tome.add(half)
  }
  const tomeGlow = mesh(G.sphere(0.2, 10, 8), glow('#4fbfa0', 0.45), 0, 0.3, 0, tome)
  tomeGlow.scale.set(1.8, 0.5, 1.8)
  body.add(tome)
  // Orbiting books (outside `body` so they don't flash or fade with her).
  const books = new THREE.Group()
  books.position.y = 3.4
  const spines = ['#e8384f', '#2d3fae', '#ffcf4d', '#6dff9e', '#c58cff', '#ff9f43']
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2
    const b = mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), toon(spines[i % spines.length]), Math.cos(a) * 3.1, Math.sin(i * 1.3) * 0.5, Math.sin(a) * 3.1, books)
    b.rotation.set(0.3 * Math.sin(i), -a, 0.2 * Math.cos(i))
  }
  outline(books, 0.03)
  root.add(books)
  const flash = ownMaterials(body)
  outline(body, 0.07)
  body.traverse(o => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = !((o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial)
  })
  return { root, body, parts: {}, flash, lenses, books, handL, handR, tome, hem }
}

// ─── Props ────────────────────────────────────────────────────────────────

export function makeStatue(pose: number): THREE.Group {
  const stone = '#8d8aa3'
  const rig = makeHero({ suit: stone, accent: '#b9b4cf', cape: '#7b7894', hair: '#6d6a86', skin: '#a3a0b8', mask: null, eyes: '#ffd35c' }, false)
  rig.armR.rotation.x = pose === 0 ? Math.PI : -0.4
  rig.armL.rotation.z = pose === 0 ? 0.3 : -0.2
  rig.armL.rotation.x = pose === 1 ? -Math.PI * 0.9 : 0
  const g = new THREE.Group()
  const base = mesh(new THREE.BoxGeometry(2, 1, 2), toon('#4d4868'), 0, 0.5, 0, g)
  base.receiveShadow = true
  mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), toon('#ffd35c'), 0, 1.02, 0, g)
  rig.root.position.y = 1.08
  rig.root.scale.setScalar(1.25)
  g.add(rig.root)
  outline(base, 0.04)
  return g
}

export function makePortal(color: string, radius = 1.7): { root: THREE.Group; swirl: THREE.Mesh; ring: THREE.Mesh } {
  const root = new THREE.Group()
  const tex = canvasTexture(`swirl:${color}`, 256, 256, g => {
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.25, color)
    grad.addColorStop(1, 'rgba(10, 5, 30, 0.2)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 6
    for (let i = 0; i < 5; i += 1) {
      g.beginPath()
      for (let t = 0; t < 1; t += 0.02) {
        const a = t * Math.PI * 3 + (i * Math.PI * 2) / 5
        const r = t * 120
        g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r)
      }
      g.stroke()
    }
  })
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }))
  swirl.position.y = radius + 0.2
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.16, 10, 48), glow(color))
  ring.position.y = radius + 0.2
  root.add(swirl, ring)
  return { root, swirl, ring }
}

export function makeCrystal(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), new THREE.MeshBasicMaterial({ color: '#7ef9ff', transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false }))
  m.scale.set(1, 1.6, 1)
  m.position.y = 1.4
  return m
}

export function makeFountain(): THREE.Group {
  const g = new THREE.Group()
  mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.6, 20), toon('#d9d4e8'), 0, 0.3, 0, g)
  const water = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 20), glow('#6dff9e', 0.85), 0, 0.62, 0, g)
  water.userData.water = true
  mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 10), toon('#d9d4e8'), 0, 1.1, 0, g)
  mesh(new THREE.SphereGeometry(0.35, 12, 10), glow('#6dff9e'), 0, 2.0, 0, g)
  outline(g, 0.04)
  return g
}

export function makeVending(): THREE.Group {
  const g = new THREE.Group()
  mesh(new THREE.BoxGeometry(1.6, 2.6, 1.0), toon('#e8384f'), 0, 1.3, 0, g)
  const screen = mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ map: canvasTexture('vend', 128, 180, c => {
    c.fillStyle = '#1b1838'
    c.fillRect(0, 0, 128, 180)
    const cols = ['#ffd35c', '#7ef9ff', '#6dff9e', '#ff9fb5', '#c58cff']
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 3; x += 1) {
      c.fillStyle = cols[(x + y * 2) % cols.length]
      c.fillRect(12 + x * 38, 14 + y * 40, 26, 26)
    }
  }), toneMapped: false }), 0, 1.55, -0.51, g)
  screen.rotation.y = Math.PI
  const sign = mesh(new THREE.BoxGeometry(1.6, 0.35, 1.02), glow('#ffd35c'), 0, 2.45, 0, g)
  void sign
  outline(g, 0.04)
  return g
}

export function makePedestal(color: string): THREE.Group {
  const g = new THREE.Group()
  mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.1, 8), toon('#4d4868'), 0, 0.55, 0, g)
  mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 8), toon(color), 0, 1.12, 0, g)
  outline(g, 0.04)
  return g
}

export function makeLectern(): THREE.Group {
  const g = new THREE.Group()
  mesh(new THREE.CylinderGeometry(0.15, 0.3, 1.2, 8), toon('#6b4a2e'), 0, 0.6, 0, g)
  const top = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), toon('#6b4a2e'), 0, 1.25, 0, g)
  top.rotation.x = -0.35
  const book = mesh(new THREE.BoxGeometry(0.7, 0.06, 0.5), toon('#c58cff'), 0, 1.32, 0.02, g)
  book.rotation.x = -0.35
  outline(g, 0.03)
  return g
}
