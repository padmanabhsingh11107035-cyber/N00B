/* METRO RUSH — core: renderer, lighting, shared helpers. Engine: Three.js (MIT). */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const CONFIG = Object.freeze({
  laneWidth: 3.2, playerZ: 7, startSpeed: 17, maxSpeed: 34, gravity: 32, jumpSpeed: 12.4,
  slideDuration: .8, rowGap: 32, spawnZ: -184, roofY: 3.62, rampLen: 7.8
});
const LANES = [-CONFIG.laneWidth, 0, CONFIG.laneWidth];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no ctx');
} catch (e) {
  $('loading').innerHTML = '<strong>WEBGL IS UNAVAILABLE</strong><span>Enable hardware acceleration or try a recent Chrome, Edge, Firefox or Safari.</span>';
  window.MR = { failed: true };
  return;
}
const mobile = matchMedia('(pointer:coarse)').matches;
const MAX_PR = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
renderer.setPixelRatio(MAX_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const hasNeutral = THREE.NeutralToneMapping !== undefined;
renderer.toneMapping = hasNeutral ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = hasNeutral ? 1.0 : 1.15;

const FOG = '#c4e9ff';
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 85, 265);
const camera = new THREE.PerspectiveCamera(innerWidth / innerHeight < .75 ? 72 : 60, innerWidth / innerHeight, .1, 460);

// Image-based lighting: a tiny procedural sky gives every glossy surface (trains, coins, rails) a real reflection.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide,
  vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec3 v;void main(){float h=v.y;vec3 top=vec3(.18,.45,1.);vec3 hor=vec3(1.,.93,.84);vec3 gnd=vec3(.42,.36,.3);vec3 c=h>0.?mix(hor,top,pow(h,.55)):mix(hor,gnd,pow(-h,.35));gl_FragColor=vec4(c*1.15,1.);}'
})));
const envSun = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8, 6.5) }));
envSun.position.set(22, 30, -24); envScene.add(envSun);
for (const [x, z, c] of [[-40, 10, '#ffd6e6'], [40, 20, '#d9f3ff'], [0, 45, '#fff2cc']]) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), side: THREE.DoubleSide }));
  p.position.set(x, 8, z); p.lookAt(0, 0, 0); envScene.add(p);
}
scene.environment = pmrem.fromScene(envScene, .02).texture;

const hemi = new THREE.HemisphereLight('#d8f1ff', '#ffcfa3', .75); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d8', 2.7);
sun.position.set(16, 42, -18); sun.target.position.set(0, 0, -10);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 34, bottom: -18, near: 1, far: 100 });
sun.shadow.bias = -.0008; sun.shadow.normalBias = .04;
scene.add(sun, sun.target);

// ---------- shared material + mesh helpers
const materials = new Map();
function mat(color, roughness = .7, metalness = 0, opts) {
  const key = color + '|' + roughness + '|' + metalness + '|' + (opts ? JSON.stringify(opts) : '');
  if (!materials.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (opts) {
      if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
      if (opts.env !== undefined) m.envMapIntensity = opts.env;
      if (opts.fog === false) m.fog = false;
    }
    materials.set(key, m);
  }
  return materials.get(key);
}
const cubeGeo = new THREE.BoxGeometry(1, 1, 1), sphereGeo = new THREE.SphereGeometry(1, 18, 12),
  cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16), planeGeo = new THREE.PlaneGeometry(1, 1), coneGeo = new THREE.ConeGeometry(1, 1, 14);
const M = c => typeof c === 'string' ? mat(c) : c;
function add(g, geo, material, x, y, z, sx, sy, sz, shadow) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = !!shadow; m.receiveShadow = true; g.add(m); return m;
}
const box = (g, x, y, z, w, h, d, c, s = false) => add(g, cubeGeo, M(c), x, y, z, w, h, d, s);
const sphere = (g, x, y, z, rx, ry, rz, c, s = true) => add(g, sphereGeo, M(c), x, y, z, rx, ry, rz, s);
const cylinder = (g, x, y, z, r, h, c, s = false) => add(g, cylGeo, M(c), x, y, z, r, h, r, s);
const cone = (g, x, y, z, r, h, c, s = false) => add(g, coneGeo, M(c), x, y, z, r, h, r, s);
function plane(g, x, y, z, w, h, material, ry = 0) { const m = add(g, planeGeo, material, x, y, z, w, h, 1, false); m.rotation.y = ry; return m; }

const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return t;
}
function rr(x, X, Y, W, H, R) {
  R = Math.min(R, W / 2, H / 2);
  x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amt > 0 ? '#ffffff' : '#000000'), Math.abs(amt));
  return '#' + c.getHexString();
}
let seed = 13941;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

