import { Capacitor } from '@capacitor/core';
import { registerPushToken } from './api';

// Phone notifications exist only in the native Android app (Capacitor's plugin has no meaningful web implementation) — this is a no-op everywhere else, so it is
// safe to call unconditionally from app startup.
//
// Android app version 3 (version code 3) is the first build that has Firebase set up (google-services.json). Asking an OLDER build to register with Firebase
// closes the whole app by itself (it did, right after login), so builds below 3 never ask.
const FIREBASE_FROM_BUILD = 3;

let started = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;

  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    if (!(Number(info.build) >= FIREBASE_FROM_BUILD)) return;

    const { PushNotifications } = await import('@capacitor/push-notifications');

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return;

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

    await PushNotifications.register();
  } catch (err) {
    console.error('Push notification init failed:', err);
  }
}
