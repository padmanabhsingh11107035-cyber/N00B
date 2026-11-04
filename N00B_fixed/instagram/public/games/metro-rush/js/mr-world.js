/* METRO RUSH — colourful procedural world: sky, clouds, tracks, graffiti walls, buildings, bridges. */
'use strict';
(() => {
if (!window.MR || MR.failed) return;
const { scene, mat, box, sphere, cylinder, cone, plane, canvasTex, rr, shade, rnd, batchStatic, LANES, graffiti, blob, star, GRAFF_WORDS, GRAFF_COLORS, GFONT, glowSprite, pick } = MR;
const OUTER = 7.8;
const TRACK_X = [-OUTER, ...LANES, OUTER];
MR.TRACK_X = TRACK_X; MR.OUTER_X = [-OUTER, OUTER];
const TILE = 24, TILES = 10, MOD = 20, MODS = 13;
MR.LOOP = { tile: TILE * TILES, mod: MOD * MODS };

const BUILD_COLORS = ['#ff8a80', '#ffd166', '#7bdff2', '#8ef0b5', '#c9b4ff', '#ffafcc', '#ffa552', '#4dd4ac', '#74b9ff', '#ffe08a', '#ff7eb6', '#9be15d'];
const SHOPS = [['PIZZA', '#ff4d4d', '#fff4e0'], ['DONUTS', '#ff6fb5', '#fff'], ['SNEAKS', '#3d7bff', '#fff'], ['BOBA', '#9b5cff', '#fff'], ['COMICS', '#ffbf1f', '#2a1b55'], ['ARCADE', '#16c79a', '#fff'], ['RAMEN', '#ff7a1a', '#fff'], ['RECORDS', '#2ec4ff', '#14213d']];
const ADS = [['FIZZ POP!', '#ff3d7f', '#ffd23f'], ['ZOOM SHOES', '#2f6bff', '#59f0ff'], ['MEGA DONUT', '#ff9a00', '#ff2e63'], ['COOL BEATS', '#7b2ff7', '#3ad6ff'], ['RUSH ENERGY', '#00b37e', '#c6ff4d'], ['SUPER NOODLE', '#ff5d5d', '#ffe066']];

function texMat(tex, color = '#ffffff', roughness = .8, metal = 0) { return new THREE.MeshStandardMaterial({ map: tex, color, roughness, metalness: metal }); }
// Plane with UVs scaled so a repeating texture keeps real-world proportions.
function uvPlane(g, x, y, z, w, h, material, ry, cellW, cellH) {
  const geo = new THREE.PlaneGeometry(w, h); const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / cellW, uv.getY(i) * h / cellH);
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m;
}

// ---------- textures
function gravelTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#a39686'; x.fillRect(0, 0, w, h);
    const cols = ['#8c7f72', '#b8ab9b', '#7b6f66', '#c9bcab', '#968878', '#a89a8a', '#6e635c'];
    for (let i = 0; i < 2600; i++) { x.fillStyle = cols[i % cols.length]; const r = 1 + Math.random() * 3.2; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, r, r * .75, Math.random() * 3, 0, 7); x.fill(); }
  }, { repeat: [1, 1] });
}
function facadeTex(color) {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    x.fillStyle = shade(color, -.08); for (let r = 0; r < 2; r++) x.fillRect(0, r * 128 + 112, w, 16);
    x.fillStyle = shade(color, .25); for (let r = 0; r < 2; r++) x.fillRect(0, r * 128 + 110, w, 4);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const X = c * 128 + 26, Y = r * 128 + 18, W = 76, H = 82;
      x.fillStyle = '#ffffff'; rr(x, X - 6, Y - 6, W + 12, H + 12, 10); x.fill();
      const lit = Math.random() < .25;
      const gr = x.createLinearGradient(X, Y, X + W, Y + H);
      if (lit) { gr.addColorStop(0, '#fff3c4'); gr.addColorStop(1, '#ffc56b'); } else { gr.addColorStop(0, '#b9f0ff'); gr.addColorStop(.55, '#5aa9f0'); gr.addColorStop(1, '#2f5fc4'); }
      x.fillStyle = gr; rr(x, X, Y, W, H, 6); x.fill();
      if (Math.random() < .4) { x.fillStyle = pick(['#ff7aa8', '#ffd166', '#8ef0b5', '#c9b4ff']); rr(x, X, Y, W * .32, H, 6); x.fill(); rr(x, X + W * .68, Y, W * .32, H, 6); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(X + 8, Y + H - 10); x.lineTo(X + W * .55, Y + 6); x.lineTo(X + W * .72, Y + 6); x.lineTo(X + 18, Y + H - 4); x.fill();
      x.fillStyle = '#ffffff'; x.fillRect(X + W / 2 - 3, Y, 6, H); x.fillRect(X, Y + H * .45, W, 5);
      x.fillStyle = shade(color, -.25); x.fillRect(X - 10, Y + H + 6, W + 20, 8);
      if (Math.random() < .3) { x.fillStyle = '#3fbf5f'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(X + 6 + k * 13, Y + H + 2, 8, 0, 7); x.fill(); } x.fillStyle = '#ff5d8f'; x.beginPath(); x.arc(X + 20, Y + H - 2, 4, 0, 7); x.arc(X + 50, Y + H - 1, 4, 0, 7); x.fill(); }
    }
  }, { repeat: [1, 1] });
}
function shopTex([name, bg, fg]) {
  return canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#2b3550'; x.fillRect(0, 0, w, h);
    const stripe = 32; for (let i = 0; i < w / stripe; i++) { x.fillStyle = i % 2 ? '#ffffff' : bg; x.fillRect(i * stripe, 0, stripe, 30); }
    for (let i = 0; i < w / stripe; i++) { x.fillStyle = i % 2 ? '#ffffff' : bg; x.beginPath(); x.arc(i * stripe + stripe / 2, 30, stripe / 2, 0, Math.PI); x.fill(); }
    x.fillStyle = bg; rr(x, 120, 46, 272, 34, 8); x.fill();
    x.fillStyle = fg; x.font = '30px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 256, 64);
    for (const X of [14, 400]) { const g = x.createLinearGradient(X, 50, X + 98, 124); g.addColorStop(0, '#9fe6ff'); g.addColorStop(1, '#3466c9'); x.fillStyle = g; rr(x, X, 48, 98, 76, 6); x.fill(); x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(X + 12, 52, 10, 68); }
    x.fillStyle = '#ffd23f'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(128 + i * 32, 92, 4, 0, 7); x.fill(); }
    x.fillStyle = '#16203a'; rr(x, 226, 88, 60, 40, 4); x.fill();
  });
}
function adTex([text, a, b]) {
  return canvasTex(512, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 9; i++) { x.save(); x.translate(256, 128); x.rotate(i * .7); x.fillRect(0, -12, 400, 24); x.restore(); }
    x.fillStyle = '#fff'; star(x, 70, 70, 40); star(x, 450, 200, 26);
    x.font = '74px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 16; x.strokeStyle = '#1b1240'; x.strokeText(text, 256, 132, 470); x.fillStyle = '#fff'; x.fillText(text, 256, 132, 470);
    x.lineWidth = 14; x.strokeStyle = '#fff'; x.strokeRect(7, 7, w - 14, h - 14);
  });
}
function wallTex(i) {
  return canvasTex(1024, 205, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e6dfd2'); g.addColorStop(1, '#bdb2a2'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,60,40,.18)'; x.lineWidth = 3; for (let X = 0; X <= w; X += 128) { x.beginPath(); x.moveTo(X, 0); x.lineTo(X, h); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 0, w, 6);
    for (let k = 0; k < 40; k++) { x.fillStyle = 'rgba(90,70,50,' + (Math.random() * .07) + ')'; x.beginPath(); x.arc(Math.random() * w, h - Math.random() * 60, 10 + Math.random() * 30, 0, 7); x.fill(); }
    const pieces = 2 + (i % 2);
    for (let p = 0; p < pieces; p++) {
      const cx = (p + .5) * w / pieces + (Math.random() - .5) * 60, cy = h * .5 + (Math.random() - .5) * 20, cols = GRAFF_COLORS[(i * 3 + p) % GRAFF_COLORS.length];
      blob(x, cx, cy, 58 + Math.random() * 14, shade(cols[1], .55));
      graffiti(x, cx, cy, 70 + Math.random() * 18, GRAFF_WORDS[(i * 5 + p * 3) % GRAFF_WORDS.length], cols, (Math.random() - .5) * .25);
    }
    // little characters & tags
    for (let k = 0; k < 3; k++) {
      const X = Math.random() * w, Y = 40 + Math.random() * 120, c = pick(['#ffd23f', '#3ad6ff', '#ff5d8f', '#8dff5a']);
      x.fillStyle = c; x.strokeStyle = '#15112e'; x.lineWidth = 5; x.beginPath(); x.arc(X, Y, 18, 0, 7); x.fill(); x.stroke();
      x.fillStyle = '#15112e'; x.beginPath(); x.arc(X - 6, Y - 4, 3, 0, 7); x.arc(X + 6, Y - 4, 3, 0, 7); x.fill();
      x.beginPath(); x.lineWidth = 3; x.arc(X, Y + 2, 9, .2, Math.PI - .2); x.stroke();
    }
    x.font = '26px ' + GFONT; x.fillStyle = 'rgba(30,20,60,.55)'; x.fillText(pick(['kai!', 'zo', 'MR', 'lux', '♥', 'yo']), Math.random() * w, 180);
  });
}
function bannerTex(text, bg, fg) {
  return canvasTex(1024, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.font = '84px ' + GFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 14; x.strokeStyle = '#1b1240'; x.strokeText(text, w / 2, h / 2 + 4); x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 4);
    x.fillStyle = '#fff'; star(x, 60, 64, 34); star(x, w - 60, 64, 34);
  });
}

function buildSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#1f6dff') }, mid: { value: new THREE.Color('#5cbcff') }, hor: { value: new THREE.Color(MR.FOG) }, sunDir: { value: new THREE.Vector3(.35, .35, -1).normalize() } },
    vertexShader: 'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 mid;uniform vec3 hor;uniform vec3 sunDir;varying vec3 v;void main(){vec3 n=normalize(v);float h=n.y;vec3 c=mix(hor,mid,smoothstep(.0,.22,h));c=mix(c,top,smoothstep(.2,.75,h));float s=max(dot(n,sunDir),0.);c+=vec3(1.,.85,.55)*pow(s,24.)*.6+vec3(1.,.95,.8)*pow(s,400.)*2.;gl_FragColor=vec4(c,1.);}'
  }));
  sky.renderOrder = -10; scene.add(sky);
  const sunGlow = glowSprite('#fff4d6', 120, .9); sunGlow.material.fog = false; sunGlow.position.copy(new THREE.Vector3(.35, .35, -1).normalize().multiplyScalar(400)); scene.add(sunGlow);
  // puffy cartoon clouds
  const cloudMat = mat('#ffffff', 1, 0, { emissive: '#e4f2ff', ei: .55, fog: false });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(), n = 5 + Math.floor(rnd() * 4), s = 5 + rnd() * 6;
    for (let k = 0; k < n; k++) { const r = s * (.55 + rnd() * .5); const m = new THREE.Mesh(MR.sphereGeo, cloudMat); m.position.set((k - n / 2) * s * .75, Math.sin(k / (n - 1) * Math.PI) * s * .45, (rnd() - .5) * s * .6); m.scale.set(r, r * .78, r * .8); g.add(m); }
    const base = new THREE.Mesh(MR.sphereGeo, cloudMat); base.scale.set(n * s * .45, s * .35, s * .7); base.position.y = -s * .2; g.add(base);
    g.position.set((rnd() - .5) * 520, 55 + rnd() * 70, -190 - rnd() * 170); g.userData.v = .6 + rnd() * 1.2;
    scene.add(g); clouds.push(g);
  }
  MR.clouds = clouds;
  // distant pastel skyline and hills (fog-free, colour-graded toward the sky)
  const far = new THREE.Group();
  const hillMat = mat('#9ee6b8', 1, 0, { fog: false });
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(MR.sphereGeo, hillMat); m.position.set(-320 + i * 80 + rnd() * 30, -8, -340 - rnd() * 30); m.scale.set(70 + rnd() * 30, 28 + rnd() * 22, 30); far.add(m); }
  const skyCols = ['#a9cdf7', '#bdb7f2', '#9fd8ee', '#c9bdf0', '#b3e0f5', '#f5c6dc'];
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 46; i++) {
    const h = 18 + rnd() * (layer ? 60 : 45), x = (rnd() - .5) * 560, z = -270 - layer * 40 - rnd() * 20;
    if (Math.abs(x) < 16) continue;
    const col = new THREE.Color(pick(skyCols)).lerp(new THREE.Color(MR.FOG), layer ? .45 : .2);
    const m = box(far, x, h / 2 - 2, z, 10 + rnd() * 14, h, 10, mat('#' + col.getHexString(), 1, 0, { fog: false }));
    if (rnd() < .3) box(far, x, h + 2, z, 1, 6, 1, mat('#' + col.getHexString(), 1, 0, { fog: false }));
  }
  batchStatic(far); scene.add(far);
}

