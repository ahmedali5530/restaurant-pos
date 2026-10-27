import { describe, expect, it } from 'vitest';
import { resolveMenuAwareData } from '@/lib/menu.resolver.ts';

describe('resolveMenuAwareData priority', () => {
  it('omits categories with show_in_menu=false from the FOH catalog', () => {
    const result = resolveMenuAwareData({
      categories: [
        { id: 'category:shown', name: 'Shown', priority: 1, show_in_menu: true } as any,
        { id: 'category:hidden', name: 'Hidden', priority: 2, show_in_menu: false } as any,
        { id: 'category:default', name: 'Default', priority: 3 } as any,
      ],
      dishes: [
        {
          id: 'menu_item:1',
          name: 'One',
          priority: 1,
          categories: [{ id: 'category:shown', name: 'Shown' }],
        } as any,
        {
          id: 'menu_item:2',
          name: 'Two',
          priority: 2,
          categories: [{ id: 'category:hidden', name: 'Hidden' }],
        } as any,
        {
          id: 'menu_item:3',
          name: 'Three',
          priority: 3,
          categories: [{ id: 'category:default', name: 'Default' }],
        } as any,
      ],
      menus: [],
    });

    expect(result.categories.map((c) => c.name)).toEqual(['Shown', 'Default']);
  });

  it('sorts dishes and categories by priority when no timed menu is active', () => {
    const result = resolveMenuAwareData({
      categories: [
        { id: 'category:c', name: 'C', priority: 3 } as any,
        { id: 'category:a', name: 'A', priority: 1 } as any,
        { id: 'category:b', name: 'B', priority: 2 } as any,
      ],
      dishes: [
        {
          id: 'menu_item:c',
          name: 'C',
          priority: 3,
          categories: [{ id: 'category:c', name: 'C', priority: 3 }],
        } as any,
        {
          id: 'menu_item:a',
          name: 'A',
          priority: 1,
          categories: [{ id: 'category:a', name: 'A', priority: 1 }],
        } as any,
        {
          id: 'menu_item:b',
          name: 'B',
          priority: 2,
          categories: [{ id: 'category:b', name: 'B', priority: 2 }],
        } as any,
      ],
      menus: [],
    });

    expect(result.dishes.map((d) => d.name)).toEqual(['A', 'B', 'C']);
    expect(result.categories.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('sorts dishes by priority when a timed menu filters the catalog', () => {
    const result = resolveMenuAwareData({
      categories: [
        { id: 'category:a', name: 'A', priority: 1 } as any,
        { id: 'category:b', name: 'B', priority: 2 } as any,
      ],
      dishes: [
        {
          id: 'menu_item:b',
          name: 'B',
          priority: 2,
          price: 2,
          categories: [{ id: 'category:b', name: 'B', priority: 2 }],
        } as any,
        {
          id: 'menu_item:a',
          name: 'A',
          priority: 1,
          price: 1,
          categories: [{ id: 'category:a', name: 'A', priority: 1 }],
        } as any,
      ],
      menus: [
        {
          id: 'menu:lunch',
          name: 'Lunch',
          active: true,
          items: [
            {
              id: 'menu_menu_item:1',
              active: true,
              menu_item: { id: 'menu_item:b', name: 'B', price: 2, priority: 2 },
            },
            {
              id: 'menu_menu_item:2',
              active: true,
              menu_item: { id: 'menu_item:a', name: 'A', price: 1, priority: 1 },
            },
          ],
        } as any,
      ],
      // Midday so menus without time windows stay active.
      now: new Date('2026-09-18T12:00:00'),
    });

    expect(result.hasActiveMenus).toBe(true);
    expect(result.dishes.map((d) => d.name)).toEqual(['A', 'B']);
    expect(result.categories.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('prefers catalog dish availability over stale nested menu_item snapshots', () => {
    const result = resolveMenuAwareData({
      categories: [{id: 'category:a', name: 'A', priority: 1} as any],
      dishes: [
        {
          id: 'menu_item:a',
          name: 'A',
          priority: 1,
          available: false,
          available_qty: 0,
          categories: [{id: 'category:a', name: 'A', priority: 1}],
        } as any,
      ],
      menus: [
        {
          id: 'menu:lunch',
          name: 'Lunch',
          active: true,
          items: [
            {
              id: 'menu_menu_item:1',
              active: true,
              // Stale nested copy still looks sellable until catalog refresh.
              menu_item: {
                id: 'menu_item:a',
                name: 'A',
                price: 1,
                priority: 1,
                available: true,
                available_qty: 10,
              },
            },
          ],
        } as any,
      ],
      now: new Date('2026-09-18T12:00:00'),
    });

    expect(result.dishes).toHaveLength(1);
    expect(result.dishes[0].available).toBe(false);
    expect(result.dishes[0].available_qty).toBe(0);
  });
});
