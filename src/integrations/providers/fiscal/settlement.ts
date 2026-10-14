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
  listOrderFiscalSubmissions,
  persistFiscalSubmissionsForOrder,
  resolveFiscalQrcodeForPrint,
  resolveFiscalQrcodesForPrint,
} from '@/integrations/storage/order-fiscal-repository.ts';
import {
  attachFiscalReceiptLogos,
  FiscalQrPrintItem,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { toRecordId } from '@/lib/utils.ts';

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

export const loadOrderForFiscal = async (db: DbLike, orderId: string): Promise<Order | undefined> => {
  const fetches = ORDER_PAYMENT_FETCHES.join(', ');
  const result = await db.query(`SELECT * FROM ONLY ${orderId} FETCH ${fetches}`);
  return parseOrderQueryResult(result);
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
  const result = await submitFiscalInvoices(manager, order, { getConfig });
  if (Object.keys(result.resultsByProvider).length === 0) {
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
  const rows = await listOrderFiscalSubmissions(db, orderId);
  return rows.some(
    (row) =>
      row.provider_id === providerId &&
      row.status === 'completed' &&
      Boolean(row.qrcode || row.invoice_number)
  );
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
