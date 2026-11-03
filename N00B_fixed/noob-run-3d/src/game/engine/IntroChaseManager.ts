import * as THREE from 'three';
import { SecurityGuardModel } from '../models/SecurityGuardModel';
import { GuardDogModel } from '../models/GuardDogModel';
import { SprayParticleEffect } from '../effects/SprayParticleEffect';
import { CharacterModel } from '../models/CharacterModel';
import { audioManager } from '../audio/AudioManager';
import { TrainFactory } from '../models/TrainModels';
import { GPUParticleSystem } from '../effects/GPUParticleSystem';

export class IntroChaseManager {
  private scene: THREE.Scene;
  public securityGuard: SecurityGuardModel;
  public guardDog: GuardDogModel;
  public sprayEffect: SprayParticleEffect;
  public particleSystem: GPUParticleSystem | null = null;

  // Stationary train carriage used for the spray painting intro
  private parkedTrainGroup: THREE.Group;
  private graffitiDecal: THREE.Mesh;
  private graffitiMat: THREE.MeshBasicMaterial;

  // State
  public isIntroActive = false;
  public isChasing = false;
  public introTimer = 0;
  public chaseTimer = 0;
  private spraySoundTimer = 0;
  private hasBlownWhistle = false;
  private hasBarked = false;

  // Security guard automatic rifle firing state
  private rifleCycleTimer = 0;
  private rifleBurstCount = 0;
  private rifleShotTimer = 0;
  private muzzleWorldPos = new THREE.Vector3();

  // Callbacks
  public onIntroComplete?: () => void;
  public onChaseMessage?: (msg: string | null) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Models
    this.securityGuard = new SecurityGuardModel();
    this.guardDog = new GuardDogModel();
    this.sprayEffect = new SprayParticleEffect(scene);

    this.scene.add(this.securityGuard.group);
    this.scene.add(this.guardDog.group);

    this.securityGuard.group.visible = false;
    this.guardDog.group.visible = false;

    // 2. Parked train for intro spray painting (Stationary Street-Art train at lane +1: x = 3.2)
    this.parkedTrainGroup = new THREE.Group();
    this.parkedTrainGroup.visible = false;
    this.scene.add(this.parkedTrainGroup);

    // Build intro train carriage
    const trainInstance = TrainFactory.createTrain('street_art', 3.0, 0, 0);
    this.parkedTrainGroup.add(trainInstance.mesh);

