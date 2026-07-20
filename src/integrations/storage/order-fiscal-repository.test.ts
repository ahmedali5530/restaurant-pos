import { describe, expect, it } from 'vitest';
import { OrderFiscalSubmission } from '@/api/model/order_fiscal_submission.ts';
import {
  buildFiscalQrcodesForPrint,
  pickPreferredFiscalSubmission,
} from '@/integrations/storage/order-fiscal-repository.ts';

describe('pickPreferredFiscalSubmission', () => {
  it('returns selected_for_print row first', () => {
    const rows = [
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:pra',
        status: 'completed',
        qrcode: 'PRA-1',
        qr_priority: 100,
        selected_for_print: false,
      },
      {
        id: 'integration_order_fiscal:2',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-9',
        qr_priority: 50,
        selected_for_print: true,
      },
    ] as OrderFiscalSubmission[];

    expect(pickPreferredFiscalSubmission(rows)?.qrcode).toBe('FBR-9');
  });

  it('prefers highest qr_priority when nothing is selected', () => {
    const rows = [
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-1',
        qr_priority: 50,
      },
      {
        id: 'integration_order_fiscal:2',
        provider_id: 'provider:zatca',
        status: 'completed',
        qrcode: 'ZATCA-2',
        qr_priority: 90,
      },
      {
        id: 'integration_order_fiscal:3',
        provider_id: 'provider:pra',
        status: 'completed',
        qrcode: 'PRA-3',
        qr_priority: 100,
      },
    ] as OrderFiscalSubmission[];

    expect(pickPreferredFiscalSubmission(rows)?.provider_id).toBe('provider:pra');
  });
});

describe('buildFiscalQrcodesForPrint', () => {
  it('returns all completed provider QRs sorted by priority with descriptions', () => {
    const rows = [
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-1',
        qr_priority: 50,
      },
      {
        id: 'integration_order_fiscal:2',
        provider_id: 'provider:pra',
        status: 'completed',
        qrcode: 'PRA-3',
        qr_priority: 100,
      },
      {
        id: 'integration_order_fiscal:3',
        provider_id: 'provider:pra',
        status: 'failed',
        qrcode: 'PRA-OLD',
        qr_priority: 100,
      },
    ] as OrderFiscalSubmission[];

    const items = buildFiscalQrcodesForPrint(rows);
    expect(items.map((i) => i.providerId)).toEqual(['provider:pra', 'provider:fbr']);
    expect(items[0]).toMatchObject({
      value: 'PRA-3',
      description: 'PRA',
      qrPriority: 100,
    });
    expect(items[1]).toMatchObject({
      value: 'FBR-1',
      description: 'FBR',
      qrPriority: 50,
    });
  });

  it('dedupes by provider keeping the first (latest) row', () => {
    const rows = [
      {
        id: 'integration_order_fiscal:new',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-NEW',
        qr_priority: 50,
      },
      {
        id: 'integration_order_fiscal:old',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-OLD',
        qr_priority: 50,
      },
    ] as OrderFiscalSubmission[];

    const items = buildFiscalQrcodesForPrint(rows);
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe('FBR-NEW');
  });
});
