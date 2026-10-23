import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FLAVORS } from './flavors.js';
import { makeCanKit, makeCan, printOnCan, bubbleTexture, CAN_HEIGHT } from './can.js';
import { paintCan } from './paint.js';
import logoUrl from './assets/noob-wordmark.png';
import './style.css';

// NOOB Cold Drinks: ten 3D cans, one for each screen of scrolling. Scrolling moves the cans up, turns the one in front and changes the colours of the page; the text beside it
// (or under it, on an upright phone) follows. Everything is made in code: the cans, their paint and their droplets (can.js, paint.js), so there is nothing big to download.
const N = FLAVORS.length;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const pad2 = (n) => String(n).padStart(2, '0');

// ---- the page: ten screens to scroll through, ten text panels, the dots
const track = $('#track'), panelsEl = $('#panels'), dotsEl = $('#dots'), hint = $('#hint'), ring = $('#ring'), countEl = $('#count');
$('#brand-logo').src = logoUrl; $('#load-logo').src = logoUrl;
const bars = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
FLAVORS.forEach((f, i) => {
  track.appendChild(document.createElement('section'));
  const p = document.createElement('article');
  p.className = 'panel'; p.setAttribute('aria-hidden', 'true');
  p.style.setProperty('--a', f.colors.a); p.style.setProperty('--b', f.colors.b);
  p.innerHTML = `<div class="card">
    <p class="idx"><b>${pad2(i + 1)}</b> / ${pad2(N)}</p>
    <h2 class="name">${f.name}</h2>
    <p class="tag">${f.tagline}</p>
    <ul class="chips">${f.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    <div class="levels"><div class="level"><small>Sweet</small><div class="bars">${bars(f.sweet)}</div></div><div class="level"><small>Fizz</small><div class="bars">${bars(f.fizz)}</div></div></div>
    <div class="row"><div class="spec"><small>Size</small><b>${f.size}</b></div><div class="spec"><small>Serve</small><b>Ice cold</b></div><div class="price"><small>Price</small><b>₹${f.price}</b></div></div>
  </div>`;
  panelsEl.appendChild(p);
  const d = document.createElement('button'); d.type = 'button'; d.setAttribute('aria-label', `${f.name} (${i + 1} of ${N})`);
  d.addEventListener('click', () => goTo(i)); dotsEl.appendChild(d);
});
const panels = [...panelsEl.children], dots = [...dotsEl.children], cards = panels.map((p) => p.firstElementChild);
const sectionH = () => track.firstElementChild.getBoundingClientRect().height || innerHeight;
function goTo(i) { scrollTo({ top: clamp(i, 0, N - 1) * sectionH(), behavior: reduceMotion ? 'auto' : 'smooth' }); }
addEventListener('keydown', (e) => {
  const k = e.key; const cur = Math.round(state.target);
  if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); goTo(cur + 1); }
  else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); goTo(cur - 1); }
  else if (k === 'Home') { e.preventDefault(); goTo(0); } else if (k === 'End') { e.preventDefault(); goTo(N - 1); }
});

// ---- 3D
const state = { p: 0, target: 0, mx: 0, my: 0 };
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#stage'), antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  const list = $('#nogl-list');
  FLAVORS.forEach((f) => { const li = document.createElement('li'); li.innerHTML = `<span>${f.name}</span><span>₹${f.price}</span>`; list.appendChild(li); });
  $('#nogl').hidden = false; $('#loading').classList.add('done');
  throw new Error('WebGL is not available');
}
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const world = new THREE.Group(); scene.add(world);

const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 7); scene.add(key);
const rimA = new THREE.PointLight(0xffffff, 60, 26, 1.6); rimA.position.set(-5, 2.5, -3); scene.add(rimA);
const rimB = new THREE.PointLight(0xffffff, 45, 26, 1.6); rimB.position.set(5, -1.5, -2.5); scene.add(rimB);

