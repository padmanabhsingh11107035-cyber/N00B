/* METRO RUSH — trains (locomotive + coaches, 8 liveries), ramps, barriers, coins, power-ups. */
'use strict';
(() => {
if (!window.MR || MR.failed) return;
const { scene, mat, box, sphere, cylinder, plane, canvasTex, rr, shade, batchStatic, graffiti, blob, star, GRAFF_WORDS, GRAFF_COLORS, GFONT, glowSprite, CONFIG } = MR;

const CAR = 10.6, ENG = 12, GAP = .7, W = 2.84, HW = W / 2, BODY_Y0 = .92, BODY_Y1 = 3.47, BODY_H = BODY_Y1 - BODY_Y0;
const ROOF_R = 2.6, ROOF_A = .58, ROOF_TOP = BODY_Y1 + ROOF_R * (1 - Math.cos(ROOF_A)); // ≈ 3.9
const WHEEL_R = .46;
MR.TRAIN = { CAR, ENG, GAP, ROOF_TOP, WHEEL_R };

const LIVERIES = [
  { name: 'EXPRESS', body: '#ff3b4f', accent: '#ffd23f', stripe: '#ffffff' },
  { name: 'OCEAN', body: '#2f6bff', accent: '#ffd23f', stripe: '#9be7ff' },
  { name: 'LIME', body: '#14c27a', accent: '#d9ff3d', stripe: '#ffffff' },
  { name: 'SUNSET', body: '#ff8a1f', accent: '#6b2cff', stripe: '#fff1c1' },
  { name: 'BUBBLEGUM', body: '#ff4fa3', accent: '#2fd3ff', stripe: '#ffffff' },
  { name: 'GRAPE', body: '#7b4dff', accent: '#3ae3c1', stripe: '#ffffff' },
  { name: 'CITRUS', body: '#ffbf14', accent: '#ff3d7f', stripe: '#ffffff' },
  { name: 'CLASSIC', body: '#e6edf5', accent: '#ff3b4f', stripe: '#2f6bff' }
];
MR.LIVERIES = LIVERIES;

function paint(color, map) {
  const m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map: map || null, roughness: .32, metalness: .15 });
  return m;
}
const glass = new THREE.MeshStandardMaterial({ color: '#13254a', roughness: .05, metalness: .2, envMapIntensity: 1.6 });
const darkMat = mat('#262838', .6, .3), roofMat = darkMat, underMat = darkMat, bogieMat = darkMat, springMat = darkMat, gangMat = darkMat;
const chromeMat = mat('#e3e8f0', .25, .9, { env: 1.4 }), ventMat = chromeMat;
const headOn = mat('#fffbe6', .2, 0, { emissive: '#fff4c2', ei: 3 }), tailOn = mat('#ff4a4a', .3, 0, { emissive: '#ff2020', ei: 2.4 });
const wheelTex = canvasTex(128, 128, (x) => {
  x.fillStyle = '#3a3d4c'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#c9ced8'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  x.fillStyle = '#3a3d4c'; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
  x.strokeStyle = '#8e95a6'; x.lineWidth = 9; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); x.stroke(); }
  x.fillStyle = '#ffcf3f'; x.beginPath(); x.arc(64, 64, 14, 0, 7); x.fill();
});
wheelTex.center.set(.5, .5);
const wheelMat = new THREE.MeshStandardMaterial({ map: wheelTex, roughness: .4, metalness: .7 });
const wheelTexMove = wheelTex.clone(); wheelTexMove.center.set(.5, .5); wheelTexMove.needsUpdate = true;
const wheelMatMove = new THREE.MeshStandardMaterial({ map: wheelTexMove, roughness: .4, metalness: .7 });
MR.updateWheels = dt => { wheelTexMove.rotation -= dt * 22; };
const axleGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 2.56, 18); axleGeo.rotateZ(Math.PI / 2);
const roofGeo = (() => { const g = new THREE.CylinderGeometry(ROOF_R, ROOF_R, 1, 22, 1, false, -ROOF_A, ROOF_A * 2); g.rotateX(-Math.PI / 2); return g; })();

