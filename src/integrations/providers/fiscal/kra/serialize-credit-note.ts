import { Order } from '@/api/model/order.ts';
import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import { kraDate, kraDateTime, roundKraAmount } from '@/integrations/providers/fiscal/kra/datetime.ts';
import { mapKraPaymentType } from '@/integrations/providers/fiscal/kra/payment.ts';
import {
  KraItemCodeResolver,
  KraSalesPayload,
  serializeKraSalesInvoice,
} from '@/integrations/providers/fiscal/kra/serialize-sales.ts';

export type KraCreditNoteInput = {
  order: Order;
  /** Original KRA invcNo from the completed sale submission */
  orgInvcNo: number;
  /** New invcNo for the credit note */
  invcNo: number;
  /** Optional subset of order item ids for partial refunds */
  itemIds?: string[];
  reasonCode?: string;
  regrId?: string;
  regrNm?: string;
};

/**
 * Credit note = sales payload with rcptTyCd R, orgInvcNo pointing at original sale.
 */
export const serializeKraCreditNote = (
  config: KraProviderConfig,
  input: KraCreditNoteInput,
  resolveItem: KraItemCodeResolver
): KraSalesPayload => {
  let order = input.order;
  if (input.itemIds?.length) {
    const idSet = new Set(input.itemIds.map(String));
    order = {
      ...input.order,
      items: (input.order.items ?? []).filter((item) => idSet.has(String(item.id))),
    };
  }

  const base = serializeKraSalesInvoice(order, config, input.invcNo, resolveItem, {
    regrId: input.regrId,
    regrNm: input.regrNm,
  });

  const rfdDt = kraDateTime();
  return {
    ...base,
    orgInvcNo: input.orgInvcNo,
    rcptTyCd: 'R',
    salesSttsCd: '02',
    rfdDt,
    rfdRsnCd: String(input.reasonCode ?? '06').slice(0, 5),
    pmtTyCd: mapKraPaymentType(input.order),
    totAmt: roundKraAmount(Number(base.totAmt) || 0),
    salesDt: kraDate(),
    cfmDt: rfdDt,
  };
};
