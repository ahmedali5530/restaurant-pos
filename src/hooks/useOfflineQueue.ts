/**
 * useOfflineQueue — React hook that auto-replays the offline write queue
 * when the SurrealDB WebSocket connection is restored.
 *
 * Also exposes:
 *   - pendingCount: number of queued writes (for UI badge)
 *   - isReplaying: true while replay is in progress
 *   - lastReplayResult: summary of the last replay (synced/failed/remaining)
 *   - replayNow(): manually trigger a replay
 *
 * Placement: mounted in DatabaseProvider, so it has access to both the
 * connection state and the db instance.
 *
 * The hook listens to connection state changes:
 *   - When connection drops: nothing happens (writes are enqueued by the
 *     intercepted db.create/update/merge/delete calls)
 *   - When connection restores: auto-replay after 2s delay (to ensure
 *     the WebSocket is fully stable before replaying)
 *   - Manual replay: triggered by the user via the OfflineModeBanner retry button
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useDatabase } from '@/hooks/useDatabase.ts';
import { useDB } from '@/api/db/db.ts';
import { replayQueue, getPendingCount } from '@/lib/offline-write-queue.ts';

export interface UseOfflineQueueResult {
  pendingCount: number;
  isReplaying: boolean;
  lastReplayResult: { synced: number; failed: number; remaining: number } | null;
  replayNow: () => Promise<void>;
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const { isConnected } = useDatabase();
  const db = useDB();
  const [pendingCount, setPendingCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [lastReplayResult, setLastReplayResult] = useState<
    { synced: number; failed: number; remaining: number } | null
  >(null);
  const wasConnected = useRef(isConnected);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh pending count on mount + when connection changes
  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB might not be available in all environments
    }
  }, []);

  // Auto-replay when connection restores (after 2s delay for stability)
  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      // Connection just restored — schedule replay after 2s
      if (replayTimer.current) clearTimeout(replayTimer.current);
      replayTimer.current = setTimeout(() => {
        void doReplay();
      }, 2000);
    }
    wasConnected.current = isConnected;
  }, [isConnected]);

  // Listen for manual replay requests (from OfflineModeBanner retry button)
  useEffect(() => {
    const handler = () => void doReplay();
    window.addEventListener('posr-db-reconnect', handler);
    return () => window.removeEventListener('posr-db-reconnect', handler);
  }, []);

  // Refresh count on mount
  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Refresh count periodically (every 5s) to catch enqueued writes
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isReplaying) void refreshCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [isReplaying]);

  const doReplay = useCallback(async () => {
    if (isReplaying) return;
    if (!isConnected) return;

    setIsReplaying(true);
    try {
      const result = await replayQueue(db);
      setLastReplayResult(result);
      await refreshCount();

      // Dispatch an event so other components know the queue was replayed
      // (they can refetch their data)
      window.dispatchEvent(
        new CustomEvent('posr-queue-replayed', { detail: result })
      );
    } catch (err) {
      console.error('[offline-queue] replay failed:', err);
    } finally {
      setIsReplaying(false);
    }
  }, [db, isConnected, isReplaying, refreshCount]);

  return {
    pendingCount,
    isReplaying,
    lastReplayResult,
    replayNow: doReplay,
  };
}
