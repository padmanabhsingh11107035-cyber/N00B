import * as THREE from 'three';

export class SecurityGuardModel {
  public group: THREE.Group;

  // Skeletal Hierarchy
  public rootNode: THREE.Group;
  public pelvis: THREE.Group;
  public torso: THREE.Group;
  public belly: THREE.Mesh;
  public chest: THREE.Group;
  public neck: THREE.Group;
  public head: THREE.Group;

  public leftHip: THREE.Group;
  public leftUpperLeg: THREE.Mesh;
  public leftKnee: THREE.Group;
  public leftLowerLeg: THREE.Mesh;
  public leftFoot: THREE.Mesh;

  public rightHip: THREE.Group;
  public rightUpperLeg: THREE.Mesh;
  public rightKnee: THREE.Group;
  public rightLowerLeg: THREE.Mesh;
  public rightFoot: THREE.Mesh;

  public leftShoulder: THREE.Group;
  public leftUpperArm: THREE.Mesh;
  public leftElbow: THREE.Group;
  public leftLowerArm: THREE.Mesh;
  public leftHand: THREE.Mesh;

  public rightShoulder: THREE.Group;
  public rightUpperArm: THREE.Mesh;
  public rightElbow: THREE.Group;
  public rightLowerArm: THREE.Mesh;
  public rightHand: THREE.Mesh;

  public baton: THREE.Mesh;
  public whistle: THREE.Mesh;

  // Tactical Security Assault Rifle
  public rifle: THREE.Group;
  public muzzleTip: THREE.Object3D;
  public muzzleFlash: THREE.Mesh;
  public muzzleFlashTimer = 0;
  public recoilImpulse = 0;

  // Materials list for fading out
  private materials: THREE.Material[] = [];

  private animTime = 0;
  public animState: 'idle' | 'chasing' | 'whistling' | 'panting' | 'exhausted' = 'chasing';

