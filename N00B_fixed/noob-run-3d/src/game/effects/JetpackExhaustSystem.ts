import * as THREE from 'three';
import { CharacterModel } from '../models/CharacterModel';

interface JetpackParticle {
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
  type: 'plasma' | 'flame' | 'smoke' | 'ember';
  rot: number;
  rotSpeed: number;
}

interface MachRing {
  active: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  scale: number;
  maxScale: number;
  life: number;
  maxLife: number;
  alpha: number;
  mesh: THREE.Mesh;
}

/**
 * High-Octane Multi-Stage Jetpack Exhaust Particle System
 * Produces supersonic dual rocket thrust columns, Mach shock diamonds,
 * turbulent billowing smoke clouds, high-velocity thermal embers, and dynamic rocket illumination.
 */
export class JetpackExhaustSystem {
  public scene: THREE.Scene;
  public group: THREE.Group;

  // --- 1. PARTICLE POOL & GPU BUFFERS ---
  private static readonly MAX_PARTICLES = 800;
  private particles: JetpackParticle[] = [];
  private pointsMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private sizes: Float32Array;
  private types: Float32Array; // 0 = plasma core, 1 = flame puff, 2 = billowing smoke, 3 = ember

  // --- 2. MACH SHOCKWAVE DISCS ---
  private static readonly MAX_MACH_RINGS = 12;
  private machRings: MachRing[] = [];
  private machRingGroup: THREE.Group;
  private machRingMat: THREE.MeshBasicMaterial;
  private machTimer = 0;

  // --- 3. DYNAMIC JETPACK ROCKET LIGHT (RTX Atmosphere Glow) ---
  public rocketLight: THREE.PointLight;
  private lightFlickerTime = 0;

  // --- 4. NOZZLE & AERODYNAMIC TRACKING ---
  private prevPos = new THREE.Vector3();
  private hasPrevPos = false;
  private leftNozzleWorld = new THREE.Vector3();
  private rightNozzleWorld = new THREE.Vector3();
  private lateralVelocity = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'JetpackExhaustSystem';
    this.scene.add(this.group);

    // 1. Pre-allocate Typed Arrays
    this.positions = new Float32Array(JetpackExhaustSystem.MAX_PARTICLES * 3);
    this.colors = new Float32Array(JetpackExhaustSystem.MAX_PARTICLES * 3);
    this.alphas = new Float32Array(JetpackExhaustSystem.MAX_PARTICLES);
    this.sizes = new Float32Array(JetpackExhaustSystem.MAX_PARTICLES);
    this.types = new Float32Array(JetpackExhaustSystem.MAX_PARTICLES);