    // 3. Vibrant Subway Surfers Graffiti Artwork Decal on train side
    const graffitiCanvas = document.createElement('canvas');
    graffitiCanvas.width = 512;
    graffitiCanvas.height = 256;
    const ctx = graffitiCanvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 512, 256);

    // Paint Splatters background
    const splatters = [
      { x: 120, y: 70, r: 35, c: '#06b6d4' },
      { x: 380, y: 90, r: 40, c: '#f43f5e' },
      { x: 250, y: 160, r: 30, c: '#10b981' },
      { x: 420, y: 170, r: 25, c: '#facc15' },
    ];
    splatters.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.c;
      ctx.globalAlpha = 0.55;
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Street Art Tag Bubble Letters: "SUBWAY"
    ctx.save();
    ctx.translate(256, 128);
    ctx.rotate(-0.06);

    // Dark 3D Drop Shadow
    ctx.font = '900 84px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#09090b';
    ctx.fillText('SURF!', 8, 8);

    // Neon Outer Stroke
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#f43f5e';
    ctx.strokeText('SURF!', 0, 0);

    // Inner Radiant Yellow-Cyan Gradient Fill
    const grad = ctx.createLinearGradient(-150, -40, 150, 40);
    grad.addColorStop(0, '#facc15');
    grad.addColorStop(0.5, '#06b6d4');
    grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad;
    ctx.fillText('SURF!', 0, 0);

    // White Top Highlight Shine
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 80px "Impact", "Arial Black", sans-serif';
    ctx.globalAlpha = 0.45;
    ctx.fillText('SURF!', -2, -4);
    ctx.globalAlpha = 1.0;

    // Golden Street Art Crown on top
    ctx.beginPath();
    ctx.moveTo(-50, -55);
    ctx.lineTo(-65, -90);
    ctx.lineTo(-20, -70);
    ctx.lineTo(0, -98);
    ctx.lineTo(20, -70);
    ctx.lineTo(65, -90);
    ctx.lineTo(50, -55);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#09090b';
    ctx.stroke();

    // Drips dripping down
    const drips = [-90, -40, 10, 60, 110];
    drips.forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(dx, 40);
      ctx.lineTo(dx, 75 + Math.abs(dx % 25));
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineCap = 'round';
      ctx.stroke();
    });

    ctx.restore();

    const graffitiTexture = new THREE.CanvasTexture(graffitiCanvas);
    this.graffitiMat = new THREE.MeshBasicMaterial({
      map: graffitiTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.graffitiDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.0),
      this.graffitiMat
    );
    // Positioned on the left side panel of the parked train facing runner
    this.graffitiDecal.position.set(1.76, 1.85, 0.4);
    this.graffitiDecal.rotation.y = -Math.PI / 2;
    this.parkedTrainGroup.add(this.graffitiDecal);
  }

  /**
   * Start the classic Subway Surfers intro sequence
   */
  public startIntro(character: CharacterModel, camera?: THREE.PerspectiveCamera) {
    this.isIntroActive = true;
    this.isChasing = false;
    this.introTimer = 0;
    this.chaseTimer = 0;
    this.spraySoundTimer = 0;
    this.hasBlownWhistle = false;
    this.hasBarked = false;

    // Show parked train with fresh spray tag starting transparent
    this.parkedTrainGroup.visible = true;
    this.graffitiMat.opacity = 0;
    this.graffitiDecal.scale.set(0.2, 0.2, 1);

    // Setup player standing next to the train side, facing the train (+X)
    character.group.position.set(0.95, 0, 0.4);
    character.rootNode.rotation.set(0, Math.PI / 2 + 0.15, 0); // Facing the train
    character.setSprayCanVisible(true);
    character.update(0.016, 0, 'spraying');

    // Position camera BEHIND the player from frame 1:
    // Direct over-the-shoulder perspective from behind the player's back,
    // viewing the runner spraying the train and the vibrant graffiti artwork actively painted on the train carriage
    if (camera) {
      camera.position.set(-0.85, 1.85, 0.4);
      camera.lookAt(2.4, 1.85, 0.45);
    }

    // Setup Security Guard and Dog initially behind
    this.securityGuard.reset();
    this.guardDog.reset();
    this.securityGuard.group.position.set(0.6, 0, -8.0);
    this.securityGuard.group.rotation.set(0, 0, 0);
    this.securityGuard.group.visible = false;

    this.guardDog.group.position.set(-0.5, 0, -9.0);
    this.guardDog.group.rotation.set(0, 0, 0);
    this.guardDog.group.visible = false;

    this.sprayEffect.reset();
    this.onChaseMessage?.('🎨 SPRAYING SUBWAY TAG...');
  }

  /**
   * Skip intro directly into gameplay chase
   */
  public skipIntro(character: CharacterModel) {
    if (!this.isIntroActive) return;
    this.finishIntro(character);
  }

  private finishIntro(character: CharacterModel) {
    this.isIntroActive = false;
    this.parkedTrainGroup.visible = false;
    this.sprayEffect.reset();
    character.setSprayCanVisible(false);
    character.rootNode.rotation.set(0, 0, 0);

    // Start the 6-second chase behind the player!
    this.isChasing = true;
    this.chaseTimer = 0;
    this.securityGuard.group.visible = true;
    this.guardDog.group.visible = true;
    this.securityGuard.setOpacity(1.0);
    this.guardDog.setOpacity(1.0);

    // Initial chase position directly behind runner
    this.securityGuard.group.position.set(character.group.position.x + 0.5, 0, character.group.position.z - 3.4);
    this.guardDog.group.position.set(character.group.position.x - 0.7, 0, character.group.position.z - 2.5);

    this.onChaseMessage?.('🚨 ESCAPE THE INSPECTOR! (6s CHASE)');
    this.onIntroComplete?.();
  }

  /**
   * Update during intro cutscene
   */
  public updateIntro(delta: number, character: CharacterModel, camera: THREE.PerspectiveCamera) {
    this.introTimer += delta;

    // --- PHASE 1: SPRAYING GRAFFITI (0.0s to 1.8s) ---
    if (this.introTimer < 1.8) {
      character.update(delta, 0, 'spraying');

      // Spray paint hiss sound every ~0.25s
      this.spraySoundTimer += delta;
      if (this.spraySoundTimer > 0.22) {
        this.spraySoundTimer = 0;
        audioManager.playSprayCanHiss();
      }

      // Spray particles shoot from spray can nozzle to train side
      const nozzleWorld = new THREE.Vector3();
      character.getSprayNozzleWorldPos(nozzleWorld);
      const sprayTarget = new THREE.Vector3(1.76, 1.85, 0.4);
      this.sprayEffect.setSpray(true, nozzleWorld, sprayTarget);
      this.sprayEffect.update(delta);

      // Graffiti artwork emerges & grows as player paints
      const paintProgress = Math.min(1.0, this.introTimer / 1.5);
      this.graffitiMat.opacity = paintProgress * 0.95;
      const scale = THREE.MathUtils.lerp(0.3, 1.0, paintProgress);
      this.graffitiDecal.scale.set(scale, scale, 1);

      // Camera positioned BEHIND the player:
      // Direct over-the-shoulder view framed from behind the player, showing the runner spraying
      // and the side of the train carriage where the graffiti is clearly visible being painted!
      const camTargetPos = new THREE.Vector3(-0.85, 1.85, 0.4);
      camera.position.lerp(camTargetPos, delta * 4.0);
      camera.lookAt(2.4, 1.85, 0.45);

    // --- PHASE 2: BUSTED! SECURITY & DOG ARRIVE (1.8s to 3.0s) ---
    } else if (this.introTimer < 3.0) {
      this.sprayEffect.setSpray(false);
      this.sprayEffect.update(delta);

      // Play alert whistle & dog bark once
      if (!this.hasBlownWhistle) {
        this.hasBlownWhistle = true;
        audioManager.playWhistle();
        this.onChaseMessage?.('🚨 BUSTED! RUN!!');
      }
      if (!this.hasBarked && this.introTimer > 2.05) {
        this.hasBarked = true;
        audioManager.playDogBark();
      }

      // Player startled animation! Turns head in shock
      character.update(delta, 0, 'startled');

      // Security guard and dog run into view from behind
      this.securityGuard.group.visible = true;
      this.guardDog.group.visible = true;

      const guardTargetZ = -1.6;
      this.securityGuard.group.position.z = THREE.MathUtils.lerp(
        this.securityGuard.group.position.z,
        guardTargetZ,
        delta * 5.5
      );
      this.securityGuard.update(delta, 18, 'whistling');

      const dogTargetZ = -0.8;
      this.guardDog.group.position.z = THREE.MathUtils.lerp(
        this.guardDog.group.position.z,
        dogTargetZ,
        delta * 6.5
      );
      this.guardDog.update(delta, 20, 'barking');

      // Camera smoothly dollies back and centers over tracks to show the chase unfolding
      const behindTrackCam = new THREE.Vector3(0.0, 3.4, -4.6);
      camera.position.lerp(behindTrackCam, delta * 3.8);
      camera.lookAt(0.2, 1.3, 1.2);

    // --- PHASE 3: LEAP ON TRACKS & START CHASE (3.0s+) ---
    } else {
      this.finishIntro(character);
    }
  }

  /**
   * Update during gameplay: Security Guard and Dog chase player for exactly 6.0 seconds!
   */
  public updateChase(delta: number, playerPos: THREE.Vector3, runSpeed: number, isGameOver: boolean) {
    if (!this.isChasing) return;

    this.chaseTimer += delta;

    if (isGameOver) {
      // Caught! Security and dog stop next to fallen player
      this.securityGuard.group.position.z = THREE.MathUtils.lerp(
        this.securityGuard.group.position.z,
        playerPos.z - 0.9,
        delta * 8.0
      );
      this.guardDog.group.position.z = THREE.MathUtils.lerp(
        this.guardDog.group.position.z,
        playerPos.z - 0.3,
        delta * 8.0
      );
      this.securityGuard.update(delta, 0, 'idle');
      this.guardDog.update(delta, 0, 'idle');
      this.onChaseMessage?.('👮 APPREHENDED BY INSPECTOR!');
      return;
    }

    // Active Chase (Duration: 6.0 seconds)
    const CHASE_DURATION = 6.0;

    if (this.chaseTimer < 4.5) {
      // Full speed pursuit directly behind the runner!
      const targetGuardZ = playerPos.z - 3.4;
      const targetDogZ = playerPos.z - 2.5;

      this.securityGuard.group.position.z = THREE.MathUtils.lerp(
        this.securityGuard.group.position.z,
        targetGuardZ,
        delta * 22.0
      );
      this.securityGuard.group.position.x = THREE.MathUtils.lerp(
        this.securityGuard.group.position.x,
        playerPos.x * 0.7 + 0.6,
        delta * 14.0
      );
      this.securityGuard.group.position.y = 0;
      this.securityGuard.update(delta, runSpeed, 'chasing');

      this.guardDog.group.position.z = THREE.MathUtils.lerp(
        this.guardDog.group.position.z,
        targetDogZ,
        delta * 24.0
      );
      this.guardDog.group.position.x = THREE.MathUtils.lerp(
        this.guardDog.group.position.x,
        playerPos.x * 0.7 - 0.7,
        delta * 16.0
      );
      this.guardDog.group.position.y = 0;
      this.guardDog.update(delta, runSpeed, 'running');

      // Occasional reminder sound or message
      const remaining = Math.max(0, Math.ceil(CHASE_DURATION - this.chaseTimer));

      // ==========================================
      // --- SECURITY GUARD AUTO RIFLE BURSTS ---
      // ==========================================
      // The inspector fires in automatic mode bursts, aiming towards the player,
      // but EVERY SINGLE BULLET SAFELY MISSES THE PLAYER!
      this.rifleCycleTimer += delta;

      // Start new burst every 0.85s (starting after 0.6s into chase)
      if (this.chaseTimer > 0.6 && this.rifleBurstCount <= 0 && this.rifleCycleTimer > 0.82) {
        this.rifleCycleTimer = 0;
        this.rifleBurstCount = 4 + Math.floor(Math.random() * 3); // 4-6 rapid shots
        this.rifleShotTimer = 0;
        this.onChaseMessage?.(`🔥 INSPECTOR AUTO-FIRE BURST! (${remaining}s)`);
      }

      // Process rapid auto-burst rounds (11 rounds per second)
      if (this.rifleBurstCount > 0) {
        this.rifleShotTimer += delta;
        if (this.rifleShotTimer >= 0.088) {
          this.rifleShotTimer = 0;
          this.rifleBurstCount--;

          // 1. Muzzle Flash & Rifle Recoil
          this.securityGuard.triggerMuzzleFlash(0.048);

          // 2. Gunshot audio crack
          audioManager.playRifleShot();

          // 3. Bullet tracer whizzing past runner
          if (this.particleSystem) {
            this.securityGuard.getMuzzleWorldPosition(this.muzzleWorldPos);
            // Muzzle smoke & spark puffs
            this.particleSystem.emitSparks(this.muzzleWorldPos, 3, 0.4);

            // Spawn tracer aimed safely past player (never hits!)
            this.particleSystem.spawnRifleTracer(
              this.muzzleWorldPos,
              playerPos,
              (impactPos) => {
                // Audio ricochet ping on ground strike
                audioManager.playRicochet();
              }
            );

            // Subsonic bullet whiz passing runner's ear
            audioManager.playBulletWhiz();
          }
        }
      } else {
        this.onChaseMessage?.(`🚨 INSPECTOR PURSUIT: ${remaining}s`);
      }
    } else if (this.chaseTimer < CHASE_DURATION) {
      // Guard gets exhausted, pants, falls back into the distance and fades out
      const exhaustProgress = (this.chaseTimer - 4.5) / 1.5; // 0 to 1

      // Speed falls behind rapidly (distance increases from 3.4m to 26m)
      const targetGuardZ = playerPos.z - 3.4 - exhaustProgress * 24.0;
      const targetDogZ = playerPos.z - 2.5 - exhaustProgress * 22.0;

      this.securityGuard.group.position.z = THREE.MathUtils.lerp(
        this.securityGuard.group.position.z,
        targetGuardZ,
        delta * 12.0
      );
      this.guardDog.group.position.z = THREE.MathUtils.lerp(
        this.guardDog.group.position.z,
        targetDogZ,
        delta * 12.0
      );

      this.securityGuard.update(delta, runSpeed * (1 - exhaustProgress), 'exhausted');
      this.guardDog.update(delta, runSpeed * (1 - exhaustProgress), 'exhausted');

      // Smooth fade out
      const alpha = 1.0 - exhaustProgress;
      this.securityGuard.setOpacity(alpha);
      this.guardDog.setOpacity(alpha);

      this.onChaseMessage?.('💨 INSPECTOR TIRED OUT! ESCAPED!');

    } else {
      // 6.0 seconds complete: Guard & Dog disappear completely!
      this.isChasing = false;
      this.securityGuard.group.visible = false;
      this.guardDog.group.visible = false;
      this.onChaseMessage?.(null);
    }
  }

  public reset() {
    this.isIntroActive = false;
    this.isChasing = false;
    this.introTimer = 0;
    this.chaseTimer = 0;
    this.rifleCycleTimer = 0;
    this.rifleBurstCount = 0;
    this.rifleShotTimer = 0;
    this.hasBlownWhistle = false;
    this.hasBarked = false;
    this.securityGuard.reset();
    this.securityGuard.group.visible = false;
    this.guardDog.group.visible = false;
    this.parkedTrainGroup.visible = false;
    this.sprayEffect.reset();
  }

  public destroy() {
    this.sprayEffect.destroy();
    this.scene.remove(this.securityGuard.group);
    this.scene.remove(this.guardDog.group);
    this.scene.remove(this.parkedTrainGroup);
  }
}
