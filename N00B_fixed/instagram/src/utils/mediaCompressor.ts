/**
 * Invisible, client-side media compressor for high-performance uploads.
 * Automatically compresses large camera photos and optimize media before server upload.
 */

export async function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82
): Promise<File> {
  // If file is already very small (< 100KB) or not an image, pass through
  if (!file.type.startsWith('image/') || file.size < 100 * 1024) {
    return file;
  }

  // If SVG or GIF, preserve vector / animation
  if (file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect-ratio preserving dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw image onto canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed JPEG or WebP blob
        const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type;
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // If compression didn't reduce size, use original
              resolve(file);
              return;
            }

            const cleanFileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const compressedFile = new File([blob], cleanFileName, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            resolve(compressedFile);
          },
          outputType,
          quality
        );
      };

      img.onerror = () => resolve(file);
    };

    reader.onerror = () => resolve(file);
  });
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
 * Optimizes video files for upload. Only Android gets real re-encoding
 * (see compressVideoOnAndroid for why) — everyone else's video is left
 * exactly as recorded.
 */
export async function compressVideo(file: File): Promise<File> {
  if (!file.type.startsWith('video/')) {
    return file;
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
export async function compressMedia(file: File): Promise<File> {
  try {
    if (file.type.startsWith('image/')) {
      return await compressImage(file);
    } else if (file.type.startsWith('video/')) {
      return await compressVideo(file);
    }
  } catch (err) {
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
