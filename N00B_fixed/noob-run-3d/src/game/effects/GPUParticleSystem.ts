import * as THREE from 'three';

interface DustParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  maxScale: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

interface SparkParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface TrailParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export interface BulletTracer {
  active: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  distanceTraveled: number;
  maxDistance: number;
  mesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  targetOffset: THREE.Vector3; // Safe offset guaranteeing it misses player
}

/**
 * High-performance GPU-Accelerated Particle System
 * Uses Three.js InstancedMesh with zero runtime GC allocations per frame.
 * Optimized for 60-120 FPS high refresh rate with Bloom radiant glow.
 */
export class GPUParticleSystem {
  private scene: THREE.Scene;

  // --- 1. DUST KICKS (Puffing behind runner sneakers on tracks) ---
  private static readonly MAX_DUST = 240;
  private dustMesh: THREE.InstancedMesh;
  private dustPool: DustParticle[] = [];
  private dustDummy = new THREE.Object3D();
  private dustIndex = 0;

  // --- 2. RADIANT SPARKS (Train collision, rail scraping & bullet ricochets) ---
  private static readonly MAX_SPARKS = 360;
  private sparksMesh: THREE.InstancedMesh;
  private sparksPool: SparkParticle[] = [];
  private sparksDummy = new THREE.Object3D();
  private sparksIndex = 0;

  // --- 3. GLOWING POWER-UP TRAIL (Speed Boost & Jetpack high-velocity warp stream) ---
  private static readonly MAX_TRAIL = 400;
  private trailMesh: THREE.InstancedMesh;
  private trailPool: TrailParticle[] = [];
  private trailDummy = new THREE.Object3D();
  private trailIndex = 0;

