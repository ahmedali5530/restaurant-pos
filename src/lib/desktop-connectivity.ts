import { isTauriDesktop } from '@/lib/desktop.ts';
import { getCachedRuntimeConfig } from '@/lib/runtime-config.ts';

/**
 * Blank, localhost, and loopback mean this PC is the server.
 * A central-terminal address is a different machine.
 */
export function isLoopbackServerHost(host: string | null | undefined): boolean {
  const bare = String(host ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '');
  if (!bare) return true;
  const lower = bare.toLowerCase();
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0';
}

/** Desktop install whose database and gateway are on this PC. */
export function desktopKeepsLocalSession(): boolean {
  if (!isTauriDesktop()) return false;
  return isLoopbackServerHost(getCachedRuntimeConfig()?.centralHost);
}

/**
 * Windows and WebKit set navigator.onLine to false when the NIC is down.
 * That is not a reason to drop a database that is already running on 127.0.0.1.
 */
export function browserReportsOnline(): boolean {
  if (desktopKeepsLocalSession()) return true;
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
