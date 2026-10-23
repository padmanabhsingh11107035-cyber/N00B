import { PRINT_ASPECT } from './dims.js';

// The printed artwork of the ten cans, drawn on a canvas that is wrapped round the can: its left and right edges meet at the BACK of the can, so the doodles are drawn so that they carry on over
// that seam. The middle of the canvas is the FRONT: the big NOOB logo runs up it, with the flavour name above. A can is kept plain: one colour, the thin line doodles of the NOOB app's own
// wallpaper (chat bubble, heart, star, moon, bolt, music notes, camera, headphones ...) in a quiet colour, and the logo. Nothing else.
const TAU = Math.PI * 2;
const FONT = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function mix(hex, to, t) { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); const m = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return `rgb(${m(16)},${m(8)},${m(0)})`; }
const at = (W, x, reach, fn) => { fn(x); if (x < reach) fn(x + W); if (x > W - reach) fn(x - W); };   // draws again on the other side of the seam when it reaches over an edge

// ---- the doodles of the app's wallpaper: thin outlines, each centred on (0, 0) and about 2s wide
const ICONS = [
  function chat(c, s) { c.beginPath(); c.roundRect(-s, -s * 0.8, s * 2, s * 1.4, s * 0.25); c.moveTo(-s * 0.55, s * 0.6); c.lineTo(-s * 0.55, s * 1.05); c.lineTo(-s * 0.1, s * 0.6); c.stroke(); },
  function star(c, s) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.45 : s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke(); },
  function heart(c, s) { c.beginPath(); c.moveTo(0, s * 0.85); c.bezierCurveTo(-s * 1.35, -s * 0.1, -s * 0.5, -s * 1.1, 0, -s * 0.35); c.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.35, -s * 0.1, 0, s * 0.85); c.stroke(); },
  function moon(c, s) { c.beginPath(); c.arc(0, 0, s, Math.PI * 0.35, Math.PI * 1.65, false); c.arc(s * 0.35, -s * 0.05, s * 0.8, Math.PI * 1.55, Math.PI * 0.45, true); c.stroke(); },
  function bolt(c, s) { c.beginPath(); c.moveTo(s * 0.25, -s); c.lineTo(-s * 0.5, s * 0.1); c.lineTo(-s * 0.05, s * 0.1); c.lineTo(-s * 0.3, s); c.lineTo(s * 0.5, -s * 0.2); c.lineTo(s * 0.05, -s * 0.2); c.closePath(); c.stroke(); },
  function notes(c, s) { c.beginPath(); c.ellipse(-s * 0.6, s * 0.65, s * 0.3, s * 0.22, -0.4, 0, TAU); c.moveTo(-s * 0.32, s * 0.6); c.lineTo(-s * 0.32, -s * 0.75); c.lineTo(s * 0.7, -s * 0.95); c.lineTo(s * 0.7, s * 0.45); c.moveTo(s * 0.98, s * 0.45); c.ellipse(s * 0.45, s * 0.5, s * 0.3, s * 0.22, -0.4, 0, TAU); c.moveTo(-s * 0.32, -s * 0.35); c.lineTo(s * 0.7, -s * 0.55); c.stroke(); },
  function note(c, s) { c.beginPath(); c.ellipse(-s * 0.3, s * 0.6, s * 0.34, s * 0.25, -0.4, 0, TAU); c.moveTo(s * 0.02, s * 0.5); c.lineTo(s * 0.02, -s * 0.9); c.quadraticCurveTo(s * 0.1, -s * 0.5, s * 0.7, -s * 0.35); c.stroke(); },
  function code(c, s) { c.beginPath(); c.moveTo(-s * 0.35, -s * 0.6); c.lineTo(-s * 0.95, 0); c.lineTo(-s * 0.35, s * 0.6); c.moveTo(s * 0.35, -s * 0.6); c.lineTo(s * 0.95, 0); c.lineTo(s * 0.35, s * 0.6); c.stroke(); },
  function plus(c, s) { c.beginPath(); c.moveTo(-s * 0.7, 0); c.lineTo(s * 0.7, 0); c.moveTo(0, -s * 0.7); c.lineTo(0, s * 0.7); c.stroke(); },
  function spiral(c, s) { c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const r = (t / 14) * s; const x = Math.cos(t) * r, y = Math.sin(t) * r; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); },
  function camera(c, s) { c.beginPath(); c.roundRect(-s, -s * 0.55, s * 2, s * 1.35, s * 0.2); c.moveTo(-s * 0.4, -s * 0.55); c.lineTo(-s * 0.25, -s * 0.95); c.lineTo(s * 0.25, -s * 0.95); c.lineTo(s * 0.4, -s * 0.55); c.moveTo(s * 0.45, s * 0.12); c.arc(0, s * 0.12, s * 0.45, 0, TAU); c.stroke(); },
  function headphones(c, s) { c.beginPath(); c.arc(0, s * 0.1, s * 0.85, Math.PI, 0); c.roundRect(-s * 1.0, s * 0.05, s * 0.4, s * 0.8, s * 0.12); c.roundRect(s * 0.6, s * 0.05, s * 0.4, s * 0.8, s * 0.12); c.stroke(); },
  function squiggle(c, s) { c.beginPath(); for (let i = 0; i <= 24; i++) { const x = -s + (i / 24) * s * 2, y = Math.sin((i / 24) * TAU * 1.5) * s * 0.35; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); },
  function caret(c, s) { c.beginPath(); c.moveTo(-s * 0.7, s * 0.3); c.lineTo(0, -s * 0.4); c.lineTo(s * 0.7, s * 0.3); c.stroke(); }
];

