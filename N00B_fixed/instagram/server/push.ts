import webpush from 'web-push';
import { loadCollection, saveCollection } from './db';

// Web Push (real OS/browser-level notifications, delivered even when the
// NOOB tab/app isn't open) needs one stable VAPID keypair for the whole
// app's lifetime — every subscription a browser creates is tied to
// whichever public key it was created with, so generating a new keypair
// on every server restart would silently break every subscription anyone
// had already granted. Persisted through the same Mongo-backed
// loadCollection/saveCollection used for the rest of app state, so it
// survives Railway redeploys; falls back to a fresh in-memory keypair
// (same as the rest of the app's Mongo-optional design) when no database
// is configured, which is fine for local development.
let vapidKeys: { publicKey: string; privateKey: string } | null = null;

export async function initPush(): Promise<void> {
  const existing = await loadCollection<{ publicKey: string; privateKey: string }>('vapidKeys');
  if (existing?.publicKey && existing?.privateKey) {
    vapidKeys = existing;
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    await saveCollection('vapidKeys', vapidKeys);
  }
  webpush.setVapidDetails('mailto:support@noobsocial.app', vapidKeys.publicKey, vapidKeys.privateKey);
}

export function getVapidPublicKey(): string | null {
  return vapidKeys?.publicKey || null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

// Fire-and-forget from the caller's point of view, but reports back
// whether the subscription itself is dead (browser unsubscribed, the
// device was factory-reset, etc.) so the caller can stop storing it —
// otherwise every future notification for that user would keep trying
// (and failing) to reach a subscription that will never work again.
export async function sendPush(
  subscription: any,
  payload: PushPayload
): Promise<{ ok: boolean; expired: boolean }> {
  if (!vapidKeys || !subscription) return { ok: false, expired: false };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true, expired: false };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, expired: true };
    }
    console.error('Push send failed:', err?.message || err);
    return { ok: false, expired: false };
  }
}
