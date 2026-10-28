// Draws the stickers and the frames to PNG files so they can be looked at without the app (a design check, nothing more).
//   node scripts/booth/sheet.mjs <folder>            one sheet per pack (two moments of the loop for each sticker) + one sheet of the frames
//   node scripts/booth/sheet.mjs <folder> kd-umbrella   one sticker, four moments, large
// Needs the @napi-rs/canvas package that is already in node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const out = process.argv[2];
const only = process.argv[3];
if (!out) { console.error('Usage: node scripts/booth/sheet.mjs <folder> [sticker id]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const { PACKS, STICKERS, BUDDIES, stickersIn, stickerById } = await import('../../src/booth/catalog.ts');
const { drawSticker, renderScene } = await import('../../src/booth/scene.ts');
const { FRAMES, setCanvasFactory } = await import('../../src/booth/frames.ts');
setCanvasFactory((w, h) => createCanvas(w, h));
const logo = await loadImage(path.resolve('public/brand/noob-wordmark.png')).catch(() => null);

const backdrop = (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#5b7a9c'); g.addColorStop(0.5, '#8a6f9e'); g.addColorStop(1, '#b0806f');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
};
// a room: a wall and a floor, so a buddy's shadow can be judged
const room = (c, x, y, w, h) => {
  const g = c.createLinearGradient(x, y, x, y + h * 0.8); g.addColorStop(0, '#9db4c9'); g.addColorStop(1, '#d6c6b4');
  c.fillStyle = g; c.fillRect(x, y, w, h * 0.8);
  const f = c.createLinearGradient(x, y + h * 0.8, x, y + h); f.addColorStop(0, '#8a7768'); f.addColorStop(1, '#5d4e45');
  c.fillStyle = f; c.fillRect(x, y + h * 0.8, w, h * 0.2);
};
const save = (cv, name) => { fs.writeFileSync(path.join(out, name), cv.toBuffer('image/png')); console.log('wrote', name); };

if (only === 'opening') {
  const { drawOpening, OPENING_SECONDS } = await import('../../src/booth/opening.ts');
  const times = [0.3, 1.0, 1.8, 2.6, 3.3, 3.55, 3.8], W = 375, H = 812, cv = createCanvas(W * times.length, H), c = cv.getContext('2d');
  times.forEach((t, i) => { const f = createCanvas(W, H); drawOpening(f.getContext('2d'), W, H, t); c.drawImage(f, i * W, 0); });
  save(cv, 'opening.png');
  console.log('opening', OPENING_SECONDS, 'seconds, frames at', times.join(', '));
} else if (only === 'buddies') {
  const S = 300, cols = 4, rows = Math.ceil(BUDDIES.length / cols), times = [0.3, 1.3];
  const cv = createCanvas(S * cols, S * rows * 2);
  const c = cv.getContext('2d');
  BUDDIES.forEach((d, i) => {
    times.forEach((t, j) => {
      const cx = (i % cols) * S, cy = (Math.floor(i / cols) * 2 + j) * S;
      room(c, cx, cy, S, S);
      // feet on the floor line: the box is 200 units, the ground is at +93 of them
      const size = S * 0.86;
      drawSticker(c, d.id, cx + S / 2, cy + S * 0.9 - size * 0.465, size, 0, false, t);
    });
  });
  save(cv, 'buddies.png');
  console.log(BUDDIES.length, 'buddies');
} else if (only) {
  const d = stickerById(only);
  if (!d) { console.error('no sticker', only); process.exit(1); }
  const times = [0.1, 0.8, 1.5, 2.3], S = 360;
  const cv = createCanvas(S * 4, S);
  const c = cv.getContext('2d');
  if (d.buddy) times.forEach((t, i) => { room(c, S * i, 0, S, S); drawSticker(c, only, S * i + S / 2, S * 0.9 - S * 0.9 * 0.465, S * 0.9, 0, false, t); });
  else { backdrop(c, cv.width, cv.height); times.forEach((t, i) => drawSticker(c, only, S * i + S / 2, S / 2, S * 0.9, 0, false, t)); }
  save(cv, `${only}.png`);
} else {
  const S = 170, cols = 5;
  for (const pack of PACKS) {
    const list = stickersIn(pack.id);
    const rows = Math.ceil(list.length / cols);
    const cv = createCanvas(S * cols, S * 2 * rows);
    const c = cv.getContext('2d');
    backdrop(c, cv.width, cv.height);
    list.forEach((d, i) => {
      const cx = (i % cols) * S + S / 2, cy = Math.floor(i / cols) * S * 2 + S / 2;
      drawSticker(c, d.id, cx, cy, S * 0.86, 0, false, 0.45);
      drawSticker(c, d.id, cx, cy + S, S * 0.86, 0, false, 1.65);
    });
    save(cv, `pack-${pack.id}.png`);
  }
  const W = 540, H = 675, fcv = createCanvas(W * FRAMES.length, H);
  const fc = fcv.getContext('2d');
  FRAMES.forEach((f, i) => {
    const pcv = createCanvas(W, H), pc = pcv.getContext('2d');
    const photo = createCanvas(900, 900), p = photo.getContext('2d');
    const g = p.createLinearGradient(0, 0, 900, 900); g.addColorStop(0, '#2d6f9e'); g.addColorStop(0.55, '#e59d6a'); g.addColorStop(1, '#6a3d7a');
    p.fillStyle = g; p.fillRect(0, 0, 900, 900);
    p.fillStyle = 'rgba(255,255,255,.25)'; p.beginPath(); p.arc(450, 360, 170, 0, 6.3); p.fill(); p.fillRect(250, 540, 400, 400);
    const stickers = [
      { uid: 1, id: 'kd-saranghae', x: 0.28, y: 0.3, s: 0.32, r: -0.12, flip: false },
      { uid: 2, id: 'pp-lightstick', x: 0.78, y: 0.62, s: 0.3, r: 0.1, flip: false },
      { uid: 3, id: 'fl-sparkles', x: 0.55, y: 0.25, s: 0.4, r: 0, flip: false }
    ];
    renderScene(pc, { shape: '4:5', frame: f.id, photo: { img: photo, w: 900, h: 900 }, zoom: 1, panX: 0, panY: 0, stickers }, W, H, { t: 0.9, logo });
    fc.drawImage(pcv, i * W, 0);
  });
  save(fcv, 'frames.png');
  console.log(STICKERS.length, 'stickers in', PACKS.length, 'packs,', FRAMES.length, 'frames');
}
