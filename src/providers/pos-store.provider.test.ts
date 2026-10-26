import { describe, expect, it } from 'vitest';
import { mergeHydratedCatalogIntoSettings } from '@/providers/pos-store.provider.tsx';
import type { AppSettingsInterface } from '@/store/jotai.ts';

const base = {
  floors: [],
  tables: [],
  dishes: [],
  categories: [],
} as unknown as AppSettingsInterface;

describe('mergeHydratedCatalogIntoSettings', () => {
  it('keeps prior dishes/categories when the next catalog read is empty', () => {
    const prev = {
      ...base,
      dishes: [{ id: 'menu_item:1', name: 'Soup' }],
      categories: [{ id: 'category:1', name: 'Starters' }],
      floors: [{ id: 'floor:1', name: 'Main' }],
    } as unknown as AppSettingsInterface;

    const next = mergeHydratedCatalogIntoSettings(prev, {
      dishes: [],
      categories: [],
      floors: [],
      tables: [],
      menus: [],
    });

    expect(next.dishes).toEqual(prev.dishes);
    expect(next.categories).toEqual(prev.categories);
    expect(next.floors).toEqual(prev.floors);
  });

  it('accepts a non-empty catalog projection', () => {
    const prev = {
      ...base,
      dishes: [{ id: 'menu_item:old', name: 'Old' }],
    } as unknown as AppSettingsInterface;

    const dishes = [{ id: 'menu_item:new', name: 'New' }];
    const next = mergeHydratedCatalogIntoSettings(prev, {
      dishes,
      categories: [{ id: 'category:1', name: 'Mains' }],
      floors: [{ id: 'floor:1', name: 'Main' }],
      tables: [],
    });

    expect(next.dishes).toEqual(dishes);
    expect(next.categories).toHaveLength(1);
  });
});
