import { OrderStatus } from '@/api/model/order.ts';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import { getPosStoreDatabase } from '@/infrastructure/pos-store/db.ts';

/**
 * After Surreal split creates child orders, mirror them into PosStore and mark
 * the parent as Spilt so floor/append don't hit NOT_FOUND on split children.
 */
export async function projectSplitIntoPosStore(input: {
  parentOrder: any;
  createdOrders: any[];
}): Promise<void> {
  const parentId = String(input.parentOrder?.id ?? '');
  for (const created of input.createdOrders) {
    try {
      await posStore.ensureLocalOrder({ order: created });
    } catch (error) {
      console.warn('Failed to import split child into PosStore', created?.id, error);
    }
  }

  if (!parentId) return;
  const db = getPosStoreDatabase();
  const existing = await db.orders.get(parentId);
  if (!existing) return;
  const now = new Date().toISOString();
  await db.orders.put({
    ...existing,
    status: OrderStatus.Spilt,
    items: [],
    tags: Array.from(new Set([...(existing.tags || []), OrderStatus.Spilt])),
    updated_at: now,
    server_version: Number(existing.server_version ?? 0) + 1,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('posr-posstore-write'));
    window.dispatchEvent(new CustomEvent('posr-operational-orders-updated'));
  }
}
