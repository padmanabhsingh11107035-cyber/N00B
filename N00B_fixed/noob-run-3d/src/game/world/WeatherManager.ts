import * as THREE from 'three';

export type WeatherType = 'clear' | 'light_rain' | 'misty_fog';

export interface WeatherInfo {
  type: WeatherType;
  name: string;
  icon: string;
  description: string;
}

export class WeatherManager {
  public scene: THREE.Scene;
  public currentWeather: WeatherType = 'clear';
  public targetWeather: WeatherType = 'clear';
  public transitionFactor = 0.0; // 0 = previous weather, 1 = target weather

  // --- Rain Particle System ---
  private rainGroup: THREE.Group;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.LineBasicMaterial;
  private rainLines: THREE.LineSegments;
  private rainCount = 380;
  private rainPositions: Float32Array;
  private rainVelocities: Float32Array;
  private rainDropLength = 1.35;

  // --- Ground Splash Particles ---
  private splashGroup: THREE.Group;
  private splashGeometry: THREE.BufferGeometry;
  private splashMaterial: THREE.PointsMaterial;
  private splashPoints: THREE.Points;
  private splashCount = 60;
  private splashPositions: Float32Array;
  private splashLifetimes: Float32Array;

  // --- Atmospheric Floating Mist / Fog Drift Particles ---
  private mistGroup: THREE.Group;
  private mistGeometry: THREE.BufferGeometry;
  private mistMaterial: THREE.PointsMaterial;
  private mistPoints: THREE.Points;
  private mistTexture: THREE.CanvasTexture;
  private mistCount = 120;
  private mistPositions: Float32Array;
  private mistVelocities: Float32Array;
  private mistPhases: Float32Array;

  // --- Ambient Lighting Target Scratch ---
  private rainAmbientColor = new THREE.Color(0x94a3b8); // Slate cool overcast tint
  private mistAmbientColor = new THREE.Color(0xdbeafe); // Soft silver morning mist glow
  private normalAmbientColor = new THREE.Color(0xffffff);

  // --- Weather Cycling Logic ---
  private weatherTimer = 0;
  private weatherCycleInterval = 32; // Periodically toggles weather every ~32 seconds (~750m)
  private weatherSequence: WeatherType[] = ['clear', 'light_rain', 'clear', 'misty_fog'];
  private sequenceIndex = 0;

  // --- Audio / Atmosphere Ambience ---
  private rainAudioGain: GainNode | null = null;
  private rainAudioSource: AudioBufferSourceNode | null = null;
  private audioContext: AudioContext | null = null;

  // Callback to HUD
  public onWeatherChange?: (info: WeatherInfo) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ==========================================
    // 1. Rain Lines System (Particle Atmosphere)
    // ==========================================
    this.rainGroup = new THREE.Group();
    this.rainPositions = new Float32Array(this.rainCount * 2 * 3);
    this.rainVelocities = new Float32Array(this.rainCount * 3);

    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * 38;
      const y = Math.random() * 25 + 1;
      const z = (Math.random() - 0.5) * 52;

      const idx = i * 6;
      this.rainPositions[idx] = x;
      this.rainPositions[idx + 1] = y;
      this.rainPositions[idx + 2] = z;

      this.rainPositions[idx + 3] = x - 0.09;
      this.rainPositions[idx + 4] = y - this.rainDropLength;
      this.rainPositions[idx + 5] = z + 0.38;

      this.rainVelocities[i * 3] = (Math.random() - 0.5) * 0.4 - 0.2;
      this.rainVelocities[i * 3 + 1] = -(34 + Math.random() * 14);
      this.rainVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xc8e6f5,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    this.rainLines = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainGroup.add(this.rainLines);
    this.scene.add(this.rainGroup);

    // ==========================================
    // 2. Ground Splash Particle System
    // ==========================================
    this.splashGroup = new THREE.Group();
    this.splashPositions = new Float32Array(this.splashCount * 3);
    this.splashLifetimes = new Float32Array(this.splashCount);

    for (let i = 0; i < this.splashCount; i++) {
      this.splashPositions[i * 3] = (Math.random() - 0.5) * 20;
      this.splashPositions[i * 3 + 1] = 0.06;
      this.splashPositions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      this.splashLifetimes[i] = Math.random();
    }

