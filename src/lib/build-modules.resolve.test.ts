import { describe, expect, it } from 'bun:test';
import {
  buildModuleDefineMap,
  isModuleEnabledForLists,
  parseModuleList,
  resolveTopLevelBuildFlags,
} from './build-modules.resolve.ts';

describe('parseModuleList', () => {
  it('splits and lowercases', () => {
    expect(parseModuleList(' Menu, Orders ,ADMIN ')).toEqual([
      'menu',
      'orders',
      'admin',
    ]);
  });

  it('empty when unset', () => {
    expect(parseModuleList('')).toEqual([]);
    expect(parseModuleList(undefined)).toEqual([]);
  });
});

describe('isModuleEnabledForLists', () => {
  it('allows all when both empty', () => {
    expect(isModuleEnabledForLists('orders', [], [])).toBe(true);
    expect(isModuleEnabledForLists('admin.dishes', [], [])).toBe(true);
  });

  it('allowlist keeps listed and children; parent of allowed child stays on', () => {
    const allow = ['admin.dishes', 'reports'];
    expect(isModuleEnabledForLists('admin.dishes', allow, [])).toBe(true);
    expect(isModuleEnabledForLists('admin', allow, [])).toBe(true);
    expect(isModuleEnabledForLists('admin.kitchens', allow, [])).toBe(false);
    expect(isModuleEnabledForLists('reports.tax', allow, [])).toBe(true);
    expect(isModuleEnabledForLists('orders', allow, [])).toBe(false);
  });

  it('denylist removes exact and children but not parents', () => {
    const exclude = ['admin.qr_ordering', 'orders'];
    expect(isModuleEnabledForLists('admin.qr_ordering', [], exclude)).toBe(false);
    expect(isModuleEnabledForLists('admin', [], exclude)).toBe(true);
    expect(isModuleEnabledForLists('admin.dishes', [], exclude)).toBe(true);
    expect(isModuleEnabledForLists('orders', [], exclude)).toBe(false);
    expect(isModuleEnabledForLists('orders.cancel', [], exclude)).toBe(false);
  });

  it('prefix deny admin drops admin.*', () => {
    expect(isModuleEnabledForLists('admin.dishes', [], ['admin'])).toBe(false);
    expect(isModuleEnabledForLists('admin', [], ['admin'])).toBe(false);
  });

  it('allow then exclude', () => {
    const allow = ['admin', 'reports'];
    const exclude = ['admin.qr_ordering'];
    expect(isModuleEnabledForLists('admin.dishes', allow, exclude)).toBe(true);
    expect(isModuleEnabledForLists('admin.qr_ordering', allow, exclude)).toBe(false);
    expect(isModuleEnabledForLists('orders', allow, exclude)).toBe(false);
  });
});

describe('resolveTopLevelBuildFlags', () => {
  it('builds define map literals', () => {
    const flags = resolveTopLevelBuildFlags('', 'orders,menu');
    expect(flags.orders).toBe(false);
    expect(flags.menu).toBe(false);
    expect(flags.admin).toBe(true);
    const define = buildModuleDefineMap('', 'orders');
    expect(define.__BUILD_MODULE_orders__).toBe('false');
    expect(define.__BUILD_MODULE_admin__).toBe('true');
  });

  it('menu and quick are independent top-level flags', () => {
    const excludeMenu = resolveTopLevelBuildFlags('', 'menu');
    expect(excludeMenu.menu).toBe(false);
    expect(excludeMenu.quick).toBe(true);

    const excludeQuick = resolveTopLevelBuildFlags('', 'quick');
    expect(excludeQuick.quick).toBe(false);
    expect(excludeQuick.menu).toBe(true);

    const define = buildModuleDefineMap('', 'quick');
    expect(define.__BUILD_MODULE_quick__).toBe('false');
    expect(define.__BUILD_MODULE_menu__).toBe('true');
  });
});
