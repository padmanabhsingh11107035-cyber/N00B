import * as THREE from 'three';
import { CAN_HEIGHT, BODY_FROM, BODY_TO, SHOULDER, PRINT_ASPECT } from './dims.js';

// One sleek 330 ml aluminium can, built in code (no 3D model file to download): a printed body that curves smoothly into the lid, a bare metal bottom with its ring, a rolled rim, a
// recessed lid with the opening and the pull tab, and a light coat of cold droplets. The sizes are in dims.js.
export { CAN_HEIGHT };

const v2 = (pairs) => pairs.map(([x, y]) => new THREE.Vector2(x, y));

// the printed body: straight, then a rounded shoulder that leans in a little (it never bends back out), like a real can
function bodyGeometry() {
  const pts = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const y = BODY_FROM + ((BODY_TO - BODY_FROM) * i) / steps;
    let r = 1;
    if (y > SHOULDER) { const s = (y - SHOULDER) / (BODY_TO - SHOULDER); r = 1 - 0.1 * s * s; }
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 192);
}
// the bottom: the ring the can stands on, and the dome inside it
const bottomGeometry = () => new THREE.LatheGeometry(v2([[0.0001, 0.22], [0.38, 0.215], [0.55, 0.15], [0.66, 0.07], [0.74, 0.015], [0.8, 0.0], [0.86, 0.02], [0.92, 0.1], [0.97, 0.22], [0.995, 0.34], [1, BODY_FROM]]), 192);
// the top: a short neck and the rolled rim (a little wider than the neck, as on a real can) with its flat ring: this is the ring that has its own colour; then the lid, sunk inside it
const neckGeometry = () => new THREE.LatheGeometry(v2([
  [0.9, BODY_TO], [0.896, 4.66], [0.905, 4.7], [0.925, 4.74], [0.935, 4.79], [0.925, 4.84], [0.9, 4.865], [0.87, 4.87], [0.84, 4.865]
]), 192);
const lidGeometry = () => new THREE.LatheGeometry(v2([[0.84, 4.865], [0.82, 4.835], [0.8, 4.775], [0.77, 4.735], [0.735, 4.715], [0.0001, 4.71]]), 192);

function tabGeometry() {
  // a rounded pull tab with a finger hole
  const s = new THREE.Shape();
  s.absellipse(0, 0, 0.38, 0.19, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path(); hole.absellipse(-0.17, 0, 0.115, 0.08, 0, Math.PI * 2, true, 0); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 32 });
  g.rotateX(-Math.PI / 2);
  return g;
}

// the droplets: a height picture is drawn (round beads and a few running drops), then turned into a normal map, which makes the clear coat of the paint look wet
export function dropletNormalMap(width = 1024) {
  const W = width, H = Math.round(W / PRINT_ASPECT);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bead = (x, y, r) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#9a9a9a'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.globalCompositeOperation = 'lighten'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const draw = (x, y, r) => { bead(x, y, r); if (x < r) bead(x + W, y, r); if (x > W - r) bead(x - W, y, r); };
  for (let i = 0; i < 420; i++) draw(rnd() * W, rnd() * H, 1.4 + rnd() * rnd() * 7);
  for (let i = 0; i < 18; i++) { // a drop that has run down the can leaves a trail of small beads
    const x = rnd() * W; const y = rnd() * H * 0.7, r = 5 + rnd() * 4;
    const len = 60 + rnd() * 140;
    for (let k = 0; k < len; k += 3) { draw(x + Math.sin(k * 0.05) * 1.2, y + k, Math.max(1.2, r * (1 - k / (len * 1.3)) * 0.55)); }
    draw(x, y + len, r);
  }
  g.globalCompositeOperation = 'source-over';
  const src = g.getImageData(0, 0, W, H).data, out = g.createImageData(W, H);
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const k = 5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255; out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255; out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.offset.x = 0.5; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

// fine brushed lines for the bare aluminium (a roughness picture: the lines run round the can)
function brushedMap() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 512);
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 520; i++) { const v = 130 + Math.floor(rnd() * 70); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, rnd() * 512, 64, 0.6 + rnd() * 1.4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
}

