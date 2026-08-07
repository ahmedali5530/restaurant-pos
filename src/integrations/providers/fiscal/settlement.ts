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
  persistFiscalSubmissionsForOrder,
  resolveFiscalQrcodeForPrint,
  resolveFiscalQrcodesForPrint,
} from '@/integrations/storage/order-fiscal-repository.ts';
import {
  attachFiscalReceiptLogos,
  FiscalQrPrintItem,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';

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
