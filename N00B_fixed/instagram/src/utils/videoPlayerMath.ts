// The small rules of the video player (components/Videos/VideoPlayer.tsx), kept apart so each can be tested on its own.

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A new position after a jump of `delta` seconds, never before the start or after the end. */
export const seekTo = (current: number, delta: number, duration: number) => clamp(current + delta, 0, Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, current + delta));

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const speedLabel = (r: number) => (r === 1 ? 'Normal' : `${r}x`);

/** Which third of the picture a tap landed in: the left and right thirds seek, the middle plays or pauses. */
export function tapZone(x: number, width: number): 'left' | 'middle' | 'right' {
  if (!(width > 0)) return 'middle';
  const f = x / width;
  return f < 1 / 3 ? 'left' : f > 2 / 3 ? 'right' : 'middle';
}

/** How far the video is loaded ahead of `time`, as a share of the whole length (0..1). */
export function bufferedShare(ranges: { length: number; start(i: number): number; end(i: number): number } | null | undefined, time: number, duration: number): number {
  if (!ranges || !(duration > 0)) return 0;
  for (let i = 0; i < ranges.length; i++) {
    if (time >= ranges.start(i) - 0.25 && time <= ranges.end(i) + 0.25) return clamp(ranges.end(i) / duration, 0, 1);
  }
  return 0;
}

/** The keys the player answers to (as on YouTube): what each one does. */
export type PlayerKey = 'toggle' | 'back5' | 'forward5' | 'back10' | 'forward10' | 'mute' | 'fullscreen' | 'volumeUp' | 'volumeDown' | 'start' | 'end' | null;
export function keyAction(key: string): PlayerKey {
  switch (key) {
    case ' ': case 'k': case 'K': return 'toggle';
    case 'ArrowLeft': return 'back5';
    case 'ArrowRight': return 'forward5';
    case 'j': case 'J': return 'back10';
    case 'l': case 'L': return 'forward10';
    case 'm': case 'M': return 'mute';
    case 'f': case 'F': return 'fullscreen';
    case 'ArrowUp': return 'volumeUp';
    case 'ArrowDown': return 'volumeDown';
    case 'Home': return 'start';
    case 'End': return 'end';
    default: return null;
  }
}

/** The "Up next" countdown: seconds left, or 0 when it is time to go. */
export const countdownLeft = (startedAt: number, now: number, total = 5) => Math.max(0, total - Math.floor((now - startedAt) / 1000));
