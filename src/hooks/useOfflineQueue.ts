/**
 * useOfflineQueue — React hook that auto-replays the offline write queue
 * when the SurrealDB WebSocket connection is restored.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { StringRecordId, Table } from 'surrealdb';
import { useDatabase } from '@/hooks/useDatabase.ts';
import { replayQueue, getPendingCount } from '@/lib/offline-write-queue.ts';

export interface UseOfflineQueueResult {
  pendingCount: number;
  isReplaying: boolean;
  lastReplayResult: { synced: number; failed: number; remaining: number } | null;
  replayNow: () => Promise<void>;
}

function buildReplayDb(client: ReturnType<typeof useDatabase>['client']) {
  const toThing = (recordId: string) =>
    recordId.includes(':') ? new StringRecordId(recordId) : recordId;

  return {
    create: (table: string, data: unknown) => client.insert(new Table(table), data as never),
    update: (recordId: string, data: unknown) =>
      client.update(toThing(recordId) as never).merge(data as never),
    merge: (recordId: string, data: unknown) =>
      client.update(toThing(recordId) as never).merge(data as never),
    delete: (recordId: string) => client.delete(toThing(recordId) as never),
  };
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const { isConnected, client } = useDatabase();
  const [pendingCount, setPendingCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [lastReplayResult, setLastReplayResult] = useState<
    { synced: number; failed: number; remaining: number } | null
  >(null);
  const wasConnected = useRef(isConnected);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB might not be available in all environments
    }
  }, []);

  const doReplay = useCallback(async () => {
    if (isReplaying) return;
    if (!isConnected || !client.isConnected) return;

    setIsReplaying(true);
    try {
      const result = await replayQueue(buildReplayDb(client));
      setLastReplayResult(result);
      await refreshCount();
      window.dispatchEvent(new CustomEvent('posr-queue-replayed', { detail: result }));
    } catch (err) {
      console.error('[offline-queue] replay failed:', err);
    } finally {
      setIsReplaying(false);
    }
  }, [client, isConnected, isReplaying, refreshCount]);

  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      if (replayTimer.current) clearTimeout(replayTimer.current);
      replayTimer.current = setTimeout(() => {
        void doReplay();
      }, 2000);
    }
    wasConnected.current = isConnected;
  }, [isConnected, doReplay]);

  useEffect(() => {
    const handler = () => void doReplay();
    window.addEventListener('posr-db-reconnect', handler);
    return () => window.removeEventListener('posr-db-reconnect', handler);
  }, [doReplay]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isReplaying) void refreshCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [isReplaying, refreshCount]);

  return {
    pendingCount,
    isReplaying,
    lastReplayResult,
    replayNow: doReplay,
  };
}
