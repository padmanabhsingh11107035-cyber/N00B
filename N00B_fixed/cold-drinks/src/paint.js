import { PRINT_ASPECT } from './dims.js';

// The printed artwork of the ten cans, drawn on a canvas that is wrapped round the can: its left and right edges meet at the BACK of the can, so everything is drawn so that it carries on
// over that seam (a doodle near an edge is drawn again on the other side). The middle of the canvas is the FRONT: the huge NOOB logo runs up it, the flavour name is above it.
// Each can: a gradient colour, a quiet pattern under the doodles (flavor.design.deco), line-art doodles all over, metallic glitter, the logo, the little print.
const TAU = Math.PI * 2;
const FONT = '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif';

// a small seeded random generator: the same can is painted the same way every time
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const at = (W, x, reach, fn) => { fn(x); if (x < reach) fn(x + W); if (x > W - reach) fn(x - W); };   // draws again on the other side of the seam when it reaches over an edge

// ---- the doodles: simple hand-drawn looking line art, each centred on (0, 0) and about 2s wide
const DOODLES = [
  function star(c, s) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.42 : s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  function bolt(c, s) { c.beginPath(); c.moveTo(s * 0.2, -s); c.lineTo(-s * 0.5, s * 0.15); c.lineTo(-s * 0.05, s * 0.15); c.lineTo(-s * 0.25, s); c.lineTo(s * 0.5, -s * 0.2); c.lineTo(s * 0.05, -s * 0.2); c.closePath(); },
  function drop(c, s) { c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.9, -s * 0.1, s * 0.8, s, 0, s); c.bezierCurveTo(-s * 0.8, s, -s * 0.9, -s * 0.1, 0, -s); },
  function spiral(c, s) { c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const r = (t / 14) * s; const x = Math.cos(t) * r, y = Math.sin(t) * r; t ? c.lineTo(x, y) : c.moveTo(x, y); } },
  function smiley(c, s) { c.beginPath(); c.arc(0, 0, s, 0, TAU); c.moveTo(-s * 0.35, -s * 0.2); c.arc(-s * 0.35, -s * 0.2, s * 0.08, 0, TAU); c.moveTo(s * 0.35, -s * 0.2); c.arc(s * 0.35, -s * 0.2, s * 0.08, 0, TAU); c.moveTo(-s * 0.5, s * 0.15); c.quadraticCurveTo(0, s * 0.85, s * 0.5, s * 0.15); },
  function heart(c, s) { c.beginPath(); c.moveTo(0, s * 0.85); c.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.5, -s * 1.1, 0, -s * 0.35); c.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.3, -s * 0.1, 0, s * 0.85); },
  function eye(c, s) { c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * 1.1, s, 0); c.quadraticCurveTo(0, s * 1.1, -s, 0); c.moveTo(s * 0.3, 0); c.arc(0, 0, s * 0.3, 0, TAU); },
  function sparkle(c, s) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? s * 0.25 : s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  function cloud(c, s) { c.beginPath(); c.moveTo(-s, s * 0.5); c.arc(-s * 0.55, s * 0.05, s * 0.5, Math.PI * 0.75, Math.PI * 1.9); c.arc(s * 0.1, -s * 0.2, s * 0.6, Math.PI * 1.2, Math.PI * 1.95); c.arc(s * 0.62, s * 0.1, s * 0.42, Math.PI * 1.5, Math.PI * 0.55); c.lineTo(-s, s * 0.5); },
  function zig(c, s) { c.beginPath(); for (let i = 0; i < 6; i++) c.lineTo(-s + (i * 2 * s) / 5, i % 2 ? s * 0.4 : -s * 0.4); },
  function plus(c, s) { c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s); },
  function flower(c, s) { c.beginPath(); for (let i = 0; i < 5; i++) { const a = (i * TAU) / 5; c.moveTo(Math.cos(a) * s * 0.55 + s * 0.4, Math.sin(a) * s * 0.55); c.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.4, 0, TAU); } c.moveTo(s * 0.18, 0); c.arc(0, 0, s * 0.18, 0, TAU); },
  function planet(c, s) { c.beginPath(); c.arc(0, 0, s * 0.55, 0, TAU); c.moveTo(s, 0); c.ellipse(0, 0, s, s * 0.28, -0.45, 0, TAU); },
  function arrow(c, s) { c.beginPath(); c.moveTo(-s, s * 0.4); c.quadraticCurveTo(0, -s * 0.9, s, -s * 0.1); c.moveTo(s * 0.45, -s * 0.5); c.lineTo(s, -s * 0.1); c.lineTo(s * 0.5, s * 0.3); },
  function dots(c, s) { c.beginPath(); for (let i = 0; i < 7; i++) { const a = (i * TAU) / 7; c.moveTo(Math.cos(a) * s + s * 0.12, Math.sin(a) * s); c.arc(Math.cos(a) * s, Math.sin(a) * s, s * 0.12, 0, TAU); } c.moveTo(s * 0.22, 0); c.arc(0, 0, s * 0.22, 0, TAU); },
  function crown(c, s) { c.beginPath(); c.moveTo(-s, s * 0.6); c.lineTo(-s, -s * 0.4); c.lineTo(-s * 0.45, s * 0.1); c.lineTo(0, -s * 0.7); c.lineTo(s * 0.45, s * 0.1); c.lineTo(s, -s * 0.4); c.lineTo(s, s * 0.6); c.closePath(); }
];

