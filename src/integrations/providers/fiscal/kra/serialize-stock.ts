import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import { kraDate, kraDateTime, roundKraAmount } from '@/integrations/providers/fiscal/kra/datetime.ts';

/**
 * KRA stock in/out type codes (Spec 4.15):
 * 02 purchase in, 03 return in, 06 adjustment in,
 * 11 sale out, 12 purchase return out, 15 waste out, 16 adjustment out
 */
export type KraStockTyCd = '02' | '03' | '06' | '11' | '12' | '15' | '16';

export const mapInventoryReferenceToKraStockTy = (
  referenceType: string,
  options: { reversed?: boolean; signedQty?: number } = {}
): KraStockTyCd | null => {
  const type = String(referenceType || '').toLowerCase();
  const reversed = Boolean(options.reversed);
  const signed = Number(options.signedQty);

  if (type === 'purchase') return reversed ? '12' : '02';
  if (type === 'purchase_return') return reversed ? '02' : '12';
  if (type === 'waste') return reversed ? '06' : '15';
  if (type === 'adjustment') {
    if (Number.isFinite(signed) && signed < 0) return reversed ? '06' : '16';
    return reversed ? '16' : '06';
  }
  // Issues / transfers / production are out of first-pass scope.
  return null;
};

export type KraStockLine = {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd: string | null;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  itemExprDt: string | null;
  prc: number;
  splyAmt: number;
  totDcAmt: number;
  taxblAmt: number;
  taxTyCd: string;
  taxAmt: number;
  totAmt: number;
};

export const serializeKraStockIo = (
  config: KraProviderConfig,
  input: {
    sarNo: number;
    orgSarNo?: number;
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
    regrId?: string;
    regrNm?: string;
  }
): Record<string, unknown> => {
  const regrId = String(input.regrId ?? 'POSR').slice(0, 20);
  const regrNm = String(input.regrNm ?? 'POSR').slice(0, 60);
  const ocrnDt = kraDate();
  const regDt = kraDateTime();

  const itemList: KraStockLine[] = input.lines.map((line, index) => {
    const qty = Math.abs(roundKraAmount(line.qty));
    const prc = roundKraAmount(line.unitPrice ?? 0);
    const splyAmt = roundKraAmount(qty * prc);
    return {
      itemSeq: index + 1,
      itemCd: line.itemCd,
      itemClsCd: String(line.itemClsCd || config.itemClsCd).slice(0, 10),
      itemNm: String(line.itemNm || 'Item').slice(0, 200),
      bcd: line.barcode ? String(line.barcode).slice(0, 20) : null,
      pkgUnitCd: config.pkgUnitCd,
      pkg: qty,
      qtyUnitCd: config.qtyUnitCd,
      qty,
      itemExprDt: null,
      prc,
      splyAmt,
      totDcAmt: 0,
      taxblAmt: splyAmt,
      taxTyCd: String(line.taxTyCd || config.taxTyCd || 'B').slice(0, 1),
      taxAmt: 0,
      totAmt: splyAmt,
    };
  });

  return {
    tin: config.tin,
    bhfId: config.bhfId,
    cmcKey: config.cmcKey,
    sarNo: input.sarNo,
    orgSarNo: input.orgSarNo ?? 0,
    regTyCd: 'M',
    sarTyCd: input.stockTyCd,
    ocrnDt,
    totItemCnt: itemList.length,
    totTaxblAmt: roundKraAmount(itemList.reduce((s, l) => s + l.taxblAmt, 0)),
    totTaxAmt: 0,
    totAmt: roundKraAmount(itemList.reduce((s, l) => s + l.totAmt, 0)),
    remark: null,
    regrId,
    regrNm,
    modrId: regrId,
    modrNm: regrNm,
    itemList,
  };
};
