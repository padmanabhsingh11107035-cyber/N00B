// A stable id for THIS browser install, used to enforce "one signed-in device at a time" (see
// device_sessions in the migrations). Deliberately separate from services/tabSessions.ts, which
// keys sessions per ACCOUNT per tab — this key is shared by every tab/account in the same browser,
// since "device" here means the physical browser install, not a tab or an account.
const DEVICE_ID_KEY = 'noob_device_id_v1';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode, etc.) — a per-call random id just means this device can never
    // be recognized as "the same one" twice, which only means the single-device check degrades to
    // "always treat it as a new device," never a crash.
    return crypto.randomUUID();
  }
}

// A short, human label for the device picker shown when a second device tries to sign in — not
// meant to be precise, just enough for someone to recognize "oh, that's my phone."
export function getDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  const isIphone = /iphone/i.test(ua);
  const isIpad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isMac = /macintosh/i.test(ua) && !isIpad;
  const isWindows = /windows/i.test(ua);
  const isLinux = /linux/i.test(ua) && !isAndroid;

  const device = isIphone ? 'iPhone' : isIpad ? 'iPad' : isAndroid ? 'Android' : isMac ? 'Mac' : isWindows ? 'Windows' : isLinux ? 'Linux' : 'Unknown device';

  let browser = 'Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

  const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return standalone ? `NOOB app on ${device}` : `${browser} on ${device}`;
}
