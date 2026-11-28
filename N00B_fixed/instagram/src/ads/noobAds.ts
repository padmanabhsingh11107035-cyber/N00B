// Google (AdMob) native ads in the Android app. The ads are drawn by the phone itself (android-overrides/NoobAdsPlugin.java), on top of the page, where an empty curved box (components/Ads/AdSlot.tsx)
// tells it to. The website and the iPhone app show no ads: AdMob works only inside an Android app.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** AdMob app id and the two ad units made on 2026-11-28 (account of noob.socials@gmail.com). The app id also sits in the manifest (the build workflow adds it). */
export const ADMOB_APP_ID = 'ca-app-pub-1264107433589197~4159216677';
export const AD_UNIT_HOME = 'ca-app-pub-1264107433589197/6154824629';
export const AD_UNIT_REELS = 'ca-app-pub-1264107433589197/2163608729';
/** Google's own test ad: safe to look at and to tap. The administrator always sees this one, never a real ad (tapping your own real ads is forbidden and can end the AdMob account). */
export const AD_UNIT_TEST_NATIVE = 'ca-app-pub-3940256099942544/2247696110';

export interface PlaceOptions {
  slot: string;
  unit: string;
  x: number; y: number; w: number; h: number;
  visTop: number; visBottom: number;
  visible: boolean;
  card: string; text: string; muted: string; accent: string;
}
interface NoobAdsNative {
  start(): Promise<{ ok: boolean }>;
  place(o: PlaceOptions): Promise<{ ok: boolean }>;
  remove(o: { slot: string }): Promise<void>;
  addListener(event: 'adState', cb: (e: { slot: string; state: 'loaded' | 'failed' }) => void): Promise<PluginListenerHandle>;
}
const Native = registerPlugin<NoobAdsNative>('NoobAds');

/** Europe (EEA / UK) needs a consent form before ads; there is none yet, so no ads are asked for there. */
const inEurope = (): boolean => { try { return /^(Europe|Atlantic\/(Reykjavik|Canary|Faroe|Madeira|Azores))/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch { return false; } };

/** Can this device show ads at all (the Android app, outside Europe)? */
export const adsAvailable = (): boolean => { try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && !inEurope(); } catch { return false; } };

let starting: Promise<boolean> | null = null;
/** Starts the ad SDK once; resolves false if this app has no ad plugin (an older app) or it could not start. Never throws. */
export function startAds(): Promise<boolean> {
  if (!adsAvailable()) return Promise.resolve(false);
  if (!starting) starting = Native.start().then((r) => !!r?.ok).catch(() => false);
  return starting;
}

export const placeAd = (o: PlaceOptions): Promise<boolean> => Native.place(o).then((r) => !!r?.ok).catch(() => false);
export const removeAd = (slot: string): void => { void Native.remove({ slot }).catch(() => undefined); };
/** Calls back when an ad of a box loaded or failed (no ad available). Returns a function that stops listening. */
export function onAdState(cb: (slot: string, state: 'loaded' | 'failed') => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void Native.addListener('adState', (e) => cb(e.slot, e.state)).then((h) => { if (stopped) void h.remove(); else handle = h; }).catch(() => undefined);
  return () => { stopped = true; if (handle) void handle.remove(); };
}
