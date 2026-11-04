import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { ICO1, canvasTexture, grain, lumpy } from './geo'
import type { PieceId, Station } from './items'
import { mulberry32 } from './noise'
import { DOOR, PIECES, WINDOW, pieceBox, type Piece, type Placement } from './pieces'
import { loadSlots, serializeSlots, type SavedSlots, type Slot } from './inventory'
import type { PieceQuery } from './physics'
import { ckey } from './terrain'
import { TEX } from './materials'

const PIECE_IDS = Object.keys(PIECES) as PieceId[]
const CELL = 4

type Mats = {
  stone: THREE.MeshStandardMaterial
  brick: THREE.MeshStandardMaterial
  plank: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  fiber: THREE.MeshStandardMaterial
  fire: THREE.MeshBasicMaterial
  fireCore: THREE.MeshBasicMaterial
  crystal: THREE.MeshStandardMaterial
  shingle: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  brass: THREE.MeshStandardMaterial
  chest: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  deck: THREE.MeshStandardMaterial
  petal: THREE.MeshStandardMaterial
  leafy: THREE.MeshStandardMaterial
}

let MATS: Mats | null = null
function mats(): Mats {
  if (MATS) return MATS
  const planks = (vertical: boolean) => canvasTexture(256, (ctx, s) => {
    const boards = 4
    const bw = s / boards
    for (let i = 0; i < boards; i++) {
      const tone = 150 + Math.random() * 40
      ctx.fillStyle = `rgb(${tone + 30},${tone - 5},${tone - 60})`
      if (vertical) ctx.fillRect(i * bw, 0, bw, s)
      else ctx.fillRect(0, i * bw, s, bw)
      ctx.strokeStyle = 'rgba(80,50,25,0.35)'
      ctx.lineWidth = 1
      for (let k = 0; k < 7; k++) {
        ctx.beginPath()
        const off = i * bw + 4 + Math.random() * (bw - 8)
        for (let t = 0; t <= s; t += 16) {
          const w = Math.sin(t * 0.03 + k) * 2
          if (vertical) ctx.lineTo(off + w, t)
          else ctx.lineTo(t, off + w)
        }
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(40,25,12,0.8)'
      if (vertical) ctx.fillRect(i * bw, 0, 2, s)
      else ctx.fillRect(0, i * bw, s, 2)
    }
    grain(ctx, s, 0.88, 1, 3)
  })
  const stoneTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#a19b8f'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 260; i++) {
      const g = 120 + Math.random() * 70
      ctx.fillStyle = `rgba(${g},${g - 4},${g - 12},0.25)`
      ctx.beginPath()
      ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 14, 0, Math.PI * 2)
      ctx.fill()
    }
    grain(ctx, s, 0.8, 1, 11)
  })
  const brickTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5f5a52'
    ctx.fillRect(0, 0, s, s)
    const rows = 4
    const rh = s / rows
    for (let r = 0; r < rows; r++) {
      const cols = 3
      const cw = s / cols
      for (let c = -1; c < cols + 1; c++) {
        const x = c * cw + (r % 2 ? cw / 2 : 0)
        const g = 135 + Math.random() * 40
        ctx.fillStyle = `rgb(${g},${g - 5},${g - 14})`
        ctx.beginPath()
        ctx.roundRect(x + 3, r * rh + 3, cw - 6, rh - 6, 8)
        ctx.fill()
      }
    }
    grain(ctx, s, 0.82, 1, 5)
  })
  MATS = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.94, metalness: 0, envMapIntensity: 0.3 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.94 }),
    plank: new THREE.MeshStandardMaterial({ map: TEX.planksAlb, normalMap: TEX.planksNor, color: 0xd8c2a4, roughness: 0.88, metalness: 0, envMapIntensity: 0.35 }),
    wall: new THREE.MeshStandardMaterial({ map: planks(true), roughness: 0.9, metalness: 0, envMapIntensity: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 }),
    fiber: new THREE.MeshStandardMaterial({ color: 0xb4a266, roughness: 1 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xe0782a, transparent: true, opacity: 0.55, depthWrite: false }),
    fireCore: new THREE.MeshBasicMaterial({ color: 0xf0c070, transparent: true, opacity: 0.8 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x79d0c4, emissive: 0x3fc9b8, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0 }),
    shingle: new THREE.MeshStandardMaterial({ map: TEX.planksAlb, normalMap: TEX.planksNor, color: 0x9a6a4e, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 }),
    // Forged iron and brass stay rough so they read as metal without glare.
    iron: new THREE.MeshStandardMaterial({ color: 0x3b3834, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9c7b48, roughness: 0.5, metalness: 0.45, envMapIntensity: 0.4 }),
    chest: new THREE.MeshStandardMaterial({ map: TEX.planksAlb, normalMap: TEX.planksNor, color: 0xc49a70, roughness: 0.86, metalness: 0, envMapIntensity: 0.3 }),
    // Faint, rough pane: reads as glass without mirror glare.
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe8e4, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 0.25 }),
    deck: new THREE.MeshStandardMaterial({ map: TEX.planksAlb, color: 0xb89a7c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 }),
    petal: new THREE.MeshStandardMaterial({ color: 0xe9a0b4, roughness: 0.85, metalness: 0 }),
    leafy: new THREE.MeshStandardMaterial({ color: 0x7fae5a, roughness: 0.9, metalness: 0 }),
  }
  return MATS
}

