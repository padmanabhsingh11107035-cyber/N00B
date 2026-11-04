import { CONFIG } from './config'
import { bucketAt, railY, slopeY, topAt, type Hazard, type Level, type Platform } from './level'

/**
 * Deterministic, render-free rider simulation. One `stepSim` call advances a fixed step; the
 * scene reads the state, the autopilot test clones it to search ahead. Hazard motion is a pure
 * function of `state.t`, which restarts at every respawn so each checkpoint plays the same way.
 */
const S = CONFIG.sim
const P = CONFIG.player

export type DeathCause = 'hazard' | 'wall' | 'fall' | 'avalanche'
export type SimInput = { steer: number; brake: boolean; jumpPressed: boolean; jumpHeld: boolean; slamPressed: boolean }
export type Rider = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  speed: number
  /** Forward speed multiplier from braking (1 = none). */
  brake: number
  boost: number
  grounded: boolean
  plat: number
  rail: number
  coyote: number
  jumpBuf: number
  /** Slam pressed shortly before leaving the ground fires on take-off. */
  slamBuf: number
  slam: boolean
  air: number
}
export type SimState = {
  t: number
  p: Rider
  wallZ: number
  crumble: Map<number, number>
  cp: number
  section: number
  dead: DeathCause | null
  finished: boolean
}
export type SimEvent =
  | { type: 'jump' | 'slam' | 'boost' | 'finish' | 'grindEnd' }
  | { type: 'land'; impact: number; slam: boolean }
  | { type: 'grind'; rail: number }
  | { type: 'crumble'; id: number }
  | { type: 'checkpoint' | 'section'; index: number }
  | { type: 'death'; cause: DeathCause; hazard?: number }

export const NO_INPUT: SimInput = { steer: 0, brake: false, jumpPressed: false, jumpHeld: false, slamPressed: false }

export function baseSpeed(l: Level, z: number): number {
  const k = Math.min(1, Math.max(0, z / l.length))
  return S.baseSpeedStart + (S.baseSpeedEnd - S.baseSpeedStart) * k
}

export function platformX(p: Platform, t: number): number {
  return p.move ? p.x + p.move.amp * Math.sin(Math.PI * 2 * p.move.freq * t + p.move.phase) : p.x
}

export function crumbleFallen(s: SimState, p: Platform): boolean {
  if (p.kind !== 'crumble') return false
  const at = s.crumble.get(p.id)
  return at !== undefined && s.t - at > S.crumbleDelay
}

export type Pose = { x: number; y: number; z: number; rotY: number; rotZ: number; on: boolean; warn: number }

/** Where a hazard is at time `t` (also used by the renderer, so visuals match collision). */
export function hazardPose(h: Hazard, t: number, out: Pose = { x: 0, y: 0, z: 0, rotY: 0, rotZ: 0, on: true, warn: 0 }): Pose {
  out.x = h.x
  out.y = h.y
  out.z = h.z
  out.rotY = 0
  out.rotZ = 0
  out.on = true
  out.warn = 0
  switch (h.kind) {
    case 'slider':
    case 'gate':
      out.x = h.x + h.amp * Math.sin(Math.PI * 2 * h.freq * t + h.phase)
      break
    case 'pendulum': {
      const a = h.amp * Math.sin(Math.PI * 2 * h.freq * t + h.phase)
      out.x = h.x + Math.sin(a) * h.len
      out.y = h.y - Math.cos(a) * h.len
      out.rotZ = a
      break
    }
    case 'spinner':
      out.rotY = h.freq * t + h.phase
      break
    case 'laser':
      if (h.freq > 0) {
        const c = (((h.freq * t + h.phase) % 1) + 1) % 1
        out.on = c < h.duty
        out.warn = out.on ? 0 : Math.max(0, (c - (1 - 0.22)) / 0.22)
      }
      break
  }
  return out
}

const pose: Pose = { x: 0, y: 0, z: 0, rotY: 0, rotZ: 0, on: true, warn: 0 }

export function hazardHits(h: Hazard, t: number, px: number, py: number, pz: number): boolean {
  hazardPose(h, t, pose)
  if (!pose.on) return false
  let dx = px - pose.x
  let dy = py + P.hy - pose.y
  let dz = pz - pose.z
  if (pose.rotY !== 0) {
    const c = Math.cos(pose.rotY)
    const s = Math.sin(pose.rotY)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    dx = lx
    dz = lz
  }
  if (pose.rotZ !== 0) {
    const c = Math.cos(pose.rotZ)
    const s = Math.sin(pose.rotZ)
    const lx = dx * c + dy * s
    const ly = -dx * s + dy * c
    dx = lx
    dy = ly
  }
  return Math.abs(dx) < h.hx + P.hx && Math.abs(dy) < h.hy + P.hy && Math.abs(dz) < h.hz + P.hz
}

export function createSim(l: Level, cp = 0): SimState {
  const s: SimState = {
    t: 0,
    p: { x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 0, brake: 1, boost: 0, grounded: true, plat: -1, rail: -1, coyote: 0, jumpBuf: 0, slamBuf: 0, slam: false, air: 0 },
    wallZ: 0,
    crumble: new Map(),
    cp,
    section: 0,
    dead: null,
    finished: false,
  }
  respawn(s, l)
  return s
}

