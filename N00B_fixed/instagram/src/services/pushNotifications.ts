import { Capacitor } from '@capacitor/core';
import { registerPushToken } from './api';

// Phone notifications exist only in the native Android app (Capacitor's plugin has no meaningful web implementation) — this is a no-op everywhere else, so it is
// safe to call unconditionally from app startup.
//
// Android app version 3 (version code 3) is the first build that has Firebase set up (google-services.json). Asking an OLDER build to register with Firebase
// closes the whole app by itself (it did, right after login), so builds below 3 never ask.
const FIREBASE_FROM_BUILD = 3;
const OFF_KEY = 'noob.nativePushOff';   // the person switched phone notifications off in Install and Permissions

export type NativePushState = 'old-build' | 'on' | 'off' | 'blocked';

const isOff = (): boolean => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };
const setOff = (v: boolean): void => { try { if (v) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* the choice just is not remembered */ } };

async function buildOk(): Promise<boolean> {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return Number(info.build) >= FIREBASE_FROM_BUILD;
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