const G = {
  block: new RoundedBoxGeometry(1, 1, 1, 4, 0.2),
  foundation: new RoundedBoxGeometry(2, 1, 2, 3, 0.09),
  floor: new RoundedBoxGeometry(2, 0.16, 2, 2, 0.04),
  panel: new RoundedBoxGeometry(1.9, 2.3, 0.12, 2, 0.04),
  beam: new RoundedBoxGeometry(2, 0.14, 0.2, 2, 0.05),
  post: new RoundedBoxGeometry(0.16, 2.4, 0.2, 2, 0.05),
  pillar: new THREE.CylinderGeometry(0.15, 0.17, 2.4, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  flame: new THREE.ConeGeometry(1, 1, 9).translate(0, 0.5, 0),
  benchTop: new RoundedBoxGeometry(1.6, 0.12, 0.8, 2, 0.04),
  leg: new RoundedBoxGeometry(0.12, 0.84, 0.12, 2, 0.03),
  shelf: new RoundedBoxGeometry(1.4, 0.06, 0.62, 2, 0.02),
  gem: new THREE.OctahedronGeometry(0.2, 0),
  jamb: new RoundedBoxGeometry(1 - DOOR.half - 0.02, 2.3, 0.12, 2, 0.04),
  lintel: new RoundedBoxGeometry(DOOR.half * 2 + 0.04, 2.4 - DOOR.height - 0.02, 0.12, 2, 0.03),
  framePost: new RoundedBoxGeometry(0.09, DOOR.height, 0.17, 2, 0.03),
  header: new RoundedBoxGeometry(DOOR.half * 2 + 0.18, 0.1, 0.17, 2, 0.03),
  leaf: new RoundedBoxGeometry(DOOR.half * 2 - 0.03, DOOR.height - 0.05, 0.07, 2, 0.02),
  ledge: new RoundedBoxGeometry(DOOR.half * 2 - 0.12, 0.13, 0.03, 2, 0.012),
  brace: new RoundedBoxGeometry(0.11, 1.3, 0.028, 2, 0.01),
  strap: new RoundedBoxGeometry(0.42, 0.05, 0.012, 1, 0.005),
  ring: new THREE.TorusGeometry(0.045, 0.011, 6, 14),
  roofDeck: new RoundedBoxGeometry(2.14, 0.07, 2.62, 2, 0.02),
  shingleRow: new RoundedBoxGeometry(2.18, 0.045, 0.42, 2, 0.015),
  rafter: new RoundedBoxGeometry(0.1, 0.14, 2.6, 2, 0.03),
  ridge: new THREE.CylinderGeometry(0.075, 0.075, 2.2, 10).rotateZ(Math.PI / 2),
  chestBody: new RoundedBoxGeometry(0.96, 0.5, 0.58, 3, 0.04),
  chestLid: (() => {
    // Barrel-top lid: a half cylinder capped onto a thin box, hinge at the back edge.
    const g = new THREE.CylinderGeometry(0.29, 0.29, 0.96, 16, 1, false, 0, Math.PI)
    g.rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.62, 1)
    return g
  })(),
  band: new RoundedBoxGeometry(0.06, 0.52, 0.6, 1, 0.01),
  lidBand: new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.62, 1),
  latch: new RoundedBoxGeometry(0.12, 0.14, 0.03, 1, 0.01),
  foot: new RoundedBoxGeometry(0.1, 0.05, 0.1, 1, 0.015),
  halfPanel: new RoundedBoxGeometry(1.9, 1.1, 0.12, 2, 0.04),
  halfPost: new RoundedBoxGeometry(0.16, 1.2, 0.2, 2, 0.05),
  rail: new RoundedBoxGeometry(2.04, 0.1, 0.26, 2, 0.045),
  winSide: new RoundedBoxGeometry(1 - WINDOW.half - 0.06, 2.3, 0.12, 2, 0.04),
  winSill: new RoundedBoxGeometry(WINDOW.half * 2 + 0.04, WINDOW.sill - 0.06, 0.12, 2, 0.03),
  winHead: new RoundedBoxGeometry(WINDOW.half * 2 + 0.04, 2.4 - WINDOW.head - 0.08, 0.12, 2, 0.03),
  winFrameV: new RoundedBoxGeometry(0.08, WINDOW.head - WINDOW.sill + 0.08, 0.17, 2, 0.025),
  winFrameH: new RoundedBoxGeometry(WINDOW.half * 2 + 0.16, 0.08, 0.17, 2, 0.025),
  winMullion: new RoundedBoxGeometry(0.035, WINDOW.head - WINDOW.sill, 0.05, 1, 0.012),
  winTransom: new RoundedBoxGeometry(WINDOW.half * 2, 0.035, 0.05, 1, 0.012),
  pane: new THREE.PlaneGeometry(WINDOW.half * 2, WINDOW.head - WINDOW.sill),
  sillLedge: new RoundedBoxGeometry(WINDOW.half * 2 + 0.3, 0.06, 0.26, 2, 0.02),
  planter: new RoundedBoxGeometry(WINDOW.half * 2 + 0.1, 0.18, 0.2, 2, 0.04),
  bloom: new THREE.IcosahedronGeometry(0.05, 1),
  gable: (() => {
    const rise = 1.1
    const shape = new THREE.Shape([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, rise)])
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 })
    g.translate(0, 0, -0.05)
    // Shape UVs are in metres; match the wall board texture's 1.9 m repeat.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.9 + 0.5, uv.getY(i) / 2.3)
    g.computeVertexNormals()
    return g
  })(),
  capBoard: new RoundedBoxGeometry(2.14, 0.05, 0.36, 2, 0.018),
  capLog: new THREE.CylinderGeometry(0.085, 0.085, 2.16, 12).rotateZ(Math.PI / 2),
  capEnd: new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).rotateZ(Math.PI / 2),
  ramp: (() => {
    const shape = new THREE.Shape([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1.2), new THREE.Vector2(-1, 0.06)])
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.92, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 })
    g.translate(0, 0, -0.96).rotateY(-Math.PI / 2)
    g.computeVertexNormals()
    return g
  })(),
}

