import { Order } from '@/api/model/order.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import {
  FiscalSettlementResult,
  shouldBlockSettlementForFiscal,
  submitFiscalInvoices,
} from '@/integrations/providers/fiscal/submit-fiscal-invoice.ts';
import { getIntegrationProviderConfig } from '@/integrations/configuration/configuration-store.ts';
import { ORDER_PAYMENT_FETCHES, parseOrderQueryResult } from '@/api/model/order.ts';
import {
  findCompletedFiscalSubmission,
  persistFiscalSubmissionsForOrder,
  resolveFiscalQrcodeForPrint,
  resolveFiscalQrcodesForPrint,
} from '@/integrations/storage/order-fiscal-repository.ts';
import {
  attachFiscalReceiptLogos,
  FiscalQrPrintItem,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { toRecordId } from '@/lib/utils.ts';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import { getPosStoreDatabase } from '@/infrastructure/pos-store/db.ts';
import { terminalSyncService } from '@/infrastructure/sync/sync-service.ts';
import type { DomainOperation } from '@/infrastructure/pos-store/types.ts';

type DbLike = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: unknown, data: Record<string, unknown>) => Promise<unknown>;
};

const withReceiptLogos = async (
  db: DbLike,
  items: FiscalQrPrintItem[]
): Promise<FiscalQrPrintItem[]> => {
  return attachFiscalReceiptLogos(items, (providerId) =>
    getIntegrationProviderConfig(db, providerId)
  );
};

const asRecordArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [value as T];
};

const recordKey = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: unknown }).id ?? '');
  }
  return String(value);
};

/** True when an outbox op still needs to push this order's lines / header. */
export const isOutboxRelatedToOrder = (
  operation: DomainOperation | undefined,
  orderId: string,
): boolean => {
  if (!operation) return false;
  const key = String(toRecordId(orderId));
  if (String(operation.aggregateId) === key) return true;

  const payload = (operation.payload ?? {}) as Record<string, unknown>;
  if (recordKey(payload.orderId) === key || recordKey(payload.recordId) === key) {
    return true;
  }

  const childItems = asRecordArray<Record<string, unknown>>(payload.items);
  if (childItems.some((item) => recordKey(item?.order) === key)) {
    return true;
  }

  return false;
};

const countPendingOutboxForOrder = async (orderId: string): Promise<number> => {
  const pending = await posStore.getPendingOutbox();
  return pending.filter((row) => isOutboxRelatedToOrder(row.operation, orderId)).length;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Force-drain Dexie→Surreal outbox ops for this order so pre-settle fiscal
 * reads the latest items (addons included) from Surreal.
 */
export const ensureOrderSyncedForFiscal = async (
  orderId: string,
  options?: { maxPasses?: number },
): Promise<{ ok: boolean; pendingRelated: number }> => {
  const key = String(toRecordId(orderId));
  const maxPasses = options?.maxPasses ?? 4;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const pendingRelated = await countPendingOutboxForOrder(key);
    await terminalSyncService.synchronize({ force: true }).catch(() => undefined);
    if (pendingRelated === 0) {
      // One more pass after a quiet outbox catches gateway append / pull catch-up.
      if (pass === 0) {
        await sleep(100);
        await terminalSyncService.synchronize({ force: true }).catch(() => undefined);
      }
      return { ok: true, pendingRelated: 0 };
    }
    await sleep(150);
  }

  const pendingRelated = await countPendingOutboxForOrder(key);
  return { ok: pendingRelated === 0, pendingRelated };
};

/** Local active item ids that are still missing from a Surreal fiscal snapshot. */
export const listMissingLocalFiscalItemIds = async (
  orderId: string,
  surrealOrder: Order | undefined,
): Promise<string[]> => {
  if (!surrealOrder) return [];
  const key = String(toRecordId(orderId));
  const local = (await getPosStoreDatabase().orderItems.where('order').equals(key).toArray()).filter(
    (item) => !item.deleted_at && item.is_refunded !== true && item.is_suspended !== true,
  );
  const remoteIds = new Set(
    asRecordArray<unknown>(surrealOrder.items)
      .map((item) => recordKey(item))
      .filter(Boolean),
  );
  return local.map((item) => String(item.id)).filter((id) => !remoteIds.has(id));
};

/**
 * Load order for fiscal from Surreal. Prefers `order_item WHERE order = …`
 * over `order.items` FETCH alone so gateway append lag cannot drop addons.
 */
