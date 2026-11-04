import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MonsterAnimator } from '../game/monsters/animator'
import { animateFeatures } from '../game/monsters/features'
import { MONSTERS, monsterById, type MonsterDef } from '../game/monsters/defs'
import { orientationOverride, setOrientationOverride } from '../game/monsters/orientation'
import { PREVIEW_BEHAVIOURS, previewDuration, previewPose, type PreviewBehaviour } from '../game/monsters/poses'
import { buildMonster, refreshRigWorld, setMonsterTextureSource, type MonsterRig } from '../game/monsters/rig'
import { setMonsterModelSource } from '../game/monsters/meshRig'
import { Assets } from '../engine/assets'
import { MANIFEST } from '../game/manifest'
import './enemies.css'

/**
 * /enemies — asset library and orientation debugger. Inspect every quarry, swap models, rotate
 * the correction quaternion with exact quaternion or Euler input, verify facing against the game
 * convention (+Z forward, +Y up), preview behaviours and compare abilities and stats.
 */
const ORDERS: THREE.EulerOrder[] = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY']
const DEG = 180 / Math.PI
const STAT_ROWS: { key: keyof MonsterDef['stats']; label: string; unit: string; fmt?: (v: number) => string }[] = [
  { key: 'hp', label: 'Vitality', unit: '' },
  { key: 'walkSpeed', label: 'Walk speed', unit: 'm/s' },
  { key: 'runSpeed', label: 'Charge speed', unit: 'm/s' },
  { key: 'turnRate', label: 'Turn rate', unit: 'rad/s' },
  { key: 'damage', label: 'Damage multiplier', unit: '×' },
  { key: 'aggression', label: 'Aggression', unit: '×' },
  { key: 'telegraph', label: 'Telegraph time', unit: '×' },
  { key: 'rageAt', label: 'Enrage threshold', unit: '', fmt: v => `${Math.round(v * 100)}% HP` },
  { key: 'volleyCount', label: 'Volley projectiles', unit: '' },
]

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fx = (n: number, d = 4) => (Math.abs(n) < 5e-5 ? 0 : n).toFixed(d)

const assets = new Assets(MANIFEST, /\/enemies\/$/.test(location.pathname) ? '../' : '')
setMonsterTextureSource(key => assets.texture(key))
setMonsterModelSource(key => assets.maybeGltf(key))
/** All monster textures; the shown model is rebuilt once they land so it never keeps placeholder hides. */
const texturesReady = Promise.all(['stage:mossback', 'lib', 'stage:ashwing', 'stage:tidehorn'].map(b => assets.bundle(b).catch(() => undefined)))

