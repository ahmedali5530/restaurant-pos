import { Order } from '@/api/model/order.ts';
import {
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
} from '@/integrations/core/types.ts';
import { TransportRouter } from '@/integrations/transport/router.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import {
  FiscalConfigLoader,
  FiscalExecutionData,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import {
  kraTenantId,
  parseKraProviderConfig,
  KraProviderConfig,
} from '@/integrations/providers/fiscal/kra/config.ts';
import { callKraApi, isKraSuccess } from '@/integrations/providers/fiscal/kra/client.ts';
import { nextKraCounter, KraCounterDb } from '@/integrations/providers/fiscal/kra/counters.ts';
import { formatKraItemCode } from '@/integrations/providers/fiscal/kra/item-code.ts';
import {
  buildKraReceiptQrUrl,
  serializeKraSalesInvoice,
} from '@/integrations/providers/fiscal/kra/serialize-sales.ts';
import { serializeKraCreditNote } from '@/integrations/providers/fiscal/kra/serialize-credit-note.ts';
import {
  KraStockTyCd,
  serializeKraStockIo,
} from '@/integrations/providers/fiscal/kra/serialize-stock.ts';
import { listOrderFiscalSubmissions } from '@/integrations/storage/order-fiscal-repository.ts';

export const KRA_PROVIDER_ID = 'provider:kra';

export type KraDbClient = KraCounterDb & {
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: unknown, data: Record<string, unknown>) => Promise<unknown>;
};

type DishKraFields = {
  kra_item_cls_cd?: string | null;
  kra_tax_ty_cd?: string | null;
  number?: string | null;
  barcode?: string | null;
};

const recordIdSuffix = (value: unknown): string => {
  const str = value == null ? '' : String(value);
  if (!str) return '';
  return str.includes(':') ? str.split(':').slice(1).join(':') : str;
};

const failed = (
  providerId: string,
  error: string,
  retriable: boolean,
  data?: FiscalExecutionData
): IntegrationExecutionResponse<FiscalExecutionData> => ({
  success: false,
  status: 'failed',
  providerId,
  error,
  retriable,
  data,
});

export const createItemResolver = (
  config: KraProviderConfig,
  mappingByPosrId: Map<string, string>
) => {
  return (item: Order['items'][number]) => {
    const dish = item?.item as DishKraFields | undefined;
    const dishId =
      typeof item?.item === 'object' && item?.item
        ? String((item.item as { id?: unknown }).id ?? '')
        : String(item?.item ?? '');
    const mapped = mappingByPosrId.get(dishId) || mappingByPosrId.get(recordIdSuffix(dishId));
    const fallbackCode =
      mapped ||
      (dish?.number ? String(dish.number).trim() : '') ||
      recordIdSuffix(dishId) ||
      recordIdSuffix(item?.id) ||
      'ITEM';
    return {
      itemCd: String(mapped || fallbackCode).slice(0, 20),
      itemClsCd: String(dish?.kra_item_cls_cd || config.itemClsCd).slice(0, 10),
      taxTyCdOverride: dish?.kra_tax_ty_cd ?? null,
    };
  };
};

export const loadKraItemMappings = async (
  db: KraDbClient,
  config: KraProviderConfig
): Promise<Map<string, string>> => {
  const repo = new EntityMappingRepository(db);
  const rows = await repo.listByProvider(KRA_PROVIDER_ID, kraTenantId(config), 'item');
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.posrId && row.externalId) {
      map.set(String(row.posrId), String(row.externalId));
      map.set(recordIdSuffix(row.posrId), String(row.externalId));
    }
  }
  return map;
};

const parseOriginalInvcNo = (submission: {
  invoice_number?: string | number | null;
  request_payload?: any;
  response_payload?: any;
}): number => {
  const fromRequest = Number(submission.request_payload?.invcNo);
  if (Number.isFinite(fromRequest) && fromRequest > 0) return fromRequest;
  const fromResponse = Number(submission.response_payload?.data?.curRcptNo);
  if (Number.isFinite(fromResponse) && fromResponse > 0) return fromResponse;
  const fromInvoice = Number(submission.invoice_number);
  if (Number.isFinite(fromInvoice) && fromInvoice > 0) return fromInvoice;
  return 0;
};