  constructor() {
    this.group = new THREE.Group();
    this.rootNode = new THREE.Group();
    this.group.add(this.rootNode);

    // Uniform & Styling Materials
    const uniformNavy = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Classic inspector deep royal/navy blue
      roughness: 0.5,
      metalness: 0.2,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(uniformNavy);

    const uniformDark = new THREE.MeshStandardMaterial({
      color: 0x172554, // Dark navy trousers & cap visor
      roughness: 0.6,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(uniformDark);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Shiny brass buttons, badge, cap braid
      emissive: 0xca8a04,
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(goldMat);

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfbd0b5, // Peach skin tone
      roughness: 0.65,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(skinMat);

    const mustacheMat = new THREE.MeshStandardMaterial({
      color: 0x451a03, // Dark brown classic inspector mustache
      roughness: 0.9,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(mustacheMat);

    const leatherBeltMat = new THREE.MeshStandardMaterial({
      color: 0x09090b, // Black police duty belt & boots
      roughness: 0.4,
      metalness: 0.4,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(leatherBeltMat);

    const whiteGloveMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(whiteGloveMat);

    // --- 1. PELVIS & STOUT LOWER BODY ---
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 1.05;
    this.rootNode.add(this.pelvis);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.32, 0.48), uniformDark);
    pelvisMesh.castShadow = true;
    this.pelvis.add(pelvisMesh);

    // Thick leather utility belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.52), leatherBeltMat);
    belt.position.y = 0.16;
    this.pelvis.add(belt);

    // Shiny gold buckle
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.04), goldMat);
    buckle.position.set(0, 0.16, 0.27);
    this.pelvis.add(buckle);

    // Radio pouch on hip
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), leatherBeltMat);
    radio.position.set(0.38, 0.14, 0);
    this.pelvis.add(radio);

    // --- 2. TORSO (Subway Surfers signature chubby inspector belly) ---
    this.torso = new THREE.Group();
    this.torso.position.y = 0.18;
    this.pelvis.add(this.torso);

    this.chest = new THREE.Group();
    this.chest.position.y = 0.28;
    this.torso.add(this.chest);

    // Stout uniform chest
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.46, 0.56), uniformNavy);
    chestMesh.position.y = 0.12;
    chestMesh.castShadow = true;
    this.chest.add(chestMesh);

    // Protruding round inspector belly
    this.belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 12),
      uniformNavy
    );
    this.belly.scale.set(1.15, 0.95, 1.0);
    this.belly.position.set(0, -0.04, 0.16);
    this.belly.castShadow = true;
    this.chest.add(this.belly);

    // Double-breasted gold uniform buttons
    [-0.14, 0.14].forEach((bx) => {
      [0.02, 0.18, 0.32].forEach((by) => {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), goldMat);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(bx, by, 0.31);
        this.chest.add(btn);
      });
    });

    // Inspector gold badge on chest
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.02, 7), goldMat);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(-0.25, 0.26, 0.3);
    this.chest.add(badge);

    // Gold shoulder epaulets
    [-0.42, 0.42].forEach((ex) => {
      const epaulet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.28), goldMat);
      epaulet.position.set(ex, 0.36, 0);
      this.chest.add(epaulet);
    });

    // --- 3. NECK & HEAD ---
    this.neck = new THREE.Group();
    this.neck.position.y = 0.38;
    this.chest.add(this.neck);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 12), skinMat);
    this.neck.add(neckMesh);

    this.head = new THREE.Group();
    this.head.position.y = 0.22;
    this.neck.add(this.head);

    // Plump cartoon inspector head
    const headGeom = new THREE.BoxGeometry(0.52, 0.48, 0.46);
    const headMesh = new THREE.Mesh(headGeom, skinMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Bulging cheeks
    [-0.24, 0.24].forEach((cx) => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skinMat);
      cheek.position.set(cx, -0.06, 0.12);
      this.head.add(cheek);
    });

    // Bulbous round cartoon nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skinMat);
    nose.position.set(0, 0.02, 0.28);
    this.head.add(nose);

    // Classic bushy inspector mustache!
    const mustacheL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.1), mustacheMat);
    mustacheL.rotation.z = -0.18;
    mustacheL.position.set(-0.11, -0.08, 0.28);
    this.head.add(mustacheL);

    const mustacheR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.1), mustacheMat);
    mustacheR.rotation.z = 0.18;
    mustacheR.position.set(0.11, -0.08, 0.28);
    this.head.add(mustacheR);

    // Grumpy determined eyebrows
    [-0.14, 0.14].forEach((ex) => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), mustacheMat);
      brow.rotation.z = ex < 0 ? -0.2 : 0.2;
      brow.position.set(ex, 0.14, 0.25);
      this.head.add(brow);
    });

    // Cartoon eyes
    [-0.13, 0.13].forEach((ex) => {
      const sclera = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sclera.position.set(ex, 0.06, 0.24);
      this.head.add(sclera);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x111827 })
      );
      pupil.position.set(ex, 0.06, 0.29);
      this.head.add(pupil);
    });

    // Silver whistle in mouth
    const whistleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(whistleMat);

    this.whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.18, 10), whistleMat);
    this.whistle.rotation.x = Math.PI / 2 + 0.2;
    this.whistle.position.set(0, -0.12, 0.32);
    this.head.add(this.whistle);

    // --- POLICE PEAKED CAP ---
    const capGroup = new THREE.Group();
    capGroup.position.set(0, 0.25, -0.02);
    this.head.add(capGroup);

    // Cap crown (navy blue flared top)
    const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.31, 0.2, 16), uniformNavy);
    capCrown.position.y = 0.08;
    capGroup.add(capCrown);

    // Gold band around cap
    const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16), goldMat);
    capBand.position.y = 0.01;
    capGroup.add(capBand);

    // Gold cap star / eagle emblem
    const capEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.03), goldMat);
    capEmblem.position.set(0, 0.1, 0.32);
    capGroup.add(capEmblem);

    // Shiny black peaked visor
    const visorGeom = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16, 1, false, 0, Math.PI);
    const visor = new THREE.Mesh(visorGeom, leatherBeltMat);
    visor.rotation.x = 0.32;
    visor.position.set(0, 0.01, 0.18);
    capGroup.add(visor);

    // --- 4. LEGS (Thick service trousers & black boots) ---
    // Left Leg
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.25, -0.1, 0);
    this.pelvis.add(this.leftHip);

    this.leftUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.26), uniformDark);
    this.leftUpperLeg.position.y = -0.22;
    this.leftUpperLeg.castShadow = true;
    this.leftHip.add(this.leftUpperLeg);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.y = -0.46;
    this.leftHip.add(this.leftKnee);

    this.leftLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.24), uniformDark);
    this.leftLowerLeg.position.y = -0.2;
    this.leftLowerLeg.castShadow = true;
    this.leftKnee.add(this.leftLowerLeg);

    this.leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.42), leatherBeltMat);
    this.leftFoot.position.set(0, -0.42, 0.08);
    this.leftFoot.castShadow = true;
    this.leftKnee.add(this.leftFoot);

    // Right Leg
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.25, -0.1, 0);
    this.pelvis.add(this.rightHip);

    this.rightUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.26), uniformDark);
    this.rightUpperLeg.position.y = -0.22;
    this.rightUpperLeg.castShadow = true;
    this.rightHip.add(this.rightUpperLeg);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.y = -0.46;
    this.rightHip.add(this.rightKnee);

    this.rightLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.24), uniformDark);
    this.rightLowerLeg.position.y = -0.2;
    this.rightLowerLeg.castShadow = true;
    this.rightKnee.add(this.rightLowerLeg);

    this.rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.42), leatherBeltMat);
    this.rightFoot.position.set(0, -0.42, 0.08);
    this.rightFoot.castShadow = true;
    this.rightKnee.add(this.rightFoot);

    // --- 5. ARMS & BATON ---
    // Left Arm
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.46, 0.32, 0);
    this.chest.add(this.leftShoulder);

    this.leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.22), uniformNavy);
    this.leftUpperArm.position.y = -0.2;
    this.leftUpperArm.castShadow = true;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.y = -0.42;
    this.leftShoulder.add(this.leftElbow);

    this.leftLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.2), uniformNavy);
    this.leftLowerArm.position.y = -0.18;
    this.leftLowerArm.castShadow = true;
    this.leftElbow.add(this.leftLowerArm);

    this.leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), whiteGloveMat);
    this.leftHand.position.y = -0.38;
    this.leftElbow.add(this.leftHand);

    // Right Arm (Holding Baton)
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.46, 0.32, 0);
    this.chest.add(this.rightShoulder);

    this.rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.22), uniformNavy);
    this.rightUpperArm.position.y = -0.2;
    this.rightUpperArm.castShadow = true;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.y = -0.42;
    this.rightShoulder.add(this.rightElbow);

    this.rightLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.2), uniformNavy);
    this.rightLowerArm.position.y = -0.18;
    this.rightLowerArm.castShadow = true;
    this.rightElbow.add(this.rightLowerArm);

    this.rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), whiteGloveMat);
    this.rightHand.position.y = -0.38;
    this.rightElbow.add(this.rightHand);

    // Police Nightstick Baton (Holstered on left hip)
    const batonMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(batonMat);

    this.baton = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 10), batonMat);
    this.baton.rotation.z = 0.3;
    this.baton.position.set(-0.38, 0, 0.1);
    this.pelvis.add(this.baton);

    // ==========================================
    // --- TACTICAL SECURITY ASSAULT RIFLE ---
    // ==========================================
    const gunMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Tactical matte dark gunmetal
      roughness: 0.35,
      metalness: 0.75,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(gunMetalMat);

    const darkPolymerMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Black tactical polymer grip & stock
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(darkPolymerMat);

    const opticGlowMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // Red-dot optic reticle LED
    });

    this.rifle = new THREE.Group();
    this.rifle.position.set(0, -0.05, 0.15);
    this.rightHand.add(this.rifle);

    // 1. Rifle Receiver (Main body)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.52), gunMetalMat);
    receiver.castShadow = true;
    this.rifle.add(receiver);

    // 2. Tactical Rifle Stock (Resting near shoulder)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.28), darkPolymerMat);
    stock.position.set(0, -0.02, -0.38);
    stock.castShadow = true;
    this.rifle.add(stock);

    // 3. Pistol Grip (Held by right hand)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.1), darkPolymerMat);
    grip.position.set(0, -0.16, -0.08);
    grip.rotation.x = -0.35;
    this.rifle.add(grip);

    // 4. Curved Banana Magazine Clip (Underneath receiver)
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.14), darkPolymerMat);
    mag.position.set(0, -0.2, 0.08);
    mag.rotation.x = 0.25;
    this.rifle.add(mag);

    // 5. Rifled Barrel (Extending forward)
    const barrelGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.48, 8);
    barrelGeom.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeom, gunMetalMat);
    barrel.position.set(0, 0.03, 0.48);
    barrel.castShadow = true;
    this.rifle.add(barrel);

    // 6. Flash Hider / Muzzle Brake at barrel tip
    const brakeGeom = new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8);
    brakeGeom.rotateX(Math.PI / 2);
    const brake = new THREE.Mesh(brakeGeom, darkPolymerMat);
    brake.position.set(0, 0.03, 0.74);
    this.rifle.add(brake);

    // 7. Tactical Handguard Rails (Where left hand grips)
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.32), darkPolymerMat);
    handguard.position.set(0, 0.03, 0.32);
    this.rifle.add(handguard);

    // 8. Holographic Red Dot Sight Optic
    const scopeBase = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.16), darkPolymerMat);
    scopeBase.position.set(0, 0.13, 0.05);
    this.rifle.add(scopeBase);

    const redDot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), opticGlowMat);
    redDot.rotation.x = Math.PI / 2;
    redDot.position.set(0, 0.13, 0.13);
    this.rifle.add(redDot);

    // 9. Muzzle Tip World Target Anchor
    this.muzzleTip = new THREE.Object3D();
    this.muzzleTip.position.set(0, 0.03, 0.82);
    this.rifle.add(this.muzzleTip);

    // 10. Radiant Fiery Muzzle Flash Spikes (Hidden by default, flashes during bursts)
    const flashGeom = new THREE.ConeGeometry(0.15, 0.42, 6);
    flashGeom.rotateX(Math.PI / 2);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffedd5, // Ultra bright white-orange bloom core
    });
    this.muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
    this.muzzleFlash.position.set(0, 0.03, 1.0);
    this.muzzleFlash.visible = false;
    this.rifle.add(this.muzzleFlash);
  }

  public setOpacity(alpha: number) {
    const clamped = Math.max(0, Math.min(1, alpha));
    this.materials.forEach((mat) => {
      mat.opacity = clamped;
      mat.transparent = clamped < 0.99;
    });
  }

  public getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.muzzleTip.getWorldPosition(target);
    return target;
  }

  public triggerMuzzleFlash(duration = 0.06) {
    this.muzzleFlashTimer = duration;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.recoilImpulse = 1.0;
  }

  public reset() {
    this.animTime = 0;
    this.muzzleFlashTimer = 0;
    this.recoilImpulse = 0;
    this.muzzleFlash.visible = false;
    this.setOpacity(1.0);
    this.animState = 'chasing';
    this.rootNode.rotation.set(0, 0, 0);
  }

  public update(delta: number, runSpeed: number, state: 'idle' | 'chasing' | 'whistling' | 'panting' | 'exhausted') {
    this.animState = state;
    this.animTime += delta;

    // Handle muzzle flash countdown
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.visible = false;
      }
    }

    // Decay recoil kick
    if (this.recoilImpulse > 0) {
      this.recoilImpulse = Math.max(0, this.recoilImpulse - delta * 12.0);
    }
    this.rifle.position.z = 0.15 - this.recoilImpulse * 0.08;

    switch (state) {
      case 'idle':
        this.animateIdle(delta);
        break;
      case 'chasing':
      case 'whistling':
        this.animateChasing(delta, runSpeed);
        break;
      case 'panting':
      case 'exhausted':
        this.animateExhausted(delta);
        break;
    }
  }

  private animateIdle(delta: number) {
    const t = this.animTime * 2.5;
    this.pelvis.position.y = 1.05 + Math.sin(t) * 0.02;
    this.torso.rotation.x = 0;
    this.head.rotation.y = Math.sin(this.animTime * 1.2) * 0.1;

    // Rifle at relaxed patrol low-ready
    this.rightShoulder.rotation.set(-0.6, -0.1, 0);
    this.rightElbow.rotation.set(-0.5, 0, 0);
    this.leftShoulder.rotation.set(-0.5, 0.3, 0);
    this.leftElbow.rotation.set(-0.6, 0, 0);

    this.leftHip.rotation.x = 0;
    this.rightHip.rotation.x = 0;
  }

  private animateChasing(delta: number, speed: number) {
    // Heavy, stomping police sprint cycle
    const freq = Math.max(10, Math.min(18, speed * 0.65));
    const phase = this.animTime * freq;

    // Heavy belly and torso bounce
    const bounce = Math.abs(Math.sin(phase));
    this.pelvis.position.y = 1.05 + bounce * 0.14;
    this.belly.scale.set(1.15, 0.95 + Math.sin(phase * 2) * 0.05, 1.0);

    // Torso leans aggressively forward into the pursuit
    this.torso.rotation.x = 0.28;
    this.chest.rotation.y = Math.sin(phase) * 0.08;

    // Leg stride
    const stride = Math.sin(phase) * 0.95;
    this.leftHip.rotation.x = stride;
    this.rightHip.rotation.x = -stride;

    // Knee bending
    this.leftKnee.rotation.x = Math.max(0, -Math.sin(phase) * 1.3);
    this.rightKnee.rotation.x = Math.max(0, Math.sin(phase) * 1.3);

    // Tactical Assault Rifle Aiming Stance (Holding rifle with both hands forward towards runner!)
    const recoilKick = this.recoilImpulse * 0.18;
    this.rightShoulder.rotation.set(-1.18 + recoilKick, -0.22, 0);
    this.rightElbow.rotation.set(-0.45 - recoilKick * 0.5, 0, 0);

    // Left arm holding handguard
    this.leftShoulder.rotation.set(-1.08 + recoilKick, 0.48, 0);
    this.leftElbow.rotation.set(-0.82, 0, 0);

    // Head determinedly fixed forward aiming down the optic sight
    this.head.rotation.x = -0.12 + bounce * 0.05;
    this.head.rotation.y = Math.sin(phase * 0.5) * 0.04;
  }

  private animateExhausted(delta: number) {
    // Heavy panting, hands on knees or clutching chest, falling back
    const pant = Math.sin(this.animTime * 7);
    this.pelvis.position.y = 0.92 + pant * 0.04;
    this.torso.rotation.x = 0.55 + pant * 0.08; // Deep hunch forward
    this.head.rotation.x = -0.4; // Looking up from hunched posture

    // Slow dragging strides
    const drag = Math.sin(this.animTime * 3) * 0.3;
    this.leftHip.rotation.x = drag;
    this.rightHip.rotation.x = -drag;
    this.leftKnee.rotation.x = 0.3;
    this.rightKnee.rotation.x = 0.3;

    // Arms waving helplessly or resting on knees
    this.leftShoulder.rotation.x = -0.6;
    this.rightShoulder.rotation.x = -0.6;
    this.leftElbow.rotation.x = -0.6;
    this.rightElbow.rotation.x = -0.6;
  }
}
