import * as THREE from 'three';
import { TrainType } from '../types';

export interface TrainInstance {
  mesh: THREE.Group;
  type: TrainType;
  lane: number;
  length: number;
  width: number;
  height: number;
  speed: number; // positive = oncoming towards player, 0 = stationary
  boundingBox: THREE.Box3;
  headlights: THREE.PointLight[];
  strobeLight?: THREE.PointLight;
  strobeMesh?: THREE.Mesh;
  wheels: THREE.Mesh[];
  hasWarnedHorn?: boolean;
  surfed?: boolean;
  cleared?: boolean;
  dodged?: boolean;
  initialZ?: number;
  isPassed?: boolean;
  hasRamp?: boolean;
  rampLength?: number;
  reset?: (laneX: number, zPos: number, speed: number, hasRamp?: boolean) => void;
  update: (delta: number, playerZ?: number) => void;
}

export class TrainFactory {
  // Reusable materials cache to optimize draw calls and memory
  private static materialsCache: Map<string, THREE.Material> = new Map();
  private static pools: Map<TrainType, TrainInstance[]> = new Map();

  private static getMaterial(key: string, creator: () => THREE.Material): THREE.Material {
    if (!this.materialsCache.has(key)) {
      this.materialsCache.set(key, creator());
    }
    return this.materialsCache.get(key)!;
  }

  /**
   * Acquire a train from the object pool or instantiate if needed
   */
  public static getTrain(type: TrainType, laneX: number, zPos: number, speed = 0, hasRamp = false): TrainInstance {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = [];
      this.pools.set(type, pool);
    }

    const pooled = pool.pop();
    if (pooled) {
      if (pooled.reset) {
        pooled.reset(laneX, zPos, speed, hasRamp);
      } else {
        pooled.mesh.position.set(laneX, 0, zPos);
        pooled.mesh.visible = true;
        pooled.lane = laneX;
        pooled.speed = speed;
        pooled.hasRamp = hasRamp;
        pooled.cleared = false;
        pooled.surfed = false;
        pooled.dodged = false;
        pooled.hasWarnedHorn = false;
        pooled.initialZ = zPos;
        pooled.isPassed = false;
        pooled.boundingBox.min.set(laneX - pooled.width / 2 + 0.15, 0.2, zPos - pooled.length / 2);
        pooled.boundingBox.max.set(laneX + pooled.width / 2 - 0.15, pooled.height, zPos + pooled.length / 2);
        if (pooled.strobeMesh) {
          pooled.strobeMesh.visible = speed > 0;
        }
      }
      return pooled;
    }