export const submitKraStockIo = async (
  config: KraProviderConfig,
  db: KraDbClient,
  transport: TransportRouter,
  input: {
    stockTyCd: KraStockTyCd;
    lines: Array<{
      itemCd: string;
      itemClsCd?: string;
      itemNm: string;
      barcode?: string | null;
      qty: number;
      unitPrice?: number;
      taxTyCd?: string;
    }>;
  }
): Promise<{ success: boolean; error?: string; request?: unknown; response?: unknown }> => {
  if (!input.lines.length) return { success: true };
  const sarNo = await nextKraCounter(db, config.tin, config.bhfId, 'sar');
  const payload = serializeKraStockIo(config, {
    sarNo,
    stockTyCd: input.stockTyCd,
    lines: input.lines,
  });
  const result = await callKraApi(config, 'saveStockIo', payload, transport);
  if (!result.ok || !isKraSuccess(result.body)) {
    return {
      success: false,
      error: result.error || result.body.resultMsg || 'KRA stock IO failed',
      request: payload,
      response: result.body,
    };
  }
  return { success: true, request: payload, response: result.body };
};

export const submitKraFiscalRequest = async (
  request: IntegrationExecutionRequest,
  getConfig: FiscalConfigLoader,
  getDb: () => KraDbClient | null,
  transport: TransportRouter = new TransportRouter()
): Promise<IntegrationExecutionResponse<FiscalExecutionData>> => {
  const action = request.action;
  if (action !== 'invoiceSubmission' && action !== 'creditNote' && action !== 'stockIo') {
    return failed(KRA_PROVIDER_ID, `Unsupported action: ${action}`, false);
  }

  const rawConfig = await getConfig();
  const parsed = parseKraProviderConfig(rawConfig);
  if ('error' in parsed) {
    return failed(KRA_PROVIDER_ID, parsed.error, false);
  }

  const db = getDb();
  if (!db) {
    return failed(KRA_PROVIDER_ID, 'Database is not available for KRA fiscal', true);
  }

  if (action === 'stockIo') {
    const stockTyCd = String(request.payload?.stockTyCd ?? '') as KraStockTyCd;
    const lines = (request.payload?.lines as any[]) ?? [];
    const stockResult = await submitKraStockIo(parsed, db, transport, {
      stockTyCd,
      lines,
    });
    if (!stockResult.success) {
      return failed(KRA_PROVIDER_ID, stockResult.error || 'stock IO failed', true, {
        request: stockResult.request,
        response: stockResult.response,
      });
    }
    return {
      success: true,
      status: 'completed',
      providerId: KRA_PROVIDER_ID,
      data: { request: stockResult.request, response: stockResult.response, code: '000' },
    };
  }

  const order = request.payload?.order as Order | undefined;
  if (!order) {
    return failed(KRA_PROVIDER_ID, 'Order payload is required', false);
  }

  const mappings = await loadKraItemMappings(db, parsed);
  const resolveItem = createItemResolver(parsed, mappings);

  if (action === 'creditNote') {
    const itemIds = (request.payload?.itemIds as string[] | undefined) ?? undefined;
    const submissions = await listOrderFiscalSubmissions(db, order.id);
    const completed = submissions.find((row) => {
      if (row.provider_id !== KRA_PROVIDER_ID || row.status !== 'completed') return false;
      const rcptTy = String((row.request_payload as any)?.rcptTyCd ?? 'S');
      return rcptTy === 'S';
    });
    if (!completed) {
      return failed(
        KRA_PROVIDER_ID,
        'No completed KRA sale found for credit note',
        false
      );
    }
    const orgInvcNo = parseOriginalInvcNo(completed);
    if (!orgInvcNo) {
      return failed(KRA_PROVIDER_ID, 'Original KRA invcNo missing on sale submission', false);
    }
    const invcNo = await nextKraCounter(db, parsed.tin, parsed.bhfId, 'invc');
    const payload = serializeKraCreditNote(
      parsed,
      {
        order,
        orgInvcNo,
        invcNo,
        itemIds,
        reasonCode: String(request.payload?.reasonCode ?? '06'),
      },
      resolveItem
    );
    const result = await callKraApi(parsed, 'saveSales', payload, transport);
    if (!result.ok || !isKraSuccess(result.body)) {
      return failed(
        KRA_PROVIDER_ID,
        result.error || result.body.resultMsg || 'KRA credit note rejected',
        true,
        { request: payload, response: result.body, code: result.body.resultCd }
      );
    }

    const data = result.body.data ?? {};
    const curRcptNo = data.curRcptNo != null ? String(data.curRcptNo) : String(invcNo);
    const intrlData = data.intrlData != null ? String(data.intrlData) : '';
    const qrcode = buildKraReceiptQrUrl(parsed.receiptVerifyBaseUrl, intrlData);

    // Return stock for credited lines (best-effort).
    try {
      const stockLines = (payload.itemList ?? []).map((line) => ({
        itemCd: line.itemCd,
        itemClsCd: line.itemClsCd,
        itemNm: line.itemNm,
        qty: line.qty,
        unitPrice: line.prc,
        taxTyCd: line.taxTyCd,
      }));
      await submitKraStockIo(parsed, db, transport, {
        stockTyCd: '03',
        lines: stockLines,
      });
    } catch (err) {
      console.warn('KRA credit-note stock return failed', err);
    }

    return {
      success: true,
      status: 'completed',
      providerId: KRA_PROVIDER_ID,
      requestId: curRcptNo,
      data: {
        invoiceNumber: curRcptNo,
        qrcode: intrlData ? qrcode : curRcptNo,
        code: result.body.resultCd,
        request: payload,
        response: result.body,
      },
    };
  }

  // invoiceSubmission
  if (!order.invoice_number && order.invoice_number !== 0) {
    return failed(KRA_PROVIDER_ID, 'Order invoice_number is required', true);
  }

  const invcNo = await nextKraCounter(db, parsed.tin, parsed.bhfId, 'invc');
  const payload = serializeKraSalesInvoice(order, parsed, invcNo, resolveItem);
  const result = await callKraApi(parsed, 'saveSales', payload, transport);

  if (!result.ok || !isKraSuccess(result.body)) {
    return failed(
      KRA_PROVIDER_ID,
      result.error || result.body.resultMsg || 'KRA sales rejected',
      true,
      { request: payload, response: result.body, code: result.body.resultCd }
    );
  }

  const data = result.body.data ?? {};
  const curRcptNo = data.curRcptNo != null ? String(data.curRcptNo) : String(invcNo);
  const intrlData = data.intrlData != null ? String(data.intrlData) : '';
  const qrcode = buildKraReceiptQrUrl(parsed.receiptVerifyBaseUrl, intrlData);

  // Sale stock out — best-effort; failure does not roll back the fiscal row.
  try {
    const stockLines = (payload.itemList ?? []).map((line) => ({
      itemCd: line.itemCd,
      itemClsCd: line.itemClsCd,
      itemNm: line.itemNm,
      qty: line.qty,
      unitPrice: line.prc,
      taxTyCd: line.taxTyCd,
    }));
    await submitKraStockIo(parsed, db, transport, {
      stockTyCd: '11',
      lines: stockLines,
    });
  } catch (err) {
    console.warn('KRA sale stock IO failed', err);
  }

  return {
    success: true,
    status: 'completed',
    providerId: KRA_PROVIDER_ID,
    requestId: curRcptNo,
    data: {
      invoiceNumber: curRcptNo,
      qrcode: intrlData ? qrcode : curRcptNo,
      code: result.body.resultCd,
      request: payload,
      response: result.body,
    },
  };
};

export const allocateKraItemCode = async (
  db: KraDbClient,
  config: KraProviderConfig
): Promise<string> => {
  const seq = await nextKraCounter(db, config.tin, config.bhfId, 'item');
  return formatKraItemCode({
    itemTyCd: config.itemTyCd,
    pkgUnitCd: config.pkgUnitCd,
    qtyUnitCd: config.qtyUnitCd,
    sequence: seq,
  });
};
