import { describeSeconds } from './videoPlan';

// What an upload tells the screen while it works: making a video smaller on the phone, then sending it, and trying again if the connection drops.
export interface UploadProgress {
  stage: 'compressing' | 'uploading' | 'retrying';
  /** 0..1 within the stage */
  fraction: number;
  /** retrying: the attempt that is about to start, out of how many */
  attempt?: number;
  of?: number;
  reason?: string;
}
export type OnUploadProgress = (p: UploadProgress) => void;

export interface UploadOptions {
  onProgress?: OnUploadProgress;
  signal?: AbortSignal;
  /** The file is already the version to upload (a lower-quality copy): do not make it smaller again. */
  skipCompress?: boolean;
}

/** The line to show: "Making the video smaller... 42%", "Uploading... 63%", "The connection dropped - trying again (2 of 4)..." */
export function describeProgress(p: UploadProgress): string {
  const pct = `${Math.max(0, Math.min(100, Math.round(p.fraction * 100)))}%`;
  if (p.stage === 'compressing') return `Making the video smaller... ${pct}`;
  if (p.stage === 'retrying') return `Connection problem (${p.reason || 'no answer'}) - trying again (${p.attempt} of ${p.of})...`;
  return `Uploading... ${pct}`;
}

/** The sentence to show when an upload did not finish: a cancel, a video too long for one file, or storage's own reason (already written for a person). */
export function explainUploadError(err: unknown): string {
  const e = err as { name?: string; message?: string; durationSec?: number; maxSeconds?: number } | null;
  if (e?.name === 'AbortError') return 'Upload cancelled.';
  if (e?.name === 'VideoTooLongError' && e.durationSec && e.maxSeconds) {
    return `This video is ${describeSeconds(e.durationSec)} long. About ${describeSeconds(e.maxSeconds)} is the most that fits in one upload right now - please trim it or upload it in parts.`;
  }
  return e?.message || 'Upload failed. Please try again.';
}
