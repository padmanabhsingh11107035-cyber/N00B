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

let cachedModel: Promise<string> | null = null;

// The best "model name" a web page is allowed to learn. Android Chrome can reveal the phone model
// (e.g. "SM-S918B", "Pixel 7"); Apple never exposes iPhone/iPad models to a browser, so those show
// the device family and iOS version instead; computers show their OS.
export function getDeviceModel(): Promise<string> {
  if (!cachedModel) {
    cachedModel = (async () => {
      const ua = navigator.userAgent || '';
      let model = '';
      let platformVersion = '';
      try {
        const uaData = (navigator as any).userAgentData;
        if (uaData?.getHighEntropyValues) {
          const hv = await uaData.getHighEntropyValues(['model', 'platformVersion']);
          model = String(hv?.model || '').trim();
          platformVersion = String(hv?.platformVersion || '').trim();
        }
      } catch {
        // not available — fall back to the user-agent text below
      }

      if (/android/i.test(ua)) {
        if (!model) {
          const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\)|;)/i);
          if (m && m[1].trim().length > 1) model = m[1].trim();
        }
        const ver = ua.match(/Android ([\d.]+)/i)?.[1];
        return model ? `${model}${ver ? ` · Android ${ver}` : ''}` : `Android phone${ver ? ` · Android ${ver}` : ''}`;
      }
      if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        const family = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : 'iPhone';
        const v = ua.match(/OS (\d+)[_.](\d+)/i);
        return v ? `${family} · iOS ${v[1]}.${v[2]}` : family;
      }
      if (/windows/i.test(ua)) {
        const major = parseInt(platformVersion.split('.')[0] || '', 10);
        return major >= 13 ? 'Windows 11 PC' : major > 0 ? 'Windows 10 PC' : 'Windows PC';
      }
      if (/macintosh/i.test(ua)) return 'Mac';
      if (/cros/i.test(ua)) return 'Chromebook';
      if (/linux/i.test(ua)) return 'Linux PC';
      return 'Unknown device';
    })();
  }
  return cachedModel;
}
