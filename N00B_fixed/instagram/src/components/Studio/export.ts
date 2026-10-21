import { ASPECTS, Asset, Project } from './types';
import { renderFrame } from './render';
import { sharedGL } from './gl';
import { Player } from './player';

// Exporting: nothing leaves the device. A picture is drawn once at the chosen size and saved; a video is made by playing the timeline once (the same drawing as the preview, the
// same mixed sound) while the browser records it. So the export takes as long as the video, and the screen has to stay open.

export interface ImageOptions { format: 'jpeg' | 'png' | 'webp'; quality: number; scale: number }

export const IMAGE_FORMATS: Array<{ id: ImageOptions['format']; label: string; mime: string; ext: string }> = [
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' }
];

function canvasToBlob(c: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), mime, quality));
}

/** Which picture formats this browser can really write (WebP is not on every browser). */
export async function supportedImageFormats(): Promise<typeof IMAGE_FORMATS> {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const out: typeof IMAGE_FORMATS = [];
  for (const f of IMAGE_FORMATS) { const b = await canvasToBlob(c, f.mime, 0.9); if (b && b.type === f.mime) out.push(f); }
  return out;
}

export function imageSize(project: Project, scale: number): { w: number; h: number } {
  const s = ASPECTS[project.aspect];
  const k = Math.min(scale, 4096 / Math.max(s.w, s.h));
  return { w: Math.round(s.w * k), h: Math.round(s.h * k) };
}

/** The finished picture (or, for a video project, one frame at time t). Checked by reading it back. */
export async function exportImage(project: Project, assets: Map<string, Asset>, o: ImageOptions, videoFor: (id: string) => HTMLVideoElement | null = () => null, t = 0): Promise<Blob> {
  const { w, h } = imageSize(project, o.scale);
  const s = ASPECTS[project.aspect];
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device could not make the picture (no canvas).');
  renderFrame(ctx, { project, assets, videoFor, gl: sharedGL(), k: w / s.w }, t);
  const f = IMAGE_FORMATS.find((x) => x.id === o.format) || IMAGE_FORMATS[0];
  const blob = await canvasToBlob(canvas, f.mime, o.quality);
  if (!blob || blob.size === 0 || blob.type !== f.mime) throw new Error(`This browser cannot save ${f.label} pictures. Pick another format.`);
  // check it opens and has the size asked for
  const check = await createImageBitmap(blob);
  const ok = check.width === w && check.height === h;
  check.close();
  if (!ok) throw new Error('The saved picture did not come out the right size. Please try again.');
  canvas.width = 1; canvas.height = 1;
  return blob;
}

// ---------- video
export interface VideoFormat { id: string; label: string; mime: string; ext: string }
const VIDEO_TYPES: VideoFormat[] = [
  { id: 'mp4-h264', label: 'MP4 (H.264)', mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
  { id: 'mp4-h264b', label: 'MP4 (H.264)', mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
  { id: 'mp4', label: 'MP4', mime: 'video/mp4', ext: 'mp4' },
  { id: 'webm-vp9', label: 'WebM (VP9)', mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM (VP8)', mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { id: 'webm', label: 'WebM', mime: 'video/webm', ext: 'webm' }
];

/** The video formats this browser can really record (MP4 on Safari and recent Chrome, WebM elsewhere). Empty when it cannot record at all. */
export function supportedVideoFormats(): VideoFormat[] {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return [];
  const seen = new Set<string>();
  const out: VideoFormat[] = [];
  for (const f of VIDEO_TYPES) {
    if (!MediaRecorder.isTypeSupported(f.mime)) continue;
    const kind = f.ext;
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push(f);
  }
  return out;
}

export interface VideoOptions { format: VideoFormat; shortSide: number; fps: number; mbps: number; audio: boolean }

export function videoSize(project: Project, shortSide: number): { w: number; h: number; k: number } {
  const s = ASPECTS[project.aspect];
  const k = shortSide / Math.min(s.w, s.h);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(s.w * k), h: even(s.h * k), k };
}

export const estimateVideoBytes = (seconds: number, mbps: number, audio: boolean): number => Math.round(((mbps * 1e6 + (audio ? 128000 : 0)) / 8) * seconds);

export async function exportVideo(player: Player, o: VideoOptions, onProgress: (p: number) => void, signal: AbortSignal): Promise<Blob> {
  const project = player.project;
  const duration = player.duration;
  if (duration <= 0) throw new Error('There is nothing on the timeline to export.');
  const { w, h, k } = videoSize(project, o.shortSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device could not start the export (no canvas).');
  const gl = sharedGL();
  const draw = (t: number) => renderFrame(ctx, { project: player.project, assets: player.assets, videoFor: player.videoFor, gl, k }, t);
  const stream = canvas.captureStream(o.fps);
  if (o.audio && player.hasSound()) {
    const a = player.audioStream();
    a?.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  const rec = new MediaRecorder(stream, { mimeType: o.format.mime, videoBitsPerSecond: Math.round(o.mbps * 1e6), audioBitsPerSecond: 128000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  const savedFrame = player.onFrame;
  player.setMonitor(false);
  draw(0);
  player.onFrame = (t) => { draw(t); onProgress(Math.min(0.99, t / duration)); };
  rec.start(500);
  const run = player.runOnce();
  const onAbort = () => run.stop();
  signal.addEventListener('abort', onAbort);
  try {
    await run.finished;
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    draw(duration);
    await new Promise((r) => window.setTimeout(r, 400));
  } finally {
    signal.removeEventListener('abort', onAbort);
    player.onFrame = savedFrame;
    player.setMonitor(true);
    try { if (rec.state !== 'inactive') rec.stop(); } catch { /* stopped */ }
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    canvas.width = 1; canvas.height = 1;
  }
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const blob = new Blob(chunks, { type: o.format.mime.split(';')[0] });
  if (blob.size < 2048) throw new Error('The export came out empty. Please try again (keep this screen open while it runs).');
  // it must open as a video
  await new Promise<void>((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const done = (err?: Error) => { URL.revokeObjectURL(url); v.removeAttribute('src'); err ? reject(err) : resolve(); };
    v.onloadedmetadata = () => done();
    v.onerror = () => done(new Error('The exported video could not be opened again, so it was not kept. Please try again.'));
    window.setTimeout(() => done(new Error('The exported video could not be checked. Please try again.')), 15000);
    v.src = url;
  });
  onProgress(1);
  return blob;
}
