// How long a video is, read from the file on the phone before anything is uploaded (a throwaway <video> reads just its header).
// The limits live here so the creators and their tests agree: a reel is at most 70 seconds, a video for the Videos page at most 5 hours.
export const REEL_MAX_SECONDS = 70;
export const LONG_VIDEO_MAX_SECONDS = 5 * 60 * 60;

/** Seconds, or NaN when the file's length can not be read (some recordings do not carry it: they are let through). */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const done = (n: number) => { URL.revokeObjectURL(url); resolve(n); };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : NaN);
    video.onerror = () => done(NaN);
    window.setTimeout(() => done(NaN), 15000);   // a file that never answers is not held up for ever
    video.src = url;
  });
}

/** "70 seconds", "1 hour 5 minutes" ... for messages */
export function describeLength(seconds: number): string {
  if (seconds < 120) return `${Math.ceil(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minutes` : ''}`;
}
