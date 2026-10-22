// NOOB push service worker — this is the piece that lets a notification
// show up even when the app itself isn't open. The browser wakes this
// worker up whenever a push arrives (regardless of whether any NOOB tab is
// open) and it's this code, not the React app, that actually renders it.

// An installable PWA needs a service worker that handles 'fetch' — without this, Chrome never
// fires beforeinstallprompt, so the in-app "Install" button silently has nothing to trigger.
//
// Skipped on iOS/iPadOS: Safari has never supported beforeinstallprompt (there is nothing here for
// it to trigger — "Add to Home Screen" there is a manual Share-sheet action with no JS hook at all),
// but registering a 'fetch' listener forces EVERY network request on the page through the service
// worker's dispatch, and WebKit's per-request overhead for that is well known to run far higher than
// Chromium's. Chat makes many small requests back-to-back (messages, avatars, attachments, read
// receipts), so that tax compounds worst exactly there — matching reports of chat being slow and
// unresponsive on iOS specifically, everywhere else fine.
const isAppleTouchDevice =
  /iPad|iPhone|iPod/.test(self.navigator.userAgent) ||
  (self.navigator.platform === 'MacIntel' && self.navigator.maxTouchPoints > 1);
//
// What this listener does besides that: when a PAGE cannot be fetched at all (the website is down, or the phone is offline) or the server answers with an error (5xx), the person sees
// NOOB's own "NOOB is taking a short break" page (public/app-down.html) instead of the browser's or the host's error page. Only page loads (navigations) and the four small
// files that page needs are touched; every other request goes straight to the network exactly as before.
const DOWN_CACHE = 'noob-down-page-v1';
const DOWN_FILES = ['/app-down.html', '/boot-guard.js', '/noob-logo-circle.png', '/favicon-32.png'];
const DOWN_PAGE = '/app-down.html';
const downResponse = () => caches.open(DOWN_CACHE).then((c) => c.match(DOWN_PAGE)).then((r) => r || new Response('NOOB is taking a short break. Please try again in a minute.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
if (!isAppleTouchDevice) {
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).then((res) => (res.status >= 500 && res.status < 600 ? downResponse() : res)).catch(() => downResponse()));
      return;
    }
    let path = '';
    try { const u = new URL(req.url); if (u.origin === self.location.origin) path = u.pathname; } catch (err) { /* not a normal address */ }
    if (DOWN_FILES.indexOf(path) !== -1) {
      event.respondWith(fetch(req).catch(() => caches.open(DOWN_CACHE).then((c) => c.match(path)).then((r) => r || Response.error())));
    }
  });
}

// Without these, a browser that already had the old sw.js (from before this file existed, or from
// any earlier version) keeps running it — a new version only takes over once every tab of the site
// is fully closed — so this exact fix would sit inert for anyone who already had NOOB open before.
// skipWaiting + clients.claim make a newly-deployed worker take control on the very next load.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  // keep the "short break" page and its few files on the device, so it can be shown when nothing can be fetched
  event.waitUntil(caches.open(DOWN_CACHE).then((c) => Promise.all(DOWN_FILES.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => undefined)))).catch(() => undefined));
});
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = { title: 'NOOB', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch (err) {
    // Not JSON for some reason — fall back to the default above rather
    // than showing nothing at all.
  }

  const isCallRing = data.type === 'call_ring';
  const options = {
    body: data.body,
    icon: data.icon || '/noob-logo-circle.png',
    badge: '/noob-logo-circle.png',
    data: { url: data.url || '/', isCallRing },
    // Never silent: the phone plays its own notification sound, and buzzes, so the person knows there is an update
    // even when the app is closed.
    silent: false,
    vibrate: isCallRing ? [300, 150, 300, 150, 300] : [120, 60, 120],
    // An incoming call needs to demand attention (stay on screen until acted on) and replace any
    // earlier ring for the same call rather than stacking a second notification for it. Everything
    // else keeps the browser's normal auto-dismissing behavior.
    ...(isCallRing ? { tag: data.tag, requireInteraction: true } : {})
  };

  event.waitUntil(self.registration.showNotification(data.title || 'NOOB', options));
});

// Clicking the OS notification should bring an existing NOOB tab to the front instead of always
// opening a fresh one. A call notification also needs to jump straight to the ring screen even if
// the tab was on a different page — every other notification just brings the app forward as-is.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // only a page of NOOB itself is opened (an address on one of NOOB's own sites is turned into the same page here); anything else is the home page
  const ownSite = /^(www\.)?(noobsocials\.com|nooob\.xyz)$/i;
  let targetUrl = '/';
  try {
    const u = new URL(event.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin || ownSite.test(u.hostname)) targetUrl = u.pathname + u.search + u.hash;
  } catch (err) { /* not an address: the home page */ }
  const isCallRing = !!event.notification.data?.isCallRing;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (isCallRing && 'navigate' in client) client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
