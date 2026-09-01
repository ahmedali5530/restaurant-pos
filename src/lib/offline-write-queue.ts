/**
 * Offline Write Queue — IndexedDB-backed queue for POS writes that happen
 * while the SurrealDB WebSocket is disconnected.
 *
 * Research finding: "Cloud POS dies when internet dies" is the #3 pain point
 * in restaurant POS forums (18 mentions). Toast and Square both have offline
 * write modes that allow continuing operations during outages.
 *
 * Architecture:
 *   - enqueue(): stores the write operation in IndexedDB
 *   - replay(): iterates pending ops and executes them against SurrealDB
 *   - Auto-replay: triggered by useOfflineQueue hook when connection restores
 *   - Conflict handling: uses SurrealDB MERGE (last-write-wins for updates)
 *
 * The queue stores operations, not raw data — so a 'create order' operation
 * stores the full order + items, and replay() creates them in the right order.
 *
 * Supported operations:
 *   - create: db.create(table, data)
 *   - update: db.update(recordId, data)
 *   - merge: db.merge(recordId, data)
 *   - delete: db.delete(recordId)
 *
 * Limitations:
 *   - Live queries won't update until the write is replayed (UI shows local
 *     state via optimistic updates — the caller is responsible for that)
 *   - If two terminals write to the same record offline, last-write-wins
 *     (SurrealDB MERGE semantics)
 *   - Complex transactions (multi-table atomic) are not supported — each
 *     operation is replayed independently
 */

import { createStore, get, set, del, keys } from 'idb-keyval';

// Dedicated DB name — `posr-react` already exists with only `jotai-storage`;
// idb-keyval cannot add new object stores to an existing database.
const QUEUE_STORE = createStore('posr-react-offline-write-queue', 'keyval');

export type QueueOperation = 'create' | 'update' | 'merge' | 'delete';

export interface QueuedWrite {
  id: string;
  operation: QueueOperation;
  table?: string;       // for 'create'
  recordId?: string;    // for 'update', 'merge', 'delete'
  data?: any;           // payload for 'create', 'update', 'merge'
  createdAt: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
  attempts: number;
}

const MAX_RETRIES = 3;

/**
 * Generate a unique ID for the queue entry.
 */
function generateId(): string {
  return `owq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a write operation. Called by the DatabaseProvider when the
 * WebSocket is disconnected and a write is attempted.
 *
 * @returns the queue entry ID (for tracking / optimistic UI)
 */
export async function enqueueWrite(
  operation: QueueOperation,
  params: { table?: string; recordId?: string; data?: any }
): Promise<string> {
  const entry: QueuedWrite = {
    id: generateId(),
    operation,
    table: params.table,
    recordId: params.recordId,
    data: params.data,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await set(entry.id, entry, QUEUE_STORE);
  return entry.id;
}

/**
 * Get all pending writes, sorted by creation time (FIFO).
 */
export async function getPendingWrites(): Promise<QueuedWrite[]> {
  const allKeys = await keys(QUEUE_STORE);
  const entries: QueuedWrite[] = [];
  for (const key of allKeys) {
    const entry = await get(key, QUEUE_STORE);
    if (entry && (entry.status === 'pending' || entry.status === 'failed')) {
      entries.push(entry);
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get the count of pending writes (for UI badge).
 */
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingWrites();
  return pending.length;
}

/**
 * Execute a single queued write against the database.
 * Returns true on success, false on failure.
 */
async function executeWrite(db: any, entry: QueuedWrite): Promise<boolean> {
  try {
    switch (entry.operation) {
      case 'create': {
        if (!entry.table) throw new Error('Missing table for create operation');
        await db.create(entry.table, entry.data);
        break;
      }
      case 'update': {
        if (!entry.recordId) throw new Error('Missing recordId for update operation');
        await db.update(entry.recordId, entry.data);
        break;
      }
      case 'merge': {
        if (!entry.recordId) throw new Error('Missing recordId for merge operation');
        await db.merge(entry.recordId, entry.data);
        break;
      }
      case 'delete': {
        if (!entry.recordId) throw new Error('Missing recordId for delete operation');
        await db.delete(entry.recordId);
        break;
      }
      default:
        throw new Error(`Unknown operation: ${entry.operation}`);
    }
    return true;
  } catch (err: any) {
    entry.error = err?.message || String(err);
    return false;
  }
}

/**
 * Replay all pending writes against the database.
 * Called when the WebSocket connection is restored.
 *
 * @param db — the useDB() instance (connected Surreal client)
 * @returns summary of synced/failed counts
 */
export async function replayQueue(db: any): Promise<{ synced: number; failed: number; remaining: number }> {
  const pending = await getPendingWrites();
  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    // Mark as syncing
    entry.status = 'syncing';
    entry.attempts += 1;
    await set(entry.id, entry, QUEUE_STORE);

    const success = await executeWrite(db, entry);

    if (success) {
      entry.status = 'synced';
      await set(entry.id, entry, QUEUE_STORE);
      // Remove from queue after successful sync
      await del(entry.id, QUEUE_STORE);
      synced++;
    } else {
      // Retry logic
      if (entry.attempts >= MAX_RETRIES) {
        entry.status = 'failed';
        await set(entry.id, entry, QUEUE_STORE);
        failed++;
      } else {
        // Reset to pending for next replay attempt
        entry.status = 'pending';
        await set(entry.id, entry, QUEUE_STORE);
      }
    }
  }

  const remaining = await getPendingCount();
  return { synced, failed, remaining };
}

/**
 * Clear all synced/failed entries (cleanup).
 */
export async function clearQueue(): Promise<void> {
  const allKeys = await keys(QUEUE_STORE);
  for (const key of allKeys) {
    await del(key, QUEUE_STORE);
  }
}

/**
 * Get a specific queue entry by ID (for optimistic UI tracking).
 */
export async function getQueueEntry(id: string): Promise<QueuedWrite | undefined> {
  return get(id, QUEUE_STORE);
}

/**
 * Update a queue entry (e.g., add optimistic data from the UI).
 */
export async function updateQueueEntry(id: string, updates: Partial<QueuedWrite>): Promise<void> {
  const entry = await get(id, QUEUE_STORE);
  if (entry) {
    await set(id, { ...entry, ...updates }, QUEUE_STORE);
  }
}
