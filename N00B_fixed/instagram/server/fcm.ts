import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Firebase Cloud Messaging — the delivery path for the native Android app's
// push notifications (the web-push VAPID setup in push.ts only reaches
// browsers; the Capacitor app registers an FCM device token instead, via
// @capacitor/push-notifications, and that token can only ever be reached
// through Firebase's own servers). Configured from a single env var holding
// the full service-account JSON (Project settings > Service accounts >
// Generate new private key in the Firebase console) rather than a file on
// disk, so it can be set as a plain Railway secret without touching the repo.
let app: App | null = null;

export function initFcm(): void {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return;
  try {
    const serviceAccount = JSON.parse(raw);
    app = initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (err: any) {
    console.error('Failed to initialize Firebase Admin (check FIREBASE_SERVICE_ACCOUNT_JSON is valid JSON):', err?.message || err);
  }
}

export function isFcmConfigured(): boolean {
  return !!app;
}

export interface FcmPayload {
  title: string;
  body: string;
  icon?: string;
}

// Sends to every token for one user in a single batched call. Returns which
// of the given tokens Firebase reported as dead (uninstalled app, cleared
// data, etc.) so the caller can drop exactly those from storage — the same
// "stop retrying what will never work again" cleanup push.ts does for a
// single web subscription, just applied per-token since one account can have
// several devices registered at once.
export async function sendFcm(tokens: string[], payload: FcmPayload): Promise<{ deadTokens: string[] }> {
  if (!app || tokens.length === 0) return { deadTokens: [] };

  try {
    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.icon
      }
    });

    const deadTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          deadTokens.push(tokens[i]);
        }
      }
    });
    return { deadTokens };
  } catch (err: any) {
    console.error('FCM send failed:', err?.message || err);
    return { deadTokens: [] };
  }
}
