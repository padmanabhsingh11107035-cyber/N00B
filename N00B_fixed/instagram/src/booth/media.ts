// Getting a photo into the Booth (from the gallery, or taken from the camera), and a finished picture (or a short moving video of it) out: the file, the name, the save and the share.
// Nothing here touches the network.
import { loadLogo, savePhoto, sharePhoto } from '../lenses/exportPhoto.ts';
import { LOOP } from './kit.ts';
import { newCanvas } from './frames.ts';
import { renderScene, shapeById } from './scene.ts';
import type { PhotoSrc, Scene } from './scene.ts';
import type { Logo } from './frames.ts';

export { loadLogo, savePhoto, sharePhoto };
export type { Logo };

export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
export const VIDEO_WIDTH = 720;
export const VIDEO_FPS = 30;

/** A photo from the camera or the gallery, made ready: turned the right way up and not larger than `maxSide` (a phone photo is huge; the Booth never needs more than this). */
export async function loadPhoto(file: File, maxSide = 2400): Promise<PhotoSrc> {
  if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name || '')) throw new Error('Please choose a picture (JPG, PNG or WebP).');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That picture is too big (the limit is 40 MB).');
  let src: ImageBitmap | HTMLImageElement | null = null, w = 0, h = 0, url = '';
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    try { src = await createImageBitmap(file); } catch { src = null; }
  }
  if (!src) {
    url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('That picture could not be opened.')); img.src = url; });
    src = img;
  }
  w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!w || !h) throw new Error('That picture could not be opened.');
  const k = Math.min(1, maxSide / Math.max(w, h));
  const cv = newCanvas(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
  (cv.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0, cv.width, cv.height);
  if (!(src instanceof HTMLImageElement)) src.close?.();
  if (url) URL.revokeObjectURL(url);
  return { img: cv, w: cv.width, h: cv.height };
}

/** The picture the camera shows right now, taken as a photo (not larger than `maxSide`). It is not mirrored: a scene that shows a selfie camera has `mirror` set. null = the camera has no picture yet. */
export function snapshot(video: HTMLVideoElement, maxSide = 2000): PhotoSrc | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;
  const k = Math.min(1, maxSide / Math.max(vw, vh));
  const cv = newCanvas(Math.max(2, Math.round(vw * k)), Math.max(2, Math.round(vh * k)));
  (cv.getContext('2d') as CanvasRenderingContext2D).drawImage(video, 0, 0, cv.width, cv.height);
  return { img: cv, w: cv.width, h: cv.height };
}

const two = (n: number): string => String(n).padStart(2, '0');
/** NOOB-buddy-20261029-143005.jpg */
export function fileName(ext: string, d = new Date()): string {
  return `NOOB-buddy-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.${ext}`;
}

/** The finished picture at full size (the frame and the NOOB wordmark are part of it). `t` is the moment of the loop to keep. */
export async function makePicture(sc: Scene, t: number, logo: Logo | null): Promise<File> {
  const sh = shapeById(sc.shape), cv = newCanvas(sh.w, sh.h);
  renderScene(cv.getContext('2d') as CanvasRenderingContext2D, sc, sh.w, sh.h, { t, logo });
  const blob = await new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/jpeg', 0.95));
  return new File([blob], fileName('jpg'), { type: 'image/jpeg' });
}

// ------------------------------------------------------------------ the moving version
const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function videoMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
/** can this browser record the moving version? (a few older phones can not: the button is then not shown) */
export function canRecord(): boolean {
  return typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!videoMime();
}

/** One full loop of the picture as a short video (about 3 seconds, silent). It starts again where it ends, so it plays as a loop. */
export async function makeVideo(sc: Scene, logo: Logo | null, onProgress?: (fraction: number) => void): Promise<File> {
  const mime = videoMime();
  if (!mime) throw new Error('This phone can not make a moving picture.');
  const sh = shapeById(sc.shape), W = VIDEO_WIDTH, H = Math.round((W * sh.h) / sh.w / 2) * 2;
  const cv = newCanvas(W, H);
  cv.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(cv);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  renderScene(c, sc, W, H, { t: 0, logo });
  try {
    const rec = new MediaRecorder(cv.captureStream(VIDEO_FPS), { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise<Blob>((resolve, reject) => {
      rec.onerror = () => reject(new Error('The moving picture could not be made.'));
      rec.onstop = () => resolve(new Blob(parts, { type: mime.split(';')[0] }));
    });
    rec.start(250);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const t = (performance.now() - t0) / 1000;
        renderScene(c, sc, W, H, { t: Math.min(t, LOOP - 0.001), logo });
        onProgress?.(Math.min(1, t / LOOP));
        if (t >= LOOP) resolve(); else requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop();
    const blob = await done;
    if (!blob.size) throw new Error('The moving picture came out empty. Please try again.');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    return new File([blob], fileName(ext), { type: blob.type });
  } finally {
    cv.remove();
  }
}
