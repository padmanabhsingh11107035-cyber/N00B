import * as THREE from 'three';
import { CharacterSkin } from '../types';

export class CharacterModel {
  public group: THREE.Group;

  // Skeletal hierarchy nodes
  public rootNode: THREE.Group;
  public pelvis: THREE.Group;
  public torso: THREE.Group;
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

  public backpack: THREE.Group;
  public jetpackJets: THREE.Group;
  public leftThrusterFlame: THREE.Mesh;
  public rightThrusterFlame: THREE.Mesh;

  public shieldBubble: THREE.Mesh;
  public magnetAura: THREE.Mesh;

  // Intro Spray Can Prop
  public sprayCan: THREE.Group;
  public sprayNozzleTip: THREE.Object3D;

  // Archetype Accessory Groups
  private headAccGroup: THREE.Group;
  private chestAccGroup: THREE.Group;
  private leftArmAccGroup: THREE.Group;
  private rightArmAccGroup: THREE.Group;
  private backGearGroup: THREE.Group;
  private legsAccGroup: THREE.Group;

  // Materials for skinning & styling
  private jacketMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private accentMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private shoesMat: THREE.MeshStandardMaterial;
  private metallicMat: THREE.MeshStandardMaterial;
  private neonGlowMat: THREE.MeshBasicMaterial;
  private leatherMat: THREE.MeshStandardMaterial;

  // Animation & Model state
  public currentModelId = 'runner_ace';
  private currentSkin?: CharacterSkin;
  private animTime = 0;
  public animState: 'idle' | 'running' | 'jumping' | 'sliding' | 'landing' | 'death' | 'spraying' | 'startled' = 'idle';
  private laneTilt = 0;
  private jetpackActive = false;

