import * as THREE from 'three';
import { PowerUpType } from '../types';

export interface CoinInstance {
  mesh: THREE.Group;
  lane: number;
  zPos: number;
  collected: boolean;
  boundingBox: THREE.Box3;
  update: (delta: number, playerPos: THREE.Vector3, isMagnetActive: boolean) => void;
}

export interface PowerUpInstance {
  mesh: THREE.Group;
  type: PowerUpType;
  lane: number;
  zPos: number;
  collected: boolean;
  boundingBox: THREE.Box3;
  update: (delta: number) => void;
}

export class CollectibleFactory {
  // Reusable materials
  private static coinMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, // Bright gold
    metalness: 0.85,
    roughness: 0.18,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.25, // Lustrous golden glint without blinding bloom
  });

  private static coinRimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0xd97706,
    emissiveIntensity: 0.15,
  });

  // Reusable static geometries to eliminate GPU allocations and GC pauses
  private static coinCylinderGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16);
  private static coinBarGeom = new THREE.BoxGeometry(0.08, 0.44, 0.14);
  private static coinDiagGeom = new THREE.BoxGeometry(0.08, 0.48, 0.14);
  private static haloGeom = new THREE.TorusGeometry(0.85, 0.05, 8, 24);

  // Object Pools
  private static coinPool: CoinInstance[] = [];
  private static powerUpPools: Map<PowerUpType, PowerUpInstance[]> = new Map();

  /**
   * Acquire a coin from object pool or instantiate if pool is dry
   */
  public static getCoin(laneX: number, y: number, zPos: number): CoinInstance {
    const pooled = this.coinPool.pop();
    if (pooled) {
      pooled.mesh.position.set(laneX, y, zPos);
      pooled.mesh.rotation.set(0, Math.random() * Math.PI, 0);
      pooled.mesh.visible = true;
      pooled.lane = laneX;
      pooled.zPos = zPos;
      pooled.collected = false;

      const halfSize = 0.45;
      pooled.boundingBox.min.set(laneX - halfSize, y - halfSize, zPos - halfSize);
      pooled.boundingBox.max.set(laneX + halfSize, y + halfSize, zPos + halfSize);
      return pooled;
    }
    return this.instantiateCoin(laneX, y, zPos);
  }

  /**
   * Return a coin instance back to the object pool
   */
  public static recycleCoin(coin: CoinInstance): void {
    coin.collected = true;
    coin.mesh.visible = false;
    if (coin.mesh.parent) {
      coin.mesh.parent.remove(coin.mesh);
    }
    this.coinPool.push(coin);
  }

  public static createCoin(laneX: number, y: number, zPos: number): CoinInstance {
    return this.getCoin(laneX, y, zPos);
  }

  private static instantiateCoin(laneX: number, y: number, zPos: number): CoinInstance {
    const group = new THREE.Group();
    group.position.set(laneX, y, zPos);

    // Faceted gold coin token (reusing shared static geometry)
    const cylinder = new THREE.Mesh(this.coinCylinderGeom, this.coinMat);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.castShadow = true;
    group.add(cylinder);

    // Embossed center NOOB "N" logo bar (reusing shared static geometry)
    const nBar1 = new THREE.Mesh(this.coinBarGeom, this.coinRimMat);
    nBar1.position.x = -0.15;
    group.add(nBar1);

    const nBar2 = new THREE.Mesh(this.coinBarGeom, this.coinRimMat);
    nBar2.position.x = 0.15;
    group.add(nBar2);

    const nDiag = new THREE.Mesh(this.coinDiagGeom, this.coinRimMat);
    nDiag.rotation.z = -0.65;
    group.add(nDiag);

    const boundingBox = new THREE.Box3();
    const halfSize = 0.45;
    boundingBox.min.set(laneX - halfSize, y - halfSize, zPos - halfSize);
    boundingBox.max.set(laneX + halfSize, y + halfSize, zPos + halfSize);
    const rotSpeed = 3.5;

    const instance: CoinInstance = {
      mesh: group,
      lane: laneX,
      zPos,
      collected: false,
      boundingBox,
      update: (delta: number, playerPos: THREE.Vector3, isMagnetActive: boolean) => {
        if (instance.collected) return;

        // Continuous rotation (does not affect axis-aligned bounding box size)
        group.rotation.y += rotSpeed * delta;

        // Magnet attraction logic
        if (isMagnetActive) {
          const dist = group.position.distanceTo(playerPos);
          if (dist < 18.0) {
            // Smoothly fly towards player
            group.position.lerp(playerPos, delta * 14.0);
            boundingBox.min.set(group.position.x - halfSize, group.position.y - halfSize, group.position.z - halfSize);
            boundingBox.max.set(group.position.x + halfSize, group.position.y + halfSize, group.position.z + halfSize);
          }
        }
      },
    };

    instance.update(0, new THREE.Vector3(), false);
    return instance;
  }

  /**
   * Acquire a power-up from object pool or instantiate if needed
   */
  public static getPowerUp(type: PowerUpType, laneX: number, y: number, zPos: number): PowerUpInstance {
    let pool = this.powerUpPools.get(type);
    if (!pool) {
      pool = [];
      this.powerUpPools.set(type, pool);
    }

    const pooled = pool.pop();
    if (pooled) {
      pooled.mesh.position.set(laneX, y, zPos);
      pooled.mesh.rotation.set(0, 0, 0);
      pooled.mesh.visible = true;
      pooled.lane = laneX;
      pooled.zPos = zPos;
      pooled.collected = false;
      pooled.boundingBox.setFromObject(pooled.mesh);
      return pooled;
    }

    return this.instantiatePowerUp(type, laneX, y, zPos);
  }

  /**
   * Return a power-up instance back to the object pool
   */
  public static recyclePowerUp(powerUp: PowerUpInstance): void {
    powerUp.collected = true;
    powerUp.mesh.visible = false;
    if (powerUp.mesh.parent) {
      powerUp.mesh.parent.remove(powerUp.mesh);
    }
    let pool = this.powerUpPools.get(powerUp.type);
    if (!pool) {
      pool = [];
      this.powerUpPools.set(powerUp.type, pool);
    }
    pool.push(powerUp);
  }

  public static createPowerUp(type: PowerUpType, laneX: number, y: number, zPos: number): PowerUpInstance {
    return this.getPowerUp(type, laneX, y, zPos);
  }

  private static instantiatePowerUp(type: PowerUpType, laneX: number, y: number, zPos: number): PowerUpInstance {
    const group = new THREE.Group();
    group.position.set(laneX, y, zPos);

    // Glowing halo ring around every powerup pickup (reusing shared static geometry)
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    const halo = new THREE.Mesh(this.haloGeom, haloMat);
    group.add(halo);

    switch (type) {
      case 'magnet':
        haloMat.color.set(0xf43f5e); // Rose red
        this.buildMagnetMesh(group);
        break;

      case 'shield':
        haloMat.color.set(0x06b6d4); // Cyan
        this.buildShieldMesh(group);
        break;

      case 'multiplier':
        haloMat.color.set(0xeab308); // Gold Yellow
        this.buildMultiplierMesh(group);
        break;

      case 'boost':
        haloMat.color.set(0x10b981); // Emerald Green
        this.buildBoostMesh(group);
        break;

      case 'jetpack':
        haloMat.color.set(0x38bdf8); // Sky Blue
        this.buildJetpackMesh(group);
        break;
    }

    const boundingBox = new THREE.Box3();
    let animTime = 0;

    const instance: PowerUpInstance = {
      mesh: group,
      type,
      lane: laneX,
      zPos,
      collected: false,
      boundingBox,
      update: (delta: number) => {
        if (instance.collected) return;
        animTime += delta;

        // Bobbing & floating
        group.position.y = y + Math.sin(animTime * 4) * 0.18;
        group.rotation.y += delta * 2.5;
        halo.rotation.x = Math.sin(animTime * 3) * 0.5;

        boundingBox.setFromObject(group);
      },
    };

    instance.update(0);
    return instance;
  }

  // 1. Horseshoe Magnet
  private static buildMagnetMesh(root: THREE.Group) {
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.5 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });

    // U-bend torus curve
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.12, 12, 16, Math.PI),
      redMat
    );
    root.add(arc);

    // Tips
    [-0.4, 0.4].forEach((tx) => {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.24), silverMat);
      tip.position.set(tx, -0.2, 0);
      root.add(tip);
    });
  }

  // 2. Shield Orb
  private static buildShieldMesh(root: THREE.Group) {
    const shieldOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 2),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        roughness: 0.1,
        metalness: 0.8,
        emissive: 0x0891b2,
        emissiveIntensity: 0.5,
      })
    );
    root.add(shieldOrb);

    const orbitRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.04, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
    );
    orbitRing.rotation.x = Math.PI / 3;
    root.add(orbitRing);
  }

  // 3. Multiplier "2X" Badge
  private static buildMultiplierMesh(root: THREE.Group) {
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xca8a04,
      emissiveIntensity: 0.4,
    });

    const starBadge = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), badgeMat);
    starBadge.rotation.x = Math.PI / 2;
    root.add(starBadge);

    // 2X cross bars
    const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    x1.rotation.z = Math.PI / 4;
    x1.position.x = 0.18;
    root.add(x1);

    const x2 = x1.clone();
    x2.rotation.z = -Math.PI / 4;
    root.add(x2);

    // '2' shape
    const num2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    num2.position.x = -0.18;
    root.add(num2);
  }

  // 4. Boost Super-Sneaker / Lightning
  private static buildBoostMesh(root: THREE.Group) {
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.5,
      roughness: 0.2,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
    });

    const sneaker = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.7), greenMat);
    root.add(sneaker);

    // Glowing speed wing
    const wingGeom = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.2, 0, 0,
      -0.6, 0.3, -0.3,
      -0.2, 0.2, 0.2,
    ]);
    wingGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    root.add(new THREE.Mesh(wingGeom, new THREE.MeshBasicMaterial({ color: 0xa7f3d0, side: THREE.DoubleSide })));
  }

  // 5. Twin Jetpack Thruster
  private static buildJetpackMesh(root: THREE.Group) {
    const cyanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.7,
      roughness: 0.3,
    });
    const nozzMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    [-0.25, 0.25].forEach((jx) => {
      const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.65, 12), cyanMat);
      rocket.position.x = jx;
      root.add(rocket);

      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 8), nozzMat);
      nozzle.rotation.x = Math.PI;
      nozzle.position.set(jx, -0.4, 0);
      root.add(nozzle);
    });

    // Connecting bridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), cyanMat);
    root.add(bridge);
  }
}
