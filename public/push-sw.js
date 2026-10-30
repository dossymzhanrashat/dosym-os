/* Web Push handlers, loaded into the generated service worker (vite.config.ts › workbox.importScripts).
 * Payload from supabase/functions/send-reminders: { title, body, url, tag, alarm }. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Dosym OS', body: event.data ? event.data.text() : '' };
  }
  const scope = self.registration.scope; // https://…/dosym-os/
  event.waitUntil(
    (async () => {
      // iPhone requires every push to show a notification, even when the app is open.
      await self.registration.showNotification(data.title || 'Dosym OS', {
        body: data.body || '',
        tag: data.tag,
        data: { url: data.url || scope },
        icon: scope + 'icons/icon-192.png',
        badge: scope + 'icons/icon-192.png',
        requireInteraction: !!data.alarm,
      });
      // An open page also shows its in-app banner.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'dosym-push', payload: data });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || self.registration.scope, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'dosym-open', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
