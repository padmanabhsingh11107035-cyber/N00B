import * as THREE from 'three'
import type { WingDef } from './content'
import { T, type RoomPlan } from './dungeon'
import { tileCenter, type Level, type LevelSource } from './level'
import { makeFountain, makePortal, makeStatue } from './models'
import { canvasTexture, crestTexture, glow, mesh, outline, toon } from './toon'

/**
 * The Hall of Origins — Super Academy's grand atrium after curfew, and the safe run-start hub.
 * North: the Vault Portal down to the Underhall. West: Hero Development Board. East: the Codex
 * trophy case. South-east: the Rescue Wall where saved classmates hang out.
 */

// 19 × 15 interior. S statue · T planter · V vault portal anchor · B board · C codex · N notice
// · R rescued classmates · A central crest · P player spawn.
const HUB_ROWS = [
  '...................',
  '.S.......V.......S.',
  '...................',
  '...T...........T...',
  '...................',
  'B.................C',
  '...................',
  '.S.......A.......S.',
  '...................',
  'N.................R',
  '...................',
  '...T...........T...',
  '...................',
  '.S.......P.......S.',
  '...................',
]

export const HUB_PALETTE: WingDef = {
  id: 'hub', name: 'Hall of Origins', short: 'Hall of Origins', tagline: 'Where every Super hero begins.',
  floorA: '#3d4488', floorB: '#343a78', corridor: '#2a2f60', wall: '#2a2650', wallTop: '#ffd35c', trim: '#ffd35c',
  fog: '#141233', sky: '#b7c4ff', ground: '#2a1f3a', lights: ['#ffd35c', '#7ef9ff'], cover: 'desk',
  hazards: {}, enemies: {}, favours: [],
}

export type HubMarkers = Record<'V' | 'B' | 'C' | 'N' | 'R' | 'P' | 'A', THREE.Vector3>

export function buildHubSource(): { src: LevelSource; markers: HubMarkers } {
  const w = HUB_ROWS[0].length
  const h = HUB_ROWS.length
  const size = Math.max(w, h) + 6
  const x0 = 3
  const y0 = 3
  const tiles = new Uint8Array(size * size)
  for (let y = y0 - 1; y <= y0 + h; y += 1) for (let x = x0 - 1; x <= x0 + w; x += 1) tiles[y * size + x] = T.Wall
  const markers = {} as HubMarkers
  HUB_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const ch = row[c]
      const x = x0 + c
      const y = y0 + r
      tiles[y * size + x] = ch === 'S' || ch === 'T' ? T.Cover : T.Floor
      if ('VBCNRPA'.includes(ch)) markers[ch as keyof HubMarkers] = new THREE.Vector3(tileCenter(x), 0, tileCenter(y))
    }
  })
  const room: RoomPlan = {
    id: 0, kind: 'entrance', cx: 0, cy: 0, x0, y0, w, h, links: [], doors: [], pathIndex: 0, anchor: 0, template: 'hub', rotation: 0,
    danger: 0, waves: 0, reward: 'none', enemies: [], hazards: [], decor: [], center: { tx: x0 + 9, ty: y0 + 7 },
    light: { color: '#ffd35c', intensity: 1.2 },
  }
  return { src: { kind: 'hub', size, tiles, rooms: [room], palette: HUB_PALETTE, renderCover: false }, markers }
}

export type HubProps = { portal: ReturnType<typeof makePortal>; rescueSpots: THREE.Vector3[] }

