import * as THREE from 'three';
import { CharacterModel } from '../models/CharacterModel';

interface Particle {
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
  type: 'jetpack' | 'boost' | 'spark' | 'warp';
}

export class SpeedTrailEffect {
  public scene: THREE.Scene;
  public points: THREE.Points;
  public geometry: THREE.BufferGeometry;
  public material: THREE.ShaderMaterial;

  private maxParticles = 1200;
  private particles: Particle[] = [];
  private activeCount = 0;

  // Buffer attributes
  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private sizes: Float32Array;

  // Interpolation cache
  private prevPos = new THREE.Vector3();
  private hasPrevPos = false;
  private leftThrusterWorld = new THREE.Vector3();
  private rightThrusterWorld = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-allocate typed arrays for GPU buffer
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.alphas = new Float32Array(this.maxParticles);
    this.sizes = new Float32Array(this.maxParticles);

    // Pre-populate particle pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
        size: 1,
        baseSize: 1,
        alpha: 0,
        life: 0,
        maxLife: 1,
        type: 'boost',
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom Points Shader for glowing, rounded, anti-aliased particles with additive blending
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2.0) },
      },
      vertexShader: `
        attribute float alpha;
        attribute float size;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Perspective scale
          gl_PointSize = size * uPixelRatio * (280.0 / -mvPosition.z);
          // Clamp point size to avoid extreme pixelation or invisibly tiny points
          gl_PointSize = clamp(gl_PointSize, 1.0, 120.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Soft circular falloff with hot glowing center
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) {
            discard;
          }

          // Hot inner core + smooth edge bloom
          float core = clamp(1.0 - dist * 3.0, 0.0, 1.0);
          float glow = clamp(1.0 - dist * 2.0, 0.0, 1.0);
          float finalAlpha = vAlpha * (glow * 0.75 + core * 0.45);

          // Additive core boost (whiter inside)
          vec3 outColor = mix(vColor, vec3(1.0, 1.0, 1.0), core * 0.6);

          gl_FragColor = vec4(outColor, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /**
   * Reset all particles (e.g. on run restart)
   */
  public reset() {
    this.activeCount = 0;
    this.hasPrevPos = false;
    for (let i = 0; i < this.maxParticles; i++) {
      this.alphas[i] = 0;
      this.sizes[i] = 0;
      this.particles[i].life = 0;
    }
    this.geometry.setDrawRange(0, 0);
  }

  /**
   * Main update routine called every frame
   */
  public update(
    delta: number,
    playerPos: THREE.Vector3,
    activeSpeed: number,
    isBoostActive: boolean,
    isJetpackActive: boolean,
    character?: CharacterModel
  ) {
    if (!this.hasPrevPos) {
      this.prevPos.copy(playerPos);
      this.hasPrevPos = true;
    }

    // 1. Particle Emission based on active power-ups
    if (isJetpackActive || isBoostActive) {
      this.emitParticles(delta, playerPos, activeSpeed, isBoostActive, isJetpackActive, character);
    }

    this.prevPos.copy(playerPos);

    // 2. Physics & Lifecycle Simulation
    let count = 0;
    const posArr = this.positions;
    const colArr = this.colors;
    const alpArr = this.alphas;
    const sizArr = this.sizes;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;

      p.life -= delta;
      if (p.life <= 0) {
        p.alpha = 0;
        alpArr[i] = 0;
        sizArr[i] = 0;
        continue;
      }

      // Progress ratio (1.0 = brand new, 0.0 = expired)
      const progress = p.life / p.maxLife;

      // Integrate velocity with drag
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Drag / air resistance
      p.vx *= 0.94;
      p.vz *= 0.96;

      if (p.type === 'jetpack') {
        // Jetpack smoke lifts and billows out sideways
        p.vy += (0.6 + Math.sin(p.z * 0.4) * 0.3) * delta;
        p.size = p.baseSize * (1.0 + (1.0 - progress) * 1.8); // Billow expansion
        p.alpha = progress * 0.95;
      } else if (p.type === 'boost') {
        // Boost streaks curl slightly with sonic wind turbulence
        p.vy *= 0.92;
        p.size = p.baseSize * (0.8 + progress * 0.6);
        p.alpha = Math.min(1.0, progress * 1.3);
      } else if (p.type === 'spark') {
        p.vy -= 4.0 * delta; // Gravity pull on hot embers
        p.size = p.baseSize * progress;
        p.alpha = progress * 0.9;
      } else if (p.type === 'warp') {
        // Peripheral speed streaks
        p.size = p.baseSize * (0.6 + progress * 0.7);
        p.alpha = progress * 0.85;
      }

      // Write to typed arrays
      const i3 = count * 3;
      posArr[i3] = p.x;
      posArr[i3 + 1] = p.y;
      posArr[i3 + 2] = p.z;

      colArr[i3] = p.r;
      colArr[i3 + 1] = p.g;
      colArr[i3 + 2] = p.b;

      alpArr[count] = p.alpha;
      sizArr[count] = p.size;

      // Swap alive particles to front of array for compact rendering
      if (count !== i) {
        this.particles[count] = p;
      }
      count++;
    }

    this.activeCount = count;
    this.geometry.setDrawRange(0, this.activeCount);

    if (this.activeCount > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.alpha.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
  }

  /**
   * Spawns interpolated particles along movement path
   */
  private emitParticles(
    delta: number,
    currentPos: THREE.Vector3,
    activeSpeed: number,
    isBoostActive: boolean,
    isJetpackActive: boolean,
    character?: CharacterModel
  ) {
    // Number of interpolated emission steps across the frame distance
    const distTraveled = currentPos.distanceTo(this.prevPos);
    const steps = Math.max(1, Math.min(6, Math.ceil(distTraveled / 0.8)));

    // Fetch jetpack thruster nozzles if available
    let hasThrusterCoords = false;
    if (isJetpackActive && character?.leftThrusterFlame && character?.rightThrusterFlame) {
      character.leftThrusterFlame.getWorldPosition(this.leftThrusterWorld);
      character.rightThrusterFlame.getWorldPosition(this.rightThrusterWorld);
      hasThrusterCoords = true;
    }

    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      // Interpolated position between prevPos and currentPos
      const interpX = THREE.MathUtils.lerp(this.prevPos.x, currentPos.x, t);
      const interpY = THREE.MathUtils.lerp(this.prevPos.y, currentPos.y, t);
      const interpZ = THREE.MathUtils.lerp(this.prevPos.z, currentPos.z, t);

      // --- JETPACK STRATOSPHERIC FLIGHT SONIC STREAMERS ---
      if (isJetpackActive) {
        // High-altitude atmospheric sonic warp streaks rushing past the soaring runner
        if (Math.random() < 0.65) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const sx = interpX + side * (0.75 + Math.random() * 0.9);
          const sy = interpY + 0.2 + Math.random() * 1.4;
          const sz = interpZ + (Math.random() - 0.5) * 1.0;
          this.spawnWarpStreak(sx, sy, sz, activeSpeed);
        }
      }

      // --- SPEED BOOST SLIPSTREAM & SONIC RIBBONS ---
      if (isBoostActive) {
        // Feet running dust & neon ground wake
        this.spawnFootTrail(interpX - 0.2, interpY + 0.15, interpZ, activeSpeed, -1);
        this.spawnFootTrail(interpX + 0.2, interpY + 0.15, interpZ, activeSpeed, 1);

        // Torso & shoulder wind vortex streamers (electric cyan & neon amber)
        this.spawnVortexStreamer(interpX, interpY + 1.1, interpZ, activeSpeed);

        // Hyper-speed warp streaks rushing past
        if (Math.random() < 0.4) {
          this.spawnWarpStreak(interpX, interpY, interpZ, activeSpeed);
        }
      } else if (activeSpeed > 28.0 && Math.random() < 0.35) {
        // High-speed natural running sneaker dust & micro slipstream streamers
        this.spawnFootTrail(interpX - 0.2, interpY + 0.12, interpZ, activeSpeed, -1);
        this.spawnFootTrail(interpX + 0.2, interpY + 0.12, interpZ, activeSpeed, 1);
        if (activeSpeed > 36.0 && Math.random() < 0.25) {
          this.spawnVortexStreamer(interpX, interpY + 1.0, interpZ, activeSpeed);
        }
      }
    }
  }

  /**
   * Jetpack rocket exhaust flame & billow smoke
   */
  private spawnExhaustParticle(
    x: number,
    y: number,
    z: number,
    speed: number,
    side: number
  ) {
    if (this.activeCount >= this.maxParticles) return;

    const p = this.particles[this.activeCount++];
    const spread = 0.08;

    p.x = x + (Math.random() - 0.5) * spread;
    p.y = y + (Math.random() - 0.5) * spread;
    p.z = z - 0.1 - Math.random() * 0.15;

    // Rocket exhaust shoots backwards and down
    p.vx = side * (0.2 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.4;
    p.vy = -1.2 - Math.random() * 1.5;
    p.vz = -speed * 0.6 - (5.0 + Math.random() * 6.0);

    // Color gradient: fiery core (white/yellow) -> plasma cyan -> fading lavender smoke
    const roll = Math.random();
    if (roll < 0.35) {
      // Hot white/bright cyan plasma flame
      p.r = 0.45;
      p.g = 0.95;
      p.b = 1.0;
      p.baseSize = 2.4 + Math.random() * 1.6;
    } else if (roll < 0.7) {
      // Blazing golden flame
      p.r = 1.0;
      p.g = 0.72;
      p.b = 0.15;
      p.baseSize = 2.8 + Math.random() * 1.8;
    } else {
      // Billowing violet/slate smoke plume
      p.r = 0.75;
      p.g = 0.45;
      p.b = 0.98;
      p.baseSize = 3.6 + Math.random() * 2.4;
    }

    p.size = p.baseSize;
    p.alpha = 0.9;
    p.life = 0.35 + Math.random() * 0.35;
    p.maxLife = p.life;
    p.type = 'jetpack';
  }

  /**
   * Fast sparks that pop out of jetpack nozzles
   */
  private spawnSparkParticle(x: number, y: number, z: number, speed: number) {
    if (this.activeCount >= this.maxParticles) return;

    const p = this.particles[this.activeCount++];
    p.x = x;
    p.y = y;
    p.z = z;

    const angle = Math.random() * Math.PI * 2;
    const scatter = 1.5 + Math.random() * 2.5;

    p.vx = Math.cos(angle) * scatter;
    p.vy = -Math.sin(angle) * scatter - 1.0;
    p.vz = -speed * 0.7 - Math.random() * 8.0;

    // Glowing spark: yellow/orange/white
    p.r = 1.0;
    p.g = 0.9 + Math.random() * 0.1;
    p.b = 0.3 + Math.random() * 0.7;
    p.baseSize = 1.6 + Math.random() * 1.2;
    p.size = p.baseSize;
    p.alpha = 1.0;
    p.life = 0.25 + Math.random() * 0.25;
    p.maxLife = p.life;
    p.type = 'spark';
  }

  /**
   * Speed Boost: Neon runner wake trailing behind feet
   */
  private spawnFootTrail(
    x: number,
    y: number,
    z: number,
    speed: number,
    side: number
  ) {
    if (this.activeCount >= this.maxParticles) return;

    const p = this.particles[this.activeCount++];
    p.x = x + (Math.random() - 0.5) * 0.25;
    p.y = y + (Math.random() - 0.5) * 0.15;
    p.z = z - 0.3 - Math.random() * 0.2;

    p.vx = side * (0.4 + Math.random() * 0.6);
    p.vy = 0.4 + Math.random() * 0.8;
    p.vz = -speed * 0.4 - Math.random() * 3.0;

    // Electric cyan and neon gold kick
    if (Math.random() < 0.6) {
      p.r = 0.05;
      p.g = 0.88;
      p.b = 1.0;
    } else {
      p.r = 1.0;
      p.g = 0.82;
      p.b = 0.12;
    }

    p.baseSize = 2.2 + Math.random() * 1.8;
    p.size = p.baseSize;
    p.alpha = 0.85;
    p.life = 0.3 + Math.random() * 0.25;
    p.maxLife = p.life;
    p.type = 'boost';
  }

  /**
   * Speed Boost: Aerodynamic sonic streamer ribbon trailing from upper body
   */
  private spawnVortexStreamer(
    x: number,
    y: number,
    z: number,
    speed: number
  ) {
    if (this.activeCount >= this.maxParticles) return;

    const p = this.particles[this.activeCount++];
    const side = Math.random() < 0.5 ? -0.35 : 0.35;

    p.x = x + side + (Math.random() - 0.5) * 0.2;
    p.y = y + (Math.random() - 0.5) * 0.4;
    p.z = z - 0.25;

    p.vx = side * 0.6 + (Math.random() - 0.5) * 0.3;
    p.vy = (Math.random() - 0.5) * 0.4;
    p.vz = -speed * 0.5 - Math.random() * 4.0;

    // Sonic ribbons: alternating neon cyan and vibrant pink/magenta
    const roll = Math.random();
    if (roll < 0.5) {
      // Cyan
      p.r = 0.15;
      p.g = 0.95;
      p.b = 1.0;
    } else if (roll < 0.8) {
      // Hot magenta
      p.r = 1.0;
      p.g = 0.25;
      p.b = 0.65;
    } else {
      // Pure white sonic shock
      p.r = 1.0;
      p.g = 1.0;
      p.b = 1.0;
    }

    p.baseSize = 2.6 + Math.random() * 2.2;
    p.size = p.baseSize;
    p.alpha = 0.95;
    p.life = 0.4 + Math.random() * 0.3;
    p.maxLife = p.life;
    p.type = 'boost';
  }

  /**
   * Peripheral hyper-speed warp streak rushing past camera
   */
  private spawnWarpStreak(
    x: number,
    y: number,
    z: number,
    speed: number
  ) {
    if (this.activeCount >= this.maxParticles) return;

    const p = this.particles[this.activeCount++];
    // Spawn in runner's peripheral view ahead of camera
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.0 + Math.random() * 3.5;

    p.x = x + Math.cos(angle) * radius;
    p.y = y + Math.sin(angle) * radius + 0.5;
    p.z = z + 6.0 + Math.random() * 8.0;

    p.vx = 0;
    p.vy = 0;
    // Rushes backward at massive relative speed
    p.vz = -speed * 1.8 - 15.0;

    p.r = 0.8 + Math.random() * 0.2;
    p.g = 0.95;
    p.b = 1.0;

    p.baseSize = 2.8 + Math.random() * 2.2;
    p.size = p.baseSize;
    p.alpha = 0.7;
    p.life = 0.22 + Math.random() * 0.15;
    p.maxLife = p.life;
    p.type = 'warp';
  }

  /**
   * Clean up resources
   */
  public destroy() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
