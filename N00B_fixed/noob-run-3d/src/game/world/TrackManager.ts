import * as THREE from 'three';
import { LANE_WIDTH, EnvironmentTheme, TrainType, ObstacleType, PowerUpType } from '../types';
import { TrainFactory, TrainInstance } from '../models/TrainModels';
import { ObstacleFactory, ObstacleInstance } from '../models/ObstacleModels';
import { CollectibleFactory, CoinInstance, PowerUpInstance } from '../models/CollectibleModels';

export const SEGMENT_LENGTH = 70.0;
export const NUM_SEGMENTS = 5;
export const BACKWARD_SEGMENTS = 1;

export interface RampInstance {
  laneX: number;
  startZ: number;
  endZ: number;
  height: number;
}

export interface TrackSegment {
  id: number;
  group: THREE.Group;
  theme: EnvironmentTheme;
  startZ: number;
  endZ: number;
  trains: TrainInstance[];
  obstacles: ObstacleInstance[];
  coins: CoinInstance[];
  powerUps: PowerUpInstance[];
  ramps: RampInstance[];
}

export class TrackManager {
  public scene: THREE.Scene;
  public segments: TrackSegment[] = [];
  private nextSegmentId = 0;
  private currentTheme: EnvironmentTheme = 'city_railway';
  private segmentCounter = 0;
  private lastSafeLane = 0; // Tracks continuity of passable path across segments
  public lastPlayerDistance = 0;
  public currentTrackSpeed = 26;

  // ==========================================
  // --- SUBWAY SURFERS AUTHENTIC MATERIALS ---
  // ==========================================

