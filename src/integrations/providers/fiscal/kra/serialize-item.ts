import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import { roundKraAmount } from '@/integrations/providers/fiscal/kra/datetime.ts';

export type KraCatalogItemInput = {
  itemCd: string;
  itemNm: string;
  itemClsCd?: string | null;
  taxTyCd?: string | null;
  barcode?: string | null;
  price: number;
  /** 1 raw, 2 finished, 3 service — default from config.itemTyCd */
  itemTyCd?: string | null;
};

export const serializeKraItemSave = (
  config: KraProviderConfig,
  item: KraCatalogItemInput,
  options: { regrId?: string; regrNm?: string } = {}
): Record<string, unknown> => {
  const regrId = String(options.regrId ?? 'POSR').slice(0, 20);
  const regrNm = String(options.regrNm ?? 'POSR').slice(0, 60);
  const price = roundKraAmount(item.price);

  return {
    tin: config.tin,
    bhfId: config.bhfId,
    cmcKey: config.cmcKey,
    itemCd: item.itemCd,
    itemClsCd: String(item.itemClsCd || config.itemClsCd).slice(0, 10),
    itemTyCd: String(item.itemTyCd || config.itemTyCd || '2').slice(0, 1),
    itemNm: String(item.itemNm || 'Item').slice(0, 200),
    itemStdNm: null,
    orgnNatCd: config.orgnNatCd,
    pkgUnitCd: config.pkgUnitCd,
    qtyUnitCd: config.qtyUnitCd,
    taxTyCd: String(item.taxTyCd || config.taxTyCd || 'B').slice(0, 1).toUpperCase(),
    btchNo: null,
    bcd: item.barcode ? String(item.barcode).slice(0, 20) : null,
    dftPrc: price,
    grpPrcL1: null,
    grpPrcL2: null,
    grpPrcL3: null,
    grpPrcL4: null,
    grpPrcL5: null,
    addInfo: null,
    sftyQty: 0,
    isrcAplcbYn: 'N',
    useYn: 'Y',
    regrId,
    regrNm,
    modrId: regrId,
    modrNm: regrNm,
  };
};
