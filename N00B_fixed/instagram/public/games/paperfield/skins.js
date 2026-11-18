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

/** the pattern on one cell (x, y: the cell's place on the map, so the pattern lines up from cell to cell); s = cell size in pixels */
export function drawPattern(ctx, skin, cx, cy, s, sx, sy, alpha) {
  const pat = skin.pat;
  if (!pat) return;
  ctx.globalAlpha = alpha == null ? 0.55 : alpha;
  ctx.fillStyle = skin.sec;
  if (pat === 1) {          // diagonal stripes
    if (((cx + cy) & 3) < 2) ctx.fillRect(sx, sy, s, s);
  } else if (pat === 2) {   // checker
    if ((cx + cy) & 1) ctx.fillRect(sx, sy, s, s);
  } else if (pat === 3) {   // dots
    ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.2, 0, 6.2832); ctx.fill();
  } else if (pat === 4) {   // diamonds
    if (((cx + cy) & 1) === 0) {
      ctx.beginPath();
      ctx.moveTo(sx + s / 2, sy + s * 0.12); ctx.lineTo(sx + s * 0.88, sy + s / 2); ctx.lineTo(sx + s / 2, sy + s * 0.88); ctx.lineTo(sx + s * 0.12, sy + s / 2);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** the head of a player: a rounded block with a face that looks the way it moves. (x, y) = top left, s = size, dir 0..3 */
export function drawHead(ctx, skin, x, y, s, dir) {
  const r = s * 0.26;
  ctx.fillStyle = skin.dark;
  roundRect(ctx, x, y, s, s, r); ctx.fill();
  ctx.fillStyle = skin.base;
  roundRect(ctx, x + s * 0.09, y + s * 0.06, s * 0.82, s * 0.78, r * 0.8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  roundRect(ctx, x + s * 0.17, y + s * 0.12, s * 0.66, s * 0.2, r * 0.5); ctx.fill();
  // eyes
  const ox = [0, 0.07, 0, -0.07][dir] * s, oy = [-0.06, 0, 0.06, 0][dir] * s;
  const ey = y + s * 0.5 + oy * 0.5;
  for (const k of [-1, 1]) {
    const ex = x + s * 0.5 + k * s * 0.17 + ox * 0.5;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, s * 0.13, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#1b1b24'; ctx.beginPath(); ctx.arc(ex + ox * 0.55, ey + oy * 0.55, s * 0.065, 0, 6.2832); ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
