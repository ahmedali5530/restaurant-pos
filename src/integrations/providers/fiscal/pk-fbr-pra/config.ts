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
  const apiBaseUrl = String(values.apiBaseUrl ?? '').trim();
  const bearerToken = String(values.bearerToken ?? '').trim();
  const posId = String(values.posId ?? '').trim();
  const defaultPctCode = String(values.defaultPctCode ?? '').trim();
  const runtime = parseFiscalRuntimeConfig(values);

  if (!apiBaseUrl) return { error: 'apiBaseUrl is required' };
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
