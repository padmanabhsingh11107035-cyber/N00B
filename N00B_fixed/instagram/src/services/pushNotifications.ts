import { Capacitor } from '@capacitor/core';
import { registerPushToken } from './api';

// Push notifications only exist on the native Android build (Capacitor's
// plugin has no meaningful web implementation) — this is a no-op everywhere
// else, so it's safe to call unconditionally from app startup.
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

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
