// NOOB push service worker — this is the piece that lets a notification
// show up even when the app itself isn't open. The browser wakes this
// worker up whenever a push arrives (regardless of whether any NOOB tab is
// open) and it's this code, not the React app, that actually renders it.

// Where the app's edge function lives — needed here specifically so "Decline" on an incoming-call
// notification can be handled with a plain background fetch, no NOOB tab or session required.
const PUSH_FUNCTION_URL = 'https://abffssydapumuhwgzeck.supabase.co/functions/v1/dynamic-handler';

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
    data: { url: data.url || '/', declineToken: data.declineToken || '', isCallRing },
    // An incoming call needs to demand attention (stay on screen until acted on) and replace any
    // earlier ring for the same call rather than stacking a second notification for it. Everything
    // else keeps the browser's normal auto-dismissing behavior.
    ...(isCallRing ? { tag: data.tag, requireInteraction: true, actions: data.actions || [] } : {})
  };

  event.waitUntil(self.registration.showNotification(data.title || 'NOOB', options));
});

// Clicking the OS notification should bring an existing NOOB tab to the front instead of always
// opening a fresh one. A call notification's own Accept/Decline action buttons (Chrome/Android only —
// iOS Safari does not render "actions" at all, so there the only option is the plain tap below, which
// opens straight into the same accept/decline screen the app already shows for a live ring) are also
// handled here: Decline never needs a window at all, just the one-time token minted for this ring.
self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification.data?.url || '/';
  const declineToken = event.notification.data?.declineToken || '';

  if (event.action === 'decline') {
    event.notification.close();
    if (declineToken) {
      event.waitUntil(
        fetch(PUSH_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'decline_call_ring', token: declineToken })
        }).catch(() => undefined)
      );
    }
    return;
  }

  const isCallRing = !!event.notification.data?.isCallRing;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // Only a call needs to jump the person straight to the ring screen even if they were on a
          // different page — every other notification just brings the app forward wherever it was.
          if (isCallRing && 'navigate' in client) client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