// Merge meshes sharing a material into one draw call.
function mergeParts(parts) {
  const positions = [], normals = [], uvs = [], v = new THREE.Vector3();
  for (const { geo: raw, matrix } of parts) {
    const geo = raw.index ? raw.toNonIndexed() : raw;
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let j = 0; j < p.count; j++) {
      v.fromBufferAttribute(p, j).applyMatrix4(matrix); positions.push(v.x, v.y, v.z);
      if (n) v.fromBufferAttribute(n, j).applyNormalMatrix(nm); else v.set(0, 1, 0);
      normals.push(v.x, v.y, v.z); uvs.push(u ? u.getX(j) : 0, u ? u.getY(j) : 0);
    }
    if (geo !== raw) geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingSphere(); return g;
}
function batchStatic(group) {
  const buckets = new Map(); group.updateMatrixWorld(true);
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.dynamic || Array.isArray(mesh.material)) continue;
    mesh.updateMatrix(); const k = mesh.material.uuid;
    if (!buckets.has(k)) buckets.set(k, { material: mesh.material, items: [], cast: false });
    const b = buckets.get(k); b.items.push(mesh); b.cast = b.cast || mesh.castShadow;
  }
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    const geo = mergeParts(b.items.map(m => ({ geo: m.geometry, matrix: m.matrix })));
    for (const m of b.items) group.remove(m);
    const c = new THREE.Mesh(geo, b.material); c.castShadow = b.cast; c.receiveShadow = true; group.add(c);
  }
}

// ---------- 2D art helpers (graffiti, glows)
const GRAFF_WORDS = ['RUSH', 'GO!', 'ZOOM', 'FLOW', 'METRO', 'YEAH', 'WOW', 'JUMP', 'FAST', 'BOOM', 'HEY!', 'RUN', 'VIBE', 'POW'];
const GRAFF_COLORS = [['#ff3d7f', '#ffd23f'], ['#3ad6ff', '#7b2ff7'], ['#8dff5a', '#00b4d8'], ['#ff9a00', '#ff2e63'], ['#ffe066', '#ff5d8f'], ['#b07bff', '#3ae3c1'], ['#59f0ff', '#2f6bff']];
const pick = a => a[Math.floor(Math.random() * a.length)];
function star(x, cx, cy, r) {
  x.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * .34 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  x.closePath(); x.fill();
}
function blob(x, cx, cy, r, color) {
  x.fillStyle = color; x.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, q = r * (.78 + Math.random() * .3); x.lineTo(cx + Math.cos(a) * q * 1.5, cy + Math.sin(a) * q * .8); }
  x.closePath(); x.fill();
}
const GFONT = '"Lilita One","Arial Black",Impact,sans-serif';
function graffiti(x, cx, cy, size, word, cols, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.font = size + 'px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const w = x.measureText(word).width;
  x.fillStyle = cols[1];
  for (let i = 0; i < 5; i++) {
    const dx = (Math.random() - .5) * w * .9, dl = size * (.25 + Math.random() * .55);
    x.fillRect(dx, size * .15, size * .06, dl); x.beginPath(); x.arc(dx + size * .03, size * .15 + dl, size * .05, 0, 7); x.fill();
  }
  x.lineWidth = size * .34; x.strokeStyle = '#15112e'; x.strokeText(word, size * .06, size * .08); x.strokeText(word, 0, 0);
  x.lineWidth = size * .16; x.strokeStyle = '#ffffff'; x.strokeText(word, 0, 0);
  const g = x.createLinearGradient(0, -size * .45, 0, size * .45); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  x.fillStyle = g; x.fillText(word, 0, 0);
  x.save(); x.beginPath(); x.rect(-w, -size, w * 2, size * .72); x.clip(); x.globalAlpha = .4; x.fillStyle = '#fff'; x.fillText(word, 0, 0); x.restore();
  x.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) star(x, (Math.random() - .5) * w * 1.15, (Math.random() - .5) * size * .9, size * .1);
  x.restore();
}
const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.22, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.set(size, size, 1); return s;
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

window.MR = {
  $, CONFIG, LANES, MAX_PR, renderer, scene, camera, sun, hemi, mobile, FOG,
  mat, box, sphere, cylinder, cone, plane, add, canvasTex, rr, shade, rnd, mergeParts, batchStatic,
  cubeGeo, sphereGeo, cylGeo, planeGeo, coneGeo, graffiti, blob, star, pick, GRAFF_WORDS, GRAFF_COLORS, GFONT, glowTex, glowSprite
};
})();
