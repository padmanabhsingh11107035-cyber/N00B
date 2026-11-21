// Makes the pictures of the stickers that are drawn on the spot (a photo with round corners, a polaroid, a photo strip, the time, the temperature, "Add yours"): each one is a PNG file
// with a see-through background, ready to be uploaded like any other sticker picture.
const load = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be read.')); };
  img.src = url;
});
const toPng = (c: HTMLCanvasElement, name: string): Promise<File> => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('The sticker could not be made.'))), 'image/png'));
const cover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};
const round = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

/** the picture itself, with round corners */
export async function photoSticker(file: File): Promise<File> {
  const img = await load(file);
  const w = 720, h = Math.round((720 * img.height) / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = Math.min(h, 1280);
  const ctx = c.getContext('2d')!;
  round(ctx, 0, 0, c.width, c.height, 36); ctx.clip();
  cover(ctx, img, 0, 0, c.width, c.height);
  return toPng(c, 'photo-sticker.png');
}

/** the picture in a white photo frame (a polaroid) */
export async function polaroidSticker(file: File): Promise<File> {
  const img = await load(file);
  const c = document.createElement('canvas'); c.width = 640; c.height = 760;
  const ctx = c.getContext('2d')!;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; round(ctx, 22, 14, 596, 724, 10); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); round(ctx, 50, 42, 540, 540, 4); ctx.clip(); cover(ctx, img, 50, 42, 540, 540); ctx.restore();
  return toPng(c, 'polaroid-sticker.png');
}

/** up to four pictures one under the other, on a white strip */
export async function photostripSticker(files: File[]): Promise<File> {
  const imgs = await Promise.all(files.slice(0, 4).map(load));
  const cell = 420, gap = 18, pad = 28;
  const c = document.createElement('canvas'); c.width = cell + pad * 2; c.height = pad * 2 + imgs.length * cell + (imgs.length - 1) * gap + 60;
  const ctx = c.getContext('2d')!;
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#fff'; round(ctx, 10, 6, c.width - 20, c.height - 16, 12); ctx.fill();
  ctx.shadowColor = 'transparent';
  imgs.forEach((img, i) => { const y = pad + i * (cell + gap); ctx.save(); round(ctx, pad, y, cell, cell, 4); ctx.clip(); cover(ctx, img, pad, y, cell, cell); ctx.restore(); });
  return toPng(c, 'photostrip-sticker.png');
}

/** the time now, on dark flip-clock tiles */
export function timeSticker(now = new Date()): Promise<File> {
  let h = now.getHours(); const m = now.getMinutes(); const pm = h >= 12; h = h % 12 || 12;
  const digits = [String(h).padStart(2, '0'), String(m).padStart(2, '0')];
  const c = document.createElement('canvas'); c.width = 560; c.height = 260;
  const ctx = c.getContext('2d')!;
  const tile = (x: number, d: string) => {
    ctx.fillStyle = '#2b2b2e'; round(ctx, x, 30, 96, 170, 12); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(x, 114, 96, 3);
    ctx.fillStyle = '#fff'; ctx.font = '700 120px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d, x + 48, 118);
  };
  tile(20, digits[0][0]); tile(124, digits[0][1]); tile(300, digits[1][0]); tile(404, digits[1][1]);
  ctx.fillStyle = '#fff'; ctx.font = '700 22px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(pm ? 'PM' : 'AM', 24, 232);
  ctx.fillStyle = '#fff'; ctx.fillRect(244, 84, 12, 12); ctx.fillRect(244, 136, 12, 12);
  return toPng(c, 'time-sticker.png');
}

/** the temperature in big white letters */
export function temperatureSticker(celsius: number): Promise<File> {
  const text = `${Math.round(celsius)}°C`;
  const c = document.createElement('canvas'); c.width = 520; c.height = 220;
  const ctx = c.getContext('2d')!;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fff'; ctx.font = '600 150px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 260, 112);
  return toPng(c, 'temperature-sticker.png');
}

/** a white pill with a coloured word, like "Add yours" */
export function pillSticker(text: string, colour: string): Promise<File> {
  const c = document.createElement('canvas'); c.width = 640; c.height = 170;
  const ctx = c.getContext('2d')!;
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#fff'; round(ctx, 20, 20, 600, 120, 38); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colour; round(ctx, 52, 48, 64, 64, 16); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 44px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 84, 82);
  ctx.fillStyle = '#111'; ctx.font = '700 52px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(text, 138, 84);
  return toPng(c, 'pill-sticker.png');
}

/** the temperature where the person is now (asks for the place; free weather service, nothing is sent but the place) */
export function currentTemperature(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This phone cannot tell where you are.')); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude.toFixed(2)}&longitude=${pos.coords.longitude.toFixed(2)}&current=temperature_2m`);
        const j = await r.json();
        const t = Number(j?.current?.temperature_2m);
        if (Number.isFinite(t)) resolve(t); else reject(new Error('The temperature could not be read.'));
      } catch { reject(new Error('The temperature could not be read. Check your connection.')); }
    }, () => reject(new Error('Allow the place so we can read the temperature around you.')), { timeout: 10000, maximumAge: 600000 });
  });
}
