import type { useDB } from '@/api/db/db.ts';
import type { Order } from '@/api/model/order.ts';
import type { Tax } from '@/api/model/tax.ts';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import { toRecordId } from '@/lib/utils.ts';

export type DbClient = ReturnType<typeof useDB>;

const isOrderRecord = (value: unknown): value is Order => {
  return typeof value === 'object' && value !== null && Array.isArray((value as Order).items);
};

/**
 * Recompute `order_tax` rows + `order.tax_amount` for an order.
 *
 * Pure local computation over the PosStore projection; the resulting
 * `REPLACE_ORDER_RELATION` drains to SurrealDB through the outbox, so this
 * works identically online and offline. The `db` argument is kept for call-site
 * compatibility and is no longer used for writes.
 *
 * When a hydrated order is passed it is used as the seed for terminals that do
 * not hold the order locally yet (legacy / split children).
 */
export const syncOrderTaxes = async (
  _db: DbClient,
  orderOrId: Order | unknown,
  orderTaxOverride?: Tax | null,
): Promise<number> => {
  const orderId = isOrderRecord(orderOrId)
    ? String(orderOrId.id)
    : String(toRecordId(orderOrId));
  const seed = isOrderRecord(orderOrId) ? { order: orderOrId, items: orderOrId.items } : undefined;
  const extraPatch = orderTaxOverride !== undefined
    ? { tax: orderTaxOverride?.id ? String(orderTaxOverride.id) : null }
    : undefined;
  const { taxAmount } = await posStore.recomputeOrderTaxes(orderId, { extraPatch, seed });
  return taxAmount;
};
