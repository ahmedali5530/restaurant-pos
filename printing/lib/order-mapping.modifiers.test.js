'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getOrderItemModifierLines } = require('./order-mapping');

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
