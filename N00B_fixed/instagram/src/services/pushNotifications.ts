import { Capacitor } from '@capacitor/core';
import { registerPushToken } from './api';

// Phone notifications exist only in the native Android app (Capacitor's plugin has no meaningful web implementation) — this is a no-op everywhere else, so it is
// safe to call unconditionally from app startup.
//
// Firebase (google-services.json) must be inside the build for registration to work. Asking an OLDER build to register with Firebase
// closes the whole app by itself (it did, right after login), so builds below 3 never ask.
// Builds 3 to 280 were made with or without Firebase depending on the secret on the day; the ones WITHOUT it stopped the whole app right after login when they registered. Builds from 281 carry
// the PushGuard check (android-overrides/PushGuardPlugin.java) and register only when Firebase is really in the app; older builds never register.
const FIREBASE_FROM_BUILD = 281;
const OFF_KEY = 'noob.nativePushOff';   // the person switched phone notifications off in Install and Permissions

export type NativePushState = 'old-build' | 'on' | 'off' | 'blocked';

const isOff = (): boolean => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };
const setOff = (v: boolean): void => { try { if (v) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* the choice just is not remembered */ } };

async function buildOk(): Promise<boolean> {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  if (!(Number(info.build) >= FIREBASE_FROM_BUILD)) return false;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const guard = registerPlugin<{ hasFirebase: () => Promise<{ value: boolean }> }>('PushGuard');
    return (await guard.hasFirebase()).value === true;   // no Firebase in this build: never register (that stops the app)
  } catch {
    return false;
  }
}

let listening = false;
async function listen(): Promise<void> {
  if (listening) return;
  listening = true;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  // listeners first, so the address is never missed
  await PushNotifications.addListener('registration', (token) => {
    registerPushToken(token.value).catch((err) => console.error('Failed to register push token:', err));
  });
  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });
  // tapping a notification opens the page it is about (a chat message opens Chat, a call opens the ring screen)
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = String((action.notification?.data as Record<string, unknown> | undefined)?.url ?? '');
    if (url.startsWith('/') && !url.startsWith('//')) window.location.assign(url);
  });
}

// Is this phone getting notifications? (only meaningful in the Android app)
export async function nativePushState(): Promise<NativePushState> {
  try {
    if (!(await buildOk())) return 'old-build';
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'denied') return 'blocked';
    return perm.receive === 'granted' && !isOff() ? 'on' : 'off';
  } catch { return 'old-build'; }
}

// One line that says what this phone reports (shown under the switch in the Android app, so a problem can be read off the screen).
export async function nativePushDiag(): Promise<string> {
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    return `App ${info.version} (build ${info.build}) · phone permission: ${perm.receive} · switched off here: ${isOff() ? 'yes' : 'no'}`;
  } catch (e) {
    return 'Check failed: ' + String((e as Error)?.message || e).slice(0, 140);
  }
}

// Asks the phone's question when needed and registers this phone. Called from the Install and Permissions toggle.
export async function enableNativePush(): Promise<NativePushState> {
  try {
    if (!(await buildOk())) return 'old-build';
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return 'blocked';
    setOff(false);
    await listen();
    await PushNotifications.register();
    return 'on';
  } catch (err) {
    console.error('Could not turn phone notifications on:', err);
    return 'off';
  }
}

// Forgets this phone's address (Firebase then answers "no longer exists" and the server drops it) and stops asking at start-up.
export async function disableNativePush(): Promise<boolean> {
  try {
    setOff(true);
    if (await buildOk()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.unregister();
    }
    return true;
  } catch { return true; }
}

let started = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  try {
    if (!(await buildOk()) || isOff()) return;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    await listen();
    await PushNotifications.register();
  } catch (err) {
    console.error('Push notification init failed:', err);
  }
}
