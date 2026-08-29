'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapOrderToTemp } = require('./order-mapping');

const baseOrder = {
  invoice_number: 1001,
  created_at: '2026-08-29T12:00:00Z',
  items: [{ quantity: 1, price: 1000, item: { name: 'Burger' } }],
  tax_amount: 0,
  service_charge_amount: 0,
  tip_amount: 0,
};

test('mapOrderToTemp includes discount line from order_discounts', () => {
  const order = {
    ...baseOrder,
    discount_amount: 100,
    order_discounts: [{
      name: 'Summer Sale',
      value_type: 'percent',
      applied_rate: 10,
      applied_amount: 100,
    }],
  };

  const bill = mapOrderToTemp(order);
  assert.equal(bill.discountLines.length, 1);
  assert.equal(bill.discountLines[0].name, '10% Summer Sale');
  assert.equal(bill.discountLines[0].amount, 100);
  assert.equal(bill.discountAmount, 100);
  assert.equal(bill.discount, true);
});

test('mapOrderToTemp synthesizes fallback discount line from denormalized fields', () => {
  const order = {
    ...baseOrder,
    discount_amount: 150,
    discount_rate: 10,
    discount: { name: 'Staff Discount', value_type: 'percent' },
    order_discounts: [],
  };

  const bill = mapOrderToTemp(order);
  assert.equal(bill.discountLines.length, 1);
  assert.equal(bill.discountLines[0].name, '10% Staff Discount');
  assert.equal(bill.discountLines[0].amount, 150);
  assert.equal(bill.discountAmount, 150);
  assert.equal(bill.discount, true);
  assert.equal(bill.discountLabel, 'Discount (10% Staff Discount)');
});

test('mapOrderToTemp formats fixed amount discount with value before name', () => {
  const order = {
    ...baseOrder,
    discount_amount: 50,
    order_discounts: [{
      name: 'Flat Off',
      value_type: 'fixed_amount',
      applied_rate: 50,
      applied_amount: 50,
    }],
  };

  const bill = mapOrderToTemp(order);
  assert.equal(bill.discountLines.length, 1);
  assert.equal(bill.discountLines[0].name, '50 Flat Off');
});

test('mapOrderToTemp with no discount omits discount lines', () => {
  const order = {
    ...baseOrder,
    discount_amount: 0,
    order_discounts: [],
  };

  const bill = mapOrderToTemp(order);
  assert.equal(bill.discountLines.length, 0);
  assert.equal(bill.discount, false);
});