    this.splashGeometry = new THREE.BufferGeometry();
    this.splashGeometry.setAttribute('position', new THREE.BufferAttribute(this.splashPositions, 3));

    this.splashMaterial = new THREE.PointsMaterial({
      color: 0xdbeafe,
      size: 0.26,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    this.splashPoints = new THREE.Points(this.splashGeometry, this.splashMaterial);
    this.splashGroup.add(this.splashPoints);
    this.scene.add(this.splashGroup);

    // ==========================================
    // 3. Volumetric Floating Mist Particles
    // ==========================================
    this.mistTexture = this.createMistParticleTexture();
    this.mistGroup = new THREE.Group();
    this.mistPositions = new Float32Array(this.mistCount * 3);
    this.mistVelocities = new Float32Array(this.mistCount * 3);
    this.mistPhases = new Float32Array(this.mistCount);

    for (let i = 0; i < this.mistCount; i++) {
      this.mistPositions[i * 3] = (Math.random() - 0.5) * 36;
      this.mistPositions[i * 3 + 1] = 0.4 + Math.random() * 3.6; // low-to-mid track mist
      this.mistPositions[i * 3 + 2] = (Math.random() - 0.5) * 48;

      this.mistVelocities[i * 3] = (Math.random() - 0.5) * 0.8;
      this.mistVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
      this.mistVelocities[i * 3 + 2] = -0.5 - Math.random() * 0.8; // subtle headwind drift
      this.mistPhases[i] = Math.random() * Math.PI * 2;
    }

    this.mistGeometry = new THREE.BufferGeometry();
    this.mistGeometry.setAttribute('position', new THREE.BufferAttribute(this.mistPositions, 3));

    this.mistMaterial = new THREE.PointsMaterial({
      map: this.mistTexture,
      color: 0xe2e8f0,
      size: 4.5,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.mistPoints = new THREE.Points(this.mistGeometry, this.mistMaterial);
    this.mistGroup.add(this.mistPoints);
    this.scene.add(this.mistGroup);

    this.initAudio();
  }

  /**
   * Generates a soft radial feathered mist puff texture dynamically via Canvas
   */
  private createMistParticleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      gradient.addColorStop(0.25, 'rgba(240, 248, 255, 0.4)');
      gradient.addColorStop(0.65, 'rgba(220, 235, 255, 0.12)');
      gradient.addColorStop(1, 'rgba(220, 235, 255, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  private initAudio() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          data[i] = (b0 + b1 + b2) * 0.06;
        }

        this.rainAudioSource = this.audioContext.createBufferSource();
        this.rainAudioSource.buffer = buffer;
        this.rainAudioSource.loop = true;

        this.rainAudioGain = this.audioContext.createGain();
        this.rainAudioGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);

        this.rainAudioSource.connect(this.rainAudioGain);
        this.rainAudioGain.connect(this.audioContext.destination);
        this.rainAudioSource.start(0);
      }
    } catch {
      // AudioContext may be restricted before user gesture
    }
  }

  public getWeatherInfo(type: WeatherType): WeatherInfo {
    switch (type) {
      case 'light_rain':
        return {
          type: 'light_rain',
          name: 'Light Rain',
          icon: '🌧️',
          description: 'Atmospheric gentle rainfall with glistening tracks and cool ambient tones',
        };
      case 'misty_fog':
        return {
          type: 'misty_fog',
          name: 'Morning Mist',
          icon: '🌫️',
          description: 'Ethereal floating mist drifting across the railway tracks',
        };
      case 'clear':
      default:
        return {
          type: 'clear',
          name: 'Clear Skies',
          icon: '☀️',
          description: 'Bright visibility and radiant sunbeams',
        };
    }
  }

  public setWeather(type: WeatherType) {
    if (this.targetWeather === type) return;
    this.targetWeather = type;
    this.transitionFactor = 0.0;
    this.onWeatherChange?.(this.getWeatherInfo(type));
  }

  /**
   * Cycle to next weather state (can be triggered manually via UI or key)
   */
  public cycleWeather() {
    this.weatherTimer = 0;
    this.sequenceIndex = (this.sequenceIndex + 1) % this.weatherSequence.length;
    this.setWeather(this.weatherSequence[this.sequenceIndex]);
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    inTunnel: boolean,
    camera: THREE.PerspectiveCamera,
    sceneFog: THREE.Fog | null,
    ambientLight?: THREE.AmbientLight,
    hemiLight?: THREE.HemisphereLight,
    dirLight?: THREE.DirectionalLight
  ) {
    // 1. Periodic Weather Cycle Progression
    this.weatherTimer += delta;
    if (this.weatherTimer >= this.weatherCycleInterval) {
      this.weatherTimer = 0;
      this.sequenceIndex = (this.sequenceIndex + 1) % this.weatherSequence.length;
      this.setWeather(this.weatherSequence[this.sequenceIndex]);
    }

    // Smoothly transition between weather states (settles in ~2.5s)
    if (this.transitionFactor < 1.0) {
      this.transitionFactor = Math.min(1.0, this.transitionFactor + delta * 0.45);
      if (this.transitionFactor >= 1.0) {
        this.currentWeather = this.targetWeather;
      }
    }

    // Calculate effective weather weights
    let rainWeight = 0.0;
    let mistWeight = 0.0;

    if (this.targetWeather === 'light_rain') {
      rainWeight = this.transitionFactor;
    } else if (this.currentWeather === 'light_rain') {
      rainWeight = 1.0 - this.transitionFactor;
    }

    if (this.targetWeather === 'misty_fog') {
      mistWeight = this.transitionFactor;
    } else if (this.currentWeather === 'misty_fog') {
      mistWeight = 1.0 - this.transitionFactor;
    }

    // Vaulted tunnel ceiling protects runner from overhead rain and dissipates ground mist
    if (inTunnel) {
      rainWeight *= 0.05;
      mistWeight *= 0.1;
    }

    // ==============================================================
    // 2. Modifying the Scene's Ambient Light & Directional Sunlight
    // ==============================================================
    if (ambientLight) {
      // Modify ambient light intensity based on active weather:
      // - Light Rain: dims ambient light by ~25% for moody overcast feel
      // - Morning Mist: softens ambient light by ~15% with silver glow
      // - Clear: full brightness
      const weatherAmbientScale = 1.0 - 0.25 * rainWeight - 0.15 * mistWeight;
      ambientLight.intensity *= weatherAmbientScale;

      // Tint ambient light color toward cool slate blue in rain, or soft silver in mist
      if (rainWeight > 0.02) {
        ambientLight.color.lerp(this.rainAmbientColor, rainWeight * 0.35);
      } else if (mistWeight > 0.02) {
        ambientLight.color.lerp(this.mistAmbientColor, mistWeight * 0.28);
      }
    }

    if (hemiLight) {
      const weatherHemiScale = 1.0 - 0.2 * rainWeight - 0.1 * mistWeight;
      hemiLight.intensity *= weatherHemiScale;
    }

    if (dirLight) {
      // Soften direct harsh sunlight when raining or misty
      const weatherSunScale = 1.0 - 0.32 * rainWeight - 0.18 * mistWeight;
      dirLight.intensity *= weatherSunScale;
    }

    // ==============================================================
    // 3. Rain Streak Particles & Splashes
    // ==============================================================
    const targetRainOpacity = rainWeight * 0.58;
    this.rainMaterial.opacity = THREE.MathUtils.lerp(this.rainMaterial.opacity, targetRainOpacity, delta * 4.0);
    this.splashMaterial.opacity = THREE.MathUtils.lerp(this.splashMaterial.opacity, targetRainOpacity * 0.75, delta * 4.0);

    // Audio ambience sync
    if (this.rainAudioGain && this.audioContext) {
      const targetGain = Math.min(0.12, targetRainOpacity * 0.2);
      this.rainAudioGain.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.2);
    }

    if (this.rainMaterial.opacity > 0.01) {
      this.rainGroup.position.set(playerPos.x, 0, playerPos.z);
      const posAttr = this.rainGeometry.attributes.position as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;

      for (let i = 0; i < this.rainCount; i++) {
        const idx = i * 6;
        const velIdx = i * 3;

        positions[idx + 1] += this.rainVelocities[velIdx + 1] * delta;
        positions[idx + 4] = positions[idx + 1] - this.rainDropLength;

        positions[idx] += this.rainVelocities[velIdx] * delta;
        positions[idx + 3] = positions[idx] - 0.09;

        positions[idx + 2] += this.rainVelocities[velIdx + 2] * delta;
        positions[idx + 5] = positions[idx + 2] + 0.38;

        if (positions[idx + 1] < 0.2) {
          positions[idx] = (Math.random() - 0.5) * 38;
          positions[idx + 1] = Math.random() * 8 + 18;
          positions[idx + 2] = (Math.random() - 0.5) * 48;

          positions[idx + 3] = positions[idx] - 0.09;
          positions[idx + 4] = positions[idx + 1] - this.rainDropLength;
          positions[idx + 5] = positions[idx + 2] + 0.38;
        }
      }

      posAttr.needsUpdate = true;

      // Ground Splash Particles
      const splashAttr = this.splashGeometry.attributes.position as THREE.BufferAttribute;
      const sPos = splashAttr.array as Float32Array;
      this.splashGroup.position.set(playerPos.x, 0, playerPos.z);

      for (let i = 0; i < this.splashCount; i++) {
        this.splashLifetimes[i] += delta * 2.4;
        if (this.splashLifetimes[i] > 1.0) {
          this.splashLifetimes[i] = 0;
          sPos[i * 3] = (Math.random() - 0.5) * 20;
          sPos[i * 3 + 1] = 0.06 + Math.random() * 0.12;
          sPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
        }
      }
      splashAttr.needsUpdate = true;
    }

    // ==============================================================
    // 4. Volumetric Drifting Mist / Fog Particles
    // ==============================================================
    const targetMistOpacity = mistWeight * 0.38;
    this.mistMaterial.opacity = THREE.MathUtils.lerp(this.mistMaterial.opacity, targetMistOpacity, delta * 3.5);

    if (this.mistMaterial.opacity > 0.01) {
      this.mistGroup.position.set(playerPos.x, 0, playerPos.z);
      const mistAttr = this.mistGeometry.attributes.position as THREE.BufferAttribute;
      const mPos = mistAttr.array as Float32Array;

      for (let i = 0; i < this.mistCount; i++) {
        const idx = i * 3;
        this.mistPhases[i] += delta * 1.2;

        // Gentle undulating drift across tracks
        mPos[idx] += (this.mistVelocities[idx] + Math.sin(this.mistPhases[i]) * 0.3) * delta;
        mPos[idx + 1] += (Math.cos(this.mistPhases[i] * 0.8) * 0.1) * delta;
        mPos[idx + 2] += this.mistVelocities[idx + 2] * delta;

        // Wrap around bounds centered on runner
        if (mPos[idx + 2] < -25) {
          mPos[idx + 2] = 25;
          mPos[idx] = (Math.random() - 0.5) * 36;
          mPos[idx + 1] = 0.4 + Math.random() * 3.6;
        }
      }
      mistAttr.needsUpdate = true;
    }

    // ==============================================================
    // 5. Scene Fog Distance Modulation (Clear Line of Sight)
    // ==============================================================
    if (sceneFog && !inTunnel) {
      if (mistWeight > 0.01) {
        // Ethereal scenic mist distance falloff (keeping trains at 65m crystal clear!)
        const targetFogNear = THREE.MathUtils.lerp(80, 65, mistWeight);
        const targetFogFar = THREE.MathUtils.lerp(520, 360, mistWeight);

        sceneFog.near = THREE.MathUtils.lerp(sceneFog.near, targetFogNear, delta * 2.0);
        sceneFog.far = THREE.MathUtils.lerp(sceneFog.far, targetFogFar, delta * 2.0);
      }
    }
  }

  public reset() {
    this.weatherTimer = 0;
    this.sequenceIndex = 0;
    this.setWeather('clear');
  }

  public destroy() {
    this.scene.remove(this.rainGroup);
    this.scene.remove(this.splashGroup);
    this.scene.remove(this.mistGroup);

    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.splashGeometry.dispose();
    this.splashMaterial.dispose();
    this.mistGeometry.dispose();
    this.mistMaterial.dispose();
    this.mistTexture.dispose();

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
    }
  }
}
