/**
 * Order lifecycle commands beyond create/append: void, taxes, settle, refund,
 * split, merge, fire. Every command commits to Dexie first and enqueues the
 * domain operations that the gateway replays into SurrealDB (ADR 0001).
 */
import { getPosStoreDatabase } from './db.ts';
import { ensureTerminalIdentity, recordId } from './identity.ts';
import { hydrateOrderForTaxRecompute } from './catalog.ts';
import {
  buildOrderItemRows,
  enqueue,
  notifyWrite,
  nowIso,
  orderKey,
  ownerPatchFor,
  refId,
  requireLocalOrder,
} from './commands.ts';
import { collectOrderTaxRows } from '@/lib/tax-calculator.ts';
import {
  PosStoreError,
  type CreateOrderItemInput,
  type OrderItemKitchenRecord,
  type OrderItemRecord,
  type OrderPaymentRecord,
  type OrderRecord,
  type OrderRefundRecord,
  type OrderTaxRecord,
  type OrderVoidRecord,
} from './types.ts';

type Seed = { order: any; items?: any[] };

const CLOSED_STATUSES = ['Paid', 'Cancelled', 'Merged', 'Refunded', 'Spilt'];

function idPart(id: string): string {
  const raw = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return raw.replace(/[^A-Za-z0-9_]/g, '_');
}

