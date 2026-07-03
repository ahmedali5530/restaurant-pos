import { Tables } from '@/api/db/tables.ts';
import type { useDB } from '@/api/db/db.ts';
import type { Order } from '@/api/model/order.ts';
import type { Tax } from '@/api/model/tax.ts';
import { ORDER_PAYMENT_FETCHES, parseOrderQueryResult } from '@/api/model/order.ts';
import { collectOrderTaxRows } from '@/lib/tax-calculator.ts';
import { toRecordId } from '@/lib/utils.ts';

export type DbClient = ReturnType<typeof useDB>;

const roundTax = (value: number) => Math.round(value * 100) / 100;

const isOrderRecord = (value: unknown): value is Order => {
  return typeof value === 'object' && value !== null && Array.isArray((value as Order).items);
};

const loadOrderForTaxSync = async (db: DbClient, orderId: unknown): Promise<Order | undefined> => {
  const id = toRecordId(orderId);
  const fetches = ORDER_PAYMENT_FETCHES.join(', ');
  const onlyResult = await db.query(`SELECT * FROM ONLY ${id} FETCH ${fetches}`);
  const parsed = parseOrderQueryResult(onlyResult);
  if (parsed?.items) {
    return parsed;
  }

  const legacyResult = await db.query(`SELECT * FROM ${id} FETCH ${fetches}`);
  return parseOrderQueryResult(legacyResult);
};

export const syncOrderTaxes = async (
  db: DbClient,
  orderOrId: Order | unknown,
  orderTaxOverride?: Tax | null,
): Promise<void> => {
  const recordId = isOrderRecord(orderOrId) ? toRecordId(orderOrId.id) : toRecordId(orderOrId);
  const order = isOrderRecord(orderOrId)
    ? orderOrId
    : await loadOrderForTaxSync(db, recordId);

  if (!order) {
    return;
  }

  const resolvedOrderTax = orderTaxOverride ?? order.tax ?? null;
  const rows = collectOrderTaxRows(order, resolvedOrderTax);

  const existingResult = await db.query<[Array<{ id: unknown }>]>(
    `SELECT id FROM ${Tables.order_taxes} WHERE order = $orderId`,
    { orderId: recordId },
  );
  const existing = existingResult?.[0] ?? [];
  for (const row of existing) {
    await db.delete(toRecordId(row.id));
  }

  const orderTaxRecordIds: unknown[] = [];
  let totalAmount = 0;

  for (const { tax, amount } of rows) {
    if (amount <= 0 || !tax?.id) {
      continue;
    }

    const created = await db.create(Tables.order_taxes, {
      order: recordId,
      tax: toRecordId(tax.id),
      amount: roundTax(amount),
    });
    const record = Array.isArray(created) ? created[0] : created;
    orderTaxRecordIds.push((record as { id: unknown }).id);
    totalAmount += roundTax(amount);
  }

  await db.merge(recordId, {
    tax_amount: roundTax(totalAmount),
    order_taxes: orderTaxRecordIds,
  });
};