export type Animated = { obj: THREE.Object3D; kind: 'flame' | 'gem' | 'door' | 'lid'; phase: number }

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.castShadow = shadow
  o.receiveShadow = true
  return o
}

/** Procedural model for a piece, with its bottom centre at the origin. */
export function makePieceObject(id: PieceId, seed = 1, anim?: Animated[]): THREE.Group {
  const M = mats()
  const g = new THREE.Group()
  const rnd = mulberry32(seed)
  switch (id) {
    case 'stone_block':
      g.add(mesh(G.block, M.stone, 0, 0.5, 0))
      break
    case 'foundation':
      g.add(mesh(G.foundation, M.brick, 0, 0.5, 0))
      break
    case 'wood_floor':
      g.add(mesh(G.floor, M.plank, 0, 0.08, 0))
      break
    case 'wood_wall':
      g.add(mesh(G.panel, M.wall, 0, 1.2, 0))
      g.add(mesh(G.beam, M.dark, 0, 0.07, 0))
      g.add(mesh(G.beam, M.dark, 0, 2.33, 0))
      g.add(mesh(G.post, M.dark, -0.92, 1.2, 0))
      g.add(mesh(G.post, M.dark, 0.92, 1.2, 0))
      break
    case 'wood_ramp':
      g.add(mesh(G.ramp, M.plank))
      break
    case 'wood_pillar':
      g.add(mesh(G.pillar, M.dark, 0, 1.2, 0))
      break
    case 'campfire': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const s = mesh(lumpy(ICO1, rnd, 0.3), M.stone, Math.cos(a) * 0.46, 0.08, Math.sin(a) * 0.46)
        s.scale.set(0.16, 0.12, 0.14)
        g.add(s)
      }
      for (let i = 0; i < 4; i++) {
        const log = mesh(G.cyl, M.dark, 0, 0.18, 0)
        log.scale.set(0.055, 0.62, 0.055)
        log.rotation.set(0.55, (i / 4) * Math.PI * 2, 0, 'YXZ')
        g.add(log)
      }
      const f = new THREE.Group()
      f.position.y = 0.05
      const outer = mesh(G.flame, M.fire, 0, 0, 0, false)
      outer.scale.set(0.2, 0.62, 0.2)
      const inner = mesh(G.flame, M.fireCore, 0, 0, 0, false)
      inner.scale.set(0.1, 0.36, 0.1)
      f.add(outer, inner)
      g.add(f)
      anim?.push({ obj: f, kind: 'flame', phase: rnd() * 10 })
      break
    }
    case 'workbench':
      g.add(mesh(G.benchTop, M.plank, 0, 0.89, 0))
      for (const [x, z] of [[-0.7, -0.32], [0.7, -0.32], [-0.7, 0.32], [0.7, 0.32]]) g.add(mesh(G.leg, M.dark, x, 0.42, z))
      g.add(mesh(G.shelf, M.plank, 0, 0.25, 0))
      {
        const handle = mesh(G.cyl, M.dark, 0.35, 0.99, 0.05)
        handle.scale.set(0.025, 0.4, 0.025)
        handle.rotation.z = Math.PI / 2
        const head = mesh(G.block, M.stone, 0.12, 0.99, 0.05)
        head.scale.set(0.09, 0.12, 0.16)
        g.add(handle, head)
      }
      break
    case 'torch': {
      const stick = mesh(G.cyl, M.dark, 0, 0.45, 0)
      stick.scale.set(0.035, 0.9, 0.035)
      const head = mesh(G.cyl, M.fiber, 0, 0.93, 0)
      head.scale.set(0.065, 0.14, 0.065)
      const f = new THREE.Group()
      f.position.y = 0.98
      const outer = mesh(G.flame, M.fire, 0, 0, 0, false)
      outer.scale.set(0.08, 0.26, 0.08)
      const inner = mesh(G.flame, M.fireCore, 0, 0, 0, false)
      inner.scale.set(0.04, 0.15, 0.04)
      f.add(outer, inner)
      g.add(stick, head, f)
      anim?.push({ obj: f, kind: 'flame', phase: rnd() * 10 })
      break
    }
    case 'lamp': {
      const base = mesh(G.cyl, M.stone, 0, 0.15, 0)
      base.scale.set(0.27, 0.3, 0.27)
      const neck = mesh(G.cyl, M.stone, 0, 0.36, 0)
      neck.scale.set(0.1, 0.14, 0.1)
      const gem = mesh(G.gem, M.crystal, 0, 0.66, 0, false)
      g.add(base, neck, gem)
      anim?.push({ obj: gem, kind: 'gem', phase: rnd() * 10 })
      break
    }
    case 'wood_door': {
      // Frame: side panels and lintel match the wall; dark posts outline the opening.
      const side = 1 - (1 - DOOR.half) / 2
      g.add(mesh(G.jamb, M.wall, -side, 1.2, 0), mesh(G.jamb, M.wall, side, 1.2, 0), mesh(G.lintel, M.wall, 0, (2.4 + DOOR.height) / 2, 0))
      g.add(mesh(G.beam, M.dark, 0, 2.33, 0), mesh(G.post, M.dark, -0.92, 1.2, 0), mesh(G.post, M.dark, 0.92, 1.2, 0))
      g.add(mesh(G.framePost, M.dark, -DOOR.half - 0.02, DOOR.height / 2, 0), mesh(G.framePost, M.dark, DOOR.half + 0.02, DOOR.height / 2, 0), mesh(G.header, M.dark, 0, DOOR.height + 0.03, 0))
      // Leaf on a hinge at the left of the opening; rotation.y swings it (see Building.animate).
      const hinge = new THREE.Group()
      hinge.position.set(-DOOR.half + 0.01, 0, 0)
      const w = DOOR.half - 0.01
      hinge.add(mesh(G.leaf, M.wall, w, DOOR.height / 2, 0))
      for (const sz of [-1, 1]) {
        for (const y of [0.42, DOOR.height - 0.42]) hinge.add(mesh(G.ledge, M.dark, w, y, sz * 0.048))
        const brace = mesh(G.brace, M.dark, w, DOOR.height / 2, sz * 0.048)
        brace.rotation.z = sz * 0.72
        hinge.add(brace)
      }
      for (const y of [0.42, DOOR.height - 0.42]) for (const sz of [-1, 1]) hinge.add(mesh(G.strap, M.iron, 0.2, y, sz * 0.067, false))
      for (const sz of [-1, 1]) {
        const ring = mesh(G.ring, M.iron, w * 2 - 0.13, 1.02, sz * 0.075, false)
        g.userData.ring = ring
        hinge.add(ring)
      }
      g.add(hinge)
      anim?.push({ obj: hinge, kind: 'door', phase: 0 })
      break
    }
    case 'wood_roof': {
      // Deck and shingle courses tilted up toward local +z; the low edge overhangs as an eave.
      const rise = PIECES.wood_roof.size[1]
      const run = PIECES.wood_roof.size[2]
      const a = Math.atan2(rise, run)
      const slope = new THREE.Group()
      slope.position.set(0, rise / 2, 0)
      slope.rotation.x = -a
      const len = Math.hypot(rise, run)
      slope.add(mesh(G.roofDeck, M.plank, 0, -0.035, -0.12))
      const rows = 7
      for (let i = 0; i < rows; i++) {
        const t = -len / 2 - 0.28 + (i + 0.5) * ((len + 0.2) / rows)
        const row = mesh(G.shingleRow, M.shingle, (rnd() - 0.5) * 0.04, 0.03 + i * 0.002, t)
        row.rotation.x = 0.07
        row.scale.x = 1 + (rnd() - 0.5) * 0.02
        slope.add(row)
      }
      for (const x of [-0.95, 0.95]) slope.add(mesh(G.rafter, M.dark, x, -0.1, -0.12))
      g.add(slope)
      g.add(mesh(G.ridge, M.dark, 0, rise + 0.02, run / 2 - 0.02))
      break
    }
    case 'half_wall':
      g.add(mesh(G.halfPanel, M.wall, 0, 0.6, 0))
      g.add(mesh(G.beam, M.dark, 0, 0.07, 0))
      g.add(mesh(G.halfPost, M.dark, -0.92, 0.6, 0), mesh(G.halfPost, M.dark, 0.92, 0.6, 0))
      g.add(mesh(G.rail, M.dark, 0, 1.17, 0))
      break
    case 'wood_window': {
      const { half, sill, head } = WINDOW
      const side = 1 - (1 - half) / 2 - 0.03
      g.add(mesh(G.winSide, M.wall, -side, 1.2, 0), mesh(G.winSide, M.wall, side, 1.2, 0))
      g.add(mesh(G.winSill, M.wall, 0, (sill - 0.02) / 2 + 0.02, 0), mesh(G.winHead, M.wall, 0, (2.4 + head) / 2, 0))
      g.add(mesh(G.beam, M.dark, 0, 0.07, 0), mesh(G.beam, M.dark, 0, 2.33, 0), mesh(G.post, M.dark, -0.92, 1.2, 0), mesh(G.post, M.dark, 0.92, 1.2, 0))
      const mid = (sill + head) / 2
      g.add(mesh(G.winFrameV, M.dark, -half - 0.02, mid, 0), mesh(G.winFrameV, M.dark, half + 0.02, mid, 0))
      g.add(mesh(G.winFrameH, M.dark, 0, sill - 0.02, 0), mesh(G.winFrameH, M.dark, 0, head + 0.02, 0))
      g.add(mesh(G.winMullion, M.dark, 0, mid, 0, false), mesh(G.winTransom, M.dark, 0, mid, 0, false))
      g.add(mesh(G.pane, M.glass, 0, mid, 0, false))
      // Outside (+z): a ledge and a little planter of blooms.
      g.add(mesh(G.sillLedge, M.dark, 0, sill - 0.07, 0.1))
      g.add(mesh(G.planter, M.plank, 0, sill - 0.2, 0.19))
      for (let i = 0; i < 7; i++) {
        const x = -half + 0.08 + (i / 6) * (half * 2 - 0.16)
        const leaf = mesh(G.bloom, M.leafy, x + (rnd() - 0.5) * 0.04, sill - 0.08, 0.19 + (rnd() - 0.5) * 0.06, false)
        leaf.scale.set(1.5, 0.9, 1.3)
        g.add(leaf)
        if (i % 2 === 0) g.add(mesh(G.bloom, M.petal, x, sill - 0.02 + rnd() * 0.04, 0.2 + (rnd() - 0.5) * 0.05, false))
      }
      break
    }
    case 'gable_wall': {
      g.add(mesh(G.gable, M.wall))
      const rise = PIECES.gable_wall.size[1]
      const len = Math.hypot(2, rise)
      const edge = mesh(G.beam, M.dark, 0, rise / 2, 0)
      edge.scale.x = len / 2
      edge.rotation.z = Math.atan2(rise, 2)
      g.add(edge, mesh(G.beam, M.dark, 0, 0.07, 0))
      const post = mesh(G.post, M.dark, 0.92, rise / 2, 0)
      post.scale.y = rise / 2.4
      g.add(post)
      break
    }
    case 'ridge_cap': {
      // Inverted-V capping boards following the roof pitch, with a rounded ridge log on top.
      const a = Math.atan2(PIECES.wood_roof.size[1], PIECES.wood_roof.size[2])
      for (const sz of [-1, 1]) {
        const b = mesh(G.capBoard, M.shingle, 0, 0.1 - Math.sin(a) * 0.09, sz * 0.15)
        b.rotation.x = sz * a
        g.add(b)
      }
      g.add(mesh(G.capLog, M.dark, 0, 0.19, 0))
      for (const x of [-1.08, 1.08]) g.add(mesh(G.capEnd, M.dark, x, 0.19, 0, false))
      break
    }
    case 'roof_corner': {
      const rise = PIECES.roof_corner.size[1]
      g.add(hipFace(M, rise, false), hipFace(M, rise, true))
      // Hip rafter along the diagonal seam from the low outer corner to the peak.
      const from = new THREE.Vector3(-1, 0.04, -1)
      const to = new THREE.Vector3(1, rise + 0.04, 1)
      const dir = to.clone().sub(from)
      const hip = mesh(G.rafter, M.dark)
      hip.scale.z = dir.length() / 2.6
      hip.position.copy(from).addScaledVector(dir, 0.5)
      hip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize())
      g.add(hip)
      break
    }
    case 'storage_chest': {
      for (const [x, z] of [[-0.42, -0.23], [0.42, -0.23], [-0.42, 0.23], [0.42, 0.23]]) g.add(mesh(G.foot, M.iron, x, 0.025, z, false))
      g.add(mesh(G.chestBody, M.chest, 0, 0.3, 0))
      for (const x of [-0.3, 0.3]) g.add(mesh(G.band, M.iron, x, 0.3, 0))
      g.add(mesh(G.latch, M.brass, 0, 0.5, 0.3, false))
      // Lid hinges on the back top edge; rotation.x < 0 lifts the front.
      const lid = new THREE.Group()
      lid.position.set(0, 0.55, -0.29)
      lid.add(mesh(G.chestLid, M.chest, 0, 0, 0.29))
      for (const x of [-0.3, 0.3]) {
        const b = mesh(G.lidBand, M.iron, x, 0, 0.29, false)
        b.scale.set(1, 1.04, 1.04)
        lid.add(b)
      }
      const clasp = mesh(G.latch, M.brass, 0, 0.02, 0.585, false)
      clasp.scale.set(0.8, 0.7, 1)
      lid.add(clasp)
      g.add(lid)
      anim?.push({ obj: lid, kind: 'lid', phase: 0 })
      break
    }
  }
  return g
}

