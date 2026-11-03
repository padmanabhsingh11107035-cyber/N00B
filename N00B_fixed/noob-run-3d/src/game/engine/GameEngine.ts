import * as THREE from 'three';
import {
  GameState,
  Lane,
  LANE_WIDTH,
  PowerUpType,
  PowerUpActive,
  PlayerStats,
  GameSettings,
  NoobRunCallbacks,
  ComboEvent,
} from '../types';
import { CharacterModel } from '../models/CharacterModel';
import { TrackManager } from '../world/TrackManager';
import { audioManager } from '../audio/AudioManager';
import { MissionService } from '../services/MissionService';
import { SkyboxManager } from '../world/SkyboxManager';
import { SpeedTrailEffect } from '../effects/SpeedTrailEffect';
import { WeatherManager } from '../world/WeatherManager';
import { IntroChaseManager } from './IntroChaseManager';
import { SkinService } from '../services/SkinService';
import { CharacterSkin } from '../types';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GPUParticleSystem } from '../effects/GPUParticleSystem';
import { CoinParticleSystem } from '../effects/CoinParticleSystem';
import { JetpackExhaustSystem } from '../effects/JetpackExhaustSystem';
import { CoinInstance } from '../models/CollectibleModels';
import { InputHandler } from './InputHandler';

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  // Lighting
  private dirLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private tunnelTransition = 0; // 0 = outdoor daylight, 1 = deep subway tunnel

  // World & Entities
  public trackManager: TrackManager;
  public character: CharacterModel;
  public skyboxManager: SkyboxManager;
  public speedTrail: SpeedTrailEffect;
  public weatherManager: WeatherManager;
  public introChaseManager: IntroChaseManager;
  public particleSystem: GPUParticleSystem;
  public coinParticles: CoinParticleSystem;
  public jetpackExhaust: JetpackExhaustSystem;
  public inputHandler: InputHandler;

  // Game Loop State
  public gameState: GameState = 'menu';
  private animationFrameId: number | null = null;
  private lastTime = 0;

  // Player Physics & Movement
  public playerLane: Lane = 0; // -1, 0, 1
  public playerPos = new THREE.Vector3(0, 0, 0);
  public playerVelocityY = 0;
  public isJumping = false;
  public isSliding = false;
  public slideTimer = 0;
  public maxSlideDuration = 0.58; // Snappy slide duration for fluid chains
  public jumpVelocity = 16.5; // Fast, snappy jump velocity
  public gravity = -48.0; // Crisp arcade gravity

  // Speed and Difficulty Progression
  public baseSpeed = 26.0; // Fast initial sprint speed
  public currentSpeed = 26.0;
  public maxSpeed = 50.0; // Exhilarating top speed

  // Reusable scratch objects to eliminate GC stutter during 60/120fps gameplay
  private playerHitbox = new THREE.Box3();
  private lookTarget = new THREE.Vector3();

  // Jetpack & Boost state
  public isJetpackActive = false;
  public jetpackTargetY = 16.0;
  public isBoostActive = false;
  public invulnerableTimer = 0; // Flash invulnerability after shield break

  // Active Power-ups
  public activePowerUps: Map<PowerUpType, PowerUpActive> = new Map();

  // Combo Multiplier System
  public comboCount = 0;
  public comboMultiplier = 1;
  public comboTimer = 0;
  public comboMaxTimer = 3.8;
  public lastComboManeuver: ComboEvent | null = null;

  // Run Stats
  public stats: PlayerStats = {
    score: 0,
    distance: 0,
    coins: 0,
    multiplier: 1,
    trainsDodged: 0,
    powerUpsUsed: 0,
    comboCount: 0,
    comboMultiplier: 1,
    comboTimer: 0,
    comboMaxTimer: 3.8,
  };

  // High Scores & Saves
  public bestScore = 0;
  public bestDistance = 0;
  public totalCoins = 0;

  // Settings
  public settings: GameSettings = {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    quality: 'high',
    vibration: true,
    showFps: true,
  };

  // FPS meter & throttling
  public fps = 60;
  private frameCount = 0;
  private fpsTimer = 0;
  private statsUpdateTimer = 0;

  // Callbacks to parent
  public callbacks: NoobRunCallbacks = {};
  public onStateChange?: (state: GameState) => void;
  public onStatsUpdate?: (stats: PlayerStats) => void;
  public onPowerUpsUpdate?: (powerUps: PowerUpActive[]) => void;
  public onSkyThemeChange?: (theme: { name: string; badge: string; icon: string; timeOfDay?: string }) => void;
  public onComboUpdate?: (combo: ComboEvent) => void;

  // Bound event handlers
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onResizeBound: () => void;

  constructor(canvas: HTMLCanvasElement, callbacks: NoobRunCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    // Load saved data
    this.loadStorage();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbae6fd); // Daylight azure
    this.scene.fog = new THREE.Fog(0xbae6fd, 80, 520); // Atmospheric depth fog

    // 2. Camera setup (800m far plane to capture mountain ranges and skybox)
    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 800);
    this.camera.position.set(0, 4.2, -7.5);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.applyQualitySettings(this.settings.quality);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    // 3b. High-Fidelity RTX Bloom Pass (Tuned so only true emissive elements glow, without washing out tracks or trains)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomW = Math.max(256, Math.floor((canvas.clientWidth || 800) * 0.5));
    const bloomH = Math.max(256, Math.floor((canvas.clientHeight || 600) * 0.5));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      0.26, // strength: crisp, vibrant neon glow without blinding haziness
      0.22, // radius: tight, controlled halo
      1.15  // threshold: protects regular diffuse geometry from blooming
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // 4. Lighting setup (Balanced high-contrast arcade lighting with crisp shadows)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.45);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.25);
    this.dirLight.position.set(25, 45, -20);
    this.dirLight.castShadow = this.settings.quality !== 'low';
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 140;
    this.dirLight.shadow.camera.left = -22;
    this.dirLight.shadow.camera.right = 22;
    this.dirLight.shadow.camera.top = 22;
    this.dirLight.shadow.camera.bottom = -22;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Specular Rim Light for clean edge highlights on oncoming trains & player
    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    this.rimLight.position.set(-25, 20, 20);
    this.scene.add(this.rimLight);

    // 5. Procedural Skybox Manager
    this.skyboxManager = new SkyboxManager(this.scene);
    this.skyboxManager.onThemeChange = (theme) => {
      this.onSkyThemeChange?.(theme);
    };

    // 6. Track Manager
    this.trackManager = new TrackManager(this.scene);

    // 7. Character (Loaded from persistent storage)
    const savedModelId = SkinService.getSelectedCharacterId();
    const savedSkinId = SkinService.getSelectedSkinId();
    const allSkins = SkinService.loadSkins();
    const savedSkin = allSkins.find((s) => s.id === savedSkinId);

    this.character = new CharacterModel(savedSkin, savedModelId);
    this.scene.add(this.character.group);

    // 8. Dynamic Weather Atmosphere System (Periodic Rain, Fog & Clear Skies)
    this.weatherManager = new WeatherManager(this.scene);
    this.weatherManager.onWeatherChange = (weather) => {
      this.callbacks.onWeatherUpdate?.(weather);
    };

    // 9. Particle Running Trail System (Speed Boost & Jetpack Points Effect)
    this.speedTrail = new SpeedTrailEffect(this.scene);

    // 10. GPU-Accelerated High-Performance Particle System (Dust kicks, sparks, trails, bullet tracers)
    this.particleSystem = new GPUParticleSystem(this.scene);

    // 11. Dedicated Jetpack Rocket Exhaust & Coin Collection Particle Systems
    this.coinParticles = new CoinParticleSystem(this.scene);
    this.jetpackExhaust = new JetpackExhaustSystem(this.scene);

    // 11. Classic Subway Surfers Intro Sequence & Security Guard Chase
    this.introChaseManager = new IntroChaseManager(this.scene);
    this.introChaseManager.particleSystem = this.particleSystem;
    this.introChaseManager.onIntroComplete = () => {
      this.handleIntroFinished();
    };
    this.introChaseManager.onChaseMessage = (msg) => {
      this.callbacks.onChaseMessage?.(msg);
    };

    // 11. Event listeners & InputHandler
    this.inputHandler = new InputHandler({
      moveLeft: () => this.moveLeft(),
      moveRight: () => this.moveRight(),
      jump: () => this.jump(),
      slide: () => this.slide(),
      pauseGame: () => this.pauseGame(),
      resumeGame: () => this.resumeGame(),
      cycleWeather: () => this.cycleWeather(),
      getGameState: () => this.gameState,
    });
    this.inputHandler.attach();

    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onResizeBound = this.handleResize.bind(this);

    window.addEventListener('resize', this.onResizeBound);

    // Initialize track
    this.trackManager.init();
    this.resetPlayerToStart();

    // Start render loop
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private loadStorage() {
    try {
      const savedScore = localStorage.getItem('noob_run_best_score');
      if (savedScore) this.bestScore = parseInt(savedScore, 10) || 0;

      const savedDist = localStorage.getItem('noob_run_best_dist');
      if (savedDist) this.bestDistance = parseInt(savedDist, 10) || 0;

      const savedCoins = localStorage.getItem('noob_run_total_coins');
      if (savedCoins) this.totalCoins = parseInt(savedCoins, 10) || 0;

      const savedSettings = localStorage.getItem('noob_run_settings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }
    } catch {
      // ignore
    }
  }

  public saveStorage() {
    try {
      localStorage.setItem('noob_run_best_score', this.bestScore.toString());
      localStorage.setItem('noob_run_best_dist', this.bestDistance.toString());
      localStorage.setItem('noob_run_total_coins', this.totalCoins.toString());
      localStorage.setItem('noob_run_settings', JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  public applyQualitySettings(quality: 'low' | 'medium' | 'high') {
    this.settings.quality = quality;
    const pr = window.devicePixelRatio || 1;

    if (quality === 'high') {
      this.renderer.setPixelRatio(Math.min(pr, 1.25));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (this.dirLight) {
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.bias = -0.0004;
      }
      if (this.bloomPass) this.bloomPass.strength = 0.65;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(pr, 1.0));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      if (this.dirLight) {
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 512;
        this.dirLight.shadow.mapSize.height = 512;
      }
      if (this.bloomPass) this.bloomPass.strength = 0.45;
    } else {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = false;
      if (this.dirLight) this.dirLight.castShadow = false;
      if (this.bloomPass) this.bloomPass.strength = 0;
    }
  }

  // --- Game Lifecycle ---

  public startGame() {
    this.trackManager.init();
    this.skyboxManager.reset();
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.lastComboManeuver = null;
    this.stats = {
      score: 0,
      distance: 0,
      coins: 0,
      multiplier: 1,
      trainsDodged: 0,
      powerUpsUsed: 0,
      comboCount: 0,
      comboMultiplier: 1,
      comboTimer: 0,
      comboMaxTimer: 3.8,
    };
    this.activePowerUps.clear();
    this.isJetpackActive = false;
    this.isBoostActive = false;
    this.invulnerableTimer = 0;
    this.currentSpeed = this.baseSpeed;
    this.particleSystem.reset();
    this.coinParticles.reset();
    this.jetpackExhaust.reset();

    // Start classic Subway Surfers intro sequence!
    this.setGameState('intro');
    audioManager.stopMusic();
    this.introChaseManager.startIntro(this.character, this.camera);

    this.callbacks.onGameStart?.();
  }

  public skipIntro() {
    if (this.gameState === 'intro') {
      this.introChaseManager.skipIntro(this.character);
    }
  }

  private handleIntroFinished() {
    this.resetPlayerToStart();
    this.setGameState('playing');
    audioManager.startMusic();
  }

  public pauseGame() {
    if (this.gameState === 'playing') {
      this.setGameState('paused');
      audioManager.stopMusic();
    }
  }

  public resumeGame() {
    if (this.gameState === 'paused') {
      this.setGameState('playing');
      audioManager.startMusic();
    }
  }

  public triggerGameOver() {
    if (this.gameState === 'gameover') return;
    this.setGameState('gameover');
    audioManager.stopMusic();
    audioManager.playCrash();

    // Calculate record and rewards
    const isNewRecord = this.stats.score > this.bestScore;
    if (isNewRecord) {
      this.bestScore = this.stats.score;
    }
    if (this.stats.distance > this.bestDistance) {
      this.bestDistance = this.stats.distance;
    }
    this.totalCoins += this.stats.coins;
    this.saveStorage();

    // Process missions & achievements
    const missions = MissionService.loadMissions();
    const achievements = MissionService.loadAchievements();
    const runResults = MissionService.processRunResults(this.stats, this.totalCoins, missions, achievements);

    const xpEarned = Math.floor(this.stats.score / 15) + this.stats.coins * 3 + runResults.bonusXP;
    this.totalCoins += runResults.bonusCoins;
    this.saveStorage();

    this.character.update(0.016, 0, 'death');

    this.callbacks.onGameOver?.({
      score: this.stats.score,
      distance: this.stats.distance,
      coins: this.stats.coins + runResults.bonusCoins,
      isNewRecord,
      xpEarned,
    });
  }

  private setGameState(newState: GameState) {
    this.gameState = newState;
    this.onStateChange?.(newState);
  }

  private resetPlayerToStart() {
    this.playerLane = 0;
    this.playerPos.set(0, 0, 0);
    this.playerVelocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.character.reset();
    this.speedTrail?.reset();
    this.coinParticles?.reset();
    this.jetpackExhaust?.reset();
  }

  // --- Player Input Controls (Keyboard & Swipes) ---
  private lastLaneChangeTime = 0;

  public moveLeft() {
    if (this.gameState !== 'playing') return;
    const now = performance.now();
    if (now - this.lastLaneChangeTime < 140) return;
    if (this.playerLane > -1) {
      this.lastLaneChangeTime = now;
      this.playerLane = (this.playerLane - 1) as Lane;
      audioManager.playLaneSwitch();
      this.character.setLaneTilt(-0.35); // Leans left (towards screen left)
    }
  }

  public moveRight() {
    if (this.gameState !== 'playing') return;
    const now = performance.now();
    if (now - this.lastLaneChangeTime < 140) return;
    if (this.playerLane < 1) {
      this.lastLaneChangeTime = now;
      this.playerLane = (this.playerLane + 1) as Lane;
      audioManager.playLaneSwitch();
      this.character.setLaneTilt(0.35); // Leans right (towards screen right)
    }
  }

  public jump() {
    if (this.gameState !== 'playing') return;
    if (this.isJetpackActive) return; // Jetpack mode flies continuously

    // Immediate slide-to-jump cancel for responsive chaining
    if (this.isSliding) {
      this.isSliding = false;
      this.slideTimer = 0;
    }

    if (!this.isJumping) {
      this.isJumping = true;
      this.playerVelocityY = this.jumpVelocity;
      audioManager.playJump();
    }
  }

  public slide() {
    if (this.gameState !== 'playing') return;
    if (this.isJetpackActive) return;

    // Fast downward dive if currently in air for instant ground control
    if (this.isJumping) {
      this.playerVelocityY = -34.0;
    }

    this.isSliding = true;
    this.slideTimer = this.maxSlideDuration;
    audioManager.playSlide();
  }

  // --- Combo Multiplier Maneuver Dispatcher ---

  public registerManeuver(type: string, label: string) {
    if (this.gameState !== 'playing') return;

    // Increment consecutive successful tricks combo counter
    this.comboCount++;
    this.comboTimer = this.comboMaxTimer;

    // Escalating combo multiplier based on consecutive maneuvers in quick succession:
    // 1st maneuver: x2
    // 2nd maneuver: x3
    // 3rd maneuver: x4
    // 4th maneuver: x5
    // 5th maneuver: x6
    // 6+ maneuvers: up to x8 max
    this.comboMultiplier = Math.min(8, 1 + this.comboCount);

    // Instant trick score bonus amplified by combo multiplier
    const trickBonus = 120 * this.comboMultiplier;
    this.stats.score += trickBonus;

    // Play triumphant combo audio chime with escalating pitch
    audioManager.playCombo(this.comboCount);

    this.lastComboManeuver = {
      label,
      combo: this.comboCount,
      multiplier: this.comboMultiplier,
      timestamp: Date.now(),
    };

    this.stats.comboCount = this.comboCount;
    this.stats.comboMultiplier = this.comboMultiplier;
    this.stats.comboTimer = this.comboTimer;
    this.stats.comboMaxTimer = this.comboMaxTimer;
    this.stats.lastComboAction = label;

    this.onComboUpdate?.(this.lastComboManeuver);
    this.callbacks.onComboUpdate?.(this.lastComboManeuver);
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Only capture keys if not typing in an input
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.moveLeft();
        break;

      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.moveRight();
        break;

      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        e.preventDefault();
        this.jump();
        break;

      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.slide();
        break;

      case 'Escape':
      case 'p':
      case 'P':
        e.preventDefault();
        if (this.gameState === 'playing') this.pauseGame();
        else if (this.gameState === 'paused') this.resumeGame();
        break;

      case 't':
      case 'T':
        // Atmospheric weather toggle shortcut
        e.preventDefault();
        this.cycleWeather();
        break;
    }
  }

  // --- Main Game Loop ---

  private loop(time: number) {
    this.animationFrameId = requestAnimationFrame(this.loop);

    const delta = Math.min((time - this.lastTime) / 1000, 0.05); // Clamp max delta
    this.lastTime = time;

    // FPS measurement
    this.frameCount++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (this.gameState === 'intro') {
      this.introChaseManager.updateIntro(delta, this.character, this.camera);
    } else if (this.gameState === 'playing') {
      this.updatePhysics(delta);
      this.updatePowerUps(delta);
      this.checkCollisions();
      this.updateProgression(delta);
      const activeSpeed = this.isBoostActive ? this.currentSpeed * 1.65 : this.currentSpeed;
      this.introChaseManager.updateChase(delta, this.playerPos, activeSpeed, false);
    } else if (this.gameState === 'menu') {
      // Idle animation on title screen
      this.character.update(delta, 0, 'idle');
    } else if (this.gameState === 'gameover') {
      this.introChaseManager.updateChase(delta, this.playerPos, 0, true);
      this.speedTrail.update(delta, this.playerPos, 0, false, false, this.character);
    } else {
      // Paused: allow trailing particles to fade and dissipate naturally
      this.speedTrail.update(delta, this.playerPos, 0, false, false, this.character);
    }

    // Procedural skybox progressive day-to-night color transition & orbital sun/moon lighting updates
    this.skyboxManager.update(
      delta,
      this.stats.distance,
      this.playerPos,
      this.dirLight,
      this.ambientLight,
      this.hemiLight,
      this.rimLight
    );

    // Subway Tunnel Atmospheric Lighting Transition (RTX Subterranean Lighting with Clear Sightlines)
    let inTunnel = false;
    for (const seg of this.trackManager.segments) {
      if (this.playerPos.z >= seg.startZ && this.playerPos.z <= seg.endZ && seg.theme === 'tunnel') {
        inTunnel = true;
        break;
      }
    }

    const targetTunnelTransition = inTunnel ? 1.0 : 0.0;
    this.tunnelTransition = THREE.MathUtils.lerp(this.tunnelTransition, targetTunnelTransition, delta * 3.5);

    // Dynamic tunnel illumination that seamlessly blends with the active day-to-night lighting & shadow system
    const tunnelSunScale = 1.0 - 0.22 * this.tunnelTransition;
    const tunnelAmbientScale = 1.0 - 0.15 * this.tunnelTransition;
    const tunnelHemiScale = 1.0 - 0.18 * this.tunnelTransition;

    this.dirLight.intensity = this.skyboxManager.currentSunIntensity * tunnelSunScale;
    this.ambientLight.intensity = this.skyboxManager.currentAmbientIntensity * tunnelAmbientScale;
    this.hemiLight.intensity = this.skyboxManager.currentHemiIntensity * tunnelHemiScale;

    // Specular Rim Light for edge highlights (sun/moon/sunset specular)
    this.rimLight.color.copy(this.skyboxManager.currentRimColor);
    this.rimLight.intensity = this.skyboxManager.currentRimIntensity * (1.0 - 0.3 * this.tunnelTransition);

    // Dynamic shadow softness & intensity
    if (this.dirLight.shadow) {
      this.dirLight.shadow.radius = this.skyboxManager.currentShadowRadius;
    }

    // Keep expansive fog distances so players can see through the corridor with atmospheric day/night fog
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = THREE.MathUtils.lerp(this.skyboxManager.currentFogNear, 140, this.tunnelTransition);
      this.scene.fog.far = THREE.MathUtils.lerp(this.skyboxManager.currentFogFar, 650, this.tunnelTransition);
    }

    // Dynamic Weather Update (Atmospheric Rain drops, wet splashes, drifting mist, and Ambient Light modification)
    this.weatherManager.update(
      delta,
      this.playerPos,
      inTunnel,
      this.camera,
      this.scene.fog instanceof THREE.Fog ? this.scene.fog : null,
      this.ambientLight,
      this.hemiLight,
      this.dirLight
    );

    // Dynamic GPU Particle System Update (Dust kicks, sparks, trails, bullet tracers)
    this.particleSystem.update(delta, (impactPos) => {
      audioManager.playRicochet();
    });

    // High-Octane Coin Collection & Supersonic Jetpack Exhaust Particle Systems
    const currentActiveSpeed = this.isBoostActive ? this.currentSpeed * 1.65 : this.currentSpeed;
    this.jetpackExhaust.update(
      delta,
      this.playerPos,
      this.gameState === 'playing' ? currentActiveSpeed : 0,
      this.gameState === 'playing' && this.isJetpackActive,
      this.character
    );
    this.coinParticles.update(delta, this.camera);

    // Camera follow & render (only update standard third-person camera outside intro cutscene)
    if (this.gameState !== 'intro') {
      this.updateCamera(delta);
    }

    // High-Fidelity RTX Bloom Rendering (radiant glow on coins, neon, power-ups, sparks, and muzzle flashes)
    if (this.composer && this.settings.quality !== 'low') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // --- Physics & Kinematics Update ---

  private updatePhysics(delta: number) {
    // 1. Forward progression along Z
    const activeSpeed = this.isBoostActive ? this.currentSpeed * 1.65 : this.currentSpeed;
    this.playerPos.z += activeSpeed * delta;

    // 2. Lateral Lane Interpolation (X)
    // Frame-rate independent exponential smoothing prevents any hitch, rubberbanding, or overshoot
    const targetX = -this.playerLane * LANE_WIDTH;
    const laneEase = 1.0 - Math.exp(-22.0 * delta);
    this.playerPos.x = THREE.MathUtils.lerp(this.playerPos.x, targetX, laneEase);
    if (Math.abs(this.playerPos.x - targetX) < 0.04) {
      this.playerPos.x = targetX;
      this.character.setLaneTilt(0);
    }

    // 3. Vertical Physics (Y)
    if (this.isJetpackActive) {
      // Smoothly ascend to skyway altitude
      this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, this.jetpackTargetY, delta * 6.0);
      this.playerVelocityY = 0;
      this.isJumping = false;
      this.isSliding = false;
    } else {
      // Calculate current ground altitude (ground = 0, or wooden ramp, or train roof)
      let currentGroundY = 0;
      const playerZ = this.playerPos.z;
      for (const seg of this.trackManager.segments) {
        // Fast spatial cull: skip distant segments
        if (playerZ < seg.startZ - 10 || playerZ > seg.endZ + 10) continue;
        // 1. Ramps
        if (seg.ramps) {
          for (const ramp of seg.ramps) {
            if (
              Math.abs(this.playerPos.x - ramp.laneX) < 1.65 &&
              this.playerPos.z >= ramp.startZ - 0.4 &&
              this.playerPos.z <= ramp.endZ + 1.0
            ) {
              const progress = Math.min(1.0, Math.max(0.0, (this.playerPos.z - ramp.startZ) / (ramp.endZ - ramp.startZ)));
              const rampY = progress * ramp.height;
              currentGroundY = Math.max(currentGroundY, rampY);
            }
          }
        }

        // 2. Train Roofs
        for (const train of seg.trains) {
          const trainFrontZ = train.mesh.position.z - train.length / 2;
          const trainBackZ = train.mesh.position.z + train.length / 2;
          const isInTrainLane = Math.abs(this.playerPos.x - train.lane) < 1.65;

          if (
            isInTrainLane &&
            this.playerPos.z >= trainFrontZ - 0.8 &&
            this.playerPos.z <= trainBackZ + 0.8
          ) {
            // If train has a climb ramp or player is approaching/on roof, ground is the roof
            if (train.hasRamp || this.playerPos.y >= train.height - 0.95) {
              currentGroundY = Math.max(currentGroundY, train.height);
            }
          }
        }
      }

      // Vertical kinematic physics
      if (this.isJumping) {
        this.playerVelocityY += this.gravity * delta;
        this.playerPos.y += this.playerVelocityY * delta;

        // Ground / roof landing check
        if (this.playerPos.y <= currentGroundY) {
          this.playerPos.y = currentGroundY;
          this.playerVelocityY = 0;
          this.isJumping = false;
          audioManager.playLand();
        }
      } else {
        // Grounded running: firmly and instantly stick to ramp surface or train roof!
        if (this.playerPos.y < currentGroundY) {
          this.playerPos.y = currentGroundY;
          this.playerVelocityY = 0;
        } else if (this.playerPos.y > currentGroundY) {
          // Stepped off roof or end of ramp - fall under gravity!
          this.playerVelocityY += this.gravity * delta;
          this.playerPos.y += this.playerVelocityY * delta;
          if (this.playerPos.y <= currentGroundY) {
            this.playerPos.y = currentGroundY;
            this.playerVelocityY = 0;
            audioManager.playLand();
          }
        } else {
          this.playerVelocityY = 0;
        }
      }

      // Slide countdown
      if (this.isSliding) {
        this.slideTimer -= delta;
        if (this.slideTimer <= 0) {
          this.isSliding = false;
        }
      }
    }

    // Update character model position in scene
    this.character.group.position.copy(this.playerPos);

    // Animation pose state
    let animState: 'idle' | 'running' | 'jumping' | 'sliding' | 'death' = 'running';
    if (this.isSliding) animState = 'sliding';
    else if (this.isJumping) animState = 'jumping';

    this.character.update(delta, activeSpeed, animState);

    // 1. GPU Dust Kicks behind running sneakers on the ballast track
    if (!this.isJumping && !this.isJetpackActive && this.playerPos.y <= 0.25) {
      this.particleSystem.emitDustKick(this.playerPos, activeSpeed, 2);
    }

    // 2. GPU Radiant Glowing Trail during Speed Boost power-up
    if (this.isBoostActive) {
      this.particleSystem.emitTrail(this.playerPos, 'boost', 4);
    }

    // Particle-based running trail effect (Speed Boost & Jetpack points)
    this.speedTrail.update(
      delta,
      this.playerPos,
      activeSpeed,
      this.isBoostActive,
      this.isJetpackActive,
      this.character
    );

    // Update track segments ahead/behind player with current speed and progressive distance
    const isMagnetActive = this.activePowerUps.has('magnet');
    this.trackManager.update(
      this.playerPos.z,
      delta,
      this.playerPos,
      isMagnetActive,
      this.currentSpeed,
      this.stats.distance
    );

    // Invulnerability timer countdown
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= delta;
      // Flash character visibility
      this.character.group.visible = Math.floor(timeNow() * 20) % 2 === 0;
    } else {
      this.character.group.visible = true;
    }
  }

  // --- Collision Detection ---

  private checkCollisions() {
    if (this.invulnerableTimer > 0) return;

    // 0. JETPACK SUPREME FLIGHT:
    // When Jetpack is active, the runner is soaring in the stratosphere (Y = 16.0m)
    // completely above all lines, tracks, wires, bridges, obstacles, and double-decker trains!
    // Absolute invulnerability: zero crashes, zero collapses!
    if (this.isJetpackActive) {
      const pZ = this.playerPos.z;
      for (const seg of this.trackManager.segments) {
        if (seg.endZ < pZ - 10 || seg.startZ > pZ + 50) continue;
        // Collect coins in flight
        for (const coin of seg.coins) {
          if (!coin.collected) {
            const dx = Math.abs(coin.mesh.position.x - this.playerPos.x);
            const dy = Math.abs(coin.mesh.position.y - this.playerPos.y);
            const dz = Math.abs(coin.mesh.position.z - this.playerPos.z);
            if ((dx < 1.8 && dy < 3.2 && dz < 2.5) || this.playerHitbox.intersectsBox(coin.boundingBox)) {
              this.collectCoin(coin);
            }
          }
        }
        // Collect sky power-ups in flight
        for (const p of seg.powerUps) {
          if (!p.collected) {
            const dx = Math.abs(p.mesh.position.x - this.playerPos.x);
            const dy = Math.abs(p.mesh.position.y - this.playerPos.y);
            const dz = Math.abs(p.mesh.position.z - this.playerPos.z);
            if ((dx < 1.8 && dy < 3.2 && dz < 2.5) || this.playerHitbox.intersectsBox(p.boundingBox)) {
              p.collected = true;
              p.mesh.visible = false;
              this.activatePowerUp(p.type);
              audioManager.playPowerUp();
              this.stats.powerUpsUsed++;
            }
          }
        }
      }
      return; // Skip all hazard and train collisions entirely during jetpack!
    }

    // Calculate player 3D hitbox using reusable Box3
    const halfWidth = 0.45;
    const halfDepth = 0.45;

    let height = 2.0;
    let minY = this.playerPos.y;

    if (this.isSliding) {
      height = 0.65;
    }

    this.playerHitbox.min.set(
      this.playerPos.x - halfWidth,
      minY,
      this.playerPos.z - halfDepth
    );
    this.playerHitbox.max.set(
      this.playerPos.x + halfWidth,
      minY + height,
      this.playerPos.z + halfDepth
    );

    // Iterate through active segments with spatial proximity filter
    for (const seg of this.trackManager.segments) {
      // Spatial segment culling: only check segments within close reach of the runner
      if (seg.endZ < this.playerPos.z - 35 || seg.startZ > this.playerPos.z + 85) {
        continue;
      }

      // 1. Train Collisions
      for (const train of seg.trains) {
        if (train.cleared || train.boundingBox.isEmpty()) continue;

        // Skip distant trains dynamically accounting for train length (up to 78m!)
        const distToTrainZ = Math.abs(train.mesh.position.z - this.playerPos.z);
        if (distToTrainZ > train.length / 2 + 35.0) continue;

        // Warning horn & train rumble when oncoming train approaches within 45m
        if (!train.hasWarnedHorn && train.speed > 0) {
          const distZ = (train.mesh.position.z - train.length / 2) - this.playerPos.z;
          if (distZ > 0 && distZ < 45) {
            train.hasWarnedHorn = true;
            audioManager.playTrainHorn();
            audioManager.playTrainRumble();
          }
        }

        const trainFrontZ = train.mesh.position.z - train.length / 2;
        const trainBackZ = train.mesh.position.z + train.length / 2;
        const isInTrainLane = Math.abs(this.playerPos.x - train.lane) < 1.65;

        if (isInTrainLane) {
          // A. Ramp climbing: if train has a ramp, any player approaching, on, or entering the ramp never crashes!
          if (train.hasRamp) {
            const rampLen = train.rampLength ?? (train.height > 4.0 ? 12.0 : 8.5);
            if (this.playerPos.z >= trainFrontZ - rampLen - 1.5 && this.playerPos.z <= trainFrontZ + 2.5) {
              train.surfed = true;
              continue; // Safe climbing on ramp!
            }
          }

          // B. Roof Surfing: if player is safely running on or jumping over train roof, don't crash!
          if (
            this.playerPos.z >= trainFrontZ - 0.8 &&
            this.playerPos.z <= trainBackZ + 0.8 &&
            (this.playerPos.y >= train.height - 0.75 || (train.hasRamp && this.playerPos.y >= 0.35))
          ) {
            if (!train.surfed) {
              train.surfed = true;
              this.registerManeuver('train_leap', 'TRAIN SURF');
            }
            continue; // Surfing on roof safely!
          }
        }

        // Oncoming train close dodge: player safely clears oncoming train in adjacent lane or passes it
        if (!train.cleared && this.playerPos.z > train.mesh.position.z + train.length / 2 + 0.2) {
          train.cleared = true;
          train.boundingBox.makeEmpty();
          this.stats.trainsDodged++;
          if (!train.surfed && Math.abs(this.playerPos.x - train.lane) < 4.2) {
            this.registerManeuver('train_dodge', 'TRAIN DODGE');
          }
          continue;
        }

        if (this.playerHitbox.intersectsBox(train.boundingBox)) {
          this.handleCollisionWithHazard('train');
          return;
        }
      }

      // 2. Obstacle Collisions
      for (const obs of seg.obstacles) {
        if (obs.cleared || obs.boundingBox.isEmpty()) continue;

        const obsDistZ = obs.zPos - this.playerPos.z;
        if (Math.abs(obsDistZ) > 16.0) continue;

        // Responsive maneuver approach window (-1.5m to +3.6m):
        // Sliding under low obstacles or jumping hurdles cleans hitbox well before impact!
        if (
          Math.abs(this.playerPos.x - obs.lane) < 1.35 &&
          obsDistZ >= -2.0 &&
          obsDistZ <= 3.8
        ) {
          if (obs.requiredAction === 'slide' && this.isSliding) {
            obs.cleared = true;
            obs.boundingBox.makeEmpty();
            this.stats.trainsDodged++;
            this.registerManeuver('barrier_slide', 'BARRIER SLIDE');
            continue;
          } else if (obs.requiredAction === 'jump' && (this.isJumping || this.playerPos.y > 0.55)) {
            obs.cleared = true;
            obs.boundingBox.makeEmpty();
            this.stats.trainsDodged++;
            this.registerManeuver('hurdle_jump', 'HURDLE JUMP');
            continue;
          }
        }

        // Mark cleared when player has safely passed it
        if (this.playerPos.z > obs.zPos + 1.2) {
          obs.cleared = true;
          obs.boundingBox.makeEmpty();
          this.stats.trainsDodged++;
          continue;
        }

        if (this.playerHitbox.intersectsBox(obs.boundingBox)) {
          // If boost is active, blast through non-lethal barriers with radiant sparks!
          if (this.isBoostActive && obs.type !== 'high_barrier') {
            obs.cleared = true;
            obs.boundingBox.makeEmpty();
            obs.mesh.position.y += 10; // Blast away
            this.particleSystem.emitSparks(obs.mesh.position, 24, 1.3);
            continue;
          }

          this.handleCollisionWithHazard(obs.requiredAction);
          return;
        }
      }

      // 3. Coin Pickups
      const isMagnetActive = this.activePowerUps.has('magnet');
      for (const coin of seg.coins) {
        if (!coin.collected) {
          const hit = this.playerHitbox.intersectsBox(coin.boundingBox) ||
                      (isMagnetActive && coin.mesh.position.distanceTo(this.playerPos) < 1.8);
          if (hit) {
            this.collectCoin(coin);
          }
        }
      }

      // 4. Power-Up Pickups
      for (const p of seg.powerUps) {
        if (!p.collected && this.playerHitbox.intersectsBox(p.boundingBox)) {
          p.collected = true;
          p.mesh.visible = false;
          this.activatePowerUp(p.type);
          audioManager.playPowerUp();
          this.stats.powerUpsUsed++;
        }
      }
    }
  }

  private collectCoin(coin: CoinInstance) {
    if (coin.collected) return;
    coin.collected = true;
    coin.mesh.visible = false;
    this.stats.coins++;
    this.stats.score += 25 * this.stats.multiplier;
    audioManager.playCoin();
    this.callbacks.onCoinsCollected?.(this.stats.coins);

    // High-octane golden starburst, expanding shockwave ring, and floating gold badge
    const isMagnetActive = this.activePowerUps.has('magnet');
    this.coinParticles.emitCoinCollection(
      coin.mesh.position,
      this.stats.comboMultiplier,
      isMagnetActive
    );
  }

  private handleCollisionWithHazard(hazardType: string) {
    // Emit high-energy radiant GPU sparks on train collision / obstacle crash!
    this.particleSystem.emitSparks(this.playerPos, 36, 1.4);

    // Break combo streak on crash
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.stats.comboCount = 0;
    this.stats.comboMultiplier = 1;
    this.stats.lastComboAction = undefined;

    // If Shield is active, consume it and save the player!
    if (this.activePowerUps.has('shield')) {
      this.activePowerUps.delete('shield');
      this.character.setShieldActive(false);
      audioManager.playShieldBreak();
      this.invulnerableTimer = 1.8; // Brief grace period
      return;
    }

    // Lethal crash!
    this.triggerGameOver();
  }

  // --- Power-Up Management ---

  public activatePowerUp(type: PowerUpType) {
    let duration = 12.0;

    switch (type) {
      case 'magnet':
        duration = 15.0;
        this.character.setMagnetActive(true);
        break;

      case 'shield':
        duration = 999.0; // Stays active until consumed by hit
        this.character.setShieldActive(true);
        break;

      case 'multiplier':
        duration = 15.0;
        this.stats.multiplier = 2;
        break;

      case 'boost':
        duration = 8.0;
        this.isBoostActive = true;
        break;

      case 'jetpack':
        duration = 10.0;
        this.isJetpackActive = true;
        this.character.setJetpackActive(true);
        audioManager.setJetpackActive(true);
        break;
    }

    this.activePowerUps.set(type, {
      type,
      duration,
      maxDuration: duration,
    });

    this.onPowerUpsUpdate?.(Array.from(this.activePowerUps.values()));
  }

  private updatePowerUps(delta: number) {
    let powerUpsChanged = false;

    for (const [type, active] of this.activePowerUps.entries()) {
      if (type !== 'shield') {
        active.duration -= delta;
        if (active.duration <= 0) {
          // Deactivate
          this.deactivatePowerUp(type);
          this.activePowerUps.delete(type);
          powerUpsChanged = true;
        }
      }
    }

    if (powerUpsChanged) {
      this.onPowerUpsUpdate?.(Array.from(this.activePowerUps.values()));
    }
  }

  private deactivatePowerUp(type: PowerUpType) {
    switch (type) {
      case 'magnet':
        this.character.setMagnetActive(false);
        break;

      case 'shield':
        this.character.setShieldActive(false);
        break;

      case 'multiplier':
        this.stats.multiplier = 1;
        break;

      case 'boost':
        this.isBoostActive = false;
        break;

      case 'jetpack':
        this.isJetpackActive = false;
        this.character.setJetpackActive(false);
        audioManager.setJetpackActive(false);
        break;
    }
  }

  // --- Distance, Score & Progressive Difficulty Progression ---

  private updateProgression(delta: number) {
    // 1. Combo Timer Countdown & Expiration
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      this.stats.comboTimer = Math.max(0, this.comboTimer);
      if (this.comboTimer <= 0) {
        // Combo chain expired
        this.comboCount = 0;
        this.comboMultiplier = 1;
        this.stats.comboCount = 0;
        this.stats.comboMultiplier = 1;
        this.stats.lastComboAction = undefined;
      }
    }

    // 2. Active Multiplier combining power-up bonus (2X) with active combo multiplier
    const baseMulti = this.activePowerUps.has('multiplier') ? 2 : 1;
    this.stats.multiplier = baseMulti * this.comboMultiplier;
    this.stats.comboCount = this.comboCount;
    this.stats.comboMultiplier = this.comboMultiplier;

    const activeSpeed = this.isBoostActive ? this.currentSpeed * 1.65 : this.currentSpeed;
    const distanceDelta = activeSpeed * delta;

    this.stats.distance += Math.round(distanceDelta);

    // Score gains proportional to speed & combined multiplier
    this.stats.score += Math.round(distanceDelta * 1.8 * this.stats.multiplier);

    // Progressive speed increase (exhilarating smooth acceleration with distance)
    // Dynamic difficulty: sprinting speed dynamically accelerates from baseSpeed (26) up to maxSpeed (50)
    // as player's distance score increases, making navigation and obstacle reaction progressively harder
    const distanceDifficulty = Math.min(1.0, this.stats.distance / 2400);
    const targetSprintSpeed = this.baseSpeed + (this.maxSpeed - this.baseSpeed) * distanceDifficulty;
    this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSprintSpeed, delta * 0.8);

    this.statsUpdateTimer += delta;
    if (this.statsUpdateTimer >= 0.08) {
      this.statsUpdateTimer = 0;
      this.onStatsUpdate?.(this.stats);
      this.callbacks.onScoreUpdate?.(this.stats.score, this.stats.distance);
    }
  }

  // --- Camera Controller ---

  private updateCamera(delta: number) {
    // Third person camera positioned behind and slightly above runner
    const targetCamX = this.playerPos.x * 0.7;
    const targetCamY = this.isJetpackActive
      ? 19.5
      : Math.max(3.8, this.playerPos.y * 0.6 + 4.2);

    const camEaseX = 1.0 - Math.exp(-16.0 * delta);
    const camEaseY = 1.0 - Math.exp((this.isJetpackActive ? -6.0 : -12.0) * delta);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, camEaseX);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, camEaseY);
    // Longitudinal camera distance locked exactly to runner forward progression to prevent any speed micro-jitter
    this.camera.position.z = this.playerPos.z - (this.isJetpackActive ? 9.5 : 7.5);

    // Dynamic FOV for speed rush (widens at higher velocities and boost)
    const targetFov = this.isBoostActive
      ? 84
      : this.isJetpackActive
      ? 78
      : Math.min(80, 68 + (this.currentSpeed - this.baseSpeed) * 0.55);
    const newFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 6.0);
    if (Math.abs(this.camera.fov - newFov) > 0.05) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }

    // Look ahead down the tracks using reusable Vector3
    this.lookTarget.set(
      this.playerPos.x * 0.4,
      this.isJetpackActive ? 14.0 : this.playerPos.y * 0.4 + 2.0,
      this.playerPos.z + (this.isJetpackActive ? 28.0 : 18.0)
    );
    this.camera.lookAt(this.lookTarget);

    // Keep specular rim light centered around player
    this.rimLight.position.set(this.playerPos.x - 22, 18, this.playerPos.z + 14);
    this.rimLight.target.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.rimLight.target.updateMatrixWorld();
  }

  // --- Dynamic Character Customization ---

  public setCharacter(modelId: string, skin?: CharacterSkin) {
    this.character.setCharacter(modelId, skin);
  }

  // --- Dynamic Weather Atmosphere Control ---

  public cycleWeather() {
    this.weatherManager.cycleWeather();
  }

  // --- Resize Handler ---

  private handleResize() {
    if (!this.canvas) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  // --- Clean Disposal ---

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    audioManager.stopMusic();
    this.inputHandler.detach();
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('resize', this.onResizeBound);

    this.weatherManager?.destroy();
    this.introChaseManager?.destroy();
    this.particleSystem?.destroy();
    this.coinParticles?.destroy();
    this.jetpackExhaust?.destroy();
    this.trackManager.clearAll();
    this.skyboxManager.destroy();
    this.speedTrail.destroy();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

function timeNow(): number {
  return performance.now() / 1000;
}
