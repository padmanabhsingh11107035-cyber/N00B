import * as THREE from 'three'

/** Pin palette (teal, coral, honey, lilac, sky) — matches docs/STYLE.md. */
export const PIN_COLORS = ['#4fb8ae', '#ef8a6a', '#f2c14e', '#a58ad8', '#7fb6e8']
export const MAX_PINS = 5
/** Walking within this many metres of a pin clears it. */
export const PIN_REACH = 4

export type Pin = { id: number; x: number; z: number; c: number }
export type SavedPin = [number, number, number]

/** Map waypoints: pure, deterministic store (serializable). */
export class Waypoints {
  pins: Pin[] = []
  private nextId = 1

  /** Drop a pin; when full the oldest pin makes room. Returns the new pin. */
  add(x: number, z: number): Pin {
    if (this.pins.length >= MAX_PINS) this.pins.shift()
    const used = new Set(this.pins.map(p => p.c))
    let c = 0
    while (used.has(c) && c < PIN_COLORS.length - 1) c++
    const pin = { id: this.nextId++, x, z, c }
    this.pins.push(pin)
    return pin
  }

  remove(id: number): Pin | null {
    const i = this.pins.findIndex(p => p.id === id)
    if (i < 0) return null
    return this.pins.splice(i, 1)[0]
  }

  clear(): void {
    this.pins.length = 0
  }

  /** First pin within `r` metres of (x, z). */
  near(x: number, z: number, r: number): Pin | null {
    for (const p of this.pins) if (Math.hypot(p.x - x, p.z - z) <= r) return p
    return null
  }

  /** Index of a pin in drop order (1-based label). */
  label(pin: Pin): number {
    return this.pins.indexOf(pin) + 1
  }

  serialize(): SavedPin[] {
    return this.pins.map(p => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, p.c])
  }

  load(saved: SavedPin[] | undefined): void {
    this.pins = []
    this.nextId = 1
    for (const s of saved ?? []) {
      if (!Array.isArray(s) || s.length < 2 || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue
      const c = Number.isInteger(s[2]) && s[2] >= 0 && s[2] < PIN_COLORS.length ? s[2] : 0
      this.pins.push({ id: this.nextId++, x: s[0], z: s[1], c })
      if (this.pins.length >= MAX_PINS) break
    }
  }
}

// ─── World beacons ────────────────────────────────────────────────────────
const BEAM_H = 70
const beamGeo = new THREE.CylinderGeometry(0.42, 0.42, BEAM_H, 16, 1, true).translate(0, BEAM_H / 2, 0)
const gemGeo = new THREE.OctahedronGeometry(0.34, 0)
const ringGeo = new THREE.RingGeometry(0.7, 1.0, 40).rotateX(-Math.PI / 2)

function beamMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: color }, uAlpha: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        vH = position.y / ${BEAM_H.toFixed(1)};
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        // Soft core (facing the viewer), fading upward, with slow rising shimmer bands.
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = (1.0 - smoothstep(0.0, 1.0, vH)) * smoothstep(0.0, 0.015, vH);
        float bands = 0.82 + 0.18 * sin(vH * 90.0 - uTime * 2.4);
        gl_FragColor = vec4(uColor * 0.9, core * fade * bands * 0.55 * uAlpha);
      }`,
  })
}

type Beacon = { pin: Pin; root: THREE.Group; beam: THREE.Mesh; gem: THREE.Mesh; ring: THREE.Mesh; beamMat: THREE.ShaderMaterial; ringMat: THREE.MeshBasicMaterial; gemMat: THREE.MeshStandardMaterial; born: number }

/**
 * A soft pastel light beam, a slowly spinning gem and a pulsing ground ring for each pin.
 * Beams stay visible through fog far away and fade out as you walk up so they never block
 * the view.
 */
export class PinBeacons {
  readonly group = new THREE.Group()
  private beacons = new Map<number, Beacon>()
  private t = 0

  constructor(private readonly ground: (x: number, z: number) => number) {
    this.group.name = 'waypoints'
  }

  /** Match beacons to the current pin list. */
  sync(pins: Pin[]): void {
    const live = new Set(pins.map(p => p.id))
    for (const [id, b] of this.beacons) {
      if (live.has(id)) continue
      this.group.remove(b.root)
      b.beamMat.dispose(); b.ringMat.dispose(); b.gemMat.dispose()
      this.beacons.delete(id)
    }
    for (const pin of pins) {
      if (this.beacons.has(pin.id)) continue
      const color = new THREE.Color(PIN_COLORS[pin.c])
      const root = new THREE.Group()
      const beamMat = beamMaterial(color)
      const beam = new THREE.Mesh(beamGeo, beamMat)
      beam.frustumCulled = false
      beam.renderOrder = 5
      const gemMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0, transparent: true })
      const gem = new THREE.Mesh(gemGeo, gemMat)
      gem.scale.set(1, 1.5, 1)
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.renderOrder = 5
      root.add(beam, gem, ring)
      this.group.add(root)
      this.beacons.set(pin.id, { pin, root, beam, gem, ring, beamMat, ringMat, gemMat, born: this.t })
    }
  }

  update(dt: number, player: THREE.Vector3): void {
    this.t += dt
    for (const b of this.beacons.values()) {
      const y = this.ground(b.pin.x, b.pin.z)
      b.root.position.set(b.pin.x, y, b.pin.z)
      const d = Math.hypot(player.x - b.pin.x, player.z - b.pin.z)
      // Pop-in: beam grows from the ground with a slight overshoot.
      const age = Math.min(1, (this.t - b.born) / 0.7)
      const grow = age < 1 ? 1 - Math.pow(1 - age, 3) * Math.cos(age * 5) : 1
      b.beam.scale.set(1, Math.max(0.01, grow), 1)
      const near = THREE.MathUtils.smoothstep(d, 5, 18)
      b.beamMat.uniforms.uAlpha.value = 0.25 + 0.75 * near
      b.beamMat.uniforms.uTime.value = this.t
      const bob = Math.sin(this.t * 2 + b.pin.id) * 0.15
      b.gem.position.y = 2.6 + bob
      b.gem.rotation.y = this.t * 1.2
      // Farther gems grow a little so they read at distance.
      const s = 1 + Math.min(3, d / 60)
      b.gem.scale.set(s, s * 1.5, s)
      const pulse = (this.t * 0.8 + b.pin.id * 0.3) % 1
      b.ring.scale.setScalar(0.8 + pulse * 2.2)
      b.ringMat.opacity = (1 - pulse) * 0.55 * (0.4 + 0.6 * (1 - near * 0.5))
    }
  }

  clear(): void {
    this.sync([])
  }
}
