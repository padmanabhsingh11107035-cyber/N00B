import React, { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { fetchVapidKeyResult, subscribeToPush, unsubscribeFromPush, fetchMyPushEndpoint } from '../../services/api';
import { checkPushSupport, currentPushEnv, type PushSupport } from '../../utils/pushSupport';
import { withTimeout, isRetryableFailure, nextDelay, readPending, writePending } from '../../utils/pushRetry';

const DISMISSED_KEY = 'noob_push_prompt_seen';

// Browsers only ever show their OWN native permission prompt once per
// origin — if it's denied, calling requestPermission() again just returns
// "denied" instantly with no UI. So this custom, on-theme "soft ask" exists
// specifically to spend that one shot wisely: explain the value first, and
// only trigger the real native prompt after someone opts in here, instead
// of a bare browser dialog appearing out of nowhere on page load.
export function shouldShowPushPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'default') return false;
  // Only for people who installed the app (Home Screen on iOS, "Install app" on Android/desktop) —
  // never someone just visiting the website in an ordinary browser tab.
  if (!currentPushEnv(Capacitor.isNativePlatform()).standalone) return false;
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return false;
  } catch {
    // Private-browsing localStorage access can throw — treat as "not seen
    // yet" rather than crashing the prompt logic.
  }
  return true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushEnableStatus = 'granted' | 'denied' | 'unsupported' | 'error';

// Why it failed, so the message can say something useful:
//   'not-set-up' - the server has no push key yet (the notification setup has not been finished)
//   'browser'    - the browser refused or failed to subscribe
//   'save'       - subscribed, but saving it to the account failed (connection)
export type PushErrorReason = 'not-set-up' | 'browser' | 'save';

interface PushOutcome { status: PushEnableStatus; subscription?: PushSubscription; reason?: PushErrorReason; message?: string; retryable?: boolean }

// The notification key is the same for everyone and never changes: read it once, ahead of time (the prompt does that the moment it appears), so tapping "Turn on" has nothing left to wait for.
let cachedVapidKey: string | null = null;
async function loadVapidKey(): Promise<{ key: string | null; failed: boolean }> {
  if (cachedVapidKey) return { key: cachedVapidKey, failed: false };
  const found = await fetchVapidKeyResult();
  if (found.key) cachedVapidKey = found.key;
  return found;
}

/** Gets everything ready that does not need the person's answer yet: the key and the service worker. Safe to call any time; never throws. */
export function warmPushSetup(): void {
  void loadVapidKey().catch(() => undefined);
  try { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined); } catch { /* nothing to warm */ }
}

// Everything AFTER the permission is given: key -> service worker -> the push service -> save to the account. Each step has a time limit, so nothing hangs for ever.
// (An iPhone's very first subscription can take 10-30 seconds: it talks to Apple's push service.)
async function subscribeThisDevice(): Promise<PushOutcome> {
  try {
    const found = await withTimeout(loadVapidKey(), 15_000, 'Reading the notification key');
    if (!found.key) return found.failed ? { status: 'error', reason: 'save', retryable: true } : { status: 'error', reason: 'not-set-up' };

    const registration = await withTimeout(navigator.serviceWorker.register('/sw.js'), 12_000, 'Starting the notification helper');
    await withTimeout(navigator.serviceWorker.ready, 12_000, 'Starting the notification helper');
    const subscribeOptions = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(found.key) };
    let subscription: PushSubscription;
    try {
      subscription = await withTimeout(registration.pushManager.subscribe(subscribeOptions), 45_000, 'Subscribing');
    } catch (err) {
      // The browser still holds a subscription made with a different key (e.g. from before the move): drop it and start fresh.
      const stale = await registration.pushManager.getSubscription();
      if (!stale) throw err;
      await stale.unsubscribe();
      subscription = await withTimeout(registration.pushManager.subscribe(subscribeOptions), 45_000, 'Subscribing');
    }

    const ok = await withTimeout(subscribeToPush(subscription), 20_000, 'Saving');
    if (!ok) return { status: 'error', reason: 'save', retryable: true };
    return { status: 'granted', subscription };
  } catch (err) {
    console.error('Failed to enable push notifications:', err);
    return { status: 'error', reason: 'browser', retryable: isRetryableFailure(err) };
  }
}

// Shared by the real on/off toggle in Install and Permissions (which waits for the answer and shows it); the soft-ask prompt below uses startEnablingPush instead.
export async function enablePushNotifications(): Promise<{ status: PushEnableStatus; subscription?: PushSubscription; reason?: PushErrorReason; message?: string }> {
  // Not just "unsupported": say WHERE the person is and exactly what to do (iPhone Home Screen, in-app browser, ...)
  const support = getPushSupport();
  if (support.supported === false) return { status: 'unsupported', message: support.message };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { status: 'denied' };
    return await subscribeThisDevice();
  } catch (err) {
    console.error('Failed to enable push notifications:', err);
    return { status: 'error', reason: 'browser' };
  }
}