/**
 * One sloped face of a hip corner, in a frame where it rises toward +z. The face covers the
 * triangle below the diagonal hip (x ≥ z, or x ≤ −z when mirrored); shingle courses are
 * trimmed to the hip line so both faces meet cleanly under the hip rafter.
 */
function hipFace(M: Mats, rise: number, mirror: boolean): THREE.Group {
  const root = new THREE.Group()
  if (mirror) root.rotation.y = Math.PI / 2
  const sx = mirror ? -1 : 1
  const run = 2
  const a = Math.atan2(rise, run)
  const len = Math.hypot(rise, run)
  // Deck: a double-sided triangle just below the shingles.
  const v = [-1 * sx, -0.03, -1, 1 * sx, -0.03, -1, 1 * sx, rise - 0.03, 1]
  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2))
  tri.computeVertexNormals()
  root.add(mesh(tri, M.deck))
  const slope = new THREE.Group()
  slope.position.set(0, rise / 2, 0)
  slope.rotation.x = -a
  const rows = 7
  for (let i = 0; i < rows; i++) {
    const t = -len / 2 + (i + 0.5) * (len / rows)
    const lz = (t / len) * run // horizontal position of this course
    const w = Math.max(0.12, 1 - lz)
    const row = mesh(G.shingleRow, M.shingle, sx * (1 - w / 2), 0.03 + i * 0.002, t)
    row.scale.x = w / 2.18
    row.rotation.x = 0.07
    slope.add(row)
  }
  root.add(slope)
  return root
}