// ---------- livery textures
function sideTex(L, kind, variant) {
  // 1024 x 256 ≈ 10.6 m x 2.55 m
  return canvasTex(1024, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, shade(L.body, .18)); g.addColorStop(.55, L.body); g.addColorStop(1, shade(L.body, -.14));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // panel seams
    x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 2; for (let X = 0; X < w; X += 128) { x.beginPath(); x.moveTo(X, 0); x.lineTo(X, h); x.stroke(); }
    // livery bands
    x.fillStyle = L.accent; x.fillRect(0, 176, w, 34);
    x.fillStyle = L.stripe; x.fillRect(0, 168, w, 6); x.fillRect(0, 213, w, 5);
    x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(0, 8, w, 4);
    if (kind === 'car') {
      const doors = [180, 844];
      // windows with passengers
      const winXs = [36, 290, 420, 550, 680, 930];
      for (let i = 0; i < winXs.length; i++) {
        const X = winXs[i], Wd = i === 0 || i === 5 ? 64 : 112, Y = 44, H = 82;
        x.fillStyle = shade(L.body, -.35); rr(x, X - 5, Y - 5, Wd + 10, H + 10, 14); x.fill();
        const gg = x.createLinearGradient(X, Y, X, Y + H); gg.addColorStop(0, '#8fd8ff'); gg.addColorStop(1, '#2b56b8'); x.fillStyle = gg; rr(x, X, Y, Wd, H, 10); x.fill();
        x.save(); rr(x, X, Y, Wd, H, 10); x.clip();
        for (let p = 0; p < Wd / 40; p++) if (Math.random() < .6) {
          const px = X + 20 + p * 40 + Math.random() * 8, c = ['#ffb37a', '#c98a5c', '#8a5a3c', '#ffd2a8'][Math.floor(Math.random() * 4)];
          x.fillStyle = ['#ff5d8f', '#ffd23f', '#3ad6ff', '#8dff5a', '#b07bff'][Math.floor(Math.random() * 5)];
          rr(x, px - 15, Y + 52, 30, 40, 10); x.fill(); x.fillStyle = c; x.beginPath(); x.arc(px, Y + 42, 11, 0, 7); x.fill();
        }
        x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.moveTo(X + 10, Y + H); x.lineTo(X + Wd * .5, Y); x.lineTo(X + Wd * .5 + 20, Y); x.lineTo(X + 30, Y + H); x.fill();
        x.restore();
      }
      for (const D of doors) {
        x.fillStyle = shade(L.body, -.1); rr(x, D - 62, 22, 124, 230, 10); x.fill();
        x.strokeStyle = shade(L.body, -.4); x.lineWidth = 5; x.stroke();
        x.beginPath(); x.moveTo(D, 24); x.lineTo(D, 250); x.stroke();
        for (const s of [-1, 1]) { const gg = x.createLinearGradient(0, 50, 0, 140); gg.addColorStop(0, '#9be0ff'); gg.addColorStop(1, '#2b56b8'); x.fillStyle = gg; rr(x, D + (s < 0 ? -50 : 10), 50, 40, 92, 8); x.fill(); }
        x.fillStyle = L.accent; x.fillRect(D - 62, 176, 124, 34);
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(D, 160, 7, 0, 7); x.fill();
      }
      // roundel logo
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(512, 192, 26, 0, 7); x.fill(); x.fillStyle = L.body; x.beginPath(); x.arc(512, 192, 19, 0, 7); x.fill();
      x.fillStyle = '#ffffff'; x.font = '26px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('M', 512, 194);
      if (variant) {
        const cols = GRAFF_COLORS[variant % GRAFF_COLORS.length], word = GRAFF_WORDS[(variant * 7) % GRAFF_WORDS.length];
        blob(x, 340 + variant * 40, 196, 46, shade(cols[0], .6));
        graffiti(x, 340 + variant * 40, 192, 70, word, cols, -.06);
        if (variant % 2) graffiti(x, 720, 205, 48, GRAFF_WORDS[(variant * 3) % GRAFF_WORDS.length], GRAFF_COLORS[(variant + 3) % GRAFF_COLORS.length], .08);
      }
      x.fillStyle = 'rgba(20,20,40,.55)'; x.font = '18px ' + GFONT; x.textAlign = 'left'; x.fillText('M-' + (100 + Math.floor(Math.random() * 899)), 980 - 60, 240);
    } else {
      // locomotive rear body (8.6 m mapped to 1024)
      for (let i = 0; i < 3; i++) { const X = 70 + i * 120; x.fillStyle = shade(L.body, -.32); rr(x, X, 40, 96, 90, 10); x.fill(); x.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < 7; k++) x.fillRect(X + 10, 50 + k * 11, 76, 5); }
      x.save(); x.font = '64px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.lineWidth = 12; x.strokeStyle = shade(L.body, -.45); x.strokeText('METRO RUSH', 700, 92); x.fillStyle = '#ffffff'; x.fillText('METRO RUSH', 700, 92); x.restore();
      x.fillStyle = L.accent; x.beginPath(); x.moveTo(420, 176); x.lineTo(1024, 120); x.lineTo(1024, 150); x.lineTo(520, 176); x.fill();
      // cab door with window at the front end
      x.fillStyle = shade(L.body, -.1); rr(x, 900, 24, 100, 226, 10); x.fill(); x.strokeStyle = shade(L.body, -.4); x.lineWidth = 5; x.stroke();
      const gg = x.createLinearGradient(0, 40, 0, 120); gg.addColorStop(0, '#9be0ff'); gg.addColorStop(1, '#2b56b8'); x.fillStyle = gg; rr(x, 915, 40, 70, 74, 8); x.fill();
      x.fillStyle = chromeHex(); x.fillRect(985, 120, 8, 60);
      x.fillStyle = '#ffffff'; x.font = '30px ' + GFONT; x.textAlign = 'center'; x.fillText(L.name, 250, 196);
    }
  });
}
function chromeHex() { return '#e8edf5'; }
function endTex(L) {
  return canvasTex(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, shade(L.body, .12)); g.addColorStop(1, shade(L.body, -.18)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = L.accent; x.fillRect(0, 176, w, 34); x.fillStyle = L.stripe; x.fillRect(0, 168, w, 6);
    x.fillStyle = '#2a2b3c'; rr(x, 78, 30, 100, 226, 12); x.fill();
    const gg = x.createLinearGradient(0, 44, 0, 120); gg.addColorStop(0, '#9be0ff'); gg.addColorStop(1, '#2b56b8'); x.fillStyle = gg; rr(x, 92, 44, 72, 74, 8); x.fill();
    for (const X of [26, 206]) { x.fillStyle = '#ff3030'; x.beginPath(); x.arc(X + 12, 216, 13, 0, 7); x.fill(); x.fillStyle = '#ffb3b3'; x.beginPath(); x.arc(X + 9, 212, 5, 0, 7); x.fill(); }
    x.fillStyle = '#ffffff'; x.font = '22px ' + GFONT; x.textAlign = 'center'; x.fillText('NO ENTRY', 128, 150);
  });
}
function noseTex(L) {
  return canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = L.accent; x.fillRect(0, 0, w, h);
    x.fillStyle = L.stripe; x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 70); x.lineTo(256, 0); x.lineTo(256, 18); x.lineTo(128, 88); x.lineTo(0, 18); x.fill();
    x.fillStyle = '#1b1530'; rr(x, 88, 92, 80, 28, 6); x.fill();
    x.fillStyle = '#ffd23f'; x.font = '22px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MR ' + String(LIVERIES.indexOf(L) + 1).padStart(2, '0'), 128, 107);
  });
}

