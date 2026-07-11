import { describe, expect, it } from 'vitest';
import {
  parseFiscalRuntimeConfig,
  pickPreferredFiscalQr,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';

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
