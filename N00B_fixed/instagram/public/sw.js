// NOOB push service worker — this is the piece that lets a notification
// show up even when the app itself isn't open. The browser wakes this
// worker up whenever a push arrives (regardless of whether any NOOB tab is
// open) and it's this code, not the React app, that actually renders it.

self.addEventListener('push', (event) => {
  let data = { title: 'NOOB', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch (err) {
    // Not JSON for some reason — fall back to the default above rather
    // than showing nothing at all.
  }

  const options = {
    body: data.body,
    icon: data.icon || '/noob-logo-circle.png',
    badge: '/noob-logo-circle.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(data.title || 'NOOB', options));
});

// Clicking the OS notification should bring an existing NOOB tab to the
// front instead of always opening a fresh one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
