import * as THREE from 'three';

// One sleek 330 ml aluminium can, built in code (no 3D model file to download): a printed body, a metal bottom, a metal neck with the rim, a pull tab, and a coat of cold-drink droplets.
// The sizes are in dims.js.
import { CAN_HEIGHT, BODY_FROM, BODY_TO, SHOULDER, PRINT_ASPECT } from './dims.js';
export { CAN_HEIGHT };

const v2 = (pairs) => pairs.map(([x, y]) => new THREE.Vector2(x, y));

function bodyGeometry() {
  const pts = [];
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const y = BODY_FROM + ((BODY_TO - BODY_FROM) * i) / steps;
    let r = 1;
    if (y > SHOULDER) { const s = (y - SHOULDER) / (BODY_TO - SHOULDER); r = 1 - 0.18 * Math.sin((s * Math.PI) / 2); }
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 160);
}
const bottomGeometry = () => new THREE.LatheGeometry(v2([[0.0001, 0.2], [0.4, 0.2], [0.58, 0.12], [0.7, 0.04], [0.8, 0.0], [0.9, 0.06], [0.97, 0.22], [0.995, 0.36], [1, BODY_FROM]]), 160);
const neckGeometry = () => new THREE.LatheGeometry(v2([[0.82, BODY_TO], [0.79, 4.68], [0.78, 4.74], [0.805, 4.78], [0.825, 4.82], [0.805, 4.87], [0.765, 4.87], [0.745, 4.83], [0.705, 4.75], [0.665, 4.69], [0.625, 4.67], [0.0001, 4.67]]), 160);

function tabGeometry() {
  const s = new THREE.Shape();
  s.absellipse(0, 0, 0.36, 0.17, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path(); hole.absellipse(-0.17, 0, 0.1, 0.07, 0, Math.PI * 2, true, 0); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 });
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
  for (let i = 0; i < 520; i++) draw(rnd() * W, rnd() * H, 1.5 + rnd() * rnd() * 7.5);
  for (let i = 0; i < 26; i++) { // a drop that has run down the can leaves a trail of small beads
    const x = rnd() * W; let y = rnd() * H * 0.7, r = 5 + rnd() * 4;
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

function softCircle(inner, outer, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTexture = () => softCircle('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
export const shadowTexture = () => softCircle('rgba(0,0,0,0.65)', 'rgba(0,0,0,0)');
export function bubbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 6, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(22, 22, 5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// shared by all ten cans
export function makeCanKit() {
  const metal = new THREE.MeshStandardMaterial({ color: 0xd4d7dc, metalness: 1, roughness: 0.26, side: THREE.DoubleSide });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 1, roughness: 0.4 });
  return { body: bodyGeometry(), bottom: bottomGeometry(), neck: neckGeometry(), tab: tabGeometry(), metal, darkMetal, droplets: dropletNormalMap(), glow: glowTexture(), shadow: shadowTexture() };
}

// one can: { group (move this one), spin (turn this one), body (its paint material), glowSprite }
export function makeCan(kit, flavor) {
  const group = new THREE.Group();
  const spin = new THREE.Group(); group.add(spin);
  const inner = new THREE.Group(); inner.position.y = -CAN_HEIGHT / 2; spin.add(inner);

  const metal = flavor.design.finish === 'metal';
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: metal ? 0.82 : 0.22, roughness: metal ? 0.24 : 0.3, clearcoat: 1, clearcoatRoughness: metal ? 0.08 : 0.04, clearcoatNormalMap: kit.droplets, clearcoatNormalScale: new THREE.Vector2(1.3, 1.3), envMapIntensity: metal ? 1.25 : 1.1 });
  const body = new THREE.Mesh(kit.body, paint); inner.add(body);
  inner.add(new THREE.Mesh(kit.bottom, kit.metal), new THREE.Mesh(kit.neck, kit.metal));

  // the top: a dark opening, the tab and its rivet
  const opening = new THREE.Mesh(new THREE.CircleGeometry(1, 40), kit.darkMetal); opening.scale.set(0.27, 0.17, 1); opening.rotation.x = -Math.PI / 2; opening.position.set(-0.26, 4.675, 0.0); inner.add(opening);
  const tab = new THREE.Mesh(kit.tab, kit.metal); tab.position.set(0.12, 4.69, 0); tab.rotation.y = 0.0; inner.add(tab);
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20), kit.darkMetal); rivet.position.set(0.12, 4.69, 0); inner.add(rivet);

  // a coloured glow behind the can, and a soft shadow far below it
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glow, color: new THREE.Color(flavor.colors.a), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false }));
  glow.scale.set(10, 10, 1); glow.position.set(0, 0.2, -1.6); group.add(glow);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: kit.shadow, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(3.6, 2.0, 1); shadow.position.set(0, -CAN_HEIGHT / 2 - 0.7, 0.1); group.add(shadow);

  return { group, spin, paint, glow, shadow, flavor };
}

// puts a painted canvas on a can
export function printOnCan(can, canvas, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.offset.x = 0.5; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  can.paint.map = t; can.paint.needsUpdate = true; can.texture = t;
  if (renderer.initTexture) renderer.initTexture(t);
}
