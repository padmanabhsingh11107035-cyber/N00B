import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Fix } from './geo.ts';
import type { Problem } from './locate.ts';

// NOOB Family Map in the Android app: the place keeps coming while the app is closed. A web page can not do that (a browser stops a page's location when the screen locks); the Android app can,
// with a "foreground service": Android keeps it alive and shows a notification for as long as it runs ("NOOB Family Map: sharing your location"). The service is the plugin
// @capacitor-community/background-geolocation (MIT); only its native Android part is used, so it is called by name and needs no JavaScript package.
interface BgLocation { latitude: number; longitude: number; accuracy: number | null; speed: number | null; bearing: number | null; time: number | null }
interface BgPlugin {
  addWatcher(options: { backgroundTitle: string; backgroundMessage: string; requestPermissions: boolean; stale: boolean; distanceFilter: number }, callback: (location?: BgLocation, error?: { code?: string; message?: string }) => void): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}
const Bg = registerPlugin<BgPlugin>('BackgroundGeolocation');

/** only the Android app (there is no iPhone app); a browser never */
export function backgroundSupported(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

/** follow the phone even when the app is closed; returns the way to stop (which also removes the notification) */
export async function watchInBackground(onFix: (f: Fix) => void, onProblem: (p: Problem) => void, askPermission: boolean): Promise<() => void> {
  const id = await Bg.addWatcher(
    { backgroundTitle: 'NOOB Family Map', backgroundMessage: 'Sharing your location with your rooms. Open NOOB to pause.', requestPermissions: askPermission, stale: false, distanceFilter: 8 },
    (l, e) => {
      if (e) { onProblem(e.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable'); return; }
      if (l) onFix({ lat: l.latitude, lng: l.longitude, accuracy: l.accuracy ?? null, heading: l.bearing ?? null, speed: l.speed ?? null, at: Date.now() });
    }
  );
  return () => { void Bg.removeWatcher({ id }).catch(() => undefined); };
}

/** the phone's own settings page of this app (where "Allow all the time" is) */
export const openPhoneSettings = (): Promise<void> => Bg.openSettings().catch(() => undefined);
