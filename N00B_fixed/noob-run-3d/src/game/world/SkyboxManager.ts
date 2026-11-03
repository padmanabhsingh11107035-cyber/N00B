import * as THREE from 'three';

export type TimeOfDay = 'day' | 'sunset' | 'twilight' | 'night' | 'dawn';

export interface SkyTheme {
  name: string;
  badge: string;
  icon: string;
  timeOfDay: TimeOfDay;
  minDistance: number;
  topColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunElevation: number; // elevation angle in radians (vertical height: high at noon, low at sunset, etc.)
  sunAzimuth: number;   // horizontal orbital angle in radians
  ambientColor: THREE.Color;
  ambientIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
  shadowIntensity: number; // 0.0 - 1.0 (relative shadow depth / contrast)
  shadowRadius: number;    // blur radius of PCF soft shadows
  starIntensity: number;
}

export class SkyboxManager {
  public scene: THREE.Scene;
  public skyMesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;

  // Active interpolated values (initialized to Daylight Theme)
  public currentFogColor = new THREE.Color(0xbae6fd);
  public currentFogNear = 90;
  public currentFogFar = 580;
  public currentSunColor = new THREE.Color(0xfff7ed);
  public currentSunIntensity = 1.25;
  public currentAmbientColor = new THREE.Color(0xffffff);
  public currentAmbientIntensity = 0.45;
  public currentHemiSky = new THREE.Color(0x38bdf8);
  public currentHemiGround = new THREE.Color(0x475569);
  public currentHemiIntensity = 0.45;
  public currentRimColor = new THREE.Color(0xfef08a);
  public currentRimIntensity = 0.45;
  public currentShadowIntensity = 0.98;
  public currentShadowRadius = 1.2;
  public activeThemeName = 'Daylight Express';
  public currentTimeOfDay: TimeOfDay = 'day';

  private themes: SkyTheme[];
  public cycleDistance = 3500; // Complete Day-to-Night cycle length in meters (loops infinitely)
  private animTime = 0;
  private lastAnnouncedThemeIndex = -1;

