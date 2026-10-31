import { parseFiscalRuntimeConfig } from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { KraMode } from '@/integrations/providers/fiscal/kra/paths.ts';

export interface KraProviderConfig {
  mode: KraMode;
  apiBaseUrl: string;
  tin: string;
  bhfId: string;
  dvcSrlNo: string;
  cmcKey: string;
  sdcId?: string;
  mrcNo?: string;
  dvcId?: string;
  itemClsCd: string;
  taxTyCd: string;
  zeroTaxTyCd: string;
  pkgUnitCd: string;
  qtyUnitCd: string;
  orgnNatCd: string;
  /** KRA itemCd product type digit (2 = finished goods). */
  itemTyCd: string;
  receiptVerifyBaseUrl: string;
  offlineBuffering: boolean;
  requestTimeoutSeconds: number;
  blockSettlementOnFailure: boolean;
  qrPriority: number;
}

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

export const parseKraProviderConfig = (
  values: Record<string, unknown>,
  options: { requireCmcKey?: boolean } = {}
): KraProviderConfig | { error: string } => {
  const modeRaw = String(values.mode ?? 'oscu').toLowerCase();
  const mode: KraMode = modeRaw === 'vscu' ? 'vscu' : 'oscu';
  const apiBaseUrl = normalizeUrl(String(values.apiBaseUrl ?? ''));
  const tin = stripInvisible(String(values.tin ?? '')).toUpperCase();
  const bhfId = stripInvisible(String(values.bhfId ?? ''));
  const dvcSrlNo = stripInvisible(String(values.dvcSrlNo ?? ''));
  const cmcKey = stripInvisible(String(values.cmcKey ?? ''));
  const itemClsCd = stripInvisible(String(values.itemClsCd ?? ''));
  const taxTyCd = stripInvisible(String(values.taxTyCd ?? 'B')) || 'B';
  const zeroTaxTyCd = stripInvisible(String(values.zeroTaxTyCd ?? 'A')) || 'A';
  const pkgUnitCd = stripInvisible(String(values.pkgUnitCd ?? 'NT')) || 'NT';
  const qtyUnitCd = stripInvisible(String(values.qtyUnitCd ?? 'U')) || 'U';
  const orgnNatCd = stripInvisible(String(values.orgnNatCd ?? 'KE')) || 'KE';
  const itemTyCd = stripInvisible(String(values.itemTyCd ?? '2')) || '2';
  const receiptVerifyBaseUrl =
    normalizeUrl(String(values.receiptVerifyBaseUrl ?? '')) ||
    'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData';
  const runtime = parseFiscalRuntimeConfig({
    ...values,
    qrPriority: values.qrPriority ?? 50,
  });

  if (!apiBaseUrl) return { error: 'apiBaseUrl is required' };
  try {
    const parsedUrl = new URL(apiBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { error: 'apiBaseUrl must be a valid http(s) URL' };
    }
  } catch {
    return { error: 'apiBaseUrl must be a valid http(s) URL' };
  }
  if (!tin || tin.length > 11) return { error: 'tin is required (max 11 chars)' };
  if (!bhfId || bhfId.length !== 2) return { error: 'bhfId must be exactly 2 characters' };
  if (!dvcSrlNo) return { error: 'dvcSrlNo is required' };
  if (!itemClsCd || itemClsCd.length > 10) {
    return { error: 'itemClsCd is required (max 10 digits)' };
  }
  if (options.requireCmcKey !== false && !cmcKey) {
    return { error: 'cmcKey is required — run Initialize Device first' };
  }

  return {
    mode,
    apiBaseUrl,
    tin,
    bhfId,
    dvcSrlNo,
    cmcKey,
    sdcId: values.sdcId != null ? String(values.sdcId) : undefined,
    mrcNo: values.mrcNo != null ? String(values.mrcNo) : undefined,
    dvcId: values.dvcId != null ? String(values.dvcId) : undefined,
    itemClsCd,
    taxTyCd,
    zeroTaxTyCd,
    pkgUnitCd,
    qtyUnitCd,
    orgnNatCd,
    itemTyCd,
    receiptVerifyBaseUrl,
    offlineBuffering: runtime.offlineBuffering,
    requestTimeoutSeconds: runtime.requestTimeoutSeconds,
    blockSettlementOnFailure: runtime.blockSettlementOnFailure,
    qrPriority: runtime.qrPriority || 50,
  };
};

export const kraTenantId = (config: Pick<KraProviderConfig, 'tin' | 'bhfId'>): string =>
  `${config.tin}:${config.bhfId}`;
