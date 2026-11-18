// Paperfield's 100 skins: 20 colours x 5 patterns. A skin dresses a player's land, trail and head.
// skin number i  ->  colour i % 20, pattern floor(i / 20)  (so no two skins are the same)

const COLORS = [
  ['Crimson', '#e5304a'], ['Tangerine', '#ff7a1a'], ['Amber', '#ffb703'], ['Lime', '#9bd620'], ['Emerald', '#18b55a'],
  ['Mint', '#3fd8a4'], ['Teal', '#0f9aa5'], ['Cyan', '#19c3f0'], ['Sky', '#4a9bff'], ['Royal', '#2f58e8'],
  ['Indigo', '#5a3fd1'], ['Violet', '#8e4de0'], ['Orchid', '#c04fd6'], ['Magenta', '#e0299b'], ['Bubblegum', '#ff6fa8'],
  ['Rose', '#ff5a6e'], ['Cocoa', '#9a6040'], ['Slate', '#5d6b82'], ['Gold', '#e0b52c'], ['Coral', '#ff8470'],
];
export const PATTERNS = ['Solid', 'Stripes', 'Checker', 'Dots', 'Diamonds'];

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
/** mix a colour with white (t > 0) or black (t < 0) */
function shade(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const to = t >= 0 ? 255 : 0, k = Math.abs(t);
  return rgbToHex(r + (to - r) * k, g + (to - g) * k, b + (to - b) * k);
}

export const SKIN_LIST = [];
for (let i = 0; i < 100; i++) {
  const [cname, base] = COLORS[i % 20];
  const pat = Math.floor(i / 20);
  SKIN_LIST.push({
    id: i,
    name: pat === 0 ? cname : cname + ' ' + PATTERNS[pat],
    pat,
    base,                       // the land
    dark: shade(base, -0.28),   // the 3D edge and the head's rim
    light: shade(base, 0.42),   // the trail
    sec: shade(base, i % 2 ? 0.34 : -0.2),   // the pattern's second colour
  });
}

/** a small square picture of a skin's pattern (it covers 2 x 2 units of the field and repeats): used as a fill over the land of a player. null for a plain skin. */
const tiles = new Map();
export function patternTile(skin) {
  if (!skin.pat) return null;
  if (tiles.has(skin.id)) return tiles.get(skin.id);
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = skin.sec; g.globalAlpha = 0.5;
  const pat = skin.pat;
  if (pat === 1) {            // diagonal stripes
    g.save(); g.translate(n / 2, n / 2); g.rotate(-Math.PI / 4);
    for (let k = -3; k <= 3; k++) g.fillRect(-n, k * 22 - 5, n * 2, 10);
    g.restore();
  } else if (pat === 2) {     // checker
    g.fillRect(0, 0, n / 2, n / 2); g.fillRect(n / 2, n / 2, n / 2, n / 2);
  } else if (pat === 3) {     // dots (like seeds)
    for (const [x, y] of [[16, 16], [48, 48]]) { g.beginPath(); g.ellipse(x, y, 5, 8, 0.6, 0, 6.2832); g.fill(); }
  } else if (pat === 4) {     // diamonds
    for (const [x, y] of [[32, 32], [0, 0], [64, 0], [0, 64], [64, 64]]) { g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 18, y); g.lineTo(x, y + 18); g.lineTo(x - 18, y); g.closePath(); g.fill(); }
  }
  tiles.set(skin.id, c);
  return c;
}

/** the head of a player: a glossy ball with a face that looks the way it moves. (cx, cy) = centre, r = radius, ang = direction in radians */
export function drawHead(ctx, skin, cx, cy, r, ang) {
  ctx.fillStyle = skin.dark;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
  const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  gr.addColorStop(0, skin.light); gr.addColorStop(1, skin.base);
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.04, r * 0.88, 0, 6.2832); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.5, r * 0.28, r * 0.15, -0.5, 0, 6.2832); ctx.fill();
  // eyes look along the heading
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (const k of [-1, 1]) {
    const ex = cx + dx * r * 0.18 - dy * k * r * 0.3, ey = cy + dy * r * 0.18 + dx * k * r * 0.3;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.22, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#1b1b24'; ctx.beginPath(); ctx.arc(ex + dx * r * 0.09, ey + dy * r * 0.09, r * 0.11, 0, 6.2832); ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
