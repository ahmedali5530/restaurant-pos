import { describe, expect, it } from 'vitest';
import {
  isKraItemRegistered,
  isKraPendingExternalId,
  kraItemPayload,
  kraPendingExternalId,
  toKraItemMappingView,
} from '@/integrations/providers/fiscal/kra/item-mapping.ts';

describe('KRA item mapping helpers', () => {
  it('builds pending external ids', () => {
    expect(kraPendingExternalId('menu_item:1')).toBe('__pending__:menu_item:1');
    expect(isKraPendingExternalId('__pending__:menu_item:1')).toBe(true);
    expect(isKraPendingExternalId('KE2NTU0000001')).toBe(false);
  });

  it('treats pending rows as unregistered', () => {
    expect(
      isKraItemRegistered({
        externalId: kraPendingExternalId('menu_item:1'),
        externalPayload: { itemClsCd: '5059690800' },
      })
    ).toBe(false);
    expect(
      isKraItemRegistered({
        externalId: 'KE2NTU0000001',
        externalPayload: { registered: true },
      })
    ).toBe(true);
  });

  it('normalizes payload tax type', () => {
    expect(kraItemPayload({ externalPayload: { taxTyCd: 'b', itemClsCd: '1' } })).toEqual({
      itemClsCd: '1',
      taxTyCd: 'B',
      registered: false,
    });
  });

  it('builds mapping views for resolvers', () => {
    const view = toKraItemMappingView({
      posrId: 'menu_item:1',
      externalId: 'KE2NTU0000001',
      externalPayload: { itemClsCd: '5059690800', taxTyCd: 'E', registered: true },
    });
    expect(view).toMatchObject({
      posrId: 'menu_item:1',
      externalId: 'KE2NTU0000001',
      itemClsCd: '5059690800',
      taxTyCd: 'E',
      registered: true,
    });
  });
});