// ---- Turning notifications on in the background (the soft-ask prompt)
// The person taps "Turn on" and the prompt is gone at once; the rest happens on its own. If the phone is offline (or the server is slow) the job is remembered
// on the phone, tried again when the connection is back and whenever the app is opened, and finished without the person doing anything.
let setupRunning = false;
let setupAttempt = 0;
let setupTimer: ReturnType<typeof setTimeout> | undefined;
let setupListening = false;

async function runPendingSetup(): Promise<void> {
  if (setupRunning || !readPending()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') { writePending(false); return; } // the permission was taken back: nothing to finish
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;                                         // offline: the "online" event starts it again
  setupRunning = true;
  try {
    const result = await subscribeThisDevice();
    if (result.status === 'granted' || !result.retryable) { writePending(false); setupAttempt = 0; return; }
    const wait = nextDelay(setupAttempt++);
    if (wait !== null) {
      if (setupTimer) clearTimeout(setupTimer);
      setupTimer = setTimeout(() => { void runPendingSetup(); }, wait);
    }
  } finally {
    setupRunning = false;
  }
}

function listenForRetries(): void {
  if (setupListening || typeof window === 'undefined') return;
  setupListening = true;
  window.addEventListener('online', () => { setupAttempt = 0; void runPendingSetup(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void runPendingSetup(); });
}

/** Call from the tap on "Turn on": it asks the browser's own question right now (a phone only allows that inside the tap itself) and does all the rest in the background. */
export function startEnablingPush(): void {
  let asked: Promise<NotificationPermission>;
  try { asked = Promise.resolve(Notification.requestPermission()); } catch { return; }
  listenForRetries();
  void asked
    .then((permission) => {
      if (permission !== 'granted') return undefined;
      writePending(true);   // remembered first: if the app is closed or the phone is offline right now, it is finished later
      setupAttempt = 0;
      return runPendingSetup();
    })
    .catch(() => undefined);
}

/** Call when the app starts for a signed-in person: finishes a "turn on notifications" that was interrupted (offline, app closed). Does nothing when nothing is waiting. */
export function resumePendingPush(): void {
  if (!readPending()) return;
  listenForRetries();
  void runPendingSetup();
}

// Can this phone / browser get notifications, and if not, what should the person do? (see utils/pushSupport.ts)
export function getPushSupport(): PushSupport {
  return checkPushSupport(currentPushEnv(Capacitor.isNativePlatform()));
}

// This browser's own subscription (if it has one).
export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? await registration.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

// 'on'          this device is the one that gets notifications
// 'other-device' notifications are on, but for a DIFFERENT device of this account (only one device gets them)
// 'off'         no notifications
export type PushDeviceState = 'on' | 'other-device' | 'off';
export async function getPushDeviceState(): Promise<PushDeviceState> {
  const [subscription, savedEndpoint] = await Promise.all([getBrowserPushSubscription(), fetchMyPushEndpoint()]);
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (subscription && granted && savedEndpoint && subscription.endpoint === savedEndpoint) return 'on';
  return savedEndpoint ? 'other-device' : 'off';
}

// Switch notifications off for this device: forget the browser's subscription too, not only the saved copy.
export async function disablePushNotifications(): Promise<boolean> {
  try {
    const subscription = await getBrowserPushSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {
    // the saved copy is what stops the notifications: carry on
  }
  return unsubscribeFromPush();
}

interface PushNotificationPromptProps {
  onDone: () => void;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ onDone }) => {
  // get the key and the helper ready while the person reads the question
  useEffect(() => { warmPushSetup(); }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Ignore — worst case this prompt reappears next session.
    }
    onDone();
  };

  // The prompt closes at once; the browser's own question and all the rest carry on in the background (see startEnablingPush).
  const handleEnable = () => {
    startEnablingPush();
    dismiss();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-xs bg-zinc-950 border border-noob/20 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="w-14 h-14 mx-auto rounded-full bg-noob/10 border border-noob/30 flex items-center justify-center">
          <Bell className="w-7 h-7 text-noob" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-white">Turn on notifications?</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Get notified about likes, comments, messages, and follow requests as they happen — even when NOOB isn't open.
          </p>
        </div>
        <button
          onClick={handleEnable}
          data-testid="push-turn-on"
          className="w-full py-3 bg-gradient-to-r from-noob to-noob-strong text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
        >
          Turn on notifications
        </button>
        <button
          onClick={dismiss}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 font-semibold cursor-pointer"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
};
