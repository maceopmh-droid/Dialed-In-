// Dialed In's service worker, for phone notifications only: it shows a notification when one arrives and opens the
// app on the bell when it's tapped. It caches nothing, so the app loads exactly as it does without it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dialed In', {
    body: d.body || '', tag: d.tag || undefined, icon: 'icon.png', badge: 'icon.png', data: { url: './?notifications=1' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) { c.postMessage({ type: 'open-notifications' }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