// ---------- shared vehicle parts
function bogie(g, z) {
  box(g, 0, .62, z, 2.1, .32, 3.1, bogieMat);
  box(g, 0, .44, z, 2.2, .14, 2.6, underMat);
  for (const s of [-1, 1]) for (const dz of [-.55, .55]) cylinder(g, s * .95, .7, z + dz, .12, .32, springMat);
  for (const dz of [-.95, .95]) {
    const m = new THREE.Mesh(axleGeo, wheelMat); m.position.set(0, WHEEL_R, z + dz); g.add(m);
  }
}
function roof(g, z, len, L) {
  const r = new THREE.Mesh(roofGeo, L ? mat(shade(L.body, .55), .4, .3) : roofMat); r.position.set(0, BODY_Y1 - ROOF_R * Math.cos(ROOF_A), z); r.scale.set(1, 1, len); r.castShadow = true; r.receiveShadow = true; g.add(r);
}
function underframe(g, z0, z1) {
  const len = z1 - z0, zc = (z0 + z1) / 2;
  box(g, 0, .8, zc, 2.5, .26, len, underMat);
  box(g, 0, .55, zc, 1.6, .5, len * .3, darkMat);
  for (const s of [-1, 1]) box(g, s * .9, .55, zc + len * .25 * s, .5, .36, 1.4, ventMat);
}

