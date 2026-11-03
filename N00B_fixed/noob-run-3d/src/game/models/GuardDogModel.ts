import * as THREE from 'three';

export class GuardDogModel {
  public group: THREE.Group;

  // Skeletal Hierarchy
  public rootNode: THREE.Group;
  public pelvis: THREE.Group;
  public spine: THREE.Group;
  public chest: THREE.Group;
  public neck: THREE.Group;
  public head: THREE.Group;
  public tongue: THREE.Mesh;
  public leftEar: THREE.Group;
  public rightEar: THREE.Group;
  public tail: THREE.Group;

  // Four Quadruped Legs
  public frontLeftLeg: THREE.Group;
  public frontLeftPaw: THREE.Mesh;
  public frontRightLeg: THREE.Group;
  public frontRightPaw: THREE.Mesh;

  public rearLeftHip: THREE.Group;
  public rearLeftPaw: THREE.Mesh;
  public rearRightHip: THREE.Group;
  public rearRightPaw: THREE.Mesh;

  private materials: THREE.Material[] = [];
  private animTime = 0;
  public animState: 'idle' | 'running' | 'barking' | 'exhausted' = 'running';

  constructor() {
    this.group = new THREE.Group();
    this.rootNode = new THREE.Group();
    this.group.add(this.rootNode);

    // Dog Coat & Detail Materials
    const furTan = new THREE.MeshStandardMaterial({
      color: 0xc28246, // Classic fawn / caramel bulldog coat
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(furTan);

    const furWhite = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // White chest blaze & muzzle marking
      roughness: 0.75,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(furWhite);

    const collarRed = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Vivid red spiked collar
      roughness: 0.35,
      metalness: 0.2,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(collarRed);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Shiny gold spikes and dog tag
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(goldMat);

    const tonguePink = new THREE.MeshStandardMaterial({
      color: 0xf43f5e, // Bright playful pink tongue
      roughness: 0.3,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(tonguePink);

    const blackNose = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 1,
    });
    this.materials.push(blackNose);

    // --- 1. PELVIS & REAR BODY ---
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, 0.48, -0.22);
    this.rootNode.add(this.pelvis);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.38), furTan);
    pelvisMesh.castShadow = true;
    this.pelvis.add(pelvisMesh);

