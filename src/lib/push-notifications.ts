/**
 * Push notification service — browser push notifications for POSR.
 *
 * Uses the existing security alerting infrastructure to send push
 * notifications to the POS terminal (and the owner's phone if PWA is
 * installed). The gateway sends push events via the service worker.
 *
 * Features:
 *   - Subscribe to push notifications on login
 *   - Unsubscribe on logout
 *   - Send subscription to gateway (stored per-user)
 *   - Gateway triggers push when security alerts fire
 *
 * The service worker (public/sw.js) handles the push event and displays
 * the notification even when the app is closed.
 */

const SW_PATH = '/sw.js';

/**
 * Register the service worker.
 * Called once on app startup (in main.tsx).
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // Skip in dev to avoid caching issues

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
    });
    console.log('[PWA] Service Worker registered:', registration.scope);

    // Check for updates every hour
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);
  } catch (err) {
    console.warn('[PWA] Service Worker registration failed:', err);
  }
}

/**
 * Subscribe to push notifications.
 * Returns the PushSubscription or null if push is not supported.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Generate VAPID keys (in production, these should be server-provided)
      // For now, we use a placeholder — the gateway should provide the VAPID public key
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.warn('[PWA] VITE_VAPID_PUBLIC_KEY not set — push notifications disabled');
        return null;
      }

      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as BufferSource,
      });
    }

    // Send subscription to gateway (for server-side push)
    await sendSubscriptionToServer(subscription);
    return subscription;
  } catch (err) {
    console.warn('[PWA] Push subscription failed:', err);
    return null;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await removeSubscriptionFromServer(subscription);
    }
  } catch (err) {
    console.warn('[PWA] Push unsubscribe failed:', err);
  }
}

/**
 * Send the push subscription to the gateway so it can send pushes.
 */
async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  try {
    const { getGatewayBaseUrl, authHeaders } = await import('@/lib/session.ts');
    await fetch(`${getGatewayBaseUrl()}/push/subscribe`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // Gateway may not support push yet — silently skip
  }
}

/**
 * Remove the push subscription from the gateway.
 */
async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  try {
    const { getGatewayBaseUrl, authHeaders } = await import('@/lib/session.ts');
    await fetch(`${getGatewayBaseUrl()}/push/unsubscribe`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // silently skip
  }
}

/**
 * Convert VAPID public key from base64url to Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