function makeCar(L, variant) {
  const g = new THREE.Group(), side = paint(L.body, sideTex(L, 'car', variant)), bodyMat = paint(L.body), endMat = new THREE.MeshStandardMaterial({ map: endTex(L), roughness: .35 });
  const zc = 0;
  box(g, 0, (BODY_Y0 + BODY_Y1) / 2, zc, W, BODY_H, CAR, bodyMat, true);
  for (const s of [-1, 1]) plane(g, s * (HW + .006), (BODY_Y0 + BODY_Y1) / 2, zc, CAR, BODY_H, side, s * Math.PI / 2);
  for (const s of [-1, 1]) { const p = plane(g, 0, (BODY_Y0 + BODY_Y1) / 2, s * (CAR / 2 + .006), W, BODY_H, endMat, s > 0 ? 0 : Math.PI); }
  roof(g, zc, CAR - .1, L);
  for (const z of [-2.6, 2.6]) { box(g, 0, ROOF_TOP + .12, z, 1.5, .3, 2.2, ventMat); box(g, 0, ROOF_TOP + .29, z, 1.2, .06, 1.8, chromeMat); }
  underframe(g, -CAR / 2 + .4, CAR / 2 - .4);
  bogie(g, -CAR / 2 + 2.1); bogie(g, CAR / 2 - 2.1);
  // couplers & tail lamps
  for (const s of [-1, 1]) { box(g, 0, .85, s * (CAR / 2 + .12), .34, .3, .4, chromeMat); }
  batchStatic(g);
  return g;
}