export const loadOrderForFiscal = async (db: DbLike, orderId: string): Promise<Order | undefined> => {
  const orderRecordId = String(toRecordId(orderId));
  const fetches = ORDER_PAYMENT_FETCHES.join(', ');
  const result = await db.query(`SELECT * FROM ONLY ${orderRecordId} FETCH ${fetches}`);
  const order = parseOrderQueryResult(result);
  if (!order) return undefined;

  try {
    const [itemRows] = await db.query(
      `SELECT * FROM order_item WHERE order = $order FETCH item, item.categories, taxes, modifiers`,
      { order: orderRecordId },
    );
    const fromTable = asRecordArray<Order['items'][number]>(itemRows).filter((item) => item != null);
    if (fromTable.length > 0) {
      order.items = fromTable;
    }
  } catch (error) {
    console.warn('Fiscal item hydrate via order_item failed; using FETCH items', error);
  }

  return order;
};

export const persistFiscalSettlement = async (
  db: DbLike,
  orderId: unknown,
  result: FiscalSettlementResult
) => {
  const persisted = await persistFiscalSubmissionsForOrder(
    db,
    orderId,
    result.resultsByProvider,
    result.fiscalProviderId
  );

  // Prefer settlement-time qrcodes (already may include logos); re-attach logos so
  // rebuilds after persist still print provider branding.
  const baseQrcodes = (result.qrcodes?.length ? result.qrcodes : persisted.qrcodes) ?? [];
  const qrcodes = await withReceiptLogos(db, baseQrcodes);

  return {
    ...result,
    qrcode: persisted.qrcode ?? result.qrcode ?? qrcodes[0]?.value,
    qrcodes,
    fiscalInvoiceNumber: persisted.qrcode ?? result.fiscalInvoiceNumber ?? qrcodes[0]?.value,
    fiscalProviderId: persisted.selected?.provider_id ?? result.fiscalProviderId,
  } satisfies FiscalSettlementResult;
};

export const runFiscalSettlementForOrder = async (
  manager: IntegrationManager,
  db: DbLike,
  order: Order
): Promise<FiscalSettlementResult> => {
  const getConfig = (providerId: string) => getIntegrationProviderConfig(db, providerId);
  const result = await submitFiscalInvoices(manager, order, { getConfig, db });
  const shouldPersist = Object.values(result.resultsByProvider).some(
    (row) => row.status === 'completed' || row.status === 'failed',
  );
  if (!shouldPersist) {
    return result;
  }
  return persistFiscalSettlement(db, order.id, result);
};

export const fiscalShouldBlockBeforePaid = async (
  manager: IntegrationManager,
  db: DbLike
) => {
  return shouldBlockSettlementForFiscal(manager, (providerId) =>
    getIntegrationProviderConfig(db, providerId)
  );
};

export const getFiscalQrcodesForOrderPrint = async (
  db: DbLike,
  orderId: unknown
): Promise<FiscalQrPrintItem[]> => {
  const items = await resolveFiscalQrcodesForPrint(db, orderId);
  return withReceiptLogos(db, items);
};

export const getFiscalQrcodeForOrderPrint = async (db: DbLike, orderId: unknown) => {
  return resolveFiscalQrcodeForPrint(db, orderId);
};

export type FiscalRetryResult =
  | { skipped: true; reason: 'already_completed' | 'order_not_found' | 'provider_disabled' | 'invoice_pending' }
  | { skipped: false; success: boolean; result: FiscalSettlementResult };

/** True when any completed submission exists for this order+provider. */
export const hasCompletedFiscalSubmission = async (
  db: DbLike,
  orderId: unknown,
  providerId: string
): Promise<boolean> => {
  return Boolean(await findCompletedFiscalSubmission(db, orderId, providerId));
};

/**
 * Manually resubmit a failed fiscal invoice for one order + provider.
 * Skips when that provider already has a completed submission.
 */
export const retryFiscalSubmissionForOrder = async (
  manager: IntegrationManager,
  db: DbLike,
  orderId: unknown,
  providerId: string
): Promise<FiscalRetryResult> => {
  if (!manager.isProviderEnabled(providerId)) {
    return { skipped: true, reason: 'provider_disabled' };
  }

  const orderRecordId = String(toRecordId(orderId));
  const order = await loadOrderForFiscal(db, orderRecordId);
  if (!order) {
    return { skipped: true, reason: 'order_not_found' };
  }

  if (await hasCompletedFiscalSubmission(db, order.id, providerId)) {
    return { skipped: true, reason: 'already_completed' };
  }

  const getConfig = (id: string) => getIntegrationProviderConfig(db, id);
  const result = await submitFiscalInvoices(manager, order, {
    getConfig,
    db,
    providerIds: [providerId],
  });

  if (result.blockedCode === 'INVOICE_PENDING') {
    return { skipped: true, reason: 'invoice_pending' };
  }

  if (Object.keys(result.resultsByProvider).length === 0) {
    return { skipped: true, reason: 'provider_disabled' };
  }

  const persisted = await persistFiscalSettlement(db, order.id, result);
  const providerResult = persisted.resultsByProvider[providerId];
  return {
    skipped: false,
    success: providerResult?.status === 'completed',
    result: persisted,
  };
};