  public onThemeChange?: (theme: { name: string; badge: string; icon: string; timeOfDay: TimeOfDay }) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Define 5 distinct progressive diurnal phases spanning the complete Day-to-Night cycle
    this.themes = [
      // Phase 0: Bright Midday / High Noon Sun (0m - 700m) - Crisp high contrast
      {
        name: 'Daylight Express',
        badge: 'BRIGHT SUNLIGHT',
        icon: '☀️',
        timeOfDay: 'day',
        minDistance: 0,
        topColor: new THREE.Color(0x0284c7),       // Crisp Cyan/Azure zenith
        horizonColor: new THREE.Color(0xbae6fd),   // Pale radiant sky horizon
        groundColor: new THREE.Color(0x475569),    // Slate stone ballast
        fogColor: new THREE.Color(0xbae6fd),       // Sunlit pale cyan horizon fog
        fogNear: 90,
        fogFar: 580,
        sunColor: new THREE.Color(0xfff7ed),       // Warm sun
        sunIntensity: 1.25,                        // Balanced solar intensity (no overexposure)
        sunElevation: Math.PI * 0.38,              // High overhead (68°)
        sunAzimuth: -Math.PI * 0.25,               // Slightly offset east-west
        ambientColor: new THREE.Color(0xffffff),   // Clean daylight fill
        ambientIntensity: 0.45,
        hemiSkyColor: new THREE.Color(0x38bdf8),   // Vibrant cyan sky bounce
        hemiGroundColor: new THREE.Color(0x334155),// Slate ground bounce
        hemiIntensity: 0.45,
        rimColor: new THREE.Color(0xfef08a),       // Warm golden sun rim highlight
        rimIntensity: 0.45,
        shadowIntensity: 0.98,                     // Deep, crisp, razor-sharp midday shadows
        shadowRadius: 1.2,                         // Minimum blur: sharp edge definition
        starIntensity: 0.0,
      },
      // Phase 1: Golden Sunset / Late Afternoon (700m - 1400m)
      {
        name: 'Sunset Horizon',
        badge: 'GOLDEN HOUR',
        icon: '🌇',
        timeOfDay: 'sunset',
        minDistance: 700,
        topColor: new THREE.Color(0x312e81),       // Deep Royal Indigo zenith
        horizonColor: new THREE.Color(0xf97316),   // Blazing fiery orange/amber horizon
        groundColor: new THREE.Color(0x2e1065),    // Warm copper twilight ground
        fogColor: new THREE.Color(0x4a154b),       // Dramatic dusky purple fog
        fogNear: 75,
        fogFar: 520,
        sunColor: new THREE.Color(0xfb923c),       // Burning amber-orange sun orb
        sunIntensity: 1.15,
        sunElevation: Math.PI * 0.12,              // Low golden angle (21°)
        sunAzimuth: -Math.PI * 0.55,               // Angled to the west
        ambientColor: new THREE.Color(0xfbcfe8),   // Warm peach/rose ambient tint
        ambientIntensity: 0.38,
        hemiSkyColor: new THREE.Color(0xc084fc),   // Violet sky bounce
        hemiGroundColor: new THREE.Color(0x581c87),// Dark plum earth bounce
        hemiIntensity: 0.40,
        rimColor: new THREE.Color(0xf97316),       // Fiery copper/amber rim highlight
        rimIntensity: 0.65,
        shadowIntensity: 0.88,                     // Dramatic elongated shadows stretching across rails
        shadowRadius: 2.8,                         // Softer golden shadow edges
        starIntensity: 0.25,
      },
      // Phase 2: Crimson Twilight / Dusk (1400m - 2100m)
      {
        name: 'Crimson Twilight',
        badge: 'DUSK GLOW',
        icon: '🌆',
        timeOfDay: 'twilight',
        minDistance: 1400,
        topColor: new THREE.Color(0x1e1b4b),       // Midnight violet zenith
        horizonColor: new THREE.Color(0xdb2777),   // Glowing neon magenta/rose horizon
        groundColor: new THREE.Color(0x0f0a1c),    // Dark wine ground
        fogColor: new THREE.Color(0x271033),       // Velvety violet evening fog
        fogNear: 65,
        fogFar: 480,
        sunColor: new THREE.Color(0xef4444),       // Crimson sinking sun orb
        sunIntensity: 1.15,
        sunElevation: Math.PI * 0.04,              // Skimming the horizon (7°)
        sunAzimuth: -Math.PI * 0.75,
        ambientColor: new THREE.Color(0xa5b4fc),   // Soft lavender twilight fill
        ambientIntensity: 0.40,
        hemiSkyColor: new THREE.Color(0x818cf8),   // Indigo-rose sky light
        hemiGroundColor: new THREE.Color(0x1e1b4b),// Dark navy earth
        hemiIntensity: 0.45,
        rimColor: new THREE.Color(0xec4899),       // Electric magenta rim highlight
        rimIntensity: 1.05,
        shadowIntensity: 0.75,                     // Soft purple dusk shadows
        shadowRadius: 3.6,                         // Soft dusk edges
        starIntensity: 0.65,                       // Evening stars becoming prominent
      },
      // Phase 3: Starry Midnight / Lunar Night (2100m - 2800m)
      {
        name: 'Neon Midnight',
        badge: 'LUNAR NIGHT',
        icon: '🌙',
        timeOfDay: 'night',
        minDistance: 2100,
        topColor: new THREE.Color(0x020617),       // Abyssal cosmic navy zenith
        horizonColor: new THREE.Color(0x082f49),   // Glowing cyber-teal nocturnal horizon
        groundColor: new THREE.Color(0x010409),    // Pitch obsidian ground
        fogColor: new THREE.Color(0x050c1e),       // Midnight blue atmospheric fog
        fogNear: 60,
        fogFar: 460,
        sunColor: new THREE.Color(0x7dd3fc),       // Cool lunar blue moonlight
        sunIntensity: 0.72,                        // Soft silver moonlight
        sunElevation: Math.PI * 0.30,              // Moon elevated high (54°)
        sunAzimuth: Math.PI * 0.35,                // Moon positioned across the celestial arc
        ambientColor: new THREE.Color(0x1e293b),   // Deep indigo moonlit ambient
        ambientIntensity: 0.28,                    // Dim ambient: train headlights & neon glow pop!
        hemiSkyColor: new THREE.Color(0x0ea5e9),   // Cyan moon bounce
        hemiGroundColor: new THREE.Color(0x020617),// Obsidian earth bounce
        hemiIntensity: 0.32,
        rimColor: new THREE.Color(0x38bdf8),       // Cyber-cyan lunar specular rim highlight
        rimIntensity: 1.15,
        shadowIntensity: 0.60,                     // Nocturnal moonlit shadows; headlights become dominant
        shadowRadius: 4.5,                         // Diffuse moon shadows
        starIntensity: 1.0,                        // Full brilliant shimmering starfield across the sky
      },
      // Phase 4: Aurora Dawn / Morning Sunrise (2800m - 3500m)
      {
        name: 'Aurora Sunrise',
        badge: 'DAWN BREAK',
        icon: '🌅',
        timeOfDay: 'dawn',
        minDistance: 2800,
        topColor: new THREE.Color(0x312e81),       // Royal indigo zenith
        horizonColor: new THREE.Color(0xfb7185),   // Rose gold and peach morning horizon
        groundColor: new THREE.Color(0x0f172a),    // Dark morning ground
        fogColor: new THREE.Color(0x4c1d55),       // Luminous rose mist fog
        fogNear: 70,
        fogFar: 510,
        sunColor: new THREE.Color(0xfef08a),       // Warm champagne rising sun
        sunIntensity: 1.50,
        sunElevation: Math.PI * 0.16,              // Ascending morning sun (28°)
        sunAzimuth: Math.PI * 0.10,                // Rising from the eastern sky
        ambientColor: new THREE.Color(0xfecdd3),   // Soft rosy morning warmth
        ambientIntensity: 0.55,
        hemiSkyColor: new THREE.Color(0xf472b6),   // Coral dawn sky light
        hemiGroundColor: new THREE.Color(0x1e1b4b),// Slate morning ground
        hemiIntensity: 0.58,
        rimColor: new THREE.Color(0xfde047),       // Pale morning gold rim highlight
        rimIntensity: 0.95,
        shadowIntensity: 0.85,                     // Lengthening morning shadows crispening as day breaks
        shadowRadius: 2.2,
        starIntensity: 0.15,                       // Fading morning stars
      },
    ];

