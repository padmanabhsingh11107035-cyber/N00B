// The app's icon on the phone. Members of NOOB Pro may choose the Pro icon (Settings and activity > App icon); when the plan ends the normal icon comes back by itself, and while it keeps
// running (renewed) the chosen Pro icon stays. The choice is the person's, kept on this phone; whether the plan is running comes from the account (proTier).
// What can really change: the Android app (Google Play) switches the icon on the home screen (android/.../AppIconPlugin.java). A website or an installed web app (iPhone, Chrome) can not change
// its own icon: the browser and the phone decide that, so there the choice only shows inside the app.
import { Capacitor, registerPlugin } from '@capacitor/core';

export type AppIconName = 'default' | 'pro-black' | 'pro-white';
export const isProIcon = (n: AppIconName): boolean => n !== 'default';
const PREF_KEY = 'noob_app_icon_choice';
const APPLIED_KEY = 'noob_app_icon_applied';
const Native = registerPlugin<{ set: (o: { icon: AppIconName }) => Promise<void> }>('AppIcon');

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const getIconChoice = (): AppIconName => { const v = read(PREF_KEY); return v === 'pro-black' || v === 'pro-white' ? v : 'default'; };
export const setIconChoice = (c: AppIconName): void => write(PREF_KEY, c);
/** Can this device change the icon on its home screen (the Android app)? */
export const canChangeHomeIcon = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** What the icon must be right now: one of the two Pro icons only for a running NOOB Pro plan whose owner chose it. */
export const wantedIcon = (proTier: string | undefined | null, choice: AppIconName = getIconChoice()): AppIconName => (proTier ? choice : 'default');

/** Makes the home screen icon match; safe to call as often as needed (it only talks to the phone when something changed). */
export async function applyAppIcon(proTier: string | undefined | null): Promise<AppIconName> {
  const want = wantedIcon(proTier);
  if (!canChangeHomeIcon() || read(APPLIED_KEY) === want) return want;
  try { await Native.set({ icon: want }); write(APPLIED_KEY, want); } catch { /* an older app without the plugin: nothing to change */ }
  return want;
}