  constructor(initialSkin?: CharacterSkin, initialModel = 'runner_ace') {
    this.group = new THREE.Group();
    this.rootNode = new THREE.Group();
    this.group.add(this.rootNode);

    // Initialize materials with default streetwear colors
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xffd1a4,
      roughness: 0.6,
      metalness: 0.1,
    });

    this.jacketMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Vibrant sky cyan hoodie
      roughness: 0.4,
      metalness: 0.2,
    });

    this.pantsMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark charcoal urban joggers
      roughness: 0.6,
      metalness: 0.1,
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // High-vis neon yellow details & laces
      emissive: 0xeab308,
      emissiveIntensity: 0.2,
      roughness: 0.3,
    });

    this.hairMat = new THREE.MeshStandardMaterial({
      color: 0x3b1d11, // Dark brown stylized hair
      roughness: 0.8,
    });

    this.shoesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Crisp chunky sneakers
      roughness: 0.3,
    });

    this.metallicMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.2,
      metalness: 0.85,
    });

    this.neonGlowMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
    });

    this.leatherMat = new THREE.MeshStandardMaterial({
      color: 0x5a3825,
      roughness: 0.7,
      metalness: 0.1,
    });

    // Build Pelvis & Torso Hierarchy
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 1.05;
    this.rootNode.add(this.pelvis);

    const pelvisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.3, 0.35),
      this.pantsMat
    );
    pelvisMesh.castShadow = true;
    this.pelvis.add(pelvisMesh);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.15;
    this.pelvis.add(this.torso);

    this.chest = new THREE.Group();
    this.chest.position.y = 0.25;
    this.torso.add(this.chest);

    // Core Chest mesh
    const chestGeom = new THREE.BoxGeometry(0.65, 0.55, 0.42);
    const chestMesh = new THREE.Mesh(chestGeom, this.jacketMat);
    chestMesh.position.y = 0.2;
    chestMesh.castShadow = true;
    this.chest.add(chestMesh);

    // Accessory Mounts
    this.chestAccGroup = new THREE.Group();
    this.chest.add(this.chestAccGroup);

    // Neck & Head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.52;
    this.chest.add(this.neck);

    this.head = new THREE.Group();
    this.head.position.y = 0.12;
    this.neck.add(this.head);

    // Core Face / Head mesh
    const faceMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.4, 0.38),
      this.skinMat
    );
    faceMesh.castShadow = true;
    this.head.add(faceMesh);

    this.headAccGroup = new THREE.Group();
    this.head.add(this.headAccGroup);

    // Backpack mount on back
    this.backpack = new THREE.Group();
    this.backpack.position.set(0, 0.2, -0.28);
    this.chest.add(this.backpack);

    this.backGearGroup = new THREE.Group();
    this.backpack.add(this.backGearGroup);

    // Jetpack Thruster Cylinders
    this.jetpackJets = new THREE.Group();
    this.backpack.add(this.jetpackJets);
    this.jetpackJets.visible = false;

    const thrusterMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.2,
    });
    const thrusterGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 12);

    const leftThruster = new THREE.Mesh(thrusterGeom, thrusterMat);
    leftThruster.position.set(-0.24, 0, -0.05);
    this.jetpackJets.add(leftThruster);

    const rightThruster = new THREE.Mesh(thrusterGeom, thrusterMat);
    rightThruster.position.set(0.24, 0, -0.05);
    this.jetpackJets.add(rightThruster);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const flameGeom = new THREE.ConeGeometry(0.1, 0.4, 8);
    this.leftThrusterFlame = new THREE.Mesh(flameGeom, flameMat);
    this.leftThrusterFlame.rotation.x = Math.PI;
    this.leftThrusterFlame.position.set(-0.24, -0.4, -0.05);
    this.jetpackJets.add(this.leftThrusterFlame);

    this.rightThrusterFlame = new THREE.Mesh(flameGeom, flameMat);
    this.rightThrusterFlame.rotation.x = Math.PI;
    this.rightThrusterFlame.position.set(0.24, -0.4, -0.05);
    this.jetpackJets.add(this.rightThrusterFlame);

    // --- LEGS SETUP ---
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.18, -0.1, 0);
    this.pelvis.add(this.leftHip);

    this.leftUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.22), this.pantsMat);
    this.leftUpperLeg.position.y = -0.22;
    this.leftUpperLeg.castShadow = true;
    this.leftHip.add(this.leftUpperLeg);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.y = -0.44;
    this.leftHip.add(this.leftKnee);

    this.leftLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.2), this.pantsMat);
    this.leftLowerLeg.position.y = -0.22;
    this.leftLowerLeg.castShadow = true;
    this.leftKnee.add(this.leftLowerLeg);

    this.leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), this.shoesMat);
    this.leftFoot.position.set(0, -0.45, 0.08);
    this.leftFoot.castShadow = true;
    this.leftKnee.add(this.leftFoot);

    // Right Leg
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.18, -0.1, 0);
    this.pelvis.add(this.rightHip);

    this.rightUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.22), this.pantsMat);
    this.rightUpperLeg.position.y = -0.22;
    this.rightUpperLeg.castShadow = true;
    this.rightHip.add(this.rightUpperLeg);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.y = -0.44;
    this.rightHip.add(this.rightKnee);

    this.rightLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.2), this.pantsMat);
    this.rightLowerLeg.position.y = -0.22;
    this.rightLowerLeg.castShadow = true;
    this.rightKnee.add(this.rightLowerLeg);

    this.rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), this.shoesMat);
    this.rightFoot.position.set(0, -0.45, 0.08);
    this.rightFoot.castShadow = true;
    this.rightKnee.add(this.rightFoot);

    this.legsAccGroup = new THREE.Group();
    this.pelvis.add(this.legsAccGroup);

    // --- ARMS SETUP ---
    // Left Arm
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.38, 0.4, 0);
    this.chest.add(this.leftShoulder);

    this.leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.18), this.jacketMat);
    this.leftUpperArm.position.y = -0.18;
    this.leftUpperArm.castShadow = true;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.y = -0.36;
    this.leftShoulder.add(this.leftElbow);

    this.leftLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.16), this.skinMat);
    this.leftLowerArm.position.y = -0.16;
    this.leftLowerArm.castShadow = true;
    this.leftElbow.add(this.leftLowerArm);

    this.leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.15), this.skinMat);
    this.leftHand.position.y = -0.34;
    this.leftElbow.add(this.leftHand);

    this.leftArmAccGroup = new THREE.Group();
    this.leftElbow.add(this.leftArmAccGroup);

    // Right Arm
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.38, 0.4, 0);
    this.chest.add(this.rightShoulder);

    this.rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.18), this.jacketMat);
    this.rightUpperArm.position.y = -0.18;
    this.rightUpperArm.castShadow = true;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.y = -0.36;
    this.rightShoulder.add(this.rightElbow);

    this.rightLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.16), this.skinMat);
    this.rightLowerArm.position.y = -0.16;
    this.rightLowerArm.castShadow = true;
    this.rightElbow.add(this.rightLowerArm);

    this.rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.15), this.skinMat);
    this.rightHand.position.y = -0.34;
    this.rightElbow.add(this.rightHand);

    // --- SUBWAY SURFERS SPRAY CAN PROP ---
    this.sprayCan = new THREE.Group();
    this.sprayCan.visible = false;
    this.rightHand.add(this.sprayCan);

    // Metallic Canister Cylinder
    const canBodyMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, // Vibrant street-art cyan canister
      metalness: 0.8,
      roughness: 0.2,
    });
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 12), canBodyMat);
    canBody.position.set(0, -0.06, 0.08);
    this.sprayCan.add(canBody);

    // Red Spray Can Cap / Collar
    const canCapMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4 });
    const canCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), canCapMat);
    canCap.position.set(0, 0.07, 0.08);
    this.sprayCan.add(canCap);

    // Spray Nozzle
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.04), nozzleMat);
    nozzle.position.set(0, 0.11, 0.08);
    this.sprayCan.add(nozzle);

    // Spray Tip Point (Origin for particle emission)
    this.sprayNozzleTip = new THREE.Object3D();
    this.sprayNozzleTip.position.set(0, 0.12, 0.12);
    this.sprayCan.add(this.sprayNozzleTip);

    this.rightArmAccGroup = new THREE.Group();
    this.rightElbow.add(this.rightArmAccGroup);

    // --- SHIELD BUBBLE EFFECT ---
    const shieldGeom = new THREE.SphereGeometry(1.4, 24, 24);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x0891b2,
      emissiveIntensity: 0.4,
    });
    this.shieldBubble = new THREE.Mesh(shieldGeom, shieldMat);
    this.shieldBubble.position.y = 1.0;
    this.shieldBubble.visible = false;
    this.rootNode.add(this.shieldBubble);

    // --- MAGNET AURA EFFECT ---
    const magnetGeom = new THREE.TorusGeometry(0.9, 0.06, 8, 24);
    const magnetMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    this.magnetAura = new THREE.Mesh(magnetGeom, magnetMat);
    this.magnetAura.rotation.x = Math.PI / 2;
    this.magnetAura.position.y = 0.8;
    this.magnetAura.visible = false;
    this.rootNode.add(this.magnetAura);

    // Build initial character model and skin
    this.setCharacter(initialModel, initialSkin);
  }

  /**
   * Set Character Archetype and Outfit Skin
   */
  public setCharacter(modelId: string, skin?: CharacterSkin) {
    this.currentModelId = modelId;
    if (skin) {
      this.currentSkin = skin;
      this.applySkin(skin);
    }

    // Clear previous accessory meshes
    this.clearGroup(this.headAccGroup);
    this.clearGroup(this.chestAccGroup);
    this.clearGroup(this.leftArmAccGroup);
    this.clearGroup(this.rightArmAccGroup);
    this.clearGroup(this.backGearGroup);
    this.clearGroup(this.legsAccGroup);

    // Reset arm skin materials to normal skin
    this.leftUpperArm.material = this.jacketMat;
    this.leftLowerArm.material = this.skinMat;
    this.leftHand.material = this.skinMat;

    // Build specific 3D character archetype
    switch (modelId) {
      case 'cyber_nova':
        this.buildNovaArchetype();
        break;
      case 'track_blaze':
        this.buildBlazeArchetype();
        break;
      case 'ninja_shadow':
        this.buildShadowArchetype();
        break;
      case 'aero_skyline':
        this.buildSkylineArchetype();
        break;
      case 'runner_ace':
      default:
        this.buildAceArchetype();
        break;
    }
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }
  }

  // ==============================================================
  // --- ARCHETYPE 1: ACE (Subway Prodigy / Streetwear Runner) ---
  // ==============================================================
  private buildAceArchetype() {
    // 1. Backward Snapback Cap
    const capDome = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.44), this.hairMat);
    capDome.position.set(0, 0.14, -0.02);
    capDome.castShadow = true;
    this.headAccGroup.add(capDome);

    const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.2), this.accentMat);
    capVisor.position.set(0, 0.1, 0.24);
    this.headAccGroup.add(capVisor);

    // Snapback top button
    const capBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), this.accentMat);
    capBtn.position.set(0, 0.26, -0.02);
    this.headAccGroup.add(capBtn);

    // 2. Over-Ear DJ Headphones
    const headphoneBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.03, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.2 })
    );
    headphoneBand.rotation.x = -Math.PI / 2;
    headphoneBand.rotation.z = Math.PI / 2;
    headphoneBand.position.y = 0.1;
    this.headAccGroup.add(headphoneBand);

    [-0.21, 0.21].forEach((px) => {
      const earPad = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), this.accentMat);
      earPad.rotation.z = Math.PI / 2;
      earPad.position.set(px, 0.05, 0);
      this.headAccGroup.add(earPad);
    });

    // Dark Street Shades
    const visorGlasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
    );
    visorGlasses.position.set(0, 0.02, 0.2);
    this.headAccGroup.add(visorGlasses);

    // 3. Chest Kangaroo Pouch & Stripe
    const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.43), this.accentMat);
    stripeMesh.position.y = 0.22;
    this.chestAccGroup.add(stripeMesh);

    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), this.jacketMat);
    pouch.position.set(0, 0.08, 0.23);
    this.chestAccGroup.add(pouch);

    // 4. Urban Spraycan Backpack with Dual Aerosol Cans
    const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.48, 0.2), this.pantsMat);
    packBody.castShadow = true;
    this.backGearGroup.add(packBody);

    // Dual spray paint cans clamped on sides
    [-0.26, 0.26].forEach((cx, idx) => {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 })
      );
      can.position.set(cx, 0, 0);
      this.backGearGroup.add(can);

      // Nozzle cap with accent color
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8),
        idx === 0 ? this.accentMat : this.jacketMat
      );
      cap.position.set(cx, 0.2, 0);
      this.backGearGroup.add(cap);
    });
  }

  // ==============================================================
  // --- ARCHETYPE 2: NOVA (Cyberpunk Phantom / High-Tech Suit) ---
  // ==============================================================
  private buildNovaArchetype() {
    // 1. Holographic Cyber HUD Visor
    const cyberVisor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    cyberVisor.position.set(0, 0.04, 0.21);
    this.headAccGroup.add(cyberVisor);

    // Cyber audio antennae on temple
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), this.metallicMat);
    antenna.rotation.x = -Math.PI / 6;
    antenna.position.set(0.22, 0.16, 0);
    this.headAccGroup.add(antenna);

    // 2. High-Tech Exoskeletal Chest Armor Plate
    const armorPlate = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.1), this.metallicMat);
    armorPlate.position.set(0, 0.22, 0.21);
    this.chestAccGroup.add(armorPlate);

    // Glowing Neon Reactor Core on Chest
    const coreGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    coreGlow.rotation.x = Math.PI / 2;
    coreGlow.position.set(0, 0.25, 0.27);
    this.chestAccGroup.add(coreGlow);

    // 3. Robotic Cybernetic Left Arm!
    this.leftUpperArm.material = this.metallicMat;
    this.leftLowerArm.material = this.metallicMat;
    this.leftHand.material = this.metallicMat;

    // Glowing cyber wrist cuff
    const wristGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    wristGlow.position.set(0, -0.26, 0);
    this.leftArmAccGroup.add(wristGlow);

    // 4. Cyber Arc-Reactor Power Pack on Back
    const cyberPack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.22), this.metallicMat);
    cyberPack.castShadow = true;
    this.backGearGroup.add(cyberPack);

    // Pulsing Plasma Power Core
    const powerCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0xff007f })
    );
    powerCore.rotation.x = Math.PI / 2;
    powerCore.position.set(0, 0.05, -0.12);
    this.backGearGroup.add(powerCore);

    // Twin heat-sink radiator fins
    [-0.18, 0.18].forEach((fx) => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.36, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      fin.position.set(fx, 0, -0.1);
      this.backGearGroup.add(fin);
    });
  }

  // ==============================================================
  // --- ARCHETYPE 3: BLAZE (Sprint Legend / Athletic Runner) ---
  // ==============================================================
  private buildBlazeArchetype() {
    // 1. Spiky Athletic Hair
    const hairBlaze = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.25, 5), this.hairMat);
    hairBlaze.position.set(0, 0.26, -0.05);
    this.headAccGroup.add(hairBlaze);

    // Athletic Sweat Headband
    const headband = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), this.accentMat);
    headband.position.set(0, 0.12, 0);
    this.headAccGroup.add(headband);

    // 2. Sprint Singlet Bib "#01" on Chest
    const bib = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.3, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    bib.position.set(0, 0.2, 0.23);
    this.chestAccGroup.add(bib);

    const bibNum = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.16, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xdc2626 })
    );
    bibNum.position.set(0, 0.2, 0.255);
    this.chestAccGroup.add(bibNum);

    // Dual Arm Sweatbands
    const sweatbandL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.18), this.accentMat);
    sweatbandL.position.set(0, -0.15, 0);
    this.leftArmAccGroup.add(sweatbandL);

    const sweatbandR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.18), this.accentMat);
    sweatbandR.position.set(0, -0.15, 0);
    this.rightArmAccGroup.add(sweatbandR);

    // 3. Streamlined Hydration Backpack with Drinking Hose
    const hydroPack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.15), this.jacketMat);
    hydroPack.castShadow = true;
    this.backGearGroup.add(hydroPack);

    // Hydration tube over shoulder
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    tube.rotation.x = Math.PI / 4;
    tube.position.set(0.16, 0.18, 0.05);
    this.backGearGroup.add(tube);
  }

  // ==============================================================
  // --- ARCHETYPE 4: SHADOW (Rooftop Shinobi / Ninja) ---
  // ==============================================================
  private buildShadowArchetype() {
    // 1. Shinobi Lower Half Face Mask / Cowl
    const ninjaMask = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.22), this.pantsMat);
    ninjaMask.position.set(0, -0.06, 0.12);
    this.headAccGroup.add(ninjaMask);

    // Metal Forehead Protector (Hitai-ate)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.04), this.metallicMat);
    plate.position.set(0, 0.11, 0.21);
    this.headAccGroup.add(plate);

    // Fluttering Headband Ribbon Tails at back of head!
    const ribbon1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.02), this.pantsMat);
    ribbon1.rotation.x = -Math.PI / 6;
    ribbon1.position.set(-0.06, 0.02, -0.3);
    this.headAccGroup.add(ribbon1);

    const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.02), this.accentMat);
    ribbon2.rotation.x = -Math.PI / 5;
    ribbon2.position.set(0.06, 0.05, -0.28);
    this.headAccGroup.add(ribbon2);

    // 2. Ninja Tactical Vest & Kunai Holster
    const ninjaVest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.5, 0.12), this.pantsMat);
    ninjaVest.position.set(0, 0.2, 0.2);
    this.chestAccGroup.add(ninjaVest);

    // 3. Armored Forearm Vambraces / Armguards
    const vambraceL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.2), this.pantsMat);
    vambraceL.position.set(0, -0.16, 0);
    this.leftArmAccGroup.add(vambraceL);

    const vambraceR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.2), this.pantsMat);
    vambraceR.position.set(0, -0.16, 0);
    this.rightArmAccGroup.add(vambraceR);

    // 4. Dual Crossed Katana Swords on Back!
    [-0.32, 0.32].forEach((rot) => {
      const scabbard = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.95, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
      );
      scabbard.rotation.z = rot;
      scabbard.position.set(0, 0.15, -0.06);
      this.backGearGroup.add(scabbard);

      // Sword Hilt (Tsuka) wrapped with accent cord
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), this.accentMat);
      hilt.rotation.z = rot;
      hilt.position.set(rot > 0 ? 0.32 : -0.32, 0.65, -0.06);
      this.backGearGroup.add(hilt);
    });
  }

  // ==============================================================
  // --- ARCHETYPE 5: SKYLINE (Aero Ace Pilot) ---
  // ==============================================================
  private buildSkylineArchetype() {
    // 1. Aviator Pilot Helmet
    const pilotCap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.44), this.leatherMat);
    pilotCap.position.set(0, 0.1, -0.01);
    this.headAccGroup.add(pilotCap);

    // Brass Flight Goggles rested on forehead
    [-0.1, 0.1].forEach((gx) => {
      const goggleRim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12),
        this.metallicMat
      );
      goggleRim.rotation.x = Math.PI / 2;
      goggleRim.position.set(gx, 0.14, 0.22);
      this.headAccGroup.add(goggleRim);

      const goggleLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 10),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      goggleLens.position.set(gx, 0.14, 0.255);
      this.headAccGroup.add(goggleLens);
    });

    // 2. Heavy Sherpa Fleece Shearling Collar around Neck
    const fleeceCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.9 })
    );
    fleeceCollar.rotation.x = Math.PI / 2;
    fleeceCollar.position.set(0, 0.45, 0);
    this.chestAccGroup.add(fleeceCollar);

    // Flight Harness Straps & Brass Buckle
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.04), this.metallicMat);
    buckle.position.set(0, 0.18, 0.23);
    this.chestAccGroup.add(buckle);

    // 3. Pilot Leather Gauntlets on Arms
    const cuffL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.2), this.leatherMat);
    cuffL.position.set(0, -0.22, 0);
    this.leftArmAccGroup.add(cuffL);

    const cuffR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.2), this.leatherMat);
    cuffR.position.set(0, -0.22, 0);
    this.rightArmAccGroup.add(cuffR);

    // 4. Parachute Emergency Jump-Pack on Back
    const chutePack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.24), this.leatherMat);
    chutePack.castShadow = true;
    this.backGearGroup.add(chutePack);

    // Red D-Ring Rip-Cord Handle
    const ripCord = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.02, 6, 12),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    ripCord.position.set(0.18, 0.15, 0.14);
    this.backGearGroup.add(ripCord);
  }

  public applySkin(skin: CharacterSkin) {
    this.currentSkin = skin;
    this.jacketMat.color.set(skin.jacketColor);
    this.pantsMat.color.set(skin.pantsColor);
    this.accentMat.color.set(skin.accentColor);
    this.accentMat.emissive.set(skin.accentColor);
    this.hairMat.color.set(skin.hairColor);
  }

  public setShieldActive(active: boolean) {
    this.shieldBubble.visible = active;
  }

  public setMagnetActive(active: boolean) {
    this.magnetAura.visible = active;
  }

  public setJetpackActive(active: boolean) {
    this.jetpackActive = active;
    this.jetpackJets.visible = active;
  }

  public setSprayCanVisible(visible: boolean) {
    this.sprayCan.visible = visible;
  }

  public setLaneTilt(targetTilt: number) {
    this.laneTilt = targetTilt;
  }

  public getSprayNozzleWorldPos(target: THREE.Vector3): THREE.Vector3 {
    this.sprayNozzleTip.getWorldPosition(target);
    return target;
  }

  /**
   * Main animation tick called in game loop
   */
  public update(
    delta: number,
    runSpeed: number,
    state: 'idle' | 'running' | 'jumping' | 'sliding' | 'death' | 'spraying' | 'startled'
  ) {
    this.animState = state;
    this.animTime += delta;

    // Pulse effects
    if (this.shieldBubble.visible) {
      const scale = 1 + Math.sin(this.animTime * 6) * 0.04;
      this.shieldBubble.scale.set(scale, scale, scale);
      this.shieldBubble.rotation.y += delta * 1.5;
    }

    if (this.magnetAura.visible) {
      this.magnetAura.rotation.z += delta * 4;
      this.magnetAura.position.y = 0.8 + Math.sin(this.animTime * 8) * 0.1;
    }

    if (this.jetpackActive) {
      const flicker = 0.8 + Math.random() * 0.4;
      this.leftThrusterFlame.scale.set(flicker, flicker * 1.5, flicker);
      this.rightThrusterFlame.scale.set(flicker, flicker * 1.5, flicker);
    }

    // Lane tilt banking smooth return (framerate-independent exponential decay)
    const tiltEase = 1.0 - Math.exp(-14.0 * delta);
    this.rootNode.rotation.z = THREE.MathUtils.lerp(this.rootNode.rotation.z, this.laneTilt, tiltEase);
    this.rootNode.rotation.y = THREE.MathUtils.lerp(this.rootNode.rotation.y, this.laneTilt * 0.5, tiltEase);

    // Apply specific animation pose
    switch (state) {
      case 'idle':
        this.animateIdle(delta);
        break;
      case 'spraying':
        this.animateSpraying(delta);
        break;
      case 'startled':
        this.animateStartled(delta);
        break;
      case 'running':
        if (this.jetpackActive) {
          this.animateJetpack(delta);
        } else {
          this.animateRunning(delta, runSpeed);
        }
        break;
      case 'jumping':
        this.animateJumping(delta);
        break;
      case 'sliding':
        this.animateSliding(delta);
        break;
      case 'death':
        this.animateDeath(delta);
        break;
    }
  }

  private animateSpraying(delta: number) {
    this.sprayCan.visible = true;

    // Standing pose facing train carriage (slightly rotated)
    this.pelvis.position.y = 1.05;
    this.pelvis.rotation.set(0, 0, 0);
    this.torso.rotation.x = 0.05;
    this.torso.rotation.y = 0.35; // Body angled towards train on side

    // Head looking up and focused on graffiti art
    this.head.rotation.y = 0.22;
    this.head.rotation.x = -0.15 + Math.sin(this.animTime * 4) * 0.05;

    // Left arm resting comfortably on hip
    this.leftShoulder.rotation.x = 0.25;
    this.leftShoulder.rotation.z = 0.4;
    this.leftElbow.rotation.x = -0.8;

    // Right arm actively spray painting: sweeping up and down + rapid can shaking!
    const sweep = Math.sin(this.animTime * 3.5);
    const shake = Math.sin(this.animTime * 22) * 0.08;

    this.rightShoulder.rotation.x = -1.15 + sweep * 0.25 + shake;
    this.rightShoulder.rotation.z = -0.3 + Math.cos(this.animTime * 2.5) * 0.15;
    this.rightElbow.rotation.x = -0.7 + shake * 0.5;

    // Straight legs with slight relaxed knee bend
    this.leftHip.rotation.x = 0.1;
    this.leftKnee.rotation.x = 0;
    this.rightHip.rotation.x = -0.15;
    this.rightKnee.rotation.x = 0.1;
  }

  private animateStartled(delta: number) {
    this.sprayCan.visible = false;

    // Caught red-handed! Flailing arms, sharp head turn to look back at security!
    this.pelvis.position.y = 1.0;
    this.torso.rotation.x = -0.1;
    this.torso.rotation.y = -0.4;

    // Head turned sharply back over shoulder
    this.head.rotation.y = -1.2;
    this.head.rotation.x = 0.15;

    // Arms thrown back in alarm
    this.leftShoulder.rotation.x = 0.6;
    this.leftShoulder.rotation.z = 0.7;
    this.leftElbow.rotation.x = -0.4;

    this.rightShoulder.rotation.x = 0.6;
    this.rightShoulder.rotation.z = -0.7;
    this.rightElbow.rotation.x = -0.4;

    // Knees bent ready to sprint
    this.leftHip.rotation.x = -0.25;
    this.leftKnee.rotation.x = 0.45;
    this.rightHip.rotation.x = 0.3;
    this.rightKnee.rotation.x = 0.2;
  }

  private animateIdle(delta: number) {
    const idleType = this.currentSkin?.idleAnimation || 'default';

    switch (idleType) {
      case 'cyber_scan':
        this.animateIdleCyberScan(delta);
        break;
      case 'hiphop_groove':
        this.animateIdleHiphopGroove(delta);
        break;
      case 'ninja_kata':
        this.animateIdleNinjaKata(delta);
        break;
      case 'vapor_float':
        this.animateIdleVaporFloat(delta);
        break;
      case 'athletic_stretch':
        this.animateIdleAthleticStretch(delta);
        break;
      default:
        this.animateIdleDefault(delta);
        break;
    }
  }

  // --- IDLE 1: CYBER PHANTOM (Holographic Wrist HUD & Optic Scanner Diagnostic Loop) ---
  private animateIdleCyberScan(delta: number) {
    const t = this.animTime;
    const breath = Math.sin(t * 2.2);

    // High-tech alert stance (pelvis poised, right foot slightly back)
    this.pelvis.position.y = 1.02 + breath * 0.015;
    this.torso.rotation.set(0.08, 0, 0);
    this.chest.rotation.set(0.04, 0, 0);

    this.leftHip.rotation.set(0.08, 0, 0);
    this.rightHip.rotation.set(-0.12, 0, 0);
    this.leftKnee.rotation.set(0.12, 0, 0);
    this.rightKnee.rotation.set(0.18, 0, 0);

    // Left Arm: Raised in front of chest viewing holographic wrist UI
    this.leftShoulder.rotation.set(-1.18, 0.48, -0.15);
    this.leftElbow.rotation.set(-1.42, 0, 0);

    // Right Arm: Tapping and swiping interactive AR interface in air
    const cycle = t % 5.0;
    if (cycle < 3.2) {
      // Swiping and tapping holographic screen
      const tap = Math.sin(t * 7.5) * 0.08;
      this.rightShoulder.rotation.set(-0.85, -0.32, 0);
      this.rightElbow.rotation.set(-1.08 + tap, 0, 0);

      // Head looking down intently at wrist HUD
      this.head.rotation.set(0.32, -0.22, 0);
    } else {
      // Look up and scan perimeter with optic visor
      this.rightShoulder.rotation.set(-0.3, -0.1, 0);
      this.rightElbow.rotation.set(-0.4, 0, 0);

      // Head scanning left to right
      const scanPan = Math.sin(t * 4.0) * 0.35;
      this.head.rotation.set(-0.05, scanPan, 0);
    }
  }

  // --- IDLE 2: STREET FLARE (B-Boy Breakbeat Swagger & Spraycan Rattle Loop) ---
  private animateIdleHiphopGroove(delta: number) {
    const beat = this.animTime * 4.4;
    const bounce = Math.abs(Math.sin(beat));

    // Deep rhythmic hip-hop bounce
    this.pelvis.position.y = 1.01 + bounce * 0.08;
    this.pelvis.position.x = Math.sin(beat * 0.5) * 0.06;

    // Torso & chest roll with the groove
    this.torso.rotation.set(0.08 + bounce * 0.04, 0, Math.sin(beat * 0.5) * 0.08);
    this.chest.rotation.set(bounce * 0.06, Math.sin(beat * 0.5) * 0.06, 0);

    // Emphatic b-boy head nodding
    this.head.rotation.set(
      Math.sin(beat) * 0.16 + 0.08,
      Math.sin(beat * 0.5) * 0.14,
      Math.sin(beat * 0.5) * 0.06
    );

    // Knees flex to the groove
    this.leftHip.rotation.set(0, 0.1, 0);
    this.rightHip.rotation.set(0, -0.1, 0);
    this.leftKnee.rotation.set(bounce * 0.22, 0, 0);
    this.rightKnee.rotation.set(bounce * 0.22, 0, 0);

    // Right Arm: Shakes spraycan up and down with rapid acoustic rattle motion!
    this.sprayCan.visible = true;
    const shake = Math.sin(this.animTime * 14.0) * 0.22;
    this.rightShoulder.rotation.set(-0.48, -0.12, 0);
    this.rightElbow.rotation.set(-1.18 + shake, 0, 0);

    // Left Arm: Swaggering b-boy hand keeping time with the beat
    this.leftShoulder.rotation.set(-0.42 + Math.sin(beat) * 0.24, 0.26, 0);
    this.leftElbow.rotation.set(-0.72, 0, 0);
  }

  // --- IDLE 3: SHADOW SHINOBI (Martial Arts Kata, Mudra Focus & Parry Stance Loop) ---
  private animateIdleNinjaKata(delta: number) {
    const t = this.animTime;
    const kataTime = t % 6.0;

    // Deep grounded horse stance (lower center of gravity)
    this.pelvis.position.y = 0.94 + Math.sin(t * 1.8) * 0.02;
    this.pelvis.position.x = Math.sin(t * 1.4) * 0.04;

    this.torso.rotation.set(0.14, 0, 0);
    this.chest.rotation.set(0.04, 0, 0);

    // Wide stable stance with bent knees
    this.leftHip.rotation.set(0.14, 0.22, 0);
    this.rightHip.rotation.set(-0.16, -0.22, 0);
    this.leftKnee.rotation.set(0.38, 0, 0);
    this.rightKnee.rotation.set(0.42, 0, 0);

    if (kataTime < 3.2) {
      // Phase 1: Hands meet in front of chest in focused shinobi mudra seal
      this.leftShoulder.rotation.set(-0.82, 0.48, 0);
      this.leftElbow.rotation.set(-1.38, 0, 0);

      this.rightShoulder.rotation.set(-0.82, -0.48, 0);
      this.rightElbow.rotation.set(-1.38, 0, 0);

      // Deep centered breathing
      this.head.rotation.set(0.02, 0, 0);
    } else {
      // Phase 2: Swift martial arts palm block & defensive parry stance
      this.rightShoulder.rotation.set(-1.24, -0.18, 0);
      this.rightElbow.rotation.set(-0.42, 0, 0);

      // Left hand chambered at hip ready to strike
      this.leftShoulder.rotation.set(0.22, 0.18, 0);
      this.leftElbow.rotation.set(-0.95, 0, 0);

      this.head.rotation.set(-0.06, -0.15, 0);
    }
  }

  // --- IDLE 4: SUNSET VAPOR (Dreamy Synthwave Ambient Floating Sway) ---
  private animateIdleVaporFloat(delta: number) {
    const t = this.animTime;
    const float = Math.sin(t * 1.8);

    this.pelvis.position.y = 1.06 + float * 0.04;
    this.torso.rotation.set(0, 0, float * 0.08);
    this.chest.rotation.set(float * 0.04, 0, 0);

    this.head.rotation.set(-0.14, float * 0.16, 0);

    this.leftShoulder.rotation.set(0.08 + float * 0.1, 0, float * 0.12);
    this.rightShoulder.rotation.set(0.08 - float * 0.1, 0, -float * 0.12);
    this.leftElbow.rotation.set(-0.18, 0, 0);
    this.rightElbow.rotation.set(-0.18, 0, 0);

    this.leftHip.rotation.set(0, 0, 0);
    this.rightHip.rotation.set(0, 0, 0);
    this.leftKnee.rotation.set(0, 0, 0);
    this.rightKnee.rotation.set(0, 0, 0);
  }

  // --- IDLE 5: ATHLETIC STRETCH (Dynamic Sprint Warm-Up & Stretch Loop) ---
  private animateIdleAthleticStretch(delta: number) {
    const t = this.animTime;
    const cycle = t % 5.0;

    if (cycle < 2.5) {
      // Dynamic runner hamstring & calf stretch (lowered lunge stance)
      const lungeProgress = Math.sin((cycle / 2.5) * Math.PI);
      this.pelvis.position.y = 0.96 - lungeProgress * 0.08;
      this.torso.rotation.set(0.18 + lungeProgress * 0.12, 0, 0);
      this.chest.rotation.set(0.08, 0, 0);

      this.leftHip.rotation.set(0.35 + lungeProgress * 0.15, 0, 0);
      this.leftKnee.rotation.set(0.45 + lungeProgress * 0.2, 0, 0);
      this.rightHip.rotation.set(-0.25 - lungeProgress * 0.1, 0, 0);
      this.rightKnee.rotation.set(0.1, 0, 0);

      // Hands bracing on front thigh
      this.leftShoulder.rotation.set(-0.7, 0.2, 0);
      this.leftElbow.rotation.set(-0.5, 0, 0);
      this.rightShoulder.rotation.set(-0.7, -0.2, 0);
      this.rightElbow.rotation.set(-0.5, 0, 0);

      this.head.rotation.set(-0.15, 0, 0);
    } else {
      // Shake out wrists & roll shoulders focused forward
      const shakeT = (cycle - 2.5) * 8.0;
      const wristShake = Math.sin(shakeT) * 0.18;
      this.pelvis.position.y = 1.05 + Math.sin(shakeT * 0.5) * 0.015;
      this.torso.rotation.set(0.04, 0, 0);
      this.chest.rotation.set(0.02, 0, 0);

      this.leftHip.rotation.set(0.05, 0, 0);
      this.rightHip.rotation.set(-0.05, 0, 0);
      this.leftKnee.rotation.set(0.1, 0, 0);
      this.rightKnee.rotation.set(0.1, 0, 0);

      this.leftShoulder.rotation.set(-0.35, 0.1, wristShake);
      this.leftElbow.rotation.set(-0.6 + wristShake, 0, 0);
      this.rightShoulder.rotation.set(-0.35, -0.1, -wristShake);
      this.rightElbow.rotation.set(-0.6 - wristShake, 0, 0);

      this.head.rotation.set(0.02, Math.sin(shakeT * 0.3) * 0.08, 0);
    }
  }

  // --- IDLE 6: SKY COMMUTER (Classic Casual Subway Trackside Stance) ---
  private animateIdleDefault(delta: number) {
    const breath = Math.sin(this.animTime * 2.5);
    this.pelvis.position.y = 1.05 + breath * 0.02;
    this.chest.rotation.x = breath * 0.03;
    this.head.rotation.y = Math.sin(this.animTime * 1.2) * 0.1;

    // Relaxed arms
    this.leftShoulder.rotation.x = THREE.MathUtils.lerp(this.leftShoulder.rotation.x, 0.1, delta * 8);
    this.rightShoulder.rotation.x = THREE.MathUtils.lerp(this.rightShoulder.rotation.x, 0.1, delta * 8);
    this.leftElbow.rotation.x = -0.2;
    this.rightElbow.rotation.x = -0.2;

    // Straight legs
    this.leftHip.rotation.x = 0;
    this.leftKnee.rotation.x = 0;
    this.rightHip.rotation.x = 0;
    this.rightKnee.rotation.x = 0;
    this.torso.rotation.x = 0;
  }

  private animateRunning(delta: number, speed: number) {
    const freq = Math.max(12, speed * 0.75); // Stride frequency scales with run speed
    const phase = this.animTime * freq;

    // Hip bobbing
    const bounce = Math.abs(Math.sin(phase));
    this.pelvis.position.y = 1.05 + bounce * 0.12;

    // Torso lean forward into run
    this.torso.rotation.x = 0.22;
    this.chest.rotation.y = Math.sin(phase) * 0.12;

    // Running legs swing
    const legSwing = Math.sin(phase) * 0.85;
    this.leftHip.rotation.x = legSwing;
    this.rightHip.rotation.x = -legSwing;

    // Knee bending (only bends backwards)
    this.leftKnee.rotation.x = Math.max(0, -Math.sin(phase) * 1.1);
    this.rightKnee.rotation.x = Math.max(0, Math.sin(phase) * 1.1);

    // Opposite arms swing
    this.leftShoulder.rotation.x = -legSwing * 0.9;
    this.rightShoulder.rotation.x = legSwing * 0.9;

    this.leftElbow.rotation.x = -0.7 - Math.max(0, -legSwing * 0.4);
    this.rightElbow.rotation.x = -0.7 - Math.max(0, legSwing * 0.4);

    // Head subtle counter-bob
    this.head.rotation.x = -0.15 + bounce * 0.05;
  }

  private animateJumping(delta: number) {
    // Jump pose: tuck knees, arms raise for aerodynamic leap
    this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0.1, delta * 12);
    this.leftHip.rotation.x = THREE.MathUtils.lerp(this.leftHip.rotation.x, 0.9, delta * 14);
    this.rightHip.rotation.x = THREE.MathUtils.lerp(this.rightHip.rotation.x, 0.6, delta * 14);

    this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 1.2, delta * 14);
    this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 1.1, delta * 14);

    this.leftShoulder.rotation.x = THREE.MathUtils.lerp(this.leftShoulder.rotation.x, -1.2, delta * 14);
    this.rightShoulder.rotation.x = THREE.MathUtils.lerp(this.rightShoulder.rotation.x, -1.2, delta * 14);

    this.leftElbow.rotation.x = -0.4;
    this.rightElbow.rotation.x = -0.4;
  }

  private animateSliding(delta: number) {
    // Low slide pose: hips dropped close to rails, back arched low, legs kicked out forward!
    this.pelvis.position.y = THREE.MathUtils.lerp(this.pelvis.position.y, 0.45, delta * 20);
    this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, -0.65, delta * 20);

    // Legs extended forward
    this.leftHip.rotation.x = 1.4;
    this.rightHip.rotation.x = 1.2;
    this.leftKnee.rotation.x = 0.2;
    this.rightKnee.rotation.x = 0.4;

    // Hands out balancing near ground
    this.leftShoulder.rotation.x = 0.7;
    this.rightShoulder.rotation.x = 0.7;
    this.leftShoulder.rotation.z = -0.4;
    this.rightShoulder.rotation.z = 0.4;
    this.leftElbow.rotation.x = -0.5;
    this.rightElbow.rotation.x = -0.5;
  }

  private animateJetpack(delta: number) {
    // Flying superhuman pose
    this.pelvis.position.y = 1.1;
    this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0.6, delta * 10);
    this.head.rotation.x = -0.5; // looking ahead while flying

    // Legs streamlined back
    this.leftHip.rotation.x = -0.4;
    this.rightHip.rotation.x = -0.3;
    this.leftKnee.rotation.x = 0.3;
    this.rightKnee.rotation.x = 0.2;

    // Arms out stabilizing
    this.leftShoulder.rotation.x = -0.4;
    this.rightShoulder.rotation.x = -0.4;
    this.leftShoulder.rotation.z = -0.5;
    this.rightShoulder.rotation.z = 0.5;
  }

  private animateDeath(delta: number) {
    // Tumble crash
    this.rootNode.rotation.x = THREE.MathUtils.lerp(this.rootNode.rotation.x, -Math.PI / 2, delta * 10);
    this.pelvis.position.y = THREE.MathUtils.lerp(this.pelvis.position.y, 0.2, delta * 12);
    this.leftShoulder.rotation.z = -1.2;
    this.rightShoulder.rotation.z = 1.2;
    this.leftHip.rotation.z = -0.6;
    this.rightHip.rotation.z = 0.6;
  }

  public reset() {
    this.animTime = 0;
    this.animState = 'idle';
    this.laneTilt = 0;
    this.rootNode.rotation.set(0, 0, 0);
    this.rootNode.position.set(0, 0, 0);
    this.pelvis.position.set(0, 1.05, 0);
    this.torso.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.setShieldActive(false);
    this.setMagnetActive(false);
    this.setJetpackActive(false);
  }
}
