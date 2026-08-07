import { describe, expect, it } from 'vitest';
import {
  collectFiscalQrsForPrint,
  getFiscalProviderReceiptLogo,
  parseFiscalRuntimeConfig,
  pickPreferredFiscalQr,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';

describe('getFiscalProviderReceiptLogo', () => {
  it('returns data URI strings as-is', () => {
    expect(
      getFiscalProviderReceiptLogo({
        receiptLogo: 'data:image/png;base64,AAAA',
      })
    ).toBe('data:image/png;base64,AAAA');
  });

  it('wraps bare base64 as png data URI', () => {
    expect(getFiscalProviderReceiptLogo({ receiptLogo: 'AAAA' })).toBe(
      'data:image/png;base64,AAAA'
    );
  });

  it('returns undefined when empty', () => {
    expect(getFiscalProviderReceiptLogo({})).toBeUndefined();
    expect(getFiscalProviderReceiptLogo({ receiptLogo: '' })).toBeUndefined();
  });
});

describe('parseFiscalRuntimeConfig', () => {
  it('defaults offline buffering on, block settlement off, qrPriority 0', () => {
    expect(parseFiscalRuntimeConfig({})).toEqual({
      offlineBuffering: true,
      requestTimeoutSeconds: 30,
      blockSettlementOnFailure: false,
      qrPriority: 0,
    });
  });

  it('does not require PCT/POSID/Bearer fields', () => {
    const runtime = parseFiscalRuntimeConfig({
      offlineBuffering: false,
      blockSettlementOnFailure: true,
      requestTimeoutSeconds: 10,
      qrPriority: 75,
    });
    expect(runtime.offlineBuffering).toBe(false);
    expect(runtime.blockSettlementOnFailure).toBe(true);
    expect(runtime.requestTimeoutSeconds).toBe(10);
    expect(runtime.qrPriority).toBe(75);
  });
});

describe('pickPreferredFiscalQr', () => {
  it('picks the successful provider with highest qrPriority', () => {
    const preferred = pickPreferredFiscalQr({
      'provider:fbr': { success: true, invoiceNumber: 'FBR-1', qrPriority: 50 },
      'provider:pra': { success: true, invoiceNumber: 'PRA-9', qrPriority: 100 },
      'provider:zatca': { success: true, invoiceNumber: 'ZATCA-3', qrPriority: 80 },
    });
    expect(preferred).toEqual({ qrcode: 'PRA-9', providerId: 'provider:pra' });
  });

  it('ignores failed providers even with higher priority', () => {
    const preferred = pickPreferredFiscalQr({
      'provider:pra': { success: false, invoiceNumber: 'PRA-9', qrPriority: 100 },
      'provider:fbr': { success: true, invoiceNumber: 'FBR-1', qrPriority: 50 },
    });
    expect(preferred).toEqual({ qrcode: 'FBR-1', providerId: 'provider:fbr' });
  });

  it('returns empty when nothing succeeds', () => {
    expect(
      pickPreferredFiscalQr({
        'provider:pra': { success: false, qrPriority: 100 },
      })
    ).toEqual({});
  });
});

describe('collectFiscalQrsForPrint', () => {
  it('returns all successful QRs sorted by qrPriority desc', () => {
    const items = collectFiscalQrsForPrint({
      'provider:fbr': {
        success: true,
        invoiceNumber: 'FBR-1',
        qrPriority: 50,
        description: 'FBR',
      },
      'provider:pra': {
        success: true,
        invoiceNumber: 'PRA-9',
        qrPriority: 100,
        description: 'PRA',
      },
      'provider:zatca': {
        success: true,
        invoiceNumber: 'ZATCA-3',
        qrPriority: 80,
        description: 'ZATCA',
      },
    });

    expect(items.map((i) => i.providerId)).toEqual([
      'provider:pra',
      'provider:zatca',
      'provider:fbr',
    ]);
    expect(items[0]).toMatchObject({
      value: 'PRA-9',
      description: 'PRA',
      qrPriority: 100,
    });
  });

  it('skips failed providers and missing QR values', () => {
    const items = collectFiscalQrsForPrint({
      'provider:pra': { success: false, invoiceNumber: 'PRA-9', qrPriority: 100 },
      'provider:fbr': { success: true, qrPriority: 50 },
      'provider:zatca': {
        success: true,
        qrcode: 'ZATCA-OK',
        qrPriority: 80,
        description: 'ZATCA',
      },
    });

    expect(items).toEqual([
      {
        value: 'ZATCA-OK',
        description: 'ZATCA',
        providerId: 'provider:zatca',
        qrPriority: 80,
      },
    ]);
  });

  it('preserves optional logo on items', () => {
    const items = collectFiscalQrsForPrint({
      'provider:fbr': {
        success: true,
        invoiceNumber: 'FBR-1',
        qrPriority: 50,
        description: 'FBR',
        logo: 'data:image/png;base64,abc',
      },
    });
    expect(items[0]).toMatchObject({
      value: 'FBR-1',
      logo: 'data:image/png;base64,abc',
    });
  });
});
