// The colour of a song's cover, used to tint the Now Playing screen and the mini player (the whole screen takes the colour of the record). It is read from a tiny copy of the picture;
// if the browser does not let the page read the picture (a picture from another site), a colour is made from the song's name instead, so a song always has one.
const cache = new Map<string, CoverTint>();

/** a hue (0-360) and how colourful the cover is (0-1) */
export interface CoverTint { hue: number; sat: number }

const hueFromText = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
};

export function fallbackTint(seed: string): CoverTint { return { hue: hueFromText(seed || 'noob'), sat: 0.55 }; }

export function coverTint(url: string | undefined, seed: string): Promise<CoverTint> {
  return new Promise((resolve) => {
    if (!url) { resolve(fallbackTint(seed)); return; }
    const hit = cache.get(url);
    if (hit) { resolve(hit); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let x = 0, y = 0, w = 0, satSum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
          if (l < 0.08 || l > 0.95) continue;                  // almost black or white pixels say nothing about the colour
          const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
          let h = 0;
          if (max !== min) h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
          const a = (((h * 60) + 360) % 360) * Math.PI / 180, weight = s * s + 0.02;
          x += Math.cos(a) * weight; y += Math.sin(a) * weight; w += weight; satSum += s; n++;
        }
        if (!w || !n) throw new Error('grey picture');
        const tint = { hue: Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360), sat: Math.max(0.25, Math.min(0.9, satSum / n)) };
        cache.set(url, tint);
        resolve(tint);
      } catch {
        resolve(fallbackTint(seed));
      }
    };
    img.onerror = () => resolve(fallbackTint(seed));
    img.src = url;
  });
}

/** the colours of the Now Playing screen, top to bottom */
export function tintGradient(t: CoverTint): string {
  const s = Math.round(Math.min(0.85, t.sat + 0.1) * 100);
  return `linear-gradient(180deg, hsl(${t.hue} ${s}% 30%) 0%, hsl(${t.hue} ${Math.round(s * 0.9)}% 17%) 55%, #0b0b0d 100%)`;
}
