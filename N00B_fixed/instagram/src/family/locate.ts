import type { Fix } from './geo';

// NOOB Family Map: asking the phone where it is. The browser shows its own permission question the first time; a website can only learn the place while its page is open.
export type Permission = 'granted' | 'prompt' | 'denied' | 'unknown';
export type Problem = 'denied' | 'unavailable' | 'timeout' | 'unsupported';
export type Ask = { ok: true; fix: Fix } | { ok: false; reason: Problem };

export const locationSupported = (): boolean => typeof navigator !== 'undefined' && 'geolocation' in navigator;

/** has the person already answered the browser's question? (not every browser can say: then 'unknown') */
export async function permissionState(): Promise<Permission> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return r.state === 'granted' || r.state === 'denied' || r.state === 'prompt' ? r.state : 'unknown';
  } catch { return 'unknown'; }
}

const finite = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);
export const fixOf = (p: GeolocationPosition): Fix => ({
  lat: p.coords.latitude, lng: p.coords.longitude, accuracy: finite(p.coords.accuracy), heading: finite(p.coords.heading), speed: finite(p.coords.speed), at: Date.now()
});
const problemOf = (e: GeolocationPositionError): Problem => (e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');

/** one reading; this is the call that makes the browser ask for permission */
export function askForLocation(): Promise<Ask> {
  if (!locationSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, fix: fixOf(p) }),
      (e) => resolve({ ok: false, reason: problemOf(e) }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  });
}

/** follow the phone; returns the function that stops following */
export function watchLocation(onFix: (f: Fix) => void, onProblem: (p: Problem) => void): () => void {
  if (!locationSupported()) { onProblem('unsupported'); return () => undefined; }
  const id = navigator.geolocation.watchPosition((p) => onFix(fixOf(p)), (e) => onProblem(problemOf(e)), { enableHighAccuracy: true, timeout: 30000, maximumAge: 3000 });
  return () => navigator.geolocation.clearWatch(id);
}
