import { Asset, uid } from './types';

// Importing: every file is read on this device (object URLs and decoded pictures live in memory only); nothing is uploaded. Files are checked here: the kind from what the
// browser says the file is, then by really opening it, so a damaged file or one this browser cannot read gives a clear message instead of a blank clip.

export const LIMITS = { image: 80 * 1024 * 1024, video: 1536 * 1024 * 1024, audio: 200 * 1024 * 1024 };
const MAX_SIDE = 4096;

export class ImportError extends Error {}

const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba']);

export function kindOf(file: File): Asset['kind'] | null {
  const t = file.type.toLowerCase();
  const e = ext(file.name);
  if (t.startsWith('image/') || (!t && IMAGE_EXT.has(e))) return 'image';
  if (t.startsWith('video/') || (!t && VIDEO_EXT.has(e))) return 'video';
  if (t.startsWith('audio/') || (!t && AUDIO_EXT.has(e))) return 'audio';
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (AUDIO_EXT.has(e)) return 'audio';
  return null;
}

const cleanName = (n: string) => n.replace(/[\u0000-\u001f<>"\\/]/g, '').slice(0, 80) || 'media';

function makeThumb(source: CanvasImageSource, w: number, h: number): string {
  const c = document.createElement('canvas');
  const k = Math.min(1, 220 / Math.max(w, h, 1));
  c.width = Math.max(2, Math.round(w * k)); c.height = Math.max(2, Math.round(h * k));
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  try { ctx.drawImage(source, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72); } catch { return ''; }
}

async function importImage(file: File, url: string): Promise<Pick<Asset, 'width' | 'height' | 'thumb' | 'bitmap'>> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImportError(`"${cleanName(file.name)}" could not be opened. It may be damaged, or in a format this browser cannot show (HEIC photos from some phones, for example: save or export it as a JPEG first).`));
      img.src = url;
    });
  }
  let w = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
  let h = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;
  if (!w || !h) throw new ImportError(`"${cleanName(file.name)}" has no picture in it.`);
  // very large pictures are brought down to 4096 px on the long side, so many of them can be open at once
  if (Math.max(w, h) > MAX_SIDE) {
    const k = MAX_SIDE / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
    if ('close' in bitmap) (bitmap as ImageBitmap).close();
    bitmap = await createImageBitmap(c);
    w = c.width; h = c.height;
  }
  return { width: w, height: h, bitmap, thumb: makeThumb(bitmap, w, h) };
}

function importVideo(file: File, url: string): Promise<Pick<Asset, 'width' | 'height' | 'duration' | 'thumb'>> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.playsInline = true;
    const fail = () => reject(new ImportError(`"${cleanName(file.name)}" could not be opened as a video. It may be damaged, or use a format this browser cannot play. MP4 (H.264) and WebM work everywhere.`));
    const timer = window.setTimeout(fail, 20000);
    v.onerror = () => { window.clearTimeout(timer); fail(); };
    // a video recorded in the browser (screen recordings, some WebM files) does not say how long it is: jumping to a huge time makes the browser find out
    let measuring = false;
    v.onloadedmetadata = () => {
      if (v.duration === Infinity && v.videoWidth) { measuring = true; v.currentTime = 1e101; return; }
      if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) { window.clearTimeout(timer); fail(); return; }
      v.currentTime = Math.min(0.1, v.duration / 2);
    };
    v.onseeked = () => {
      if (measuring) {
        measuring = false;
        if (!Number.isFinite(v.duration) || v.duration <= 0) { window.clearTimeout(timer); fail(); return; }
        v.currentTime = Math.min(0.1, v.duration / 2);
        return;
      }
      window.clearTimeout(timer);
      const out = { width: v.videoWidth, height: v.videoHeight, duration: v.duration, thumb: makeThumb(v, v.videoWidth, v.videoHeight) };
      v.removeAttribute('src'); v.load();
      resolve(out);
    };
    v.src = url;
  });
}

function importAudio(file: File, url: string): Promise<Pick<Asset, 'duration' | 'peaks'>> {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    const fail = () => reject(new ImportError(`"${cleanName(file.name)}" could not be opened as sound. MP3, M4A, WAV and OGG work in most browsers.`));
    const timer = window.setTimeout(fail, 15000);
    a.onerror = () => { window.clearTimeout(timer); fail(); };
    a.onloadedmetadata = async () => {
      window.clearTimeout(timer);
      const duration = Number.isFinite(a.duration) ? a.duration : 0;
      if (duration <= 0) { fail(); return; }
      let peaks: number[] | undefined;
      if (file.size < 60 * 1024 * 1024) peaks = await waveform(file).catch(() => undefined);
      resolve({ duration, peaks });
    };
    a.src = url;
  });
}

/** The outline of the loudness (200 values, 0..1), for drawing a sound on the timeline. */
export async function waveform(file: Blob, buckets = 200): Promise<number[]> {
  const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new Ctx();
  try {
    const data = await ctx.decodeAudioData(await file.arrayBuffer());
    const ch = data.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / buckets));
    const out: number[] = [];
    let max = 0.0001;
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += Math.max(1, Math.floor(step / 40))) peak = Math.max(peak, Math.abs(ch[j]));
      out.push(peak); max = Math.max(max, peak);
    }
    return out.map((p) => p / max);
  } finally { void ctx.close(); }
}

export async function importFile(file: File): Promise<Asset> {
  const kind = kindOf(file);
  if (!kind) throw new ImportError(`"${cleanName(file.name)}" is not a picture, video or sound this editor can use.`);
  if (file.size === 0) throw new ImportError(`"${cleanName(file.name)}" is empty.`);
  if (file.size > LIMITS[kind]) throw new ImportError(`"${cleanName(file.name)}" is too big (${Math.round(file.size / 1048576)} MB). The limit is ${Math.round(LIMITS[kind] / 1048576)} MB for ${kind === 'image' ? 'pictures' : kind === 'video' ? 'videos' : 'sounds'}.`);
  const url = URL.createObjectURL(file);
  const base = { id: uid('a'), kind, name: cleanName(file.name), size: file.size, mime: file.type || `${kind}/*`, url };
  try {
    if (kind === 'image') return { ...base, duration: 0, ...(await importImage(file, url)) };
    if (kind === 'video') return { ...base, ...(await importVideo(file, url)) };
    const a = await importAudio(file, url);
    return { ...base, width: 0, height: 0, thumb: '', ...a };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export function releaseAsset(a: Asset): void {
  try { URL.revokeObjectURL(a.url); } catch { /* gone */ }
  if (a.bitmap && 'close' in a.bitmap) { try { (a.bitmap as ImageBitmap).close(); } catch { /* gone */ } }
}

export function fmtTime(sec: number, frames = false): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${(frames ? r.toFixed(2) : Math.floor(r).toString()).padStart(frames ? 5 : 2, '0')}`;
}
export const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
