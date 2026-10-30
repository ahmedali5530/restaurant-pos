import { describe, expect, it } from 'vitest';
import { getKraPath, joinKraUrl } from '@/integrations/providers/fiscal/kra/paths.ts';

describe('KRA paths', () => {
  it('maps OSCU and VSCU actions to distinct endpoints', () => {
    expect(getKraPath('oscu', 'init')).toBe('/selectInitOsdcInfo');
    expect(getKraPath('vscu', 'init')).toBe('/initializer/selectInitInfo');
    expect(getKraPath('oscu', 'saveSales')).toBe('/saveTrnsSalesOsdc');
    expect(getKraPath('vscu', 'saveSales')).toBe('/trnsSales/saveSales');
    expect(getKraPath('oscu', 'saveStockIo')).toBe('/insertStockIO');
    expect(getKraPath('vscu', 'saveStockIo')).toBe('/stock/saveStockItems');
  });

  it('joins base URL and path without double slashes', () => {
    expect(joinKraUrl('https://etims-api-sbx.kra.go.ke/etims-api/', '/saveItem')).toBe(
      'https://etims-api-sbx.kra.go.ke/etims-api/saveItem'
    );
  });
});