// the white logo, in the colour of this can
const tinted = new Map();
function tint(logo, color) {
  if (tinted.has(color)) return tinted.get(color);
  const c = document.createElement('canvas'); c.width = logo.naturalWidth; c.height = logo.naturalHeight; const g = c.getContext('2d');
  g.drawImage(logo, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  tinted.set(color, c); return c;
}

export function paintCan(flavor, logo, width = 1536) {
  const W = width, H = Math.round(W / PRINT_ASPECT);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const d = flavor.design;

  // 1. one colour, a little lighter at the top and darker at the bottom, as light falls on a real can
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, mix(d.color, '#ffffff', 0.1)); g.addColorStop(0.5, d.color); g.addColorStop(1, mix(d.color, '#000000', 0.24)); c.fillStyle = g; c.fillRect(0, 0, W, H);

  // 2. the app's doodles, in rows like its wallpaper (every second row shifted half a step), thin and quiet; the middle is left free for the logo
  c.strokeStyle = rgba(d.ink, 0.42); c.fillStyle = rgba(d.ink, 0.42); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = H * 0.0046;
  const cols = 12, rows = 9, hole = W * 0.125;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = ((col + (row % 2 ? 0.5 : 0)) / cols) * W + W / cols / 4, y = ((row + 0.5) / rows) * H, s = H * 0.03;
    if (Math.abs(x - W / 2) < hole + s) continue;
    const k = (row * 5 + col * 3 + (row % 3)) % ICONS.length, rot = (((row * 7 + col * 11) % 9) - 4) * 0.08;
    at(W, x, s * 2, (xx) => { c.save(); c.translate(xx, y); c.rotate(rot); ICONS[k](c, s); c.restore(); });
    // a few small dots in between, as on the wallpaper
    if ((row + col) % 3 === 0) at(W, x + W / cols / 2.6, s * 2, (xx) => { c.beginPath(); c.arc(xx, y - s * 1.2, H * 0.0034, 0, TAU); c.fill(); });
  }

  // 3. the logo, big, running up the front (it reads from the bottom to the top)
  const len = H * 0.74, th = len * (logo.naturalHeight / logo.naturalWidth);
  c.save(); c.translate(W / 2, H * 0.53); c.rotate(-Math.PI / 2); c.drawImage(tint(logo, d.word), -len / 2, -th / 2, len, th); c.restore();

  // 4. the flavour name, small, above the logo
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = d.word;
  let fs = H * 0.03; c.font = `700 ${fs}px ${FONT}`; const name = flavor.name.toUpperCase(), maxW = W * 0.2;
  const nw = c.measureText(name).width; if (nw > maxW) { fs *= maxW / nw; c.font = `700 ${fs}px ${FONT}`; }
  c.fillText(name, W / 2, H * 0.075);

  // 5. the print fades into the metal at the top and the bottom
  const f = c.createLinearGradient(0, 0, 0, H); f.addColorStop(0, 'rgba(0,0,0,0.22)'); f.addColorStop(0.05, 'rgba(0,0,0,0)'); f.addColorStop(0.95, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = f; c.fillRect(0, 0, W, H);
  return canvas;
}
