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
  /** Optional receipt logo data URI from provider config. */
  logo?: string;
}

export interface FiscalQrPrintItem {
  value: string;
  description: string;
  providerId: string;
  qrPriority: number;
  /** Optional provider receipt logo (data URI) printed beside the QR. */
  logo?: string;
}

/**
 * Normalize receiptLogo from provider config into a data URI for print transport.
 */
export const getFiscalProviderReceiptLogo = (
  values: Record<string, unknown> = {}
): string | undefined => {
  const raw = values.receiptLogo;
  if (raw == null) return undefined;

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return undefined;
    if (s.startsWith('data:')) return s;
    return `data:image/png;base64,${s}`;
  }

  let u8: Uint8Array | undefined;
  if (raw instanceof ArrayBuffer) {
    u8 = new Uint8Array(raw);
  } else if (raw instanceof Uint8Array) {
    u8 = raw;
  } else if (Array.isArray(raw)) {
    u8 = new Uint8Array(raw as number[]);
  }
  if (!u8 || u8.length === 0) return undefined;

  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
};

/**
 * Attach receipt logos from each provider's config onto QR print items.
 */
export const attachFiscalReceiptLogos = async (
  items: FiscalQrPrintItem[],
  getConfig: (providerId: string) => Promise<Record<string, unknown>>
): Promise<FiscalQrPrintItem[]> => {
  if (items.length === 0) return items;

  const logoByProvider = new Map<string, string | undefined>();
  const providerIds = [...new Set(items.map((item) => item.providerId))];

  await Promise.all(
    providerIds.map(async (providerId) => {
      try {
        const config = await getConfig(providerId);
        logoByProvider.set(providerId, getFiscalProviderReceiptLogo(config));
      } catch {
        logoByProvider.set(providerId, undefined);
      }
    })
  );

  return items.map((item) => {
    const logo = logoByProvider.get(item.providerId);
    return logo ? { ...item, logo } : item;
  });
};

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
    const logo = result.logo?.trim() ? result.logo.trim() : undefined;
    items.push({
      value,
      description: (result.description ?? '').trim(),
      providerId,
      qrPriority,
      ...(logo ? { logo } : {}),
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