function engineGeometry() {
  const s = new THREE.Shape();
  const zr = -ENG / 2, top = BODY_Y1, bot = BODY_Y0;
  s.moveTo(zr, bot); s.lineTo(zr, top); s.lineTo(2.2, top);
  s.quadraticCurveTo(3.6, top + .05, 4.4, 2.55);   // windscreen arc
  s.quadraticCurveTo(5.75, 1.9, 5.85, 1.25);        // nose bulge
  s.lineTo(5.8, bot); s.lineTo(zr, bot);
  const bev = .14;
  const geo = new THREE.ExtrudeGeometry(s, { depth: W - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .9, bevelSegments: 4, curveSegments: 14 });
  geo.rotateY(-Math.PI / 2); geo.translate(HW - bev, 0, 0);
  return geo;
}
// Thin strip following a quadratic curve in the (z,y) side profile, pushed outward by `off`.
function ribbon(p0, c, p1, t0, t1, off, width, material) {
  const segs = 14, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = t0 + (t1 - t0) * i / segs, it = 1 - t;
    const z = it * it * p0[0] + 2 * it * t * c[0] + t * t * p1[0], y = it * it * p0[1] + 2 * it * t * c[1] + t * t * p1[1];
    const dz = 2 * it * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), dy = 2 * it * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]), l = Math.hypot(dz, dy);
    const oz = z - dy / l * off, oy = y + dz / l * off;
    for (const s of [-1, 1]) { pos.push(s * width / 2, oy, oz); uv.push(s < 0 ? 0 : 1, 1 - i / segs); }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  material.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; return m;
}
let engGeo = null;
function makeEngine(L) {
  if (!engGeo) engGeo = engineGeometry();
  const g = new THREE.Group(), bodyMat = paint(L.body), side = paint(L.body, sideTex(L, 'eng'));
  const body = new THREE.Mesh(engGeo, bodyMat); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const rearLen = 2.2 - (-ENG / 2);
  for (const s of [-1, 1]) plane(g, s * (HW + .012), (BODY_Y0 + BODY_Y1) / 2, -ENG / 2 + rearLen / 2, rearLen, BODY_H, side, s * Math.PI / 2);
  roof(g, -ENG / 2 + rearLen / 2, rearLen, L);
  // windscreen + nose panel: ribbons hugging the cab curve
  g.add(ribbon([2.2, 3.47], [3.6, 3.52], [4.4, 2.55], .12, .93, .15, W - .42, glass));
  g.add(ribbon([4.4, 2.55], [5.75, 1.9], [5.85, 1.25], .04, .97, .145, W - .3, new THREE.MeshStandardMaterial({ map: noseTex(L), roughness: .3 })));
  for (const sx of [-1, 1]) box(g, sx * (HW + .14), 2.8, 1.4, .05, .7, 1.2, glass);
  // headlights
  for (const sx of [-.85, .85]) { box(g, sx, 1.08, 6.0, .58, .34, .06, chromeMat); box(g, sx, 1.08, 6.04, .46, .24, .05, headOn); }
  // cowcatcher / bumper
  const cc = box(g, 0, .6, 6.05, W - .2, .42, .45, darkMat); cc.rotation.x = -.3;
  box(g, 0, .86, 6.22, .45, .3, .36, chromeMat);
  // roof gear: pantograph + horn + vents
  box(g, 0, ROOF_TOP + .12, -3.6, 1.6, .26, 2.6, ventMat, true);
  box(g, 0, ROOF_TOP + .1, -.6, 1.1, .2, 1.4, darkMat);
  const pan = new THREE.Group(); pan.position.set(0, ROOF_TOP + .22, -.6);
  for (const s of [-1, 1]) { const a = box(pan, 0, .45, s * .38, .07, 1, .07, chromeMat); a.rotation.x = s * .7; }
  box(pan, 0, .88, 0, 1.6, .06, .14, chromeMat); g.add(pan);
  cylinder(g, .6, ROOF_TOP + .05, 1.6, .09, .4, chromeMat);
  underframe(g, -ENG / 2 + .4, ENG / 2 - .6);
  bogie(g, -ENG / 2 + 2.2); bogie(g, ENG / 2 - 2.6);
  // rear end of loco
  plane(g, 0, (BODY_Y0 + BODY_Y1) / 2, -ENG / 2 - .15, W - .2, BODY_H, new THREE.MeshStandardMaterial({ map: endTex(L), roughness: .35 }), Math.PI);
  batchStatic(g);
  for (const sx of [-.85, .85]) { const s = glowSprite('#fff2c4', 3.4, .95); s.position.set(sx, 1.08, 6.4); g.add(s); }
  return g;
}