// ---- patterns that lie under the doodles
const DECO = {
  none() {},
  halftone(c, W, H, d) {
    const cols = 72, step = W / cols; c.fillStyle = rgba(d.ink.length === 7 ? d.ink : '#000000', 0.16);
    for (let row = 0; row * step < H * 0.5; row++) { const y = H - row * step * 0.9, r = Math.max(0.5, step * 0.36 * (1 - row / (H * 0.5 / step))); for (let col = 0; col < cols; col++) { c.beginPath(); c.arc((col + (row % 2 ? 0.5 : 0)) * step, y, r, 0, TAU); c.fill(); } }
  },
  stripes(c, W, H, d) {
    const n = 22, step = W / n; c.fillStyle = rgba(d.ink, 0.1);
    for (let i = -n; i < 2 * n; i += 2) { c.beginPath(); c.moveTo(i * step, 0); c.lineTo((i + 1) * step, 0); c.lineTo((i + 1) * step + H * 0.35, H); c.lineTo(i * step + H * 0.35, H); c.closePath(); c.fill(); }
  },
  waves(c, W, H, d) {
    c.strokeStyle = rgba(d.ink, 0.16); c.lineWidth = H * 0.008;
    for (let k = 0; k < 14; k++) { c.beginPath(); for (let x = -10; x <= W + 10; x += 14) { const y = H * (0.04 + k * 0.07) + Math.sin((x / W) * TAU * 6 + k * 0.7) * H * 0.018; x === -10 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
  },
  glow(c, W, H, d) {
    const g = c.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, W * 0.42); g.addColorStop(0, rgba(d.accent, 0.55)); g.addColorStop(1, rgba(d.accent, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
};

// the white logo, in the colour of this can
const tinted = new Map();
function tint(logo, color) {
  const key = color; if (tinted.has(key)) return tinted.get(key);
  const c = document.createElement('canvas'); c.width = logo.naturalWidth; c.height = logo.naturalHeight; const g = c.getContext('2d');
  g.drawImage(logo, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c); return c;
}

export function paintCan(flavor, logo, width = 1536) {
  const W = width, H = Math.round(W / PRINT_ASPECT);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const d = flavor.design, R = rng(hash(flavor.id));

  // 1. the colour
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, d.base[0]); g.addColorStop(0.5, d.base[1]); g.addColorStop(1, d.base[2]); c.fillStyle = g; c.fillRect(0, 0, W, H);

  // 2. the pattern under the doodles
  DECO[d.deco](c, W, H, d);

  // 3. brushed metal and glitter
  if (d.finish === 'metal') { c.lineWidth = 1; for (let i = 0; i < 700; i++) { const x = R() * W; c.strokeStyle = `rgba(255,255,255,${0.02 + R() * 0.05})`; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (R() - 0.5) * 3, H); c.stroke(); } }
  const flakes = Math.round(d.flake * 4200);
  for (let i = 0; i < flakes; i++) { const x = R() * W, y = R() * H, r = 0.5 + R() * 1.5; c.fillStyle = R() < 0.7 ? `rgba(255,255,255,${0.1 + R() * 0.45})` : `rgba(0,0,0,${0.08 + R() * 0.15})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  // 4. the doodles, all over, but not where the logo is
  c.strokeStyle = d.ink; c.fillStyle = d.ink; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = H * 0.0062;
  const cols = 15, rows = 8, hole = W * 0.135;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = ((col + 0.15 + R() * 0.7) / cols) * W, y = ((row + 0.15 + R() * 0.7) / rows) * H, s = H * (0.032 + R() * 0.03), rot = (R() - 0.5) * 1.6, kind = Math.floor(R() * DOODLES.length), filled = R() < 0.22;
    if (Math.abs(x - W / 2) < hole + s) continue;
    at(W, x, s * 2, (xx) => { c.save(); c.translate(xx, y); c.rotate(rot); DOODLES[kind](c, s); filled ? c.fill() : c.stroke(); c.restore(); });
  }

  // 5. thin lines round the can, near the top and the bottom
  c.fillStyle = d.accent; c.fillRect(0, H * 0.028, W, H * 0.006); c.fillRect(0, H * 0.966, W, H * 0.006);

  // 6. the huge logo, running up the front (reads from the bottom to the top), with a shadow in the accent colour
  const len = H * 0.76, th = len * (logo.naturalHeight / logo.naturalWidth);
  c.save(); c.translate(W / 2, H * 0.505); c.rotate(-Math.PI / 2);
  c.drawImage(tint(logo, d.accent), -len / 2 + th * 0.05, -th / 2 + th * 0.07, len, th);
  c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = th * 0.08; c.shadowOffsetY = th * 0.02;
  c.drawImage(tint(logo, d.word), -len / 2, -th / 2, len, th);
  c.restore();

  // 7. the flavour name above the logo, the size below it
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = d.word;
  let fs = H * 0.034; c.font = `900 ${fs}px ${FONT}`; const name = flavor.name.toUpperCase(), maxW = W * 0.2;
  const nw = c.measureText(name).width; if (nw > maxW) { fs *= maxW / nw; c.font = `900 ${fs}px ${FONT}`; }
  c.fillText(name, W / 2, H * 0.082);
  c.font = `800 ${H * 0.0225}px ${FONT}`; c.fillText(`COLD DRINK • ${flavor.size.toUpperCase()}`, W / 2, H * 0.925);

  // 8. the back of the can (the seam of the canvas): a line of text and a bar code
  const back = (x) => {
    c.save(); c.translate(x, 0); c.fillStyle = d.word; c.textAlign = 'center'; c.font = `800 ${H * 0.022}px ${FONT}`;
    c.fillText('STAY NOOB. STAY COLD.', 0, H * 0.3);
    c.fillStyle = '#ffffff'; c.fillRect(-W * 0.035, H * 0.68, W * 0.07, H * 0.13);
    c.fillStyle = '#111'; const r2 = rng(hash(flavor.id + 'bar')); for (let b = 0; b < 26; b++) { const bx = -W * 0.032 + (b / 26) * W * 0.064; c.fillRect(bx, H * 0.695, Math.max(1, r2() * 3.4), H * 0.095); }
    c.restore();
  };
  back(0); back(W);

  // 9. the print fades into the metal at the top and the bottom
  const f = c.createLinearGradient(0, 0, 0, H); f.addColorStop(0, 'rgba(0,0,0,0.3)'); f.addColorStop(0.05, 'rgba(0,0,0,0)'); f.addColorStop(0.95, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,0.38)'); c.fillStyle = f; c.fillRect(0, 0, W, H);
  return canvas;
}
