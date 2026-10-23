import { PRINT_ASPECT } from './dims.js';

// The printed artwork of the ten cans, drawn on a canvas that is wrapped round the can: its left and right edges meet at the BACK of the can, so the doodles are drawn so that they carry on
// over that seam. The middle of the canvas is the FRONT. A can is one plain colour (all the way down, no dark bottom) with: a ring in another colour at the top (black, or gold on the black can);
// the big NOOB logo running up the front as a block letter word: a thick outline, and a 3D side shaded with pen hatching, like a hand-drawn sticker; and hand-drawn doodles around it
// (paper plane, ghost, hearts, stars, arrows, notes ... and the thin icons of the app's wallpaper), all in one line colour (black, or white on the black can).
const TAU = Math.PI * 2;
const FONT = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

const at = (W, x, reach, fn) => { fn(x); if (x < reach) fn(x + W); if (x > W - reach) fn(x - W); };   // draws again on the other side of the seam when it reaches over an edge
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- the doodles: hand-drawn looking line art, each centred on (0, 0) and about 2s wide, stroked in the line colour
const ICONS = [
  function plane(c, s) { c.beginPath(); c.moveTo(-s, s * 0.1); c.lineTo(s, -s * 0.9); c.lineTo(s * 0.25, s * 0.9); c.lineTo(-s * 0.1, s * 0.25); c.closePath(); c.moveTo(-s * 0.1, s * 0.25); c.lineTo(s, -s * 0.9); c.moveTo(-s * 0.1, s * 0.25); c.lineTo(-s * 0.2, s * 0.85); c.lineTo(s * 0.25, s * 0.9); c.stroke(); },
  function ghost(c, s) { c.beginPath(); c.moveTo(-s * 0.7, s); c.lineTo(-s * 0.7, -s * 0.15); c.arc(0, -s * 0.15, s * 0.7, Math.PI, 0); c.lineTo(s * 0.7, s); c.lineTo(s * 0.35, s * 0.72); c.lineTo(0, s); c.lineTo(-s * 0.35, s * 0.72); c.closePath(); c.moveTo(-s * 0.2, -s * 0.25); c.arc(-s * 0.28, -s * 0.25, s * 0.08, 0, TAU); c.moveTo(s * 0.4, -s * 0.25); c.arc(s * 0.32, -s * 0.25, s * 0.08, 0, TAU); c.stroke(); },
  function loops(c, s) { c.beginPath(); for (let t = 0; t <= TAU * 3; t += 0.15) { const x = -s + (t / (TAU * 3)) * s * 2 + Math.sin(t) * s * 0.28, y = -Math.cos(t) * s * 0.28; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); },
  function curlArrow(c, s) { c.beginPath(); c.moveTo(-s, s * 0.7); c.bezierCurveTo(-s * 0.3, s * 0.9, s * 0.2, -s * 0.2, -s * 0.3, -s * 0.3); c.bezierCurveTo(-s * 0.8, -s * 0.35, -s * 0.4, s * 0.6, s * 0.6, -s * 0.4); c.moveTo(s * 0.15, -s * 0.5); c.lineTo(s * 0.6, -s * 0.4); c.lineTo(s * 0.5, s * 0.05); c.stroke(); },
  function xo(c, s) { c.beginPath(); c.moveTo(-s * 0.9, -s * 0.8); c.lineTo(-s * 0.3, -s * 0.2); c.moveTo(-s * 0.3, -s * 0.8); c.lineTo(-s * 0.9, -s * 0.2); c.moveTo(s * 0.7, s * 0.4); c.arc(s * 0.4, s * 0.4, s * 0.3, 0, TAU); c.moveTo(-s * 0.2, s * 0.6); c.lineTo(s * 0.1, s * 0.95); c.stroke(); },
  function gem(c, s) { c.beginPath(); c.moveTo(-s, -s * 0.25); c.lineTo(-s * 0.5, -s * 0.85); c.lineTo(s * 0.5, -s * 0.85); c.lineTo(s, -s * 0.25); c.lineTo(0, s); c.closePath(); c.moveTo(-s, -s * 0.25); c.lineTo(s, -s * 0.25); c.moveTo(-s * 0.5, -s * 0.85); c.lineTo(-s * 0.25, -s * 0.25); c.lineTo(0, s); c.moveTo(s * 0.5, -s * 0.85); c.lineTo(s * 0.25, -s * 0.25); c.lineTo(0, s); c.stroke(); },
  function chili(c, s) { c.beginPath(); c.moveTo(s * 0.55, -s * 0.8); c.bezierCurveTo(s * 0.95, -s * 0.2, s * 0.5, s * 0.55, -s * 0.95, s * 0.9); c.bezierCurveTo(-s * 0.35, s * 0.3, -s * 0.1, -s * 0.35, s * 0.55, -s * 0.8); c.moveTo(s * 0.55, -s * 0.8); c.lineTo(s * 0.5, -s * 1.05); c.lineTo(s * 0.8, -s * 1); c.stroke(); },
  function smiley(c, s) { c.beginPath(); c.arc(0, 0, s, 0, TAU); c.moveTo(-s * 0.3, -s * 0.2); c.arc(-s * 0.35, -s * 0.2, s * 0.07, 0, TAU); c.moveTo(s * 0.4, -s * 0.2); c.arc(s * 0.35, -s * 0.2, s * 0.07, 0, TAU); c.moveTo(-s * 0.5, s * 0.15); c.quadraticCurveTo(0, s * 0.85, s * 0.5, s * 0.15); c.stroke(); },
  function star(c, s) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.45 : s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke(); },
  function heart(c, s) { c.beginPath(); c.moveTo(0, s * 0.85); c.bezierCurveTo(-s * 1.35, -s * 0.1, -s * 0.5, -s * 1.1, 0, -s * 0.35); c.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.35, -s * 0.1, 0, s * 0.85); c.stroke(); },
  function bolt(c, s) { c.beginPath(); c.moveTo(s * 0.25, -s); c.lineTo(-s * 0.5, s * 0.1); c.lineTo(-s * 0.05, s * 0.1); c.lineTo(-s * 0.3, s); c.lineTo(s * 0.5, -s * 0.2); c.lineTo(s * 0.05, -s * 0.2); c.closePath(); c.stroke(); },
  function spiral(c, s) { c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const r = (t / 14) * s; const x = Math.cos(t) * r, y = Math.sin(t) * r; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); },
  function chat(c, s) { c.beginPath(); c.roundRect(-s, -s * 0.8, s * 2, s * 1.4, s * 0.25); c.moveTo(-s * 0.55, s * 0.6); c.lineTo(-s * 0.55, s * 1.05); c.lineTo(-s * 0.1, s * 0.6); c.stroke(); },
  function notes(c, s) { c.beginPath(); c.ellipse(-s * 0.6, s * 0.65, s * 0.3, s * 0.22, -0.4, 0, TAU); c.moveTo(-s * 0.32, s * 0.6); c.lineTo(-s * 0.32, -s * 0.75); c.lineTo(s * 0.7, -s * 0.95); c.lineTo(s * 0.7, s * 0.45); c.moveTo(s * 0.98, s * 0.45); c.ellipse(s * 0.45, s * 0.5, s * 0.3, s * 0.22, -0.4, 0, TAU); c.moveTo(-s * 0.32, -s * 0.35); c.lineTo(s * 0.7, -s * 0.55); c.stroke(); },
  function headphones(c, s) { c.beginPath(); c.arc(0, s * 0.1, s * 0.85, Math.PI, 0); c.roundRect(-s * 1.0, s * 0.05, s * 0.4, s * 0.8, s * 0.12); c.roundRect(s * 0.6, s * 0.05, s * 0.4, s * 0.8, s * 0.12); c.stroke(); },
  function camera(c, s) { c.beginPath(); c.roundRect(-s, -s * 0.55, s * 2, s * 1.35, s * 0.2); c.moveTo(-s * 0.4, -s * 0.55); c.lineTo(-s * 0.25, -s * 0.95); c.lineTo(s * 0.25, -s * 0.95); c.lineTo(s * 0.4, -s * 0.55); c.moveTo(s * 0.45, s * 0.12); c.arc(0, s * 0.12, s * 0.45, 0, TAU); c.stroke(); },
  function moon(c, s) { c.beginPath(); c.arc(0, 0, s, Math.PI * 0.35, Math.PI * 1.65, false); c.arc(s * 0.35, -s * 0.05, s * 0.8, Math.PI * 1.55, Math.PI * 0.45, true); c.stroke(); }
];

