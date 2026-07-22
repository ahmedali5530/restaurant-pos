import { Tables } from '@/api/db/tables.ts';
import {
  OrderFiscalSubmission,
  OrderFiscalSubmissionStatus,
} from '@/api/model/order_fiscal_submission.ts';
import {
  collectFiscalQrsForPrint,
  FiscalQrPrintItem,
  pickPreferredFiscalQr,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { PROVIDER_CATALOG } from '@/integrations/providers/index.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';
import { toRecordId } from '@/lib/utils.ts';

export type FiscalSubmissionDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: unknown, data: Record<string, unknown>) => Promise<unknown>;
};

export interface CreateOrderFiscalSubmissionInput {
  orderId: unknown;
  providerId: string;
  invoiceNumber?: string;
  qrcode?: string;
  status: OrderFiscalSubmissionStatus;
  code?: number | string;
  error?: string;
  selectedForPrint?: boolean;
  requestPayload?: unknown;
  responsePayload?: unknown;
  qrPriority?: number;
}

export const getFiscalProviderPrintDescription = (providerId: string): string => {
  const factory = PROVIDER_CATALOG[providerId];
  if (!factory) return providerId;
  try {
    const manifest = factory().getManifest();
    return (manifest.authority || manifest.displayName || providerId).trim();
  } catch {
    return providerId;
  }
};

export const listOrderFiscalSubmissions = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown
): Promise<OrderFiscalSubmission[]> => {
  const [rows] = await db.query<OrderFiscalSubmission[]>(
    `SELECT * FROM ${Tables.integration_order_fiscals}
     WHERE order = $orderId
     ORDER BY submitted_at DESC`,
    { orderId: toRecordId(orderId) }
  );
  return rows ?? [];
};

export const createOrderFiscalSubmission = async (
  db: FiscalSubmissionDbClient,
  input: CreateOrderFiscalSubmissionInput
): Promise<OrderFiscalSubmission | undefined> => {
  const qrcode = input.qrcode ?? input.invoiceNumber;
  const created = await db.create(Tables.integration_order_fiscals, {
    order: toRecordId(input.orderId),
    provider_id: input.providerId,
    ...(input.invoiceNumber != null ? { invoice_number: input.invoiceNumber } : {}),
    ...(qrcode != null ? { qrcode } : {}),
    status: input.status,
    ...(input.code != null ? { code: input.code } : {}),
    ...(input.error != null ? { error: input.error } : {}),
    selected_for_print: Boolean(input.selectedForPrint),
    ...(input.requestPayload !== undefined ? { request_payload: input.requestPayload } : {}),
    ...(input.responsePayload !== undefined ? { response_payload: input.responsePayload } : {}),
    qr_priority: input.qrPriority ?? 0,
    submitted_at: nowSurrealDateTime(),
    created_at: nowSurrealDateTime(),
  });

  if (Array.isArray(created)) {
    return created[0] as OrderFiscalSubmission;
  }
  return created as OrderFiscalSubmission;
};

export const clearSelectedFiscalPrintForOrder = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown
) => {
  const rows = await listOrderFiscalSubmissions(db, orderId);
  await Promise.all(
    rows
      .filter((row) => row.selected_for_print && row.id)
      .map((row) => db.merge(row.id, { selected_for_print: false }))
  );
};

export const setFiscalSubmissionSelectedForPrint = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown,
  submissionId: unknown
) => {
  await clearSelectedFiscalPrintForOrder(db, orderId);
  await db.merge(submissionId, { selected_for_print: true });
};

export const pickPreferredFiscalSubmission = (
  rows: OrderFiscalSubmission[]
): OrderFiscalSubmission | undefined => {
  const selected = rows.find((row) => row.selected_for_print && (row.qrcode || row.invoice_number));
  if (selected) return selected;

  const preferred = pickPreferredFiscalQr(
    Object.fromEntries(
      rows.map((row) => [
        row.provider_id,
        {
          success: row.status === 'completed',
          qrcode: row.qrcode ?? undefined,
          invoiceNumber: row.invoice_number ?? undefined,
          qrPriority: row.qr_priority ?? 0,
        },
      ])
    )
  );

  if (!preferred.providerId) return undefined;
  return rows.find((row) => row.provider_id === preferred.providerId && row.status === 'completed');
};

/** Latest completed submission with a QR per provider, then sorted by qr_priority desc. */
export const buildFiscalQrcodesForPrint = (
  rows: OrderFiscalSubmission[]
): FiscalQrPrintItem[] => {
  const byProvider = new Map<string, OrderFiscalSubmission>();

  for (const row of rows) {
    if (row.status !== 'completed') continue;
    if (!(row.qrcode || row.invoice_number)) continue;
    if (byProvider.has(row.provider_id)) continue; // rows are submitted_at DESC
    byProvider.set(row.provider_id, row);
  }

  return collectFiscalQrsForPrint(
    Object.fromEntries(
      [...byProvider.entries()].map(([providerId, row]) => [
        providerId,
        {
          success: true,
          qrcode: row.qrcode ?? undefined,
          invoiceNumber: row.invoice_number ?? undefined,
          qrPriority: row.qr_priority ?? 0,
          description: getFiscalProviderPrintDescription(providerId),
        },
      ])
    )
  );
};

export const resolveFiscalQrcodesForPrint = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown
): Promise<FiscalQrPrintItem[]> => {
  const rows = await listOrderFiscalSubmissions(db, orderId);
  return buildFiscalQrcodesForPrint(rows);
};

export const resolveFiscalQrcodeForPrint = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown
): Promise<string | undefined> => {
  const items = await resolveFiscalQrcodesForPrint(db, orderId);
  return items[0]?.value;
};

export const persistFiscalSubmissionsForOrder = async (
  db: FiscalSubmissionDbClient,
  orderId: unknown,
  resultsByProvider: Record<
    string,
    {
      invoiceNumber?: string;
      code?: number | string;
      status: OrderFiscalSubmissionStatus;
      error?: string;
      requestPayload?: unknown;
      responsePayload?: unknown;
      qrPriority?: number;
    }
  >,
  preferredProviderId?: string
) => {
  const created: OrderFiscalSubmission[] = [];

  for (const [providerId, result] of Object.entries(resultsByProvider)) {
    const row = await createOrderFiscalSubmission(db, {
      orderId,
      providerId,
      invoiceNumber: result.invoiceNumber,
      qrcode: result.invoiceNumber,
      status: result.status,
      code: result.code,
      error: result.error,
      selectedForPrint: false,
      requestPayload: result.requestPayload,
      responsePayload: result.responsePayload,
      qrPriority: result.qrPriority,
    });
    if (row) created.push(row);
  }

  const preferred =
    (preferredProviderId
      ? created.find(
          (row) =>
            row.provider_id === preferredProviderId &&
            row.status === 'completed' &&
            (row.qrcode || row.invoice_number)
        )
      : undefined) ?? pickPreferredFiscalSubmission(created);

  if (preferred?.id) {
    await setFiscalSubmissionSelectedForPrint(db, orderId, preferred.id);
  }

  return {
    created,
    selected: preferred,
    qrcode: preferred?.qrcode ?? preferred?.invoice_number,
    qrcodes: buildFiscalQrcodesForPrint(created),
  };
};