// ---------- ramp
let rampTpl = null;
function makeRamp() {
  const g = new THREE.Group(), len = CONFIG.rampLen, H = ROOF_TOP;
  const tex = canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = '#5a6176'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7b849c'; for (let y = 0; y < h; y += 26) for (let X = (y / 26 % 2) * 16; X < w; X += 32) { rr(x, X + 4, y + 8, 18, 6, 3); x.fill(); }
    for (const X of [0, w - 34]) { x.save(); x.beginPath(); x.rect(X, 0, 34, h); x.clip(); for (let y = -40; y < h + 40; y += 40) { x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(X, y); x.lineTo(X + 34, y - 20); x.lineTo(X + 34, y); x.lineTo(X, y + 20); x.fill(); x.fillStyle = '#1b1b28'; x.beginPath(); x.moveTo(X, y + 20); x.lineTo(X + 34, y); x.lineTo(X + 34, y + 20); x.lineTo(X, y + 40); x.fill(); } x.restore(); }
    x.fillStyle = '#ffd23f'; x.font = '70px ' + GFONT; x.textAlign = 'center'; x.save(); x.translate(128, 256); x.rotate(-Math.PI / 2); x.fillText('▲ ▲ ▲', 0, 24); x.restore();
  });
  const slen = Math.hypot(len, H), ang = Math.atan2(H, len);
  const deck = new THREE.Mesh(MR.cubeGeo, [mat('#454b5e', .5, .5), mat('#454b5e', .5, .5), new THREE.MeshStandardMaterial({ map: tex, roughness: .6, metalness: .4 }), mat('#2b2d3d'), mat('#454b5e'), mat('#454b5e')]);
  deck.scale.set(2.7, .16, slen); deck.position.set(0, H / 2 - .02, -len / 2); deck.rotation.x = ang; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
  for (const s of [-1, 1]) {
    const rail = box(g, s * 1.3, H / 2 + .25, -len / 2, .1, .1, slen, '#ffd23f', true); rail.rotation.x = ang;
    for (const f of [.3, .62, .9]) { const hh = H * f; box(g, s * 1.1, hh / 2, -len * f, .16, hh, .16, '#2f3346', true); }
  }
  box(g, 0, .08, -len * .12, 2.8, .16, .5, '#ffd23f');
  return g;
}

// ---------- consist assembly + pooling
const tpl = { eng: [], carA: [], carB: [] };
MR.buildTrainTemplates = function () {
  LIVERIES.forEach((L, i) => { tpl.eng[i] = makeEngine(L); tpl.carA[i] = makeCar(L, 0); tpl.carB[i] = makeCar(L, i + 1); });
  rampTpl = makeRamp();
  const warm = [];
  for (let i = 0; i < LIVERIES.length; i++) warm.push(MR.getConsist(i, 2, i % 3 === 0, i % 2 === 0, i % 2 === 0));
  MR._warm = warm;
};
MR.releaseWarm = () => { for (const g of MR._warm || []) MR.releaseConsist(g); MR._warm = null; };
function consistLength(cars, ramp) { return (ramp ? CONFIG.rampLen : 0) + ENG + cars * (CAR + GAP) + (cars ? 0 : 0); }
MR.consistLength = consistLength;
const consistPool = new Map();
function buildConsist(liv, cars, ramp, engineFront) {
  const g = new THREE.Group(); let z = 0; const axles = [], glows = [];
  if (ramp) { g.add(rampTpl.clone()); z -= CONFIG.rampLen; }
  let first = true;
  const order = [];
  if (engineFront) { order.push('eng'); for (let i = 0; i < cars; i++) order.push(i % 2 ? 'carB' : 'carA'); }
  else { for (let i = 0; i < cars; i++) order.push(i % 2 ? 'carA' : 'carB'); order.push('eng'); }
  for (const k of order) {
    const len = k === 'eng' ? ENG : CAR, v = tpl[k][liv].clone();
    if (k === 'eng' && !engineFront) { v.rotation.y = Math.PI; v.position.z = z - len / 2; }
    else v.position.z = z - len / 2;
    g.add(v);
    if (!first) box(g, 0, 2.1, z + GAP / 2, 1.7, 2.3, GAP + .14, gangMat);
    first = false; z -= len + GAP;
  }
  g.traverse(o => { if (o.isMesh && o.material === wheelMat) axles.push(o); if (o.isSprite) glows.push(o); });
  g.userData = { axles, glows, length: -z - GAP, liv, cars, ramp, engineFront };
  return g;
}
MR.getConsist = function (liv, cars, ramp, engineFront, moving) {
  const key = liv + '|' + cars + '|' + ramp + '|' + engineFront, pool = consistPool.get(key);
  const g = pool && pool.length ? pool.pop() : buildConsist(liv, cars, ramp, engineFront);
  g.userData.key = key; g.visible = true; scene.add(g);
  for (const s of g.userData.glows) s.visible = engineFront && !!moving;
  for (const w of g.userData.axles) w.material = moving ? wheelMatMove : wheelMat;
  return g;
};
MR.releaseConsist = function (g) {
  scene.remove(g); const k = g.userData.key; if (!consistPool.has(k)) consistPool.set(k, []); consistPool.get(k).push(g);
};


