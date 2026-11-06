import { Capacitor } from '@capacitor/core';
import { registerPushToken } from './api';

// Push notifications only exist on the native Android build (Capacitor's
// plugin has no meaningful web implementation) — this is a no-op everywhere
// else, so it's safe to call unconditionally from app startup.
const NATIVE_PUSH_READY = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // The Android app has no Firebase set up yet (no google-services.json), and asking the phone to register with Firebase then crashes the whole app
  // (it closes by itself right after login). So the phone is not asked until Firebase is added to the build: set NATIVE_PUSH_READY to true then.
  if (!NATIVE_PUSH_READY) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token) => {
      registerPushToken(token.value).catch((err) => console.error('Failed to register push token:', err));
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });
  } catch (err) {
    console.error('Push notification init failed:', err);
  }
}
