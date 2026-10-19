// Dialed In's service worker, for phone notifications only: it shows a notification when one arrives and, when it's
// tapped, opens the app on what it's about (v15.1; the bell if the app can't tell). It caches nothing, so the app loads exactly as it does without it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dialed In', {
    body: d.body || '', tag: d.tag || undefined, icon: 'icon.png', badge: 'icon.png', data: { url: './?notifications=1' + (d.tag ? '&n=' + encodeURIComponent(d.tag) : ''), tag: d.tag || '' },
  }));
});

// the app that's open (this one, never the preview copy, which has its own worker) is brought forward first and then
// told which notification was tapped; with none open, it opens with it in the address
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  const url = new URL((e.notification.data && e.notification.data.url) || './', scope).href;
  const ours = (c) => c.url.startsWith(scope) && !/^preview\//.test(c.url.slice(scope.length));
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    const c = list.find((w) => ours(w) && 'focus' in w);
    if (!c) return self.clients.openWindow(url);
    try { await c.focus(); } catch (_) { /* the phone brings it forward itself */ }
    c.postMessage({ type: 'open-notifications', tag: (e.notification.data && e.notification.data.tag) || e.notification.tag || '' });
  }));
});