/** Put the rider back on the current checkpoint and restart the hazard clock. */
export function respawn(s: SimState, l: Level): void {
  const c = l.checkpoints[s.cp]
  const p = s.p
  Object.assign(p, { x: c.x, y: c.y, z: c.z, vx: 0, vy: 0, speed: baseSpeed(l, c.z), brake: 1, boost: 0, grounded: true, plat: -1, rail: -1, coyote: 0, jumpBuf: 0, slamBuf: 0, slam: false, air: 0 })
  s.t = 0
  s.wallZ = c.z - S.wallStartGap
  s.crumble = new Map()
  s.dead = null
  s.finished = false
  s.section = 0
  while (s.section + 1 < l.sections.length && c.z >= l.sections[s.section + 1].z) s.section += 1
  const support = findSupport(s, l, p.y + 0.5, p.y - 1)
  p.plat = support ? support.id : -1
}

export function cloneSim(s: SimState): SimState {
  return { ...s, p: { ...s.p }, crumble: new Map(s.crumble) }
}

function inFootprint(s: SimState, pl: Platform, x: number, z: number): boolean {
  if (z < pl.z0 || z > pl.z1) return false
  return Math.abs(x - platformX(pl, s.t)) <= pl.w / 2 + S.edgeGrace
}

/** Highest solid platform under the rider whose top lies within [minTop, maxTop]. */
function findSupport(s: SimState, l: Level, maxTop: number, minTop: number): Platform | null {
  const p = s.p
  let best: Platform | null = null
  let bestTop = -Infinity
  for (const id of bucketAt(l, p.z).platforms) {
    const pl = l.platforms[id]
    if (crumbleFallen(s, pl) || !inFootprint(s, pl, p.x, p.z)) continue
    const top = topAt(pl, p.z)
    if (top <= maxTop && top >= minTop && top > bestTop) {
      best = pl
      bestTop = top
    }
  }
  return best
}

function die(s: SimState, cause: DeathCause, ev?: SimEvent[], hazard?: number): void {
  s.dead = cause
  ev?.push({ type: 'death', cause, hazard })
}

export function stepSim(s: SimState, l: Level, inp: SimInput, dt: number, ev?: SimEvent[]): void {
  if (s.dead || s.finished) return
  const p = s.p
  const t0 = s.t
  s.t += dt
  const sec = l.sections[s.section]

  p.jumpBuf = inp.jumpPressed ? S.jumpBuffer : Math.max(0, p.jumpBuf - dt)
  p.slamBuf = inp.slamPressed ? S.slamBuffer : Math.max(0, p.slamBuf - dt)
  p.coyote = Math.max(0, p.coyote - dt)
  p.boost = Math.min(S.boostMax, p.boost * Math.exp(-S.boostDecay * dt))
  const brakeTarget = inp.brake ? S.brakeMul : 1
  p.brake += (brakeTarget - p.brake) * Math.min(1, S.brakeResponse * dt)
  if (inp.brake) p.boost *= Math.exp(-2.5 * dt)
  p.speed = baseSpeed(l, p.z) * sec.speedMul * p.brake + p.boost + (p.rail >= 0 ? S.railBonus : 0)

  // Lateral carve (locked while grinding).
  if (p.rail >= 0) p.vx = 0
  else {
    const k = p.grounded ? S.groundResponse : S.airResponse
    p.vx += (inp.steer * S.lateral - p.vx) * Math.min(1, k * dt)
  }

  // Jump (buffered, with coyote time). Hopping off a rail snaps lateral speed to the steer.
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    const carry = p.grounded ? Math.max(0, p.vy) * S.rampJumpCarry : 0
    p.vy = S.jump + carry
    if (p.rail >= 0) {
      p.vx = inp.steer * S.lateral
      ev?.push({ type: 'grindEnd' })
    }
    p.grounded = false
    p.plat = -1
    p.rail = -1
    p.coyote = 0
    p.jumpBuf = 0
    p.slamBuf = 0
    p.slam = false
    p.air = 0
    ev?.push({ type: 'jump' })
  }
  if (p.slamBuf > 0 && !p.grounded && !p.slam) {
    p.slamBuf = 0
    p.slam = true
    p.vy = Math.min(p.vy, -S.slamSpeed)
    ev?.push({ type: 'slam' })
  }

  // Ride moving platforms.
  if (p.grounded && p.plat >= 0) {
    const pl = l.platforms[p.plat]
    if (pl.move) p.x += platformX(pl, s.t) - platformX(pl, t0)
  }

  const prevY = p.y
  if (!p.grounded) {
    let g: number = S.gravity
    if (p.slam) g *= S.slamGravMul
    else if (p.vy > 0 && !inp.jumpHeld) g *= S.lowJumpMul
    p.vy = Math.max(S.maxFall, p.vy + g * dt)
    p.y += p.vy * dt
    p.air += dt
  }
  p.x += p.vx * dt
  p.z += p.speed * dt

  resolveGround(s, l, prevY, ev)
  if (s.dead) return

  // Crumbling ice starts to fall once touched.
  if (p.grounded && p.plat >= 0) {
    const pl = l.platforms[p.plat]
    if (pl.kind === 'crumble' && !s.crumble.has(pl.id)) {
      s.crumble.set(pl.id, s.t)
      ev?.push({ type: 'crumble', id: pl.id })
    }
  }

  const bucket = bucketAt(l, p.z)
  if (p.grounded) {
    for (const id of bucket.pads) {
      const pad = l.pads[id]
      if (Math.abs(p.z - pad.z) <= pad.len / 2 && Math.abs(p.x - pad.x) <= pad.w / 2 + 0.2 && p.boost < S.boostPad - 1) {
        p.boost = S.boostPad
        ev?.push({ type: 'boost' })
      }
    }
  }
  for (const id of bucket.hazards) {
    if (hazardHits(l.hazards[id], s.t, p.x, p.y, p.z)) return die(s, 'hazard', ev, id)
  }
  if (p.y < slopeY(p.z) - S.killDepth) return die(s, 'fall', ev)

  // The avalanche: a bit faster than you, never more than `wallMaxGap` behind.
  s.wallZ += (baseSpeed(l, p.z) * sec.speedMul + sec.wallExtra) * dt
  s.wallZ = Math.max(s.wallZ, p.z - S.wallMaxGap)
  if (p.z < s.wallZ) return die(s, 'avalanche', ev)

  while (s.cp + 1 < l.checkpoints.length && p.z >= l.checkpoints[s.cp + 1].z) {
    s.cp += 1
    ev?.push({ type: 'checkpoint', index: s.cp })
  }
  while (s.section + 1 < l.sections.length && p.z >= l.sections[s.section + 1].z) {
    s.section += 1
    ev?.push({ type: 'section', index: s.section })
  }
  if (p.z >= l.finishZ) {
    s.finished = true
    ev?.push({ type: 'finish' })
  }
}

