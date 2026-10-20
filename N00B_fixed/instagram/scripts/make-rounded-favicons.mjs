// Makes the browser-tab icons with rounded corners (transparent outside the curve) from the square NOOB logo.
// The phone's home-screen icon and the app's own icon stay square on purpose: phones round those themselves, and a transparent corner would show as black there.
// Usage: node scripts/make-rounded-favicons.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const SOURCE = 'public/noob-logo-circle.png';
const SIZES = [32, 48, 96, 192];
const RADIUS = 0.24;   // corner radius as a share of the side: a soft, clearly rounded square (like an app icon)
const SUPER = 4;       // samples per pixel side, for smooth edges

const src = PNG.sync.read(fs.readFileSync(SOURCE));

// 1 inside the rounded square, 0 outside, in between on the edge
function coverage(x, y, size, r) {
  // x, y in 0..size (continuous); distance to the rounded rectangle
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r ? 1 : 0;
}

function render(size) {
  const out = new PNG({ width: size, height: size });
  const r = RADIUS * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0, inside = 0;
      for (let sy = 0; sy < SUPER; sy++) {
        for (let sx = 0; sx < SUPER; sx++) {
          const fx = x + (sx + 0.5) / SUPER, fy = y + (sy + 0.5) / SUPER;
          const c = coverage(fx, fy, size, r);
          // the colour from the source at the same relative position
          const ux = Math.min(src.width - 1, Math.floor((fx / size) * src.width));
          const uy = Math.min(src.height - 1, Math.floor((fy / size) * src.height));
          const i = (uy * src.width + ux) * 4;
          rr += src.data[i] * c; gg += src.data[i + 1] * c; bb += src.data[i + 2] * c; aa += src.data[i + 3] * c; inside += c;
        }
      }
      const o = (y * size + x) * 4;
      const n = SUPER * SUPER;
      out.data[o] = inside ? Math.round(rr / inside) : 0;
      out.data[o + 1] = inside ? Math.round(gg / inside) : 0;
      out.data[o + 2] = inside ? Math.round(bb / inside) : 0;
      out.data[o + 3] = Math.round((aa / n));
    }
  }
  return PNG.sync.write(out);
}

for (const size of SIZES) {
  const file = `public/favicon-${size}.png`;
  fs.writeFileSync(file, render(size));
  console.log(`${file} (${size}x${size})`);
}
