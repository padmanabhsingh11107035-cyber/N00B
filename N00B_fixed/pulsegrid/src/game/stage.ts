import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Palette } from './chart'

/**
 * The showcase stage (concept boards 01/02): a matte black tiered stage, overhead truss with
 * moving-head fixtures casting soft volumetric beams (with floor pools), a dimmed audio-reactive
 * LED wall, lasers for drops/Fever, haze, speaker stacks, a billboard crowd with lightsticks, and
 * pyro/CO2 anchor points at the lip. Look comes from light, not emissive surfaces: environment
 * reflections are kept low and every surface is rough.
 */
export type StageState = {
  beat: number
  /** 0..1 musical intensity of the current section. */
  intensity: number
  fever: boolean
  /** 0..1 flash on the latest good judgment. */
  flash: number
  /** 0..1 red dip on misses. */
  miss: number
  /** 0..1 spotlight-round focus on the player (dims the rest). */
  spotlight?: number
  /** 0..1 laser amount (drops / fever / finish). */
  lasers?: number
  /** 16 normalised music spectrum bands (0..1). */
  bands?: Float32Array
}

export type StageTextures = { floor: THREE.Texture; crowd: THREE.Texture; atlas: THREE.Texture }

const STAGE_FRONT = 3.25
const WALL_Z = -5.3

const beamVert = /* glsl */ `
  varying float vFade;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying float vDist;
  uniform float uLen;
  void main() {
    vFade = clamp(-position.y / uLen, 0.0, 1.0);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`
const beamFrag = /* glsl */ `
  varying float vFade;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying float vDist;
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTime;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    float facing = pow(abs(dot(normalize(vN), normalize(vView))), 2.2);
    float along = pow(1.0 - vFade, 1.6) * smoothstep(0.0, 0.04, vFade);
    // Drifting haze modulation so the beam reads as light in smoke rather than a solid cone.
    float haze = 0.72 + 0.28 * sin(vW.y * 2.3 + uTime * 0.7 + sin(vW.x * 1.7 - uTime * 0.4) * 2.0);
    // Fade beam surfaces near the lens so close/tracked shots never look through a cone.
    float a = along * facing * uAlpha * haze * smoothstep(1.2, 4.5, vDist);
    gl_FragColor = vec4(uColor * a, a);
  }`

const wallFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uBeat;
  uniform float uEnergy;
  uniform float uFever;
  uniform float uFlash;
  uniform float uBright;
  uniform float uBands[16];
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform sampler2D uText;
  uniform float uTextAmt;
  void main() {
    vec2 grid = vec2(160.0, 60.0);
    vec2 cell = floor(vUv * grid);
    vec2 f = fract(vUv * grid) - 0.5;
    float dotMask = smoothstep(0.5, 0.2, length(f));
    vec2 c = (cell + 0.5) / grid;
    // Mirrored spectrum: bass in the centre, highs at the edges.
    float xm = abs(c.x - 0.5) * 2.0;
    int bi = int(clamp(floor(xm * 16.0), 0.0, 15.0));
    float band = 0.0;
    for (int i = 0; i < 16; i++) if (i == bi) band = uBands[i];
    float y = abs(c.y - 0.5) * 2.0;
    float h = 0.04 + band * (0.55 + 0.35 * uEnergy);
    float bars = step(y, h) * step(0.2, fract(xm * 16.0));
    float wave = 0.5 + 0.5 * sin(c.x * 7.0 + uTime * 0.9 + sin(c.y * 4.0 + uTime * 0.5) * 2.0);
    vec3 bg = mix(uA, uB, wave) * (0.06 + 0.05 * uBeat);
    vec3 barCol = mix(uB, uA, clamp(y / max(h, 0.01), 0.0, 1.0));
    vec3 color = bg + bars * barCol * (0.45 + 0.3 * uBeat);
    float chev = step(0.55, fract((xm * 1.4 + y * 0.35) * 5.0 - uTime * 1.6));
    color = mix(color, color + uC * chev * 0.35, uFever);
    float ring = smoothstep(0.025, 0.0, abs(length((c - 0.5) * vec2(2.6, 1.0)) - fract(uTime * 0.45) * 1.4));
    color += ring * uC * 0.35 * uEnergy;
    float txt = texture2D(uText, c).r;
    color = mix(color, uC * 1.4 * txt + color * (1.0 - txt) * 0.35, uTextAmt);
    color *= uBright * (1.0 + uFlash * 0.8);
    gl_FragColor = vec4(color * dotMask, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

type Fixture = { head: THREE.Group; mat: THREE.ShaderMaterial; lens: THREE.MeshBasicMaterial; pool: THREE.Mesh; poolMat: THREE.MeshBasicMaterial; phase: number; x: number; color: number }

export class Stage {
  readonly scene = new THREE.Scene()
  /** World anchors for the lip pyro gerbs and CO2 cannons. */
  readonly pyroPoints: THREE.Vector3[] = [-5.4, -2.2, 2.2, 5.4].map((x) => new THREE.Vector3(x, 0.02, STAGE_FRONT - 0.25))
  readonly co2Points: THREE.Vector3[] = [-6.6, 6.6].map((x) => new THREE.Vector3(x, 0.3, STAGE_FRONT - 0.6))
  private readonly fixtures: Fixture[] = []
  private readonly wall: THREE.ShaderMaterial
  private readonly textCanvas: HTMLCanvasElement
  private readonly textTex: THREE.CanvasTexture
  private textAmt = 0
  private textHold = 0
  private readonly lasers: Array<{ mesh: THREE.Mesh; phase: number }> = []
  private readonly laserMat: THREE.MeshBasicMaterial
  private readonly crowdMats: THREE.MeshBasicMaterial[] = []
  private readonly crowdU = { uBeat: { value: 0 }, uEnergy: { value: 0.5 } }
  private readonly sticks: THREE.Points
  private readonly stickBase: Float32Array
  private readonly haze: THREE.Sprite[] = []
  private readonly lip: THREE.MeshBasicMaterial
  private readonly riserEdge: THREE.MeshBasicMaterial
  private readonly key: THREE.SpotLight
  private readonly rims: THREE.SpotLight[] = []
  private readonly fills: THREE.SpotLight[] = []
  private readonly hemi: THREE.HemisphereLight
  private palette: { a: THREE.Color; b: THREE.Color; c: THREE.Color }
  private readonly tmpC = new THREE.Color()
  private readonly v = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private time = 0
  private spot = 0

  constructor(gl: THREE.WebGLRenderer, palette: Palette, tex: StageTextures) {
    const scene = this.scene
    this.palette = { a: new THREE.Color(palette.a), b: new THREE.Color(palette.b), c: new THREE.Color(palette.c) }
    scene.background = new THREE.Color('#06051a')
    scene.fog = new THREE.FogExp2('#0a0820', 0.022)
    const pm = new THREE.PMREMGenerator(gl)
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.28
    pm.dispose()

    // ── stage body ───────────────────────────────────────────────────────
    const floorTex = tex.floor
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(5, 2.5)
    const top = new THREE.MeshStandardMaterial({ map: floorTex, color: '#8a8794', roughness: 0.74, metalness: 0.12, envMapIntensity: 0.22 })
    const side = new THREE.MeshStandardMaterial({ color: '#0d0c14', roughness: 0.9 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 7.5), [side, side, top, side, side, side])
    body.position.set(0, -0.3, STAGE_FRONT - 3.75)
    scene.add(body)
    this.lip = new THREE.MeshBasicMaterial({ color: this.palette.a.clone().multiplyScalar(0.5) })
    const lip = new THREE.Mesh(new THREE.BoxGeometry(15, 0.025, 0.025), this.lip)
    lip.position.set(0, -0.03, STAGE_FRONT + 0.005)
    scene.add(lip)
    const lip2 = lip.clone()
    lip2.position.y = -0.56
    scene.add(lip2)
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: '#07060d', roughness: 0.95 }))
    pit.rotation.x = -Math.PI / 2
    pit.position.set(0, -0.6, 10)
    scene.add(pit)

    // Lead riser for the headliner rival.
    const riser = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.6), [side, side, top, side, side, side])
    riser.position.set(0, 0.275, -2.9)
    scene.add(riser)
    this.riserEdge = new THREE.MeshBasicMaterial({ color: this.palette.c.clone().multiplyScalar(0.35) })
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.02, 0.02), this.riserEdge)
    edge.position.set(0, 0.54, -2.1)
    scene.add(edge)

    // ── LED wall ─────────────────────────────────────────────────────────
    this.textCanvas = document.createElement('canvas')
    this.textCanvas.width = 1024
    this.textCanvas.height = 384
    this.textTex = new THREE.CanvasTexture(this.textCanvas)
    this.wall = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBeat: { value: 0 }, uEnergy: { value: 0.5 }, uFever: { value: 0 }, uFlash: { value: 0 },
        uBright: { value: 0.55 }, uBands: { value: new Array(16).fill(0) },
        uA: { value: this.palette.a }, uB: { value: this.palette.b }, uC: { value: this.palette.c },
        uText: { value: this.textTex }, uTextAmt: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: wallFrag,
      fog: false,
    })
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(17, 6.4), this.wall)
    wall.position.set(0, 3.4, WALL_Z)
    scene.add(wall)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17.6, 7, 0.3), side)
    frame.position.set(0, 3.4, WALL_Z - 0.18)
    scene.add(frame)

    // ── truss + fixtures ────────────────────────────────────────────────
    const metal = new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.5, metalness: 0.7, envMapIntensity: 0.3 })
    const segs: Array<[THREE.Vector3, THREE.Vector3]> = []
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
    const trussLine = (a: THREE.Vector3, b: THREE.Vector3, w = 0.35) => {
      const d = b.clone().sub(a)
      const len = d.length()
      const n = Math.max(2, Math.round(len / 0.6))
      const up = Math.abs(d.y) > len * 0.9 ? V(1, 0, 0) : V(0, 1, 0)
      const s1 = d.clone().cross(up).normalize().multiplyScalar(w / 2)
      const s2 = up.clone().multiplyScalar(w / 2)
      const rails = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().add(s2), s1.clone().negate().sub(s2)]
      for (const r of rails) segs.push([a.clone().add(r), b.clone().add(r)])
      for (let i = 0; i < n; i++) {
        const p0 = a.clone().lerp(b, i / n)
        const p1 = a.clone().lerp(b, (i + 1) / n)
        segs.push([p0.clone().add(rails[i % 2 ? 0 : 1]), p1.clone().add(rails[i % 2 ? 1 : 0])])
        segs.push([p0.clone().add(rails[i % 2 ? 2 : 3]), p1.clone().add(rails[i % 2 ? 3 : 2])])
      }
    }
    trussLine(V(-7.6, 6.4, -0.6), V(7.6, 6.4, -0.6))
    trussLine(V(-7.6, 6.4, 2.4), V(7.6, 6.4, 2.4))
    trussLine(V(-7.6, -0.6, -0.6), V(-7.6, 6.4, -0.6))
    trussLine(V(7.6, -0.6, -0.6), V(7.6, 6.4, -0.6))
    const tube = new THREE.CylinderGeometry(0.025, 0.025, 1, 6)
    const inst = new THREE.InstancedMesh(tube, metal, segs.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    segs.forEach(([a, b], i) => {
      const d = b.clone().sub(a)
      q.setFromUnitVectors(V(0, 1, 0), d.clone().normalize())
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, d.length(), 1))
      inst.setMatrixAt(i, m)
    })
    scene.add(inst)

    const beamLen = 9
    const beamGeo = new THREE.CylinderGeometry(0.06, 1.25, beamLen, 28, 1, true)
    beamGeo.translate(0, -beamLen / 2, 0)
    const poolTex = radialTexture()
    const fixtureGeo = new THREE.BoxGeometry(0.3, 0.26, 0.3)
    const lensGeo = new THREE.CircleGeometry(0.1, 20)
    lensGeo.rotateX(Math.PI / 2)
    const xs = [-6.3, -4.5, -2.7, -0.9, 0.9, 2.7, 4.5, 6.3]
    for (const [row, z] of [[0, -0.6], [1, 2.4]] as const) {
      xs.forEach((x, i) => {
        if (row === 1 && i % 2 === 0) return
        const mount = new THREE.Group()
        mount.position.set(x, 6.1, z)
        scene.add(mount)
        const yoke = new THREE.Mesh(fixtureGeo, metal)
        yoke.position.y = 0.12
        mount.add(yoke)
        const head = new THREE.Group()
        mount.add(head)
        const lens = new THREE.MeshBasicMaterial({ color: '#ffffff' })
        const lm = new THREE.Mesh(lensGeo, lens)
        lm.position.y = -0.02
        head.add(lm)
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.3 }, uLen: { value: beamLen }, uTime: { value: 0 } },
          vertexShader: beamVert,
          fragmentShader: beamFrag,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
        const cone = new THREE.Mesh(beamGeo, mat)
        cone.renderOrder = 2
        head.add(cone)
        const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 })
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat)
        pool.rotation.x = -Math.PI / 2
        pool.renderOrder = 1
        scene.add(pool)
        this.fixtures.push({ head, mat, lens, pool, poolMat, phase: i * 0.7 + row * 1.9, x, color: i % 3 })
      })
    }

    // ── lasers ──────────────────────────────────────────────────────────
    this.laserMat = new THREE.MeshBasicMaterial({ color: this.palette.b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const laserGeo = new THREE.BoxGeometry(0.018, 0.018, 34)
    laserGeo.translate(0, 0, 17)
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(laserGeo, this.laserMat)
      mesh.position.set(i < 5 ? -8 + i * 0.12 : 8 - (i - 5) * 0.12, 6.9, WALL_Z + 0.4)
      scene.add(mesh)
      this.lasers.push({ mesh, phase: i * 0.63 })
    }

    // ── speakers + pyro/CO2 hardware ────────────────────────────────────
    const grille = new THREE.MeshStandardMaterial({ map: speakerTexture(), roughness: 0.85, metalness: 0.1 })
    for (const x of [-7.2, 7.2]) {
      for (let k = 0; k < 2; k++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.25, 1.0), [side, side, side, side, grille, side])
        cab.position.set(x, 0.63 + k * 1.27, -0.2)
        cab.rotation.y = -Math.sign(x) * 0.2
        scene.add(cab)
      }
    }
    const canMat = new THREE.MeshStandardMaterial({ color: '#16151c', roughness: 0.6, metalness: 0.5 })
    for (const p of this.pyroPoints) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), canMat)
      can.position.copy(p).setY(0.07)
      scene.add(can)
    }
    for (const p of this.co2Points) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.6, 12), canMat)
      can.position.copy(p).setY(0.3)
      scene.add(can)
    }

    // ── crowd ───────────────────────────────────────────────────────────
    tex.crowd.colorSpace = THREE.SRGBColorSpace
    const crowdGeo = new THREE.PlaneGeometry(1, 1, 64, 1)
    const layers = [
      { z: 6.8, y: -0.62, w: 17, dark: 0.9, flip: false },
      { z: 5.4, y: -0.95, w: 15, dark: 0.55, flip: true },
    ]
    for (const L of layers) {
      const mat = new THREE.MeshBasicMaterial({ map: tex.crowd, transparent: true, alphaTest: 0.08, depthWrite: true, fog: true })
      mat.color.setScalar(L.dark)
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uBeat = this.crowdU.uBeat
        sh.uniforms.uEnergy = this.crowdU.uEnergy
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uBeat; uniform float uEnergy;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
float seg = floor(uv.x * 22.0);
float ph = fract(sin(seg * 91.7) * 4375.85);
float jump = pow(max(0.0, sin((uBeat + ph * 2.0) * 3.14159)), 3.0);
transformed.y += jump * 0.028 * uEnergy * uv.y + sin(uBeat * 1.5708 + ph * 6.28) * 0.004 * uv.y;`)
      }
      mat.customProgramCacheKey = () => 'crowd'
      this.crowdMats.push(mat)
      const h = (L.w * 396) / 2048
      const mesh = new THREE.Mesh(crowdGeo, mat)
      mesh.scale.set(L.flip ? -L.w : L.w, h, 1)
      mesh.position.set(0, L.y + h / 2, L.z)
      mesh.renderOrder = 3
      scene.add(mesh)
    }
    // Extra lightsticks above the crowd (additive points, sway with the beat).
    const N = 70
    const sp = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    this.stickBase = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const z = 5.3 + Math.random() * 1.8
      sp[i * 3] = this.stickBase[i * 3] = (Math.random() - 0.5) * 15
      sp[i * 3 + 1] = this.stickBase[i * 3 + 1] = 0.4 + Math.random() * 0.8 - (z - 5.3) * 0.1
      sp[i * 3 + 2] = this.stickBase[i * 3 + 2] = z
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.sticks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.16, map: poolTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }))
    scene.add(this.sticks)

    // ── haze sprites ────────────────────────────────────────────────────
    const smoke = tex.atlas.clone()
    const cell = 16 // smoke_07 in the 5x5 atlas
    smoke.repeat.set(0.2, 0.2)
    smoke.offset.set((cell % 5) * 0.2, 1 - (Math.floor(cell / 5) + 1) * 0.2)
    smoke.needsUpdate = true
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: '#6f64b8', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }))
      s.position.set((i - 4) * 2 + Math.random(), 2 + Math.random() * 3, -2.5 + Math.random() * 3)
      s.scale.setScalar(6 + Math.random() * 3)
      s.material.rotation = Math.random() * 6.28
      scene.add(s)
      this.haze.push(s)
    }

    // ── lights ──────────────────────────────────────────────────────────
    this.hemi = new THREE.HemisphereLight('#7a70d8', '#120c20', 0.55)
    scene.add(this.hemi)
    const front = new THREE.DirectionalLight('#b8b2ff', 0.35)
    front.position.set(0, 4, 10)
    scene.add(front)
    this.key = spot('#fff3e2', 140, [0.6, 8.5, 7.5], [0, 1.1, 1], 0.2, 0.55)
    scene.add(this.key, this.key.target)
    for (const [x, c] of [[-5, 'a'], [5, 'b']] as const) {
      const r = spot(this.palette[c], 120, [x, 6.5, -3.5], [0, 1.2, 1], 0.32, 0.8)
      this.rims.push(r)
      scene.add(r, r.target)
    }
    for (const [pos, target] of [
      [[-4.5, 7, 5], [-3.1, 1, -0.5]],
      [[4.5, 7, 5], [3.1, 1, -0.5]],
      [[0, 8, 2], [0, 1.4, -2.9]],
    ] as const) {
      const f = spot('#d8d0ff', 70, pos as unknown as number[], target as unknown as number[], 0.2, 0.7)
      this.fills.push(f)
      scene.add(f, f.target)
    }
  }

  setPalette(p: Palette): void {
    this.palette.a.set(p.a)
    this.palette.b.set(p.b)
    this.palette.c.set(p.c)
    this.lip.color.copy(this.palette.a).multiplyScalar(0.5)
    this.riserEdge.color.copy(this.palette.c).multiplyScalar(0.35)
    this.rims[0].color.copy(this.palette.a)
    this.rims[1].color.copy(this.palette.b)
  }

  /** Show big text on the LED wall for `seconds` ("25 COMBO", "FEVER", "SPOTLIGHT"). */
  wallText(text: string, seconds = 1.6): void {
    const c = this.textCanvas
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 230
    g.font = `italic 900 ${size}px Sora, system-ui, sans-serif`
    while (g.measureText(text).width > c.width * 0.86 && size > 60) {
      size -= 10
      g.font = `italic 900 ${size}px Sora, system-ui, sans-serif`
    }
    g.fillText(text, c.width / 2, c.height / 2 + 8)
    this.textTex.needsUpdate = true
    this.textHold = seconds
  }

  update(dt: number, s: StageState, calm: boolean): void {
    this.time += dt
    const t = this.time
    const P = this.palette
    const phase = ((s.beat % 1) + 1) % 1
    const pulse = Math.pow(1 - phase, 3)
    const energy = Math.min(1.3, s.intensity + (s.fever ? 0.25 : 0))
    this.spot += ((s.spotlight ?? 0) - this.spot) * (1 - Math.exp(-dt * 5))
    const dim = 1 - this.spot * 0.6
    const colors = [P.a, P.b, P.c]

    // Fixtures: slow sweeps in calm sections, beat-locked sweeps in drops.
    const drive = calm ? 0.5 : 1
    this.fixtures.forEach((f, i) => {
      const fast = energy > 0.85 && !calm
      const pan = fast ? Math.sin((s.beat * Math.PI) / 2 + f.phase) * 0.55 : Math.sin(t * 0.33 * drive + f.phase) * 0.45
      const tilt = fast ? 0.25 + 0.22 * Math.sin((s.beat * Math.PI) / 4 + f.phase * 1.3) : 0.3 + 0.16 * Math.sin(t * 0.21 + f.phase)
      // Aim toward centre stage, with the sweep on top.
      f.head.rotation.set(tilt - (f.head.parent!.position.z > 1 ? 0.35 : -0.12), 0, pan - f.x * 0.05)
      const cIdx = s.fever ? (i + Math.floor(s.beat / 2)) % 3 : f.color
      this.tmpC.copy(colors[cIdx])
      const flash = s.flash * (i % 2 === 0 ? 1 : 0.6)
      const a = (0.1 + energy * 0.16 + pulse * 0.08 * energy + flash * 0.18) * (1 - s.miss * 0.7) * dim
      f.mat.uniforms.uColor.value.copy(this.tmpC)
      f.mat.uniforms.uAlpha.value = a
      f.mat.uniforms.uTime.value = t
      f.lens.color.copy(this.tmpC).multiplyScalar(1.2 + a * 5)
      // Floor pool where the beam axis meets the stage.
      f.head.updateWorldMatrix(true, false)
      this.v.setFromMatrixPosition(f.head.matrixWorld)
      this.dir.set(0, -1, 0).transformDirection(f.head.matrixWorld)
      const k = this.dir.y < -0.05 ? -this.v.y / this.dir.y : 0
      if (k > 0 && k < 11) {
        f.pool.visible = true
        f.pool.position.copy(this.v).addScaledVector(this.dir, k).setY(0.012)
        const r = 0.35 + k * 0.19
        f.pool.scale.set(r * 2, r * 2 / Math.max(0.35, -this.dir.y), 1)
        f.poolMat.color.copy(this.tmpC)
        f.poolMat.opacity = a * 0.9
      } else f.pool.visible = false
    })

    // Lasers.
    const lz = s.lasers ?? (s.fever ? 1 : 0)
    this.laserMat.opacity += (lz * 0.55 - this.laserMat.opacity) * (1 - Math.exp(-dt * 6))
    this.laserMat.color.copy(s.fever ? colors[Math.floor(s.beat) % 3] : P.b)
    const lv = this.laserMat.opacity > 0.01
    for (const l of this.lasers) {
      l.mesh.visible = lv
      if (!lv) continue
      l.mesh.rotation.set(0.12 + Math.sin(s.beat * 0.5 + l.phase) * 0.18, (l.mesh.position.x < 0 ? 0.55 : -0.55) + Math.sin(s.beat * 0.25 * Math.PI + l.phase) * 0.4, 0)
    }

    // LED wall.
    const w = this.wall.uniforms
    w.uTime.value = t
    w.uBeat.value = pulse
    w.uEnergy.value = energy
    w.uFever.value += ((s.fever ? 1 : 0) - w.uFever.value) * (1 - Math.exp(-dt * 3))
    w.uFlash.value = s.flash
    w.uBright.value = (0.5 + energy * 0.12) * (1 - s.miss * 0.5) * (1 - this.spot * 0.5)
    const bands = w.uBands.value as number[]
    for (let i = 0; i < 16; i++) {
      const target = s.bands ? s.bands[i] : 0.25 + 0.2 * Math.sin(t * 2 + i) * energy
      bands[i] += (target - bands[i]) * (1 - Math.exp(-dt * 18))
    }
    if (this.textHold > 0) this.textHold -= dt
    this.textAmt += ((this.textHold > 0 ? 1 : 0) - this.textAmt) * (1 - Math.exp(-dt * 8))
    w.uTextAmt.value = this.textAmt

    // Lip strip & riser edge breathe gently with the beat.
    this.lip.color.copy(P.a).multiplyScalar((0.32 + pulse * 0.25 * energy) * dim)
    this.riserEdge.color.copy(P.c).multiplyScalar(0.25 + pulse * 0.1)

    // Crowd bob + lightsticks.
    this.crowdU.uBeat.value = s.beat
    this.crowdU.uEnergy.value = calm ? 0.2 : 0.4 + energy * 0.8 + s.flash * 0.6
    const pos = this.sticks.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = this.sticks.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const sway = Math.sin((s.beat * Math.PI) / 2 + i * 1.7) * (0.1 + energy * 0.2)
      pos.setX(i, this.stickBase[i * 3] + sway)
      pos.setY(i, this.stickBase[i * 3 + 1] + Math.abs(Math.sin((s.beat + i * 0.37) * Math.PI)) * 0.06 * energy)
      this.tmpC.copy(colors[i % 3]).multiplyScalar(0.5 + energy * 0.5 + s.flash * 0.4)
      col.setXYZ(i, this.tmpC.r, this.tmpC.g, this.tmpC.b)
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    for (let i = 0; i < this.haze.length; i++) {
      const h = this.haze[i]
      h.material.rotation += dt * 0.03 * (i % 2 ? 1 : -1)
      h.position.x += Math.sin(t * 0.1 + i) * dt * 0.05
      h.material.opacity = 0.05 + energy * 0.03
      h.material.color.copy(colors[i % 3]).lerp(this.tmpC.set('#4a4380'), 0.6)
    }

    // Lights.
    // Keep the key soft: spotlight/flash boosts only lift YOU slightly (the rest of the stage dims instead).
    this.key.intensity = (140 + s.flash * 25 + this.spot * 45) * (1 - s.miss * 0.35)
    this.key.angle = 0.2 + this.spot * 0.03
    this.rims.forEach((r, i) => {
      r.intensity = (80 + energy * 60 + pulse * 40 * energy) * (1 - s.miss * 0.6) * (1 - this.spot * 0.3)
      if (s.fever) r.color.copy(colors[(i + Math.floor(s.beat)) % 3])
    })
    for (const f of this.fills) f.intensity = 60 * dim * (1 - s.miss * 0.5)
    this.hemi.intensity = (0.5 + energy * 0.15) * dim
  }
}

function spot(color: THREE.ColorRepresentation, intensity: number, pos: readonly number[], target: readonly number[], angle: number, penumbra: number): THREE.SpotLight {
  const s = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2)
  s.position.set(pos[0], pos[1], pos[2])
  s.target.position.set(target[0], target[1], target[2])
  return s
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function speakerTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#121118'
  g.fillRect(0, 0, 256, 256)
  const cone = (x: number, y: number, r: number) => {
    const grad = g.createRadialGradient(x, y, r * 0.1, x, y, r)
    grad.addColorStop(0, '#2a2833')
    grad.addColorStop(0.6, '#0b0a10')
    grad.addColorStop(0.9, '#23212b')
    grad.addColorStop(1, '#0a090e')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  cone(128, 150, 88)
  cone(70, 40, 26)
  cone(186, 40, 26)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