function buildTracks() {
  const gt = gravelTex(); gt.repeat.set(6, 7);
  const groundMat = texMat(gt, '#d8c9b8', .95);
  const bedTex = gt.clone(); bedTex.needsUpdate = true; bedTex.repeat.set(1, 8);
  const bedMat = texMat(bedTex, '#ffffff', .95);
  const tieMat = mat('#7a4f36', .85), railMat = mat('#e3e8f0', .22, .95, { env: 1.4 }), plateMat = mat('#4a4658', .6, .4);
  const tiles = [];
  for (let n = 0; n < TILES; n++) {
    const g = new THREE.Group(); g.position.z = 24 - n * TILE;
    const ground = new THREE.Mesh(MR.planeGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.scale.set(22, TILE, 1); ground.position.y = -.12; ground.receiveShadow = true; g.add(ground);
    const ties = new THREE.InstancedMesh(MR.cubeGeo, tieMat, TRACK_X.length * 18); const o = new THREE.Object3D(); let k = 0;
    for (const x of TRACK_X) {
      box(g, x, -.06, 0, 2.9, .14, TILE, bedMat);
      for (let j = 0; j < 18; j++) { o.position.set(x, .03, j * (TILE / 18) - TILE / 2 + .6); o.scale.set(2.5, .14, .32); o.updateMatrix(); ties.setMatrixAt(k++, o.matrix); }
      for (const rx of [-.75, .75]) { box(g, x + rx, .1, 0, .26, .06, TILE, plateMat); box(g, x + rx, .19, 0, .13, .16, TILE, railMat); }
    }
    ties.receiveShadow = true; g.add(ties);
    // trackside cable trough + markers between running lanes and outer tracks
    for (const s of [-1, 1]) {
      box(g, s * 5.5, .05, 0, .5, .3, TILE, '#9aa3b5');
      for (let j = 0; j < 3; j++) box(g, s * 5.5, .25, j * 8 - 8, .55, .12, .4, '#ffcf3f');
    }
    batchStatic(g); scene.add(g); tiles.push(g);
  }
  return tiles;
}

function buildStreet() {
  const facades = BUILD_COLORS.map(c => texMat(facadeTex(c), '#ffffff', .75));
  const sides = BUILD_COLORS.map(c => mat(shade(c, -.06), .8));
  const shopMats = SHOPS.map(s => texMat(shopTex(s), '#ffffff', .6));
  const adMats = ADS.map(a => new THREE.MeshStandardMaterial({ map: adTex(a), roughness: .5, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 }));
  const wallMats = Array.from({ length: 10 }, (_, i) => texMat(wallTex(i), '#ffffff', .9));
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex('METRO RUSH', ['#ff3d7f', '#ff9a00'], '#ffffff') });
  const banner2 = new THREE.MeshBasicMaterial({ map: bannerTex('DOWNTOWN LINE', ['#2f6bff', '#3ad6ff'], '#ffffff') });
  const lampOn = mat('#fff3c4', .4, 0, { emissive: '#ffe08a', ei: 1.4 });
  const sigRed = mat('#ff3b3b', .3, 0, { emissive: '#ff2a2a', ei: 2 }), sigGreen = mat('#3bff7a', .3, 0, { emissive: '#22ff6a', ei: 2 }), sigOff = mat('#2b2b38', .4);
  const treeCols = ['#56c95a', '#3fb86b', '#8bd650', '#ff9ecb', '#2fae7a'];
  const mods = [];
  for (let n = 0; n < MODS; n++) {
    const g = new THREE.Group(); g.position.z = 20 - n * MOD;
    for (const s of [-1, 1]) {
      // graffiti wall
      box(g, s * 11.15, 1.9, 0, .9, 4.2, MOD, '#cfc6b8');
      plane(g, s * 10.69, 1.95, 0, MOD, 4.0, wallMats[(n * 2 + (s > 0 ? 1 : 0)) % wallMats.length], s < 0 ? Math.PI / 2 : -Math.PI / 2);
      box(g, s * 11.1, 4.1, 0, 1.15, .26, MOD + .02, '#f4efe6');
      if (n % 2 === 0) {
        cylinder(g, s * 11.1, 6.2, -4, .1, 4.2, '#3b4a6b'); box(g, s * 10.4, 8.25, -4, 1.5, .14, .16, '#3b4a6b');
        box(g, s * 9.7, 8.12, -4, .7, .18, .45, lampOn);
      }
      // trackside signal between running lanes and outer track
      if (n % 2 === 1) {
        cylinder(g, s * 5.5, 2.2, 3, .09, 4.4, '#2e3448');
        box(g, s * 5.5, 4.55, 3, .5, 1.25, .4, '#1d2133');
        const red = (n + (s > 0 ? 1 : 0)) % 4 === 1;
        box(g, s * 5.5, 4.9, 3.21, .26, .26, .04, red ? sigRed : sigOff);
        box(g, s * 5.5, 4.2, 3.21, .26, .26, .04, red ? sigOff : sigGreen);
        const gs = glowSprite(red ? '#ff4040' : '#40ff80', 1.6, .8); gs.position.set(s * 5.5, red ? 4.9 : 4.2, 3.3); g.add(gs);
      }
      // buildings or a little park
      const park = rnd() < .22;
      if (park) {
        for (let k = 0; k < 4; k++) {
          const tz = -8 + k * 5 + rnd(), tx = s * (13 + rnd() * 3), c = pick(treeCols);
          cylinder(g, tx, 1.8, tz, .25, 3.6, '#8a5a3c');
          sphere(g, tx, 4.6, tz, 1.9, 1.7, 1.9, c); sphere(g, tx + .8, 4.1, tz + .5, 1.2, 1.1, 1.2, shade(c, .15)); sphere(g, tx - .6, 5.4, tz - .3, 1.1, 1, 1.1, shade(c, -.1));
        }
        const h = 20 + rnd() * 14, c = Math.floor(rnd() * BUILD_COLORS.length);
        box(g, s * 27, h / 2 - .2, 0, 9, h, 18, sides[c], true);
        uvPlane(g, s * 22.49, h / 2 - .2, 0, 18, h, facades[c], s < 0 ? Math.PI / 2 : -Math.PI / 2, 8, 7);
      } else {
        let z0 = -MOD / 2;
        while (z0 < MOD / 2 - 2) {
          const wz = Math.min(MOD / 2 - z0, 7 + Math.floor(rnd() * 3) * 3.5), h = 9 + Math.floor(rnd() * 6) * 3.5, depth = 10, ci = Math.floor(rnd() * BUILD_COLORS.length);
          const zc = z0 + wz / 2, xf = s * 12.3, xc = s * (12.3 + depth / 2);
          box(g, xc, h / 2 - .2, zc, depth, h, wz - .1, sides[ci], true);
          const ry = s < 0 ? Math.PI / 2 : -Math.PI / 2;
          uvPlane(g, xf - s * .01, (h + 3.4) / 2 - .2, zc, wz - .1, h - 3.4, facades[ci], ry, 8, 7);
          uvPlane(g, xf - s * .01, 1.5, zc, wz - .1, 3.4, shopMats[Math.floor(rnd() * shopMats.length)], ry, 8, 3.4);
          uvPlane(g, xc, (h + 3.4) / 2 - .2, zc + wz / 2 - .04, depth, h - 3.4, facades[ci], 0, 8, 7);
          // roof cap + parapet
          box(g, xc, h - .1, zc, depth + .3, .4, wz + .2, shade(BUILD_COLORS[ci], -.25));
          const r = rnd();
          if (r < .3) { // water tower
            const tx = xc + s * 1.5, tz = zc;
            for (const [dx, dz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) cylinder(g, tx + dx, h + 1.2, tz + dz, .09, 2.4, '#5b4a6e');
            cylinder(g, tx, h + 3.5, tz, 1.4, 2.6, '#c47a4a', true); cone(g, tx, h + 5.3, tz, 1.55, 1.1, '#8f4e33');
          } else if (r < .58) { // billboard facing track
            const bz = zc, bx = xf + s * 1.2;
            for (const dz of [-2, 2]) cylinder(g, bx, h + 1.4, bz + dz, .1, 2.8, '#39405a');
            box(g, bx + s * .08, h + 3.6, bz, .2, 2.8, 5.6, '#ffffff');
            plane(g, bx - s * .03, h + 3.6, bz, 5.3, 2.5, adMats[Math.floor(rnd() * adMats.length)], s < 0 ? Math.PI / 2 : -Math.PI / 2);
          } else {
            box(g, xc, h + .6, zc - 1.5, 2, 1.2, 1.6, '#dfe6f0', true); box(g, xc + s * 2, h + .45, zc + 1.5, 1.4, .9, 1.4, '#c8d2e0');
            cylinder(g, xc - s * 2, h + 2.5, zc, .06, 5, '#6c7390');
          }
          z0 += wz;
        }
      }
    }
    // overpass / gantry rhythm
    if (n % 6 === 3) {
      box(g, 0, 11.6, 0, 26, 1.4, 4.5, '#ff4f6d', true); box(g, 0, 10.85, 0, 26, .15, 4.2, '#fff1f4');
      for (const z of [-2.1, 2.1]) {
        box(g, 0, 13.2, z, 26, .25, .25, '#ffd23f'); box(g, 0, 12.4, z, 26, .12, .12, '#ffd23f');
        for (let i = 0; i < 14; i++) { const b = box(g, -12.5 + i * 1.92, 12.8, z, .14, 1.1, .14, '#ffd23f'); b.rotation.z = i % 2 ? .6 : -.6; }
      }
      for (const s of [-1, 1]) box(g, s * 12.2, 5.4, 0, 1.6, 11, 3, '#e8436a', true);
      plane(g, 0, 11.6, 2.27, 12, 1.5, bannerMat, 0);
    }
    if (n % 6 === 0) {
      for (const s of [-1, 1]) box(g, s * 10.2, 5, -2, .45, 10, .45, '#3d6bff', true);
      box(g, 0, 9.9, -2, 20.8, .5, .5, '#3d6bff', true); box(g, 0, 9.2, -2, 20.8, .2, .2, '#3d6bff');
      plane(g, 0, 10.75, -1.74, 10, 1.25, banner2, 0); box(g, 0, 10.75, -1.82, 10.2, 1.4, .12, '#1d2bff');
      for (const x of LANES) { box(g, x, 8.7, -2, .7, 1, .4, '#1d2133'); box(g, x, 8.7, -1.79, .3, .3, .04, sigGreen); }
    }
    batchStatic(g); scene.add(g); mods.push(g);
  }
  return mods;
}

MR.buildWorld = function () {
  buildSky();
  MR.trackTiles = buildTracks();
  MR.street = buildStreet();
};
MR.scrollWorld = function (step) {
  for (const g of MR.trackTiles) { g.position.z += step; if (g.position.z > 48) g.position.z -= TILE * TILES; }
  for (const g of MR.street) { g.position.z += step; if (g.position.z > 42) g.position.z -= MOD * MODS; }
};
})();