// ---------- small obstacles
function hazardTex(a, b, word) {
  return canvasTex(512, 128, (x, w, h) => {
    for (let i = -2; i < 14; i++) { x.fillStyle = i % 2 ? a : b; x.beginPath(); x.moveTo(i * 48, 0); x.lineTo(i * 48 + 48, 0); x.lineTo(i * 48 + 16, h); x.lineTo(i * 48 - 32, h); x.fill(); }
    if (word) { x.fillStyle = '#1b1240'; rr(x, 130, 26, 252, 76, 14); x.fill(); x.fillStyle = '#ffffff'; x.font = '54px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(word, 256, 67); }
  });
}
function makeBarrier() {
  const g = new THREE.Group(), face = new THREE.MeshStandardMaterial({ map: hazardTex('#ff3b4f', '#ffffff', 'JUMP!'), roughness: .45 });
  const top = box(g, 0, 1.0, 0, 2.7, .62, .26, mat('#ff3b4f', .4), true);
  plane(g, 0, 1.0, .135, 2.66, .6, face); plane(g, 0, 1.0, -.135, 2.66, .6, face, Math.PI);
  box(g, 0, .52, 0, 2.5, .12, .14, '#ffffff');
  for (const x of [-1.15, 1.15]) { box(g, x, .5, 0, .16, 1.0, .16, '#2f3346', true); box(g, x, .06, 0, .5, .12, .9, '#2f3346'); }
  for (const x of [-1.15, 1.15]) { box(g, x, 1.4, 0, .22, .18, .22, mat('#ffb020', .3, 0, { emissive: '#ffaa00', ei: 2 })); const s = glowSprite('#ffb84d', 1.5, .9); s.position.set(x, 1.42, .1); g.add(s); }
  return g;
}
function makeGate() {
  const g = new THREE.Group(), face = new THREE.MeshStandardMaterial({ map: hazardTex('#ffd23f', '#1b1b28', 'DUCK!'), roughness: .45 });
  for (const x of [-1.3, 1.3]) { box(g, x, 1.75, 0, .2, 3.5, .24, '#2f6bff', true); box(g, x, .1, 0, .6, .2, .7, '#2f3346'); }
  box(g, 0, 2.62, 0, 2.8, .95, .3, mat('#ffd23f', .4), true);
  plane(g, 0, 2.62, .156, 2.76, .92, face); plane(g, 0, 2.62, -.156, 2.76, .92, face, Math.PI);
  box(g, 0, 3.15, 0, 2.9, .12, .36, '#2f6bff');
  return g;
}
function makeBuffer() {
  // classic end-of-track buffer stop — tall, must dodge
  const g = new THREE.Group();
  box(g, 0, .9, 0, 2.6, 1.8, 1.0, mat('#ff8a1f', .4), true);
  for (let i = 0; i < 5; i++) box(g, -1 + i * .5, .9, .51, .26, 1.7, .02, '#1b1b28');
  for (const x of [-.75, .75]) { cylinder(g, x, 1.25, .75, .28, .1, chromeMat).rotation.x = Math.PI / 2; box(g, x, 1.25, .65, .26, .26, .3, '#2b2d3d'); }
  box(g, 0, 2.05, 0, 1.0, .5, .5, '#2f3346'); box(g, 0, 2.05, .26, .5, .3, .04, tailOn);
  const s = glowSprite('#ff4040', 1.8, .9); s.position.set(0, 2.05, .4); g.add(s);
  return g;
}

// ---------- coins & power-ups
const coinGeo = new THREE.CylinderGeometry(.36, .36, .1, 28); coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: '#ffc928', roughness: .18, metalness: 1, emissive: '#7a4d00', emissiveIntensity: .45, envMapIntensity: 1.5 });
const coinFaceTex = canvasTex(128, 128, (x) => { x.fillStyle = '#ffd84a'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#fff2a6'; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 50, 0, 7); x.stroke(); x.fillStyle = '#e09a00'; star(x, 64, 64, 34); x.fillStyle = '#fff7c4'; star(x, 60, 60, 22); });
const coinFace = new THREE.MeshStandardMaterial({ map: coinFaceTex, roughness: .2, metalness: .9, emissive: '#6a4300', emissiveIntensity: .4 });
const coinFaceGeo = new THREE.CircleGeometry(.3, 24);
function makeCoin() { return new THREE.Mesh(coinGeo, coinFace); }
function powerBubble(g, color) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(.8, 24, 16), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .28, roughness: 0, depthWrite: false }));
  g.add(b); const s = glowSprite(color, 3.2, .75); g.add(s);
}
function makePower(type) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  if (type === 'magnet') {
    const m = new THREE.Mesh(new THREE.TorusGeometry(.36, .14, 10, 24, Math.PI), mat('#ff3b4f', .3, .3)); m.rotation.z = Math.PI; inner.add(m);
    for (const x of [-.36, .36]) { const t = new THREE.Mesh(MR.cylGeo, mat('#ff3b4f', .3, .3)); t.scale.set(.14, .2, .14); t.position.set(x, .1, 0); inner.add(t); const c = new THREE.Mesh(MR.cylGeo, chromeMat); c.scale.set(.145, .14, .145); c.position.set(x, .27, 0); inner.add(c); }
    inner.position.y = .05; powerBubble(g, '#ff6b81');
  } else if (type === 'shield') {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(.42), mat('#2fd3ff', .15, .5, { emissive: '#0aa4ff', ei: .6 })); s.scale.set(1, 1.25, .55); inner.add(s); powerBubble(g, '#54e1ff');
  } else if (type === 'sneakers') {
    const sole = new THREE.Mesh(MR.cubeGeo, mat('#ffffff', .4)); sole.scale.set(.32, .1, .7); sole.position.y = -.18; inner.add(sole);
    const up = new THREE.Mesh(MR.cubeGeo, mat('#8dff5a', .35)); up.scale.set(.3, .28, .5); up.position.set(0, 0, -.08); inner.add(up);
    const toe = new THREE.Mesh(MR.sphereGeo, mat('#8dff5a', .35)); toe.scale.set(.15, .13, .16); toe.position.set(0, -.06, .2); inner.add(toe);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(MR.cubeGeo, mat('#ffffff', .4)); w.scale.set(.03, .3, .24); w.position.set(s * .2, .02, -.1); w.rotation.z = s * -.4; inner.add(w); }
    inner.rotation.y = .5; powerBubble(g, '#8dff5a');
  } else {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.font = '84px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineWidth = 14; x.strokeStyle = '#4a1a8a'; x.strokeText('2X', 64, 68); x.fillStyle = '#ffe14d'; x.fillText('2X', 64, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); inner.add(p); powerBubble(g, '#c07bff');
  }
  return g;
}
MR.buildPropTemplates = function () {
  MR.templates = { barrier: makeBarrier(), gate: makeGate(), buffer: makeBuffer(), coin: makeCoin(), magnet: makePower('magnet'), shield: makePower('shield'), sneakers: makePower('sneakers'), double: makePower('double') };
};
})();