    return this.instantiateTrain(type, laneX, zPos, speed, hasRamp);
  }

  /**
   * Return a train back to the object pool
   */
  public static recycleTrain(train: TrainInstance): void {
    train.cleared = true;
    train.mesh.visible = false;
    train.hasRamp = false;
    if (train.mesh.parent) {
      train.mesh.parent.remove(train.mesh);
    }
    let pool = this.pools.get(train.type);
    if (!pool) {
      pool = [];
      this.pools.set(train.type, pool);
    }
    pool.push(train);
  }

  public static createTrain(type: TrainType, laneX: number, zPos: number, speed = 0, hasRamp = false): TrainInstance {
    return this.getTrain(type, laneX, zPos, speed, hasRamp);
  }

  private static instantiateTrain(type: TrainType, laneX: number, zPos: number, speed = 0, hasRamp = false): TrainInstance {
    const group = new THREE.Group();
    group.position.set(laneX, 0, zPos);

    let length = 22.0;
    let width = 2.45;
    let height = 3.3;

    if (type === 'double_decker_passenger') {
      length = 74.0;
      width = 2.55;
      height = 4.85;
    } else if (type === 'double_decker_goods') {
      length = 78.0;
      width = 2.65;
      height = 5.15;
    }

    const headlights: THREE.PointLight[] = [];
    const wheels: THREE.Mesh[] = [];
    let strobeLight: THREE.PointLight | undefined;
    let strobeMesh: THREE.Mesh | undefined;

    switch (type) {
      case 'modern_metro':
        this.buildModernMetro(group, length, width, height, headlights, wheels);
        break;
      case 'red_city':
        this.buildRedCity(group, length, width, height, headlights, wheels);
        break;
      case 'classic_rail':
        this.buildClassicRail(group, length, width, height, headlights, wheels);
        break;
      case 'street_art':
        this.buildStreetArt(group, length, width, height, headlights, wheels);
        break;
      case 'futuristic':
        this.buildFuturistic(group, length, width, height, headlights, wheels);
        break;
      case 'double_decker_passenger':
        this.buildDoubleDeckerPassenger(group, length, width, height, headlights, wheels);
        break;
      case 'double_decker_goods':
        this.buildDoubleDeckerGoods(group, length, width, height, headlights, wheels);
        break;
    }

    // Always create rooftop warning beacon once, and toggle visibility on reset
    const beaconGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.28, 12);
    const beaconMat = this.getMaterial('strobe_amber_mat', () =>
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    strobeMesh = new THREE.Mesh(beaconGeom, beaconMat);
    strobeMesh.position.set(0, height + 0.16, -length / 2 + 1.2);
    strobeMesh.visible = speed > 0;
    group.add(strobeMesh);

    const boundingBox = new THREE.Box3();
    // Fast direct AABB calculation
    boundingBox.min.set(laneX - width / 2 + 0.15, 0.2, zPos - length / 2);
    boundingBox.max.set(laneX + width / 2 - 0.15, height, zPos + length / 2);

    const rampLength = height > 4.0 ? 12.0 : 8.5;

    const instance: TrainInstance = {
      mesh: group,
      type,
      lane: laneX,
      length,
      width,
      height,
      speed,
      hasRamp,
      rampLength,
      boundingBox,
      headlights,
      strobeLight,
      strobeMesh,
      wheels,
      hasWarnedHorn: false,
      initialZ: zPos,
      isPassed: false,
      reset: (newLane: number, newZ: number, newSpeed: number, newHasRamp = false) => {
        group.position.set(newLane, 0, newZ);
        group.visible = true;
        instance.lane = newLane;
        instance.speed = newSpeed;
        instance.hasRamp = newHasRamp;
        instance.cleared = false;
        instance.surfed = false;
        instance.dodged = false;
        instance.hasWarnedHorn = false;
        instance.initialZ = newZ;
        instance.isPassed = false;
        boundingBox.min.set(newLane - width / 2 + 0.15, 0.2, newZ - length / 2);
        boundingBox.max.set(newLane + width / 2 - 0.15, height, newZ + length / 2);
        if (strobeMesh) {
          strobeMesh.visible = newSpeed > 0;
        }
      },
      update: (delta: number, playerZ?: number) => {
        // Move oncoming train along -Z towards player (player moves along +Z)
        if (instance.speed > 0) {
          // Approach window pacing: only move when runner approaches within 90m
          if (playerZ !== undefined) {
            const frontZ = group.position.z - length / 2;
            const rearZ = group.position.z + length / 2;
            const distToFront = frontZ - playerZ;

            // Far ahead (> 95m): wait before moving so oncoming train doesn't travel prematurely
            if (distToFront > 95) {
              return;
            }

            // Once the entire train (including rear) has safely cleared behind runner (> 12m behind),
            // clear hitbox and mark passed
            if (rearZ < playerZ - 12) {
              if (!instance.isPassed) {
                instance.isPassed = true;
                instance.cleared = true;
                boundingBox.makeEmpty();
              }
              return;
            }
          }

          // Move oncoming train continuously towards runner!
          group.position.z -= instance.speed * delta;

          // Rotate wheels
          for (let i = 0; i < wheels.length; i++) {
            wheels[i].rotation.x += instance.speed * delta * 3.5;
          }

          // Flash rooftop hazard beacon (optimized emissive pulse, zero point light cost)
          if (strobeMesh && strobeMesh.visible) {
            const flash = Math.sin(performance.now() * 0.02) > 0;
            (strobeMesh.material as THREE.MeshBasicMaterial).color.setHex(flash ? 0xfbbf24 : 0x78350f);
          }

          // Update bounding box directly
          if (!instance.isPassed) {
            boundingBox.min.z = group.position.z - length / 2;
            boundingBox.max.z = group.position.z + length / 2;
          }
        }
      },
    };

    instance.update(0);
    return instance;
  }

  // --- TRAIN 1: MODERN METRO (Lead Aerodynamic Engine + Articulated Passenger Boggie Coach) ---
  private static buildModernMetro(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const bodyMat = this.getMaterial('modern_body', () =>
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 })
    );
    const blueStripeMat = this.getMaterial('modern_stripe', () =>
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
    );
    const windowMat = this.getMaterial('tinted_glass', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    );
    const darkMetal = this.getMaterial('dark_metal', () =>
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.5 })
    );

    const carLen = 10.2;

    // 1. LEAD LOCOMOTIVE ENGINE (Front Car: z = -5.5m)
    const engineZ = -5.5;
    const engineBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, h - 0.6, carLen),
      bodyMat
    );
    engineBody.position.set(0, (h - 0.6) / 2 + 0.6, engineZ);
    engineBody.castShadow = true;
    engineBody.receiveShadow = true;
    root.add(engineBody);

    // Engine blue skirt
    const engineSkirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.5, carLen), blueStripeMat);
    engineSkirt.position.set(0, 0.85, engineZ);
    root.add(engineSkirt);

    // Aerodynamic nose cap at FRONT facing oncoming runner (-Z direction)
    const noseGeom = new THREE.CylinderGeometry(w / 2, w / 2, 0.8, 16, 1, false, 0, Math.PI);
    const nose = new THREE.Mesh(noseGeom, bodyMat);
    nose.rotation.z = Math.PI / 2;
    nose.rotation.y = Math.PI / 2;
    nose.position.set(0, h * 0.55, -len / 2 - 0.3);
    root.add(nose);

    // Large tinted front cockpit windshield
    const frontWindshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.9, 0.1), windowMat);
    frontWindshield.position.set(0, h * 0.65, -len / 2 - 0.05);
    root.add(frontWindshield);

    // Engine side windows
    for (let z = -9.0; z <= -3.0; z += 2.8) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 1.6), windowMat);
      winL.position.set(-w / 2 - 0.02, h * 0.65, z);
      root.add(winL);
      const winR = winL.clone();
      winR.position.x = w / 2 + 0.02;
      root.add(winR);
    }

    // Engine rooftop AC pod
    const engineAC = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.4), darkMetal);
    engineAC.position.set(0, h + 0.15, -5.5);
    root.add(engineAC);

    // 2. ARTICULATED GANGWAY JOINT & COUPLER (Between Engine and Trailing Boggie at z = 0)
    this.addGangwayJoint(root, w, h, 0);

    // 3. TRAILING PASSENGER BOGGIE COACH (Rear Car: z = 5.5m)
    const coachZ = 5.5;
    const coachBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, h - 0.6, carLen),
      bodyMat
    );
    coachBody.position.set(0, (h - 0.6) / 2 + 0.6, coachZ);
    coachBody.castShadow = true;
    coachBody.receiveShadow = true;
    root.add(coachBody);

    const coachSkirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.5, carLen), blueStripeMat);
    coachSkirt.position.set(0, 0.85, coachZ);
    root.add(coachSkirt);

    // Coach passenger observation windows
    for (let z = 2.0; z <= 9.0; z += 2.4) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 1.6), windowMat);
      winL.position.set(-w / 2 - 0.02, h * 0.65, z);
      root.add(winL);
      const winR = winL.clone();
      winR.position.x = w / 2 + 0.02;
      root.add(winR);
    }

    // Coach passenger boarding doors
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 1.3), darkMetal);
    doorL.position.set(-w / 2 - 0.02, 1.6, 5.5);
    root.add(doorL);
    const doorR = doorL.clone();
    doorR.position.x = w / 2 + 0.02;
    root.add(doorR);

    // Coach dual rooftop AC units
    [3.5, 7.5].forEach((az) => {
      const acUnit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.0), darkMetal);
      acUnit.position.set(0, h + 0.15, az);
      root.add(acUnit);
    });

    // Front Pilot / Cowcatcher track plow at -len / 2
    this.addFrontPlow(root, w, -len / 2 - 0.25, 0.55);

    // Headlights facing oncoming runner (-Z)
    this.addHeadlights(root, w, -len / 2 - 0.15, 0.95, 0x38bdf8, lights);

    // Red taillights at back of coach (+len / 2)
    this.addTaillights(root, w, len / 2 + 0.05, 1.2);

    // 4 Bogie Truck Assemblies (under Engine and Trailing Boggie)
    this.addBogies(root, len, w, wheels);
  }

  // --- TRAIN 2: RED CITY METRO (Red Lead Engine + Commuter Boggie Coach) ---
  private static buildRedCity(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const redMat = this.getMaterial('red_city_mat', () =>
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.1 })
    );
    const silverMat = this.getMaterial('silver_mat', () =>
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.8 })
    );
    const windowMat = this.getMaterial('tinted_glass', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    );

    const carLen = 10.2;

    // 1. LEAD RED ENGINE CAR (z = -5.5m)
    const engineZ = -5.5;
    const lowerEngine = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, carLen), redMat);
    lowerEngine.position.set(0, 1.3, engineZ);
    lowerEngine.castShadow = true;
    lowerEngine.receiveShadow = true;
    root.add(lowerEngine);

    const silverEngineMid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 1.0, carLen), silverMat);
    silverEngineMid.position.set(0, 2.4, engineZ);
    root.add(silverEngineMid);

    const redEngineRoof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, carLen), redMat);
    redEngineRoof.position.set(0, 3.1, engineZ);
    root.add(redEngineRoof);

    // Angular wedge front at -len / 2 facing player
    const frontWedge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 1.2, 0.8), redMat);
    frontWedge.rotation.x = 0.15;
    frontWedge.position.set(0, 1.6, -len / 2 - 0.3);
    root.add(frontWedge);

    // Front high-vis windshield
    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.82, 0.1), windowMat);
    frontGlass.position.set(0, 2.3, -len / 2 - 0.35);
    root.add(frontGlass);

    // Engine side doors
    const eDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 1.4), silverMat);
    eDoorL.position.set(-w / 2 - 0.02, 1.6, -5.5);
    root.add(eDoorL);
    const eDoorR = eDoorL.clone();
    eDoorR.position.x = w / 2 + 0.02;
    root.add(eDoorR);

    // 2. ARTICULATED GANGWAY JOINT & COUPLER (z = 0)
    this.addGangwayJoint(root, w, h, 0);

    // 3. TRAILING COMMUTER BOGGIE COACH (z = 5.5m)
    const coachZ = 5.5;
    const lowerCoach = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, carLen), redMat);
    lowerCoach.position.set(0, 1.3, coachZ);
    lowerCoach.castShadow = true;
    lowerCoach.receiveShadow = true;
    root.add(lowerCoach);

    const silverCoachMid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 1.0, carLen), silverMat);
    silverCoachMid.position.set(0, 2.4, coachZ);
    root.add(silverCoachMid);

    const redCoachRoof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, carLen), redMat);
    redCoachRoof.position.set(0, 3.1, coachZ);
    root.add(redCoachRoof);

    // Coach passenger doors & observation windows
    [3.2, 7.8].forEach((dz) => {
      const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 1.3), silverMat);
      doorL.position.set(-w / 2 - 0.02, 1.6, dz);
      root.add(doorL);
      const doorR = doorL.clone();
      doorR.position.x = w / 2 + 0.02;
      root.add(doorR);
    });

    for (let z = 1.6; z <= 9.2; z += 2.4) {
      if (Math.abs(z - 3.2) > 0.8 && Math.abs(z - 7.8) > 0.8) {
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.2), windowMat);
        winL.position.set(-w / 2 - 0.02, 2.4, z);
        root.add(winL);
        const winR = winL.clone();
        winR.position.x = w / 2 + 0.02;
        root.add(winR);
      }
    }

    this.addFrontPlow(root, w, -len / 2 - 0.25, 0.55);
    this.addHeadlights(root, w, -len / 2 - 0.35, 1.25, 0xfef08a, lights);
    this.addTaillights(root, w, len / 2 + 0.05, 1.25);
    this.addBogies(root, len, w, wheels);
  }

  // --- TRAIN 3: CLASSIC RAIL (Vintage Steam Locomotive Engine + Mahogany Coach Boggie) ---
  private static buildClassicRail(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const vintageMat = this.getMaterial('vintage_body', () =>
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6, metalness: 0.4 })
    );
    const coachWoodMat = this.getMaterial('coach_wood', () =>
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7, metalness: 0.2 })
    );
    const brassMat = this.getMaterial('vintage_brass', () =>
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.9 })
    );
    const blackIron = this.getMaterial('black_iron', () =>
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.6 })
    );
    const windowMat = this.getMaterial('warm_glass', () =>
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );

    const carLen = 10.2;

    // 1. LEAD STEAM LOCOMOTIVE ENGINE (z = -5.5m)
    // Cylindrical boiler barrel
    const boilerGeom = new THREE.CylinderGeometry(w * 0.46, w * 0.46, 7.2, 20);
    const boiler = new THREE.Mesh(boilerGeom, vintageMat);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.8, -7.0);
    boiler.castShadow = true;
    root.add(boiler);

    // Brass boiler rings
    [-9.5, -7.5, -5.5].forEach((rz) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.47, 0.04, 8, 24), brassMat);
      ring.position.set(0, 1.8, rz);
      root.add(ring);
    });

    // Steam locomotive driver cabin at rear of engine
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w, 2.1, 3.4), vintageMat);
    cab.position.set(0, 2.2, -2.2);
    cab.castShadow = true;
    root.add(cab);

    // Vintage chimney smoke funnel near front
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.9, 12), blackIron);
    funnel.position.set(0, 3.1, -9.2);
    root.add(funnel);

    // Dome steam valve
    const steamDome = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), brassMat);
    steamDome.position.set(0, 2.7, -6.8);
    root.add(steamDome);

    // Vintage steel cowcatcher grill at front (-len / 2)
    const cowcatcher = new THREE.Mesh(new THREE.ConeGeometry(w * 0.68, 1.3, 4), blackIron);
    cowcatcher.rotation.x = Math.PI / 2;
    cowcatcher.position.set(0, 0.6, -len / 2 - 0.7);
    root.add(cowcatcher);

    // Classic prominent central brass locomotive lantern
    const bigLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.35, 16), brassMat);
    bigLamp.rotation.x = Math.PI / 2;
    bigLamp.position.set(0, 2.2, -len / 2 - 0.15);
    root.add(bigLamp);

    // Glowing warm lamp lens (optimized emissive glow, zero point light overhead)
    const lanternLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffedd5 })
    );
    lanternLens.position.set(0, 2.2, -len / 2 - 0.35);
    root.add(lanternLens);

    // 2. ARTICULATED HEAVY IRON DRAWBAR JOINT (z = 0)
    this.addGangwayJoint(root, w, h, 0);

    // 3. TRAILING VINTAGE PASSENGER COACH BOGGIE (z = 5.5m)
    const coachZ = 5.5;
    const coachBody = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, carLen), coachWoodMat);
    coachBody.position.set(0, 1.7, coachZ);
    coachBody.castShadow = true;
    coachBody.receiveShadow = true;
    root.add(coachBody);

    // Clerestory raised ventilation roof deck
    const clerestory = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, 0.5, carLen), blackIron);
    clerestory.position.set(0, 2.95, coachZ);
    root.add(clerestory);

    // Arched warm-glowing coach passenger windows
    for (let z = 1.8; z <= 9.2; z += 1.8) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.95), windowMat);
      winL.position.set(-w / 2 - 0.02, 2.1, z);
      root.add(winL);
      const winR = winL.clone();
      winR.position.x = w / 2 + 0.02;
      root.add(winR);
    }

    // Rear brass railed observation platform
    const platformRailing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.8, 0.1), brassMat);
    platformRailing.position.set(0, 1.4, len / 2 + 0.05);
    root.add(platformRailing);

    this.addTaillights(root, w, len / 2 + 0.05, 1.4);
    this.addBogies(root, len, w, wheels);
  }

  // --- TRAIN 4: STREET-ART TRAIN (Graffiti Engine + Urban Tagged Boggie Coach) ---
  private static buildStreetArt(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const streetBase = this.getMaterial('street_base', () =>
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.2 })
    );
    const graffitiMat1 = this.getMaterial('graf_1', () =>
      new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.4 }) // Pink
    );
    const graffitiMat2 = this.getMaterial('graf_2', () =>
      new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4 }) // Purple
    );
    const graffitiMat3 = this.getMaterial('graf_3', () =>
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 }) // Emerald
    );
    const graffitiMat4 = this.getMaterial('graf_4', () =>
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 }) // Amber
    );

    const carLen = 10.2;
    const graffitiMats = [graffitiMat1, graffitiMat2, graffitiMat3, graffitiMat4];

    // 1. LEAD STREET-ART ENGINE (z = -5.5m)
    const engineBody = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.5, carLen), streetBase);
    engineBody.position.set(0, (h - 0.5) / 2 + 0.5, -5.5);
    engineBody.castShadow = true;
    engineBody.receiveShadow = true;
    root.add(engineBody);

    // Front graffiti stencil tag
    const frontTag = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 1.1, 0.05), graffitiMat1);
    frontTag.position.set(0, 1.5, -len / 2 - 0.03);
    root.add(frontTag);

    // Engine side graffiti splash panels
    for (let z = -9.2; z <= -2.0; z += 2.2) {
      const mat = graffitiMats[Math.floor(Math.abs(z * 3)) % graffitiMats.length];
      const splashL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 1.8), mat);
      splashL.position.set(-w / 2 - 0.02, 1.5, z);
      root.add(splashL);
      const splashR = splashL.clone();
      splashR.position.x = w / 2 + 0.02;
      root.add(splashR);
    }

    // 2. ARTICULATED GANGWAY JOINT & COUPLER (z = 0)
    this.addGangwayJoint(root, w, h, 0);

    // 3. TRAILING STREET-ART BOGGIE COACH (z = 5.5m)
    const coachBody = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.5, carLen), streetBase);
    coachBody.position.set(0, (h - 0.5) / 2 + 0.5, 5.5);
    coachBody.castShadow = true;
    coachBody.receiveShadow = true;
    root.add(coachBody);

    // Coach side graffiti wildstyle panels
    for (let z = 1.8; z <= 9.2; z += 2.2) {
      const mat = graffitiMats[Math.floor(Math.abs(z * 4.5)) % graffitiMats.length];
      const splashL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 1.8), mat);
      splashL.position.set(-w / 2 - 0.02, 1.5, z);
      root.add(splashL);
      const splashR = splashL.clone();
      splashR.position.x = w / 2 + 0.02;
      root.add(splashR);
    }

    this.addFrontPlow(root, w, -len / 2 - 0.25, 0.55);
    this.addHeadlights(root, w, -len / 2 - 0.15, 1.1, 0xf43f5e, lights);
    this.addTaillights(root, w, len / 2 + 0.05, 1.2);
    this.addBogies(root, len, w, wheels);
  }

  // --- TRAIN 5: FUTURISTIC METRO (Cyberpunk Lead Engine + Trailing Maglev Boggie Pod) ---
  private static buildFuturistic(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const cyberMat = this.getMaterial('cyber_body', () =>
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.9 })
    );
    const neonCyan = this.getMaterial('neon_cyan', () =>
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    const neonPink = this.getMaterial('neon_pink', () =>
      new THREE.MeshBasicMaterial({ color: 0xff007f })
    );

    const carLen = 10.2;

    // 1. LEAD CYBER LOCOMOTIVE ENGINE (z = -5.5m)
    const engineHull = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.6, carLen), cyberMat);
    engineHull.position.set(0, (h - 0.6) / 2 + 0.6, -5.5);
    engineHull.castShadow = true;
    engineHull.receiveShadow = true;
    root.add(engineHull);

    // Holographic digital front visor at -len / 2
    const holoVisor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.65, 0.1), neonCyan);
    holoVisor.position.set(0, 2.1, -len / 2 - 0.05);
    root.add(holoVisor);

    // Engine neon racing stripes
    const engineStripL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, carLen), neonCyan);
    engineStripL.position.set(-w / 2 - 0.02, 2.2, -5.5);
    root.add(engineStripL);
    const engineStripR = engineStripL.clone();
    engineStripR.position.x = w / 2 + 0.02;
    root.add(engineStripR);

    // Floating Maglev undercarriage blue glow lines
    const eGlow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.15, carLen * 0.95), neonCyan);
    eGlow.position.set(0, 0.35, -5.5);
    root.add(eGlow);

    // 2. ARTICULATED CYBERNETIC GANGWAY JOINT (z = 0)
    this.addGangwayJoint(root, w, h, 0);

    // 3. TRAILING MAGLEV CYBER BOGGIE POD (z = 5.5m)
    const coachHull = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.6, carLen), cyberMat);
    coachHull.position.set(0, (h - 0.6) / 2 + 0.6, 5.5);
    coachHull.castShadow = true;
    coachHull.receiveShadow = true;
    root.add(coachHull);

    // Coach neon stripes
    const coachStripL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, carLen), neonPink);
    coachStripL.position.set(-w / 2 - 0.02, 2.2, 5.5);
    root.add(coachStripL);
    const coachStripR = coachStripL.clone();
    coachStripR.position.x = w / 2 + 0.02;
    root.add(coachStripR);

    const cGlow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.15, carLen * 0.95), neonCyan);
    cGlow.position.set(0, 0.35, 5.5);
    root.add(cGlow);

    this.addFrontPlow(root, w, -len / 2 - 0.25, 0.55);
    this.addHeadlights(root, w, -len / 2 - 0.15, 1.15, 0x00f0ff, lights);
    this.addTaillights(root, w, len / 2 + 0.05, 1.3);
    this.addBogies(root, len, w, wheels);
  }

  // --- Helper: Add Headlights Facing -Z (Towards oncoming runner) ---
  private static addHeadlights(
    root: THREE.Group,
    w: number,
    zFront: number,
    y: number,
    colorHex: number,
    lights: THREE.PointLight[]
  ) {
    const lampGeom = new THREE.SphereGeometry(0.2, 12, 12);
    const lampMat = new THREE.MeshBasicMaterial({ color: colorHex });

    // Twin glowing circular lenses
    const leftLamp = new THREE.Mesh(lampGeom, lampMat);
    leftLamp.position.set(-w * 0.35, y, zFront);
    root.add(leftLamp);

    const rightLamp = new THREE.Mesh(lampGeom, lampMat);
    rightLamp.position.set(w * 0.35, y, zFront);
    root.add(rightLamp);

    // Faint atmospheric beam (short and subtle, never blinds the camera or occludes tracks)
    const beamGeom = new THREE.ConeGeometry(0.85, 3.5, 12, 1, true);
    const beamMat = this.getMaterial(`beam_${colorHex}`, () =>
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, y, zFront - 1.75);
    root.add(beam);
  }

  // --- Helper: Add Rear Red Taillights at +len / 2 ---
  private static addTaillights(root: THREE.Group, w: number, zRear: number, y: number) {
    const tailMat = this.getMaterial('red_taillight', () =>
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    const tailGeom = new THREE.BoxGeometry(0.22, 0.16, 0.05);

    const tailL = new THREE.Mesh(tailGeom, tailMat);
    tailL.position.set(-w * 0.38, y, zRear);
    root.add(tailL);

    const tailR = new THREE.Mesh(tailGeom, tailMat);
    tailR.position.set(w * 0.38, y, zRear);
    root.add(tailR);
  }

  // --- Helper: Add Heavy Steel Pilot / Cowcatcher Plow ---
  private static addFrontPlow(root: THREE.Group, w: number, zFront: number, y: number) {
    const plowMat = this.getMaterial('plow_steel', () =>
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.4 })
    );
    const plow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.32, 0.45), plowMat);
    plow.position.set(0, y, zFront);
    root.add(plow);

    // Hazard yellow/black caution stripes on the cowcatcher
    const stripeMat = this.getMaterial('plow_stripe', () =>
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.08, 0.46), stripeMat);
    stripe.position.set(0, y, zFront);
    root.add(stripe);
  }

  // --- Helper: Add Articulated Vestibule Gangway Bellow & Coupler Joint between Engine and Boggie Coach ---
  private static addGangwayJoint(root: THREE.Group, w: number, h: number, z = 0) {
    const rubberMat = this.getMaterial('gangway_rubber', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.1 })
    );
    const couplerMat = this.getMaterial('coupler_iron', () =>
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.85 })
    );

    // Accordion corrugated rubber bellow connecting Engine and Trailing Boggie
    const bellow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, h * 0.88, 0.72),
      rubberMat
    );
    bellow.position.set(0, h * 0.48, z);
    bellow.castShadow = true;
    root.add(bellow);

    // Accordion corrugation ribs
    for (let r = -0.24; r <= 0.24; r += 0.24) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.92, h * 0.9, 0.06),
        couplerMat
      );
      rib.position.set(0, h * 0.48, z + r);
      root.add(rib);
    }

    // Heavy cast-iron drawbar coupler hitch underneath
    const coupler = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 1.1),
      couplerMat
    );
    coupler.position.set(0, 0.48, z);
    root.add(coupler);

    // Twin air brake hoses
    [-0.22, 0.22].forEach((hx) => {
      const hose = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
        rubberMat
      );
      hose.rotation.x = Math.PI / 3;
      hose.position.set(hx, 0.36, z);
      root.add(hose);
    });
  }

  // --- Helper: Add 4 Bogie Truck Assemblies (Front & Rear of Engine + Front & Rear of Trailing Boggie) ---
  private static addBogies(root: THREE.Group, len: number, w: number, wheels: THREE.Mesh[]) {
    const wheelMat = this.getMaterial('train_wheel', () =>
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 })
    );
    const axleMat = this.getMaterial('train_axle', () =>
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.75 })
    );
    const bogieFrameMat = this.getMaterial('bogie_frame', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.8 })
    );

    const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16);
    wheelGeom.rotateZ(Math.PI / 2); // Make cylinder roll along X axis

    // 4 Bogie Truck Assemblies:
    // Engine bogies: -8.5m (front) and -2.4m (rear)
    // Trailing Coach Boggie bogies: +2.4m (front) and +8.5m (rear)
    const bogieZPositions = [-8.5, -2.4, 2.4, 8.5];
    bogieZPositions.forEach((bz) => {
      // Cast Steel Bogie Side Frames on Left & Right
      [-w / 2 + 0.04, w / 2 - 0.04].forEach((fx) => {
        const sideFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.28, 1.95),
          bogieFrameMat
        );
        sideFrame.position.set(fx, 0.42, bz);
        root.add(sideFrame);

        // Suspension Coil Springs & Journal Box Caps over each wheel axle
        [-0.65, 0.65].forEach((oz) => {
          const journalBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.2, 0.22),
            axleMat
          );
          journalBox.position.set(fx, 0.38, bz + oz);
          root.add(journalBox);
        });
      });

      // Transverse Bolster Beam
      const bolster = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.18, 0.18, 0.32),
        bogieFrameMat
      );
      bolster.position.set(0, 0.45, bz);
      root.add(bolster);

      // 4 wheels & 2 axles per bogie truck
      [-0.65, 0.65].forEach((offsetZ) => {
        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, w - 0.22, 8),
          axleMat
        );
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, 0.38, bz + offsetZ);
        root.add(axle);

        const wL = new THREE.Mesh(wheelGeom, wheelMat);
        wL.position.set(-w / 2 + 0.12, 0.38, bz + offsetZ);
        root.add(wL);
        wheels.push(wL);

        const wR = new THREE.Mesh(wheelGeom, wheelMat);
        wR.position.set(w / 2 - 0.12, 0.38, bz + offsetZ);
        root.add(wR);
        wheels.push(wR);
      });
    });
  }

  // --- HELPER: HIGH-VOLTAGE ARTICULATED HIGH-SPEED PANTOGRAPH ---
  private static addPantograph(root: THREE.Group, x: number, y: number, z: number) {
    const pantoMat = this.getMaterial('panto_red', () =>
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.7 })
    );
    const carbonMat = this.getMaterial('panto_carbon', () =>
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.3 })
    );

    const baseGeom = new THREE.BoxGeometry(1.2, 0.1, 1.4);
    const base = new THREE.Mesh(baseGeom, pantoMat);
    base.position.set(x, y + 0.05, z);
    root.add(base);

    // Lower articulated arm
    const armGeom = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8);
    const armL = new THREE.Mesh(armGeom, pantoMat);
    armL.rotation.x = Math.PI / 4.2;
    armL.position.set(x - 0.32, y + 0.45, z - 0.35);
    root.add(armL);

    const armR = armL.clone();
    armR.position.x = x + 0.32;
    root.add(armR);

    // Upper articulated diamond arm
    const upperArmL = new THREE.Mesh(armGeom, pantoMat);
    upperArmL.rotation.x = -Math.PI / 4.2;
    upperArmL.position.set(x - 0.32, y + 1.12, z + 0.05);
    root.add(upperArmL);

    const upperArmR = upperArmL.clone();
    upperArmR.position.x = x + 0.32;
    root.add(upperArmR);

    // Carbon contact collector shoe (horizontal head spanning overhead wire)
    const shoeGeom = new THREE.BoxGeometry(1.65, 0.06, 0.22);
    const shoe = new THREE.Mesh(shoeGeom, carbonMat);
    shoe.position.set(x, y + 1.48, z + 0.42);
    root.add(shoe);
  }

  // --- HELPER: CUSTOM MULTI-BOGIE TRUCKS (FOR 10-BOGGIE MASSIVE TRAINS) ---
  private static addCustomBogies(
    root: THREE.Group,
    bogieZPositions: number[],
    w: number,
    wheels: THREE.Mesh[]
  ) {
    const wheelMat = this.getMaterial('train_wheel', () =>
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 })
    );
    const axleMat = this.getMaterial('train_axle', () =>
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.75 })
    );
    const bogieFrameMat = this.getMaterial('bogie_frame', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.8 })
    );

    const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16);
    wheelGeom.rotateZ(Math.PI / 2);

    bogieZPositions.forEach((bz) => {
      // Cast Steel Bogie Side Frames on Left & Right
      [-w / 2 + 0.04, w / 2 - 0.04].forEach((fx) => {
        const sideFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.28, 1.95),
          bogieFrameMat
        );
        sideFrame.position.set(fx, 0.42, bz);
        root.add(sideFrame);

        // Suspension Coil Springs & Journal Box Caps over each wheel axle
        [-0.65, 0.65].forEach((oz) => {
          const journalBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.2, 0.22),
            axleMat
          );
          journalBox.position.set(fx, 0.38, bz + oz);
          root.add(journalBox);
        });
      });

      // Transverse Bolster Beam
      const bolster = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.18, 0.18, 0.32),
        bogieFrameMat
      );
      bolster.position.set(0, 0.45, bz);
      root.add(bolster);

      // 4 wheels & 2 axles per bogie truck
      [-0.65, 0.65].forEach((offsetZ) => {
        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, w - 0.22, 8),
          axleMat
        );
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, 0.38, bz + offsetZ);
        root.add(axle);

        const wL = new THREE.Mesh(wheelGeom, wheelMat);
        wL.position.set(-w / 2 + 0.12, 0.38, bz + offsetZ);
        root.add(wL);
        wheels.push(wL);

        const wR = new THREE.Mesh(wheelGeom, wheelMat);
        wR.position.set(w / 2 - 0.12, 0.38, bz + offsetZ);
        root.add(wR);
        wheels.push(wR);
      });
    });
  }

  // =========================================================================
  // --- TRAIN 6: DOUBLE DECKER PASSENGER TRAIN (TWIN ENGINES + 10 BOGGIES) ---
  // =========================================================================
  private static buildDoubleDeckerPassenger(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const whiteBodyMat = this.getMaterial('dd_white_body', () =>
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.2 })
    );
    const blueStripeMat = this.getMaterial('dd_blue_stripe', () =>
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.4 })
    );
    const redStripeMat = this.getMaterial('dd_red_stripe', () =>
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.3 })
    );
    const windowDarkMat = this.getMaterial('dd_window_tint', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
    );
    const windowLitMat = this.getMaterial('dd_window_lit', () =>
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        emissive: 0xfef08a,
        emissiveIntensity: 0.08,
        roughness: 0.3,
      })
    );
    const darkMetal = this.getMaterial('dark_metal', () =>
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.6 })
    );
    const silverRoofMat = this.getMaterial('dd_roof_metal', () =>
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.65 })
    );

    // 1. LEAD POWERHOUSE LOCOMOTIVE ENGINE (Front Car: z = -29.0m, length = 14.5m)
    const leadZ = -29.0;
    const locoLen = 14.5;
    const locoBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, h - 0.7, locoLen),
      whiteBodyMat
    );
    locoBody.position.set(0, (h - 0.7) / 2 + 0.6, leadZ);
    locoBody.castShadow = true;
    locoBody.receiveShadow = true;
    root.add(locoBody);

    // Sleek cobalt blue and crimson speed ribbons along locomotive
    const locoStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.48, locoLen), blueStripeMat);
    locoStripe.position.set(0, 1.45, leadZ);
    root.add(locoStripe);
    const locoRedStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.12, locoLen), redStripeMat);
    locoRedStripe.position.set(0, 1.82, leadZ);
    root.add(locoRedStripe);

    // Aerodynamic curved nose cap at FRONT facing oncoming runner (-len / 2 = -37.0m)
    const noseGeom = new THREE.CylinderGeometry(w / 2, w / 2, 1.6, 16, 1, false, 0, Math.PI);
    const nose = new THREE.Mesh(noseGeom, whiteBodyMat);
    nose.rotation.z = Math.PI / 2;
    nose.rotation.y = Math.PI / 2;
    nose.position.set(0, h * 0.52, -len / 2 - 0.3);
    root.add(nose);

    // Front high-speed pilot cowcatcher with safety caution stripes
    this.addFrontPlow(root, w, -len / 2 - 0.35, 0.55);

    // Aerodynamic slanted cockpit windshield
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 1.15, 0.15), windowDarkMat);
    cockpit.position.set(0, h * 0.68, -len / 2 - 0.08);
    root.add(cockpit);

    // High-intensity Xenon LED Headlights and volumetric beam cone
    this.addHeadlights(root, w, -len / 2 - 0.2, 1.1, 0x38bdf8, lights);
    // Lower twin ditch lights
    [-w * 0.32, w * 0.32].forEach((dx) => {
      const ditchGeom = new THREE.SphereGeometry(0.14, 10, 10);
      const ditchMat = this.getMaterial('ditch_led_mat', () =>
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      const ditchMesh = new THREE.Mesh(ditchGeom, ditchMat);
      ditchMesh.position.set(dx, 0.68, -len / 2 - 0.25);
      root.add(ditchMesh);
    });

    // High-voltage pantograph on Lead Locomotive roof
    this.addPantograph(root, 0, h, -31.5);

    // Locomotive rooftop turbo cooling pods
    [-26.0, -23.5].forEach((pz) => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.38, 2.0), darkMetal);
      pod.position.set(0, h + 0.18, pz);
      root.add(pod);
    });

    // 2. FOUR DOUBLE-DECKER PASSENGER COACHES (Upper & Lower deck windows with warm interior glow!)
    const coachConfigs = [
      { z: -15.5, hasDome: false },
      { z: -4.5, hasDome: false },
      { z: +6.5, hasDome: true }, // Panoramic Observation Dome Coach!
      { z: +17.5, hasDome: false },
    ];
    const coachLen = 10.4;

    coachConfigs.forEach((cfg) => {
      // Main Double-Decker Coach Body
      const coachBody = new THREE.Mesh(
        new THREE.BoxGeometry(w, h - 0.65, coachLen),
        whiteBodyMat
      );
      coachBody.position.set(0, (h - 0.65) / 2 + 0.6, cfg.z);
      coachBody.castShadow = true;
      coachBody.receiveShadow = true;
      root.add(coachBody);

      // Curved silver aerodynamic roof
      const roofGeom = new THREE.CylinderGeometry(w / 2, w / 2, coachLen, 16, 1, false, 0, Math.PI);
      const roof = new THREE.Mesh(roofGeom, silverRoofMat);
      roof.rotation.z = Math.PI / 2;
      roof.position.set(0, h - 0.05, cfg.z);
      root.add(roof);

      // Dynamic blue and red side speed cheatlines
      const cStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.44, coachLen), blueStripeMat);
      cStripe.position.set(0, 1.45, cfg.z);
      root.add(cStripe);
      const cRedStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.1, coachLen), redStripeMat);
      cRedStripe.position.set(0, 1.78, cfg.z);
      root.add(cRedStripe);

      // Mid-level division band between Lower and Upper Decks
      const midBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.22, coachLen), darkMetal);
      midBand.position.set(0, 2.75, cfg.z);
      root.add(midBand);

      // LOWER DECK WINDOWS (y = 1.75m)
      for (let wz = cfg.z - 3.8; wz <= cfg.z + 3.8; wz += 1.9) {
        const isLit = Math.sin(wz * 1.7) > -0.2;
        const mat = isLit ? windowLitMat : windowDarkMat;
        [-w / 2 - 0.02, w / 2 + 0.02].forEach((wx) => {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 1.35), mat);
          win.position.set(wx, 1.8, wz);
          root.add(win);
        });
      }

      // UPPER DECK WINDOWS (y = 3.75m)
      for (let wz = cfg.z - 3.8; wz <= cfg.z + 3.8; wz += 1.9) {
        const isLit = Math.cos(wz * 2.1) > -0.3;
        const mat = isLit ? windowLitMat : windowDarkMat;
        [-w / 2 - 0.02, w / 2 + 0.02].forEach((wx) => {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 1.35), mat);
          win.position.set(wx, 3.8, wz);
          root.add(win);
        });
      }

      // Passenger entrance doors at both ends
      [-coachLen / 2 + 0.8, coachLen / 2 - 0.8].forEach((dz) => {
        [-w / 2 - 0.02, w / 2 + 0.02].forEach((dx) => {
          const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.2, 1.1), darkMetal);
          door.position.set(dx, 1.75, cfg.z + dz);
          root.add(door);
        });
      });

      // Special Panoramic Glass Dome Roof on Coach 3!
      if (cfg.hasDome) {
        const domeGeom = new THREE.CylinderGeometry(w * 0.44, w * 0.44, coachLen * 0.65, 12, 1, false, 0, Math.PI);
        const domeMat = this.getMaterial('dd_dome_glass', () =>
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.65,
          })
        );
        const dome = new THREE.Mesh(domeGeom, domeMat);
        dome.rotation.z = Math.PI / 2;
        dome.position.set(0, h + 0.18, cfg.z);
        root.add(dome);
      }
    });

    // 3. REAR PUSHER POWERHOUSE LOCOMOTIVE ENGINE (Rear Car: z = +29.0m, length = 14.5m)
    const rearZ = +29.0;
    const rearLocoBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, h - 0.7, locoLen),
      whiteBodyMat
    );
    rearLocoBody.position.set(0, (h - 0.7) / 2 + 0.6, rearZ);
    rearLocoBody.castShadow = true;
    rearLocoBody.receiveShadow = true;
    root.add(rearLocoBody);

    const rearStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.48, locoLen), blueStripeMat);
    rearStripe.position.set(0, 1.45, rearZ);
    root.add(rearStripe);
    const rearRedStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.12, locoLen), redStripeMat);
    rearRedStripe.position.set(0, 1.82, rearZ);
    root.add(rearRedStripe);

    // Rear aerodynamic cab nose facing +Z (tail)
    const rearNoseGeom = new THREE.CylinderGeometry(w / 2, w / 2, 1.4, 16, 1, false, 0, Math.PI);
    const rearNose = new THREE.Mesh(rearNoseGeom, whiteBodyMat);
    rearNose.rotation.z = -Math.PI / 2;
    rearNose.rotation.y = -Math.PI / 2;
    rearNose.position.set(0, h * 0.52, len / 2 + 0.2);
    root.add(rearNose);

    // Rear red LED marker taillights facing +Z
    this.addTaillights(root, w, len / 2 + 0.15, 1.25);

    // Rear high-voltage pantograph
    this.addPantograph(root, 0, h, +31.5);

    // 4. ARTICULATED GANGWAY JOINTS BETWEEN EVERY CAR
    [-21.75, -10.0, +1.0, +12.0, +22.75].forEach((gz) => {
      this.addGangwayJoint(root, w, h, gz);
    });

    // 5. TEN BOGGIE TRUCK ASSEMBLIES (Spanning the entire 74m train!)
    const bogiePositions = [
      -33.5, -24.5, // Lead Engine (2 bogies)
      -19.0, -12.0, // Coach 1 (2 bogies)
      -8.0, -1.0,   // Coach 2 (2 bogies)
      +3.0, +10.0,  // Coach 3 (2 bogies)
      +14.0, +21.0, // Coach 4 (2 bogies)
      +24.5, +33.5  // Rear Pusher Engine (2 bogies)
    ];
    this.addCustomBogies(root, bogiePositions, w, wheels);
  }

  // =========================================================================================
  // --- TRAIN 7: DOUBLE DECKER GOODS / FREIGHT TRAIN (2 DIESEL BEASTS + 10 HEAVY BOGGIES) ---
  // =========================================================================================
  private static buildDoubleDeckerGoods(
    root: THREE.Group,
    len: number,
    w: number,
    h: number,
    lights: THREE.PointLight[],
    wheels: THREE.Mesh[]
  ) {
    const dieselYellow = this.getMaterial('dg_diesel_yellow', () =>
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.3 })
    );
    const dieselDark = this.getMaterial('dg_diesel_dark', () =>
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.6 })
    );
    const darkChassis = this.getMaterial('dg_chassis', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.8 })
    );
    const tankerSteel = this.getMaterial('dg_tanker_steel', () =>
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 })
    );
    const hazardPlacardMat = this.getMaterial('dg_hazard_red', () =>
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );

    // 1. LEAD MONSTER DIESEL-ELECTRIC LOCOMOTIVE (Front: z = -31.5m, length = 14.0m)
    const leadZ = -31.5;
    const locoLen = 14.0;
    const locoH = 4.65;

    // Massive angular heavy freight cab
    const locoBody = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.3, locoH - 0.7, locoLen),
      dieselYellow
    );
    locoBody.position.set(0, (locoH - 0.7) / 2 + 0.6, leadZ);
    locoBody.castShadow = true;
    locoBody.receiveShadow = true;
    root.add(locoBody);

    // Side walkway catwalks with safety railings
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, locoLen), darkChassis);
    catwalk.position.set(0, 0.65, leadZ);
    root.add(catwalk);

    [-w / 2 + 0.05, w / 2 - 0.05].forEach((rx) => {
      const railGeom = new THREE.BoxGeometry(0.04, 0.75, locoLen);
      const railMat = this.getMaterial('dg_safety_rail', () =>
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })
      );
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(rx, 1.05, leadZ);
      root.add(rail);
    });

    // Heavy front pilot snowplow with diagonal hazard chevron stripes
    this.addFrontPlow(root, w, -len / 2 - 0.3, 0.55);

    // Front high-hood cab and sun visor brow
    const cabBrow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.22, 1.2), dieselDark);
    cabBrow.position.set(0, locoH + 0.1, -len / 2 + 2.5);
    root.add(cabBrow);

    // Cab windshields
    const cabWindowMat = this.getMaterial('dg_cab_glass', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
    );
    const winF = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.8, 0.1), cabWindowMat);
    winF.position.set(0, locoH - 0.4, -len / 2 + 1.8);
    root.add(winF);

    // Dual High-Intensity Halogen Headlights + Wig-Wag Ditch Lights
    this.addHeadlights(root, w, -len / 2 - 0.15, 1.15, 0xfef08a, lights);

    // Twin Turbo Diesel Exhaust Stacks emitting smoke soot rings
    [-34.0, -32.5].forEach((sz) => {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.6, 12),
        darkChassis
      );
      stack.position.set(0, locoH + 0.28, sz);
      root.add(stack);
      // Carbon soot lip
      const soot = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 8, 16), darkChassis);
      soot.rotation.x = Math.PI / 2;
      soot.position.set(0, locoH + 0.58, sz);
      root.add(soot);
    });

    // Flared rear cooling radiator wings with 3D fan grilles
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 1.2, 3.2), dieselDark);
    radiator.position.set(0, locoH - 0.2, -26.5);
    root.add(radiator);

    // 2. DOUBLE-STACK INTERMODAL CONTAINER WELL CAR 1 (Maersk Blue Lower + Evergreen Green Upper)
    this.buildDoubleStackWellCar(
      root,
      -18.5,
      11.5,
      w,
      0x0284c7, // Maersk Ocean Blue
      0x059669  // Evergreen Jade Green
    );

    // 3. DOUBLE-STACK INTERMODAL CONTAINER WELL CAR 2 (DHL Yellow Lower + K-Line Gray Upper)
    this.buildDoubleStackWellCar(
      root,
      -6.5,
      11.5,
      w,
      0xeab308, // DHL Golden Yellow
      0x475569  // K-Line Slate Gray
    );

    // 4. HEAVY PRESSURIZED CHEMICAL TANKER CAR (z = +4.5m, length = 10.5m)
    const tankZ = +4.5;
    const tankLen = 9.4;
    const tankRadius = 1.15;
    const tankChassis = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, 10.5), darkChassis);
    tankChassis.position.set(0, 0.65, tankZ);
    root.add(tankChassis);

    // Massive steel cylindrical pressure vessel
    const tankGeom = new THREE.CylinderGeometry(tankRadius, tankRadius, tankLen, 24);
    const tank = new THREE.Mesh(tankGeom, tankerSteel);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, tankRadius + 0.95, tankZ);
    tank.castShadow = true;
    root.add(tank);

    // Hemispherical domed end caps
    [-tankLen / 2, tankLen / 2].forEach((tz) => {
      const capGeom = new THREE.SphereGeometry(tankRadius, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.Mesh(capGeom, tankerSteel);
      cap.rotation.x = tz < 0 ? -Math.PI / 2 : Math.PI / 2;
      cap.position.set(0, tankRadius + 0.95, tankZ + tz);
      root.add(cap);
    });

    // Top inspection manhole dome with pressure relief valves
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16), darkChassis);
    dome.position.set(0, tankRadius * 2 + 1.05, tankZ);
    root.add(dome);

    // Hazard diamond warning placards on both sides of tanker
    [-w / 2 - 0.02, w / 2 + 0.02].forEach((tx) => {
      const placard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.45), hazardPlacardMat);
      placard.rotation.x = Math.PI / 4;
      placard.position.set(tx, tankRadius + 1.1, tankZ);
      root.add(placard);
    });

    // 5. INDUSTRIAL BULK GONDOLA / COIL CAR (z = +15.5m, length = 10.5m)
    const gonZ = +15.5;
    const gonLen = 10.5;
    const gonBody = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, gonLen), darkChassis);
    gonBody.position.set(0, 1.8, gonZ);
    gonBody.castShadow = true;
    root.add(gonBody);

    // Stiffener ribs along gondola walls
    for (let rz = gonZ - 4.5; rz <= gonZ + 4.5; rz += 1.5) {
      [-w / 2 - 0.04, w / 2 + 0.04].forEach((rx) => {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.12), darkChassis);
        rib.position.set(rx, 1.8, rz);
        root.add(rib);
      });
    }

    // Heavy steel coil cargo inside gondola
    [-2.2, 0, 2.2].forEach((cz) => {
      const coilGeom = new THREE.CylinderGeometry(0.95, 0.95, 1.8, 16);
      const coil = new THREE.Mesh(coilGeom, tankerSteel);
      coil.rotation.z = Math.PI / 2;
      coil.position.set(0, 2.2, gonZ + cz);
      root.add(coil);
    });

    // 6. DOUBLE-STACK REFRIGERATED INTERMODAL WELL CAR 3 (Hanjin Crimson + ONE Magenta)
    this.buildDoubleStackWellCar(
      root,
      +26.0,
      11.5,
      w,
      0xb91c1c, // Hanjin Crimson
      0xdb2777  // ONE Magenta
    );

    // 7. REAR HEAVY HAULER DIESEL PUSHER LOCOMOTIVE (Rear: z = +33.5m, length = 14.0m)
    const rearZ = +33.5;
    const rearLocoBody = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.3, locoH - 0.7, locoLen),
      dieselYellow
    );
    rearLocoBody.position.set(0, (locoH - 0.7) / 2 + 0.6, rearZ);
    rearLocoBody.castShadow = true;
    rearLocoBody.receiveShadow = true;
    root.add(rearLocoBody);

    // Rear walkway catwalk
    const rearCatwalk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, locoLen), darkChassis);
    rearCatwalk.position.set(0, 0.65, rearZ);
    root.add(rearCatwalk);

    // Rear marker taillights facing +Z
    this.addTaillights(root, w, len / 2 + 0.2, 1.3);

    // Rear diesel exhaust stacks
    [+32.0, +34.5].forEach((sz) => {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.6, 12),
        darkChassis
      );
      stack.position.set(0, locoH + 0.28, sz);
      root.add(stack);
    });

    // 8. HEAVY DRAWBAR COUPLERS & BRAKE HOSE JOINTS BETWEEN EVERY CAR
    [-24.75, -12.5, -0.5, +9.5, +20.5, +28.5].forEach((jz) => {
      this.addGangwayJoint(root, w, 3.2, jz);
    });

    // 9. TEN HEAVY FREIGHT BOGGIE TRUCK ASSEMBLIES (Spanning entire 78m train!)
    const freightBogiePositions = [
      -35.0, -27.0, // Lead Diesel Beast (2 bogies)
      -22.0, -15.0, // Well Car 1 (2 bogies)
      -10.0, -3.0,  // Well Car 2 (2 bogies)
      +1.0, +8.0,   // Tanker Car (2 bogies)
      +12.0, +19.0, // Gondola Car (2 bogies)
      +22.5, +29.5, // Well Car 3 (2 bogies)
      +31.0, +37.0  // Rear Diesel Pusher (2 bogies)
    ];
    this.addCustomBogies(root, freightBogiePositions, w, wheels);
  }

  // --- HELPER: BUILD DOUBLE-STACK CONTAINER WELL CAR WITH 3D CORRUGATED RIDGES ---
  private static buildDoubleStackWellCar(
    root: THREE.Group,
    centerZ: number,
    carLen: number,
    w: number,
    bottomColor: number,
    topColor: number
  ) {
    const chassisMat = this.getMaterial('well_chassis', () =>
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.8 })
    );
    const bottomMat = this.getMaterial(`container_${bottomColor.toString(16)}`, () =>
      new THREE.MeshStandardMaterial({ color: bottomColor, roughness: 0.5, metalness: 0.25 })
    );
    const topMat = this.getMaterial(`container_${topColor.toString(16)}`, () =>
      new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.5, metalness: 0.25 })
    );
    const lockMat = this.getMaterial('corner_twistlock', () =>
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.85 })
    );

    // Dropped well skeleton chassis
    const skeleton = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, carLen), chassisMat);
    skeleton.position.set(0, 0.55, centerZ);
    root.add(skeleton);

    const contLen = 10.2;
    const contW = w - 0.22;
    const contH = 2.15;

    // LOWER CONTAINER (Resting low in the well pocket)
    const lowerCont = new THREE.Mesh(new THREE.BoxGeometry(contW, contH, contLen), bottomMat);
    lowerCont.position.set(0, 0.65 + contH / 2, centerZ);
    lowerCont.castShadow = true;
    root.add(lowerCont);

    // 3D Corrugated ridges on Lower Container
    for (let rz = centerZ - 4.6; rz <= centerZ + 4.6; rz += 0.5) {
      [-contW / 2 - 0.02, contW / 2 + 0.02].forEach((cx) => {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, contH - 0.1, 0.16), bottomMat);
        ridge.position.set(cx, 0.65 + contH / 2, rz);
        root.add(ridge);
      });
    }

    // Cast Steel Corner Twistlock Blocks connecting Lower and Upper Containers
    const upperY = 0.65 + contH;
    [-contW / 2 + 0.12, contW / 2 - 0.12].forEach((lx) => {
      [-contLen / 2 + 0.2, contLen / 2 - 0.2].forEach((lz) => {
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), lockMat);
        lock.position.set(lx, upperY + 0.09, centerZ + lz);
        root.add(lock);
      });
    });

    // UPPER CONTAINER (Stacked on top reaching true double-stack height = 5.15m!)
    const upperCont = new THREE.Mesh(new THREE.BoxGeometry(contW, contH, contLen), topMat);
    upperCont.position.set(0, upperY + 0.18 + contH / 2, centerZ);
    upperCont.castShadow = true;
    root.add(upperCont);

    // 3D Corrugated ridges on Upper Container
    for (let rz = centerZ - 4.6; rz <= centerZ + 4.6; rz += 0.5) {
      [-contW / 2 - 0.02, contW / 2 + 0.02].forEach((cx) => {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, contH - 0.1, 0.16), topMat);
        ridge.position.set(cx, upperY + 0.18 + contH / 2, rz);
        root.add(ridge);
      });
    }
  }
}