const kit = makeCanKit();
const cans = FLAVORS.map((f) => { const c = makeCan(kit, f); world.add(c.group); return c; });

// bubbles rising behind the cans
const BUBBLES = 130, bpos = new Float32Array(BUBBLES * 3), bspeed = new Float32Array(BUBBLES);
for (let i = 0; i < BUBBLES; i++) { bpos[i * 3] = (Math.random() - 0.5) * 22; bpos[i * 3 + 1] = (Math.random() - 0.5) * 16; bpos[i * 3 + 2] = -1 - Math.random() * 7; bspeed[i] = 0.15 + Math.random() * 0.5; }
const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
const bubbles = new THREE.Points(bgeo, new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
bubbles.frustumCulled = false; world.add(bubbles);

// the size of the screen decides the layout: beside the text on a wide screen, above the text on an upright phone
const FOV = 30;
let stacked = false, visH = 6, SPACING = 6.2;   // how far apart the cans are in height (further on a phone, so that the next one does not peek out under the text)
function layout() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  stacked = aspect < 1.05;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2)); renderer.setSize(w, h, false);
  camera.aspect = aspect;
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // the can should fill about two thirds of the height beside the text, and under half of it above the text (upright phone), and always fit the width
  let z = (CAN_HEIGHT / (h < 520 ? 0.82 : 0.68)) / (2 * tan);
  if (stacked) z = Math.max(CAN_HEIGHT / 0.46 / (2 * tan), 3.9 / (2 * tan * aspect));
  camera.position.set(0, 0, z); camera.updateProjectionMatrix();
  visH = 2 * z * tan; const visW = visH * aspect;
  world.position.x = stacked ? 0 : -visW * 0.21;
  world.position.y = stacked ? visH * 0.17 : -visH * 0.01;
  // far enough apart that the next can is out of sight (it comes in from below, the one before leaves upwards)
  SPACING = visH / 2 + CAN_HEIGHT * 0.5 + Math.abs(world.position.y) + 0.5;
  document.body.classList.toggle('stacked', stacked);
}
layout(); addEventListener('resize', layout);
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { state.mx = (e.clientX / innerWidth - 0.5) * 2; state.my = (e.clientY / innerHeight - 0.5) * 2; } }, { passive: true });

// colours of the flavour in front, mixed with the next one while scrolling
const colA = new THREE.Color(), colB = new THREE.Color(), tmp = new THREE.Color();
function mixColors(p, pick, out) { const i = Math.floor(p), j = Math.min(N - 1, i + 1), f = p - i; return out.set(pick(FLAVORS[clamp(i, 0, N - 1)])).lerp(tmp.set(pick(FLAVORS[j])), f); }
const css = document.documentElement.style;

// a link can open on one can: /cold-drinks/#cherry-blaze (or #8); and a page that is opened half way down (a refresh) starts there instead of sliding there
{
  const want = decodeURIComponent(location.hash.slice(1)), wi = FLAVORS.findIndex((f, i) => f.id === want || String(i + 1) === want);
  if (wi >= 0 && want) {
    try { history.scrollRestoration = 'manual'; } catch { /* the browser keeps its own way */ }
    const jump = () => scrollTo(0, wi * sectionH());
    jump(); addEventListener('load', jump, { once: true });
  }
  state.p = state.target = clamp(scrollY / sectionH(), 0, N - 1);
}