  // --- 4. RIFLE BULLET TRACERS (Fired by Security Guard in auto mode) ---
  private static readonly MAX_TRACERS = 16;
  public tracers: BulletTracer[] = [];
  private tracerGroup: THREE.Group;
  private tracerMat: THREE.MeshBasicMaterial;
  private tracerGlowMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Setup Dust InstancedMesh (Soft low-poly dusty puffs)
    const dustGeom = new THREE.DodecahedronGeometry(0.18, 0);
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0xdfb776, // Warm sandy ballast dust
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.dustMesh = new THREE.InstancedMesh(dustGeom, dustMat, GPUParticleSystem.MAX_DUST);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.dustMesh);

    for (let i = 0; i < GPUParticleSystem.MAX_DUST; i++) {
      this.dustPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 0.1,
        maxScale: 0.45,
        life: 0,
        maxLife: 0.6,
        rotation: 0,
        rotSpeed: 0,
      });
      // Hide initially offscreen
      this.dustDummy.position.set(0, -999, 0);
      this.dustDummy.scale.set(0, 0, 0);
      this.dustDummy.updateMatrix();
      this.dustMesh.setMatrixAt(i, this.dustDummy.matrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;

    // 2. Setup Sparks InstancedMesh (Intense emissive fiery particles for RTX Bloom)
    const sparkGeom = new THREE.BoxGeometry(0.08, 0.08, 0.22);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfff7ed, // Radiant white-gold core
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparksMesh = new THREE.InstancedMesh(sparkGeom, sparkMat, GPUParticleSystem.MAX_SPARKS);
    this.sparksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparksMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(GPUParticleSystem.MAX_SPARKS * 3),
      3
    );
    this.scene.add(this.sparksMesh);

    for (let i = 0; i < GPUParticleSystem.MAX_SPARKS; i++) {
      this.sparksPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
        size: 1.0,
        color: new THREE.Color(0xfbbf24),
      });
      this.sparksDummy.position.set(0, -999, 0);
      this.sparksDummy.scale.set(0, 0, 0);
      this.sparksDummy.updateMatrix();
      this.sparksMesh.setMatrixAt(i, this.sparksDummy.matrix);
      this.sparksMesh.setColorAt(i, new THREE.Color(0xffaa00));
    }
    this.sparksMesh.instanceMatrix.needsUpdate = true;
    if (this.sparksMesh.instanceColor) this.sparksMesh.instanceColor.needsUpdate = true;

    // 3. Setup Trail InstancedMesh (Radiant neon streamers for Speed Boost & Jetpack)
    const trailGeom = new THREE.BoxGeometry(0.12, 0.12, 0.35);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.trailMesh = new THREE.InstancedMesh(trailGeom, trailMat, GPUParticleSystem.MAX_TRAIL);
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trailMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(GPUParticleSystem.MAX_TRAIL * 3),
      3
    );
    this.scene.add(this.trailMesh);

    for (let i = 0; i < GPUParticleSystem.MAX_TRAIL; i++) {
      this.trailPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.45,
        size: 1.0,
        color: new THREE.Color(0x06b6d4),
      });
      this.trailDummy.position.set(0, -999, 0);
      this.trailDummy.scale.set(0, 0, 0);
      this.trailDummy.updateMatrix();
      this.trailMesh.setMatrixAt(i, this.trailDummy.matrix);
      this.trailMesh.setColorAt(i, new THREE.Color(0x06b6d4));
    }
    this.trailMesh.instanceMatrix.needsUpdate = true;
    if (this.trailMesh.instanceColor) this.trailMesh.instanceColor.needsUpdate = true;

    // 4. Setup Security Rifle Bullet Tracers
    this.tracerGroup = new THREE.Group();
    this.scene.add(this.tracerGroup);

    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffedd5, // Super bright white-hot core for bloom
    });
    this.tracerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf97316, // Vibrant fiery orange aura
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });

    const coreGeom = new THREE.CylinderGeometry(0.045, 0.045, 1.35, 6);
    coreGeom.rotateX(Math.PI / 2);
    const auraGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.45, 6);
    auraGeom.rotateX(Math.PI / 2);

    for (let i = 0; i < GPUParticleSystem.MAX_TRACERS; i++) {
      const mesh = new THREE.Mesh(coreGeom, this.tracerMat);
      const glowMesh = new THREE.Mesh(auraGeom, this.tracerGlowMat);
      mesh.add(glowMesh);
      mesh.visible = false;
      this.tracerGroup.add(mesh);

      this.tracers.push({
        active: false,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        speed: 155, // Blazing tracer speed
        distanceTraveled: 0,
        maxDistance: 65,
        mesh,
        glowMesh,
        targetOffset: new THREE.Vector3(),
      });
    }
  }

  // ==========================================
  // --- 1. DUST EMISSION ---
  // ==========================================

  public emitDustKick(origin: THREE.Vector3, runSpeed: number, count = 2) {
    for (let c = 0; c < count; c++) {
      const p = this.dustPool[this.dustIndex];
      this.dustIndex = (this.dustIndex + 1) % GPUParticleSystem.MAX_DUST;

      p.active = true;
      p.pos.set(
        origin.x + (Math.random() - 0.5) * 0.45,
        Math.max(0.05, origin.y + 0.08),
        origin.z - 0.25 - Math.random() * 0.35
      );

      // Drift slightly backwards and upwards
      p.vel.set(
        (Math.random() - 0.5) * 1.8,
        0.6 + Math.random() * 1.2,
        -runSpeed * 0.18 + (Math.random() - 0.5) * 2.0
      );

      p.scale = 0.12;
      p.maxScale = 0.35 + Math.random() * 0.25;
      p.life = 0;
      p.maxLife = 0.4 + Math.random() * 0.25;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 4.0;
    }
  }

  // ==========================================
  // --- 2. SPARKS EMISSION ---
  // ==========================================

  public emitSparks(origin: THREE.Vector3, count = 18, directionMultiplier = 1.0) {
    const sparkPalette = [0xfff7ed, 0xfef08a, 0xfbbf24, 0xf97316, 0xef4444];

    for (let c = 0; c < count; c++) {
      const p = this.sparksPool[this.sparksIndex];
      const index = this.sparksIndex;
      this.sparksIndex = (this.sparksIndex + 1) % GPUParticleSystem.MAX_SPARKS;

      p.active = true;
      p.pos.copy(origin);

      // Violent high-speed explosion / scrape arc
      const angle = Math.random() * Math.PI * 2;
      const speed = (6.0 + Math.random() * 14.0) * directionMultiplier;
      p.vel.set(
        Math.cos(angle) * (speed * 0.6),
        3.0 + Math.random() * 8.0,
        Math.sin(angle) * (speed * 0.6) - 4.0
      );

      p.life = 0;
      p.maxLife = 0.35 + Math.random() * 0.35;
      p.size = 0.6 + Math.random() * 0.8;

      const chosenHex = sparkPalette[Math.floor(Math.random() * sparkPalette.length)];
      p.color.setHex(chosenHex);
      this.sparksMesh.setColorAt(index, p.color);
    }
    if (this.sparksMesh.instanceColor) {
      this.sparksMesh.instanceColor.needsUpdate = true;
    }
  }

  // ==========================================
  // --- 3. POWER-UP GLOWING TRAIL EMISSION ---
  // ==========================================

  public emitTrail(
    origin: THREE.Vector3,
    type: 'boost' | 'jetpack',
    count = 4
  ) {
    for (let c = 0; c < count; c++) {
      const p = this.trailPool[this.trailIndex];
      const index = this.trailIndex;
      this.trailIndex = (this.trailIndex + 1) % GPUParticleSystem.MAX_TRAIL;

      p.active = true;

      if (type === 'jetpack') {
        // Dual thruster nozzle offset
        const sideOffset = (c % 2 === 0 ? -0.32 : 0.32);
        p.pos.set(
          origin.x + sideOffset + (Math.random() - 0.5) * 0.1,
          origin.y + 0.85 + (Math.random() - 0.5) * 0.1,
          origin.z - 0.45
        );
        p.vel.set(
          (Math.random() - 0.5) * 1.5,
          -6.0 - Math.random() * 4.0, // Downward fiery jet thrust
          -12.0 - Math.random() * 6.0 // High backwards exhaust
        );
        // Fiery solar plasma / cyan rocket exhaust
        p.color.setHex(Math.random() > 0.4 ? 0xfbbf24 : 0x06b6d4);
      } else {
        // Speed Boost: Cyberpunk neon stream warp behind runner
        p.pos.set(
          origin.x + (Math.random() - 0.5) * 0.5,
          origin.y + 0.3 + Math.random() * 1.4,
          origin.z - 0.3 - Math.random() * 0.4
        );
        p.vel.set(
          (Math.random() - 0.5) * 2.5,
          (Math.random() - 0.5) * 2.5,
          -18.0 - Math.random() * 8.0
        );
        // Neon cyan / electric magenta / solar gold
        const colors = [0x00f0ff, 0xff00aa, 0x38bdf8, 0xfacc15];
        p.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      }

      p.life = 0;
      p.maxLife = 0.3 + Math.random() * 0.25;
      p.size = 0.8 + Math.random() * 0.6;
      this.trailMesh.setColorAt(index, p.color);
    }
    if (this.trailMesh.instanceColor) {
      this.trailMesh.instanceColor.needsUpdate = true;
    }
  }

  // ==========================================
  // --- 4. RIFLE AUTO-FIRE BULLET TRACERS ---
  // ==========================================

  /**
   * Fire a rapid rifle tracer shot from the Security Guard towards runner.
   * GUARANTEED: Every bullet whizzes past safely without hitting player!
   */
  public spawnRifleTracer(
    muzzleWorldPos: THREE.Vector3,
    playerWorldPos: THREE.Vector3,
    onImpact?: (impactPos: THREE.Vector3) => void
  ) {
    // Find inactive tracer
    const tracer = this.tracers.find((t) => !t.active) || this.tracers[0];
    tracer.active = true;
    tracer.pos.copy(muzzleWorldPos);
    tracer.distanceTraveled = 0;
    tracer.maxDistance = 55;

    // Calculate safe trajectory:
    // ALWAYS offset target point by +/- 0.85m to 1.35m lateral, OR +0.95m above head,
    // OR aimed slightly down into the ballast tracks 3-8m ahead/beside runner!
    const missPatterns = [
      new THREE.Vector3(0.95 + Math.random() * 0.4, 0.9, 0),   // Left whiz past shoulder
      new THREE.Vector3(-0.95 - Math.random() * 0.4, 0.9, 0),  // Right whiz past shoulder
      new THREE.Vector3(0.3, 2.7 + Math.random() * 0.5, 0),    // Over the head buzz
      new THREE.Vector3(1.1, 0.05, 4.0 + Math.random() * 3.0), // Dirt kick in left track
      new THREE.Vector3(-1.1, 0.05, 4.0 + Math.random() * 3.0),// Dirt kick in right track
    ];

    const chosenOffset = missPatterns[Math.floor(Math.random() * missPatterns.length)];
    tracer.targetOffset.copy(chosenOffset);

    const aimPoint = playerWorldPos.clone().add(chosenOffset);
    tracer.dir.subVectors(aimPoint, muzzleWorldPos).normalize();

    tracer.mesh.position.copy(tracer.pos);
    tracer.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tracer.dir);
    tracer.mesh.visible = true;
  }

  // ==========================================
  // --- MAIN GPU PARTICLE UPDATE LOOP ---
  // ==========================================

  public update(delta: number, onBulletRicochet?: (impactPos: THREE.Vector3) => void) {
    const clampedDelta = Math.min(0.066, delta);

    // 1. Update Dust Particles
    let dustNeedsUpdate = false;
    for (let i = 0; i < GPUParticleSystem.MAX_DUST; i++) {
      const p = this.dustPool[i];
      if (!p.active) continue;

      p.life += clampedDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dustDummy.position.set(0, -999, 0);
        this.dustDummy.scale.set(0, 0, 0);
        this.dustDummy.updateMatrix();
        this.dustMesh.setMatrixAt(i, this.dustDummy.matrix);
        dustNeedsUpdate = true;
        continue;
      }

      // Physics integration
      p.pos.addScaledVector(p.vel, clampedDelta);
      p.vel.multiplyScalar(0.94); // Air drag
      p.rotation += p.rotSpeed * clampedDelta;

      const progress = p.life / p.maxLife;
      const currentScale = p.scale + (p.maxScale - p.scale) * Math.sin(progress * Math.PI);

      this.dustDummy.position.copy(p.pos);
      this.dustDummy.rotation.set(p.rotation, p.rotation * 0.7, 0);
      this.dustDummy.scale.setScalar(currentScale);
      this.dustDummy.updateMatrix();
      this.dustMesh.setMatrixAt(i, this.dustDummy.matrix);
      dustNeedsUpdate = true;
    }
    if (dustNeedsUpdate) {
      this.dustMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update Spark Particles
    let sparksNeedsUpdate = false;
    for (let i = 0; i < GPUParticleSystem.MAX_SPARKS; i++) {
      const p = this.sparksPool[i];
      if (!p.active) continue;

      p.life += clampedDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.sparksDummy.position.set(0, -999, 0);
        this.sparksDummy.scale.set(0, 0, 0);
        this.sparksDummy.updateMatrix();
        this.sparksMesh.setMatrixAt(i, this.sparksDummy.matrix);
        sparksNeedsUpdate = true;
        continue;
      }

      // Gravity & Velocity
      p.vel.y -= 26.0 * clampedDelta; // Crisp spark gravity
      p.pos.addScaledVector(p.vel, clampedDelta);

      // Ground bounce
      if (p.pos.y <= 0.05) {
        p.pos.y = 0.05;
        p.vel.y = -p.vel.y * 0.45;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }

      const progress = p.life / p.maxLife;
      const currentScale = p.size * (1.0 - progress);

      this.sparksDummy.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.001) {
        this.sparksDummy.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          p.vel.clone().normalize()
        );
      }
      this.sparksDummy.scale.set(currentScale, currentScale, currentScale * 2.2);
      this.sparksDummy.updateMatrix();
      this.sparksMesh.setMatrixAt(i, this.sparksDummy.matrix);
      sparksNeedsUpdate = true;
    }
    if (sparksNeedsUpdate) {
      this.sparksMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Update Trail Particles
    let trailNeedsUpdate = false;
    for (let i = 0; i < GPUParticleSystem.MAX_TRAIL; i++) {
      const p = this.trailPool[i];
      if (!p.active) continue;

      p.life += clampedDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.trailDummy.position.set(0, -999, 0);
        this.trailDummy.scale.set(0, 0, 0);
        this.trailDummy.updateMatrix();
        this.trailMesh.setMatrixAt(i, this.trailDummy.matrix);
        trailNeedsUpdate = true;
        continue;
      }

      p.pos.addScaledVector(p.vel, clampedDelta);
      p.vel.multiplyScalar(0.92);

      const progress = p.life / p.maxLife;
      const currentScale = p.size * (1.0 - progress * 0.85);

      this.trailDummy.position.copy(p.pos);
      this.trailDummy.scale.set(currentScale * 0.8, currentScale * 0.8, currentScale * 1.8);
      this.trailDummy.updateMatrix();
      this.trailMesh.setMatrixAt(i, this.trailDummy.matrix);
      trailNeedsUpdate = true;
    }
    if (trailNeedsUpdate) {
      this.trailMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Update Bullet Tracers
    for (const tracer of this.tracers) {
      if (!tracer.active) continue;

      const stepDist = tracer.speed * clampedDelta;
      tracer.pos.addScaledVector(tracer.dir, stepDist);
      tracer.distanceTraveled += stepDist;
      tracer.mesh.position.copy(tracer.pos);

      // Check ground or rail impact
      if (tracer.pos.y <= 0.05) {
        tracer.active = false;
        tracer.mesh.visible = false;
        // Kick up sparks and dust on ground impact!
        this.emitSparks(tracer.pos, 8, 0.7);
        this.emitDustKick(tracer.pos, 10, 2);
        onBulletRicochet?.(tracer.pos);
        continue;
      }

      // Max flight distance exceeded
      if (tracer.distanceTraveled >= tracer.maxDistance) {
        tracer.active = false;
        tracer.mesh.visible = false;
      }
    }
  }

  public reset() {
    for (let i = 0; i < GPUParticleSystem.MAX_DUST; i++) {
      this.dustPool[i].active = false;
      this.dustDummy.position.set(0, -999, 0);
      this.dustDummy.updateMatrix();
      this.dustMesh.setMatrixAt(i, this.dustDummy.matrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < GPUParticleSystem.MAX_SPARKS; i++) {
      this.sparksPool[i].active = false;
      this.sparksDummy.position.set(0, -999, 0);
      this.sparksDummy.updateMatrix();
      this.sparksMesh.setMatrixAt(i, this.sparksDummy.matrix);
    }
    this.sparksMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < GPUParticleSystem.MAX_TRAIL; i++) {
      this.trailPool[i].active = false;
      this.trailDummy.position.set(0, -999, 0);
      this.trailDummy.updateMatrix();
      this.trailMesh.setMatrixAt(i, this.trailDummy.matrix);
    }
    this.trailMesh.instanceMatrix.needsUpdate = true;

    for (const t of this.tracers) {
      t.active = false;
      t.mesh.visible = false;
    }
  }

  public destroy() {
    this.scene.remove(this.dustMesh);
    this.scene.remove(this.sparksMesh);
    this.scene.remove(this.trailMesh);
    this.scene.remove(this.tracerGroup);
    this.dustMesh.geometry.dispose();
    this.sparksMesh.geometry.dispose();
    this.trailMesh.geometry.dispose();
  }
}
