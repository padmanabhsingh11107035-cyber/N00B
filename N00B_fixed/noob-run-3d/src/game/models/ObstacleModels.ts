import * as THREE from 'three';
import { ObstacleType } from '../types';

export interface ObstacleInstance {
  mesh: THREE.Group;
  type: ObstacleType;
  lane: number;
  zPos: number;
  boundingBox: THREE.Box3;
  requiredAction: 'jump' | 'slide' | 'dodge';
  cleared: boolean;
  update?: (delta: number) => void;
}

export class ObstacleFactory {
  private static materialsCache: Map<string, THREE.Material> = new Map();
  private static geometriesCache: Map<string, THREE.BufferGeometry> = new Map();
  private static pools: Map<ObstacleType, ObstacleInstance[]> = new Map();

  private static stripeTexture: THREE.CanvasTexture | null = null;
  private static chevronTexture: THREE.CanvasTexture | null = null;

  private static getMaterial(key: string, creator: () => THREE.Material): THREE.Material {
    if (!this.materialsCache.has(key)) {
      this.materialsCache.set(key, creator());
    }
    return this.materialsCache.get(key)!;
  }

  private static getGeometry<T extends THREE.BufferGeometry>(key: string, creator: () => T): T {
    if (!this.geometriesCache.has(key)) {
      this.geometriesCache.set(key, creator());
    }
    return this.geometriesCache.get(key)! as T;
  }

  /**
   * Generates authentic 45-degree diagonal red and white hazard stripes canvas texture
   */
  private static getStripeTexture(): THREE.CanvasTexture {
    if (this.stripeTexture) return this.stripeTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Clean warm cream / white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 128);

