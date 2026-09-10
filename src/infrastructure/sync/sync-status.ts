import type { SyncPhase } from '@/infrastructure/pos-store/types.ts';

export type SyncStatusState = {
  phase: SyncPhase;
  pendingCount: number;
  conflictCount: number;
  /** Pending ops that hit OUTBOX_MAX_ATTEMPTS transport failures (still retried). */
  failedCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
};

type Listener = (state: SyncStatusState) => void;

const listeners = new Set<Listener>();

let state: SyncStatusState = {
  phase: 'idle',
  pendingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  lastError: null,
  lastSyncedAt: null,
};

export function getSyncStatus(): SyncStatusState {
  return state;
}

export function setSyncStatus(patch: Partial<SyncStatusState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener(state);
  }
}

export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