    // Procedural Skybox Shader Material
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunPosition;
      uniform vec3 sunColor;
      uniform float starIntensity;
      uniform float time;

      varying vec3 vWorldPosition;

      // Pseudo-random noise for shimmering stars
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);

        // Vertical gradient
        float h = dir.y;
        vec3 sky;

        if (h > 0.0) {
          // Upper sky hemisphere: smooth natural atmospheric blend from horizon to top
          float factor = pow(clamp(h, 0.0, 1.0), 0.65);
          sky = mix(horizonColor, topColor, factor);

          // Procedural Sun / Moon Disc
          vec3 sunDir = normalize(sunPosition);
          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunDisc = smoothstep(0.995, 0.998, sunDot);
          float sunGlow = pow(sunDot, 14.0) * 0.45;
          sky += (sunColor * sunDisc * 2.2) + (sunColor * sunGlow);

          // Subtle lunar surface contrast detail when starIntensity > 0.4 (Night Phase)
          if (starIntensity > 0.4 && sunDot > 0.992) {
            float moonCraters = sin(dir.x * 140.0) * cos(dir.y * 140.0) * 0.08;
            sky += sunColor * moonCraters * sunDisc;
          }

          // Procedural Twinkling Stars (only in upper sky and when starIntensity > 0)
          if (starIntensity > 0.02 && h > 0.10) {
            vec3 starCoord = floor(dir * 220.0);
            float n = hash(starCoord);
            if (n > 0.982) {
              float twinkle = 0.5 + 0.5 * sin(time * 3.5 + n * 60.0);
              float starBrightness = (n - 0.982) / 0.018 * twinkle * starIntensity;
              sky += vec3(0.95, 0.98, 1.0) * starBrightness * 1.6;
            }
          }

          // Subtle atmospheric cloud haze layer near horizon
          float cloudNoise = sin(dir.x * 5.0 + time * 0.04) * cos(dir.z * 5.0 + time * 0.04);
          float cloudMask = smoothstep(0.01, 0.22, h) * smoothstep(0.40, 0.12, h);
          sky = mix(sky, horizonColor * 1.15, cloudMask * (cloudNoise * 0.14 + 0.08));

        } else {
          // Lower ground hemisphere: fade into ground/fog color
          float factor = clamp(-h * 4.0, 0.0, 1.0);
          sky = mix(horizonColor, groundColor, factor);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color().copy(this.themes[0].topColor) },
        horizonColor: { value: new THREE.Color().copy(this.themes[0].horizonColor) },
        groundColor: { value: new THREE.Color().copy(this.themes[0].groundColor) },
        sunPosition: { value: new THREE.Vector3(25, 45, -20) },
        sunColor: { value: new THREE.Color().copy(this.themes[0].sunColor) },
        starIntensity: { value: 0.0 },
        time: { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    // Create huge sky dome encompassing the view
    const skyGeom = new THREE.SphereGeometry(480, 32, 20);
    this.skyMesh = new THREE.Mesh(skyGeom, this.material);
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);
  }

  /**
   * Main update tick: calculates distance progress across the day-to-night cycle,
   * smoothly blends sky themes, sun/moon orbital positions, directional sunlight,
   * shadow radius, ambient intensity, and specular rim lighting.
   */
  public update(
    delta: number,
    distance: number,
    playerPos: THREE.Vector3,
    dirLight: THREE.DirectionalLight,
    ambientLight: THREE.AmbientLight,
    hemiLight: THREE.HemisphereLight,
    rimLight?: THREE.DirectionalLight
  ) {
    this.animTime += delta;
    this.material.uniforms.time.value = this.animTime;

    // Center sky sphere around player camera so it never clips or runs out
    this.skyMesh.position.copy(playerPos);

    // Calculate progression index in diurnal cycle
    const cycleDist = distance % this.cycleDistance;
    const numThemes = this.themes.length;
    const segmentLength = this.cycleDistance / numThemes;

    const themeIndex = Math.floor(cycleDist / segmentLength);
    const nextThemeIndex = (themeIndex + 1) % numThemes;
    const transitionFactor = (cycleDist % segmentLength) / segmentLength;

    // Smooth smoothstep ease for natural day-to-night transitions
    const easedFactor = THREE.MathUtils.smoothstep(transitionFactor, 0.05, 0.95);

    const curr = this.themes[themeIndex];
    const next = this.themes[nextThemeIndex];

    this.currentTimeOfDay = curr.timeOfDay;

    // Announce theme change when entering a new corridor phase
    if (this.lastAnnouncedThemeIndex !== themeIndex) {
      this.lastAnnouncedThemeIndex = themeIndex;
      this.activeThemeName = curr.name;
      this.onThemeChange?.({
        name: curr.name,
        badge: curr.badge,
        icon: curr.icon,
        timeOfDay: curr.timeOfDay,
      });
    }

    // 1. Interpolate Sky Shader Uniforms
    const u = this.material.uniforms;
    (u.topColor.value as THREE.Color).lerpColors(curr.topColor, next.topColor, easedFactor);
    (u.horizonColor.value as THREE.Color).lerpColors(curr.horizonColor, next.horizonColor, easedFactor);
    (u.groundColor.value as THREE.Color).lerpColors(curr.groundColor, next.groundColor, easedFactor);
    (u.sunColor.value as THREE.Color).lerpColors(curr.sunColor, next.sunColor, easedFactor);
    u.starIntensity.value = THREE.MathUtils.lerp(curr.starIntensity, next.starIntensity, easedFactor);

    // 2. Orbital Sun / Moon Position Vector based on celestial elevation and azimuth
    const elevation = THREE.MathUtils.lerp(curr.sunElevation, next.sunElevation, easedFactor);
    const azimuth = THREE.MathUtils.lerp(curr.sunAzimuth, next.sunAzimuth, easedFactor);
    const orbitRadius = 75.0;

    const sunPos = new THREE.Vector3(
      playerPos.x + Math.sin(azimuth) * Math.cos(elevation) * orbitRadius,
      playerPos.y + Math.max(7.0, Math.sin(elevation) * orbitRadius),
      playerPos.z + Math.cos(azimuth) * Math.cos(elevation) * orbitRadius
    );
    (u.sunPosition.value as THREE.Vector3).copy(sunPos);

    // 3. Sync Scene Fog and Background
    this.currentFogColor.lerpColors(curr.fogColor, next.fogColor, easedFactor);
    this.currentFogNear = THREE.MathUtils.lerp(curr.fogNear, next.fogNear, easedFactor);
    this.currentFogFar = THREE.MathUtils.lerp(curr.fogFar, next.fogFar, easedFactor);

    if (this.scene.fog && 'color' in this.scene.fog) {
      this.scene.fog.color.copy(this.currentFogColor);
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = this.currentFogNear;
        this.scene.fog.far = this.currentFogFar;
      }
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.currentFogColor);
    }

    // 4. Directional Sunlight / Moonlight (Position, Color, Intensity, Shadow Softness)
    this.currentSunColor.lerpColors(curr.sunColor, next.sunColor, easedFactor);
    this.currentSunIntensity = THREE.MathUtils.lerp(curr.sunIntensity, next.sunIntensity, easedFactor);
    this.currentShadowIntensity = THREE.MathUtils.lerp(curr.shadowIntensity, next.shadowIntensity, easedFactor);
    this.currentShadowRadius = THREE.MathUtils.lerp(curr.shadowRadius, next.shadowRadius, easedFactor);

    dirLight.color.copy(this.currentSunColor);
    dirLight.intensity = this.currentSunIntensity;
    dirLight.position.copy(sunPos);
    dirLight.target.position.set(playerPos.x, playerPos.y, playerPos.z + 8.0);
    dirLight.target.updateMatrixWorld();

    if (dirLight.shadow) {
      dirLight.shadow.radius = this.currentShadowRadius;
    }

    // 5. Ambient & Hemisphere Light Color & Intensity
    this.currentAmbientColor.lerpColors(curr.ambientColor, next.ambientColor, easedFactor);
    this.currentAmbientIntensity = THREE.MathUtils.lerp(curr.ambientIntensity, next.ambientIntensity, easedFactor);
    ambientLight.color.copy(this.currentAmbientColor);
    ambientLight.intensity = this.currentAmbientIntensity;

    this.currentHemiSky.lerpColors(curr.hemiSkyColor, next.hemiSkyColor, easedFactor);
    this.currentHemiGround.lerpColors(curr.hemiGroundColor, next.hemiGroundColor, easedFactor);
    this.currentHemiIntensity = THREE.MathUtils.lerp(curr.hemiIntensity, next.hemiIntensity, easedFactor);
    hemiLight.color.copy(this.currentHemiSky);
    hemiLight.groundColor.copy(this.currentHemiGround);
    hemiLight.intensity = this.currentHemiIntensity;

    // 6. Specular Rim Light Color & Intensity (RTX Edge Highlights)
    this.currentRimColor.lerpColors(curr.rimColor, next.rimColor, easedFactor);
    this.currentRimIntensity = THREE.MathUtils.lerp(curr.rimIntensity, next.rimIntensity, easedFactor);
    if (rimLight) {
      rimLight.color.copy(this.currentRimColor);
      rimLight.intensity = this.currentRimIntensity;
    }
  }

  public reset() {
    this.animTime = 0;
    this.lastAnnouncedThemeIndex = -1;
  }

  public destroy() {
    this.scene.remove(this.skyMesh);
    this.skyMesh.geometry.dispose();
    this.material.dispose();
  }
}
