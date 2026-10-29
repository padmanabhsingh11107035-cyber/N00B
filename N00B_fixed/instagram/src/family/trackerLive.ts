import type { FamilyApi } from './api.ts';
import { backgroundSupported, watchInBackground } from './background.ts';
import { backgroundWanted } from './consent.ts';
import { watchLocation } from './locate.ts';
import { createTracker } from './tracker.ts';

// The tracker of the real app: the Android app follows the phone with its background service (also while the app is closed), everywhere else the page's own location is followed.
let askPermission = false;
export const tracker = createTracker({
  watch: async (onFix, onProblem) => {
    if (backgroundSupported() && backgroundWanted()) {
      try { return await watchInBackground(onFix, onProblem, askPermission); } catch { /* the service could not start: the page's own location below */ }
    }
    return watchLocation(onFix, onProblem);
  },
  now: () => Date.now(),
  every: (fn, ms) => { const id = window.setInterval(fn, ms); return () => window.clearInterval(id); }
});

/** `prompt`: the person is looking at Family Map, so the phone may ask for the permission now; the automatic start when NOOB opens never asks */
export function startTracker(api: FamilyApi, prompt = false): Promise<void> { askPermission = prompt; return tracker.start(api); }
export function restartTracker(api: FamilyApi, prompt = false): Promise<void> { tracker.stop(); return startTracker(api, prompt); }
