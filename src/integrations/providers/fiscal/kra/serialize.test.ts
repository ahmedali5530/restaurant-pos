import { describe, expect, it } from 'vitest';
import { buildKraReceiptQrUrl } from '@/integrations/providers/fiscal/kra/serialize-sales.ts';
import { serializeKraCreditNote } from '@/integrations/providers/fiscal/kra/serialize-credit-note.ts';
import { mapInventoryReferenceToKraStockTy } from '@/integrations/providers/fiscal/kra/serialize-stock.ts';
import { isKraSuccess } from '@/integrations/providers/fiscal/kra/client.ts';
import type { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';

const baseConfig: KraProviderConfig = {
  mode: 'oscu',
  apiBaseUrl: 'https://etims-api-sbx.kra.go.ke/etims-api',
  tin: 'P000000000B',
  bhfId: '00',
  dvcSrlNo: 'dev-1',
  cmcKey: 'key',
  itemClsCd: '5059690800',
  taxTyCd: 'B',
  zeroTaxTyCd: 'A',
  pkgUnitCd: 'NT',
  qtyUnitCd: 'U',
  orgnNatCd: 'KE',
  itemTyCd: '2',
  receiptVerifyBaseUrl:
    'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData',
  offlineBuffering: true,
  requestTimeoutSeconds: 30,
  blockSettlementOnFailure: false,
  qrPriority: 50,
};

describe('KRA serializers and response helpers', () => {
  it('builds receipt QR URL from intrlData', () => {
    expect(buildKraReceiptQrUrl(baseConfig.receiptVerifyBaseUrl, 'ABC123')).toContain(
      'Data=ABC123'
    );
  });

  it('treats resultCd 000 as success', () => {
    expect(isKraSuccess({ resultCd: '000' })).toBe(true);
    expect(isKraSuccess({ resultCd: '901' })).toBe(false);
  });

  it('maps inventory reference types to stock codes', () => {
    expect(mapInventoryReferenceToKraStockTy('purchase')).toBe('02');
    expect(mapInventoryReferenceToKraStockTy('purchase_return')).toBe('12');
    expect(mapInventoryReferenceToKraStockTy('waste')).toBe('15');
    expect(mapInventoryReferenceToKraStockTy('adjustment', { signedQty: -2 })).toBe('16');
    expect(mapInventoryReferenceToKraStockTy('issue')).toBeNull();
  });

  it('serializes credit notes with rcptTyCd R and original invcNo', () => {
    const order: any = {
      id: 'order:1',
      invoice_number: 10,
      items: [
        {
          id: 'order_item:1',
          quantity: 1,
          price: 100,
          discount: 0,
          item: { id: 'menu_item:1', name: 'Tea', number: 'T1' },
          taxes: [{ rate: 16 }],
        },
      ],
      payments: [{ payment_type: { type: 'cash' } }],
    };

    const payload = serializeKraCreditNote(
      baseConfig,
      { order, orgInvcNo: 5, invcNo: 6, itemIds: ['order_item:1'] },
      () => ({ itemCd: 'KE2NTU0000001', itemClsCd: baseConfig.itemClsCd })
    );

    expect(payload.rcptTyCd).toBe('R');
    expect(payload.orgInvcNo).toBe(5);
    expect(payload.invcNo).toBe(6);
    expect(payload.rfdRsnCd).toBe('06');
    expect(payload.itemList).toHaveLength(1);
  });
});