  // 1. Track Infrastructure
  private static ballastMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // Rich slate ballast gravel bed for high contrast against rails & obstacles
    roughness: 0.92,
    metalness: 0.05,
  });

  private static sleeperMat = new THREE.MeshStandardMaterial({
    color: 0x92400e, // Deep treated wood railway sleepers
    roughness: 0.8,
  });

  private static steelRailMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0, // Gleaming polished steel rails
    metalness: 0.95,
    roughness: 0.15,
  });

  private static stonePedestrianMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1, // Warm stone walkway curbs
    roughness: 0.8,
  });

  private static hazardStripeMat = new THREE.MeshStandardMaterial({
    color: 0xeab308, // Caution yellow safety ledge
    roughness: 0.5,
  });

  private static catenarySteelMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // Overhead steel gantry
    roughness: 0.4,
    metalness: 0.7,
  });

  private static wireMat = new THREE.MeshBasicMaterial({
    color: 0x334155, // Overhead catenary power wire
  });

  private static signalGreenMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e, // Glowing green railway signal LED
  });

  private static signalRedMat = new THREE.MeshBasicMaterial({
    color: 0xef4444, // Glowing red railway signal LED
  });

  private static signalAmberMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b, // Amber signal LED
  });

  // 2. Continuous Urban Building Facades
  private static terracottaMat = new THREE.MeshStandardMaterial({
    color: 0xc2410c, // Rich terracotta
    roughness: 0.8,
  });

  private static warmStuccoMat = new THREE.MeshStandardMaterial({
    color: 0xfb923c, // Peach stucco
    roughness: 0.75,
  });

  private static sunnyYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15, // Sunny Mediterranean yellow
    roughness: 0.75,
  });

  private static turquoiseMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4, // Coastal turquoise blue
    roughness: 0.75,
  });

  private static mintStuccoMat = new THREE.MeshStandardMaterial({
    color: 0x10b981, // Fresh sage mint
    roughness: 0.75,
  });

  private static crimsonBrickMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c, // Urban red brick
    roughness: 0.85,
  });

  private static creamWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xfafaf9, // Crisp white stucco
    roughness: 0.7,
  });

  // Reusable Shared Geometries to eliminate GC and allocation spikes
  private static sharedSleeperGeom = new THREE.BoxGeometry(2.3, 0.14, 0.38);
  private static geomCache = new Map<string, THREE.BufferGeometry>();
  private static cachedGeomSet = new Set<THREE.BufferGeometry>();

  public static getGeometry<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    let geom = TrackManager.geomCache.get(key) as T;
    if (!geom) {
      geom = factory();
      TrackManager.geomCache.set(key, geom);
      TrackManager.cachedGeomSet.add(geom);
    }
    return geom;
  }

  private static matCache = new Map<string, THREE.Material>();
  public static getMaterial<T extends THREE.Material>(key: string, factory: () => T): T {
    let mat = TrackManager.matCache.get(key) as T;
    if (!mat) {
      mat = factory();
      TrackManager.matCache.set(key, mat);
    }
    return mat;
  }

  public static isCachedGeometry(geom: THREE.BufferGeometry): boolean {
    return geom === TrackManager.sharedSleeperGeom || TrackManager.cachedGeomSet.has(geom);
  }

  public static markStatic(obj: THREE.Object3D, castShadow = false, receiveShadow = false) {
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;
    }
  }

  // 3. Roofs & Windows & Details
  private static spanishTileRoofMat = new THREE.MeshStandardMaterial({
    color: 0x9a3412, // Dark burnt orange clay roof tiles
    roughness: 0.7,
  });

  private static slateMansardMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Dark slate mansard roof
    roughness: 0.6,
  });

  private static windowDarkMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // Deep tinted reflective window
    roughness: 0.2,
    metalness: 0.8,
  });

  private static windowGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a, // Warm illuminated window interior
  });

  private static windowFrameMat = new THREE.MeshStandardMaterial({
    color: 0x451a03, // Dark wood frame
    roughness: 0.8,
  });

  private static ironBalconyMat = new THREE.MeshStandardMaterial({
    color: 0x18181b, // Black wrought iron balcony
    roughness: 0.5,
    metalness: 0.8,
  });

  // 4. Shop Awnings & Billboards
  private static candyRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.4,
  });

  private static candyWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
  });

  private static candyBlueMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.4,
  });

  private static candyGreenMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.4,
  });

  private static purpleAwningMat = new THREE.MeshStandardMaterial({
    color: 0x7c3aed,
    roughness: 0.6,
  });

  private static billboardSignMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Vibrant billboard display
    roughness: 0.3,
  });

  private static billboardGoldMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24, // Glowing billboard logo
  });

  // 5. Trackside Retaining Walls & Graffiti
  private static stoneWallMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // Weathered concrete retaining barrier
    roughness: 0.9,
  });

  private static graffitiCyanMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
  });

  private static graffitiPinkMat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
  });

  private static graffitiYellowMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
  });

  // 6. Foliage & Palm Trees
  private static palmTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c3d28,
    roughness: 0.9,
    flatShading: true,
  });

  private static palmLeafMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.6,
    flatShading: true,
  });

  private static palmLeafDarkMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.7,
    flatShading: true,
  });

  private static cypressMat = new THREE.MeshStandardMaterial({
    color: 0x14532d,
    roughness: 0.85,
    flatShading: true,
  });

  // 7. Street & Gas Station Props
  private static scooterOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.3,
    metalness: 0.4,
  });

  private static scooterChromeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.1,
    metalness: 0.9,
  });

  private static rubberBlackMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.8,
  });

  private static flameOrangeMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
  });

  private static gasPumpRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.3,
    metalness: 0.2,
  });

  private static gasMeterGreenMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
  });

  private static blueCrateMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.5,
  });

  private static woodCrateMat = new THREE.MeshStandardMaterial({
    color: 0xa16207,
    roughness: 0.85,
  });

  private static fruitYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.5,
  });

  private static fruitRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
  });

  private static fruitOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.4,
  });

  private static streetLampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a, // Glowing warm street lamp
  });

  private static waterTowerWoodMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.9,
  });

  private static acCompressorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.4,
    metalness: 0.6,
  });

  // 8. Low-Poly Stylized Mountains & Clouds
  private static tropicalHillMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d32, // Lush rolling green foothill
    roughness: 0.85,
    flatShading: true,
  });

  private static rockTerraceMat = new THREE.MeshStandardMaterial({
    color: 0xb45309, // Sandstone terrace rock
    roughness: 0.9,
    flatShading: true,
  });

  private static lowPolyMountainMat = new THREE.MeshStandardMaterial({
    color: 0x1b5e20, // Deep forest mountain ridge
    roughness: 0.85,
    flatShading: true,
  });

  private static distantMountainMat = new THREE.MeshStandardMaterial({
    color: 0x0f766e, // Turquoise distant mountains
    roughness: 0.9,
    flatShading: true,
  });

  private static snowCapMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // Brilliant mountain peak snowcap
    roughness: 0.3,
    flatShading: true,
  });

  private static distantSkyscraperMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.2,
    metalness: 0.8,
  });

  private static cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
  });

  // 9. Subway Tunnel & Highway Flyover Materials
  private static tunnelConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Weathered underground concrete arch
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  private static tunnelTileMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9, // Subway ceramic gloss wall tile
    roughness: 0.2,
    metalness: 0.1,
  });

  private static tunnelTileTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Subway blue ceramic accent stripe
    roughness: 0.3,
  });

  private static tunnelRibMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Arched structural steel beam
    roughness: 0.5,
    metalness: 0.8,
  });

  private static tunnelPillarMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // Heavy cylindrical support columns
    roughness: 0.7,
  });

  private static tunnelSodiumLampMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24, // Glowing warm sodium tunnel lamp
  });

  private static tunnelLightStripMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5, // Warm luminous continuous ceiling strip
  });

  private static tunnelFloodLightMat = new THREE.MeshBasicMaterial({
    color: 0xfffbeb, // High-intensity portal floodlight lens
  });

  private static tunnelPortalSignMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b, // Neon orange metro entrance sign
  });

  private static rampWoodMat = new THREE.MeshStandardMaterial({
    color: 0xb45309, // Construction wood scaffold ramp
    roughness: 0.85,
  });

  private static bridgeDeckMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // Concrete highway overpass deck
    roughness: 0.75,
  });

  private static carYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15, // Taxi cab yellow
    roughness: 0.3,
    metalness: 0.3,
  });

  private static carRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626, // Red commuter car
    roughness: 0.3,
    metalness: 0.3,
  });

  private static carBlueMat = new THREE.MeshStandardMaterial({
    color: 0x2563eb, // Blue delivery van
    roughness: 0.3,
    metalness: 0.2,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public init() {
    this.clearAll();
    this.nextSegmentId = 0;
    this.currentTheme = 'city_railway';
    this.segmentCounter = 0;

    // Generate segments extending behind the player (z < 0) so the tracks, buildings, walls,
    // and parked trains seamlessly extend behind the player and behind the camera!
    for (let i = -BACKWARD_SEGMENTS; i < NUM_SEGMENTS - BACKWARD_SEGMENTS; i++) {
      const startZ = i * SEGMENT_LENGTH;
      const isInitialSafe = i <= 0;
      const segment = this.buildSegment(startZ, isInitialSafe);
      this.segments.push(segment);
      this.scene.add(segment.group);
    }
  }

  public update(
    playerZ: number,
    delta: number,
    playerPos: THREE.Vector3,
    isMagnetActive: boolean,
    currentSpeed = 26,
    playerDistance = 0
  ) {
    this.currentTrackSpeed = currentSpeed;
    this.lastPlayerDistance = playerDistance;
    const thresholdZ = playerZ - SEGMENT_LENGTH * 1.1;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];

      // Update oncoming trains with approach pacing
      for (const train of seg.trains) {
        train.update(delta, playerZ);
      }

      // Update rotating coins & magnet attraction
      for (const coin of seg.coins) {
        if (!coin.collected) {
          coin.update(delta, playerPos, isMagnetActive);
        }
      }

      // Update floating power-ups
      for (const p of seg.powerUps) {
        if (!p.collected) {
          p.update(delta);
        }
      }

      // Check segment recycling
      if (seg.endZ < thresholdZ) {
        this.recycleSegment(i);
        i--;
      }
    }
  }

  private recycleSegment(index: number) {
    const oldSeg = this.segments.splice(index, 1)[0];

    // Return all dynamic environmental assets back into object pools
    for (const train of oldSeg.trains) {
      TrainFactory.recycleTrain(train);
    }
    oldSeg.trains = [];

    for (const obs of oldSeg.obstacles) {
      ObstacleFactory.recycleObstacle(obs);
    }
    oldSeg.obstacles = [];

    for (const coin of oldSeg.coins) {
      CollectibleFactory.recycleCoin(coin);
    }
    oldSeg.coins = [];

    for (const p of oldSeg.powerUps) {
      CollectibleFactory.recyclePowerUp(p);
    }
    oldSeg.powerUps = [];

    this.scene.remove(oldSeg.group);
    this.disposeSegment(oldSeg);

    const lastSeg = this.segments[this.segments.length - 1];
    const newStartZ = lastSeg ? lastSeg.endZ : 0;

    const newSeg = this.buildSegment(newStartZ, false);
    this.segments.push(newSeg);
    this.scene.add(newSeg.group);
  }

  private buildSegment(startZ: number, isInitialSafe: boolean): TrackSegment {
    const endZ = startZ + SEGMENT_LENGTH;
    const group = new THREE.Group();
    group.position.set(0, 0, 0);

    this.segmentCounter++;

    // Alternating cycles: every 5 segments has a 2-segment deep SUBWAY TUNNEL!
    const isTunnel = !isInitialSafe && (this.segmentCounter % 5 === 2 || this.segmentCounter % 5 === 3);
    const isTunnelEntrance = !isInitialSafe && this.segmentCounter % 5 === 2;
    const isTunnelExit = !isInitialSafe && this.segmentCounter % 5 === 3;

    if (isTunnel) {
      this.currentTheme = 'tunnel';
      // Build subway track infrastructure
      this.buildTrackInfrastructure(group, startZ, endZ, true);
      // Build arched subway tunnel tube, portal arches, tile walls, and yellow sodium lights
      this.buildSubwayTunnel(group, startZ, endZ, isTunnelEntrance, isTunnelExit);
    } else {
      this.currentTheme = this.segmentCounter % 5 === 4 ? 'elevated_bridge' : 'city_railway';
      // 1. Golden Sandy Ballast, Caramel Sleepers, 6 Gleaming Steel Rails & Catenaries
      this.buildTrackInfrastructure(group, startZ, endZ, false);

      // 2. Continuous Urban Building Corridor on BOTH Left and Right Flanks
      this.buildUrbanCorridorBothSides(group, startZ, endZ);

      // 3. Multi-Layer Stylized Low-Poly Mountains on BOTH Sides & Distant Spires
      this.buildStylizedMountainRangesBothSides(group, startZ, endZ);

      // 4. Stylized Low-Poly 3D Clouds in the Upper Sky
      this.buildStylizedClouds(group, startZ, endZ);

      // 5. Overhead Highway Flyover Bridge with 3D Driving Vehicles
      if (this.segmentCounter % 2 === 1 && !isInitialSafe) {
        this.buildOverheadHighwayFlyover(group, startZ + 35);
      }

      // 6. Track Switch and Diagonal Crossover Rails
      if (this.segmentCounter % 3 === 0) {
        this.buildTrackSwitch(group, startZ + 22);
      }
    }

    const trains: TrainInstance[] = [];
    const obstacles: ObstacleInstance[] = [];
    const coins: CoinInstance[] = [];
    const powerUps: PowerUpInstance[] = [];
    const ramps: RampInstance[] = [];

    // 5. Populate hazards, coins & authentic subway depot parked trains
    if (startZ < 0) {
      // Parked train carriages on side tracks before the player (Subway maintenance depot yard)
      // Provides authentic depth so the game world never looks like an empty cutoff void
      if (startZ <= -140) {
        const train1 = TrainFactory.createTrain('classic_rail', -LANE_WIDTH, startZ + 22, 0);
        trains.push(train1);
        const train2 = TrainFactory.createTrain('street_art', LANE_WIDTH, startZ + 48, 0);
        trains.push(train2);
      } else if (startZ <= -70) {
        const train1 = TrainFactory.createTrain('street_art', -LANE_WIDTH, startZ + 24, 0);
        trains.push(train1);
        const train2 = TrainFactory.createTrain('red_city', LANE_WIDTH, startZ + 50, 0);
        trains.push(train2);
      } else {
        // -70 to 0 (safely behind camera and runner starting line)
        const train1 = TrainFactory.createTrain('classic_rail', -LANE_WIDTH, startZ + 18, 0);
        trains.push(train1);
        const train2 = TrainFactory.createTrain('street_art', LANE_WIDTH, startZ + 36, 0);
        trains.push(train2);
      }
    } else if (startZ === 0) {
      // Starting segment: center lane has welcoming trail of coins
      this.spawnCoinLine(coins, 0, 1.2, startZ + 12, startZ + 54);

      // Parked train on the right track (+LANE_WIDTH) with climbable wooden ramp!
      const trainZ = startZ + 42;
      const parkedIntro = TrainFactory.createTrain('red_city', LANE_WIDTH, trainZ, 0, true);
      trains.push(parkedIntro);

      const rampLength = 8.5;
      const rampStartZ = trainZ - 11.0 - rampLength; // 42 - 11 - 8.5 = 22.5
      const rampEndZ = trainZ - 11.0 + 0.2;         // 42 - 11 + 0.2 = 31.2
      const introRamp = this.buildWoodenRamp(group, LANE_WIDTH, rampStartZ, rampEndZ, 3.3);
      ramps.push(introRamp);

      // Coins ascending up the ramp and along the train roof!
      this.spawnRampCoins(coins, LANE_WIDTH, rampStartZ, rampEndZ, 3.3);
      this.spawnCoinLine(coins, LANE_WIDTH, 3.3 + 1.2, trainZ - 9, trainZ + 9);

      // Early showcase of all 3 authentic Subway Surfers barrier types on side lanes
      obstacles.push(ObstacleFactory.createObstacle('barricade_jump', -LANE_WIDTH, startZ + 42));
      this.spawnCoinJumpArc(coins, -LANE_WIDTH, startZ + 42);

      obstacles.push(ObstacleFactory.createObstacle('low_overhead_slide', -LANE_WIDTH, startZ + 60));
      obstacles.push(ObstacleFactory.createObstacle('high_barrier', LANE_WIDTH, startZ + 66));
    } else if (!isInitialSafe) {
      this.populateSegmentHazards(group, startZ, endZ, trains, obstacles, coins, powerUps, ramps);
    }

    trains.forEach((t) => group.add(t.mesh));
    obstacles.forEach((o) => group.add(o.mesh));
    coins.forEach((c) => group.add(c.mesh));
    powerUps.forEach((p) => group.add(p.mesh));

    return {
      id: this.nextSegmentId++,
      group,
      theme: this.currentTheme,
      startZ,
      endZ,
      trains,
      obstacles,
      coins,
      powerUps,
      ramps,
    };
  }

  // ==========================================
  // --- 1. TRACK INFRASTRUCTURE & RAILS ---
  // ==========================================
  private buildTrackInfrastructure(root: THREE.Group, startZ: number, endZ: number, isTunnel = false) {
    const length = endZ - startZ;
    const centerZ = startZ + length / 2;
    const trackWidth = LANE_WIDTH * 3 + 2.8;

    // Wide Continuous Urban Ground Bed under tracks, walkways, retaining walls & city buildings
    const groundGeom = TrackManager.getGeometry(`ground_${length}`, () => new THREE.BoxGeometry(64.0, 0.45, length));
    const ground = new THREE.Mesh(
      groundGeom,
      isTunnel ? TrackManager.tunnelConcreteMat : TrackManager.stonePedestrianMat
    );
    ground.position.set(0, -0.26, centerZ);
    TrackManager.markStatic(ground, false, true);
    root.add(ground);

    // Golden Sandy Ballast Bed (or dark stone ballast in tunnel)
    const ballastGeom = TrackManager.getGeometry(`ballast_${length}_${trackWidth}`, () => new THREE.BoxGeometry(trackWidth, 0.45, length));
    const ballast = new THREE.Mesh(ballastGeom, isTunnel ? TrackManager.tunnelConcreteMat : TrackManager.ballastMat);
    ballast.position.set(0, -0.22, centerZ);
    TrackManager.markStatic(ballast, false, true);
    root.add(ballast);

    // Stone Pedestrian Curbs and Walkways on outer edges with yellow hazard line
    const walkwayGeom = TrackManager.getGeometry(`walkway_${length}`, () => new THREE.BoxGeometry(1.4, 0.45, length));
    const curbGeom = TrackManager.getGeometry(`curb_${length}`, () => new THREE.BoxGeometry(0.28, 0.22, length));

    [-trackWidth / 2 - 0.7, trackWidth / 2 + 0.7].forEach((wx) => {
      const walkway = new THREE.Mesh(walkwayGeom, TrackManager.stonePedestrianMat);
      walkway.position.set(wx, -0.15, centerZ);
      TrackManager.markStatic(walkway, false, true);
      root.add(walkway);

      // Elevated Curb with Yellow Caution Hazard Marking
      const curb = new THREE.Mesh(curbGeom, TrackManager.hazardStripeMat);
      curb.position.set(wx > 0 ? wx - 0.65 : wx + 0.65, 0.11, centerZ);
      TrackManager.markStatic(curb, false, false);
      root.add(curb);
    });

    if (!isTunnel) {
      // Continuous Trackside Concrete Retaining Wall on BOTH outer edges (X = ±7.2m)
      const wallGeom = TrackManager.getGeometry(`wall_${length}`, () => new THREE.BoxGeometry(0.6, 2.2, length));
      const railBarGeom = TrackManager.getGeometry(`railBar_${length}`, () => new THREE.CylinderGeometry(0.04, 0.04, length, 6));

      [-7.2, 7.2].forEach((wallX) => {
        const wall = new THREE.Mesh(wallGeom, TrackManager.stoneWallMat);
        wall.position.set(wallX, 1.1, centerZ);
        TrackManager.markStatic(wall, true, true);
        root.add(wall);

        // Top Safety Handrail
        const railBar = new THREE.Mesh(railBarGeom, TrackManager.catenarySteelMat);
        railBar.rotation.x = Math.PI / 2;
        railBar.position.set(wallX, 2.3, centerZ);
        TrackManager.markStatic(railBar, false, false);
        root.add(railBar);

        // Graffiti Murals & Subway Tags on the wall
        for (let z = startZ + 8; z < endZ; z += 18) {
          this.buildGraffitiTag(root, wallX > 0 ? wallX - 0.32 : wallX + 0.32, 1.2, z, wallX > 0);
        }
      });
    }

    // 3 Lanes of Rails & Sleepers (Left: -3.2, Center: 0, Right: +3.2)
    const lanesX = [-LANE_WIDTH, 0, LANE_WIDTH];
    const railWidth = 0.09;
    const railHeight = 0.16;
    const gauge = 1.6;
    const railGeom = TrackManager.getGeometry(`rail_${length}`, () => new THREE.BoxGeometry(railWidth, railHeight, length));

    lanesX.forEach((lx) => {
      // Left and Right Steel Rails with gleaming top
      const railLeft = new THREE.Mesh(railGeom, TrackManager.steelRailMat);
      railLeft.position.set(lx - gauge / 2, 0.08, centerZ);
      TrackManager.markStatic(railLeft, false, false);
      root.add(railLeft);

      const railRight = new THREE.Mesh(railGeom, TrackManager.steelRailMat);
      railRight.position.set(lx + gauge / 2, 0.08, centerZ);
      TrackManager.markStatic(railRight, false, false);
      root.add(railRight);
    });

    // Caramel-Wood Sleepers spaced regularly every 1.45m (GPU InstancedMesh - 1 draw call!)
    const sleeperCountPerLane = Math.floor(length / 1.45);
    const totalSleepers = sleeperCountPerLane * 3;
    const sleepersMesh = new THREE.InstancedMesh(
      TrackManager.sharedSleeperGeom,
      TrackManager.sleeperMat,
      totalSleepers
    );
    const dummySleeper = new THREE.Object3D();
    let sleeperIdx = 0;

    [-LANE_WIDTH, 0, LANE_WIDTH].forEach((lx) => {
      for (let i = 0; i < sleeperCountPerLane; i++) {
        const sz = startZ + i * 1.45 + 0.72;
        dummySleeper.position.set(lx, 0.02, sz);
        dummySleeper.updateMatrix();
        sleepersMesh.setMatrixAt(sleeperIdx++, dummySleeper.matrix);
      }
    });
    sleepersMesh.instanceMatrix.needsUpdate = true;
    TrackManager.markStatic(sleepersMesh, false, true);
    root.add(sleepersMesh);

    if (!isTunnel) {
      // Overhead Railway Catenary Gantries & Wires every 24m
      for (let z = startZ + 12; z < endZ; z += 24) {
        this.buildCatenaryGantry(root, z, length);
      }

      // Overhead Festival Bunting with colorful pennants strung across tracks
      for (let z = startZ + 24; z < endZ; z += 32) {
        this.buildOverheadFestivalBunting(root, z);
      }
    }
  }

  // --- Overhead Catenary Gantry with Signal Lights ---
  private buildCatenaryGantry(root: THREE.Group, z: number, segmentLen: number) {
    const gantry = new THREE.Group();
    gantry.position.set(0, 0, z);

    const span = LANE_WIDTH * 3 + 3.6;
    const height = 6.4;

    // Steel Lattice Posts on left and right
    [-span / 2, span / 2].forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, height, 0.35),
        TrackManager.catenarySteelMat
      );
      post.position.set(px, height / 2, 0);
      post.castShadow = false;
      gantry.add(post);

      // Foundation block
      const found = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.6, 0.7),
        TrackManager.stonePedestrianMat
      );
      found.position.set(px, 0.3, 0);
      gantry.add(found);
    });

    // Horizontal Steel Lattice Beam spanning all lanes
    const crossbeam = new THREE.Mesh(
      new THREE.BoxGeometry(span + 0.4, 0.4, 0.4),
      TrackManager.catenarySteelMat
    );
    crossbeam.position.set(0, height, 0);
    gantry.add(crossbeam);

    // 3 Overhead Contact Droppers above each track lane
    [-LANE_WIDTH, 0, LANE_WIDTH].forEach((lx, idx) => {
      const dropper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6),
        TrackManager.catenarySteelMat
      );
      dropper.position.set(lx, height - 0.6, 0);
      gantry.add(dropper);

      // Railway Signal Box above center & side lanes
      if (idx === 1 || Math.sin(z) > 0) {
        const signalBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.7, 0.3),
          TrackManager.catenarySteelMat
        );
        signalBox.position.set(lx + 0.8, height - 0.5, 0);
        gantry.add(signalBox);

        // Green / Red Signal LED
        const isGreen = Math.sin(z * 0.3 + idx) > -0.2;
        const led = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          isGreen ? TrackManager.signalGreenMat : TrackManager.signalRedMat
        );
        led.position.set(lx + 0.8, height - 0.5, -0.16);
        gantry.add(led);
      }
    });

    root.add(gantry);

    // High-Voltage Overhead Catenary Wire running down the segment length
    const wireGeom = new THREE.CylinderGeometry(0.012, 0.012, segmentLen, 4);
    [-LANE_WIDTH, 0, LANE_WIDTH].forEach((lx) => {
      const wire = new THREE.Mesh(wireGeom, TrackManager.wireMat);
      wire.rotation.x = Math.PI / 2;
      wire.position.set(lx, height - 1.2, (root.position.z + (segmentLen / 2)));
      root.add(wire);
    });
  }

  // --- Colorful Graffiti Tag Murals ---
  private buildGraffitiTag(root: THREE.Group, x: number, y: number, z: number, facingLeft: boolean) {
    const tagGroup = new THREE.Group();
    tagGroup.position.set(x, y, z);
    if (!facingLeft) tagGroup.rotation.y = Math.PI;

    // Stylized graffiti letters / shapes
    const colors = [
      TrackManager.graffitiCyanMat,
      TrackManager.graffitiPinkMat,
      TrackManager.graffitiYellowMat,
    ];
    const chosenMat = colors[Math.floor(Math.abs(Math.sin(z * 3.7)) * colors.length)];

    const letter1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 1.4), chosenMat);
    letter1.rotation.x = 0.15;
    tagGroup.add(letter1);

    const letter2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.5, 1.8),
      TrackManager.graffitiPinkMat
    );
    letter2.position.set(0.01, -0.2, 0.3);
    tagGroup.add(letter2);

    root.add(tagGroup);
  }

  // ==========================================
  // --- 2. DENSE URBAN CORRIDOR (BOTH SIDES) ---
  // ==========================================
  private buildUrbanCorridorBothSides(root: THREE.Group, startZ: number, endZ: number) {
    // Left Flank (X ≈ -13.5m)
    this.buildLeftFlankStreet(root, startZ, endZ);

    // Right Flank (X ≈ +13.5m)
    this.buildRightFlankStreet(root, startZ, endZ);
  }

  // --- LEFT FLANK: Mediterranean & Urban Townhouses, Palms, Scooters, Planters ---
  private buildLeftFlankStreet(root: THREE.Group, startZ: number, endZ: number) {
    const leftX = -13.5;
    const buildingPalettes = [
      TrackManager.terracottaMat,
      TrackManager.warmStuccoMat,
      TrackManager.sunnyYellowMat,
      TrackManager.turquoiseMat,
      TrackManager.creamWhiteMat,
      TrackManager.crimsonBrickMat,
    ];

    let buildingIdx = 0;
    for (let z = startZ + 7; z < endZ; z += 14) {
      const mat = buildingPalettes[buildingIdx % buildingPalettes.length];
      const bHeight = 8.0 + ((buildingIdx % 3) * 2.5); // 8m, 10.5m, 13m
      const bWidth = 9.5;
      const bDepth = 13.5;

      // Main Townhouse Structure
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(bWidth, bHeight, bDepth),
        mat
      );
      building.position.set(leftX, bHeight / 2, z);
      building.castShadow = false;
      building.receiveShadow = true;
      root.add(building);

      // Roof Type (Spanish Tile, Mansard, or Flat with Water Tower)
      if (buildingIdx % 2 === 0) {
        // Spanish Clay Tile Roof
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(bDepth * 0.55, 3.2, 4),
          TrackManager.spanishTileRoofMat
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.set(leftX, bHeight + 1.6, z);
        roof.castShadow = false;
        root.add(roof);
      } else {
        // Flat roof with parapet wall + Rooftop Wooden Water Tower or AC units
        const parapet = new THREE.Mesh(
          new THREE.BoxGeometry(bWidth + 0.2, 0.8, bDepth + 0.2),
          TrackManager.stonePedestrianMat
        );
        parapet.position.set(leftX, bHeight + 0.4, z);
        root.add(parapet);

        if (buildingIdx % 4 === 1) {
          this.buildRooftopWaterTower(root, leftX, bHeight + 0.8, z);
        } else {
          this.buildRooftopACCompressor(root, leftX - 1.5, bHeight + 0.8, z);
        }
      }

      // Detailed Multi-Pane Windows on Facade
      const windowFloors = Math.floor(bHeight / 3.2);
      for (let f = 1; f <= windowFloors; f++) {
        const wy = f * 2.8;
        [-3.2, 3.2].forEach((wz) => {
          this.buildFacadeWindow(root, leftX + bWidth / 2 + 0.05, wy, z + wz, true);

          // Wrought-iron balcony on 2nd floor
          if (f === 2) {
            const balcony = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 0.9, 2.0),
              TrackManager.ironBalconyMat
            );
            balcony.position.set(leftX + bWidth / 2 + 0.4, wy - 0.4, z + wz);
            root.add(balcony);
          }
        });
      }

      // Ground Floor Striped Storefront Awning
      const awningColors = [
        TrackManager.candyRedMat,
        TrackManager.candyBlueMat,
        TrackManager.candyGreenMat,
        TrackManager.purpleAwningMat,
      ];
      const awningMat = awningColors[buildingIdx % awningColors.length];
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.35, 9.0),
        awningMat
      );
      awning.rotation.z = 0.24;
      awning.position.set(leftX + bWidth / 2 + 0.8, 3.6, z);
      root.add(awning);

      // Tropical Palm Tree behind/beside the townhouse
      this.buildPalmTree(root, leftX - 4.5, z + 3.0);

      // Sidewalk Props
      if (buildingIdx % 2 === 0) {
        this.buildVintageScooter(root, -8.2, 0, z + 4.0);
      } else {
        this.buildFlowerPlanter(root, -8.0, 0, z - 3.0);
        this.buildStreetLamp(root, -8.0, 0, z + 4.5);
      }

      buildingIdx++;
    }
  }

  // --- RIGHT FLANK: Gas Station, Urban Brownstones, Fire Escapes, Market Crates ---
  private buildRightFlankStreet(root: THREE.Group, startZ: number, endZ: number) {
    const rightX = 13.5;

    let buildingIdx = 0;
    for (let z = startZ + 7; z < endZ; z += 14) {
      // 1. Gas Station Feature every other segment
      if (buildingIdx === 0 && Math.sin(startZ) > -0.2) {
        this.buildRetroGasStation(root, rightX, z);
      } else {
        // Multi-Story Urban Brownstone / Commercial Building
        const bHeight = 8.5 + ((buildingIdx % 3) * 2.2);
        const bWidth = 9.5;
        const bDepth = 13.5;
        const mat = (buildingIdx % 2 === 0) ? TrackManager.warmStuccoMat : TrackManager.crimsonBrickMat;

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bWidth, bHeight, bDepth),
          mat
        );
        building.position.set(rightX, bHeight / 2, z);
        building.castShadow = false;
        building.receiveShadow = true;
        root.add(building);

        // Windows on Facade
        const windowFloors = Math.floor(bHeight / 3.0);
        for (let f = 1; f <= windowFloors; f++) {
          const wy = f * 2.7;
          [-3.0, 3.0].forEach((wz) => {
            this.buildFacadeWindow(root, rightX - bWidth / 2 - 0.05, wy, z + wz, false);
          });
        }

        // Exterior Fire Escape Staircase on Front Facade
        this.buildFireEscape(root, rightX - bWidth / 2 - 0.5, bHeight, z);

        // Huge Rooftop Billboard Signs ("NOOB RUN 3D", "SUBWAY EXPRESS")
        if (buildingIdx % 2 === 1) {
          this.buildRooftopBillboard(root, rightX, bHeight + 1.8, z);
        } else {
          this.buildRooftopACCompressor(root, rightX + 1.2, bHeight + 0.6, z);
        }

        // Ground Floor Bodega / Market Fruit Crates
        this.buildMarketCrates(root, 8.2, z - 2.5);

        // Pedestrian Stone Steps
        this.buildPedestrianStairs(root, 8.4, z + 3.5);

        // Street Lamp & Palm Tree
        this.buildStreetLamp(root, 8.2, 0, z - 4.5);
        this.buildPalmTree(root, rightX + 4.8, z + 2.0);
      }

      buildingIdx++;
    }
  }

  // --- Retro Gas Station with Candy Pylons and Vintage Fuel Pumps ---
  private buildRetroGasStation(root: THREE.Group, x: number, z: number) {
    const stationGroup = new THREE.Group();
    stationGroup.position.set(x, 0, z);

    // Convenience Store Main Building
    const bWidth = 9.0;
    const bHeight = 6.5;
    const bDepth = 13.0;

    const station = new THREE.Mesh(
      new THREE.BoxGeometry(bWidth, bHeight, bDepth),
      TrackManager.warmStuccoMat
    );
    station.position.set(0, bHeight / 2, 0);
    station.castShadow = false;
    stationGroup.add(station);

    // Large Illuminated Gas Canopy Overhang
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, 0.45, 12.0),
      TrackManager.candyRedMat
    );
    canopy.position.set(-bWidth / 2 - 2.2, 5.2, 0);
    canopy.castShadow = false;
    stationGroup.add(canopy);

    // Glowing Neon Trim on Canopy
    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(6.1, 0.1, 12.1),
      TrackManager.candyWhiteMat
    );
    neon.position.set(-bWidth / 2 - 2.2, 5.0, 0);
    stationGroup.add(neon);

    root.add(stationGroup);

    // 2. Candy-Striped Pylon with Circular Flame Emblem (Exact Subway Surfers Prop)
    this.buildCandyStripedPylonWithFlame(root, 7.8, z - 4.0);

    // 3. Vintage Dual Roadside Fuel Pumps
    this.buildVintageGasPump(root, 8.0, z + 2.5);

    // 4. Blue Coolers & Fruit Crates
    this.buildMarketCrates(root, 8.2, z + 5.5);

    // 5. Palm Tree behind the station
    this.buildPalmTree(root, x + 4.8, z - 2.0);
  }

  // --- Facade Window with Wooden Frame and Glowing Glass ---
  private buildFacadeWindow(root: THREE.Group, x: number, y: number, z: number, facingRight: boolean) {
    const winGroup = new THREE.Group();
    winGroup.position.set(x, y, z);

    // Reusable shared geometries
    const frameGeom = TrackManager.getGeometry('win_frame', () => new THREE.BoxGeometry(0.12, 1.8, 1.4));
    const glassGeom = TrackManager.getGeometry('win_glass', () => new THREE.BoxGeometry(0.14, 1.5, 1.1));
    const sillGeom = TrackManager.getGeometry('win_sill', () => new THREE.BoxGeometry(0.25, 0.12, 1.6));

    // Dark Wood Frame
    const frame = new THREE.Mesh(frameGeom, TrackManager.windowFrameMat);
    TrackManager.markStatic(frame, false, false);
    winGroup.add(frame);

    // Window Glass (alternates between dark reflective and glowing warm light)
    const isGlowing = Math.sin(x * 2.0 + z * 1.5 + y) > 0.1;
    const glassMat = isGlowing ? TrackManager.windowGlowMat : TrackManager.windowDarkMat;
    const glass = new THREE.Mesh(glassGeom, glassMat);
    TrackManager.markStatic(glass, false, false);
    winGroup.add(glass);

    // White Window Sill
    const sill = new THREE.Mesh(sillGeom, TrackManager.stonePedestrianMat);
    sill.position.set(facingRight ? 0.08 : -0.08, -0.9, 0);
    TrackManager.markStatic(sill, false, false);
    winGroup.add(sill);

    TrackManager.markStatic(winGroup, false, false);
    root.add(winGroup);
  }

  // --- Exterior Black Metal Fire Escape Staircase ---
  private buildFireEscape(root: THREE.Group, x: number, height: number, z: number) {
    const fireEscape = new THREE.Group();
    fireEscape.position.set(x, 0, z);

    const levels = Math.floor(height / 2.8);
    for (let i = 1; i < levels; i++) {
      const py = i * 2.8;

      // Grated Metal Platform
      const plat = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 2.4),
        TrackManager.ironBalconyMat
      );
      plat.position.set(0, py, 0);
      fireEscape.add(plat);

      // Protective Railings
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 2.4),
        TrackManager.ironBalconyMat
      );
      rail.position.set(0, py + 0.4, 0);
      fireEscape.add(rail);

      // Angled Ladder linking floors
      if (i < levels - 1) {
        const ladder = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 3.2, 0.1),
          TrackManager.ironBalconyMat
        );
        ladder.rotation.z = -0.35;
        ladder.position.set(0.2, py + 1.4, 0.8);
        fireEscape.add(ladder);
      }
    }

    root.add(fireEscape);
  }

  // --- Rooftop Wooden Water Tower ---
  private buildRooftopWaterTower(root: THREE.Group, x: number, y: number, z: number) {
    const tower = new THREE.Group();
    tower.position.set(x, y, z);

    // 4 Steel Stilts
    [-1.0, 1.0].forEach((sx) => {
      [-1.0, 1.0].forEach((sz) => {
        const stilt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6),
          TrackManager.catenarySteelMat
        );
        stilt.position.set(sx, 1.25, sz);
        tower.add(stilt);
      });
    });

    // Cylindrical Wooden Barrel Tank
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 2.2, 12),
      TrackManager.waterTowerWoodMat
    );
    tank.position.set(0, 3.6, 0);
    tower.add(tank);

    // Conical Roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 1.0, 12),
      TrackManager.spanishTileRoofMat
    );
    roof.position.set(0, 5.2, 0);
    tower.add(roof);

    root.add(tower);
  }

  // --- Rooftop AC Compressor Unit ---
  private buildRooftopACCompressor(root: THREE.Group, x: number, y: number, z: number) {
    const ac = new THREE.Group();
    ac.position.set(x, y, z);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.1, 1.8),
      TrackManager.acCompressorMat
    );
    box.position.y = 0.55;
    ac.add(box);

    // Fan Grille
    const fan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12),
      TrackManager.rubberBlackMat
    );
    fan.rotation.z = Math.PI / 2;
    fan.position.set(0.72, 0.6, 0);
    ac.add(fan);

    root.add(ac);
  }

  // --- Huge Rooftop Billboard Signs ---
  private buildRooftopBillboard(root: THREE.Group, x: number, y: number, z: number) {
    const bb = new THREE.Group();
    bb.position.set(x, y, z);

    // Steel Support Legs
    [-2.2, 2.2].forEach((lx) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6),
        TrackManager.catenarySteelMat
      );
      leg.position.set(lx, 1.1, 0);
      bb.add(leg);
    });

    // Main Billboard Face
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 2.6, 0.25),
      TrackManager.billboardSignMat
    );
    face.position.y = 2.6;
    bb.add(face);

    // Gold Glowing Inner Badge ("NOOB RUN")
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 1.8, 0.28),
      TrackManager.billboardGoldMat
    );
    badge.position.y = 2.6;
    bb.add(badge);

    root.add(bb);
  }

  // --- Ornate Cast-Iron Street Lamp ---
  private buildStreetLamp(root: THREE.Group, x: number, y: number, z: number) {
    const lamp = new THREE.Group();
    lamp.position.set(x, y, z);

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8),
      TrackManager.catenarySteelMat
    );
    pole.position.y = 2.1;
    lamp.add(pole);

    // Curved Arm
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.1, 0.1),
      TrackManager.catenarySteelMat
    );
    arm.position.set(x > 0 ? -0.4 : 0.4, 4.1, 0);
    lamp.add(arm);

    // Glowing Lantern Globe
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 8),
      TrackManager.streetLampGlowMat
    );
    globe.position.set(x > 0 ? -0.8 : 0.8, 3.8, 0);
    lamp.add(globe);

    root.add(lamp);
  }

  // ==========================================
  // --- 3. STYLIZED LOW-POLY MOUNTAINS (BOTH SIDES) ---
  // ==========================================
  private buildStylizedMountainRangesBothSides(root: THREE.Group, startZ: number, endZ: number) {
    // Generate layered stylized mountains on BOTH sides (-1: Left, +1: Right)
    const sides = [-1, 1];

    sides.forEach((sideDir) => {
      // LAYER 1: Rolling Green & Sandstone Foothills (X ≈ ±38m to ±52m)
      for (let z = startZ; z < endZ; z += 18) {
        const hillHeight = 28 + ((Math.sin(z * 0.14 + sideDir * 2) + 1) * 10);
        const hillRadius = 18 + ((Math.cos(z * 0.2) + 1) * 6);
        const hillX = sideDir * (42 + ((Math.sin(z * 0.08) + 1) * 8));

        const rKey = Math.round(hillRadius);
        const hKey = Math.round(hillHeight);
        const hillGeom = TrackManager.getGeometry(`hill_${rKey}_${hKey}`, () => new THREE.ConeGeometry(rKey, hKey, 6));

        // Faceted low-poly cone (reusing cached geometry)
        const hillMesh = new THREE.Mesh(hillGeom, TrackManager.tropicalHillMat);
        hillMesh.rotation.y = z * 0.4;
        hillMesh.position.set(hillX, hillHeight / 2 - 3, z + 6);
        TrackManager.markStatic(hillMesh, false, false);
        root.add(hillMesh);

        // Clustered stylized pine/cypress and palm trees on hill slopes
        if (Math.sin(z * 0.5) > 0) {
          this.buildMountainSlopeFoliage(root, hillX * 0.85, hillHeight * 0.45, z + 4);
        }
      }

      // LAYER 2: Towering Low-Poly Mountain Massifs with Snowcaps (X ≈ ±65m to ±95m)
      for (let z = startZ + 4; z < endZ; z += 22) {
        const peakHeight = 68 + ((Math.cos(z * 0.09) + 1) * 16); // 68m - 100m tall
        const peakRadius = 32 + ((Math.sin(z * 0.12) + 1) * 8);
        const peakX = sideDir * (78 + ((Math.cos(z * 0.05) + 1) * 14));

        const rKey = Math.round(peakRadius);
        const hKey = Math.round(peakHeight);
        const peakGeom = TrackManager.getGeometry(`peak_${rKey}_${hKey}`, () => new THREE.ConeGeometry(rKey, hKey, 6));

        // Faceted mountain massif (reusing cached geometry)
        const peakMesh = new THREE.Mesh(peakGeom, TrackManager.lowPolyMountainMat);
        peakMesh.rotation.y = z * 0.6;
        peakMesh.position.set(peakX, peakHeight / 2 - 6, z);
        TrackManager.markStatic(peakMesh, false, false);
        root.add(peakMesh);

        // Brilliant White Snowcap on Highest Peaks (Subway Surfers signature mountain look)
        if (peakHeight > 78) {
          const capR = Math.round(peakRadius * 0.35);
          const capH = Math.round(peakHeight * 0.35);
          const snowCapGeom = TrackManager.getGeometry(`snowcap_${capR}_${capH}`, () => new THREE.ConeGeometry(capR, capH, 6));
          const snowCap = new THREE.Mesh(snowCapGeom, TrackManager.snowCapMat);
          snowCap.rotation.y = z * 0.6;
          snowCap.position.set(peakX, peakHeight - (peakHeight * 0.35 / 2) - 6, z);
          TrackManager.markStatic(snowCap, false, false);
          root.add(snowCap);
        }
      }

      // LAYER 3: Monumental Distant Horizon Mountain Wall (X ≈ ±110m to ±165m)
      for (let z = startZ + 8; z < endZ; z += 28) {
        const distHeight = 98 + ((Math.sin(z * 0.06 + sideDir) + 1) * 22); // 98m - 142m tall
        const distRadius = 45 + ((Math.cos(z * 0.08) + 1) * 12);
        const distX = sideDir * (132 + ((Math.sin(z * 0.03) + 1) * 18));

        const rKey = Math.round(distRadius);
        const hKey = Math.round(distHeight);
        const distGeom = TrackManager.getGeometry(`dist_mtn_${rKey}_${hKey}`, () => new THREE.ConeGeometry(rKey, hKey, 5));

        const distMountain = new THREE.Mesh(distGeom, TrackManager.distantMountainMat);
        distMountain.rotation.y = z * 0.3;
        distMountain.position.set(distX, distHeight / 2 - 12, z);
        TrackManager.markStatic(distMountain, false, false);
        root.add(distMountain);
      }

      // Distant Modern Glass City Spires peeking through mountain notches (X ≈ ±95m)
      if (Math.sin(startZ * 0.08 + sideDir) > 0.15) {
        const towerHeight = 110;
        const towerGeom = TrackManager.getGeometry(`spire_${towerHeight}`, () => new THREE.BoxGeometry(18.0, towerHeight, 18.0));
        const tower = new THREE.Mesh(towerGeom, TrackManager.distantSkyscraperMat);
        tower.position.set(sideDir * 96, towerHeight / 2 - 12, startZ + 28);
        TrackManager.markStatic(tower, false, false);
        root.add(tower);

        // Glowing antenna spire on top
        const spireGeom = TrackManager.getGeometry('antenna_spire', () => new THREE.CylinderGeometry(0.2, 0.4, 18.0, 6));
        const spire = new THREE.Mesh(spireGeom, TrackManager.catenarySteelMat);
        spire.position.set(sideDir * 96, towerHeight + 9.0 - 12, startZ + 28);
        TrackManager.markStatic(spire, false, false);
        root.add(spire);
      }
    });
  }

  // --- Mountain Slope Cypress / Pine Tree Cluster ---
  private buildMountainSlopeFoliage(root: THREE.Group, x: number, y: number, z: number) {
    const cluster = new THREE.Group();
    cluster.position.set(x, y, z);

    // 3 Stylized Low-Poly Conifer Trees (reusing cached geometries)
    [-1.8, 0, 1.8].forEach((ox, i) => {
      const treeGeom = TrackManager.getGeometry(`cypress_${i}`, () => new THREE.ConeGeometry(1.6 - i * 0.2, 5.2 - i * 0.4, 5));
      const tree = new THREE.Mesh(treeGeom, TrackManager.cypressMat);
      tree.position.set(ox, 2.6, (i % 2 === 0 ? 0.8 : -0.8));
      TrackManager.markStatic(tree, false, false);
      cluster.add(tree);
    });

    TrackManager.markStatic(cluster, false, false);
    root.add(cluster);
  }

  // ==========================================
  // --- 4. STYLIZED LOW-POLY 3D CLOUDS ---
  // ==========================================
  private buildStylizedClouds(root: THREE.Group, startZ: number, endZ: number) {
    const puff1Geom = TrackManager.getGeometry('cloud_puff_1', () => new THREE.DodecahedronGeometry(6.5, 0));
    const puff2Geom = TrackManager.getGeometry('cloud_puff_2', () => new THREE.DodecahedronGeometry(8.2, 0));
    const puff3Geom = TrackManager.getGeometry('cloud_puff_3', () => new THREE.DodecahedronGeometry(5.8, 0));
    const puff4Geom = TrackManager.getGeometry('cloud_puff_4', () => new THREE.DodecahedronGeometry(4.5, 0));

    // Floating fluffy clouds across upper sky
    for (let z = startZ + 10; z < endZ; z += 35) {
      const cloudGroup = new THREE.Group();
      const cloudX = ((Math.sin(z * 0.4) > 0 ? 1 : -1) * (35 + Math.abs(Math.sin(z * 0.2)) * 45));
      const cloudY = 75 + Math.abs(Math.cos(z * 0.3)) * 25; // 75m - 100m high

      cloudGroup.position.set(cloudX, cloudY, z);

      // Cloud body composed of 4 overlapping rounded low-poly boxes
      const puff1 = new THREE.Mesh(puff1Geom, TrackManager.cloudMat);
      TrackManager.markStatic(puff1, false, false);
      cloudGroup.add(puff1);

      const puff2 = new THREE.Mesh(puff2Geom, TrackManager.cloudMat);
      puff2.position.set(5.2, -1.0, 0);
      TrackManager.markStatic(puff2, false, false);
      cloudGroup.add(puff2);

      const puff3 = new THREE.Mesh(puff3Geom, TrackManager.cloudMat);
      puff3.position.set(-4.8, -0.8, 1.2);
      TrackManager.markStatic(puff3, false, false);
      cloudGroup.add(puff3);

      const puff4 = new THREE.Mesh(puff4Geom, TrackManager.cloudMat);
      puff4.position.set(2.4, 2.2, -1.0);
      TrackManager.markStatic(puff4, false, false);
      cloudGroup.add(puff4);

      TrackManager.markStatic(cloudGroup, false, false);
      root.add(cloudGroup);
    }
  }

  // ==========================================
  // --- 5. SUBWAY SURFERS ENVIRONMENT PROPS ---
  // ==========================================

  // --- Palm Tree Builder ---
  private buildPalmTree(root: THREE.Group, x: number, z: number) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);

    // Segmented curved woody trunk
    const trunkSegments = 7;
    let currY = 0;
    let currTiltX = 0;
    let currTiltZ = 0;

    for (let i = 0; i < trunkSegments; i++) {
      const segHeight = 1.3;
      const segWidth = 0.55 - i * 0.04;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(segWidth * 0.85, segWidth, segHeight, 7),
        TrackManager.palmTrunkMat
      );
      currTiltX += (Math.sin(x + i) * 0.06);
      currTiltZ += (Math.cos(z + i) * 0.04);
      seg.position.set(currTiltX, currY + segHeight / 2, currTiltZ);
      tree.add(seg);
      currY += segHeight * 0.92;
    }

    // Lush Fan Fronds (Starburst arrangement of 8 tropical palm leaves)
    const crown = new THREE.Group();
    crown.position.set(currTiltX, currY, currTiltZ);

    const leafAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    leafAngles.forEach((ang) => {
      const rad = (ang * Math.PI) / 180;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.08, 4.2),
        Math.random() > 0.5 ? TrackManager.palmLeafMat : TrackManager.palmLeafDarkMat
      );
      leaf.rotation.y = rad;
      leaf.rotation.x = 0.35 + Math.random() * 0.15; // drooping curve
      leaf.position.set(Math.sin(rad) * 1.8, -0.4, Math.cos(rad) * 1.8);
      crown.add(leaf);
    });

    // Coconut cluster
    [-0.3, 0.3].forEach((cx) => {
      const coconut = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 6, 6),
        TrackManager.spanishTileRoofMat
      );
      coconut.position.set(cx, -0.2, 0);
      crown.add(coconut);
    });

    tree.add(crown);
    root.add(tree);
  }

  // --- Candy-Striped Pylon with Circular Flame Badge (Iconic Subway Surfers Prop) ---
  private buildCandyStripedPylonWithFlame(root: THREE.Group, x: number, z: number) {
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(x, 0, z);

    // Stone Pedestal Base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 1.2),
      TrackManager.stonePedestrianMat
    );
    base.position.y = 0.4;
    pylonGroup.add(base);

    // Pylon Column with alternating Red and White Stripe segments
    const numStripes = 6;
    for (let i = 0; i < numStripes; i++) {
      const stripeMat = i % 2 === 0 ? TrackManager.candyRedMat : TrackManager.candyWhiteMat;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12),
        stripeMat
      );
      seg.position.y = 0.8 + (i * 0.8) + 0.4;
      pylonGroup.add(seg);
    }

    // Circular Promotional Sign on Top
    const signDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.18, 18),
      TrackManager.candyWhiteMat
    );
    signDisc.rotation.x = Math.PI / 2;
    signDisc.position.y = 0.8 + (numStripes * 0.8) + 1.1;
    pylonGroup.add(signDisc);

    // Flame Emblem Inside Disc (Golden/Orange)
    const flameEmblem = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.1, 8),
      TrackManager.flameOrangeMat
    );
    flameEmblem.position.set(0, 0.8 + (numStripes * 0.8) + 1.1, 0.12);
    pylonGroup.add(flameEmblem);

    root.add(pylonGroup);
  }

  // --- Vintage Roadside Gas Pump ---
  private buildVintageGasPump(root: THREE.Group, x: number, z: number) {
    const pumpGroup = new THREE.Group();
    pumpGroup.position.set(x, 0, z);

    // Red Pump Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 2.2, 0.75),
      TrackManager.gasPumpRedMat
    );
    body.position.y = 1.1;
    body.castShadow = false;
    pumpGroup.add(body);

    // Lit Fuel Gauge Display Window
    const meter = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.45, 0.1),
      TrackManager.gasMeterGreenMat
    );
    meter.position.set(-0.4, 1.5, 0);
    pumpGroup.add(meter);

    // Chrome Nozzle Handle on the side
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6),
      TrackManager.scooterChromeMat
    );
    nozzle.position.set(0, 1.2, 0.42);
    pumpGroup.add(nozzle);

    root.add(pumpGroup);
  }

  // --- Vintage Parked Moped / Scooter ---
  private buildVintageScooter(root: THREE.Group, x: number, y: number, z: number) {
    const scooter = new THREE.Group();
    scooter.position.set(x, y, z);
    scooter.rotation.y = 0.35; // Parked at slight angle

    // Main Orange Chassis
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.5, 1.6),
      TrackManager.scooterOrangeMat
    );
    frame.position.y = 0.5;
    scooter.add(frame);

    // Front Fairing
    const fairing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.8, 0.35),
      TrackManager.scooterOrangeMat
    );
    fairing.position.set(0, 0.8, 0.65);
    scooter.add(fairing);

    // Chrome Handlebars
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8),
      TrackManager.scooterChromeMat
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.2, 0.65);
    scooter.add(bar);

    // Round Headlight
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    light.position.set(0, 1.05, 0.85);
    scooter.add(light);

    // Black Rubber Wheels
    [-0.6, 0.6].forEach((wz) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12),
        TrackManager.rubberBlackMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.24, wz);
      scooter.add(wheel);
    });

    // Leather Seat
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 0.7),
      TrackManager.sleeperMat
    );
    seat.position.set(0, 0.82, -0.15);
    scooter.add(seat);

    root.add(scooter);
  }

  // --- Market Bins & Fruit Crates ---
  private buildMarketCrates(root: THREE.Group, x: number, z: number) {
    const market = new THREE.Group();
    market.position.set(x, 0, z);

    // Blue Storage Cooler
    const cooler = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.8),
      TrackManager.blueCrateMat
    );
    cooler.position.set(0, 0.4, -0.6);
    market.add(cooler);

    // Stacked Wooden Crates with Yellow Lemons
    const crate1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.45, 0.7),
      TrackManager.woodCrateMat
    );
    crate1.position.set(0, 0.23, 0.6);
    market.add(crate1);

    const lemons = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.2, 0.55),
      TrackManager.fruitYellowMat
    );
    lemons.position.set(0, 0.48, 0.6);
    market.add(lemons);

    root.add(market);
  }

  // --- Flower Planters ---
  private buildFlowerPlanter(root: THREE.Group, x: number, y: number, z: number) {
    const planter = new THREE.Group();
    planter.position.set(x, y, z);

    const pot = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 1.8),
      TrackManager.terracottaMat
    );
    pot.position.y = 0.35;
    planter.add(pot);

    const bush = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.6, 1.6),
      TrackManager.palmLeafMat
    );
    bush.position.y = 0.85;
    planter.add(bush);

    // Blooming colorful flowers
    [-0.5, 0, 0.5].forEach((fz) => {
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6),
        TrackManager.fruitRedMat
      );
      flower.position.set(0.1, 1.15, fz);
      planter.add(flower);
    });

    root.add(planter);
  }

  // --- Pedestrian Stairs ---
  private buildPedestrianStairs(root: THREE.Group, x: number, z: number) {
    const stairs = new THREE.Group();
    stairs.position.set(x, 0, z);

    const numSteps = 5;
    for (let i = 0; i < numSteps; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.25, 0.7),
        TrackManager.stonePedestrianMat
      );
      step.position.set(i * 0.3, (i + 0.5) * 0.25, 0);
      stairs.add(step);
    }
    root.add(stairs);
  }

  // --- Overhead Festival Bunting / Triangular Flags ---
  private buildOverheadFestivalBunting(root: THREE.Group, z: number) {
    const bunting = new THREE.Group();
    bunting.position.set(0, 5.4, z);

    // Hanging cable curve across all lanes
    const span = LANE_WIDTH * 3 + 4.0;
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, span, 8),
      TrackManager.steelRailMat
    );
    cable.rotation.z = Math.PI / 2;
    bunting.add(cable);

    // Triangular colorful flags
    const flagColors = [0xef4444, 0xfacc15, 0x0284c7, 0x10b981, 0xa855f7];
    const numFlags = 9;
    const step = span / numFlags;
    for (let i = 0; i < numFlags; i++) {
      const fx = -span / 2 + (i + 0.5) * step;
      const fMat = new THREE.MeshBasicMaterial({
        color: flagColors[i % flagColors.length],
        side: THREE.DoubleSide,
      });
      const flagGeom = new THREE.ConeGeometry(0.28, 0.6, 3);
      const flag = new THREE.Mesh(flagGeom, fMat);
      flag.rotation.x = Math.PI;
      flag.position.set(fx, -0.3, 0);
      bunting.add(flag);
    }

    root.add(bunting);
  }

  // ==========================================
  // --- SUBWAY TUNNEL GENERATOR ---
  // ==========================================
  private buildSubwayTunnel(
    root: THREE.Group,
    startZ: number,
    endZ: number,
    isEntrance: boolean,
    isExit: boolean
  ) {
    const length = endZ - startZ;
    const centerZ = startZ + length / 2;
    const tunnelGroup = new THREE.Group();

    // 1. Vaulted Arched Subway Ceiling
    // Semi-cylindrical curved roof running longitudinally along the Z axis from startZ to endZ
    // Open at bottom (y <= 0.4) and both ends (-Z and +Z) so players have full forward sightline
    const tunnelArchGeom = new THREE.CylinderGeometry(7.8, 7.8, length, 32, 1, true, Math.PI / 2, Math.PI);
    const tunnelArch = new THREE.Mesh(tunnelArchGeom, TrackManager.tunnelConcreteMat);
    tunnelArch.rotation.x = Math.PI / 2;
    tunnelArch.position.set(0, 0.4, centerZ);
    tunnelGroup.add(tunnelArch);

    // 2. Glossy Metro Ceramic Tile Walls on Left & Right
    [-7.5, 7.5].forEach((wx) => {
      // Lower metro tile wall
      const tileWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 3.8, length),
        TrackManager.tunnelTileMat
      );
      tileWall.position.set(wx, 1.9, centerZ);
      tunnelGroup.add(tileWall);

      // Accent ceramic tile stripe
      const tileStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.35, length),
        TrackManager.tunnelTileTrimMat
      );
      tileStripe.position.set(wx, 2.8, centerZ);
      tunnelGroup.add(tileStripe);

      // Utility high-voltage conduit cables running horizontally along the wall
      [-0.15, 0.0, 0.15].forEach((cy) => {
        const cable = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, length, 6),
          TrackManager.catenarySteelMat
        );
        cable.rotation.x = Math.PI / 2;
        cable.position.set(wx > 0 ? wx - 0.28 : wx + 0.28, 3.4 + cy, centerZ);
        tunnelGroup.add(cable);
      });

      // Recessed Maintenance Safety Niches / Emergency Alcoves every 16m
      for (let z = startZ + 8; z < endZ; z += 16) {
        const alcove = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 2.0, 1.6),
          TrackManager.tunnelRibMat
        );
        alcove.position.set(wx > 0 ? wx - 0.2 : wx + 0.2, 1.4, z);
        tunnelGroup.add(alcove);

        // Emergency phone box
        const phoneBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.4, 0.3),
          TrackManager.candyRedMat
        );
        phoneBox.position.set(wx > 0 ? wx - 0.3 : wx + 0.3, 1.5, z);
        tunnelGroup.add(phoneBox);
      }
    });

    // 3. Continuous Vaulted Ceiling LED Light Strips along x = ±4.2m
    // Emissive warm-white tubes drawing perspective lines all the way down the tunnel bore
    [-4.2, 4.2].forEach((lx) => {
      const lightStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, length),
        TrackManager.tunnelLightStripMat
      );
      lightStrip.position.set(lx, 6.4, centerZ);
      tunnelGroup.add(lightStrip);

      // Steel conduit bracket
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.08, length),
        TrackManager.tunnelRibMat
      );
      tray.position.set(lx, 6.5, centerZ);
      tunnelGroup.add(tray);
    });

    // 4. Arched Structural Steel Rib Beams every 8m
    for (let z = startZ + 4; z < endZ; z += 8) {
      const ribGeom = new THREE.TorusGeometry(7.8, 0.22, 6, 24, Math.PI);
      const rib = new THREE.Mesh(ribGeom, TrackManager.tunnelRibMat);
      rib.position.set(0, 0.4, z);
      tunnelGroup.add(rib);
    }

    // 5. Heavy Steel Wall Buttress Pilasters along tunnel outer flanks every 14m (placed at x = +/-5.6m to keep all 3 tracks 100% open)
    for (let z = startZ + 7; z < endZ; z += 14) {
      [-5.6, 5.6].forEach((px) => {
        const column = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 6.2, 12),
          TrackManager.tunnelPillarMat
        );
        column.position.set(px, 3.1, z);
        column.castShadow = false;
        tunnelGroup.add(column);

        // Caution Yellow Hazard Collar on column
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12),
          TrackManager.hazardStripeMat
        );
        collar.position.set(px, 1.4, z);
        tunnelGroup.add(collar);

        // Green railway track signal LED light on side pilasters
        const signalLED = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        signalLED.position.set(px > 0 ? px - 0.28 : px + 0.28, 2.4, z);
        tunnelGroup.add(signalLED);
      });
    }

    // 6. Overhead Hanging Sodium Vapor Industrial Lamps every 14m
    for (let z = startZ + 7; z < endZ; z += 14) {
      // Suspension chain
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4),
        TrackManager.catenarySteelMat
      );
      chain.position.set(0, 6.8, z);
      tunnelGroup.add(chain);

      // Lamp housing cage
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.25, 0.6),
        TrackManager.tunnelRibMat
      );
      fixture.position.set(0, 6.2, z);
      tunnelGroup.add(fixture);

      // Glowing lens fixture (emissive bloom material, zero point light cost)
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        TrackManager.tunnelSodiumLampMat
      );
      lens.position.set(0, 6.05, z);
      tunnelGroup.add(lens);
    }

    // 7. Grand Subway Tunnel Entrance Portal Arch (if isEntrance)
    if (isEntrance) {
      this.buildTunnelPortalArch(tunnelGroup, startZ, true);
    }

    // 8. Grand Subway Tunnel Exit Portal Arch (if isExit)
    if (isExit) {
      this.buildTunnelPortalArch(tunnelGroup, endZ, false);
    }

    root.add(tunnelGroup);
  }

  // --- Grand Tunnel Portal Arch (Wide Open See-Through Portal Framing) ---
  private buildTunnelPortalArch(root: THREE.Group, zPos: number, isEntrance: boolean) {
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 0, zPos);

    // Massive Concrete Portal Frame placed wide at x = ±9.6m
    [-9.6, 9.6].forEach((px) => {
      // Heavy stone buttress pillars
      const buttress = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 9.8, 3.2),
        TrackManager.tunnelConcreteMat
      );
      buttress.position.set(px, 4.9, 0);
      buttress.castShadow = false;
      buttress.receiveShadow = true;
      portalGroup.add(buttress);

      // Decorative stone cap
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(4.0, 0.6, 3.6),
        TrackManager.stonePedestrianMat
      );
      cap.position.set(px, 10.0, 0);
      portalGroup.add(cap);

      // Angled stone retaining wing-wall sloping outward to frame the portal naturally
      const wingWall = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 6.8, 3.0),
        TrackManager.tunnelConcreteMat
      );
      wingWall.position.set(px > 0 ? px + 3.8 : px - 3.8, 3.4, isEntrance ? -1.6 : 1.6);
      portalGroup.add(wingWall);
    });

    // Vaulted Portal Ring Arch framing the opening
    const portalRingGeom = new THREE.TorusGeometry(8.0, 0.45, 8, 32, Math.PI);
    const portalRing = new THREE.Mesh(portalRingGeom, TrackManager.tunnelRibMat);
    portalRing.position.set(0, 0.4, 0);
    portalGroup.add(portalRing);

    // Massive overhead arch lintel spanning across above the tracks at y = 9.2m
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(23.5, 2.2, 3.2),
      TrackManager.tunnelConcreteMat
    );
    lintel.position.set(0, 9.2, 0);
    lintel.castShadow = false;
    lintel.receiveShadow = true;
    portalGroup.add(lintel);

    // Hazard Caution Striped Arch Border Rim
    const archBorder = new THREE.Mesh(
      new THREE.BoxGeometry(17.2, 0.38, 3.3),
      TrackManager.hazardStripeMat
    );
    archBorder.position.set(0, 7.8, 0);
    portalGroup.add(archBorder);

    // Illuminated Neon Subway Transit Sign above arch
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 1.4, 0.4),
      TrackManager.rubberBlackMat
    );
    signBoard.position.set(0, 9.3, isEntrance ? -1.65 : 1.65);
    portalGroup.add(signBoard);

    const signText = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 0.8, 0.1),
      TrackManager.tunnelPortalSignMat
    );
    signText.position.set(0, 9.3, isEntrance ? -1.88 : 1.88);
    portalGroup.add(signText);

    // Glowing amber beacon on top (emissive bloom)
    const beaconLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 10),
      TrackManager.tunnelSodiumLampMat
    );
    beaconLens.position.set(0, 10.5, isEntrance ? -1.6 : 1.6);
    portalGroup.add(beaconLens);

    // Dual High-Intensity Portal Entrance Floodlight Fixtures
    [-4.5, 4.5].forEach((fx) => {
      const lampFixture = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.5),
        TrackManager.tunnelRibMat
      );
      lampFixture.position.set(fx, 7.4, isEntrance ? -1.2 : 1.2);
      portalGroup.add(lampFixture);

      const lampLens = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 10),
        TrackManager.tunnelFloodLightMat
      );
      lampLens.position.set(fx, 7.25, isEntrance ? -1.2 : 1.2);
      portalGroup.add(lampLens);
    });

    // Railway Clearance Approach Green LEDs on portal flanks
    [-7.8, 7.8].forEach((lx) => {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      led.position.set(lx, 3.8, isEntrance ? -1.65 : 1.65);
      portalGroup.add(led);
    });

    root.add(portalGroup);
  }

  // ==========================================
  // --- OVERHEAD HIGHWAY FLYOVER BRIDGE ---
  // ==========================================
  private buildOverheadHighwayFlyover(root: THREE.Group, zPos: number) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(0, 0, zPos);

    const bridgeHeight = 7.5;
    const bridgeSpan = 56.0;
    const bridgeWidth = 6.8;

    // Concrete Deck spanning overhead
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeSpan, 1.1, bridgeWidth),
      TrackManager.bridgeDeckMat
    );
    deck.position.set(0, bridgeHeight, 0);
    deck.castShadow = false;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    // Concrete Jersey Crash Barriers along front and rear of bridge
    [-bridgeWidth / 2 + 0.25, bridgeWidth / 2 - 0.25].forEach((bz) => {
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(bridgeSpan, 0.95, 0.35),
        TrackManager.stoneWallMat
      );
      barrier.position.set(0, bridgeHeight + 0.95, bz);
      bridgeGroup.add(barrier);
    });

    // Heavy Highway Support Piers on sides of railway
    [-9.5, 9.5].forEach((px) => {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, bridgeHeight, 4.2),
        TrackManager.stoneWallMat
      );
      pier.position.set(px, bridgeHeight / 2, 0);
      pier.castShadow = false;
      bridgeGroup.add(pier);
    });

    // 3D Vehicles on the Highway Bridge!
    // 1. Yellow City Taxi Cab
    this.buildLowPolyCar(bridgeGroup, -6.5, bridgeHeight + 0.55, -1.5, TrackManager.carYellowMat, true);
    // 2. Red Commuter Sports Car
    this.buildLowPolyCar(bridgeGroup, 5.5, bridgeHeight + 0.55, 1.5, TrackManager.carRedMat, false);
    // 3. Blue Delivery Truck
    this.buildLowPolyTruck(bridgeGroup, 16.0, bridgeHeight + 0.55, -1.5, TrackManager.carBlueMat);

    root.add(bridgeGroup);
  }

  // --- Helper: Low-Poly 3D Car ---
  private buildLowPolyCar(
    root: THREE.Group,
    x: number,
    y: number,
    z: number,
    paintMat: THREE.Material,
    isTaxi: boolean
  ) {
    const car = new THREE.Group();
    car.position.set(x, y, z);
    car.rotation.y = Math.PI / 2; // Drive along bridge (X axis)

    // Lower Chassis
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.55, 4.2),
      paintMat
    );
    chassis.position.y = 0.55;
    car.add(chassis);

    // Upper Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.65, 2.4),
      TrackManager.catenarySteelMat
    );
    cabin.position.set(0, 1.15, -0.2);
    car.add(cabin);

    // Wheels
    [-0.95, 0.95].forEach((wx) => {
      [-1.3, 1.3].forEach((wz) => {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10),
          TrackManager.rubberBlackMat
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.32, wz);
        car.add(wheel);
      });
    });

    // Taxi Roof Sign
    if (isTaxi) {
      const taxiSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.25, 0.3),
        TrackManager.tunnelSodiumLampMat
      );
      taxiSign.position.set(0, 1.6, -0.2);
      car.add(taxiSign);
    }

    // Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    [-0.7, 0.7].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.05), hlMat);
      hl.position.set(hx, 0.55, 2.12);
      car.add(hl);
    });

    root.add(car);
  }

  // --- Helper: Low-Poly 3D Delivery Truck ---
  private buildLowPolyTruck(
    root: THREE.Group,
    x: number,
    y: number,
    z: number,
    paintMat: THREE.Material
  ) {
    const truck = new THREE.Group();
    truck.position.set(x, y, z);
    truck.rotation.y = -Math.PI / 2;

    // Front Cab
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.5, 1.8),
      paintMat
    );
    cab.position.set(0, 1.05, 1.8);
    truck.add(cab);

    // Cargo Box
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 1.9, 3.6),
      TrackManager.stoneWallMat
    );
    cargo.position.set(0, 1.45, -0.9);
    truck.add(cargo);

    // Wheels
    [-1.05, 1.05].forEach((wx) => {
      [-1.8, -0.8, 1.8].forEach((wz) => {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10),
          TrackManager.rubberBlackMat
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.38, wz);
        truck.add(wheel);
      });
    });

    root.add(truck);
  }

  // ==========================================
  // --- TRACK SWITCH & CROSSOVER RAILS ---
  // ==========================================
  private buildTrackSwitch(root: THREE.Group, zPos: number) {
    const switchGroup = new THREE.Group();
    switchGroup.position.set(0, 0, zPos);

    // Diagonal crossover steel rail from Center (0) to Left (-3.2) or Right (+3.2)
    const crossRailGeom = new THREE.BoxGeometry(0.09, 0.16, 12.0);
    const crossRail = new THREE.Mesh(crossRailGeom, TrackManager.steelRailMat);
    crossRail.rotation.y = 0.26; // Diagonal switch angle
    crossRail.position.set(-1.6, 0.08, 0);
    switchGroup.add(crossRail);

    // Trackside Switch Stand with rotating Red/Green indicator lantern
    const standPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8),
      TrackManager.catenarySteelMat
    );
    standPost.position.set(-4.6, 0.7, 0);
    switchGroup.add(standPost);

    // Switch Target Lantern (Green disc for open, red arrow for switched)
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e }) // Glowing railway green
    );
    lantern.position.set(-4.6, 1.4, 0);
    switchGroup.add(lantern);

    // Counterweight throw lever
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.8, 0.08),
      TrackManager.hazardStripeMat
    );
    lever.rotation.z = 0.45;
    lever.position.set(-4.8, 0.6, 0);
    switchGroup.add(lever);

    root.add(switchGroup);
  }

  private static rampTexture: THREE.CanvasTexture | null = null;
  private static getRampTexture(): THREE.CanvasTexture {
    if (this.rampTexture) return this.rampTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Rich caramel construction wood plank base
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 0, 512, 1024);

    // Subtle wood plank horizontal seams
    ctx.fillStyle = '#92400e';
    for (let y = 0; y < 1024; y += 64) {
      ctx.fillRect(0, y, 512, 4);
    }

    // High-visibility vibrant yellow side guide borders
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, 52, 1024);
    ctx.fillRect(460, 0, 52, 1024);

    // Black diagonal caution hazard bars along the borders
    ctx.fillStyle = '#18181b';
    const borderStripe = 36;
    for (let y = -48; y <= 1040; y += borderStripe * 2) {
      // Left border stripes
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(52, y + 36);
      ctx.lineTo(52, y + 36 + borderStripe);
      ctx.lineTo(0, y + borderStripe);
      ctx.closePath();
      ctx.fill();

      // Right border stripes
      ctx.beginPath();
      ctx.moveTo(460, y);
      ctx.lineTo(512, y + 36);
      ctx.lineTo(512, y + 36 + borderStripe);
      ctx.lineTo(460, y + borderStripe);
      ctx.closePath();
      ctx.fill();
    }

    // Bold luminous yellow / neon upward directional chevron arrows (▲ ▲ ▲) pointing UP the ramp!
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 12;
    const arrowSpacing = 160;
    for (let y = 80; y < 1000; y += arrowSpacing) {
      ctx.beginPath();
      ctx.moveTo(256, y); // arrow tip pointing forward/up
      ctx.lineTo(336, y + 70);
      ctx.lineTo(306, y + 70);
      ctx.lineTo(256, y + 26);
      ctx.lineTo(206, y + 70);
      ctx.lineTo(176, y + 70);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.rampTexture = tex;
    return tex;
  }

  // ==========================================
  // --- WOODEN CONSTRUCTION SURFING RAMP ---
  // ==========================================
  private buildWoodenRamp(
    root: THREE.Group,
    laneX: number,
    startZ: number,
    endZ: number,
    height: number
  ): RampInstance {
    const length = endZ - startZ;
    const centerZ = startZ + length / 2;
    const angle = -Math.atan2(height, length);

    const rampGroup = new THREE.Group();
    rampGroup.position.set(laneX, 0, centerZ);

    // 1. Heavy wooden angled main deck with high-vis yellow hazard borders and upward chevron arrows
    const surfaceLen = Math.hypot(length, height);
    const rampMat = TrackManager.getMaterial('ramp_hazard_mat', () =>
      new THREE.MeshStandardMaterial({
        map: TrackManager.getRampTexture(),
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    const plankGeom = TrackManager.getGeometry(`ramp_plank_${Math.round(length * 10)}`, () =>
      new THREE.BoxGeometry(2.40, 0.16, surfaceLen)
    );
    const plank = new THREE.Mesh(plankGeom, rampMat);
    plank.rotation.x = angle;
    plank.position.y = height / 2;
    plank.castShadow = true;
    plank.receiveShadow = true;
    rampGroup.add(plank);

    // 2. High-visibility bright yellow side guide curbs along both sides
    const curbMat = TrackManager.getMaterial('ramp_curb_mat', () =>
      new THREE.MeshStandardMaterial({
        color: 0xfacc15, // Bright neon hazard yellow
        roughness: 0.35,
        metalness: 0.2,
      })
    );
    const curbGeom = TrackManager.getGeometry(`ramp_curb_${Math.round(length * 10)}`, () =>
      new THREE.BoxGeometry(0.12, 0.28, surfaceLen)
    );
    [-1.16, 1.16].forEach((cx) => {
      const curb = new THREE.Mesh(curbGeom, curbMat);
      curb.rotation.x = angle;
      curb.position.set(cx, height / 2 + 0.12, 0);
      curb.castShadow = true;
      rampGroup.add(curb);
    });

    // 3. Flashing Amber Caution Reflectors / Pylons at the ramp entrance
    const pylonMat = TrackManager.getMaterial('ramp_pylon_mat', () =>
      new THREE.MeshStandardMaterial({
        color: 0x18181b, // Dark steel post
        roughness: 0.5,
      })
    );
    const beaconMat = TrackManager.getMaterial('ramp_beacon_mat', () =>
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b, // Luminous amber glow
      })
    );
    const pylonGeom = TrackManager.getGeometry('ramp_pylon_geom', () =>
      new THREE.CylinderGeometry(0.08, 0.10, 0.8, 8)
    );
    const beaconGeom = TrackManager.getGeometry('ramp_beacon_geom', () =>
      new THREE.SphereGeometry(0.12, 8, 8)
    );

    const startLocalZ = -length / 2;
    [-1.25, 1.25].forEach((px) => {
      const pylon = new THREE.Mesh(pylonGeom, pylonMat);
      pylon.position.set(px, 0.4, startLocalZ);
      rampGroup.add(pylon);

      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.set(px, 0.85, startLocalZ);
      rampGroup.add(beacon);
    });

    // 4. Sturdy timber scaffold supports with cross-braces underneath
    const scaffoldMat = TrackManager.getMaterial('ramp_scaffold_mat', () =>
      new THREE.MeshStandardMaterial({
        color: 0x78350f, // Deep rich treated timber
        roughness: 0.75,
      })
    );
    const fractions = [0.25, 0.5, 0.75, 0.95];
    fractions.forEach((frac, fIdx) => {
      const pz = -length / 2 + length * frac;
      const postH = frac * height;
      const postGeom = TrackManager.getGeometry(`ramp_post_${fIdx}`, () =>
        new THREE.BoxGeometry(0.18, postH, 0.18)
      );
      [-1.0, 1.0].forEach((px) => {
        const post = new THREE.Mesh(postGeom, scaffoldMat);
        post.position.set(px, postH / 2, pz);
        post.castShadow = true;
        rampGroup.add(post);
      });

      // Horizontal cross-beam connecting the two posts
      const beamGeom = TrackManager.getGeometry(`ramp_beam_${fIdx}`, () =>
        new THREE.BoxGeometry(2.0, 0.14, 0.14)
      );
      const beam = new THREE.Mesh(beamGeom, scaffoldMat);
      beam.position.set(0, postH - 0.1, pz);
      rampGroup.add(beam);
    });

    // 5. Metal transition lip plate leading onto train roof
    const lipMat = TrackManager.getMaterial('ramp_lip_mat', () =>
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.3,
        metalness: 0.7,
      })
    );
    const lipGeom = TrackManager.getGeometry('ramp_lip_geom', () =>
      new THREE.BoxGeometry(2.4, 0.04, 0.5)
    );
    const lip = new THREE.Mesh(lipGeom, lipMat);
    lip.position.set(0, height + 0.02, length / 2 + 0.15);
    rampGroup.add(lip);

    TrackManager.markStatic(rampGroup, true, true);
    root.add(rampGroup);

    return {
      laneX,
      startZ,
      endZ,
      height,
    };
  }

  /**
   * Spawns gleaming golden coins ascending up the slope of the wooden ramp
   */
  private spawnRampCoins(coins: CoinInstance[], laneX: number, startZ: number, endZ: number, height: number) {
    const numCoins = 4;
    for (let i = 1; i <= numCoins; i++) {
      const frac = i / (numCoins + 1);
      const cz = startZ + frac * (endZ - startZ);
      const cy = frac * height + 1.2;
      coins.push(CollectibleFactory.createCoin(laneX, cy, cz));
    }
  }

  // ==========================================
  // --- 6. PROCEDURAL HAZARDS & REWARDS ---
  // ==========================================
  private populateSegmentHazards(
    root: THREE.Group,
    startZ: number,
    endZ: number,
    trains: TrainInstance[],
    obstacles: ObstacleInstance[],
    coins: CoinInstance[],
    powerUps: PowerUpInstance[],
    ramps: RampInstance[]
  ) {
    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
    const trainTypes: TrainType[] = [
      'modern_metro',
      'red_city',
      'classic_rail',
      'street_art',
      'futuristic',
      'double_decker_passenger',
      'double_decker_goods',
    ];

    const zone1Z = startZ + 18;
    const zone2Z = startZ + 46;

    // Pick Zone 1 safe lane adjacent to last segment's safe lane (max 1 lane shift)
    const candidatesZone1 = lanes.filter((l) => Math.abs(l - this.lastSafeLane) <= LANE_WIDTH + 0.1);
    const safeLane1 = candidatesZone1[Math.floor(Math.random() * candidatesZone1.length)];

    // Pick Zone 2 safe lane adjacent to Zone 1's safe lane
    const candidatesZone2 = lanes.filter((l) => Math.abs(l - safeLane1) <= LANE_WIDTH + 0.1);
    const safeLane2 = candidatesZone2[Math.floor(Math.random() * candidatesZone2.length)];

    this.lastSafeLane = safeLane2;

    // Gradually increase oncoming moving train likelihood as distance increases (starts at 35%, scales to 75%)
    const movingChance = Math.min(0.75, 0.35 + (this.lastPlayerDistance / 1500) * 0.4);
    const movingTrainZone = Math.random() < movingChance ? (Math.random() < 0.5 ? 1 : 2) : 0;

    this.spawnZoneEncounter(
      root,
      zone1Z,
      lanes,
      safeLane1,
      trainTypes,
      trains,
      obstacles,
      coins,
      powerUps,
      ramps,
      movingTrainZone === 1
    );

    this.spawnZoneEncounter(
      root,
      zone2Z,
      lanes,
      safeLane2,
      trainTypes,
      trains,
      obstacles,
      coins,
      powerUps,
      ramps,
      movingTrainZone === 2
    );

    // High-altitude sky coins trail (at Y = 16.0m) for thrilling Jetpack flights!
    const skyLane = lanes[Math.floor(Math.random() * lanes.length)];
    this.spawnCoinLine(coins, skyLane, 16.0, startZ + 6, startZ + 64);

    if (Math.random() < 0.35) {
      const pTypes: PowerUpType[] = ['magnet', 'shield', 'multiplier', 'boost', 'jetpack'];
      const chosenP = pTypes[Math.floor(Math.random() * pTypes.length)];
      // Spawn power-ups on or near the safe lane for fair acquisition
      const pZ = startZ + 32;
      powerUps.push(CollectibleFactory.createPowerUp(chosenP, safeLane1, 1.5, pZ));
    }
  }

  private spawnZoneEncounter(
    root: THREE.Group,
    zPos: number,
    lanes: number[],
    safeLane: number,
    trainTypes: TrainType[],
    trains: TrainInstance[],
    obstacles: ObstacleInstance[],
    coins: CoinInstance[],
    powerUps: PowerUpInstance[],
    ramps: RampInstance[],
    allowMovingTrain: boolean
  ) {
    const hazardLanes = lanes.filter((l) => Math.abs(l - safeLane) > 0.1);
    const hazardLane1 = hazardLanes[0];
    const hazardLane2 = hazardLanes[1];

    const encounterType = Math.random();

    if (encounterType < 0.62) {
      // Train encounter in hazardLane1
      const tType = trainTypes[Math.floor(Math.random() * trainTypes.length)];
      const isMoving = allowMovingTrain;
      // As distance increases, oncoming train movement speed increases, making the game progressively harder
      const extraSpeed = Math.min(10, (this.lastPlayerDistance / 750) * 3.5);
      const speed = isMoving ? 14 + extraSpeed + Math.random() * 2.5 : 0;
      const trainHasRamp = !isMoving; // Stationary trains are climbable with ramp
      const newTrain = TrainFactory.createTrain(tType, hazardLane1, zPos, speed, trainHasRamp);
      trains.push(newTrain);

      // If stationary train, provide a prominent high-visibility wooden ramp climbing to roof
      if (trainHasRamp) {
        const rampLength = newTrain.rampLength ?? (newTrain.height > 4.0 ? 12.0 : 8.5);
        const rampStartZ = zPos - newTrain.length / 2 - rampLength;
        const rampEndZ = zPos - newTrain.length / 2 + 0.3;
        const ramp = this.buildWoodenRamp(root, hazardLane1, rampStartZ, rampEndZ, newTrain.height);
        ramps.push(ramp);
        this.spawnRampCoins(coins, hazardLane1, rampStartZ, rampEndZ, newTrain.height);
        this.spawnCoinLine(
          coins,
          hazardLane1,
          newTrain.height + 1.2,
          zPos - newTrain.length / 2 + 2.0,
          zPos + newTrain.length / 2 - 2.0
        );
      }

      // Safe lane has gleaming coin line
      this.spawnCoinLine(coins, safeLane, 1.2, zPos - 10, zPos + 10);

      // In hazardLane2: frequently spawn oncoming/parallel train or authentic Subway Surfers barrier
      if (Math.random() < 0.42) {
        const tType2 = trainTypes[Math.floor(Math.random() * trainTypes.length)];
        const speed2 = 14 + extraSpeed + Math.random() * 2.0;
        trains.push(TrainFactory.createTrain(tType2, hazardLane2, zPos + 16, speed2, false));
      } else {
        const barrierPool: ObstacleType[] = ['barricade_jump', 'low_overhead_slide', 'high_barrier'];
        const obsType = barrierPool[Math.floor(Math.random() * barrierPool.length)];
        obstacles.push(ObstacleFactory.createObstacle(obsType, hazardLane2, zPos));
        if (obsType === 'barricade_jump') {
          this.spawnCoinJumpArc(coins, hazardLane2, zPos);
        }
      }

    } else if (encounterType < 0.78) {
      // Barrier & Hurdle encounter across hazard lanes, safe lane 100% open
      obstacles.push(ObstacleFactory.createObstacle('barricade_jump', hazardLane1, zPos));
      this.spawnCoinJumpArc(coins, hazardLane1, zPos);

      // Hazard lane 2 receives either low overhead slide or tall double-decker barrier
      const obsType2: ObstacleType = Math.random() > 0.4 ? 'low_overhead_slide' : 'high_barrier';
      obstacles.push(ObstacleFactory.createObstacle(obsType2, hazardLane2, zPos));

      // Golden coin line through safe lane
      this.spawnCoinLine(coins, safeLane, 1.2, zPos - 8, zPos + 8);

    } else {
      // Single obstacle in hazardLane1, leaving both safeLane and hazardLane2 wide open!
      const obsTypes: ObstacleType[] = ['high_barrier', 'barricade_jump', 'low_overhead_slide'];
      const obsType = obsTypes[Math.floor(Math.random() * obsTypes.length)];
      obstacles.push(ObstacleFactory.createObstacle(obsType, hazardLane1, zPos));
      if (obsType === 'barricade_jump') {
        this.spawnCoinJumpArc(coins, hazardLane1, zPos);
      }
      this.spawnCoinZigzag(coins, safeLane, hazardLane2, zPos - 10, zPos + 10);
    }
  }

  private spawnCoinLine(coins: CoinInstance[], laneX: number, y: number, startZ: number, endZ: number) {
    for (let z = startZ; z <= endZ; z += 3.2) {
      coins.push(CollectibleFactory.createCoin(laneX, y, z));
    }
  }

  private spawnCoinJumpArc(coins: CoinInstance[], laneX: number, centerZ: number) {
    const offsets = [-6, -3, 0, 3, 6];
    const heights = [1.2, 2.2, 2.8, 2.2, 1.2];
    for (let i = 0; i < offsets.length; i++) {
      coins.push(CollectibleFactory.createCoin(laneX, heights[i], centerZ + offsets[i]));
    }
  }

  private spawnCoinZigzag(
    coins: CoinInstance[],
    startLane: number,
    endLane: number,
    startZ: number,
    endZ: number
  ) {
    const steps = 6;
    const dz = (endZ - startZ) / steps;
    const dx = (endLane - startLane) / steps;
    for (let i = 0; i <= steps; i++) {
      coins.push(CollectibleFactory.createCoin(startLane + dx * i, 1.2, startZ + dz * i));
    }
  }

  private disposeSegment(seg: TrackSegment) {
    seg.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry && !TrackManager.isCachedGeometry(mesh.geometry)) {
          mesh.geometry.dispose();
        }
      }
    });
  }

  public clearAll() {
    for (const seg of this.segments) {
      for (const train of seg.trains) {
        TrainFactory.recycleTrain(train);
      }
      seg.trains = [];

      for (const obs of seg.obstacles) {
        ObstacleFactory.recycleObstacle(obs);
      }
      seg.obstacles = [];

      for (const coin of seg.coins) {
        CollectibleFactory.recycleCoin(coin);
      }
      seg.coins = [];

      for (const p of seg.powerUps) {
        CollectibleFactory.recyclePowerUp(p);
      }
      seg.powerUps = [];

      this.scene.remove(seg.group);
      this.disposeSegment(seg);
    }
    this.segments = [];
  }
}
