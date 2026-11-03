import * as THREE from 'three';

interface CoinBurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  size: number;
  baseSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  rot: number;
  rotSpeed: number;
  type: 'sparkle' | 'shard' | 'ring_ember' | 'rising_glimmer';
}

interface ShockwaveRing {
  active: boolean;
  pos: THREE.Vector3;
  scale: number;
  maxScale: number;
  life: number;
  maxLife: number;
  alpha: number;
  color: THREE.Color;
  mesh: THREE.Mesh;
}

interface FloatingCoinBadge {
  active: boolean;
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  mesh: THREE.Mesh;
}

/**
 * High-Octane 3D Coin Collection Particle System
 * Produces radiant golden starbursts, expanding shockwave rings, tumbling gold coin shards,
 * and combo-amplified fireworks with zero per-frame garbage collection.
 */
export class CoinParticleSystem {
  public scene: THREE.Scene;
  public group: THREE.Group;

  // --- 1. PARTICLES POOL & BUFFER ---
  private static readonly MAX_PARTICLES = 540;
  private particles: CoinBurstParticle[] = [];
  private pointsMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private sizes: Float32Array;
  private shapes: Float32Array; // 0 = soft glow, 1 = 4-point diamond glint, 2 = faceted coin shard

  // --- 2. EXPANDING SHOCKWAVE RINGS POOL ---
  private static readonly MAX_RINGS = 16;
  private rings: ShockwaveRing[] = [];
  private ringGroup: THREE.Group;
  private ringMat: THREE.MeshBasicMaterial;

  // --- 3. FLOATING COIN BADGES POOL ---
  private static readonly MAX_BADGES = 8;
  private badges: FloatingCoinBadge[] = [];
  private badgeGroup: THREE.Group;

  // Color palettes for standard and combo-charged pickups (warm rich tones without blown-out white)
  private readonly goldPalette = [
    new THREE.Color(0xfde047), // Brilliant neon gold
    new THREE.Color(0xfbbf24), // Rich amber gold
    new THREE.Color(0xf59e0b), // Deep burnished gold
    new THREE.Color(0xd97706), // Warm metallic gold
    new THREE.Color(0xfef08a), // Pale warm gold
  ];

  private readonly comboPalette = [
    new THREE.Color(0x38bdf8), // Electric cyan
    new THREE.Color(0xf43f5e), // Cyber rose
    new THREE.Color(0xfacc15), // Pure neon gold
    new THREE.Color(0xa855f7), // Radiant purple
  ];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'CoinParticleSystem';
    this.scene.add(this.group);

    // 1. Initialize Typed Arrays
    this.positions = new Float32Array(CoinParticleSystem.MAX_PARTICLES * 3);
    this.colors = new Float32Array(CoinParticleSystem.MAX_PARTICLES * 3);
    this.alphas = new Float32Array(CoinParticleSystem.MAX_PARTICLES);
    this.sizes = new Float32Array(CoinParticleSystem.MAX_PARTICLES);
    this.shapes = new Float32Array(CoinParticleSystem.MAX_PARTICLES);