    // Bold candy red 45-degree diagonal hazard stripes
    ctx.fillStyle = '#dc2626';
    const stripeW = 44;
    for (let x = -160; x <= 640; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW + 128, 128);
      ctx.lineTo(x + 128, 128);
      ctx.closePath();
      ctx.fill();
    }

    // Bold dark border lines at top and bottom edges for crisp 3D outline from distance
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillRect(0, 120, 512, 8);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.stripeTexture = tex;
    return tex;
  }

  /**
   * Generates bold downward-pointing red V chevrons on cream background
   */
  private static getChevronTexture(): THREE.CanvasTexture {
    if (this.chevronTexture) return this.chevronTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Clean warm cream / off-white background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    // Bold downward-pointing V chevrons in vibrant red (\ /)
    ctx.fillStyle = '#dc2626';
    const spacing = 120;
    const thickness = 52;
    const midX = 256;

    for (let y = -140; y <= 660; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(midX, y + 140);
      ctx.lineTo(512, y);
      ctx.lineTo(512, y + thickness);
      ctx.lineTo(midX, y + 140 + thickness);
      ctx.lineTo(0, y + thickness);
      ctx.closePath();
      ctx.fill();
    }

    // Subtle dark border line on sides
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, 4, 512);
    ctx.fillRect(508, 0, 4, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.chevronTexture = tex;
    return tex;
  }

  /**
   * Acquire an obstacle from the object pool or instantiate if pool is empty
   */
  public static getObstacle(type: ObstacleType, laneX: number, zPos: number): ObstacleInstance {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = [];
      this.pools.set(type, pool);
    }

    const pooled = pool.pop();
    if (pooled) {
      pooled.mesh.position.set(laneX, 0, zPos);
      pooled.mesh.visible = true;
      pooled.lane = laneX;
      pooled.zPos = zPos;
      pooled.cleared = false;

      this.computeBoundingBox(pooled, type, laneX, zPos);
      return pooled;
    }

    return this.instantiateObstacle(type, laneX, zPos);
  }

  /**
   * Return an obstacle back to the object pool
   */
  public static recycleObstacle(obs: ObstacleInstance): void {
    obs.cleared = true;
    obs.mesh.visible = false;
    if (obs.mesh.parent) {
      obs.mesh.parent.remove(obs.mesh);
    }
    let pool = this.pools.get(obs.type);
    if (!pool) {
      pool = [];
      this.pools.set(obs.type, pool);
    }
    pool.push(obs);
  }

  public static createObstacle(type: ObstacleType, laneX: number, zPos: number): ObstacleInstance {
    return this.getObstacle(type, laneX, zPos);
  }

  private static computeBoundingBox(instance: ObstacleInstance, type: ObstacleType, laneX: number, zPos: number) {
    if (type === 'barricade_jump') {
      // Low hurdle on ground (height ~0.95m). Jumpable!
      instance.boundingBox.min.set(laneX - 0.95, 0.05, zPos - 0.28);
      instance.boundingBox.max.set(laneX + 0.95, 0.88, zPos + 0.28);
    } else if (type === 'low_overhead_slide' || type === 'hazard_gate') {
      // Overhead bar (at y=1.28m to 1.62m). Clear opening underneath up to y=1.22m!
      instance.boundingBox.min.set(laneX - 0.95, 1.22, zPos - 0.28);
      instance.boundingBox.max.set(laneX + 0.95, 1.80, zPos + 0.28);
    } else if (type === 'high_barrier') {
      // Tall double-decker barrier. Clear opening underneath up to y=1.22m, but upper chevron panel blocks jumping!
      instance.boundingBox.min.set(laneX - 0.95, 1.22, zPos - 0.28);
      instance.boundingBox.max.set(laneX + 0.95, 2.95, zPos + 0.28);
    } else {
      instance.boundingBox.setFromObject(instance.mesh);
      instance.boundingBox.min.x += 0.15;
      instance.boundingBox.max.x -= 0.15;
    }
  }

  private static instantiateObstacle(type: ObstacleType, laneX: number, zPos: number): ObstacleInstance {
    const group = new THREE.Group();
    group.position.set(laneX, 0, zPos);

    let requiredAction: 'jump' | 'slide' | 'dodge' = 'dodge';

    switch (type) {
      case 'barricade_jump':
        requiredAction = 'jump';
        this.buildBarricadeJump(group);
        break;

      case 'low_overhead_slide':
      case 'hazard_gate':
        requiredAction = 'slide';
        this.buildLowOverheadSlide(group);
        break;

      case 'high_barrier':
        requiredAction = 'slide';
        this.buildHighBarrier(group);
        break;

      case 'traffic_cones':
        requiredAction = 'dodge';
        this.buildTrafficCones(group);
        break;

      case 'signal_pole':
        requiredAction = 'dodge';
        this.buildSignalPole(group);
        break;
    }

    const boundingBox = new THREE.Box3();
    const instance: ObstacleInstance = {
      mesh: group,
      type,
      lane: laneX,
      zPos,
      boundingBox,
      requiredAction,
      cleared: false,
    };

    this.computeBoundingBox(instance, type, laneX, zPos);

    return instance;
  }

  // =========================================================================
  // --- SUBWAY SURFERS AUTHENTIC BARRIER BUILDERS (MATCHING USER IMAGES) ---
  // =========================================================================

  /**
   * Helper: Builds authentic Subway Surfers twin blue footings + low connecting tie bar
   */
  private static buildBasePlate(root: THREE.Group, postX = 0.68) {
    const blueBaseMat = this.getMaterial('barrier_blue_base', () =>
      new THREE.MeshStandardMaterial({
        color: 0x4ba3e3, // Authentic bright cornflower / sky blue
        roughness: 0.42,
        metalness: 0.12,
      })
    );

    const metalBoltMat = this.getMaterial('barrier_foot_bolt', () =>
      new THREE.MeshStandardMaterial({
        color: 0x334155, // Dark slate steel socket collar
        roughness: 0.35,
        metalness: 0.6,
      })
    );

    // Two chunky stepped blue feet under each post (left & right)
    const footW = 0.42;
    const footD = 0.56;
    const footGeom = this.getGeometry(`foot_${footW}_${footD}`, () =>
      new THREE.BoxGeometry(footW, 0.08, footD)
    );
    const footStepGeom = this.getGeometry(`foot_step_${footW}_${footD}`, () =>
      new THREE.BoxGeometry(footW * 0.82, 0.04, footD * 0.82)
    );
    const collarGeom = this.getGeometry('foot_collar', () =>
      new THREE.BoxGeometry(0.20, 0.05, 0.20)
    );

    [-postX, postX].forEach((px) => {
      // Main foot base
      const foot = new THREE.Mesh(footGeom, blueBaseMat);
      foot.position.set(px, 0.04, 0);
      foot.receiveShadow = true;
      root.add(foot);

      // Chamfered upper step
      const step = new THREE.Mesh(footStepGeom, blueBaseMat);
      step.position.set(px, 0.09, 0);
      step.receiveShadow = true;
      root.add(step);

      // Steel socket collar securing the post
      const collar = new THREE.Mesh(collarGeom, metalBoltMat);
      collar.position.set(px, 0.12, 0);
      root.add(collar);
    });

    // Low blue connecting tie bar along the ground between the two feet
    const tieWidth = postX * 2 - footW * 0.4;
    const tieGeom = this.getGeometry(`tie_${tieWidth}`, () =>
      new THREE.BoxGeometry(tieWidth, 0.04, 0.14)
    );
    const tie = new THREE.Mesh(tieGeom, blueBaseMat);
    tie.position.set(0, 0.03, 0);
    tie.receiveShadow = true;
    root.add(tie);
  }

  /**
   * Helper: Builds the two cream wooden vertical support legs with top protruding pegs
   */
  private static buildVerticalPosts(root: THREE.Group, height: number, postX = 0.68) {
    const woodMat = this.getMaterial('barrier_wood_cream', () =>
      new THREE.MeshStandardMaterial({
        color: 0xf5ebd9, // Warm birch / cream wood
        roughness: 0.62,
      })
    );

    const postGeom = this.getGeometry(`post_${height}`, () =>
      new THREE.BoxGeometry(0.14, height, 0.14)
    );
    const pegGeom = this.getGeometry('barrier_peg', () =>
      new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12)
    );
    const capGeom = this.getGeometry('barrier_peg_cap', () =>
      new THREE.SphereGeometry(0.055, 10, 8)
    );

    [-postX, postX].forEach((px) => {
      // Main vertical post
      const post = new THREE.Mesh(postGeom, woodMat);
      post.position.set(px, height / 2 + 0.08, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      root.add(post);

      // Protruding wooden dowel peg on top
      const peg = new THREE.Mesh(pegGeom, woodMat);
      peg.position.set(px, height + 0.14, 0);
      root.add(peg);

      const cap = new THREE.Mesh(capGeom, woodMat);
      cap.position.set(px, height + 0.20, 0);
      root.add(cap);
    });
  }

  /**
   * Helper: Builds a horizontal crossbar with 45-degree red & white diagonal hazard stripes
   * and two prominent blue spherical studs with metallic rims on the front & rear faces.
   */
  private static buildStripedCrossbar(
    root: THREE.Group,
    y: number,
    width = 1.62,
    height = 0.34,
    depth = 0.22,
    postX = 0.68
  ) {
    const stripeMat = this.getMaterial('barrier_stripe_mat', () =>
      new THREE.MeshStandardMaterial({
        map: this.getStripeTexture(),
        roughness: 0.40,
      })
    );

    const woodMat = this.getMaterial('barrier_wood_cream', () =>
      new THREE.MeshStandardMaterial({
        color: 0xf5ebd9,
        roughness: 0.62,
      })
    );

    const blueStudMat = this.getMaterial('barrier_blue_stud', () =>
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8, // Vibrant rich cobalt / royal blue
        roughness: 0.28,
        metalness: 0.30,
      })
    );

    const studRimMat = this.getMaterial('barrier_stud_rim', () =>
      new THREE.MeshStandardMaterial({
        color: 0x1e3a8a, // Dark metallic blue rim
        roughness: 0.35,
        metalness: 0.5,
      })
    );

    // Central 45-degree diagonal striped crossbar
    const barWidth = width - 0.24;
    const barGeom = this.getGeometry(`bar_${barWidth}_${height}_${depth}`, () =>
      new THREE.BoxGeometry(barWidth, height, depth)
    );
    const barMesh = new THREE.Mesh(barGeom, stripeMat);
    barMesh.position.set(0, y, 0);
    barMesh.castShadow = true;
    root.add(barMesh);

    // Cream wooden end blocks where vertical posts pass through
    const endBlockGeom = this.getGeometry(`endblock_${height}_${depth}`, () =>
      new THREE.BoxGeometry(0.18, height + 0.02, depth + 0.04)
    );
    [-postX, postX].forEach((px) => {
      const endBlock = new THREE.Mesh(endBlockGeom, woodMat);
      endBlock.position.set(px, y, 0);
      endBlock.castShadow = true;
      root.add(endBlock);
    });

    // Two prominent blue spherical studs with metallic rims on the front face and rear face
    const studGeom = this.getGeometry('barrier_stud', () =>
      new THREE.SphereGeometry(0.11, 14, 10)
    );
    const rimGeom = this.getGeometry('barrier_stud_rim', () =>
      new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14)
    );
    const studOffsetX = postX - 0.16;

    [-studOffsetX, studOffsetX].forEach((sx) => {
      // Front stud + rim
      const rimFront = new THREE.Mesh(rimGeom, studRimMat);
      rimFront.rotation.x = Math.PI / 2;
      rimFront.position.set(sx, y, depth / 2 + 0.015);
      root.add(rimFront);

      const studFront = new THREE.Mesh(studGeom, blueStudMat);
      studFront.position.set(sx, y, depth / 2 + 0.05);
      studFront.scale.set(1.0, 1.0, 0.75);
      root.add(studFront);

      // Rear stud + rim
      const rimRear = new THREE.Mesh(rimGeom, studRimMat);
      rimRear.rotation.x = Math.PI / 2;
      rimRear.position.set(sx, y, -depth / 2 - 0.015);
      root.add(rimRear);

      const studRear = new THREE.Mesh(studGeom, blueStudMat);
      studRear.position.set(sx, y, -depth / 2 - 0.05);
      studRear.scale.set(1.0, 1.0, 0.75);
      root.add(studRear);
    });
  }

  /**
   * Helper: Builds a rectangular hazard board with red downward chevrons on cream background
   */
  private static buildChevronBoard(
    root: THREE.Group,
    minY: number,
    maxY: number,
    width = 1.34,
    depth = 0.12
  ) {
    const chevronMat = this.getMaterial('barrier_chevron_mat', () =>
      new THREE.MeshStandardMaterial({
        map: this.getChevronTexture(),
        roughness: 0.40,
      })
    );

    const woodMat = this.getMaterial('barrier_wood_cream', () =>
      new THREE.MeshStandardMaterial({
        color: 0xf5ebd9,
        roughness: 0.62,
      })
    );

    const h = maxY - minY;
    const centerY = (minY + maxY) / 2;

    const boardGeom = this.getGeometry(`chevron_${width}_${h}_${depth}`, () =>
      new THREE.BoxGeometry(width, h, depth)
    );
    const board = new THREE.Mesh(boardGeom, chevronMat);
    board.position.set(0, centerY, 0);
    board.castShadow = true;
    root.add(board);

    // Subtle side trim bars connecting to vertical posts
    const trimGeom = this.getGeometry(`trim_${h}`, () =>
      new THREE.BoxGeometry(0.06, h, depth + 0.04)
    );
    [-width / 2, width / 2].forEach((tx) => {
      const trim = new THREE.Mesh(trimGeom, woodMat);
      trim.position.set(tx, centerY, 0);
      root.add(trim);
    });
  }

  // -------------------------------------------------------------------------
  // 1. LOW HURDLE BARRIER (RIGHT IN USER IMAGE) - Jump over it!
  // -------------------------------------------------------------------------
  private static buildBarricadeJump(root: THREE.Group) {
    const postX = 0.68;
    const postHeight = 0.94;

    // 1. Authentic twin blue feet + tie bar
    this.buildBasePlate(root, postX);

    // 2. Short vertical posts with top pegs
    this.buildVerticalPosts(root, postHeight, postX);

    // 3. Lower Chevron Hazard Board (sits low, from y = 0.10m to y = 0.62m)
    this.buildChevronBoard(root, 0.10, 0.62, 1.34, 0.14);

    // 4. Upper 45-degree Striped Crossbar (centered at y = 0.78m, spans y = 0.62m to 0.94m) with 2 blue studs
    this.buildStripedCrossbar(root, 0.78, 1.62, 0.32, 0.22, postX);
  }

  // -------------------------------------------------------------------------
  // 2. LOW OVERHEAD SLIDE BARRIER (LEFT IN USER IMAGE) - Slide under it!
  // -------------------------------------------------------------------------
  private static buildLowOverheadSlide(root: THREE.Group) {
    const postX = 0.68;
    const postHeight = 1.62;

    // 1. Authentic twin blue feet + tie bar
    this.buildBasePlate(root, postX);

    // 2. Vertical posts rising to y = 1.62m with top pegs
    // Completely clear opening underneath from y = 0.08m to y = 1.28m!
    this.buildVerticalPosts(root, postHeight, postX);

    // 3. Overhead 45-degree Striped Crossbar (centered at y = 1.45m, spans y = 1.28m to 1.62m) with 2 blue studs
    this.buildStripedCrossbar(root, 1.45, 1.62, 0.34, 0.22, postX);
  }

  // -------------------------------------------------------------------------
  // 3. TALL DOUBLE-DECKER CHEVRON BARRIER (CENTER IN USER IMAGE) - Slide under or dodge!
  // -------------------------------------------------------------------------
  private static buildHighBarrier(root: THREE.Group) {
    const postX = 0.68;
    const postHeight = 2.80;

    // 1. Authentic twin blue feet + tie bar
    this.buildBasePlate(root, postX);

    // 2. Tall vertical posts rising to y = 2.80m with top pegs
    // Clear opening underneath lower bar from y = 0.08m to y = 1.28m!
    this.buildVerticalPosts(root, postHeight, postX);

    // 3. Lower 45-degree Striped Crossbar (centered at y = 1.45m) with 2 blue studs
    this.buildStripedCrossbar(root, 1.45, 1.62, 0.34, 0.22, postX);

    // 4. Middle Tall Chevron Hazard Board (from y = 1.62m to y = 2.44m) with red downward chevrons
    this.buildChevronBoard(root, 1.62, 2.44, 1.34, 0.14);

    // 5. Upper 45-degree Striped Crossbar (centered at y = 2.62m) with 2 blue studs
    this.buildStripedCrossbar(root, 2.62, 1.62, 0.34, 0.22, postX);
  }

  // -------------------------------------------------------------------------
  // Additional complementary obstacles
  // -------------------------------------------------------------------------
  private static buildTrafficCones(root: THREE.Group) {
    const coneMat = this.getMaterial('cone_mat', () =>
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 })
    );
    const whiteBand = this.getMaterial('cone_white', () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    const coneGeom = this.getGeometry('traffic_cone', () => new THREE.ConeGeometry(0.3, 0.9, 12));
    const bandGeom = this.getGeometry('traffic_cone_band', () => new THREE.CylinderGeometry(0.18, 0.22, 0.2, 12));

    const positions = [
      [-0.6, 0, -0.2],
      [0.6, 0, -0.2],
      [0, 0, 0.3],
    ];

    positions.forEach(([cx, cy, cz]) => {
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.set(cx, 0.45, cz);
      cone.castShadow = true;
      root.add(cone);

      const band = new THREE.Mesh(bandGeom, whiteBand);
      band.position.set(cx, 0.45, cz);
      root.add(band);

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.06, 0.65),
        new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 })
      );
      base.position.set(cx, 0.03, cz);
      root.add(base);
    });
  }

  private static buildSignalPole(root: THREE.Group) {
    const poleMat = this.getMaterial('signal_pole_mat', () =>
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.7 })
    );

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 4.0, 12), poleMat);
    pole.position.set(0, 2.0, 0);
    pole.castShadow = true;
    root.add(pole);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
    );
    box.position.set(0, 2.6, 0.2);
    root.add(box);

    const redLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    redLens.position.set(0, 3.0, 0.46);
    root.add(redLens);

    const greenLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    greenLens.position.set(0, 2.3, 0.46);
    root.add(greenLens);
  }
}
