// iOS's WebKit engine restricts (often outright blocks, silently hanging rather than erroring)
// camera/microphone access for a site running in "standalone" mode — i.e. opened from an icon added
// to the home screen via Safari's "Add to Home Screen", as opposed to a normal Safari tab. Android
// has no such restriction, so this only ever matters on iOS.
export function isIosStandalonePwa(): boolean {
  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && isStandalone;
}

/** An iPhone, iPad or iPod (an iPad that says it is a Mac is found by its touch screen). They can not install NOOB with a button: it is "Add to Home Screen" in the share menu. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}