    // 2. Pre-populate particle pool
    for (let i = 0; i < CoinParticleSystem.MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
        size: 0,
        baseSize: 1,
        alpha: 0,
        life: 0,
        maxLife: 1,
        rot: 0,
        rotSpeed: 0,
        type: 'sparkle',
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('shape', new THREE.BufferAttribute(this.shapes, 1));

    // Custom High-Performance Shader with 4-Point Diamond Glints & Faceted Shards
    this.material = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2.0) },
      },
      vertexShader: `
        attribute float alpha;
        attribute float size;
        attribute float shape;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vShape = shape;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * uPixelRatio * (260.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 1.0, 75.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;

        void main() {
          if (vAlpha <= 0.001) discard;

          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);

          float intensity = 0.0;

          if (vShape < 0.5) {
            // 0. Soft radial sparkle with brilliant hot core
            intensity = smoothstep(0.5, 0.0, dist);
            intensity += 0.4 * smoothstep(0.2, 0.0, dist);
          } else if (vShape < 1.5) {
            // 1. 4-Point Diamond Glint Star (iconic coin gleam)
            float crossShape = max(
              smoothstep(0.09, 0.0, abs(uv.x)) * smoothstep(0.5, 0.0, abs(uv.y)),
              smoothstep(0.09, 0.0, abs(uv.y)) * smoothstep(0.5, 0.0, abs(uv.x))
            );
            float core = smoothstep(0.22, 0.0, dist);
            intensity = max(crossShape * 1.2, core);
          } else {
            // 2. Faceted gold shard (rhombus / polygon)
            float dManhattan = abs(uv.x) + abs(uv.y);
            intensity = smoothstep(0.55, 0.0, dManhattan) * 1.1;
          }

          if (intensity <= 0.01) discard;

          // Crisp golden spark without blinding HDR blowout
          float sparkAlpha = vAlpha * clamp(intensity, 0.0, 1.0) * 0.85;
          gl_FragColor = vec4(vColor, sparkAlpha);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(this.geometry, this.material);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);

    // 3. Setup Expanding Subtle Ground Rings Pool (Compact and ground-aligned)
    this.ringGroup = new THREE.Group();
    this.group.add(this.ringGroup);

    const ringGeom = new THREE.RingGeometry(0.2, 0.28, 20);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < CoinParticleSystem.MAX_RINGS; i++) {
      const ringMesh = new THREE.Mesh(ringGeom, this.ringMat.clone());
      ringMesh.visible = false;
      this.ringGroup.add(ringMesh);

      this.rings.push({
        active: false,
        pos: new THREE.Vector3(),
        scale: 0.1,
        maxScale: 0.85,
        life: 0,
        maxLife: 0.24,
        alpha: 0.45,
        color: new THREE.Color(0xfbbf24),
        mesh: ringMesh,
      });
    }

    // 4. Setup Floating Coin Badges Pool (3D Mini Glowing Token that pops on collect)
    this.badgeGroup = new THREE.Group();
    this.group.add(this.badgeGroup);

    const badgeGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12);
    badgeGeom.rotateX(Math.PI / 2);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.95,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 1.0,
    });

    for (let i = 0; i < CoinParticleSystem.MAX_BADGES; i++) {
      const bMesh = new THREE.Mesh(badgeGeom, badgeMat.clone());
      bMesh.visible = false;
      this.badgeGroup.add(bMesh);

      this.badges.push({
        active: false,
        pos: new THREE.Vector3(),
        life: 0,
        maxLife: 0.45,
        scale: 1.0,
        mesh: bMesh,
      });
    }
  }

  /**
   * Trigger a high-octane coin collection particle burst at a 3D position
   * @param origin World position of the collected coin
   * @param comboMultiplier Current combo multiplier (scales particle count & colors)
   * @param isMagnet True if collected via magnet pull (curved inward trail)
   */
  public emitCoinCollection(
    origin: THREE.Vector3,
    comboMultiplier = 1,
    isMagnet = false
  ) {
    const isCombo = comboMultiplier > 1;
    const particleCount = isCombo ? 14 : 9;
    const palette = isCombo ? this.comboPalette : this.goldPalette;

    // --- 1. SPHERICAL BURST & TUMBLING SHARDS (Crisp and compact to prevent view obstruction) ---
    for (let i = 0; i < particleCount; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      p.active = true;
      p.x = origin.x + (Math.random() - 0.5) * 0.1;
      p.y = origin.y + (Math.random() - 0.5) * 0.1;
      p.z = origin.z + (Math.random() - 0.5) * 0.1;

      // Tight spherical burst
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = isCombo
        ? 3.5 + Math.random() * 4.5
        : 2.8 + Math.random() * 3.5;

      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.cos(phi) * speed * 0.75 + (isMagnet ? 1.0 : 1.6);
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;

      const shapeRoll = Math.random();
      if (shapeRoll < 0.45) {
        p.type = 'sparkle';
        p.baseSize = 0.8 + Math.random() * 0.6;
      } else if (shapeRoll < 0.8) {
        p.type = 'shard';
        p.baseSize = 1.0 + Math.random() * 0.7;
      } else {
        p.type = 'ring_ember';
        p.baseSize = 0.6 + Math.random() * 0.5;
      }

      p.size = p.baseSize;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.2;
      p.alpha = 0.85;
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 10.0;

      const chosenColor = palette[Math.floor(Math.random() * palette.length)];
      p.r = chosenColor.r;
      p.g = chosenColor.g;
      p.b = chosenColor.b;
    }

    // --- 2. RISING GOLDEN GLIMMER PARTICLES ---
    const glimmerCount = isCombo ? 5 : 3;
    for (let i = 0; i < glimmerCount; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      p.active = true;
      p.x = origin.x + (Math.random() - 0.5) * 0.2;
      p.y = origin.y + (Math.random() - 0.5) * 0.15;
      p.z = origin.z + (Math.random() - 0.5) * 0.2;

      p.vx = (Math.random() - 0.5) * 1.2;
      p.vy = 2.2 + Math.random() * 2.5;
      p.vz = -Math.random() * 2.0;

      p.type = 'rising_glimmer';
      p.baseSize = 0.6 + Math.random() * 0.5;
      p.size = p.baseSize;
      p.life = 0;
      p.maxLife = 0.3 + Math.random() * 0.2;
      p.alpha = 0.8;
      p.rot = 0;
      p.rotSpeed = 0;

      p.r = 0.98;
      p.g = 0.82;
      p.b = 0.22;
    }

    // --- 3. SUBTLE GROUND SHOCKWAVE RING (Flat on track, never blinds camera) ---
    const ring = this.rings.find((r) => !r.active) || this.rings[0];
    ring.active = true;
    ring.pos.copy(origin);
    ring.scale = 0.15;
    ring.maxScale = isCombo ? 0.95 : 0.7;
    ring.life = 0;
    ring.maxLife = 0.22;
    ring.alpha = 0.45;
    ring.color.setHex(isCombo ? 0x06b6d4 : 0xfbbf24);

    ring.mesh.position.set(origin.x, 0.05, origin.z);
    ring.mesh.rotation.set(Math.PI / 2, 0, 0); // Flat on ground
    ring.mesh.scale.setScalar(ring.scale);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.copy(ring.color);
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45;
    ring.mesh.visible = true;

    // --- 4. POPPING 3D GOLD TOKEN BADGE ---
    const badge = this.badges.find((b) => !b.active) || this.badges[0];
    badge.active = true;
    badge.pos.copy(origin);
    badge.life = 0;
    badge.maxLife = 0.28;
    badge.scale = 0.38;
    badge.mesh.position.copy(origin);
    badge.mesh.scale.setScalar(badge.scale);
    badge.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    badge.mesh.visible = true;
  }

  private getFreeParticle(): CoinBurstParticle | null {
    for (let i = 0; i < CoinParticleSystem.MAX_PARTICLES; i++) {
      if (!this.particles[i].active) {
        return this.particles[i];
      }
    }
    return null;
  }

  /**
   * Main per-frame update loop
   */
  public update(delta: number, camera?: THREE.Camera) {
    const clampedDelta = Math.min(0.066, delta);

    // 1. Update Particles
    const posArr = this.positions;
    const colArr = this.colors;
    const alpArr = this.alphas;
    const sizArr = this.sizes;
    const shpArr = this.shapes;

    let activeCount = 0;

    for (let i = 0; i < CoinParticleSystem.MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += clampedDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      // Physics integration
      const progress = p.life / p.maxLife; // 0 to 1

      if (p.type === 'rising_glimmer') {
        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;
        p.vy *= 0.96;
        p.alpha = Math.sin(progress * Math.PI) * (1.0 - progress * 0.4);
        p.size = p.baseSize * (1.0 + Math.sin(progress * Math.PI * 4.0) * 0.3);
      } else {
        // Standard burst & shards: gravity and air drag
        p.vy -= 16.0 * clampedDelta; // Gravity pull
        p.vx *= 0.92;
        p.vz *= 0.92;

        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;

        // Ground bounce
        if (p.y <= 0.08) {
          p.y = 0.08;
          p.vy = -p.vy * 0.4;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }

        p.alpha = (1.0 - progress) * 1.1;
        p.size = p.baseSize * (1.0 - progress * 0.6);
      }

      const idx3 = activeCount * 3;
      posArr[idx3] = p.x;
      posArr[idx3 + 1] = p.y;
      posArr[idx3 + 2] = p.z;

      colArr[idx3] = p.r;
      colArr[idx3 + 1] = p.g;
      colArr[idx3 + 2] = p.b;

      alpArr[activeCount] = Math.max(0.0, Math.min(1.0, p.alpha));
      sizArr[activeCount] = p.size;

      let shapeVal = 0.0;
      if (p.type === 'sparkle') shapeVal = 1.0;
      else if (p.type === 'shard') shapeVal = 2.0;
      shpArr[activeCount] = shapeVal;

      activeCount++;
    }

    this.geometry.setDrawRange(0, activeCount);
    if (activeCount > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.alpha.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
      this.geometry.attributes.shape.needsUpdate = true;
    }

    // 2. Update Shockwave Rings
    for (const ring of this.rings) {
      if (!ring.active) continue;

      ring.life += clampedDelta;
      const rProg = ring.life / ring.maxLife;

      if (rProg >= 1.0) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }

      // Ease-out expansion
      const ease = 1.0 - Math.pow(1.0 - rProg, 2.5);
      ring.scale = 0.15 + (ring.maxScale - 0.15) * ease;
      ring.alpha = Math.max(0.0, (1.0 - rProg) * 0.45);

      ring.mesh.scale.setScalar(ring.scale);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = ring.alpha;
      ring.mesh.rotation.set(Math.PI / 2, 0, 0); // Always flat horizontal on track
    }

    // 3. Update Floating Coin Badges
    for (const badge of this.badges) {
      if (!badge.active) continue;

      badge.life += clampedDelta;
      const bProg = badge.life / badge.maxLife;

      if (bProg >= 1.0) {
        badge.active = false;
        badge.mesh.visible = false;
        continue;
      }

      // Pop up and spin
      badge.pos.y += clampedDelta * 3.2;
      badge.mesh.position.copy(badge.pos);
      badge.mesh.rotation.y += clampedDelta * 14.0;
      badge.mesh.rotation.z = Math.sin(badge.life * 10) * 0.2;

      // Scale pop: swell then shrink
      const scaleEase = Math.sin(bProg * Math.PI);
      const curScale = 0.5 + scaleEase * 0.6;
      badge.mesh.scale.setScalar(curScale);

      const mat = badge.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = (1.0 - bProg * 0.9);
    }
  }

  public reset() {
    for (let i = 0; i < CoinParticleSystem.MAX_PARTICLES; i++) {
      this.particles[i].active = false;
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }
    this.geometry.setDrawRange(0, 0);

    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }

    for (const badge of this.badges) {
      badge.active = false;
      badge.mesh.visible = false;
    }
  }

  public destroy() {
    this.reset();
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.ringMat.dispose();
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    for (const badge of this.badges) {
      badge.mesh.geometry.dispose();
      (badge.mesh.material as THREE.Material).dispose();
    }
  }
}
