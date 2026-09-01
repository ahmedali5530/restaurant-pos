/**
 * Service Worker for POSR — offline caching + push notification handler.
 *
 * Caches:
 *   - App shell (HTML, CSS, JS, fonts) — cached on install, served from
 *     cache when offline
 *   - API responses — stale-while-revalidate (serves cached data while
 *     fetching fresh in the background)
 *   - Images — cached on first access
 *
 * Push notifications:
 *   - Receives push events from the gateway (security alerts, low stock,
 *     daily summary) and displays them even when the app is closed
 *   - Click on notification opens the app and navigates to the relevant screen
 *
 * The SW is registered in main.tsx via navigator.serviceWorker.register().
 */

const CACHE_NAME = 'posr-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg',
];

// ---------------------------------------------------------------------------
// Install — cache the app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — stale-while-revalidate for most requests
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Skip non-GET requests (writes go through the offline queue)
  if (request.method !== 'GET') return;

  // Skip WebSocket upgrades
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;

  // Skip external API calls (gateway, payment server, etc.)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/payments/') ||
      url.pathname.startsWith('/webhooks/') || url.pathname.startsWith('/alerts')) {
    return;
  }

  // Stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached); // Network failed — return cached version

      return cached || fetchPromise;
    })
  );
});

// ---------------------------------------------------------------------------
// Push — display notifications from the gateway
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'POSR', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'POSR Notification';
  const options = {
    body: data.body || data.message || '',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: data.tag || 'posr-notification',
    data: {
      url: data.url || '/',
      severity: data.severity || 'info',
    },
    requireInteraction: data.severity === 'critical',
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---------------------------------------------------------------------------
// Notification click — open the app and navigate
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Message — handle messages from the app (e.g. subscribe to push)
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
