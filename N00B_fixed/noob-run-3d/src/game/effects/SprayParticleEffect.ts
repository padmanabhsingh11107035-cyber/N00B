import * as THREE from 'three';

interface SprayParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
}

export class SprayParticleEffect {
  public group: THREE.Group;
  private particleCount = 120;
  private particles: SprayParticle[] = [];
  private pointsMesh: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;

  public isSpraying = false;
  private sprayOrigin = new THREE.Vector3();
  private sprayTarget = new THREE.Vector3();
  private palette = [
    new THREE.Color(0xf43f5e), // Neon Pink/Rose
    new THREE.Color(0x06b6d4), // Cyan Electric
    new THREE.Color(0xfacc15), // Neon Yellow
    new THREE.Color(0x10b981), // Emerald Lime
    new THREE.Color(0xa855f7), // Purple Mist
  ];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.positions = new Float32Array(this.particleCount * 3);
    this.colors = new Float32Array(this.particleCount * 3);
    this.sizes = new Float32Array(this.particleCount);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Particle sprite texture generated procedurally
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.8, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const pMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(this.geometry, pMat);
    this.group.add(this.pointsMesh);

    // Initialize all inactive
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        color: new THREE.Color(0xffffff),
        size: 0,
        life: 0,
        maxLife: 0.4,
      });
    }
  }

  public setSpray(spraying: boolean, origin?: THREE.Vector3, target?: THREE.Vector3) {
    this.isSpraying = spraying;
    if (origin) this.sprayOrigin.copy(origin);
    if (target) this.sprayTarget.copy(target);
  }

  public update(delta: number) {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;

    // Spawn new spray particles if active
    if (this.isSpraying) {
      const spawnCount = Math.min(10, Math.floor(delta * 220));
      let spawned = 0;

      for (let i = 0; i < this.particleCount && spawned < spawnCount; i++) {
        const p = this.particles[i];
        if (p.life <= 0) {
          p.life = 0.25 + Math.random() * 0.25;
          p.maxLife = p.life;
          p.pos.copy(this.sprayOrigin);

          // Direction towards target with spray cone dispersion
          const dir = new THREE.Vector3().subVectors(this.sprayTarget, this.sprayOrigin).normalize();
          const spread = 0.45;
          dir.x += (Math.random() - 0.5) * spread;
          dir.y += (Math.random() - 0.5) * spread;
          dir.z += (Math.random() - 0.5) * spread;
          dir.normalize();

          const speed = 4.5 + Math.random() * 3.5;
          p.vel.copy(dir).multiplyScalar(speed);

          // Random vibrant color from palette
          const col = this.palette[Math.floor(Math.random() * this.palette.length)];
          p.color.copy(col);

          p.size = 0.12 + Math.random() * 0.16;
          spawned++;
        }
      }
    }

    // Update existing particles
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= delta;
        p.pos.addScaledVector(p.vel, delta);
        // Paint gravity drop and air drag
        p.vel.y -= delta * 1.8;
        p.vel.multiplyScalar(0.97);

        const progress = 1 - p.life / p.maxLife;
        const fade = Math.sin(progress * Math.PI);

        this.positions[i * 3] = p.pos.x;
        this.positions[i * 3 + 1] = p.pos.y;
        this.positions[i * 3 + 2] = p.pos.z;

        this.colors[i * 3] = p.color.r * fade;
        this.colors[i * 3 + 1] = p.color.g * fade;
        this.colors[i * 3 + 2] = p.color.b * fade;
      } else {
        this.positions[i * 3 + 1] = -999;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  public reset() {
    this.isSpraying = false;
    for (let i = 0; i < this.particleCount; i++) {
      this.particles[i].life = 0;
      this.positions[i * 3 + 1] = -999;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  public destroy() {
    this.geometry.dispose();
    this.group.parent?.remove(this.group);
  }
}
