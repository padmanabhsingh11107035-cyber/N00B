/**
 * Invisible, client-side media compressor for high-performance uploads.
 * Automatically compresses large camera photos and optimize media before server upload.
 */
import type { OnUploadProgress } from './uploadProgress';
import { shouldSkipImage, planImage, useReencoded, isAnimatedWebp, pngMayHaveAlpha } from './uploadSavings';

let webpEncodeSupport: boolean | undefined;
/** Can this browser write WebP from a canvas? (Chrome, Edge, Firefox, Android yes; Safari mostly no, which then keeps JPEG.) */
export function canEncodeWebp(): boolean {
  if (webpEncodeSupport !== undefined) return webpEncodeSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpEncodeSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

const readHead = async (file: Blob, n = 32): Promise<Uint8Array> => {
  try { return new Uint8Array(await file.slice(0, n).arrayBuffer()); } catch { return new Uint8Array(0); }
};

const hasSeeThroughPixels = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  } catch {
    return true;   // cannot check: keep the original
  }
};

const toBlobAsync = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => { try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); } });

export async function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82
): Promise<File> {
  // HEIC/HEIF (the default iPhone camera format) can't be uploaded as-is - no browser except Safari can even display it, and the server
  // rejects it. It goes through the same canvas pipeline so it comes out as a JPEG everyone can view. If this browser can't decode HEIC,
  // the original is returned and the upload then says so clearly.
  // Left alone: not an image, SVG, GIF, animated WebP, tiny files. PNG/WebP with see-through pixels are left alone too (the canvas would flatten them).
  const head = file.type === 'image/webp' ? await readHead(file) : new Uint8Array(0);
  if (shouldSkipImage({ type: file.type, size: file.size, animated: isAnimatedWebp(head) })) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) return file;
    // The browser applies the photo's rotation (EXIF) when it draws, and reports the width/height as shown.
    const plan = planImage({ type: file.type, width: img.naturalWidth, height: img.naturalHeight, maxSide: Math.max(maxWidth, maxHeight), supportsWebp: canEncodeWebp() });
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, plan.width, plan.height);

    if (plan.needsAlphaCheck) {
      const headBytes = file.type === 'image/png' ? await readHead(file) : head;
      const maybe = file.type === 'image/png' ? pngMayHaveAlpha(headBytes) : true;
      if (maybe && hasSeeThroughPixels(ctx, plan.width, plan.height)) return file;
    }

    let outType: string = plan.outType;
    let blob = await toBlobAsync(canvas, outType, quality);
    if (blob && blob.type !== outType) {   // the browser quietly wrote something else (e.g. PNG): use JPEG
      outType = 'image/jpeg';
      blob = await toBlobAsync(canvas, outType, quality);
    }
    if (!blob || blob.type !== outType) return file;
    if (!useReencoded({ origSize: file.size, newSize: blob.size, scaled: plan.scaled, heic: plan.heic })) return file;

    const ext = outType === 'image/webp' ? '.webp' : '.jpg';
    return new File([blob], file.name.replace(/\.[^/.]+$/, '') + ext, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const isAndroid = () => /android/i.test(navigator.userAgent);

/**
 * Re-encodes a video to a lower resolution/bitrate entirely in the browser
 * by playing it, drawing each frame onto a canvas at a reduced size, and
 * recording that canvas (plus the original audio track) with MediaRecorder.
 *
 * The only output MediaRecorder can reliably produce across browsers is
 * WebM, which iPhone/Safari cannot play — so this only ever runs on
 * Android, where the browser and every other user's browser (Chrome-based)
 * can play WebM back fine. iOS uploads are left uncompressed rather than
 * risk producing a video no one on an iPhone can open.
 *
 * Any failure at any stage (unsupported API, decode error, timeout) falls
 * back to the original file untouched — this must never block a real
 * upload just because compression didn't work out.
 */
async function compressVideoOnAndroid(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  // Off-DOM <video>/<canvas> elements decode and render unreliably on real
  // mobile browsers (frames can arrive late, blank, or not at all) even
  // though it can look fine in a desktop test — captureStream() needs
  // these actually attached and composited, just kept invisible.
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
  document.body.appendChild(video);

  let canvas: HTMLCanvasElement | null = null;
  const cleanup = () => {
    URL.revokeObjectURL(objectUrl);
    video.remove();
    canvas?.remove();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read video metadata'));
      setTimeout(() => reject(new Error('Video metadata timed out')), 8000);
    });

    // Short clips are already small; long ones would take just as long to
    // re-encode in real time as they run, which isn't worth the wait.
    if (video.duration > 90 || !isFinite(video.duration)) {
      cleanup();
      return file;
    }

    const MAX_HEIGHT = 720;
    const scale = video.videoHeight > MAX_HEIGHT ? MAX_HEIGHT / video.videoHeight : 1;
    const width = Math.round(video.videoWidth * scale / 2) * 2;
    const height = Math.round(video.videoHeight * scale / 2) * 2;

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof (canvas as any).captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      cleanup();
      return file;
    }

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const sourceStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    const audioTracks = sourceStream?.getAudioTracks() || [];
    const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      cleanup();
      return file;
    }

    // ~1.6 Mbps at 720p keeps the picture visually clean while landing far
    // below typical phone-camera bitrates (often 8-20+ Mbps).
    const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: 1_600_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.onerror = () => reject(new Error('Recording failed'));
    });

    let rafId = 0;
    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, width, height);
      rafId = requestAnimationFrame(drawFrame);
    };

    recorder.start();
    video.currentTime = 0;
    await video.play();
    drawFrame();

    await new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error('Playback failed during compression'));
      // Safety net in case 'ended' never fires for any reason.
      setTimeout(resolve, (video.duration + 5) * 1000);
    });

    cancelAnimationFrame(rafId);
    recorder.stop();
    const blob = await recordingDone;
    cleanup();

    if (blob.size === 0 || blob.size >= file.size) {
      return file;
    }

    const cleanFileName = file.name.replace(/\.[^/.]+$/, '') + '.webm';
    return new File([blob], cleanFileName, { type: 'video/webm', lastModified: Date.now() });
  } catch (err) {
    console.warn('Video compression fallback (using original file):', err);
    cleanup();
    return file;
  }
}