    // 2. Pre-populate particle pool
    for (let i = 0; i < JetpackExhaustSystem.MAX_PARTICLES; i++) {
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
        type: 'plasma',
        rot: 0,
        rotSpeed: 0,
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('pType', new THREE.BufferAttribute(this.types, 1));

    // Custom High-Performance Rocket Exhaust Shader
    this.material = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2.0) },
      },
      vertexShader: `
        attribute float alpha;
        attribute float size;
        attribute float pType;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vType;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vType = pType;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          gl_PointSize = size * uPixelRatio * (290.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 1.0, 95.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vType;

        void main() {
          if (vAlpha <= 0.001) discard;

          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);

          float intensity = 0.0;

          if (vType < 0.5) {
            // 0. Supersonic Plasma Core Needle (needle-sharp elongated plasma jet)
            float coreDist = length(vec2(uv.x * 1.5, uv.y));
            intensity = smoothstep(0.5, 0.0, coreDist);
            intensity += 0.8 * smoothstep(0.18, 0.0, coreDist); // Ultra-bright white core
          } else if (vType < 1.5) {
            // 1. Turbulent Flame Puff
            intensity = smoothstep(0.5, 0.0, dist) * 1.25;
            intensity += 0.4 * smoothstep(0.2, 0.0, dist);
          } else if (vType < 2.5) {
            // 2. Billowing Smoke Plume (soft volumetric cloud falloff)
            intensity = smoothstep(0.5, 0.0, dist) * 0.75;
          } else {
            // 3. Fiery Embers & Sparks (sharp hot point)
            intensity = smoothstep(0.45, 0.0, dist) * 1.4;
          }

          if (intensity <= 0.01) discard;

          gl_FragColor = vec4(vColor * (1.0 + intensity * 0.4), vAlpha * intensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(this.geometry, this.material);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);

    // 3. Setup Supersonic Mach Shockwave Discs
    this.machRingGroup = new THREE.Group();
    this.group.add(this.machRingGroup);

    const machGeom = new THREE.RingGeometry(0.16, 0.32, 20);
    this.machRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Supersonic cyan/solar yellow shock diamond
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < JetpackExhaustSystem.MAX_MACH_RINGS; i++) {
      const ringMesh = new THREE.Mesh(machGeom, this.machRingMat.clone());
      ringMesh.visible = false;
      this.machRingGroup.add(ringMesh);

      this.machRings.push({
        active: false,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(0, -0.4, -1).normalize(),
        scale: 0.2,
        maxScale: 1.4,
        life: 0,
        maxLife: 0.22,
        alpha: 1.0,
        mesh: ringMesh,
      });
    }

    // 4. Setup Dynamic Rocket Thruster PointLight
    this.rocketLight = new THREE.PointLight(0xfbbf24, 0, 24);
    this.rocketLight.name = 'JetpackThrusterLight';
    this.group.add(this.rocketLight);
  }

  /**
   * Main per-frame update routine
   */
  public update(
    delta: number,
    playerPos: THREE.Vector3,
    activeSpeed: number,
    isJetpackActive: boolean,
    character?: CharacterModel
  ) {
    const clampedDelta = Math.min(0.066, delta);
    this.lightFlickerTime += clampedDelta;

    if (!this.hasPrevPos) {
      this.prevPos.copy(playerPos);
      this.hasPrevPos = true;
    }

    // Calculate lateral speed for aerodynamic jet stream curvature
    this.lateralVelocity = (playerPos.x - this.prevPos.x) / (clampedDelta || 0.016);

    // 1. Rocket Thruster Emission when Jetpack is active
    if (isJetpackActive) {
      this.emitJetpackExhaust(clampedDelta, playerPos, activeSpeed, character);

      // Rocket point light dynamic flicker & illumination
      const flicker = Math.sin(this.lightFlickerTime * 55.0) * 0.4 + (Math.random() - 0.5) * 0.3;
      this.rocketLight.intensity = THREE.MathUtils.lerp(this.rocketLight.intensity, 3.2 + flicker, clampedDelta * 18);
      this.rocketLight.position.set(playerPos.x, playerPos.y + 0.6, playerPos.z - 0.4);

      // High-temperature color cycling between fiery gold and supersonic cyan
      if (Math.sin(this.lightFlickerTime * 8.0) > 0.4) {
        this.rocketLight.color.setHex(0x38bdf8); // Supersonic cyan pulse
      } else {
        this.rocketLight.color.setHex(0xfbbf24); // Blazing solar gold
      }
    } else {
      // Fade out rocket light immediately when jetpack is inactive
      this.rocketLight.intensity = THREE.MathUtils.lerp(this.rocketLight.intensity, 0, clampedDelta * 14);
    }

    this.prevPos.copy(playerPos);

    // 2. Physics & Lifecycle Simulation
    const posArr = this.positions;
    const colArr = this.colors;
    const alpArr = this.alphas;
    const sizArr = this.sizes;
    const typArr = this.types;

    let activeCount = 0;

    for (let i = 0; i < JetpackExhaustSystem.MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += clampedDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      const progress = p.life / p.maxLife; // 0 to 1

      if (p.type === 'plasma') {
        // High-velocity straight backward needle
        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;
        p.alpha = Math.max(0.0, (1.0 - progress * 1.2));
        p.size = p.baseSize * (1.0 - progress * 0.5);
      } else if (p.type === 'flame') {
        // Expanding flame puff with aerodynamic curl
        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;
        p.vx *= 0.94;
        p.vy *= 0.92;
        p.vz *= 0.95;
        p.size = p.baseSize * (1.0 + progress * 1.8);
        p.alpha = Math.max(0.0, (1.0 - progress) * 0.95);
      } else if (p.type === 'smoke') {
        // Billowing rolling smoke: expands massively, slows down with atmospheric drag
        p.x += p.vx * clampedDelta;
        p.y += (p.vy + 0.8) * clampedDelta; // Slow thermal buoyant lift
        p.z += p.vz * clampedDelta;
        p.vx *= 0.91;
        p.vz *= 0.92;
        p.size = p.baseSize * (1.2 + progress * 2.8); // Expands up to 3.5m wide
        p.alpha = Math.sin(progress * Math.PI) * (1.0 - progress * 0.6) * 0.65;
      } else {
        // Hot embers / sparks: gravity arc
        p.vy -= 12.0 * clampedDelta;
        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;
        p.alpha = Math.max(0.0, 1.0 - progress);
        p.size = p.baseSize * (1.0 - progress * 0.7);
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

      let typeCode = 0;
      if (p.type === 'flame') typeCode = 1;
      else if (p.type === 'smoke') typeCode = 2;
      else if (p.type === 'ember') typeCode = 3;
      typArr[activeCount] = typeCode;

      activeCount++;
    }

    this.geometry.setDrawRange(0, activeCount);
    if (activeCount > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.alpha.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
      this.geometry.attributes.pType.needsUpdate = true;
    }

    // 3. Update Mach Shockwave Discs
    for (const m of this.machRings) {
      if (!m.active) continue;

      m.life += clampedDelta;
      const prog = m.life / m.maxLife;

      if (prog >= 1.0) {
        m.active = false;
        m.mesh.visible = false;
        continue;
      }

      // Propagate backward along exhaust axis
      m.pos.addScaledVector(m.dir, 38.0 * clampedDelta);
      m.mesh.position.copy(m.pos);

      // Expansion
      m.scale = 0.2 + (m.maxScale - 0.2) * prog;
      m.mesh.scale.setScalar(m.scale);

      m.alpha = Math.max(0.0, (1.0 - prog) * 0.85);
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = m.alpha;
    }
  }

  /**
   * Spawns multi-layer exhaust plumes from left and right jetpack nozzles
   */
  private emitJetpackExhaust(
    delta: number,
    currentPos: THREE.Vector3,
    activeSpeed: number,
    character?: CharacterModel
  ) {
    // Obtain actual world coords of the character's jet thrusters
    let hasCoords = false;
    if (character?.leftThrusterFlame && character?.rightThrusterFlame) {
      character.leftThrusterFlame.getWorldPosition(this.leftNozzleWorld);
      character.rightThrusterFlame.getWorldPosition(this.rightNozzleWorld);
      hasCoords = true;
    }

    const dist = currentPos.distanceTo(this.prevPos);
    const steps = Math.max(1, Math.min(5, Math.ceil(dist / 0.75)));

    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const interpX = THREE.MathUtils.lerp(this.prevPos.x, currentPos.x, t);
      const interpY = THREE.MathUtils.lerp(this.prevPos.y, currentPos.y, t);
      const interpZ = THREE.MathUtils.lerp(this.prevPos.z, currentPos.z, t);

      // Dual rocket nozzle anchors
      const leftX = hasCoords ? this.leftNozzleWorld.x : interpX - 0.26;
      const leftY = hasCoords ? this.leftNozzleWorld.y : interpY + 1.1;
      const leftZ = hasCoords ? this.leftNozzleWorld.z : interpZ - 0.32;

      const rightX = hasCoords ? this.rightNozzleWorld.x : interpX + 0.26;
      const rightY = hasCoords ? this.rightNozzleWorld.y : interpY + 1.1;
      const rightZ = hasCoords ? this.rightNozzleWorld.z : interpZ - 0.32;

      // Spawn left and right thrust plumes
      this.spawnNozzleThrust(leftX, leftY, leftZ, -1, activeSpeed);
      this.spawnNozzleThrust(rightX, rightY, rightZ, 1, activeSpeed);
    }

    // Mach Shockwave Ring Periodic Pulse (every 0.08s)
    this.machTimer += delta;
    if (this.machTimer >= 0.08) {
      this.machTimer = 0;
      this.spawnMachRing(this.leftNozzleWorld.x !== 0 ? this.leftNozzleWorld : currentPos.clone().add(new THREE.Vector3(-0.26, 1.1, -0.32)));
      this.spawnMachRing(this.rightNozzleWorld.x !== 0 ? this.rightNozzleWorld : currentPos.clone().add(new THREE.Vector3(0.26, 1.1, -0.32)));
    }
  }

  private spawnNozzleThrust(x: number, y: number, z: number, side: number, speed: number) {
    // 1. White-hot / Cyan Supersonic Plasma Core
    const p1 = this.getFreeParticle();
    if (p1) {
      p1.active = true;
      p1.x = x + (Math.random() - 0.5) * 0.05;
      p1.y = y + (Math.random() - 0.5) * 0.05;
      p1.z = z;

      p1.vx = side * 0.4 - this.lateralVelocity * 0.25 + (Math.random() - 0.5) * 0.4;
      p1.vy = -12.0 - Math.random() * 8.0; // High downward jet thrust
      p1.vz = -speed * 0.75 - (35.0 + Math.random() * 25.0); // Blazing backward rocket ejection

      p1.type = 'plasma';
      p1.baseSize = 2.4 + Math.random() * 1.4;
      p1.size = p1.baseSize;
      p1.life = 0;
      p1.maxLife = 0.12 + Math.random() * 0.08;
      p1.alpha = 1.0;

      // 50% white-hot core, 50% electric cyan plasma
      if (Math.random() < 0.5) {
        p1.r = 1.0; p1.g = 1.0; p1.b = 1.0;
      } else {
        p1.r = 0.22; p1.g = 0.88; p1.b = 1.0;
      }
    }

    // 2. Solar Fiery Flame Plume
    const p2 = this.getFreeParticle();
    if (p2) {
      p2.active = true;
      p2.x = x + (Math.random() - 0.5) * 0.1;
      p2.y = y - 0.08 + (Math.random() - 0.5) * 0.1;
      p2.z = z - 0.15;

      p2.vx = side * (0.8 + Math.random() * 0.8) - this.lateralVelocity * 0.35;
      p2.vy = -6.0 - Math.random() * 5.0;
      p2.vz = -speed * 0.6 - (18.0 + Math.random() * 14.0);

      p2.type = 'flame';
      p2.baseSize = 3.2 + Math.random() * 1.8;
      p2.size = p2.baseSize;
      p2.life = 0;
      p2.maxLife = 0.28 + Math.random() * 0.18;
      p2.alpha = 0.95;

      // Fiery gold / solar amber / orange
      const roll = Math.random();
      if (roll < 0.4) {
        p2.r = 1.0; p2.g = 0.82; p2.b = 0.1; // Gold
      } else if (roll < 0.8) {
        p2.r = 1.0; p2.g = 0.45; p2.b = 0.05; // Fiery orange
      } else {
        p2.r = 0.06; p2.g = 0.75; p2.b = 0.95; // Cyan propellant
      }
    }

    // 3. Volumetric Billowing Smoke Clouds
    if (Math.random() < 0.65) {
      const p3 = this.getFreeParticle();
      if (p3) {
        p3.active = true;
        p3.x = x + (Math.random() - 0.5) * 0.2;
        p3.y = y - 0.2 + (Math.random() - 0.5) * 0.2;
        p3.z = z - 0.35;

        p3.vx = side * (1.2 + Math.random() * 1.5) - this.lateralVelocity * 0.45;
        p3.vy = -1.5 - Math.random() * 2.0;
        p3.vz = -speed * 0.45 - (8.0 + Math.random() * 8.0);

        p3.type = 'smoke';
        p3.baseSize = 2.8 + Math.random() * 2.0;
        p3.size = p3.baseSize;
        p3.life = 0;
        p3.maxLife = 0.45 + Math.random() * 0.35;
        p3.alpha = 0.7;

        // Slate purple / dusk violet / warm grey smoke
        p3.r = 0.72; p3.g = 0.52; p3.b = 0.88;
      }
    }

    // 4. Fiery Thermal Embers & Sparks
    if (Math.random() < 0.55) {
      const p4 = this.getFreeParticle();
      if (p4) {
        p4.active = true;
        p4.x = x;
        p4.y = y - 0.1;
        p4.z = z - 0.1;

        const angle = Math.random() * Math.PI * 2;
        p4.vx = Math.cos(angle) * (1.5 + Math.random() * 2.5) - this.lateralVelocity * 0.3;
        p4.vy = Math.sin(angle) * 2.0 - 4.0;
        p4.vz = -speed * 0.7 - (22.0 + Math.random() * 16.0);

        p4.type = 'ember';
        p4.baseSize = 1.4 + Math.random() * 1.2;
        p4.size = p4.baseSize;
        p4.life = 0;
        p4.maxLife = 0.3 + Math.random() * 0.25;
        p4.alpha = 1.0;

        p4.r = 1.0; p4.g = 0.95; p4.b = 0.4;
      }
    }
  }

  private spawnMachRing(origin: THREE.Vector3) {
    const ring = this.machRings.find((r) => !r.active) || this.machRings[0];
    ring.active = true;
    ring.pos.copy(origin);
    ring.pos.z -= 0.2;
    ring.scale = 0.2;
    ring.maxScale = 1.35;
    ring.life = 0;
    ring.maxLife = 0.24;
    ring.alpha = 0.95;

    ring.mesh.position.copy(ring.pos);
    ring.mesh.rotation.x = Math.PI / 2; // Perpendicular to backward thrust
    ring.mesh.scale.setScalar(ring.scale);
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = ring.alpha;
    ring.mesh.visible = true;
  }

  private getFreeParticle(): JetpackParticle | null {
    for (let i = 0; i < JetpackExhaustSystem.MAX_PARTICLES; i++) {
      if (!this.particles[i].active) {
        return this.particles[i];
      }
    }
    return null;
  }

  public reset() {
    for (let i = 0; i < JetpackExhaustSystem.MAX_PARTICLES; i++) {
      this.particles[i].active = false;
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }
    this.geometry.setDrawRange(0, 0);

    for (const ring of this.machRings) {
      ring.active = false;
      ring.mesh.visible = false;
    }

    this.rocketLight.intensity = 0;
    this.hasPrevPos = false;
  }

  public destroy() {
    this.reset();
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.machRingMat.dispose();
    for (const ring of this.machRings) {
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
  }
}
