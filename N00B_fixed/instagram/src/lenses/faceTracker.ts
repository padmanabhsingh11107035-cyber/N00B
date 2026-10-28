import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { faceFromLandmarks } from './faceMath.ts';
import type { FaceFrame } from './types.ts';

// The face finder: Google's MediaPipe Face Landmarker, run on the phone itself (nothing is sent anywhere). Its program and model are files of this website, kept in
// public/lenses/ (the program: mediapipe/vision_wasm_internal.*, the model: face_landmarker.task, both under the Apache 2.0 licence), and fetched only when the camera opens.

const BASE = '/lenses/mediapipe';
const MODEL = '/lenses/face_landmarker.task';

let pending: Promise<FaceLandmarker> | null = null;

async function create(cpuOnly: boolean): Promise<FaceLandmarker> {
  const { FaceLandmarker: Finder, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(BASE);
  const make = (delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> => Finder.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: true
  });
  if (cpuOnly) return make('CPU');
  try { return await make('GPU'); } catch { return make('CPU'); }   // the phone's graphics chip first, the processor when that does not work
}

/** Start loading the face finder (once). Rejects when this browser can not run it. */
export function loadTracker(): Promise<FaceLandmarker> {
  if (!pending) {
    pending = create(false);
    pending.catch(() => { pending = null; });
  }
  return pending;
}

/** The graphics chip started but then failed on every picture: start the finder again on the processor. */
export function reloadTrackerOnCpu(): Promise<FaceLandmarker> {
  const old = pending;
  pending = create(true);
  pending.catch(() => { pending = null; });
  void old?.then((f) => f.close()).catch(() => undefined);
  return pending;
}

function faces(res: FaceLandmarkerResult, aspect: number, mirror: boolean): FaceFrame[] {
  const out: FaceFrame[] = [];
  (res.faceLandmarks || []).forEach((L, i) => {
    const cats = res.faceBlendshapes?.[i]?.categories;
    let shapes: Record<string, number> | undefined;
    if (cats && cats.length) { shapes = {}; for (const k of cats) shapes[k.categoryName] = k.score; }
    const f = faceFromLandmarks(L, aspect, mirror, shapes);
    if (f) out.push(f);
  });
  return out;
}

let lastStamp = 0;
/** the faces in the camera's current picture (call it once per new picture) */
export function findInVideo(tracker: FaceLandmarker, video: HTMLVideoElement, mirror: boolean): FaceFrame[] {
  if (!video.videoWidth || !video.videoHeight) return [];
  lastStamp = Math.max(lastStamp + 1, Math.round(performance.now()));   // the finder wants times that only go up
  return faces(tracker.detectForVideo(video, lastStamp), video.videoWidth / video.videoHeight, mirror);
}

/** the faces in a still picture (a photo picked from the phone) */
export async function findInPhoto(tracker: FaceLandmarker, photo: HTMLCanvasElement): Promise<FaceFrame[]> {
  await tracker.setOptions({ runningMode: 'IMAGE' });
  try {
    return faces(tracker.detect(photo), photo.width / photo.height, false);
  } finally {
    await tracker.setOptions({ runningMode: 'VIDEO' });
  }
}