/**
 * Placed build pieces: storage, a 4 m spatial hash for physics/targeting queries, scene
 * objects, animated flames and the translucent placement preview.
 */
export class Building implements PieceQuery {
  readonly group = new THREE.Group()
  readonly pieces = new Map<number, Piece>()
  private objects = new Map<number, THREE.Object3D>()
  private cells = new Map<number, Set<number>>()
  private anim = new Map<number, Animated[]>()
  private ghosts = new Map<PieceId, THREE.Group>()
  private ghostOk = new THREE.MeshBasicMaterial({ color: 0x9fd67a, transparent: true, opacity: 0.42, depthWrite: false })
  private ghostBad = new THREE.MeshBasicMaterial({ color: 0xd9644a, transparent: true, opacity: 0.42, depthWrite: false })
  private activeGhost: THREE.Group | null = null
  private nextUid = 1
  /** Chest contents by piece uid. */
  readonly stores = new Map<number, Slot[]>()
  /** Chests whose lid is currently open (UI showing them). */
  readonly openLids = new Set<number>()

  private cellKey(x: number, z: number): number {
    return ckey(Math.floor(x / CELL), Math.floor(z / CELL))
  }

  add(id: PieceId, p: Placement, hp = PIECES[id].hp): Piece {
    const piece: Piece = { uid: this.nextUid++, id, x: p.x, y: p.y, z: p.z, rot: p.rot, hp }
    if (PIECES[id].door) piece.open = 0
    this.pieces.set(piece.uid, piece)
    const cap = PIECES[id].storage
    if (cap) this.stores.set(piece.uid, new Array(cap).fill(null))
    const k = this.cellKey(p.x, p.z)
    let set = this.cells.get(k)
    if (!set) this.cells.set(k, (set = new Set()))
    set.add(piece.uid)
    const list: Animated[] = []
    const obj = makePieceObject(id, piece.uid * 7919, list)
    obj.position.set(p.x, p.y, p.z)
    obj.rotation.y = (p.rot * Math.PI) / 2
    this.group.add(obj)
    this.objects.set(piece.uid, obj)
    if (list.length) this.anim.set(piece.uid, list)
    return piece
  }

