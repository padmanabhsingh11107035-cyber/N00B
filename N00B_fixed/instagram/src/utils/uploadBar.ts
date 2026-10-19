// The numbers and words behind the full-screen upload page (components/Common/UploadProgressPage.tsx): one bar that fills from left to right across both steps
// (making a video smaller, then sending it), what the screen says in each step, and about how long is left. Dependency-free, so each rule is tested on its own.
import type { UploadProgress } from './uploadProgress';

/** The share of the bar that "making the video smaller" takes when there is such a step; sending takes the rest. */
export const COMPRESS_SHARE = 0.6;

/** 0..1 for the whole bar. Without a "making smaller" step (a photo, a small video) the bar is the upload alone. */
export function overallFraction(p: UploadProgress, sawCompress: boolean): number {
  const f = Math.max(0, Math.min(1, Number.isFinite(p.fraction) ? p.fraction : 0));
  if (!sawCompress && p.stage !== 'compressing') return f;
  if (p.stage === 'compressing') return f * COMPRESS_SHARE;
  return COMPRESS_SHARE + f * (1 - COMPRESS_SHARE);   // sending, or trying again (the bar never goes back: the page keeps the furthest point)
}

/** About how many seconds are left in the current step, once there is enough to go on; null before that. */
export function secondsLeft(stageFraction: number, stageElapsedSec: number): number | null {
  if (!(stageFraction >= 0.05) || !(stageElapsedSec >= 4) || stageFraction >= 1) return null;
  return Math.max(1, Math.round((stageElapsedSec * (1 - stageFraction)) / stageFraction));
}

export function leftText(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 10) return 'a few seconds left';
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} seconds left`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `about ${minutes} minutes left` : `about ${Math.round(seconds / 360) / 10} hours left`;
}

export interface UploadHeadline {
  title: string;
  sub: string;
  tone: 'normal' | 'retry';
  /** 1-based step now, and how many steps this upload has. */
  step: number;
  steps: number;
}

export function headline(p: UploadProgress, sawCompress: boolean): UploadHeadline {
  const steps = sawCompress ? 2 : 1;
  // the first moments, before anything has been made smaller or sent: the file is being looked at
  if (p.stage === 'uploading' && p.fraction <= 0 && !sawCompress) {
    return { title: 'Getting your video ready', sub: 'One moment...', tone: 'normal', step: 1, steps };
  }
  if (p.stage === 'retrying') {
    return { title: 'Connection problem', sub: `Trying again (${p.attempt} of ${p.of})${p.reason ? ` - ${p.reason}` : ''}. Please keep NOOB open.`, tone: 'retry', step: steps, steps };
  }
  if (p.stage === 'compressing') {
    return { title: 'Making your video smaller', sub: 'So it uploads quickly and fits. Your picture stays sharp.', tone: 'normal', step: 1, steps };
  }
  if (p.fraction >= 1) return { title: 'Finishing up', sub: 'Almost done...', tone: 'normal', step: steps, steps };
  return { title: 'Uploading your video', sub: 'Sending it to NOOB. Please keep this screen open.', tone: 'normal', step: steps, steps };
}