    // Cute perky curved bulldog tail
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.14, -0.19);
    this.pelvis.add(this.tail);

    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 8), furTan);
    tailMesh.rotation.x = -Math.PI / 4;
    tailMesh.position.set(0, 0.08, -0.06);
    this.tail.add(tailMesh);

    // --- 2. SPINE & BARREL CHEST ---
    this.spine = new THREE.Group();
    this.spine.position.set(0, 0.02, 0.18);
    this.pelvis.add(this.spine);

    this.chest = new THREE.Group();
    this.chest.position.set(0, 0.04, 0.22);
    this.spine.add(this.chest);

    // Broad stocky muscular chest
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.44), furTan);
    chestMesh.castShadow = true;
    this.chest.add(chestMesh);

    // White chest patch
    const chestWhite = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.04), furWhite);
    chestWhite.position.set(0, -0.04, 0.225);
    this.chest.add(chestWhite);

    // --- 3. RED STUDDED COLLAR & GOLD TAG ---
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), collarRed);
    collar.position.set(0, 0.18, 0.18);
    this.chest.add(collar);

    // Gold studs around collar
    [-0.18, 0, 0.18].forEach((sx) => {
      const stud = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 6), goldMat);
      stud.rotation.x = Math.PI / 2;
      stud.position.set(sx, 0.18, 0.38);
      this.chest.add(stud);
    });

    // Gold bone dog tag
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), goldMat);
    tag.rotation.x = Math.PI / 2;
    tag.position.set(0, 0.1, 0.39);
    this.chest.add(tag);

    // --- 4. NECK & HEAD ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.18, 0.18);
    this.chest.add(this.neck);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.12, 0.14);
    this.neck.add(this.head);

    // Bulldog square head
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.38), furTan);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Snout / Muzzle
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), furWhite);
    muzzle.position.set(0, -0.06, 0.24);
    this.head.add(muzzle);

    // Shiny black nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), blackNose);
    nose.position.set(0, 0.02, 0.34);
    this.head.add(nose);

    // Cute lolling pink tongue hanging out
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.18), tonguePink);
    this.tongue.rotation.x = 0.22;
    this.tongue.position.set(0.06, -0.14, 0.3);
    this.head.add(this.tongue);

    // Dark eyes with white highlights
    [-0.14, 0.14].forEach((ex) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x18181b })
      );
      eye.position.set(ex, 0.08, 0.19);
      this.head.add(eye);

      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      glint.position.set(ex + 0.015, 0.095, 0.23);
      this.head.add(glint);
    });

    // Floppy ears
    this.leftEar = new THREE.Group();
    this.leftEar.position.set(-0.21, 0.14, 0);
    this.head.add(this.leftEar);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.14), furTan);
    earL.rotation.z = -0.3;
    earL.position.set(-0.04, -0.08, 0);
    this.leftEar.add(earL);

    this.rightEar = new THREE.Group();
    this.rightEar.position.set(0.21, 0.14, 0);
    this.head.add(this.rightEar);

    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.14), furTan);
    earR.rotation.z = 0.3;
    earR.position.set(0.04, -0.08, 0);
    this.rightEar.add(earR);

    // --- 5. FOUR QUADRUPED RUNNING LEGS ---
    // Front Left Leg
    this.frontLeftLeg = new THREE.Group();
    this.frontLeftLeg.position.set(-0.24, -0.16, 0.12);
    this.chest.add(this.frontLeftLeg);

    const flUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), furTan);
    flUpper.position.y = -0.14;
    this.frontLeftLeg.add(flUpper);

    this.frontLeftPaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), furWhite);
    this.frontLeftPaw.position.set(0, -0.32, 0.03);
    this.frontLeftLeg.add(this.frontLeftPaw);

    // Front Right Leg
    this.frontRightLeg = new THREE.Group();
    this.frontRightLeg.position.set(0.24, -0.16, 0.12);
    this.chest.add(this.frontRightLeg);

    const frUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), furTan);
    frUpper.position.y = -0.14;
    this.frontRightLeg.add(frUpper);

    this.frontRightPaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), furWhite);
    this.frontRightPaw.position.set(0, -0.32, 0.03);
    this.frontRightLeg.add(this.frontRightPaw);

    // Rear Left Leg
    this.rearLeftHip = new THREE.Group();
    this.rearLeftHip.position.set(-0.22, -0.12, 0);
    this.pelvis.add(this.rearLeftHip);

    const rlThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.2), furTan);
    rlThigh.position.y = -0.15;
    this.rearLeftHip.add(rlThigh);

    this.rearLeftPaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), furWhite);
    this.rearLeftPaw.position.set(0, -0.32, 0.03);
    this.rearLeftHip.add(this.rearLeftPaw);

    // Rear Right Leg
    this.rearRightHip = new THREE.Group();
    this.rearRightHip.position.set(0.22, -0.12, 0);
    this.pelvis.add(this.rearRightHip);

    const rrThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.2), furTan);
    rrThigh.position.y = -0.15;
    this.rearRightHip.add(rrThigh);

    this.rearRightPaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), furWhite);
    this.rearRightPaw.position.set(0, -0.32, 0.03);
    this.rearRightHip.add(this.rearRightPaw);
  }

  public setOpacity(alpha: number) {
    const clamped = Math.max(0, Math.min(1, alpha));
    this.materials.forEach((mat) => {
      mat.opacity = clamped;
      mat.transparent = clamped < 0.99;
    });
  }

  public reset() {
    this.animTime = 0;
    this.setOpacity(1.0);
    this.animState = 'running';
    this.rootNode.rotation.set(0, 0, 0);
  }

  public update(delta: number, runSpeed: number, state: 'idle' | 'running' | 'barking' | 'exhausted') {
    this.animState = state;
    this.animTime += delta;

    switch (state) {
      case 'idle':
        this.animateIdle(delta);
        break;
      case 'running':
      case 'barking':
        this.animateRunning(delta, runSpeed);
        break;
      case 'exhausted':
        this.animateExhausted(delta);
        break;
    }
  }

  private animateIdle(delta: number) {
    const t = this.animTime * 2.5;
    this.rootNode.position.y = 0.05 + Math.sin(t) * 0.02;
    this.tail.rotation.y = Math.sin(this.animTime * 6) * 0.35;
    this.head.rotation.y = Math.sin(this.animTime * 1.5) * 0.15;
    this.tongue.position.y = -0.14 + Math.sin(this.animTime * 5) * 0.02;

    this.frontLeftLeg.rotation.x = 0;
    this.frontRightLeg.rotation.x = 0;
    this.rearLeftHip.rotation.x = 0;
    this.rearRightHip.rotation.x = 0;
  }

  private animateRunning(delta: number, speed: number) {
    // Energetic quadruped galloping cycle
    const freq = Math.max(12, Math.min(22, speed * 0.8));
    const phase = this.animTime * freq;

    // Body bounding & spine compression
    const bound = Math.sin(phase);
    this.rootNode.position.y = 0.08 + Math.abs(bound) * 0.12;
    this.spine.rotation.x = bound * 0.18;

    // Front legs swing (paired with slight phase offset)
    this.frontLeftLeg.rotation.x = Math.sin(phase) * 0.95;
    this.frontRightLeg.rotation.x = Math.sin(phase + 0.35) * 0.95;

    // Rear legs kick backwards to propel
    this.rearLeftHip.rotation.x = -Math.sin(phase) * 0.9;
    this.rearRightHip.rotation.x = -Math.sin(phase + 0.35) * 0.9;

    // Head bobs eagerly
    this.head.rotation.x = -0.1 + bound * 0.15;

    // Floppy ears flap up and down
    const earFlap = -Math.abs(bound) * 0.45;
    this.leftEar.rotation.z = -0.2 + earFlap;
    this.rightEar.rotation.z = 0.2 - earFlap;

    // Perky tail wags at double speed!
    this.tail.rotation.y = Math.sin(phase * 1.8) * 0.6;
    this.tail.rotation.x = 0.2 + Math.abs(bound) * 0.2;

    // Tongue pants in and out
    this.tongue.scale.z = 0.9 + Math.sin(phase * 2) * 0.25;
  }

  private animateExhausted(delta: number) {
    // Panting trot, head drooping, tail low
    const t = this.animTime * 4;
    this.rootNode.position.y = 0.04;
    this.head.rotation.x = 0.25 + Math.sin(t) * 0.1; // Head low
    this.spine.rotation.x = 0.1;

    const trot = Math.sin(t) * 0.35;
    this.frontLeftLeg.rotation.x = trot;
    this.frontRightLeg.rotation.x = -trot;
    this.rearLeftHip.rotation.x = -trot;
    this.rearRightHip.rotation.x = trot;

    this.tail.rotation.y = Math.sin(t) * 0.2;
    this.tail.rotation.x = -0.3; // Tail hanging down
  }
}
