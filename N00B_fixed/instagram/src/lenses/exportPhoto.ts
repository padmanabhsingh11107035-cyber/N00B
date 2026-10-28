// Getting a finished picture out of the lens camera: the NOOB tag in the bottom right corner (burned into the picture itself, so it goes with the picture to every app it is
// shared to), then a file to save or to hand to the phone's share sheet. Nothing here touches the network.

/** the size of the logo's picture: public/brand/noob-wordmark.png (white letters on a see-through background) */
export const WORDMARK_RATIO = 640 / 207;

export interface TagBox { x: number; y: number; w: number; h: number; pad: number; logoW: number; logoH: number; margin: number }

/** Where the NOOB tag goes on a picture that is w x h: in the bottom right corner, with a size that follows the shorter side of the picture. */
export function tagBox(w: number, h: number): TagBox {
  const s = Math.min(w, h);
  const logoW = Math.round(s * 0.17), logoH = Math.round(logoW / WORDMARK_RATIO);
  const pad = Math.round(logoH * 0.34);
  const bw = logoW + pad * 3, bh = logoH + pad * 2;
  const margin = Math.round(s * 0.04);
  return { x: w - margin - bw, y: h - margin - bh, w: bw, h: bh, pad, logoW, logoH, margin };
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
/** the NOOB wordmark, fetched once (null when it can not be loaded: the tag is then drawn in plain letters) */
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/brand/noob-wordmark.png';
    });
  }
  return logoPromise;
}

/** Burn the NOOB tag into the picture (bottom right). */
export function drawTag(c: CanvasRenderingContext2D, w: number, h: number, logo: HTMLImageElement | null): void {
  const b = tagBox(w, h);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
  const r = b.h / 2;
  c.beginPath();
  c.moveTo(b.x + r, b.y);
  c.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  c.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  c.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  c.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  c.closePath();
  c.fillStyle = 'rgba(0,0,0,.52)';
  c.fill();
  c.lineWidth = Math.max(1, b.h * 0.025);
  c.strokeStyle = 'rgba(255,255,255,.22)';
  c.stroke();
  if (logo) {
    c.drawImage(logo, b.x + (b.w - b.logoW) / 2, b.y + (b.h - b.logoH) / 2, b.logoW, b.logoH);
  } else {
    c.fillStyle = '#fff';
    c.font = `900 ${Math.round(b.logoH * 0.9)}px system-ui, -apple-system, Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('NOOB', b.x + b.w / 2, b.y + b.h / 2 + b.logoH * 0.04);
  }
  c.restore();
}

export function canvasToBlob(cv: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made'))), 'image/jpeg', quality));
}

const two = (n: number): string => String(n).padStart(2, '0');
/** NOOB-devil-20261028-143005.jpg */
export function photoName(lensId: string, d = new Date()): string {
  return `NOOB-${lensId}-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.jpg`;
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/** Hand the picture to the phone's share sheet (Instagram, WhatsApp, Messages ...). "unsupported" = this browser can not share files: the caller offers Save instead. */
export async function sharePhoto(file: File): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file] });
    return 'shared';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** Save the picture as a file (the browser's download). */
export function savePhoto(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