/**
 * Makes a video small enough to upload (storage takes at most 50 MB per file; a 10-minute phone video is 1 GB or more).
 *
 * First choice, on Android (Chrome) and iPhone (Safari 16.4 and newer): the phone's own video chip re-encodes it as a smaller H.264 MP4 that plays everywhere,
 * with the sound copied as it is and the picture size chosen so it stays sharp (see videoTranscode.ts and videoPlan.ts). A video that is already small or light is
 * returned untouched. A video too long for one file throws VideoTooLongError, and a cancel throws AbortError - both are meant to reach the person.
 *
 * Anything else that goes wrong falls back to the original file (and the upload then says clearly if it is too big), never to a stuck screen.
 * An Android browser that cannot re-encode at all still has the older recording-based path below.
 */
export async function compressVideo(file: File, opts: { onProgress?: OnUploadProgress; signal?: AbortSignal; maxStep?: number } = {}): Promise<File> {
  if (!file.type.startsWith('video/')) {
    return file;
  }
  try {
    const t = await import('./videoTranscode');
    if (t.canTranscode()) {
      const res = await t.transcodeVideo(file, {
        signal: opts.signal,
        maxStep: opts.maxStep,
        onProgress: (fraction) => opts.onProgress?.({ stage: 'compressing', fraction })
      });
      return res.file;
    }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'VideoTooLongError' || name === 'AbortError') throw err;
    console.warn('Video re-encoding is not possible here, using the original file:', err);
  }
  if (file.size < 2 * 1024 * 1024 || !isAndroid()) {
    return file;
  }
  // Belt-and-suspenders on top of compressVideoOnAndroid's own internal
  // timeouts: whatever happens in there, a real reel upload must never be
  // stuck waiting on compression for more than two minutes.
  return Promise.race([
    compressVideoOnAndroid(file),
    new Promise<File>((resolve) => setTimeout(() => resolve(file), 120_000))
  ]);
}

/**
 * Universal media compressor that invisibly detects whether the file is an image or video
 * and compresses it accordingly.
 */
export async function compressMedia(file: File, opts?: { maxSide?: number; quality?: number; maxStep?: number; onProgress?: OnUploadProgress; signal?: AbortSignal }): Promise<File> {
  try {
    if (file.type.startsWith('image/')) {
      return await compressImage(file, opts?.maxSide ?? 1600, opts?.maxSide ?? 1600, opts?.quality ?? 0.82);
    } else if (file.type.startsWith('video/')) {
      return await compressVideo(file, { onProgress: opts?.onProgress, signal: opts?.signal, maxStep: opts?.maxStep });
    }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'VideoTooLongError' || name === 'AbortError') throw err;
    console.warn('Invisible media compression fallback:', err);
  }
  return file;
}

/**
 * Calculates audio duration automatically in mm:ss format.
 */
export function getAudioDuration(urlOrFile: string | File): Promise<string> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let src = '';
    if (typeof urlOrFile === 'string') {
      src = urlOrFile;
    } else {
      src = URL.createObjectURL(urlOrFile);
    }

    audio.src = src;
    audio.preload = 'metadata';

    const cleanUp = () => {
      if (typeof urlOrFile !== 'string') {
        try {
          URL.revokeObjectURL(src);
        } catch (e) {
          // ignore
        }
      }
    };

    audio.onloadedmetadata = () => {
      const totalSec = Math.round(audio.duration);
      if (isNaN(totalSec) || !isFinite(totalSec) || totalSec <= 0) {
        cleanUp();
        resolve('2:45');
        return;
      }
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      cleanUp();
      resolve(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    };

    audio.onerror = () => {
      cleanUp();
      resolve('2:45'); // safe fallback default
    };

    // Timeout safety
    setTimeout(() => {
      cleanUp();
      resolve('2:45');
    }, 3000);
  });
}
