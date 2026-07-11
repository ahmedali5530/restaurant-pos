export type { FiscalExecutionData } from '@/integrations/providers/fiscal/shared/types.ts';

export interface FiscalRuntimeConfig {
  offlineBuffering: boolean;
  requestTimeoutSeconds: number;
  blockSettlementOnFailure: boolean;
  /** Higher wins when multiple fiscal providers succeed; used to pick print QR. */
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
}

/**
 * Pick print QR from successful submissions by highest qrPriority.
 * Ties keep the first candidate in iteration order (caller should pass stable order).
 */
export const pickPreferredFiscalQr = (
  results: Record<string, FiscalQrCandidate>
): { qrcode?: string; providerId?: string } => {
  let best:
    | {
        providerId: string;
        qrcode: string;
        qrPriority: number;
      }
    | undefined;

  for (const [providerId, result] of Object.entries(results)) {
    if (!result.success) continue;
    const qrcode = result.qrcode ?? result.invoiceNumber;
    if (!qrcode) continue;
    const qrPriority = Number.isFinite(result.qrPriority) ? Number(result.qrPriority) : 0;
    if (!best || qrPriority > best.qrPriority) {
      best = { providerId, qrcode, qrPriority };
    }
  }

  if (!best) return {};
  return { qrcode: best.qrcode, providerId: best.providerId };
};
