// The camera of the Buddy Booth: ask for it, keep it, let it go. The pictures never leave the phone (nothing here touches the network).
export type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'nocam' | 'insecure' | 'failed';
export type Facing = 'environment' | 'user';

/** what went wrong, from the browser's error (so the person is told what to do) */
export function cameraProblem(e: unknown): CamState {
  const n = (e as { name?: string } | null)?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'nocam';
  return 'failed';
}

/** can this page use the camera at all? (it needs https and a browser that has one) */
export function cameraSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

/** the sizes to ask for: tall on a phone held upright, wide on a computer */
export function cameraSize(portrait: boolean): { width: number; height: number } {
  return portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

export function openStream(facing: Facing): Promise<MediaStream> {
  const sz = cameraSize(window.innerHeight > window.innerWidth);
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: sz.width }, height: { ideal: sz.height } } });
}

export function stopStream(s: MediaStream | null | undefined): void {
  s?.getTracks().forEach((t) => t.stop());
}

/** how many cameras the device has (the switch button is only shown when there is more than one) */
export async function countCameras(): Promise<number> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch { return 1; }
}

/** keep the screen on while the camera is open (best effort: not every browser can). Returns the function that lets it go. */
export function keepAwake(): () => void {
  type Lock = { release: () => Promise<void> };
  let lock: Lock | null = null, live = true;
  const ask = (): void => {
    const wl = (navigator as unknown as { wakeLock?: { request: (kind: 'screen') => Promise<Lock> } }).wakeLock;
    if (!wl || document.visibilityState !== 'visible') return;
    wl.request('screen').then((l) => { if (live) lock = l; else void l.release().catch(() => undefined); }).catch(() => undefined);
  };
  ask();
  document.addEventListener('visibilitychange', ask);
  return () => { live = false; document.removeEventListener('visibilitychange', ask); void lock?.release().catch(() => undefined); };
}
