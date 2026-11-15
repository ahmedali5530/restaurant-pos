'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapOrderToTemp, mapOrderToFinal } = require('./order-mapping');

const baseOrder = {
  invoice_number: 42,
  created_at: '2026-11-02T12:00:00Z',
  items: [{ quantity: 1, price: 100, item: { name: 'Burger' } }],
  tax_amount: 0,
  service_charge_amount: 0,
  tip_amount: 0,
  customer: {
    id: 'customer:1',
    name: 'Ada Lovelace',
    phone: 5551234,
    address: '12 Analytical Engine Rd',
  },
};

test('mapOrderToTemp includes attached customer details', () => {
  const bill = mapOrderToTemp(baseOrder);
  assert.equal(bill.customerName, 'Ada Lovelace');
  assert.equal(bill.phone, '5551234');
  assert.equal(bill.address, '12 Analytical Engine Rd');
});

test('mapOrderToFinal includes attached customer details', () => {
  const bill = mapOrderToFinal(baseOrder);
  assert.equal(bill.customerName, 'Ada Lovelace');
  assert.equal(bill.phone, '5551234');
  assert.equal(bill.address, '12 Analytical Engine Rd');
});

test('mapOrderToTemp omits customer fields when none attached', () => {
  const bill = mapOrderToTemp({ ...baseOrder, customer: undefined });
  assert.equal(bill.customerName, undefined);
  assert.equal(bill.phone, undefined);
  assert.equal(bill.address, undefined);
});

test('mapOrderToTemp ignores bare customer record ids', () => {
  const bill = mapOrderToTemp({ ...baseOrder, customer: 'customer:1' });
  assert.equal(bill.customerName, undefined);
  assert.equal(bill.phone, undefined);
  assert.equal(bill.address, undefined);
});
