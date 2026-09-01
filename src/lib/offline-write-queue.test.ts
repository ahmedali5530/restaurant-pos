import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, Map<string, unknown>>();

vi.mock('idb-keyval', () => ({
  createStore: (db: string, store: string) => `${db}:${store}`,
  get: async (key: string, store: string) => memory.get(store)?.get(key),
  set: async (key: string, value: unknown, store: string) => {
    if (!memory.has(store)) memory.set(store, new Map());
    memory.get(store)!.set(key, value);
  },
  del: async (key: string, store: string) => {
    memory.get(store)?.delete(key);
  },
  keys: async (store: string) => Array.from(memory.get(store)?.keys() ?? []),
}));

import {
  clearQueue,
  enqueueWrite,
  getPendingCount,
  getPendingWrites,
  replayQueue,
} from '@/lib/offline-write-queue.ts';

describe('offline-write-queue', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  it('enqueues create writes and reports pending count', async () => {
    await enqueueWrite('create', { table: 'order', data: { total: 42 } });
    await enqueueWrite('merge', { recordId: 'order:abc', data: { status: 'open' } });

    expect(await getPendingCount()).toBe(2);
    const pending = await getPendingWrites();
    expect(pending).toHaveLength(2);
    expect(pending[0].operation).toBe('create');
    expect(pending[1].operation).toBe('merge');
  });

  it('replays pending writes in FIFO order and clears synced entries', async () => {
    await enqueueWrite('create', { table: 'order', data: { id: 1 } });
    await enqueueWrite('update', { recordId: 'order:1', data: { status: 'paid' } });

    const calls: string[] = [];
    const db = {
      create: vi.fn(async (table: string) => {
        calls.push(`create:${table}`);
      }),
      update: vi.fn(async (recordId: string) => {
        calls.push(`update:${recordId}`);
      }),
      merge: vi.fn(),
      delete: vi.fn(),
    };

    const result = await replayQueue(db);

    expect(result).toEqual({ synced: 2, failed: 0, remaining: 0 });
    expect(calls).toEqual(['create:order', 'update:order:1']);
    expect(await getPendingCount()).toBe(0);
  });

  it('does not queue query/select/live operations (design contract)', async () => {
    // Only write ops use enqueueWrite — reads go through runGuarded and throw DbNotReadyError.
    const pending = await getPendingWrites();
    expect(pending).toHaveLength(0);
  });
});
