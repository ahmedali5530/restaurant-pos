import { parseFiscalRuntimeConfig } from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { PkFiscalSerializeConfig } from '@/integrations/providers/fiscal/pk-fbr-pra/serialize-invoice.ts';

export interface PkFiscalProviderConfig extends PkFiscalSerializeConfig {
  apiBaseUrl: string;
  bearerToken: string;
  offlineBuffering: boolean;
  requestTimeoutSeconds: number;
  blockSettlementOnFailure: boolean;
  qrPriority: number;
  sellerNtn?: string;
}

export type ParsePkFiscalConfigOptions = {
  /** When true, sellerNtn is required (FBR). */
  requireSellerNtn?: boolean;
};

export const parsePkFiscalProviderConfig = (
  values: Record<string, unknown>,
  options: ParsePkFiscalConfigOptions = {}
): PkFiscalProviderConfig | { error: string } => {
  // Strip copy-paste quotes / zero-width chars so proxy URL validation does not fail.
  const stripInvisible = (value: string) =>
    value.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
  const normalizeUrl = (raw: string) => {
    let value = stripInvisible(raw);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = stripInvisible(value.slice(1, -1));
    }
    return value;
  };

  const apiBaseUrl = normalizeUrl(String(values.apiBaseUrl ?? ''));
  const bearerToken = String(values.bearerToken ?? '').trim();
  const posId = String(values.posId ?? '').trim();
  const defaultPctCode = String(values.defaultPctCode ?? '').trim();
  const runtime = parseFiscalRuntimeConfig(values);

  if (!apiBaseUrl) return { error: 'apiBaseUrl is required' };
  try {
    const parsedUrl = new URL(apiBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { error: 'apiBaseUrl must be a valid http(s) URL' };
    }
  } catch {
    return { error: 'apiBaseUrl must be a valid http(s) URL' };
  }
  if (!bearerToken) return { error: 'bearerToken is required' };
  if (!posId) return { error: 'posId is required' };
  if (!defaultPctCode) return { error: 'defaultPctCode is required' };

  if (options.requireSellerNtn && !String(values.sellerNtn ?? '').trim()) {
    return { error: 'sellerNtn is required' };
  }

  return {
    apiBaseUrl,
    bearerToken,
    posId,
    defaultPctCode,
    invoiceType: Number(values.invoiceType ?? 1) || 1,
    punjabMode: Boolean(values.punjabMode),
    offlineBuffering: runtime.offlineBuffering,
    requestTimeoutSeconds: runtime.requestTimeoutSeconds,
    blockSettlementOnFailure: runtime.blockSettlementOnFailure,
    qrPriority: runtime.qrPriority,
    sellerNtn: values.sellerNtn != null ? String(values.sellerNtn) : undefined,
  };
};
