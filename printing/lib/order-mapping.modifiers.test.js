'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getOrderItemModifierLines,
  calculateOrderItemPricePrint,
  accumulatePrintItems,
  filterPrintExtras,
  getOrderItems,
} = require('./order-mapping');

test('getOrderItemModifierLines reads cart selectedGroups on first-punch KOT', () => {
  const cartLine = {
    quantity: 1,
    price: 10,
    dish: { name: 'Burger' },
    item: { name: 'Burger' },
    selectedGroups: [
      {
        name: 'Size',
        selectedModifiers: [
          { dish: { name: 'Large' }, quantity: 1, selectedGroups: [] },
        ],
      },
    ],
  };

  const lines = getOrderItemModifierLines(cartLine);
  assert.deepEqual(lines, [{ depth: 0, name: 'Large' }]);
});

test('getOrderItemModifierLines still reads saved order_item.modifiers', () => {
  const orderItem = {
    quantity: 1,
    price: 10,
    item: { name: 'Burger' },
    modifiers: [
      {
        name: 'Size',
        selectedModifiers: [
          { dish: { name: 'Large' }, quantity: 1, selectedGroups: [] },
        ],
      },
    ],
  };

  const lines = getOrderItemModifierLines(orderItem);
  assert.deepEqual(lines, [{ depth: 0, name: 'Large' }]);
});

test('getOrderItemModifierLines prefers selectedGroups when modifiers are bare ids', () => {
  const cartLine = {
    quantity: 1,
    modifiers: ['modifier:cheese'],
    selectedGroups: [
      {
        selectedModifiers: [
          { dish: { name: 'Cheese' }, quantity: 1 },
        ],
      },
    ],
  };

  const lines = getOrderItemModifierLines(cartLine);
  assert.deepEqual(lines, [{ depth: 0, name: 'Cheese' }]);
});

test('calculateOrderItemPricePrint multiplies modifiers by dish quantity', () => {
  const orderItem = {
    quantity: 3,
    price: 10,
    item: { name: 'Burger' },
    modifiers: [
      {
        name: 'Extras',
        selectedModifiers: [
          { dish: { name: 'Cheese' }, price: 2, quantity: 1, selectedGroups: [] },
        ],
      },
    ],
  };

  // (10 + 2) * 3 = 36 — not 10*3 + 2
  assert.equal(calculateOrderItemPricePrint(orderItem), 36);
});

test('accumulatePrintItems merges identical rows and recomputes totals', () => {
  const rows = [
    { name: 'Burger', qty: 1, price: 12, total: 12, notes: '', modifierLines: [{ depth: 0, name: 'Cheese' }] },
    { name: 'Burger', qty: 2, price: 12, total: 24, notes: '', modifierLines: [{ depth: 0, name: 'Cheese' }] },
    { name: 'Fries', qty: 1, price: 5, total: 5, notes: '', modifierLines: [] },
  ];
  const merged = accumulatePrintItems(rows);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].qty, 3);
  assert.equal(merged[0].total, 36);
  assert.equal(merged[1].name, 'Fries');
});

test('filterPrintExtras drops zero amounts but keeps negatives', () => {
  assert.deepEqual(
    filterPrintExtras([
      { name: 'Bag', value: 0 },
      { name: 'Service', value: 1.5 },
      { name: 'Credit', value: -2 },
      null,
    ]),
    [
      { name: 'Service', value: 1.5 },
      { name: 'Credit', value: -2 },
    ],
  );
});

test('getOrderItems with accumulateSameItems merges duplicate dishes', () => {
  const order = {
    items: [
      {
        quantity: 1,
        price: 10,
        item: { name: 'Soup' },
        modifiers: [],
      },
      {
        quantity: 2,
        price: 10,
        item: { name: 'Soup' },
        modifiers: [],
      },
    ],
  };
  const separate = getOrderItems(order, false, false);
  assert.equal(separate.length, 2);
  const accumulated = getOrderItems(order, false, true);
  assert.equal(accumulated.length, 1);
  assert.equal(accumulated[0].qty, 3);
  assert.equal(accumulated[0].total, 30);
});