  remove(uid: number): Piece | undefined {
    const p = this.pieces.get(uid)
    if (!p) return undefined
    this.pieces.delete(uid)
    this.cells.get(this.cellKey(p.x, p.z))?.delete(uid)
    const obj = this.objects.get(uid)
    if (obj) this.group.remove(obj)
    this.objects.delete(uid)
    this.anim.delete(uid)
    this.stores.delete(uid)
    this.openLids.delete(uid)
    return p
  }

  object(uid: number): THREE.Object3D | undefined {
    return this.objects.get(uid)
  }

  clear(): void {
    for (const uid of [...this.pieces.keys()]) this.remove(uid)
    this.nextUid = 1
  }

  near(x: number, z: number, r: number, out: Piece[] = []): Piece[] {
    out.length = 0
    const rr = r + 1.5
    const c0x = Math.floor((x - rr) / CELL)
    const c1x = Math.floor((x + rr) / CELL)
    const c0z = Math.floor((z - rr) / CELL)
    const c1z = Math.floor((z + rr) / CELL)
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const set = this.cells.get(ckey(cx, cz))
        if (!set) continue
        for (const uid of set) {
          const p = this.pieces.get(uid)!
          const b = pieceBox(p)
          const dx = Math.max(b.minX - x, 0, x - b.maxX)
          const dz = Math.max(b.minZ - z, 0, z - b.maxZ)
          if (dx * dx + dz * dz <= r * r) out.push(p)
        }
      }
    }
    return out
  }

  /** Stations (workbench, campfire) within `r` of a point. */
  stationsNear(x: number, y: number, z: number, r: number): Set<Station> {
    const out = new Set<Station>()
    for (const p of this.near(x, z, r)) {
      const st = PIECES[p.id].station
      if (st && Math.abs(p.y - y) < 3) out.add(st)
    }
    return out
  }

  /** Night-creature wards: campfires, torches and lamps. */
  wards(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = []
    for (const p of this.pieces.values()) {
      const w = PIECES[p.id].ward
      if (w) out.push({ x: p.x, z: p.z, r: w })
    }
    return out
  }

  lightSources(): Piece[] {
    const out: Piece[] = []
    for (const p of this.pieces.values()) if (PIECES[p.id].light) out.push(p)
    return out
  }

  showGhost(id: PieceId | null, p?: Placement, valid = true): void {
    if (this.activeGhost && (!id || this.activeGhost !== this.ghosts.get(id))) {
      this.activeGhost.visible = false
      this.activeGhost = null
    }
    if (!id || !p) return
    let ghost = this.ghosts.get(id)
    if (!ghost) {
      ghost = makePieceObject(id, 3)
      ghost.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false
          o.receiveShadow = false
          o.renderOrder = 5
        }
      })
      this.ghosts.set(id, ghost)
      this.group.add(ghost)
    }
    const m = valid ? this.ghostOk : this.ghostBad
    ghost.traverse(o => {
      if (o instanceof THREE.Mesh) o.material = m
    })
    ghost.visible = true
    ghost.position.set(p.x, p.y, p.z)
    ghost.rotation.y = (p.rot * Math.PI) / 2
    const pulse = 0.34 + Math.sin(performance.now() * 0.006) * 0.08
    m.opacity = pulse
    this.activeGhost = ghost
  }

  /** Toggle a door; `side` is the local ±z side it swings toward. */
  setDoor(uid: number, open: number): void {
    const p = this.pieces.get(uid)
    if (p && PIECES[p.id].door) p.open = Math.sign(open)
  }

  animate(time: number, dt = 1 / 60): void {
    for (const [uid, list] of this.anim) {
      for (const a of list) {
        if (a.kind === 'door') {
          const open = this.pieces.get(uid)?.open ?? 0
          const target = -open * Math.PI * 0.5
          const cur = a.obj.rotation.y
          // Critically damped swing with a slight settle overshoot.
          a.phase += ((target - cur) * 90 - a.phase * 15) * Math.min(dt, 0.05)
          a.obj.rotation.y = cur + a.phase * Math.min(dt, 0.05)
          continue
        }
        if (a.kind === 'lid') {
          const target = this.openLids.has(uid) ? -1.15 : 0
          a.obj.rotation.x += (target - a.obj.rotation.x) * Math.min(1, dt * 12)
          continue
        }
        if (a.kind === 'flame') {
          const f = 1 + Math.sin(time * 13 + a.phase) * 0.09 + Math.sin(time * 23 + a.phase * 2) * 0.06
          a.obj.scale.set(1 + Math.sin(time * 9 + a.phase) * 0.05, f, 1)
          a.obj.rotation.y = time * 0.8 + a.phase
        } else {
          a.obj.rotation.y = time * 0.6 + a.phase
          a.obj.position.y = 0.66 + Math.sin(time * 1.6 + a.phase) * 0.03
        }
      }
    }
  }

  serialize(): number[][] {
    const r = (v: number) => Math.round(v * 1000) / 1000
    return [...this.pieces.values()].map(p => {
      const e = [PIECE_IDS.indexOf(p.id), r(p.x), r(p.y), r(p.z), p.rot, Math.round(p.hp * 10) / 10]
      if (p.open) e.push(p.open)
      return e
    })
  }

  /** Chest contents keyed by the piece's index in `serialize()` order. */
  serializeStores(): [number, SavedSlots][] {
    const out: [number, SavedSlots][] = []
    let i = 0
    for (const p of this.pieces.values()) {
      const st = this.stores.get(p.uid)
      if (st && st.some(Boolean)) out.push([i, serializeSlots(st)])
      i++
    }
    return out
  }

  loadStores(data: unknown): void {
    if (!Array.isArray(data)) return
    const list = [...this.pieces.values()]
    for (const e of data) {
      if (!Array.isArray(e)) continue
      const p = list[Number(e[0])]
      const cap = p && PIECES[p.id].storage
      if (cap) this.stores.set(p.uid, loadSlots(e[1], cap))
    }
  }

  load(data: unknown): void {
    this.clear()
    if (!Array.isArray(data)) return
    for (const e of data.slice(0, 20000)) {
      if (!Array.isArray(e) || e.length < 5) continue
      const id = PIECE_IDS[Number(e[0])]
      const [x, y, z, rot] = [Number(e[1]), Number(e[2]), Number(e[3]), Number(e[4])]
      if (!id || ![x, y, z].every(Number.isFinite) || !(rot >= 0 && rot <= 3)) continue
      const hp = Number(e[5])
      const piece = this.add(id, { x, y, z, rot: Math.floor(rot) }, Number.isFinite(hp) && hp > 0 ? Math.min(hp, PIECES[id].hp) : PIECES[id].hp)
      if (PIECES[id].door && (e[6] === 1 || e[6] === -1)) {
        piece.open = e[6]
        const hinge = this.anim.get(piece.uid)?.find(a => a.kind === 'door')
        if (hinge) hinge.obj.rotation.y = -(piece.open ?? 0) * Math.PI * 0.5
      }
    }
  }
}
