export type { FiscalExecutionData } from '@/integrations/providers/fiscal/shared/types.ts';

export interface FiscalRuntimeConfig {
  offlineBuffering: boolean;
  requestTimeoutSeconds: number;
  blockSettlementOnFailure: boolean;
  /** Higher prints first when multiple fiscal providers return a QR. */
  qrPriority: number;
}

/** Shared settlement/runtime flags only — no authority-specific credentials. */
export const parseFiscalRuntimeConfig = (
  values: Record<string, unknown> = {}
): FiscalRuntimeConfig => {
  const rawPriority = Number(values.qrPriority);
  return {
    offlineBuffering: values.offlineBuffering !== false,
    requestTimeoutSeconds: Number(values.requestTimeoutSeconds ?? 30) || 30,
    blockSettlementOnFailure: Boolean(values.blockSettlementOnFailure),
    qrPriority: Number.isFinite(rawPriority) ? rawPriority : 0,
  };
};

export type FiscalConfigLoader = () => Promise<Record<string, unknown>>;

export interface FiscalQrCandidate {
  invoiceNumber?: string;
  qrcode?: string;
  success: boolean;
  qrPriority?: number;
  description?: string;
}

export interface FiscalQrPrintItem {
  value: string;
  description: string;
  providerId: string;
  qrPriority: number;
}

/**
 * Collect all successful fiscal QRs for receipt print, sorted by qrPriority desc.
 * Ties keep insertion / iteration order.
 */
export const collectFiscalQrsForPrint = (
  results: Record<string, FiscalQrCandidate>
): FiscalQrPrintItem[] => {
  const items: FiscalQrPrintItem[] = [];

  for (const [providerId, result] of Object.entries(results)) {
    if (!result.success) continue;
    const value = result.qrcode ?? result.invoiceNumber;
    if (!value) continue;
    const qrPriority = Number.isFinite(result.qrPriority) ? Number(result.qrPriority) : 0;
    items.push({
      value,
      description: (result.description ?? '').trim(),
      providerId,
      qrPriority,
    });
  }

  return items.sort((a, b) => b.qrPriority - a.qrPriority);
};

/**
 * Pick preferred fiscal QR (highest qrPriority) for selected_for_print bookkeeping.
 * Ties keep the first candidate in iteration order (caller should pass stable order).
 */
export const pickPreferredFiscalQr = (
  results: Record<string, FiscalQrCandidate>
): { qrcode?: string; providerId?: string } => {
  const [first] = collectFiscalQrsForPrint(results);
  if (!first) return {};
  return { qrcode: first.value, providerId: first.providerId };
};