function itemKey(id: string): string {
  return id.includes(':') ? id : `order_item:${id}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function withTag(tags: string[] | undefined, tag: string): string[] {
  return Array.from(new Set([...(tags ?? []), tag]));
}

/** Live (non-voided) item rows for an order from Dexie. */
async function liveItems(orderId: string): Promise<OrderItemRecord[]> {
  const db = getPosStoreDatabase();
  const rows = await db.orderItems.where('order').equals(orderId).toArray();
  return rows.filter((row) => !row.deleted_at && Number(row.quantity ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// Taxes — pure local computation + REPLACE_ORDER_RELATION
// ---------------------------------------------------------------------------

/**
 * Recompute `order_tax` rows for an order from its live items and replace the
 * relation locally + remotely. `extraPatch` lets callers fold status/tags into
 * the same order MERGE (one op instead of two).
 */
export async function recomputeOrderTaxes(
  orderId: string,
  options?: { extraPatch?: Record<string, any>; seed?: Seed; silent?: boolean },
): Promise<{ order: OrderRecord; taxAmount: number; rows: OrderTaxRecord[] }> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(orderId);
  const existing = await requireLocalOrder(key, options?.seed);
  const createdAt = nowIso();

  const hydrated = await hydrateOrderForTaxRecompute(existing);
  const taxRows = hydrated
    ? collectOrderTaxRows(hydrated as any, (hydrated.tax as any) ?? null)
    : [];

  const rows: OrderTaxRecord[] = [];
  let taxAmount = 0;
  for (const { tax, amount } of taxRows) {
    const taxId = refId((tax as any)?.id);
    if (!taxId || amount <= 0) continue;
    const rounded = round2(amount);
    taxAmount += rounded;
    rows.push({
      id: `order_tax:${idPart(key)}_${idPart(taxId)}`,
      order: key,
      tax: taxId,
      amount: rounded,
    });
  }
  taxAmount = round2(taxAmount);

  const next = await db.transaction(
    'rw',
    [db.orders, db.orderTaxes, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);
      const stale = await db.orderTaxes.where('order').equals(key).toArray();
      await db.orderTaxes.bulkDelete(stale.map((row) => row.id));
      if (rows.length) await db.orderTaxes.bulkPut(rows);

      const extraPatch = options?.extraPatch ?? {};
      const patch = {
        ...extraPatch,
        tax_amount: taxAmount,
        // An explicit ownership release in extraPatch (order closed) wins over auto-claim.
        ...('owner_terminal_id' in extraPatch ? {} : (ownerPatch ?? {})),
      };
      const updated: OrderRecord = {
        ...current,
        ...patch,
        order_taxes: rows.map((row) => row.id),
        owner_heartbeat_at: createdAt,
        server_version: current.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(updated);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'REPLACE_ORDER_RELATION',
        expectedVersion: current.server_version,
        payload: {
          table: 'order_tax',
          relation: 'order_taxes',
          orderId: key,
          recordId: key,
          rows,
          data: { ...patch, updated_at: createdAt, owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return updated;
    },
  );
  if (!options?.silent) notifyWrite();
  return { order: next, taxAmount, rows };
}

/**
 * Replace a recomputable relation (`order_discounts` / `extras`) wholesale.
 * Rows carry deterministic ids so replays are idempotent.
 */
export async function replaceOrderRelation(
  orderId: string,
  relation: 'order_discounts' | 'extras',
  rows: Array<Record<string, any>>,
  extraPatch: Record<string, any> = {},
  seed?: Seed,
  options?: { silent?: boolean },
): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(orderId);
  await requireLocalOrder(key, seed);
  const createdAt = nowIso();
  const table = relation === 'order_discounts' ? 'order_discount' : 'order_extras';
  const store = db.childStore(table)!;
  const normalized = rows.map((row, index) => ({
    ...row,
    id: row.id
      ? (String(row.id).includes(':') ? String(row.id) : `${table}:${row.id}`)
      : `${table}:${idPart(key)}_${index}_${Date.now().toString(36)}`,
    order: key,
  }));

  const next = await db.transaction(
    'rw',
    [db.orders, store, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);
      const stale = await store.where('order').equals(key).toArray();
      await store.bulkDelete(stale.map((row) => row.id));
      if (normalized.length) await store.bulkPut(normalized as any[]);
      const patch = { ...extraPatch, ...(ownerPatch ?? {}) };
      const updated: OrderRecord = {
        ...current,
        ...patch,
        [relation]: normalized.map((row) => row.id),
        owner_heartbeat_at: createdAt,
        server_version: current.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(updated);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'REPLACE_ORDER_RELATION',
        expectedVersion: current.server_version,
        payload: {
          table,
          relation,
          orderId: key,
          recordId: key,
          rows: normalized,
          data: { ...patch, updated_at: createdAt, owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return updated;
    },
  );
  if (!options?.silent) notifyWrite();
  return next;
}

// ---------------------------------------------------------------------------
// Void / cancel
// ---------------------------------------------------------------------------

export interface VoidOrderItemsInput {
  orderId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  reason: string;
  comments?: string;
  userId: string | null;
  seed?: Seed;
}

export interface VoidOrderItemsResult {
  order: OrderRecord;
  allVoided: boolean;
  taxAmount: number;
  voids: OrderVoidRecord[];
  /** Item ids that were fully removed (for deletion prints / KDS). */
  removedItemIds: string[];
}

export async function voidOrderItems(input: VoidOrderItemsInput): Promise<VoidOrderItemsResult> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(input.orderId);
  await requireLocalOrder(key, input.seed);
  const createdAt = nowIso();
  const userId = input.userId ? refId(input.userId) : null;
  if (!userId) throw new PosStoreError('INVALID', 'A user is required to void items');

  const voids: OrderVoidRecord[] = [];
  const removedItemIds: string[] = [];

  const allVoided = await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.orderItemKitchens, db.orderVoids, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      ownerPatchFor(current, identity.terminalId);

      for (const line of input.lines) {
        const qty = Number(line.quantity ?? 0);
        if (qty <= 0) continue;
        const id = itemKey(line.itemId);
        const row = await db.orderItems.get(id);
        if (!row || row.deleted_at) continue;

        const itemPatch: Record<string, any> =
          qty >= Number(row.quantity ?? 0)
            ? { deleted_at: createdAt }
            : { quantity: Number(row.quantity) - qty };
        await db.orderItems.put({ ...row, ...itemPatch });
        await enqueue({
          aggregateType: 'order_item',
          aggregateId: id,
          operationType: 'MERGE_RECORD',
          payload: { table: 'order_item', recordId: id, orderId: key, data: itemPatch },
          createdAt,
        });

        if (itemPatch.deleted_at) {
          removedItemIds.push(id);
          // Cancel pending / waiting stages so the KDS drops the line.
          const stages = await db.orderItemKitchens.where('order_item').equals(id).toArray();
          for (const stage of stages) {
            if (stage.status === 'completed' || stage.status === 'cancelled') continue;
            await db.orderItemKitchens.put({ ...stage, status: 'cancelled' });
            await enqueue({
              aggregateType: 'order_item_kitchen',
              aggregateId: stage.id,
              operationType: 'MERGE_RECORD',
              payload: {
                table: 'order_item_kitchen',
                recordId: stage.id,
                data: { status: 'cancelled' },
              },
              createdAt,
            });
          }
        }

        const voidRow: OrderVoidRecord = {
          id: recordId('order_void'),
          order: key,
          items: [id],
          quantity: qty,
          reason: input.reason,
          comments: input.comments || null,
          deleted_by: userId,
          logged_in_user: userId,
          created_at: createdAt,
        };
        await db.orderVoids.put(voidRow);
        voids.push(voidRow);
        await enqueue({
          aggregateType: 'order',
          aggregateId: key,
          operationType: 'CREATE_RECORD',
          payload: { table: 'order_void', recordId: voidRow.id, orderId: key, data: voidRow },
          createdAt,
        });
      }

      const remaining = (await db.orderItems.where('order').equals(key).toArray()).filter(
        (row) => !row.deleted_at && Number(row.quantity ?? 0) > 0,
      );
      return remaining.length === 0;
    },
  );

  const current = await db.orders.get(key);
  const extraPatch: Record<string, any> = allVoided
    ? { status: 'Cancelled', tags: withTag(current?.tags, 'Cancelled'), owner_terminal_id: null }
    : {};
  const { order, taxAmount } = await recomputeOrderTaxes(key, { extraPatch });
  return { order, allVoided, taxAmount, voids, removedItemIds };
}

// ---------------------------------------------------------------------------
// Settle / draft
// ---------------------------------------------------------------------------

export interface SettlePaymentInput {
  id?: string;
  paymentTypeId: string;
  amount: number;
  payable: number;
  comments?: string | null;
}

export interface SettleOrderInput {
  orderId: string;
  payments: SettlePaymentInput[];
  cashierId?: string | null;
  tip?: number;
  tipAmount?: number;
  tipType?: string;
  serviceCharge?: number;
  serviceChargeAmount?: number;
  serviceChargeType?: string;
  notes?: string;
  /** Order-level tax picked at settlement (payment-type tax); `undefined` leaves it untouched. */
  taxId?: string | null;
  discountAmount?: number;
  discountRate?: number | null;
  discountId?: string | null;
  discountManagerId?: string | null;
  extras?: Array<{ id?: string; name: string; value: number }>;
  coupon?: { id?: string; couponId: string; discount: number } | null;
  couponRedemption?: {
    customerId?: string | null;
    userId?: string | null;
    discountAmount: number;
  } | null;
  /** Skip tax recompute (caller already synced taxes). */
  keepTaxes?: boolean;
  /** Skip draft save (payment screen already flushed tip/tax/extras). */
  skipDraft?: boolean;
  /** Suppress intermediate notifyWrite when nested inside settle. */
  silent?: boolean;
  seed?: Seed;
  completedAt?: string;
}

export interface SettleOrderResult {
  order: OrderRecord;
  payments: OrderPaymentRecord[];
}

/**
 * Save non-financial payment-screen progress (tip, service charge, notes,
 * discount, extras, coupon) without settling. `draft_payments` stays local.
 */
export async function saveOrderDraft(
  orderId: string,
  draft: {
    draft_payments?: any[];
    tip?: number;
    tip_amount?: number;
    tip_type?: string;
    service_charge?: number;
    service_charge_amount?: number;
    service_charge_type?: string;
    notes?: string;
    /** Order-level (exclusive) tax id; taxes are recomputed by `recomputeOrderTaxes`. */
    tax?: string | null;
    discount_amount?: number;
    discount_rate?: number | null;
    discount?: string | null;
    discount_manager?: string | null;
    extras?: Array<{ id?: string; name: string; value: number }>;
    coupon?: { id?: string; couponId: string; discount: number } | null;
  },
  seed?: Seed,
  options?: { silent?: boolean },
): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(orderId);
  await requireLocalOrder(key, seed);
  const createdAt = nowIso();
  const { draft_payments, extras, coupon, ...remote } = draft;

  let next = await db.transaction(
    'rw',
    [db.orders, db.orderCoupons, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);
      const remotePatch: Record<string, any> = { ...remote, ...(ownerPatch ?? {}) };

      let couponId: string | null | undefined;
      if (coupon === null) {
        couponId = null;
        const stale = await db.orderCoupons.where('order').equals(key).toArray();
        await db.orderCoupons.bulkDelete(stale.map((row) => row.id));
      } else if (coupon) {
        const row = {
          id: coupon.id
            ? (coupon.id.includes(':') ? coupon.id : `order_coupon:${coupon.id}`)
            : `order_coupon:${idPart(key)}_${idPart(coupon.couponId)}`,
          order: key,
          coupon: coupon.couponId,
          discount: Number(coupon.discount ?? 0),
          created_at: createdAt,
        };
        const stale = await db.orderCoupons.where('order').equals(key).toArray();
        await db.orderCoupons.bulkDelete(stale.map((r) => r.id).filter((id) => id !== row.id));
        await db.orderCoupons.put(row);
        couponId = row.id;
        await enqueue({
          aggregateType: 'order',
          aggregateId: key,
          operationType: 'CREATE_RECORD',
          payload: {
            table: 'order_coupon',
            recordId: row.id,
            orderId: key,
            linkField: 'coupon',
            data: row,
          },
          createdAt,
        });
      }
      if (couponId === null) remotePatch.coupon = null;

      const updated: OrderRecord = {
        ...current,
        ...remotePatch,
        ...(draft_payments !== undefined ? { draft_payments } : {}),
        ...(couponId !== undefined ? { coupon: couponId } : {}),
        owner_heartbeat_at: createdAt,
        server_version: current.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(updated);
      if (Object.keys(remotePatch).length) {
        await enqueue({
          aggregateType: 'order',
          aggregateId: key,
          operationType: 'MERGE_RECORD',
          expectedVersion: current.server_version,
          payload: {
            table: 'order',
            recordId: key,
            data: { ...remotePatch, updated_at: createdAt, owner_heartbeat_at: createdAt },
          },
          createdAt,
        });
      }
      return updated;
    },
  );

  if (extras !== undefined) {
    next = await replaceOrderRelation(
      key,
      'extras',
      extras.map((extra) => ({ ...extra, created_at: createdAt })),
      {},
      undefined,
      { silent: true },
    );
  }
  if (!options?.silent) notifyWrite();
  return next;
}

export async function settleOrder(input: SettleOrderInput): Promise<SettleOrderResult> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(input.orderId);
  await requireLocalOrder(key, input.seed);
  const createdAt = nowIso();
  const completedAt = input.completedAt ? nowIso(input.completedAt) : createdAt;

  const hasRelationDraft =
    input.extras !== undefined || input.coupon !== undefined;
  const draftPatch = {
    ...(input.tip !== undefined ? { tip: input.tip } : {}),
    ...(input.tipAmount !== undefined ? { tip_amount: input.tipAmount } : {}),
    ...(input.tipType !== undefined ? { tip_type: input.tipType } : {}),
    ...(input.serviceCharge !== undefined ? { service_charge: input.serviceCharge } : {}),
    ...(input.serviceChargeAmount !== undefined ? { service_charge_amount: input.serviceChargeAmount } : {}),
    ...(input.serviceChargeType !== undefined ? { service_charge_type: input.serviceChargeType } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.taxId !== undefined ? { tax: input.taxId } : {}),
    ...(input.discountAmount !== undefined ? { discount_amount: input.discountAmount } : {}),
    ...(input.discountRate !== undefined ? { discount_rate: input.discountRate } : {}),
    ...(input.discountId !== undefined ? { discount: input.discountId } : {}),
    ...(input.discountManagerId !== undefined ? { discount_manager: input.discountManagerId } : {}),
    ...(input.extras !== undefined ? { extras: input.extras } : {}),
    ...(input.coupon !== undefined ? { coupon: input.coupon } : {}),
  };

  // Coupon/extras still need dedicated ops; scalars fold into the Paid MERGE below.
  if (!input.skipDraft && hasRelationDraft && Object.keys(draftPatch).length > 0) {
    await saveOrderDraft(key, draftPatch, input.seed, { silent: true });
  }

  // Precompute tax rows outside the write txn (catalog reads), then commit with payments.
  let pendingTaxRows: OrderTaxRecord[] | null = null;
  let pendingTaxAmount = 0;
  if (!input.keepTaxes) {
    const existing = await db.orders.get(key);
    if (existing) {
      const forTax =
        input.taxId !== undefined ? { ...existing, tax: input.taxId } : existing;
      const hydrated = await hydrateOrderForTaxRecompute(forTax);
      const taxRows = collectOrderTaxRows(hydrated as any, (hydrated.tax as any) ?? null);
      pendingTaxRows = [];
      for (const { tax, amount } of taxRows) {
        const taxId = refId((tax as any)?.id);
        if (!taxId || amount <= 0) continue;
        const rounded = round2(amount);
        pendingTaxAmount += rounded;
        pendingTaxRows.push({
          id: `order_tax:${idPart(key)}_${idPart(taxId)}`,
          order: key,
          tax: taxId,
          amount: rounded,
        });
      }
      pendingTaxAmount = round2(pendingTaxAmount);
    }
  }

  const inlineDraft =
    !input.skipDraft && !hasRelationDraft
      ? {
          ...(input.tip !== undefined ? { tip: input.tip } : {}),
          ...(input.tipAmount !== undefined ? { tip_amount: input.tipAmount } : {}),
          ...(input.tipType !== undefined ? { tip_type: input.tipType } : {}),
          ...(input.serviceCharge !== undefined ? { service_charge: input.serviceCharge } : {}),
          ...(input.serviceChargeAmount !== undefined
            ? { service_charge_amount: input.serviceChargeAmount }
            : {}),
          ...(input.serviceChargeType !== undefined
            ? { service_charge_type: input.serviceChargeType }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.taxId !== undefined ? { tax: input.taxId } : {}),
          ...(input.discountAmount !== undefined ? { discount_amount: input.discountAmount } : {}),
          ...(input.discountRate !== undefined ? { discount_rate: input.discountRate } : {}),
          ...(input.discountId !== undefined ? { discount: input.discountId } : {}),
          ...(input.discountManagerId !== undefined
            ? { discount_manager: input.discountManagerId }
            : {}),
        }
      : {};

  const payments: OrderPaymentRecord[] = [];
  const order = await db.transaction(
    'rw',
    [
      db.orders,
      db.orderPayments,
      db.orderTaxes,
      db.orderCoupons,
      db.couponRedemptions,
      db.domainOperations,
      db.syncOutbox,
      db.identity,
    ],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);
      if (CLOSED_STATUSES.includes(String(current.status))) {
        throw new PosStoreError('ALREADY_CLOSED', `Order ${key} is already ${current.status}`);
      }

      let expectedVersion = current.server_version;
      let working: OrderRecord = { ...current, ...(ownerPatch ?? {}) };

      if (pendingTaxRows) {
        const stale = await db.orderTaxes.where('order').equals(key).toArray();
        await db.orderTaxes.bulkDelete(stale.map((row) => row.id));
        if (pendingTaxRows.length) await db.orderTaxes.bulkPut(pendingTaxRows);
        const taxPatch = {
          tax_amount: pendingTaxAmount,
          ...(ownerPatch ?? {}),
        };
        working = {
          ...working,
          ...taxPatch,
          order_taxes: pendingTaxRows.map((row) => row.id),
          owner_heartbeat_at: createdAt,
          server_version: expectedVersion + 1,
          updated_at: createdAt,
        };
        await db.orders.put(working);
        await enqueue({
          aggregateType: 'order',
          aggregateId: key,
          operationType: 'REPLACE_ORDER_RELATION',
          expectedVersion,
          payload: {
            table: 'order_tax',
            relation: 'order_taxes',
            orderId: key,
            recordId: key,
            rows: pendingTaxRows,
            data: { ...taxPatch, updated_at: createdAt, owner_heartbeat_at: createdAt },
          },
          createdAt,
        });
        expectedVersion += 1;
      }

      const paymentIds = [...(working.payments ?? [])];
      for (const payment of input.payments) {
        if (!(Number(payment.amount) > 0)) continue;
        const row: OrderPaymentRecord = {
          id: recordId('order_payment', payment.id),
          order: key,
          amount: Number(payment.amount),
          payable: Number(payment.payable ?? payment.amount),
          payment_type: payment.paymentTypeId,
          comments: payment.comments ?? null,
          created_at: createdAt,
        };
        await db.orderPayments.put(row);
        payments.push(row);
        if (!paymentIds.includes(row.id)) paymentIds.push(row.id);
        await enqueue({
          aggregateType: 'order',
          aggregateId: key,
          operationType: 'CREATE_PAYMENT',
          expectedVersion,
          payload: { table: 'order_payment', recordId: row.id, orderId: key, data: row },
          createdAt,
        });
        expectedVersion += 1;
      }

      if (input.couponRedemption && working.coupon) {
        const couponRow = await db.orderCoupons.get(working.coupon);
        const redemption = {
          id: recordId('coupon_redemption'),
          order: key,
          coupon: couponRow?.coupon ?? null,
          customer: input.couponRedemption.customerId ?? working.customer ?? null,
          user: input.couponRedemption.userId ?? input.cashierId ?? null,
          discount_amount: Number(input.couponRedemption.discountAmount ?? 0),
          redeemed_at: createdAt,
        };
        if (redemption.coupon) {
          await db.couponRedemptions.put(redemption as any);
          await enqueue({
            aggregateType: 'coupon_redemption',
            aggregateId: redemption.id,
            operationType: 'CREATE_RECORD',
            payload: { table: 'coupon_redemption', recordId: redemption.id, data: redemption },
            createdAt,
          });
        }
      }

      void ownerPatch;
      const patch: Record<string, any> = {
        ...inlineDraft,
        status: 'Paid',
        completed_at: completedAt,
        cashier: input.cashierId ?? working.cashier ?? working.user ?? null,
        tags: withTag(working.tags, 'Paid'),
        owner_terminal_id: null,
      };
      const updated: OrderRecord = {
        ...working,
        ...patch,
        payments: paymentIds,
        draft_payments: undefined,
        owner_heartbeat_at: createdAt,
        server_version: expectedVersion + 1,
        updated_at: createdAt,
      };
      delete (updated as any).draft_payments;
      await db.orders.put(updated);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion,
        payload: {
          table: 'order',
          recordId: key,
          data: { ...patch, updated_at: createdAt, owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return updated;
    },
  );
  notifyWrite();
  return { order, payments };
}

/** Mirror a status change (e.g. Cancelled from a manager screen) with tags. */
export async function setOrderStatus(
  orderId: string,
  status: string,
  options?: { tags?: string[]; seed?: Seed; extra?: Record<string, any> },
): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(orderId);
  await requireLocalOrder(key, options?.seed);
  const createdAt = nowIso();
  const next = await db.transaction(
    'rw',
    [db.orders, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);
      const patch = {
        status,
        tags: options?.tags ?? withTag(current.tags, status),
        ...(options?.extra ?? {}),
        ...(ownerPatch ?? {}),
      };
      const updated: OrderRecord = {
        ...current,
        ...patch,
        owner_heartbeat_at: createdAt,
        server_version: current.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(updated);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion: current.server_version,
        payload: {
          table: 'order',
          recordId: key,
          data: { ...patch, updated_at: createdAt, owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return updated;
    },
  );
  notifyWrite();
  return next;
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export interface RefundOrderInput {
  orderId: string;
  itemIds: string[];
  reason?: string | null;
  userId: string;
  managerId?: string | null;
  seed?: Seed;
}

export async function refundOrder(input: RefundOrderInput): Promise<{
  order: OrderRecord;
  refund: OrderRefundRecord;
  fullRefund: boolean;
}> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(input.orderId);
  await requireLocalOrder(key, input.seed);
  const createdAt = nowIso();
  const userId = refId(input.userId);
  if (!userId) throw new PosStoreError('INVALID', 'A user is required to refund');
  const itemIds = input.itemIds.map(itemKey);

  const result = await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.orderRefunds, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(current, identity.terminalId);

      const refund: OrderRefundRecord = {
        id: recordId('order_refund'),
        order: key,
        items: itemIds,
        reason: input.reason ?? null,
        logged_in_user: userId,
        manager: input.managerId ? refId(input.managerId) : null,
        created_at: createdAt,
      };
      await db.orderRefunds.put(refund);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'CREATE_RECORD',
        payload: { table: 'order_refund', recordId: refund.id, orderId: key, data: refund },
        createdAt,
      });

      for (const id of itemIds) {
        const row = await db.orderItems.get(id);
        if (!row) continue;
        await db.orderItems.put({ ...row, is_refunded: true } as OrderItemRecord);
        await enqueue({
          aggregateType: 'order_item',
          aggregateId: id,
          operationType: 'MERGE_RECORD',
          payload: { table: 'order_item', recordId: id, orderId: key, data: { is_refunded: true } },
          createdAt,
        });
      }

      const live = (await db.orderItems.where('order').equals(key).toArray()).filter(
        (row) => !row.deleted_at && Number(row.quantity ?? 0) > 0,
      );
      const fullRefund = live.length > 0 && live.every((row) => (row as any).is_refunded);
      const patch: Record<string, any> = {
        tags: withTag(current.tags, 'Refunded'),
        ...(fullRefund ? { status: 'Refunded' } : {}),
        ...(ownerPatch ?? {}),
      };
      const updated: OrderRecord = {
        ...current,
        ...patch,
        owner_heartbeat_at: createdAt,
        server_version: current.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(updated);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion: current.server_version,
        payload: {
          table: 'order',
          recordId: key,
          data: { ...patch, updated_at: createdAt, owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return { order: updated, refund, fullRefund };
    },
  );
  notifyWrite();
  return result;
}

// ---------------------------------------------------------------------------
// Split / merge
// ---------------------------------------------------------------------------

export interface SplitGroup {
  /** Existing item ids to move into the child (items / seats mode). */
  itemIds?: string[];
  /** Seat number the moved items get (seats mode). */
  seat?: string | null;
  /** Fresh lines to create on the child (amount mode clones). */
  newItems?: CreateOrderItemInput[];
  invoiceNumber: number;
  autoId?: number;
  /** Extra order fields for the child (e.g. tags). */
  order?: Record<string, any>;
}

export interface SplitOrderInput {
  parentId: string;
  mode: 'items' | 'seats' | 'amount';
  groups: SplitGroup[];
  userId: string;
  seed?: Seed;
  /** When set the parent keeps these items and stays open (partial split). */
  parentKeepsRemaining?: boolean;
}

export async function splitOrder(input: SplitOrderInput): Promise<{
  parent: OrderRecord;
  children: OrderRecord[];
}> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(input.parentId);
  await requireLocalOrder(key, input.seed);
  const createdAt = nowIso();
  const userId = refId(input.userId);
  if (!userId) throw new PosStoreError('INVALID', 'A user is required to split');

  const result = await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.orderItemKitchens, db.orderSplits, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const parent = await db.orders.get(key);
      if (!parent) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      ownerPatchFor(parent, identity.terminalId);

      const children: OrderRecord[] = [];
      const movedIds = new Set<string>();
      const oldItems = await db.orderItems.where('order').equals(key).toArray();

      for (const [index, group] of input.groups.entries()) {
        const childId = recordId('order');
        const childItemIds: string[] = [];
        const clonedItems: OrderItemRecord[] = [];
        const clonedKitchens: OrderItemKitchenRecord[] = [];

        for (const rawId of group.itemIds ?? []) {
          const id = itemKey(rawId);
          const row = await db.orderItems.get(id);
          if (!row) continue;
          const patch: Record<string, any> = {
            order: childId,
            ...(group.seat !== undefined ? { seat: group.seat } : {}),
          };
          await db.orderItems.put({ ...row, ...patch });
          movedIds.add(id);
          childItemIds.push(id);
          await enqueue({
            aggregateType: 'order_item',
            aggregateId: id,
            operationType: 'MERGE_RECORD',
            payload: { table: 'order_item', recordId: id, orderId: key, data: patch },
            createdAt,
          });
        }

        (group.newItems ?? []).forEach((line, position) => {
          const built = buildOrderItemRows(childId, line, position, createdAt, false);
          clonedItems.push(built.item);
          clonedKitchens.push(...built.kitchens);
          childItemIds.push(built.item.id);
        });

        const child: OrderRecord = {
          ...parent,
          ...(group.order ?? {}),
          id: childId,
          status: 'In Progress',
          invoice_number: group.invoiceNumber,
          auto_id: group.autoId,
          items: childItemIds,
          split: index + 1,
          tags: withTag(parent.tags, 'Spilt'),
          payments: [],
          order_taxes: [],
          order_discounts: [],
          extras: [],
          coupon: null,
          tax_amount: 0,
          discount_amount: 0,
          created_at: createdAt,
          updated_at: createdAt,
          completed_at: null,
          deleted_at: null,
          owner_terminal_id: identity.terminalId,
          owner_heartbeat_at: createdAt,
          server_version: 1,
        };
        delete (child as any).draft_payments;
        await db.orders.put(child);
        if (clonedItems.length) await db.orderItems.bulkPut(clonedItems);
        if (clonedKitchens.length) await db.orderItemKitchens.bulkPut(clonedKitchens);
        children.push(child);
        await enqueue({
          aggregateType: 'order',
          aggregateId: childId,
          operationType: 'CREATE_RECORD',
          expectedVersion: 0,
          payload: {
            table: 'order',
            recordId: childId,
            // Moved items are linked explicitly; clones travel as children.
            data: { ...child, items: childItemIds },
            items: clonedItems,
            kitchens: clonedKitchens,
          },
          createdAt,
        });
      }

      const remainingIds = (parent.items ?? []).filter((id) => !movedIds.has(String(id)));
      const parentClosed = !input.parentKeepsRemaining || remainingIds.length === 0;
      const parentPatch: Record<string, any> = parentClosed
        ? { status: 'Spilt', tags: withTag(parent.tags, 'Spilt'), items: [] }
        : { items: remainingIds };
      const nextParent: OrderRecord = {
        ...parent,
        ...parentPatch,
        owner_heartbeat_at: createdAt,
        server_version: parent.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(nextParent);
      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion: parent.server_version,
        payload: {
          table: 'order',
          recordId: key,
          data: { ...parentPatch, updated_at: createdAt, owner_heartbeat_at: createdAt },
          // Gateway strips `items` from MERGE; a closed parent must still drop its links.
          replaceItems: parentClosed ? [] : undefined,
        },
        createdAt,
      });

      const audit = {
        id: recordId('order_split'),
        order: key,
        old_order: key,
        new_orders: children.map((child) => child.id),
        old_items: oldItems.map((row) => row.id),
        new_items: children.map((child) => child.items),
        created_by: userId,
        created_at: createdAt,
      };
      await db.orderSplits.put(audit as any);
      await enqueue({
        aggregateType: 'order_split',
        aggregateId: audit.id,
        operationType: 'CREATE_RECORD',
        payload: { table: 'order_split', recordId: audit.id, data: audit },
        createdAt,
      });

      return { parent: nextParent, children };
    },
  );
  notifyWrite();
  return result;
}

export interface MergeOrdersInput {
  sourceIds: string[];
  invoiceNumber: number;
  autoId?: number;
  userId: string;
  /** Meta for the merged order (table, floor, order_type, covers, customer). */
  target: Record<string, any>;
  seeds?: Seed[];
}

export async function mergeOrders(input: MergeOrdersInput): Promise<{
  merged: OrderRecord;
  sources: OrderRecord[];
}> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();
  const userId = refId(input.userId);
  if (!userId) throw new PosStoreError('INVALID', 'A user is required to merge');
  const keys = input.sourceIds.map(orderKey);
  for (const [index, key] of keys.entries()) {
    await requireLocalOrder(key, input.seeds?.[index]);
  }

  const result = await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.orderMerges, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const sources: OrderRecord[] = [];
      for (const key of keys) {
        const source = await db.orders.get(key);
        if (!source) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
        ownerPatchFor(source, identity.terminalId);
        sources.push(source);
      }
      const first = sources[0];
      const mergedId = recordId('order');
      const movedIds: string[] = [];
      const oldItems: string[][] = [];

      for (const source of sources) {
        const rows = await db.orderItems.where('order').equals(source.id).toArray();
        oldItems.push(rows.map((row) => row.id));
        for (const row of rows) {
          await db.orderItems.put({ ...row, order: mergedId });
          movedIds.push(row.id);
          await enqueue({
            aggregateType: 'order_item',
            aggregateId: row.id,
            operationType: 'MERGE_RECORD',
            payload: {
              table: 'order_item',
              recordId: row.id,
              orderId: source.id,
              data: { order: mergedId },
            },
            createdAt,
          });
        }
      }

      const merged: OrderRecord = {
        ...first,
        ...input.target,
        id: mergedId,
        status: 'In Progress',
        invoice_number: input.invoiceNumber,
        auto_id: input.autoId,
        items: movedIds,
        tags: withTag(first.tags, 'Merged'),
        payments: [],
        order_taxes: [],
        order_discounts: [],
        extras: [],
        coupon: null,
        tax_amount: 0,
        discount_amount: 0,
        split: undefined,
        created_at: createdAt,
        updated_at: createdAt,
        completed_at: null,
        deleted_at: null,
        owner_terminal_id: identity.terminalId,
        owner_heartbeat_at: createdAt,
        server_version: 1,
      };
      delete (merged as any).draft_payments;
      await db.orders.put(merged);
      await enqueue({
        aggregateType: 'order',
        aggregateId: mergedId,
        operationType: 'CREATE_RECORD',
        expectedVersion: 0,
        payload: { table: 'order', recordId: mergedId, data: merged, items: [], kitchens: [] },
        createdAt,
      });

      for (const source of sources) {
        const patch = { status: 'Merged', tags: withTag(source.tags, 'Merged'), items: [] as string[] };
        const next: OrderRecord = {
          ...source,
          ...patch,
          owner_heartbeat_at: createdAt,
          server_version: source.server_version + 1,
          updated_at: createdAt,
        };
        await db.orders.put(next);
        await enqueue({
          aggregateType: 'order',
          aggregateId: source.id,
          operationType: 'MERGE_RECORD',
          expectedVersion: source.server_version,
          payload: {
            table: 'order',
            recordId: source.id,
            data: { status: patch.status, tags: patch.tags, updated_at: createdAt, owner_heartbeat_at: createdAt },
            replaceItems: [],
          },
          createdAt,
        });
      }

      const audit = {
        id: recordId('order_merge'),
        order: mergedId,
        old_orders: sources.map((source) => source.id),
        new_order: mergedId,
        old_items: oldItems,
        new_items: movedIds,
        created_by: userId,
        created_at: createdAt,
      };
      await db.orderMerges.put(audit as any);
      await enqueue({
        aggregateType: 'order_merge',
        aggregateId: audit.id,
        operationType: 'CREATE_RECORD',
        payload: { table: 'order_merge', recordId: audit.id, data: audit },
        createdAt,
      });

      return { merged, sources: sources.map((source) => ({ ...source, status: 'Merged' })) };
    },
  );
  notifyWrite();
  return result;
}

// ---------------------------------------------------------------------------
// Kitchen: fire held items, skip / recall stages
// ---------------------------------------------------------------------------

export async function fireOrderItems(input: {
  orderId: string;
  items: Array<{ itemId: string; kitchenStages: CreateOrderItemInput['kitchenStages'] }>;
  seed?: Seed;
}): Promise<{ items: OrderItemRecord[]; kitchens: OrderItemKitchenRecord[] }> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const key = orderKey(input.orderId);
  await requireLocalOrder(key, input.seed);
  const createdAt = nowIso();

  const result = await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const current = await db.orders.get(key);
      if (!current) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      ownerPatchFor(current, identity.terminalId);
      const items: OrderItemRecord[] = [];
      const kitchens: OrderItemKitchenRecord[] = [];
      for (const entry of input.items) {
        const id = itemKey(entry.itemId);
        const row = await db.orderItems.get(id);
        if (!row) continue;
        const stages = entry.kitchenStages ?? [];
        const firstStage = stages[0];
        const itemPatch: Record<string, any> = {
          is_suspended: false,
          ...(firstStage?.workflowId
            ? {
                workflow: firstStage.workflowId,
                workflow_status: 'in_progress',
                current_sequence: firstStage.sequence,
              }
            : {}),
        };
        const nextRow = { ...row, ...itemPatch } as OrderItemRecord;
        await db.orderItems.put(nextRow);
        items.push(nextRow);
        const rows: OrderItemKitchenRecord[] = stages.map((stage) => ({
          id: recordId('order_item_kitchen'),
          kitchen: stage.kitchenId.includes(':') ? stage.kitchenId : `kitchen:${stage.kitchenId}`,
          order_item: id,
          status: stage.status,
          sequence: stage.sequence,
          is_terminal: stage.isTerminal,
          workflow: stage.workflowId ?? null,
          stage: stage.stageId ?? null,
          stage_name: stage.stageName ?? null,
          created_at: createdAt,
          activated_at: stage.status === 'pending' ? createdAt : null,
        }));
        if (rows.length) await db.orderItemKitchens.bulkPut(rows);
        kitchens.push(...rows);
        await enqueue({
          aggregateType: 'order_item',
          aggregateId: id,
          operationType: 'MERGE_RECORD',
          payload: { table: 'order_item', recordId: id, orderId: key, data: itemPatch, kitchens: rows },
          createdAt,
        });
      }
      return { items, kitchens };
    },
  );
  notifyWrite();
  return result;
}

export async function updateKitchenStage(
  kitchenRowId: string,
  patch: Record<string, any>,
): Promise<OrderItemKitchenRecord | null> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const result = await db.transaction(
    'rw',
    [db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const row = await db.orderItemKitchens.get(kitchenRowId);
      if (!row) return null;
      const next = { ...row, ...patch } as OrderItemKitchenRecord;
      await db.orderItemKitchens.put(next);
      await enqueue({
        aggregateType: 'order_item_kitchen',
        aggregateId: kitchenRowId,
        operationType: 'MERGE_RECORD',
        payload: { table: 'order_item_kitchen', recordId: kitchenRowId, data: patch },
        createdAt,
      });
      return next;
    },
  );
  notifyWrite();
  return result;
}

/**
 * KDS "done" for one or more stage rows (local-first).
 *
 * Completion is tracked per user in `completed_by` so one user clearing a dish
 * does not remove it from another user's screen; the first completion also
 * advances the dish through its workflow (next waiting stage → pending,
 * `order_item.current_sequence` / `workflow_status`).
 */
export async function completeKitchenStages(input: {
  kitchenRowIds: string[];
  userId?: string | null;
}): Promise<{ completed: OrderItemKitchenRecord[]; activated: OrderItemKitchenRecord[] }> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const user = input.userId ? refId(input.userId) : null;
  const ids = [...new Set(input.kitchenRowIds.map(String))];
  if (ids.length === 0) return { completed: [], activated: [] };

  const result = await db.transaction(
    'rw',
    [db.orderItemKitchens, db.orderItems, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const completed: OrderItemKitchenRecord[] = [];
      const activated: OrderItemKitchenRecord[] = [];
      const rows = (await db.orderItemKitchens.bulkGet(ids)).filter(
        (row): row is OrderItemKitchenRecord => !!row,
      );

      for (const row of rows) {
        const patch: Record<string, any> = {};
        if (user) {
          const completedBy = ((row as any).completed_by ?? []).map(String);
          if (!completedBy.includes(user)) patch.completed_by = [...completedBy, user];
        }
        const firstCompletion = row.status !== 'completed';
        if (firstCompletion) {
          patch.status = 'completed';
          patch.completed_at = createdAt;
          patch.user = user;
        }
        if (Object.keys(patch).length === 0) continue;
        const next = { ...row, ...patch } as OrderItemKitchenRecord;
        await db.orderItemKitchens.put(next);
        completed.push(next);
        await enqueue({
          aggregateType: 'order_item_kitchen',
          aggregateId: row.id,
          operationType: 'MERGE_RECORD',
          payload: { table: 'order_item_kitchen', recordId: row.id, data: patch },
          createdAt,
        });
        if (!firstCompletion) continue;

        // Advance the workflow: next waiting stage becomes pending.
        const siblings = await db.orderItemKitchens.where('order_item').equals(row.order_item).toArray();
        const waiting = siblings
          .filter((s) => s.status === 'waiting' && Number(s.sequence ?? 0) > Number(row.sequence ?? 0))
          .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))[0];
        if (waiting) {
          const nextStage = { ...waiting, status: 'pending', activated_at: createdAt } as OrderItemKitchenRecord;
          await db.orderItemKitchens.put(nextStage);
          activated.push(nextStage);
          await enqueue({
            aggregateType: 'order_item_kitchen',
            aggregateId: waiting.id,
            operationType: 'MERGE_RECORD',
            payload: {
              table: 'order_item_kitchen',
              recordId: waiting.id,
              data: { status: 'pending', activated_at: createdAt },
            },
            createdAt,
          });
          await patchItemFromKitchen(row.order_item, { current_sequence: Number(waiting.sequence ?? 0) }, createdAt);
        } else if (row.workflow) {
          await patchItemFromKitchen(row.order_item, { workflow_status: 'completed' }, createdAt);
        }
      }
      return { completed, activated };
    },
  );
  if (result.completed.length) notifyWrite();
  return result;
}

/**
 * Kitchen-driven `order_item` patch (workflow progress). Deliberately carries no
 * `orderId` so the gateway does not apply the cashier ownership gate.
 */
async function patchItemFromKitchen(
  orderItemId: string,
  patch: Record<string, any>,
  createdAt: string,
): Promise<void> {
  const db = getPosStoreDatabase();
  const row = await db.orderItems.get(orderItemId);
  if (row) await db.orderItems.put({ ...row, ...patch } as OrderItemRecord);
  await enqueue({
    aggregateType: 'order_item',
    aggregateId: orderItemId,
    operationType: 'MERGE_RECORD',
    payload: { table: 'order_item', recordId: orderItemId, data: patch },
    createdAt,
  });
}

/** Skip a stuck stage and activate the next waiting one (local + outbox). */
export async function skipKitchenStage(input: {
  kitchenRowId: string;
  userId?: string | null;
}): Promise<{ next: OrderItemKitchenRecord | null }> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const row = await db.orderItemKitchens.get(input.kitchenRowId);
  if (!row) throw new PosStoreError('NOT_FOUND', 'Kitchen stage row not found');
  await updateKitchenStage(input.kitchenRowId, {
    status: 'skipped',
    completed_at: createdAt,
    user: input.userId ? refId(input.userId) : null,
  });
  const waiting = (await db.orderItemKitchens.where('order_item').equals(row.order_item).toArray())
    .filter((r) => r.status === 'waiting' && Number(r.sequence ?? 0) > Number(row.sequence ?? 0))
    .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
  const next = waiting[0] ?? null;
  if (next) {
    await updateKitchenStage(next.id, { status: 'pending', activated_at: createdAt });
    await patchItemFromKitchen(row.order_item, { current_sequence: Number(next.sequence ?? 0) }, createdAt);
  } else if (row.workflow) {
    await patchItemFromKitchen(row.order_item, { workflow_status: 'completed' }, createdAt);
  }
  notifyWrite();
  return { next };
}

/** Cancel every non-completed stage row of an item (voids / cancellations). */
export async function cancelItemKitchenStages(orderItemId: string): Promise<OrderItemKitchenRecord[]> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const id = itemKey(orderItemId);
  const result = await db.transaction(
    'rw',
    [db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const rows = await db.orderItemKitchens.where('order_item').equals(id).toArray();
      const changed: OrderItemKitchenRecord[] = [];
      for (const stage of rows) {
        if (stage.status === 'completed' || stage.status === 'cancelled') continue;
        const next = { ...stage, status: 'cancelled' } as OrderItemKitchenRecord;
        await db.orderItemKitchens.put(next);
        await enqueue({
          aggregateType: 'order_item_kitchen',
          aggregateId: stage.id,
          operationType: 'MERGE_RECORD',
          payload: { table: 'order_item_kitchen', recordId: stage.id, data: { status: 'cancelled' } },
          createdAt,
        });
        changed.push(next);
      }
      return changed;
    },
  );
  if (result.length) notifyWrite();
  return result;
}

/** Remove a user from `completed_by` so the row reappears on their KDS. */
export async function recallKitchenStage(input: {
  kitchenRowId: string;
  userId: string;
}): Promise<OrderItemKitchenRecord | null> {
  const db = getPosStoreDatabase();
  const row = await db.orderItemKitchens.get(input.kitchenRowId);
  if (!row) return null;
  const user = refId(input.userId);
  const completedBy = ((row as any).completed_by ?? []).filter((id: unknown) => String(id) !== user);
  return updateKitchenStage(input.kitchenRowId, { completed_by: completedBy });
}

export { liveItems as getLiveOrderItems };
