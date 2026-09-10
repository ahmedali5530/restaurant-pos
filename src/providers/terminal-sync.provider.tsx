import { type ReactNode, useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { useDatabase } from '@/hooks/useDatabase.ts';
import { usePosStoreReady, refreshCatalogIntoSettings } from '@/providers/pos-store.provider.tsx';
import { terminalSyncService } from '@/infrastructure/sync/sync-service.ts';
import { setSyncStatus } from '@/infrastructure/sync/sync-status.ts';
import { appSettings } from '@/store/jotai.ts';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';

const PERIODIC_SYNC_MS = 30_000;
const LOCAL_WRITE_SYNC_DEBOUNCE_MS = 400;

/**
 * Background sync only — never a write-path switch for FOH screens.
 */
export function TerminalSyncProvider({ children }: { children: ReactNode }) {
  const { isReady } = usePosStoreReady();
  const {
    isBrowserOnline,
    isEffectivelyConnected,
    hasSession,
  } = useDatabase();
  const setAppSettings = useSetAtom(appSettings);
  const syncing = useRef(false);

  useEffect(() => {
    if (!isReady || !hasSession) return;

    if (!isBrowserOnline) {
      setSyncStatus({ phase: 'offline' });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await terminalSyncService.initialize(isEffectivelyConnected);
        if (cancelled) return;
        await refreshCatalogIntoSettings(setAppSettings);
      } catch (error) {
        console.error('[terminal-sync] initialize failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isReady,
    hasSession,
    isBrowserOnline,
    isEffectivelyConnected,
    setAppSettings,
  ]);

  useEffect(() => {
    if (!isReady || !hasSession || !isEffectivelyConnected) return;

    const run = () => {
      if (syncing.current) return;
      syncing.current = true;
      void terminalSyncService
        .synchronize()
        .then(() => refreshCatalogIntoSettings(setAppSettings))
        .catch((error) => console.warn('[terminal-sync] sync failed', error))
        .finally(() => {
          syncing.current = false;
        });
    };

    const interval = window.setInterval(run, PERIODIC_SYNC_MS);
    const onFocus = () => run();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isReady, hasSession, isEffectivelyConnected, setAppSettings]);

  // Drain outbox shortly after local writes (status listeners / custom event).
  useEffect(() => {
    if (!isReady || !hasSession || !isEffectivelyConnected) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const onLocalWrite = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void terminalSyncService
          .synchronize()
          .then(() => refreshCatalogIntoSettings(setAppSettings))
          .catch(() => undefined);
      }, LOCAL_WRITE_SYNC_DEBOUNCE_MS);
    };
    window.addEventListener('posr-posstore-write', onLocalWrite);
    return () => {
      window.removeEventListener('posr-posstore-write', onLocalWrite);
      if (debounce) clearTimeout(debounce);
    };
  }, [isReady, hasSession, isEffectivelyConnected, setAppSettings]);

  useEffect(() => {
    const onOffline = () => setSyncStatus({ phase: 'offline' });
    const onOnline = () => {
      void terminalSyncService
        .initialize(true)
        // Connectivity is back: skip any backoff left over from the outage.
        .then(() => terminalSyncService.synchronize({ force: true }))
        .then(async () => {
          await refreshCatalogIntoSettings(setAppSettings);
        })
        .catch(() => undefined);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [setAppSettings]);

  // Expose pending count for banner
  useEffect(() => {
    if (!isReady) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const pending = await posStore.getPendingOutbox();
      const conflicts = await posStore.getOpenConflicts();
      setSyncStatus({
        pendingCount: pending.length,
        conflictCount: conflicts.length,
      });
    };
    void tick();
    const id = window.setInterval(tick, 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isReady]);

  return children;
}

export function notifyPosStoreWrite(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('posr-posstore-write'));
  }
}
