import type { FamilyApi } from './api.ts';
import { backgroundSupported, watchInBackground } from './background.ts';
import { backgroundWanted } from './consent.ts';
import { createRecorder, type DayRecorder } from './dayRecorder.ts';
import { watchLocation } from './locate.ts';
import { localZone } from './timeline.ts';
import { createTracker } from './tracker.ts';

// The tracker of the real app: the Android app follows the phone with its background service (also while the app is closed), everywhere else the page's own location is followed.
// The day report is made from the same places (dayRecorder.ts): it listens to every place that is sent, and keeps today's stays and trips on the phone until 00:00.
let askPermission = false;
let native = false; // the background service of the Android app is following the phone
let recorder: DayRecorder | null = null;

export const tracker = createTracker({
  watch: async (onFix, onProblem) => {
    if (backgroundSupported() && backgroundWanted()) {
      try {
        const stop = await watchInBackground(onFix, onProblem, askPermission);
        native = true;
        return () => { native = false; stop(); };
      } catch { /* the service could not start: the page's own location below */ }
    }
    native = false;
    return watchLocation(onFix, onProblem);
  },
  now: () => Date.now(),
  every: (fn, ms) => { const id = window.setInterval(fn, ms); return () => window.clearInterval(id); },
  onSample: (f) => recorder?.add({ lat: f.lat, lng: f.lng, at: f.at, accuracy: f.accuracy, speed: f.speed }),
  onTick: () => { void recorder?.tick(); }
});

// today's report on the phone: one note per person, replaced as the day goes on, erased at 00:00 and when the report is switched off
const storeFor = (uid: string) => {
  const key = `noob_family_day_v1_${uid}`;
  return {
    read: (): string | null => { try { return localStorage.getItem(key); } catch { return null; } },
    write: (v: string): void => { localStorage.setItem(key, v); },
    erase: (): void => { try { localStorage.removeItem(key); } catch { /* nothing to erase */ } }
  };
};

async function ensureRecorder(api: FamilyApi): Promise<void> {
  if (recorder || api.mode !== 'live') return;
  const uid = await api.userId();
  if (!uid || recorder) return;
  const rec = createRecorder({
    now: () => Date.now(), zone: localZone, store: storeFor(uid), presence: () => native,
    rooms: () => api.reportRooms(), push: (room, day, tz, items) => api.pushDay(room, day, tz, items)
  });
  recorder = rec;
  window.addEventListener('pagehide', () => rec.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) rec.save(); });
  void rec.refresh();
}

/** `prompt`: the person is looking at Family Map, so the phone may ask for the permission now; the automatic start when NOOB opens never asks */
export async function startTracker(api: FamilyApi, prompt = false): Promise<void> { askPermission = prompt; await ensureRecorder(api); return tracker.start(api); }
export function restartTracker(api: FamilyApi, prompt = false): Promise<void> { tracker.stop(); return startTracker(api, prompt); }
/** the day report was switched on or off: ask which rooms get it right now */
export const refreshReport = (): void => { void recorder?.refresh(); };
/** a person logs out: nothing of their day report stays on the phone */
export function forgetReport(): void { recorder?.clear(); recorder = null; }