// ---- the logo as a block-letter sticker: the NOOB wordmark with a thick outline, a 3D side shaded with pen hatching, and a face in the colour of the can. It is built reading left to right;
// the caller turns it to run up the can.
const solid = new Map();
function colored(logo, color) {   // the white logo in another colour
  const k = color; if (solid.has(k)) return solid.get(k);
  const c = document.createElement('canvas'); c.width = logo.naturalWidth; c.height = logo.naturalHeight; const g = c.getContext('2d');
  g.drawImage(logo, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  solid.set(k, c); return c;
}
function blockWord(logo, len, th, line, face, R) {
  const outline = Math.max(4, th * 0.028), depth = th * 0.15, pad = Math.ceil(outline + depth + 6);
  const w = Math.ceil(len + pad * 2), h = Math.ceil(th + pad * 2);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ink = colored(logo, line), flat = colored(logo, face);
  const ex = -depth * 0.78, ey = depth * 0.62;   // the side leans down and to the left
  const drawAt = (ctx, img, ox, oy) => ctx.drawImage(img, pad + ox, pad + oy, len, th);

  // the whole thing seen from the side: the front letters carried along the depth
  const E = mk(), e = E.getContext('2d');
  for (let t = 0; t <= depth; t += 1) drawAt(e, ink, (ex * t) / depth, (ey * t) / depth);

  const out = mk(), o = out.getContext('2d');
  // a) the thick outline round the whole shape (the shape drawn again all round)
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; o.drawImage(E, Math.cos(a) * outline, Math.sin(a) * outline); }
  // b) the side: the colour of the can with pen hatching in the line colour
  const S = mk(), s = S.getContext('2d');
  for (let t = 0; t <= depth; t += 1) drawAt(s, flat, (ex * t) / depth, (ey * t) / depth);
  s.globalCompositeOperation = 'source-atop'; s.strokeStyle = line; s.lineCap = 'round'; s.lineWidth = Math.max(1.8, th * 0.0115);
  const step = Math.max(4, th * 0.022);
  for (let k = -h; k < w; k += step) {
    s.beginPath(); let px = k, py = 0; s.moveTo(px, py);
    for (let seg = 1; seg <= 5; seg++) { px = k + (h * seg) / 5 + (R() - 0.5) * 2.4; py = (h * seg) / 5 + (R() - 0.5) * 2.4; s.lineTo(px, py); }
    s.stroke();
  }
  o.drawImage(S, 0, 0);
  // c) the front face: outlined again, then filled with the colour of the can
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; o.drawImage(ink, 0, 0, ink.width, ink.height, pad + Math.cos(a) * outline, pad + Math.sin(a) * outline, len, th); }
  o.drawImage(flat, 0, 0, flat.width, flat.height, pad, pad, len, th);
  return out;
}

