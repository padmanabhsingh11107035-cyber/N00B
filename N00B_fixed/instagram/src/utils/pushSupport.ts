// Can this phone / browser get NOOB notifications, and if not, what exactly should the person do?
//
// Web notifications need three browser features (Notification, service workers, push). Whether they exist depends on where
// NOOB is opened:
//   * Android Chrome / Edge / Firefox / Samsung Internet: everything works.
//   * iPhone and iPad (every browser there is Safari underneath): ONLY when NOOB is opened from its Home Screen icon
//     (iOS 16.4 or newer). In a normal Safari/Chrome tab the feature simply does not exist.
//   * In-app browsers (Instagram, Facebook, WhatsApp, TikTok, an Android WebView...): not available.
//   * The native app build: needs its own push setup, which is not part of the website's notifications.
// Pure function over a description of the environment, so it can be tested with real user-agent strings.

export interface PushEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean; // opened from the Home Screen icon / installed app
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  secure?: boolean; // https (or localhost)
  isNativeApp?: boolean; // the Capacitor app build
}

export type PushSupportKind = 'ios-browser' | 'ios-old' | 'in-app-browser' | 'native-app' | 'insecure' | 'other';
export type PushSupport = { supported: true } | { supported: false; kind: PushSupportKind; message: string };

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|MicroMessenger|WhatsApp|Line\/|Twitter|LinkedInApp|Pinterest|GSA\/|; wv\)/i;

export const isIos = (env: Pick<PushEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean =>
  /iPhone|iPad|iPod/i.test(env.userAgent) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1); // iPadOS pretends to be a Mac

export function checkPushSupport(env: PushEnv): PushSupport {
  if (env.isNativeApp) {
    return {
      supported: false,
      kind: 'native-app',
      message: 'Notifications are not set up for the NOOB app yet. Open nooob.xyz in Chrome (Android) or Safari (iPhone) to get notifications.'
    };
  }
  if (env.hasNotification && env.hasServiceWorker && env.hasPushManager) {
    if (env.secure === false) {
      return { supported: false, kind: 'insecure', message: 'Notifications only work on the secure address https://nooob.xyz.' };
    }
    return { supported: true };
  }
  if (IN_APP.test(env.userAgent)) {
    // must come before the iPhone advice: "Add to Home Screen" does not exist inside an in-app browser
    return {
      supported: false,
      kind: 'in-app-browser',
      message:
        'This in-app browser cannot show notifications. Open nooob.xyz in Chrome (or in Safari on iPhone) and turn them on there.' +
        (isIos(env) ? ' On iPhone, then tap Share, Add to Home Screen, and open NOOB from that icon.' : '')
    };
  }
  if (isIos(env)) {
    if (!env.standalone) {
      return {
        supported: false,
        kind: 'ios-browser',
        message: 'On iPhone and iPad, notifications only work from the NOOB icon on your Home Screen. In Safari tap Share, then Add to Home Screen. Open NOOB from that icon and turn notifications on there.'
      };
    }
    return {
      supported: false,
      kind: 'ios-old',
      message: 'Notifications on iPhone and iPad need iOS 16.4 or newer. Update your iPhone in Settings, General, Software Update, then try again.'
    };
  }
  return {
    supported: false,
    kind: 'other',
    message: 'This browser cannot show notifications. Try Chrome, Edge, Firefox or Samsung Internet (on iPhone, use the Home Screen icon).'
  };
}

// The environment of the page that is running right now.
export function currentPushEnv(isNativeApp = false): PushEnv {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { standalone?: boolean }) : undefined;
  const standalone =
    !!nav?.standalone || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
  return {
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform,
    maxTouchPoints: nav?.maxTouchPoints,
    standalone,
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
    hasServiceWorker: !!nav && 'serviceWorker' in nav,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    secure: typeof window !== 'undefined' ? window.isSecureContext : undefined,
    isNativeApp
  };
}