function resolveGround(s: SimState, l: Level, prevY: number, ev?: SimEvent[]): void {
  const p = s.p
  if (p.rail >= 0) {
    const r = l.rails[p.rail]
    const slope = (r.y1 - r.y0) / (r.z1 - r.z0)
    if (p.z > r.z1) {
      p.rail = -1
      p.grounded = false
      p.vy = slope * p.speed
      p.coyote = S.coyote
      ev?.push({ type: 'grindEnd' })
    } else {
      p.x = r.x
      p.y = railY(r, p.z)
      p.vy = slope * p.speed
    }
    return
  }

  if (p.grounded) {
    const pl = findSupport(s, l, p.y + 0.5, p.y - 1)
    if (pl) {
      p.y = topAt(pl, p.z)
      p.vy = ((pl.y1 - pl.y0) / (pl.z1 - pl.z0)) * p.speed
      p.plat = pl.id
    } else {
      p.grounded = false
      p.plat = -1
      p.coyote = S.coyote
      p.air = 0
    }
  } else if (p.vy <= 2) {
    const pl = findSupport(s, l, prevY + S.ledgeCatch, -Infinity)
    if (pl && p.y <= topAt(pl, p.z) + 0.02) {
      land(s, pl.id, topAt(pl, p.z), ((pl.y1 - pl.y0) / (pl.z1 - pl.z0)) * p.speed, ev)
    } else if (p.vy <= 0) {
      for (const id of bucketAt(l, p.z).rails) {
        const r = l.rails[id]
        if (p.z < r.z0 || p.z > r.z1 - 1 || Math.abs(p.x - r.x) > S.railSnap) continue
        const ry = railY(r, p.z)
        if (prevY >= ry - 0.35 && p.y <= ry + 0.05) {
          const slam = p.slam
          land(s, -1, ry, ((r.y1 - r.y0) / (r.z1 - r.z0)) * p.speed, ev, slam)
          p.rail = r.id
          p.x = r.x
          ev?.push({ type: 'grind', rail: r.id })
          break
        }
      }
    }
  }

  // Running into the face (or underside) of a deck is fatal.
  for (const id of bucketAt(l, p.z).platforms) {
    const pl = l.platforms[id]
    if (id === p.plat || crumbleFallen(s, pl) || !inFootprint(s, pl, p.x, p.z)) continue
    const top = topAt(pl, p.z)
    if (p.y < top - S.ledgeCatch && p.y + P.hy * 2 > top - pl.thick) return die(s, 'wall', ev)
  }
}

function land(s: SimState, plat: number, y: number, vy: number, ev?: SimEvent[], slamOverride?: boolean): void {
  const p = s.p
  const impact = Math.min(1, Math.max(0, -p.vy / 30))
  const slam = slamOverride ?? p.slam
  const perfect = slam && p.air >= S.slamBoostAir
  p.y = y
  p.vy = vy
  p.grounded = true
  p.plat = plat
  p.air = 0
  p.slam = false
  if (perfect) p.boost = Math.max(p.boost, S.boostSlam)
  ev?.push({ type: 'land', impact, slam: perfect })
}