function softCircle(inner, outer, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const shadowTexture = () => softCircle('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)');

// the light of a photo studio, as a picture that the metal reflects: a dark room with tall soft boxes at the sides, a big one above and a dim one in front. This is what makes the can read as
// metal: long bright highlights down its sides and a dark body between them.
export function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0a0a0c);
  const box = (w, h, pos, power, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, pos[1] * 0.3, 0); m.rotateZ(tilt); s.add(m);
  };
  box(2.2, 16, [-9, 1, 4], 9);          // tall soft box, left
  box(2.2, 16, [9, 1, 4], 7);           // tall soft box, right
  box(0.7, 16, [-4.5, 0, 9], 14);       // thin strip, front left: the sharp line on the can
  box(14, 4, [0, 11, 3], 4);            // big light above
  box(12, 5, [0, 0, 12], 0.9);          // dim fill in front
  box(18, 7, [0, 1, -12], 1.4);         // the room behind
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.015).texture; pm.dispose();
  return tex;
}

// shared by all ten cans
export function makeCanKit() {
  const bare = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.3, roughnessMap: brushedMap(), side: THREE.DoubleSide, envMapIntensity: 1.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x777b82, metalness: 1, roughness: 0.42 });
  return { body: bodyGeometry(), bottom: bottomGeometry(), neck: neckGeometry(), lid: lidGeometry(), tab: tabGeometry(), bare, dark, droplets: dropletNormalMap(), shadow: shadowTexture() };
}

// one can: { group (move this one), spin (turn this one), paint (its paint material), shadow }
export function makeCan(kit, flavor) {
  const group = new THREE.Group();
  const spin = new THREE.Group(); group.add(spin);
  const inner = new THREE.Group(); inner.position.y = -CAN_HEIGHT / 2; spin.add(inner);

  // coloured metal under a clear coat: the colour is in the metal itself (so it reflects the lights tinted), the coat adds the wet gloss on top
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: flavor.design.metalness, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.035,
    clearcoatNormalMap: kit.droplets, clearcoatNormalScale: new THREE.Vector2(1.2, 1.2), envMapIntensity: 1.2
  });
  // the bottom is the colour of the can (no dark band); the ring at the top has its own colour: black, or gold on the black can
  const bottomMat = new THREE.MeshPhysicalMaterial({ color: flavor.design.color, metalness: flavor.design.metalness, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const ringMat = new THREE.MeshPhysicalMaterial({ color: flavor.design.ring, metalness: 0.85, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  inner.add(new THREE.Mesh(kit.body, paint), new THREE.Mesh(kit.bottom, bottomMat), new THREE.Mesh(kit.neck, ringMat), new THREE.Mesh(kit.lid, kit.bare));

  // the lid: a dark oval where it opens, and the tab fixed by its rivet
  const opening = new THREE.Mesh(new THREE.CircleGeometry(1, 48), kit.dark); opening.scale.set(0.3, 0.19, 1); opening.rotation.x = -Math.PI / 2; opening.position.set(-0.28, 4.716, 0.0); inner.add(opening);
  const groove = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), kit.dark); groove.scale.set(0.32, 0.205, 1); groove.rotation.x = -Math.PI / 2; groove.position.set(-0.28, 4.717, 0.0); inner.add(groove);
  const tab = new THREE.Mesh(kit.tab, kit.bare); tab.position.set(0.14, 4.735, 0); inner.add(tab);
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 24), kit.dark); rivet.position.set(0.14, 4.74, 0); inner.add(rivet);

  // a soft shadow far below the can
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: kit.shadow, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(3.4, 1.8, 1); shadow.position.set(0, -CAN_HEIGHT / 2 - 0.7, 0.1); group.add(shadow);

  return { group, spin, paint, shadow, flavor };
}

// puts a painted canvas on a can
export function printOnCan(can, canvas, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.offset.x = 0.5; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  can.paint.map = t; can.paint.needsUpdate = true; can.texture = t;
  if (renderer.initTexture) renderer.initTexture(t);
}
