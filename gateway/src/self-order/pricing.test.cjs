'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { priceLine, summarize, normalizeUnitPrice } = require('./pricing');

const gst17 = { id: 'tax:a', name: 'GST', rate: 17 };
const gst5 = { id: 'tax:b', name: 'GST', rate: 5 };

test('exclusive line without order tax is untaxed', () => {
  const line = priceLine({ price: 799, tax_mode: 'exclusive', taxes: null }, 2, [], null);
  assert.equal(line.netPrice, 799);
  assert.equal(line.lineNet, 1598);
  assert.equal(line.storedTax, 0);
  assert.deepEqual(line.lineTaxes, []);
  assert.equal(summarize([line]).total, 1598);
});

test('exclusive line picks up the order-level tax', () => {
  const line = priceLine({ price: 1000, tax_mode: 'exclusive' }, 1, [{ price: 200 }], gst5);
  assert.equal(line.netUnitBase, 1200);
  assert.equal(line.storedTax, 0);
  const summary = summarize([line]);
  assert.equal(summary.taxAmount, 60);
  assert.equal(summary.total, 1260);
});

test('inclusive line is stored net and taxed with its menu taxes', () => {
  const line = priceLine({ price: 1170, tax_mode: 'inclusive', taxes: [gst17] }, 1, [], gst5);
  assert.equal(line.netPrice, 1000);
  assert.equal(line.storedTax, 170);
  const summary = summarize([line]);
  assert.equal(summary.subtotal, 1000);
  assert.equal(summary.taxAmount, 170);
  assert.equal(summary.total, 1170);
});

test('inclusive modifiers inherit the parent tax context', () => {
  const line = priceLine({ price: 1170, tax_mode: 'inclusive', taxes: [gst17] }, 2, [{ price: 234 }], null);
  assert.equal(line.netModifiers[0], 200);
  assert.equal(line.netUnitBase, 1200);
  assert.equal(line.storedTax, 408);
  assert.equal(summarize([line]).total, 2808);
});

test('tax rows aggregate per tax across lines', () => {
  const a = priceLine({ price: 1170, tax_mode: 'inclusive', taxes: [gst17] }, 1, [], gst5);
  const b = priceLine({ price: 100, tax_mode: 'exclusive' }, 3, [], gst5);
  const rows = summarize([a, b]).taxRows;
  assert.deepEqual(
    rows.map((r) => [r.tax.id, r.amount]),
    [['tax:a', 170], ['tax:b', 15]],
  );
});

test('normalizeUnitPrice leaves exclusive prices alone', () => {
  assert.equal(normalizeUnitPrice(499, 'exclusive', [gst17]), 499);
});
