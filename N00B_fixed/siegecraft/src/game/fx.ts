import * as THREE from 'three'

/**
 * Pooled particle effects drawn as a handful of InstancedMeshes (one draw call per pool).
 * CPU-simulated: gravity, drag, ground bounce, spin and scale-out. `update(dt)` takes game time,
 * so particles slow down with the rest of the world during slow motion.
 */
type P = {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Euler
  spin: THREE.Vector3
  size: number
  grow: number
  life: number
  age: number
  gravity: number
  drag: number
  bounce: boolean
  color: THREE.Color
}

class Pool {
  readonly mesh: THREE.InstancedMesh
  private items: P[] = []
  private cursor = 0
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly capacity: number, shadows = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = shadows
    this.mesh.count = 0
    const white = new THREE.Color(1, 1, 1)
    for (let i = 0; i < capacity; i += 1) {
      this.items.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 1, grow: 0, life: 1, age: 0, gravity: 0, drag: 0, bounce: false, color: white.clone() })
      this.mesh.setColorAt(i, white)
    }
  }

  spawn(o: Partial<Omit<P, 'alive' | 'age'>> & { pos: THREE.Vector3 }): void {
    const p = this.items[this.cursor]
    this.cursor = (this.cursor + 1) % this.capacity
    p.alive = true
    p.age = 0
    p.pos.copy(o.pos)
    p.vel.copy(o.vel ?? new THREE.Vector3())
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    p.spin.copy(o.spin ?? new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12))
    p.size = o.size ?? 0.1
    p.grow = o.grow ?? 0
    p.life = o.life ?? 1
    p.gravity = o.gravity ?? -15
    p.drag = o.drag ?? 0.2
    p.bounce = o.bounce ?? false
    p.color.copy(o.color ?? new THREE.Color(1, 1, 1))
  }

  update(dt: number, m: THREE.Matrix4, q: THREE.Quaternion, s: THREE.Vector3): void {
    let n = 0
    for (let i = 0; i < this.capacity; i += 1) {
      const p = this.items[i]
      if (!p.alive) continue
      p.age += dt
      if (p.age >= p.life) {
        p.alive = false
        continue
      }
      p.vel.y += p.gravity * dt
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
      p.pos.addScaledVector(p.vel, dt)
      if (p.bounce && p.pos.y < p.size * 0.5) {
        p.pos.y = p.size * 0.5
        p.vel.y = Math.abs(p.vel.y) * 0.3
        p.vel.x *= 0.6
        p.vel.z *= 0.6
        p.spin.multiplyScalar(0.6)
      }
      p.rot.x += p.spin.x * dt
      p.rot.y += p.spin.y * dt
      p.rot.z += p.spin.z * dt
      const t = p.age / p.life
      // Hold size, then scale out over the last 40%.
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      const size = Math.max(0.001, (p.size + p.grow * p.age) * fade)
      q.setFromEuler(p.rot)
      s.setScalar(size)
      m.compose(p.pos, q, s)
      this.mesh.setMatrixAt(n, m)
      this.mesh.setColorAt(n, p.color)
      n += 1
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  clear(): void {
    for (const p of this.items) p.alive = false
    this.mesh.count = 0
  }
}

type Ring = { mesh: THREE.Mesh; age: number; life: number; size: number }
type Flash = { light: THREE.PointLight; age: number; life: number; power: number }

export class Effects {
  readonly group = new THREE.Group()
  private chips: Pool
  private dust: Pool
  private fire: Pool
  private smoke: Pool
  private sparks: Pool
  private rings: Ring[] = []
  private flashes: Flash[] = []
  private ringGeo = new THREE.RingGeometry(0.85, 1, 32)
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private s = new THREE.Vector3()
  /** 0..1 particle budget multiplier from quality. */
  density = 1

  constructor(quality: 'low' | 'medium' | 'high') {
    this.density = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1
    const flat = (color = 0xffffff) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 })
    this.chips = new Pool(new THREE.TetrahedronGeometry(1, 0), flat(), 420, quality === 'high')
    this.dust = new Pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.42, depthWrite: false }), 260)
    this.fire = new Pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.2), transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true }), 160)
    this.smoke = new Pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.7, depthWrite: false }), 140)
    this.sparks = new Pool(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.6) }), 200)
    this.group.add(this.chips.mesh, this.dust.mesh, this.smoke.mesh, this.fire.mesh, this.sparks.mesh)
    for (let i = 0; i < 3; i += 1) {
      // Always "visible" with zero intensity: toggling visibility changes the light count and
      // forces every material to recompile (a hitch on the first explosion).
      const light = new THREE.PointLight(0xffa040, 0, 26, 1.6)
      this.flashes.push({ light, age: 1, life: 1, power: 0 })
      this.group.add(light)
    }
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density))
  }

  /** Splinters / stone chips from a hit or a break. */
  debris(at: THREE.Vector3, color: THREE.Color, count: number, speed: number, size = 0.08): void {
    for (let i = 0; i < this.n(count); i += 1) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize()
      const c = color.clone().multiplyScalar(0.8 + Math.random() * 0.4)
      this.chips.spawn({ pos: at.clone().addScaledVector(dir, 0.2), vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)), size: size * (0.6 + Math.random() * 0.9), life: 1.1 + Math.random() * 1.2, gravity: -15, drag: 0.4, bounce: true, color: c })
    }
  }

  /** Soft dust cloud (landings, collapses). */
  puff(at: THREE.Vector3, color: THREE.Color, count: number, radius: number, rise = 1.2): void {
    for (let i = 0; i < this.n(count); i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * radius
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 0.4, Math.sin(a) * r))
      this.dust.spawn({ pos, vel: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), rise * (0.5 + Math.random()), Math.sin(a) * (1 + Math.random() * 2)), size: 0.14 + Math.random() * 0.2, grow: 0.45 + Math.random() * 0.4, life: 1.0 + Math.random() * 0.9, gravity: 0.4, drag: 2.4, color: color.clone().multiplyScalar(0.9 + Math.random() * 0.2), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) })
    }
  }

  /** Powder-barrel blast: fireball, smoke column, sparks, shock ring, light flash. */
  explosion(at: THREE.Vector3, scale = 1): void {
    const hot = [new THREE.Color(1, 0.95, 0.6), new THREE.Color(1, 0.62, 0.18), new THREE.Color(1, 0.35, 0.1)]
    for (let i = 0; i < this.n(34 * scale); i += 1) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize()
      this.fire.spawn({ pos: at.clone().addScaledVector(dir, 0.3), vel: dir.multiplyScalar(4 + Math.random() * 7), size: 0.35 + Math.random() * 0.45, grow: 1.4, life: 0.35 + Math.random() * 0.35, gravity: 2, drag: 4, color: hot[i % 3] })
    }
    for (let i = 0; i < this.n(22 * scale); i += 1) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.3, Math.random() - 0.5).normalize()
      const g = 0.18 + Math.random() * 0.12
      this.smoke.spawn({ pos: at.clone().addScaledVector(dir, 0.5), vel: dir.multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3(0, 1.5, 0)), size: 0.5 + Math.random() * 0.5, grow: 1.1, life: 1.8 + Math.random() * 1.4, gravity: 0.8, drag: 1.6, color: new THREE.Color(g, g * 0.95, g * 0.92), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) })
    }
    this.sparkBurst(at, 30 * scale, 13)
    this.ring(at, 7 * scale, 0.55, 0xffd28a)
    this.flash(at, 60 * scale, 0.55)
  }

  sparkBurst(at: THREE.Vector3, count: number, speed: number): void {
    for (let i = 0; i < this.n(count); i += 1) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize()
      this.sparks.spawn({ pos: at.clone(), vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)), size: 0.04 + Math.random() * 0.04, life: 0.5 + Math.random() * 0.6, gravity: -12, drag: 0.8, bounce: true, color: new THREE.Color(1, 0.8 + Math.random() * 0.2, 0.35) })
    }
  }

  /** Stars and a puff when a guard is knocked out / vanishes. */
  poof(at: THREE.Vector3): void {
    this.puff(at, new THREE.Color(0xf4efe6), 12, 0.35, 1.8)
    for (let i = 0; i < this.n(10); i += 1) {
      const a = (i / 10) * Math.PI * 2
      this.sparks.spawn({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * 3, 3 + Math.random() * 2, Math.sin(a) * 3), size: 0.07, life: 0.8, gravity: -6, drag: 1, color: new THREE.Color(1, 0.88, 0.3) })
    }
  }

  /** Launch smoke and wood dust at the catapult. */
  launchPuff(at: THREE.Vector3): void {
    this.puff(at, new THREE.Color(0xd8c7a8), 10, 0.8, 0.8)
  }

  ring(at: THREE.Vector3, size: number, life: number, color: number): void {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(at.x, Math.max(0.05, at.y - 0.3), at.z)
    this.group.add(mesh)
    this.rings.push({ mesh, age: 0, life, size })
  }

  flash(at: THREE.Vector3, power: number, life: number): void {
    const f = this.flashes.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b))
    f.light.position.copy(at).add(new THREE.Vector3(0, 0.8, 0))
    f.age = 0
    f.life = life
    f.power = power
  }

  update(dt: number): void {
    for (const pool of [this.chips, this.dust, this.fire, this.smoke, this.sparks]) pool.update(dt, this.m, this.q, this.s)
    for (const r of this.rings) {
      r.age += dt
      const t = r.age / r.life
      r.mesh.scale.setScalar(0.3 + r.size * (1 - Math.pow(1 - Math.min(1, t), 3)))
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.max(0, 1 - t)
      if (t >= 1) {
        this.group.remove(r.mesh)
        ;(r.mesh.material as THREE.Material).dispose()
      }
    }
    this.rings = this.rings.filter(r => r.age < r.life)
    for (const f of this.flashes) {
      if (f.age >= f.life) continue
      f.age += dt
      const t = f.age / f.life
      f.light.intensity = f.power * Math.max(0, 1 - t) ** 2
      if (t >= 1) f.light.intensity = 0
    }
  }

  clear(): void {
    for (const pool of [this.chips, this.dust, this.fire, this.smoke, this.sparks]) pool.clear()
    for (const r of this.rings) this.group.remove(r.mesh)
    this.rings = []
    for (const f of this.flashes) {
      f.age = f.life
      f.light.intensity = 0
    }
  }
}
