// NOOB's own face check ("remember the account owner"). Everything happens on this phone:
//  * the camera picture is looked at by a small model that runs in the browser (files in public/face/, MIT licence) and is never sent anywhere;
//  * what is kept is 5 lists of 128 numbers (not a picture), in this phone's own storage, for the signed-in account only; "Forget my face" deletes them;
//  * to pass, the face must match the saved owner closely, three frames in a row, AND the person must blink (so a photo held up does not work).
// Honest limits: this is a software check in the browser, a convenience on top of the phone's own Face ID lock (utils/appLock.ts), not a replacement for it. A good
// 3D mask or somebody who can open developer tools on an unlocked, logged-in browser can get past it.
import { BlinkDetector, ENROLL_SAMPLES, MatchRun, eyesAspect, isDescriptor, isMatch, roundDescriptor, samplesAgree, type Descriptor, type Pt } from './faceMatch';

export interface FaceConfig {
  v: 1;
  descriptors: Descriptor[];
  unlock: boolean;     // may the face check open the lock screen
  money: boolean;      // ask for the face before sending NOOB Points
  createdAt: number;
}

const keyOf = (userId: string) => `noob_faceid_v1:${userId}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export const subscribeFace = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function loadFace(userId: string): FaceConfig | null {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    if (!raw) return null;
    const c = JSON.parse(raw) as FaceConfig;
    if (!c || c.v !== 1 || !Array.isArray(c.descriptors) || !c.descriptors.every(isDescriptor) || c.descriptors.length < 2) return null;
    return { ...c, unlock: c.unlock !== false, money: !!c.money };
  } catch { return null; }
}
function saveFace(userId: string, c: FaceConfig | null): void {
  try { if (c) localStorage.setItem(keyOf(userId), JSON.stringify(c)); else localStorage.removeItem(keyOf(userId)); } catch { /* storage blocked: nothing is kept */ }
  notify();
}
export const hasFace = (userId: string): boolean => !!loadFace(userId);
export function updateFace(userId: string, patch: Partial<Pick<FaceConfig, 'unlock' | 'money'>>): FaceConfig | null {
  const c = loadFace(userId); if (!c) return null;
  const next = { ...c, ...patch }; saveFace(userId, next); return next;
}
export function forgetFace(userId: string): void { saveFace(userId, null); }

// ---- the model (loaded the first time it is needed; about 7 MB, then kept by the browser)
type FaceApi = {
  nets: Record<string, { loadFromUri: (u: string) => Promise<void> }>;
  TinyFaceDetectorOptions: new (o: { inputSize: number; scoreThreshold: number }) => unknown;
  detectSingleFace: (input: HTMLVideoElement, opts: unknown) => { withFaceLandmarks: (tiny: boolean) => { withFaceDescriptor: () => Promise<{ descriptor: Float32Array; detection: { score: number }; landmarks: { positions: Pt[] } } | undefined> } };
};
let api: Promise<FaceApi> | null = null;
export function loadEngine(): Promise<FaceApi> {
  if (!api) {
    api = (async () => {
      const url = '/face/face-api.esm.js';   // a plain file of the site, not part of the app's own scripts
      const mod = (await import(/* @vite-ignore */ url)) as unknown as FaceApi;
      await Promise.all([mod.nets.tinyFaceDetector.loadFromUri('/face/'), mod.nets.faceLandmark68TinyNet.loadFromUri('/face/'), mod.nets.faceRecognitionNet.loadFromUri('/face/')]);
      return mod;
    })().catch((e) => { api = null; throw e; });
  }
  return api;
}

export interface Look { descriptor: Descriptor; ear: number; score: number }

/** One look at the camera: the face found (if any) as numbers, plus how open the eyes are. */
export async function lookAt(video: HTMLVideoElement): Promise<Look | null> {
  const f = await loadEngine();
  if (video.readyState < 2 || !video.videoWidth) return null;
  const r = await f.detectSingleFace(video, new f.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.55 })).withFaceLandmarks(true).withFaceDescriptor();
  if (!r || r.detection.score < 0.55) return null;
  return { descriptor: roundDescriptor(r.descriptor), ear: eyesAspect(r.landmarks.positions), score: r.detection.score };
}

export type Progress = { phase: 'loading' | 'looking' | 'blink' | 'hold' | 'done'; text: string; got?: number };

/** Saves the owner's face: 5 steady looks that agree with each other, then one blink. Returns the saved config or an error text. */
export async function enrollFace(userId: string, video: HTMLVideoElement, onProgress: (p: Progress) => void, signal: { stop: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    onProgress({ phase: 'loading', text: 'Getting ready…' });
    await loadEngine();
    const samples: Descriptor[] = [];
    const blink = new BlinkDetector();
    const until = Date.now() + 60000;
    let lastTake = 0;
    while (!signal.stop && Date.now() < until) {
      const look = await lookAt(video);
      if (!look) { onProgress({ phase: 'looking', text: 'Put your face in the circle, in good light.', got: samples.length }); await sleep(120); continue; }
      if (samples.length < ENROLL_SAMPLES) {
        onProgress({ phase: 'hold', text: 'Look straight at the camera and hold still.', got: samples.length });
        if (look.ear > 0.24 && Date.now() - lastTake > 500) { samples.push(look.descriptor); lastTake = Date.now(); }
      } else {
        if (!samplesAgree(samples)) return { ok: false, error: 'The pictures did not look like one steady face. Try again in better light, with only you in the picture.' };
        onProgress({ phase: 'blink', text: 'Now blink once.', got: samples.length });
        if (blink.push(look.ear)) { saveFace(userId, { v: 1, descriptors: samples, unlock: true, money: false, createdAt: Date.now() }); onProgress({ phase: 'done', text: 'Saved.', got: samples.length }); return { ok: true }; }
      }
      await sleep(90);
    }
    return { ok: false, error: signal.stop ? 'Cancelled.' : 'It took too long. Try again.' };
  } catch {
    return { ok: false, error: 'The camera or the face model could not start. Allow the camera for NOOB and check your connection, then try again.' };
  }
}

/** Is the person in front of the camera the saved owner? Needs 3 matching looks in a row and one blink. */
export async function verifyOwnerFace(userId: string, video: HTMLVideoElement, onProgress: (p: Progress) => void, signal: { stop: boolean }): Promise<boolean> {
  const cfg = loadFace(userId);
  if (!cfg) return false;
  try {
    onProgress({ phase: 'loading', text: 'Getting ready…' });
    await loadEngine();
    const run = new MatchRun();
    const blink = new BlinkDetector();
    let matched = false;
    const until = Date.now() + 25000;
    while (!signal.stop && Date.now() < until) {
      const look = await lookAt(video);
      if (!look) { onProgress({ phase: 'looking', text: 'Look at the camera.' }); await sleep(120); continue; }
      const ok = isMatch(look.descriptor, cfg.descriptors);
      if (run.push(ok)) matched = true;
      if (matched) {
        onProgress({ phase: 'blink', text: 'Blink once to finish.' });
        if (blink.push(look.ear)) { onProgress({ phase: 'done', text: 'Recognised.' }); return true; }
      } else onProgress({ phase: 'hold', text: ok ? 'Hold still…' : 'Not recognised yet. Face the camera.' });
      await sleep(90);
    }
    return false;
  } catch { return false; }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