let last = performance.now(), shownIdx = -1, lastP = -1;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  state.target = clamp(scrollY / sectionH(), 0, N - 1);
  state.p += (state.target - state.p) * (reduceMotion ? 1 : 1 - Math.pow(0.0009, dt));
  if (Math.abs(state.target - state.p) < 0.0005) state.p = state.target;
  const p = state.p, t = now / 1000;

  cans.forEach((c, i) => {
    const d = i - p, ad = Math.abs(d);
    c.group.visible = ad < 1.7;
    if (!c.group.visible) return;
    c.group.position.set(0, -d * SPACING + (reduceMotion ? 0 : Math.sin(t * 1.1 + i) * 0.07), -Math.min(ad, 1.5) * 1.2);
    c.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.78, clamp(ad, 0, 1)));
    c.spin.rotation.y = -d * Math.PI * 1.5 + (reduceMotion ? 0 : Math.sin(t * 0.7 + i) * 0.1) + state.mx * 0.25 * (1 - clamp(ad, 0, 1));
    c.spin.rotation.x = state.my * 0.06 * (1 - clamp(ad, 0, 1));
    c.spin.rotation.z = -0.1 + d * 0.06;
    c.glow.material.opacity = 0.6 * (1 - clamp(ad, 0, 1) * 0.7);
    c.shadow.material.opacity = 1 - clamp(ad, 0, 1);
  });

  // the light and the page take the colours of the flavour
  mixColors(p, (f) => f.colors.a, colA); mixColors(p, (f) => f.colors.b, colB);
  rimA.color.copy(colA); rimB.color.copy(colB);
  if (Math.abs(p - lastP) > 0.0003) {
    lastP = p;
    const bg1 = mixColors(p, (f) => f.colors.bg1, new THREE.Color()), bg2 = mixColors(p, (f) => f.colors.bg2, new THREE.Color());
    css.setProperty('--bg1', '#' + bg1.getHexString()); css.setProperty('--bg2', '#' + bg2.getHexString());
    css.setProperty('--a', '#' + colA.getHexString()); css.setProperty('--b', '#' + colB.getHexString());
    bubbles.material.color.copy(colB).lerp(tmp.set(0xffffff), 0.35);
    panels.forEach((el, i) => {
      const d = i - p, ad = Math.abs(d), o = clamp(1 - ad * 2.2, 0, 1);
      el.style.opacity = o; el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
      cards[i].style.transform = `translate3d(0, ${(d * 60).toFixed(1)}px, 0)`;
    });
    ring.style.strokeDashoffset = (119.4 * (1 - p / (N - 1))).toFixed(2);
    hint.classList.toggle('gone', p > 0.25);
    const idx = Math.round(p);
    if (idx !== shownIdx) {
      shownIdx = idx; countEl.textContent = pad2(idx + 1);
      dots.forEach((b, k) => b.setAttribute('aria-current', k === idx ? 'true' : 'false'));
      panels.forEach((el, k) => el.setAttribute('aria-hidden', k === idx ? 'false' : 'true'));
      document.title = `${FLAVORS[idx].name} • NOOB Cold Drinks`;
    }
  }
  // bubbles drift up and wrap round; they move a little slower than the cans (depth)
  if (!reduceMotion) for (let i = 0; i < BUBBLES; i++) { let y = bpos[i * 3 + 1] + bspeed[i] * dt; if (y > 8) y = -8; bpos[i * 3 + 1] = y; bpos[i * 3] += Math.sin(t * 0.5 + i) * 0.002; }
  bgeo.attributes.position.needsUpdate = true;
  bubbles.position.y = state.p * SPACING * 0.45;
  renderer.render(scene, camera);
}

// ---- paint the cans (the first three before the page is shown, the others while it is quiet), then show the page
const logo = new Image(); logo.src = logoUrl;
(async () => {
  await (logo.decode ? logo.decode().catch(() => undefined) : new Promise((r) => { logo.onload = r; }));
  const width = coarse ? 1280 : 1536;
  const print = (i) => printOnCan(cans[i], paintCan(FLAVORS[i], logo, width), renderer);
  [0, 1, 2].forEach(print);
  frame(performance.now());
  requestAnimationFrame(() => requestAnimationFrame(() => $('#loading').classList.add('done')));
  let next = 3; const step = () => { if (next >= N) return; print(next++); setTimeout(step, 60); };
  setTimeout(step, 400);
})();

addEventListener('visibilitychange', () => { last = performance.now(); });