export function paintCan(flavor, logo, width = 1536) {
  const W = width, H = Math.round(W / PRINT_ASPECT);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const d = flavor.design, R = rng(hash(flavor.id));

  // 1. one colour, all the way down (only the lightest touch of shade, so the paint does not look flat)
  c.fillStyle = d.color; c.fillRect(0, 0, W, H);

  // 2. the doodles, in the line colour, around the logo (the middle is left free for it); every second row is shifted half a step
  c.strokeStyle = d.ink; c.fillStyle = d.ink; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = H * 0.0068;
  const cols = 9, rows = 7, hole = W * 0.118;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = ((col + (row % 2 ? 0.5 : 0) + 0.25 + R() * 0.4) / cols) * W, y = ((row + 0.35 + R() * 0.35) / rows) * H, s = H * (0.034 + R() * 0.012);
    if (Math.abs(x - W / 2) < hole + s) continue;
    const k = (row * 5 + col * 3 + (row % 3) + Math.floor(R() * 3)) % ICONS.length, rot = (R() - 0.5) * 1.0;
    at(W, x, s * 2.2, (xx) => { c.save(); c.translate(xx, y); c.rotate(rot); ICONS[k](c, s); c.restore(); });
  }

  // 3. the ring at the top (the colour of the ring is in the design: black, or gold on the black can)
  const ringH = H * 0.05; c.fillStyle = d.ring; c.fillRect(0, 0, W, ringH);

  // 4. the block-letter logo, running up the front (it reads from the bottom to the top)
  const len = H * 0.8, th = len * (logo.naturalHeight / logo.naturalWidth);
  const word = blockWord(logo, len, th, d.word, d.color, R);
  c.save(); c.translate(W / 2, H * 0.56); c.rotate(-Math.PI / 2); c.drawImage(word, -word.width / 2, -word.height / 2); c.restore();

  // 5. the flavour name, small, above the logo
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = d.word;
  let fs = H * 0.03; c.font = `800 ${fs}px ${FONT}`; const name = flavor.name.toUpperCase(), maxW = W * 0.2;
  const nw = c.measureText(name).width; if (nw > maxW) { fs *= maxW / nw; c.font = `800 ${fs}px ${FONT}`; }
  c.fillText(name, W / 2, H * 0.095);
  return canvas;
}
