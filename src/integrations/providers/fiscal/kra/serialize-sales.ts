import { Order } from '@/api/model/order.ts';
import { calculateOrderItemPrice } from '@/lib/cart.ts';
import { getOrderFilteredItems, getOrderSettlementFigures } from '@/lib/order.ts';
import { getOrderItemTaxAmount, getOrderTaxAmount } from '@/lib/tax-calculator.ts';
import { safeNumber } from '@/lib/utils.ts';
import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import { kraDate, kraDateTime, roundKraAmount } from '@/integrations/providers/fiscal/kra/datetime.ts';
import { mapKraPaymentType } from '@/integrations/providers/fiscal/kra/payment.ts';
import {
  accumulateKraTaxBucket,
  emptyKraTaxBuckets,
  resolveKraTaxTyCd,
  resolveOrderItemTaxRate,
} from '@/integrations/providers/fiscal/kra/tax.ts';

export type KraItemCodeResolver = (item: Order['items'][number]) => {
  itemCd: string;
  itemClsCd: string;
  taxTyCdOverride?: string | null;
};

export type KraSalesLine = {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd: string | null;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt: number;
  dcAmt: number;
  isrccCd: null;
  isrccNm: null;
  isrcRt: null;
  isrcAmt: null;
  taxTyCd: string;
  taxblAmt: number;
  taxAmt: number;
  totAmt: number;
};

export type KraSalesPayload = Record<string, unknown> & {
  tin: string;
  bhfId: string;
  invcNo: number;
  itemList: KraSalesLine[];
};

const dishName = (item: Order['items'][number]): string => {
  const dish = item?.item;
  return (
    (typeof dish === 'object' && dish
      ? String(dish.menu_name || dish.name || '').trim()
      : '') || 'Item'
  );
};

const dishBarcode = (item: Order['items'][number]): string | null => {
  const dish = item?.item;
  if (typeof dish !== 'object' || !dish) return null;
  const barcode = String((dish as { barcode?: string }).barcode ?? '').trim();
  return barcode || null;
};

export const buildKraReceiptQrUrl = (
  receiptVerifyBaseUrl: string,
  intrlData: string
): string => {
  const base = receiptVerifyBaseUrl.replace(/\/+$/, '');
  const data = String(intrlData || '').trim();
  if (!data) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}Data=${encodeURIComponent(data)}`;
};

export const serializeKraSalesInvoice = (
  order: Order,
  config: KraProviderConfig,
  invcNo: number,
  resolveItem: KraItemCodeResolver,
  options: { regrId?: string; regrNm?: string } = {}
): KraSalesPayload => {
  const items = getOrderFilteredItems(order);
  const settlement = getOrderSettlementFigures(order);
  const totAmt = roundKraAmount(
    Math.max(0, settlement.grandTotalDue - settlement.tips - settlement.serviceCharges)
  );
  const totTaxAmt = roundKraAmount(getOrderTaxAmount(order));
  const buckets = emptyKraTaxBuckets();
  const regrId = String(options.regrId ?? 'POSR').slice(0, 20);
  const regrNm = String(options.regrNm ?? 'POSR').slice(0, 60);
  const salesDt = kraDate(order.created_at ?? order.completed_at);
  const cfmDt = kraDateTime(order.completed_at ?? order.created_at);

  const itemList: KraSalesLine[] = items.map((item, index) => {
    const quantity = safeNumber(item.quantity || 1) || 1;
    const lineSale = roundKraAmount(safeNumber(calculateOrderItemPrice(item)));
    const lineTax = roundKraAmount(safeNumber(getOrderItemTaxAmount(item, order)));
    const unitSale = quantity > 0 ? roundKraAmount(lineSale / quantity) : lineSale;
    const unitTax = quantity > 0 ? roundKraAmount(lineTax / quantity) : lineTax;
    const taxRate = resolveOrderItemTaxRate(order, item, unitSale, unitTax);
    const resolved = resolveItem(item);
    const taxTyCd = resolveKraTaxTyCd({
      config,
      dishOverride: resolved.taxTyCdOverride,
      taxRate,
    });
    const taxblAmt = lineSale;
    const taxAmt = lineTax;
    const lineTot = roundKraAmount(taxblAmt + (item.tax_mode === 'inclusive' ? 0 : taxAmt));
    accumulateKraTaxBucket(buckets, taxTyCd, taxblAmt, taxAmt, taxRate);

    return {
      itemSeq: index + 1,
      itemCd: resolved.itemCd,
      itemClsCd: resolved.itemClsCd || config.itemClsCd,
      itemNm: dishName(item).slice(0, 200),
      bcd: dishBarcode(item),
      pkgUnitCd: config.pkgUnitCd,
      pkg: quantity,
      qtyUnitCd: config.qtyUnitCd,
      qty: quantity,
      prc: unitSale,
      splyAmt: taxblAmt,
      dcRt: 0,
      dcAmt: roundKraAmount(safeNumber(item.discount)),
      isrccCd: null,
      isrccNm: null,
      isrcRt: null,
      isrcAmt: null,
      taxTyCd,
      taxblAmt,
      taxAmt,
      totAmt: lineTot > 0 ? lineTot : taxblAmt,
    };
  });

  const totTaxblAmt = roundKraAmount(
    buckets.taxblAmtA +
      buckets.taxblAmtB +
      buckets.taxblAmtC +
      buckets.taxblAmtD +
      buckets.taxblAmtE
  );

  return {
    tin: config.tin,
    bhfId: config.bhfId,
    cmcKey: config.cmcKey,
    trdInvcNo: String(order.invoice_number ?? invcNo),
    invcNo,
    orgInvcNo: 0,
    custTin: null,
    custNm: order.customer?.name ? String(order.customer.name).slice(0, 60) : null,
    salesTyCd: 'N',
    rcptTyCd: 'S',
    pmtTyCd: mapKraPaymentType(order),
    salesSttsCd: '02',
    cfmDt,
    salesDt,
    stockRlsDt: cfmDt,
    cnclReqDt: null,
    cnclDt: null,
    rfdDt: null,
    rfdRsnCd: null,
    totItemCnt: itemList.length,
    ...Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, roundKraAmount(v as number)])
    ),
    totTaxblAmt,
    totTaxAmt,
    totAmt: totAmt || totTaxblAmt,
    prchrAcptcYn: 'N',
    remark: null,
    regrId,
    regrNm,
    modrId: regrId,
    modrNm: regrNm,
    receipt: {
      custTin: null,
      custMblNo: order.customer?.phone != null ? String(order.customer.phone).slice(0, 20) : null,
      rcptPbctDt: cfmDt,
      trdeNm: null,
      adrs: null,
      topMsg: null,
      btmMsg: null,
      prchrAcptcYn: 'N',
    },
    itemList,
  };
};