class Library {
  private readonly root = document.querySelector<HTMLElement>('#lib')!
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800)
  private readonly controls: OrbitControls
  private readonly viewport: HTMLElement
  private rig!: MonsterRig
  private animator!: MonsterAnimator
  private def!: MonsterDef
  private behaviour: PreviewBehaviour = 'idle'
  private t = 0
  private speed = 1
  private playing = true
  private turntable = false
  private order: THREE.EulerOrder = 'XYZ'
  private overlays = { spheres: false, anchors: true, axes: true, bounds: false, grid: true }
  private readonly sphereGroup = new THREE.Group()
  private readonly anchorGroup = new THREE.Group()
  private readonly axes = new THREE.Group()
  private readonly grid: THREE.GridHelper
  private readonly bounds = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#7fe8ff'))
  private readonly labels: HTMLElement
  private readonly clock = new THREE.Clock()
  private treadmillOffset = 0
  private readonly floorTex: THREE.CanvasTexture

  constructor() {
    this.root.innerHTML = this.layout()
    this.viewport = $(this.root, '.lib-view')
    this.labels = $(this.root, '.lib-labels')
    const canvas = $<HTMLCanvasElement>(this.root, 'canvas.lib-canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.45
    this.scene.background = new THREE.Color('#1b1915')
    this.scene.fog = new THREE.Fog('#1b1915', 80, 220)
    const hemi = new THREE.HemisphereLight('#cfe0ff', '#4a3d2a', 1.1)
    const sun = new THREE.DirectionalLight('#fff0d6', 2.6)
    sun.position.set(18, 30, 14)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -30
    sc.right = sc.top = 30
    sc.far = 90
    this.scene.add(hemi, sun)
    // Floor with a subtle tiled texture so treadmill motion reads.
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    g.fillStyle = '#2a2620'
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#322d25'
    g.fillRect(0, 0, 64, 64)
    g.fillRect(64, 64, 64, 64)
    this.floorTex = new THREE.CanvasTexture(c)
    this.floorTex.wrapS = this.floorTex.wrapT = THREE.RepeatWrapping
    this.floorTex.repeat.set(40, 40)
    this.floorTex.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 0.95 }))
    floor.receiveShadow = true
    this.scene.add(floor)
    this.grid = new THREE.GridHelper(80, 40, '#6b5d45', '#3a342a')
    this.grid.position.y = 0.01
    this.scene.add(this.grid, this.sphereGroup, this.anchorGroup, this.axes, this.bounds)
    this.buildAxes()
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.target.set(0, 5, 0)
    this.camera.position.set(28, 14, 30)
    new ResizeObserver(() => this.resize()).observe(this.viewport)
    this.bind()
    const params = new URLSearchParams(location.search)
    this.load(params.get('m') ?? MONSTERS[0].id)
    void texturesReady.then(() => this.load(this.def.id))
    this.renderCompare()
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  // ─── layout ────────────────────────────────────────────────────────────
  private layout(): string {
    const list = MONSTERS.map(
      m => `<button class="lib-item" data-m="${m.id}" style="--glow:${m.palette.glow}"><b>${esc(m.name)}</b><span>${esc(m.title)}</span><em>Source facing ${m.plan.sourceFacing}</em></button>`,
    ).join('')
    const beh = PREVIEW_BEHAVIOURS.map(b => `<button data-b="${b}">${b}</button>`).join('')
    const axisBtns = ['X', 'Y', 'Z'].map(a => `<div class="rot-row"><span>${a}</span><button data-rot="${a}:-90">−90°</button><button data-rot="${a}:-15">−15°</button><button data-rot="${a}:-1">−1°</button><button data-rot="${a}:1">+1°</button><button data-rot="${a}:15">+15°</button><button data-rot="${a}:90">+90°</button></div>`).join('')
    return `
    <header class="lib-head">
      <a class="lib-back" href="../">← Back to the hunt</a>
      <h1>Colossus Field Guide</h1>
      <span class="lib-sub">Model inspection · orientation debugging · ability comparison</span>
      <nav class="lib-tabs"><button data-tab="inspect" class="on">Inspect</button><button data-tab="compare">Compare</button></nav>
    </header>
    <main class="lib-main" data-tab="inspect">
      <aside class="lib-list">
        <h2>Models</h2>
        ${list}
        <div class="lib-info"></div>
      </aside>
      <section class="lib-view">
        <canvas class="lib-canvas"></canvas>
        <div class="lib-labels"></div>
        <div class="lib-hud">
          <div class="lib-check"></div>
          <div class="lib-views"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button data-view="top">Top</button><button data-view="iso">Iso</button><button data-toggle="turntable">Turntable</button></div>
        </div>
        <div class="lib-anim">
          <div class="lib-beh">${beh}</div>
          <div class="lib-timeline">
            <button data-play>Pause</button>
            <input type="range" class="scrub" min="0" max="1" step="0.001" value="0" />
            <label>Speed <select class="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
          </div>
        </div>
        <section class="lib-compare"></section>
      </section>
      <aside class="lib-panel">
        <h2>Orientation</h2>
        <p class="note">Correction applied on top of the model's source orientation. Game convention: faces <b>+Z</b>, up is <b>+Y</b>.</p>
        <h3>Quaternion</h3>
        <div class="quat">
          ${['x', 'y', 'z', 'w'].map(k => `<label>${k}<input type="number" step="0.0001" data-q="${k}" /></label>`).join('')}
        </div>
        <div class="row"><button data-act="normalize">Normalize</button><button data-act="identity">Identity</button><button data-act="default">Registry default</button></div>
        <h3>Euler (degrees)</h3>
        <label class="order">Order <select class="eorder">${ORDERS.map(o => `<option>${o}</option>`).join('')}</select></label>
        ${['x', 'y', 'z']
          .map(k => `<div class="euler"><span>${k.toUpperCase()}</span><input type="range" min="-180" max="180" step="0.1" data-e="${k}" /><input type="number" min="-180" max="180" step="0.1" data-en="${k}" /></div>`)
          .join('')}
        <h3>Rotate about world axis</h3>
        ${axisBtns}
        <h3>Result</h3>
        <pre class="readout"></pre>
        <div class="row"><button data-act="copy">Copy for defs.ts</button><button data-act="copyjson">Copy JSON</button></div>
        <label class="apply"><input type="checkbox" class="apply-game" /> Apply in game (this browser)</label>
        <h3>Overlays</h3>
        <div class="overlays">
          ${Object.keys(this.overlays).map(k => `<label><input type="checkbox" data-ov="${k}" ${this.overlays[k as keyof typeof this.overlays] ? 'checked' : ''}/> ${({ spheres: 'Hit spheres', anchors: 'Grapple anchors', axes: 'Axes & facing', bounds: 'Bounding box', grid: 'Grid' } as Record<string, string>)[k]}</label>`).join('')}
        </div>
      </aside>
    </main>`
  }

  private bind(): void {
    const r = this.root
    r.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button')
      if (!el) return
      if (el.dataset.m) this.load(el.dataset.m)
      if (el.dataset.b) this.setBehaviour(el.dataset.b as PreviewBehaviour)
      if (el.dataset.view) this.setView(el.dataset.view)
      if (el.dataset.toggle === 'turntable') {
        this.turntable = !this.turntable
        el.classList.toggle('on', this.turntable)
      }
      if (el.dataset.tab) {
        r.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b === el))
        $(r, '.lib-main').dataset.tab = el.dataset.tab
      }
      if (el.hasAttribute('data-play')) {
        this.playing = !this.playing
        el.textContent = this.playing ? 'Pause' : 'Play'
      }
      if (el.dataset.rot) {
        const [axis, deg] = el.dataset.rot.split(':')
        const v = new THREE.Vector3(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0)
        const q = new THREE.Quaternion().setFromAxisAngle(v, Number(deg) / DEG)
        this.setQuat(q.multiply(this.rig.orient.quaternion))
      }
      const act = el.dataset.act
      if (act === 'normalize') this.setQuat(this.rig.orient.quaternion.clone().normalize())
      if (act === 'identity') this.setQuat(new THREE.Quaternion())
      if (act === 'default') this.setQuat(new THREE.Quaternion(...this.def.orientation))
      if (act === 'copy' || act === 'copyjson') {
        const q = this.rig.orient.quaternion
        const text = act === 'copy' ? `orientation: [${fx(q.x)}, ${fx(q.y)}, ${fx(q.z)}, ${fx(q.w)}],` : JSON.stringify({ id: this.def.id, orientation: [q.x, q.y, q.z, q.w].map(n => Number(fx(n, 6))) })
        void navigator.clipboard?.writeText(text).catch(() => undefined)
        el.textContent = 'Copied'
        setTimeout(() => (el.textContent = act === 'copy' ? 'Copy for defs.ts' : 'Copy JSON'), 1200)
      }
    })
    r.querySelectorAll<HTMLInputElement>('[data-q]').forEach(inp =>
      inp.addEventListener('change', () => {
        const v = (k: string) => Number($<HTMLInputElement>(r, `[data-q="${k}"]`).value) || 0
        const q = new THREE.Quaternion(v('x'), v('y'), v('z'), v('w'))
        if (q.lengthSq() < 1e-8) q.identity()
        this.setQuat(q.normalize())
      }),
    )
    const eulerFrom = (src: 'range' | 'number') => {
      const read = (k: string) => Number($<HTMLInputElement>(r, src === 'range' ? `[data-e="${k}"]` : `[data-en="${k}"]`).value) || 0
      const e = new THREE.Euler(read('x') / DEG, read('y') / DEG, read('z') / DEG, this.order)
      this.setQuat(new THREE.Quaternion().setFromEuler(e), src)
    }
    r.querySelectorAll<HTMLInputElement>('[data-e]').forEach(inp => inp.addEventListener('input', () => eulerFrom('range')))
    r.querySelectorAll<HTMLInputElement>('[data-en]').forEach(inp => inp.addEventListener('change', () => eulerFrom('number')))
    $<HTMLSelectElement>(r, '.eorder').addEventListener('change', e => {
      this.order = (e.target as HTMLSelectElement).value as THREE.EulerOrder
      this.syncInputs()
    })
    $<HTMLSelectElement>(r, '.speed').addEventListener('change', e => (this.speed = Number((e.target as HTMLSelectElement).value)))
    $<HTMLInputElement>(r, '.scrub').addEventListener('input', e => {
      this.playing = false
      $(r, '[data-play]').textContent = 'Play'
      this.t = Number((e.target as HTMLInputElement).value) * previewDuration(this.behaviour)
    })
    $<HTMLInputElement>(r, '.apply-game').addEventListener('change', e => {
      const on = (e.target as HTMLInputElement).checked
      const q = this.rig.orient.quaternion
      setOrientationOverride(this.def.id, on ? [q.x, q.y, q.z, q.w] : null)
    })
    r.querySelectorAll<HTMLInputElement>('[data-ov]').forEach(inp =>
      inp.addEventListener('change', () => {
        this.overlays[inp.dataset.ov as keyof typeof this.overlays] = inp.checked
        this.applyOverlays()
      }),
    )
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.code === 'Space') {
        e.preventDefault()
        ;($(r, '[data-play]') as HTMLButtonElement).click()
      }
    })
  }

  // ─── model ─────────────────────────────────────────────────────────────
  private load(id: string): void {
    const def = monsterById(id)
    if (this.rig) {
      this.scene.remove(this.rig.root)
      this.rig.dispose()
    }
    this.def = def
    this.rig = buildMonster(def)
    this.rig.root.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    this.scene.add(this.rig.root)
    this.animator = new MonsterAnimator(this.rig, false)
    this.animator.reset()
    this.buildDebug()
    this.t = 0
    this.root.querySelectorAll<HTMLElement>('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === id))
    $<HTMLInputElement>(this.root, '.apply-game').checked = !!orientationOverride(id)
    this.renderInfo()
    this.syncInputs()
    this.setBehaviour(this.behaviour)
    const h = this.rig.dims.height
    this.controls.target.set(0, h * 0.45, 0)
    if (!this.camera.userData.placed) {
      this.setView('iso')
      this.camera.userData.placed = true
    }
    const url = new URL(location.href)
    url.searchParams.set('m', id)
    history.replaceState(null, '', url)
  }

  private setQuat(q: THREE.Quaternion, from?: 'range' | 'number'): void {
    this.rig.orient.quaternion.copy(q)
    if ($<HTMLInputElement>(this.root, '.apply-game').checked) setOrientationOverride(this.def.id, [q.x, q.y, q.z, q.w])
    this.syncInputs(from)
  }

  private syncInputs(from?: 'range' | 'number'): void {
    const q = this.rig.orient.quaternion
    const r = this.root
    for (const k of ['x', 'y', 'z', 'w'] as const) $<HTMLInputElement>(r, `[data-q="${k}"]`).value = fx(q[k])
    const e = new THREE.Euler().setFromQuaternion(q, this.order)
    for (const k of ['x', 'y', 'z'] as const) {
      const deg = (e[k] * DEG).toFixed(1)
      if (from !== 'range') $<HTMLInputElement>(r, `[data-e="${k}"]`).value = deg
      if (from !== 'number') $<HTMLInputElement>(r, `[data-en="${k}"]`).value = deg
    }
    const d = new THREE.Quaternion(...this.def.orientation)
    const diff = (2 * Math.acos(Math.min(1, Math.abs(q.dot(d))))) * DEG
    $(r, '.readout').textContent = `quaternion  [${fx(q.x)}, ${fx(q.y)}, ${fx(q.z)}, ${fx(q.w)}]\neuler ${this.order}  (${(e.x * DEG).toFixed(2)}°, ${(e.y * DEG).toFixed(2)}°, ${(e.z * DEG).toFixed(2)}°)\nregistry     [${this.def.orientation.map(n => fx(n)).join(', ')}]\nΔ from registry  ${diff.toFixed(2)}°`
  }

  private renderInfo(): void {
    const d = this.def
    $(this.root, '.lib-info').innerHTML = `
      <h3 style="color:${d.palette.glow}">${esc(d.name)}</h3>
      <p>${esc(d.description)}</p>
      <dl>
        <dt>Habitat</dt><dd>${esc(d.habitat)}</dd>
        <dt>Threat</dt><dd>${'◆'.repeat(d.threat)}${'◇'.repeat(5 - d.threat)}</dd>
        <dt>Vitality</dt><dd>${d.stats.hp}</dd>
        <dt>Length</dt><dd>${this.rig.dims.length.toFixed(1)} m</dd>
        <dt>Height</dt><dd>${this.rig.dims.height.toFixed(1)} m</dd>
        <dt>Sculpt</dt><dd>${this.rig.stats.tris.toLocaleString('en')} tris · ${this.rig.stats.ms} ms</dd>
        <dt>Source</dt><dd>${d.plan.sourceFacing}</dd>
      </dl>
      <h4>Vital points</h4>
      <ul>${d.vitals.map(v => `<li><b>${esc(v.name)}</b> — ${esc(v.effect)}</li>`).join('')}</ul>`
  }

  private buildAxes(): void {
    const mk = (dir: THREE.Vector3, color: string, len: number) => new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0.05, 0), len, color, len * 0.12, len * 0.06)
    this.axes.add(mk(new THREE.Vector3(1, 0, 0), '#ff5a5a', 6), mk(new THREE.Vector3(0, 1, 0), '#7fe07a', 6), mk(new THREE.Vector3(0, 0, 1), '#5aa8ff', 14))
    this.axes.userData.facing = mk(new THREE.Vector3(0, 0, 1), '#ffd35c', 10)
    this.axes.add(this.axes.userData.facing as THREE.Object3D)
  }

  private buildDebug(): void {
    this.sphereGroup.clear()
    this.anchorGroup.clear()
    this.labels.innerHTML = ''
    const wire = new THREE.MeshBasicMaterial({ color: '#7fe8ff', wireframe: true, transparent: true, opacity: 0.35 })
    const vitalWire = new THREE.MeshBasicMaterial({ color: '#ffb347', wireframe: true, transparent: true, opacity: 0.6 })
    const geo = new THREE.IcosahedronGeometry(1, 1)
    for (const s of this.rig.hitSpheres) {
      const m = new THREE.Mesh(geo, s.vital ? vitalWire : wire)
      m.scale.setScalar(s.radius)
      this.sphereGroup.add(m)
    }
    const aGeo = new THREE.OctahedronGeometry(0.35)
    for (const a of this.rig.anchors) {
      const m = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: a.vital ? '#ffb347' : a.ride ? '#b48cff' : '#7fe8ff', depthTest: false }))
      m.renderOrder = 10
      this.anchorGroup.add(m)
      const label = document.createElement('span')
      label.className = `lib-label ${a.vital ? 'vital' : ''} ${a.ride ? 'ride' : ''}`
      label.textContent = a.label
      this.labels.append(label)
    }
    this.applyOverlays()
  }

  private applyOverlays(): void {
    this.sphereGroup.visible = this.overlays.spheres
    this.anchorGroup.visible = this.overlays.anchors
    this.labels.hidden = !this.overlays.anchors
    this.axes.visible = this.overlays.axes
    this.bounds.visible = this.overlays.bounds
    this.grid.visible = this.overlays.grid
  }

  private setBehaviour(b: PreviewBehaviour): void {
    this.behaviour = b
    this.t = 0
    this.root.querySelectorAll<HTMLElement>('[data-b]').forEach(el => el.classList.toggle('on', el.dataset.b === b))
  }

  private setView(v: string): void {
    const h = this.rig.dims.height
    const L = this.rig.dims.length
    const d = Math.max(L, h) * 1.35 + 6
    const tgt = this.controls.target
    const pos: Record<string, [number, number, number]> = {
      front: [0, h * 0.5, d],
      back: [0, h * 0.5, -d],
      side: [d, h * 0.5, 0],
      top: [0.01, d * 1.2, 0],
      iso: [d * 0.75, h * 0.9, d * 0.8],
    }
    const p = pos[v] ?? pos.iso
    this.camera.position.set(p[0], p[1], p[2])
    this.camera.lookAt(tgt)
  }

  // ─── compare ───────────────────────────────────────────────────────────
  private renderCompare(): void {
    const max = (k: keyof MonsterDef['stats']) => Math.max(...MONSTERS.map(m => m.stats[k]))
    const head = `<tr><th></th>${MONSTERS.map(m => `<th style="color:${m.palette.glow}">${esc(m.name)}</th>`).join('')}</tr>`
    const rows = STAT_ROWS.map(
      r =>
        `<tr><td>${r.label}</td>${MONSTERS.map(m => {
          const v = m.stats[r.key]
          const w = (v / max(r.key)) * 100
          return `<td><div class="cbar"><i style="width:${w}%;background:${m.palette.glow}"></i></div><span>${r.fmt ? r.fmt(v) : `${v}${r.unit ? ` ${r.unit}` : ''}`}</span></td>`
        }).join('')}</tr>`,
    ).join('')
    const parts = (['head', 'neck', 'body', 'leg', 'tail'] as const)
      .map(p => `<tr><td>${p[0].toUpperCase() + p.slice(1)} damage taken</td>${MONSTERS.map(m => `<td><span class="${m.parts[p] >= 1.2 ? 'weak' : m.parts[p] < 0.9 ? 'hard' : ''}">${m.parts[p].toFixed(2)}×</span></td>`).join('')}</tr>`)
      .join('')
    const abil = MONSTERS.map(
      m => `
      <div class="cab" style="--glow:${m.palette.glow}">
        <h3>${esc(m.name)}</h3>
        <table><tr><th>Ability</th><th>Damage</th><th>Wind-up</th><th>Reach</th></tr>
        ${m.abilities.map(a => `<tr title="${esc(a.description)}"><td><b>${esc(a.name)}</b><small>${esc(a.counter)}</small></td><td>${a.damage || '—'}</td><td>${a.windup.toFixed(2)} s</td><td>${a.range} m</td></tr>`).join('')}
        </table>
      </div>`,
    ).join('')
    $(this.root, '.lib-compare').innerHTML = `<h2>Stats</h2><table class="ctable">${head}${rows}${parts}</table><h2>Abilities</h2><div class="cabs">${abil}</div>`
  }

  // ─── frame ─────────────────────────────────────────────────────────────
  private resize(): void {
    const w = this.viewport.clientWidth
    const h = this.viewport.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta())
    const dur = previewDuration(this.behaviour)
    if (this.playing) this.t = (this.t + dt * this.speed) % dur
    const step = this.playing ? dt * this.speed : 0
    const tread = previewPose(this.animator.target, this.behaviour, this.t, this.animator.time + step, this.def.stats.walkSpeed, this.def.stats.runSpeed, this.def.plan.strike)
    if (!this.playing) {
      // Scrubbing: snap the smoothed pose to the target so the timeline is exact.
      Object.assign(this.animator.pose, this.animator.target)
    }
    this.animator.update(this.playing ? step : 0.0001, { treadmill: tread })
    animateFeatures(this.rig.features, this.animator.time, this.behaviour === 'thrash' ? 1 : this.behaviour === 'run' ? 0.6 : 0.1, this.animator.target.plateGlow)
    this.treadmillOffset += tread * step
    this.floorTex.offset.y = -this.treadmillOffset / 3
    if (this.turntable) this.rig.root.rotation.y += dt * 0.35
    $<HTMLInputElement>(this.root, '.scrub').value = String(this.t / dur)
    refreshRigWorld(this.rig)
    this.rig.hitSpheres.forEach((s, i) => this.sphereGroup.children[i]?.position.copy(s.world))
    const rect = this.viewport.getBoundingClientRect()
    const v = new THREE.Vector3()
    this.rig.anchors.forEach((a, i) => {
      this.anchorGroup.children[i]?.position.copy(a.world)
      const el = this.labels.children[i] as HTMLElement | undefined
      if (!el) return
      v.copy(a.world).project(this.camera)
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * rect.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * rect.height).toFixed(1)}px)`
      el.style.opacity = v.z < 1 ? '1' : '0'
    })
    this.updateFacing()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private updateFacing(): void {
    const head = new THREE.Vector3()
    const tail = new THREE.Vector3()
    this.rig.head.getWorldPosition(head)
    this.rig.tailEnd.getWorldPosition(tail)
    const root = new THREE.Vector3()
    this.rig.root.getWorldPosition(root)
    const fwd = head.clone().sub(tail)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1)
    fwd.normalize()
    const facing = this.axes.userData.facing as THREE.ArrowHelper
    facing.setDirection(fwd)
    const box = new THREE.Box3().setFromObject(this.rig.content)
    this.bounds.box.copy(box)
    // The game convention is facing +Z in the root's frame.
    const local = fwd.clone().applyQuaternion(this.rig.root.quaternion.clone().invert())
    const yaw = Math.atan2(local.x, local.z) * DEG
    const upOk = box.max.y - root.y > 0.5 * (box.max.y - box.min.y) && box.min.y > root.y - 1.5
    const ok = Math.abs(yaw) < 10 && upOk
    const el = $(this.root, '.lib-check')
    const html = `<b class="${ok ? 'ok' : 'bad'}">${ok ? 'Orientation OK' : 'Orientation needs correction'}</b><span>Head direction: (${fx(local.x, 2)}, ${fx(local.z, 2)}) · yaw off +Z ${yaw.toFixed(1)}°</span><span>${upOk ? 'Upright on +Y' : 'Not upright — check X/Z rotation'}</span>`
    if (el.dataset.html !== html) {
      el.dataset.html = html
      el.innerHTML = html
    }
  }
}

const lib = new Library()
if (import.meta.env.DEV) (window as unknown as { __lib: Library }).__lib = lib
