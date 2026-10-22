'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeCatalogPatch,
  mergeCatalogBaseWithPatch,
  catalogOverrideRecordKey,
  overrideCacheKey,
} = require('./catalog-override-fields');

describe('sanitizeCatalogPatch', () => {
  it('keeps only overridable menu_item fields', () => {
    const patch = sanitizeCatalogPatch('menu_item', {
      price: 12,
      name: 'HACK',
      categories: ['x'],
      cost: 3,
      items: [],
    });
    assert.deepEqual(patch, { price: 12, cost: 3 });
  });

  it('omits empty strings', () => {
    const patch = sanitizeCatalogPatch('menu_item', { number: '', price: 1 });
    assert.deepEqual(patch, { price: 1 });
  });
});

describe('mergeCatalogBaseWithPatch', () => {
  it('overlays patch onto base without mutating relations away accidentally', () => {
    const merged = mergeCatalogBaseWithPatch(
      'menu_item',
      { id: 'menu_item:1', name: 'Wings', price: 10, categories: ['c1'], items: ['r1'] },
      { price: 15, cost: 4 }
    );
    assert.equal(merged.name, 'Wings');
    assert.equal(merged.price, 15);
    assert.equal(merged.cost, 4);
    assert.deepEqual(merged.categories, ['c1']);
    assert.deepEqual(merged.items, ['r1']);
  });

  it('ignores non-overridable keys in patch', () => {
    const merged = mergeCatalogBaseWithPatch(
      'menu_item',
      { name: 'Wings', price: 10 },
      { name: 'Other', price: 20 }
    );
    assert.equal(merged.name, 'Wings');
    assert.equal(merged.price, 20);
  });
});

describe('keys', () => {
  it('builds stable override record and cache keys', () => {
    assert.equal(
      catalogOverrideRecordKey('menu_item', 'menu_item:wings', 'store-a'),
      'menu_item_wings_store-a'
    );
    assert.equal(
      overrideCacheKey('menu_item', 'menu_item:wings'),
      'menu_item:menu_item:wings'
    );
  });
});