/** Dress the hub: statues, planters, crest, portal arch, board, codex, notice board. */
export function dressHub(level: Level, markers: HubMarkers): HubProps {
  const g = level.group
  const size = level.size
  let statue = 0
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (level.tiles[y * size + x] !== T.Cover) continue
    const px = tileCenter(x)
    const pz = tileCenter(y)
    const isStatue = (y - 3 === 1 || y - 3 === 7 || y - 3 === 13) && (x - 3 === 1 || x - 3 === 17)
    if (isStatue) {
      const s = makeStatue(statue % 2)
      s.position.set(px, 0, pz)
      s.rotation.y = x < size / 2 ? -Math.PI / 2 : Math.PI / 2
      g.add(s)
      statue += 1
    } else {
      const pot = mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.9, 12), toon('#c98f3a'), px, 0.45, pz, g)
      const bush = mesh(new THREE.SphereGeometry(0.85, 12, 10), toon('#3f8f5f'), px, 1.35, pz, g)
      outline(pot, 0.03)
      outline(bush, 0.04)
    }
  }
  // Floor crest.
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crestTexture(), transparent: true, toneMapped: false, depthWrite: false }))
  crest.position.copy(markers.A).setY(0.03)
  g.add(crest)
  const fountain = makeFountain()
  fountain.position.copy(markers.A)
  fountain.scale.setScalar(0.8)
  g.add(fountain)
  level.circles.push({ x: markers.A.x, z: markers.A.z, r: 1.3 })
  // Vault Portal set into the north wall.
  const portal = makePortal('#c58cff', 2.1)
  portal.root.position.set(markers.V.x, 0, markers.V.z - 1.2)
  g.add(portal.root)
  const arch = new THREE.Group()
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.7, 5.2, 0.9), toon('#4d4868'), s * 2.8, 2.6, 0, arch)
  mesh(new THREE.BoxGeometry(6.3, 0.8, 0.9), toon('#4d4868'), 0, 5.4, 0, arch)
  const sign = mesh(new THREE.PlaneGeometry(5, 0.7), new THREE.MeshBasicMaterial({ map: canvasTexture('vault-sign', 512, 72, c => {
    c.fillStyle = '#1b1838'
    c.fillRect(0, 0, 512, 72)
    c.fillStyle = '#c58cff'
    c.font = '54px Bangers, Impact, sans-serif'
    c.textAlign = 'center'
    c.fillText('THE UNDERHALL  -  KEEP OUT', 256, 56)
  }), toneMapped: false }), 0, 5.4, 0.46, arch)
  void sign
  outline(arch, 0.04)
  arch.position.set(markers.V.x, 0, markers.V.z - 1.3)
  g.add(arch)
  level.animate(portal.swirl, 'spin', 0)
  // Wall props: development board (west), codex case (east), notice (west), rescue wall (east).
  const board = (pos: THREE.Vector3, facing: number, title: string, color: string) => {
    const b = new THREE.Group()
    mesh(new THREE.BoxGeometry(3.2, 2.2, 0.25), toon('#6b4a2e'), 0, 1.9, 0, b)
    const face = mesh(new THREE.PlaneGeometry(2.9, 1.9), new THREE.MeshBasicMaterial({ map: canvasTexture(`board:${title}`, 290, 190, c => {
      c.fillStyle = color
      c.fillRect(0, 0, 290, 190)
      c.fillStyle = '#fff4d8'
      c.font = '40px Bangers, Impact, sans-serif'
      c.textAlign = 'center'
      c.fillText(title, 145, 52)
      c.fillStyle = 'rgba(255,255,255,0.8)'
      for (let i = 0; i < 4; i += 1) c.fillRect(30, 80 + i * 24, 150 + ((i * 37) % 80), 8)
    }), toneMapped: false }), 0, 1.9, 0.13, b)
    void face
    const lamp = mesh(new THREE.SphereGeometry(0.18, 10, 8), glow(color), 0, 3.25, 0.2, b)
    void lamp
    outline(b, 0.03)
    b.position.copy(pos)
    b.rotation.y = facing
    g.add(b)
    level.circles.push({ x: pos.x, z: pos.z, r: 1.1 })
  }
  board(markers.B.clone().setX(markers.B.x - 0.75), Math.PI / 2, 'HERO DEVELOPMENT', '#2d3fae')
  board(markers.N.clone().setX(markers.N.x - 0.75), Math.PI / 2, 'NOTICE BOARD', '#e8384f')
  board(markers.R.clone().setX(markers.R.x + 0.75), -Math.PI / 2, 'RESCUE WALL', '#3f8f5f')
  // Codex: glass trophy case with relic silhouettes.
  const codex = new THREE.Group()
  mesh(new THREE.BoxGeometry(1.4, 1.0, 3.2), toon('#4a2f1d'), 0, 0.5, 0, codex)
  mesh(new THREE.BoxGeometry(1.3, 1.6, 3.1), new THREE.MeshBasicMaterial({ color: '#b8f5ff', transparent: true, opacity: 0.18, depthWrite: false }), 0, 1.8, 0, codex)
  for (let i = 0; i < 3; i += 1) mesh(new THREE.OctahedronGeometry(0.28, 0), glow(['#ffcf4d', '#c58cff', '#7ef9ff'][i]), 0, 1.6, (i - 1) * 0.9, codex)
  mesh(new THREE.BoxGeometry(1.5, 0.12, 3.3), toon('#ffcf4d'), 0, 2.65, 0, codex)
  outline(codex, 0.03)
  codex.position.copy(markers.C).setX(markers.C.x + 0.4)
  g.add(codex)
  level.circles.push({ x: codex.position.x, z: codex.position.z - 0.9, r: 0.9 }, { x: codex.position.x, z: codex.position.z + 0.9, r: 0.9 })
  // Night sky: stars and a big comic moon above the open atrium.
  const starGeo = new THREE.BufferGeometry()
  const pts: number[] = []
  for (let i = 0; i < 400; i += 1) {
    const a = Math.random() * Math.PI * 2
    const e = 0.25 + Math.random() * 1.1
    pts.push(markers.A.x + Math.cos(a) * Math.cos(e) * 90, 20 + Math.sin(e) * 70, markers.A.z + Math.sin(a) * Math.cos(e) * 90)
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff4c2', size: 0.6, sizeAttenuation: true, fog: false })))
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: '#fff0b3', toneMapped: false, fog: false }))
  moon.position.set(markers.A.x - 40, 55, markers.A.z - 70)
  moon.lookAt(markers.A.x, 0, markers.A.z)
  g.add(moon)
  const rescueSpots = [0, 1, 2, 3, 4, 5].map(i => new THREE.Vector3(markers.R.x - 2.2 - (i % 2) * 1.6, 0, markers.R.z - 3.6 + Math.floor(i / 2) * 1.8))
  return { portal, rescueSpots }
}
