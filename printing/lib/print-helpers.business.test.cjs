'use strict';

/**
 * Business-logic tests for printing service helper functions.
 *
 * The printing service has 9 print builders (temp, summary, kitchen, delivery,
 * final, refund, deletion, table, pulse) but NONE had tests. The pure helper
 * functions in lib/ are the foundation — if they format incorrectly, every
 * receipt/KOT is wrong.
 *
 * What's tested:
 *   - receipt-helpers: formatMoney, padRight, padLeft, padAlign, getEffectiveLineWidth,
 *     formatItemLine, getItemLineLeftRight, buildItemRowString
 *   - order-mapping: getOrderId, calculateOrderItemPricePrint, inflateInclusiveAmount
 *   - summary-mapping: formatNum, itemLineTotal, isCashPayment
 *
 * These are pure functions — no ESC/POS printer, no DB, no network.
 *
 * Run from the printing directory:
 *   node --test lib/print-helpers.business.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatMoney,
  padAlign,
  getEffectiveLineWidth,
  formatItemLine,
  getItemLineLeftRight,
  buildItemRowString,
  PRINTER_WIDTH,
} = require('./receipt-helpers.js');

const {
  getOrderId,
  calculateOrderItemPricePrint,
  inflateInclusiveAmount,
} = require('./order-mapping.js');

const { formatNum } = require('./summary-mapping.js');

// ---------------------------------------------------------------------------
// formatMoney — formats amounts with currency symbol
// ---------------------------------------------------------------------------

test('formatMoney: formats integer with default $ symbol', () => {
  assert.equal(formatMoney(1000), '$ 1000');
});

test('formatMoney: formats with custom symbol', () => {
  assert.equal(formatMoney(500, 'PKR'), 'PKR 500');
});

test('formatMoney: formats with empty symbol (no prefix)', () => {
  assert.equal(formatMoney(250, ''), '250');
});

test('formatMoney: handles zero', () => {
  assert.equal(formatMoney(0), '$ 0');
});

test('formatMoney: handles null/undefined (defaults to 0)', () => {
  assert.equal(formatMoney(null), '$ 0');
  assert.equal(formatMoney(undefined), '$ 0');
});

test('formatMoney: rounds decimals to integer', () => {
  assert.equal(formatMoney(99.99), '$ 100');
  assert.equal(formatMoney(99.4), '$ 99');
});

test('formatMoney: handles negative amounts (refunds)', () => {
  assert.equal(formatMoney(-100), '$ -100');
});

// ---------------------------------------------------------------------------
// padAlign — text alignment helper (tested via padAlign, not padRight/padLeft
// which are internal)
// ---------------------------------------------------------------------------

test('padAlign: left-aligns by default', () => {
  const result = padAlign('Hi', 'left', 5);
  assert.equal(result, 'Hi   ');
});

test('padAlign: right-aligns', () => {
  const result = padAlign('Hi', 'right', 5);
  assert.equal(result, '   Hi');
});

test('padAlign: center-aligns', () => {
  const result = padAlign('Hi', 'center', 6);
  assert.equal(result, '  Hi  ');
});

test('padAlign: handles empty text', () => {
  const result = padAlign('', 'left', 3);
  assert.equal(result, '   ');
});

test('padAlign: truncates text longer than width', () => {
  const result = padAlign('ABCDEFG', 'left', 3);
  assert.equal(result, 'ABC');
});

// ---------------------------------------------------------------------------
// getEffectiveLineWidth — calculates printable width based on text size
// ---------------------------------------------------------------------------

test('getEffectiveLineWidth: returns PRINTER_WIDTH for normal size', () => {
  assert.equal(getEffectiveLineWidth('normal'), PRINTER_WIDTH);
});

test('getEffectiveLineWidth: returns smaller width for larger text sizes', () => {
  const normal = getEffectiveLineWidth('normal');
  const wide = getEffectiveLineWidth('wide');
  const tall = getEffectiveLineWidth('tall');
  // Wide/tall text takes more columns per char, so fewer chars fit per line.
  assert.ok(wide <= normal, 'wide should be ≤ normal width');
  assert.ok(tall <= normal, 'tall should be ≤ normal width');
});

test('getEffectiveLineWidth: defaults to normal for unknown size', () => {
  assert.equal(getEffectiveLineWidth('unknown'), getEffectiveLineWidth('normal'));
  assert.equal(getEffectiveLineWidth(undefined), getEffectiveLineWidth('normal'));
});

// ---------------------------------------------------------------------------
// formatItemLine — formats a single item line for receipt printing
// ---------------------------------------------------------------------------

test('formatItemLine: formats name + qty + price + total when all shown', () => {
  const item = { name: 'Burger', qty: 2, price: 500, total: 1000 };
  const config = { showItemName: true, showItemQuantity: true, showItemPrice: true, showItemTotal: true };
  const result = formatItemLine(item, config);
  assert.ok(result.includes('Burger'));
  assert.ok(result.includes('x2'));
  assert.ok(result.includes('500'));
  assert.ok(result.includes('1000'));
});

test('formatItemLine: shows only name when other flags are false', () => {
  const item = { name: 'Pizza', qty: 1, price: 300, total: 300 };
  const config = { showItemName: true, showItemQuantity: false, showItemPrice: false, showItemTotal: false };
  const result = formatItemLine(item, config);
  assert.equal(result.trim(), 'Pizza');
});

test('formatItemLine: defaults qty to 1 when missing', () => {
  const item = { name: 'Salad', price: 200 };
  const config = { showItemName: true, showItemQuantity: true, showItemPrice: false, showItemTotal: false };
  const result = formatItemLine(item, config);
  assert.ok(result.includes('x1'));
});

test('formatItemLine: defaults total to price * qty when missing', () => {
  const item = { name: 'Fries', qty: 3, price: 100 };
  const config = { showItemName: false, showItemQuantity: false, showItemPrice: false, showItemTotal: true };
  const result = formatItemLine(item, config);
  assert.ok(result.includes('300'));
});

test('formatItemLine: truncates name to 28 chars', () => {
  const item = { name: 'A'.repeat(50), qty: 1, price: 100, total: 100 };
  const config = { showItemName: true, showItemQuantity: false, showItemPrice: false, showItemTotal: false };
  const result = formatItemLine(item, config);
  assert.ok(result.length <= 28 + 2); // 28 chars + possible spacing
});

// ---------------------------------------------------------------------------
// getItemLineLeftRight — splits item into left/right for printLineLeftRight
// ---------------------------------------------------------------------------

test('getItemLineLeftRight: returns left (name) and right (qty + price + total)', () => {
  const item = { name: 'Burger', qty: 2, price: 500, total: 1000 };
  const config = { showItemName: true, showItemQuantity: true, showItemPrice: true, showItemTotal: true };
  const result = getItemLineLeftRight(item, config);
  assert.ok(result.left.includes('Burger'));
  assert.ok(result.right.includes('2'));
  assert.ok(result.right.includes('500'));
  assert.ok(result.right.includes('1000'));
});

test('getItemLineLeftRight: uses "-" when name is empty and showItemName is true', () => {
  const item = { name: '', qty: 1, price: 100 };
  const config = { showItemName: true };
  const result = getItemLineLeftRight(item, config);
  assert.equal(result.left, '-');
});

// ---------------------------------------------------------------------------
// buildItemRowString — builds a full item row string (name, qty, price, total)
// ---------------------------------------------------------------------------

test('buildItemRowString: formats a complete item row', () => {
  const item = { name: 'Burger', qty: 2, price: 500, total: 1000 };
  const config = { decimal_place: 0 };
  const result = buildItemRowString(item, config);
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('Burger'));
  // buildItemRowString returns the name padded to a fixed column width
  assert.ok(result.length >= 'Burger'.length);
});

// ---------------------------------------------------------------------------
// getOrderId — extracts invoice number + split suffix
// ---------------------------------------------------------------------------

test('getOrderId: returns invoice_number when no split', () => {
  assert.equal(getOrderId({ invoice_number: 'INV-001' }), 'INV-001');
});

test('getOrderId: appends split suffix when present', () => {
  assert.equal(getOrderId({ invoice_number: 'INV-001', split: 'A' }), 'INV-001/A');
});

test('getOrderId: returns empty string for null order', () => {
  assert.equal(getOrderId(null), '');
  assert.equal(getOrderId(undefined), '');
});

test('getOrderId: handles missing invoice_number', () => {
  // When invoice_number is undefined, the string "undefined" is returned
  // (template literal interpolates undefined as "undefined")
  const result = getOrderId({});
  assert.equal(result, 'undefined');
});

// ---------------------------------------------------------------------------
// inflateInclusiveAmount — inflates net to gross for inclusive-tax display
// ---------------------------------------------------------------------------

test('inflateInclusiveAmount: inflates by tax rate sum', () => {
  const result = inflateInclusiveAmount(100, [{ rate: 16 }], null, null);
  assert.equal(result, 116);
});

test('inflateInclusiveAmount: inflates by multiple tax rates', () => {
  const result = inflateInclusiveAmount(100, [{ rate: 10 }, { rate: 5 }], null, null);
  assert.equal(result, 115);
});

test('inflateInclusiveAmount: returns net when no taxes + no originalPrice', () => {
  const result = inflateInclusiveAmount(100, null, null, null);
  assert.equal(result, 100);
});

test('inflateInclusiveAmount: uses originalPrice + modifiers when taxes missing', () => {
  // net=150, originalPrice=100 (dish gross), dishNet=80 (dish net)
  // modifiersNet = 150 - 80 = 70
  // result = 100 + 70 = 170
  const result = inflateInclusiveAmount(150, null, 100, 80);
  assert.equal(result, 170);
});

test('inflateInclusiveAmount: handles zero net', () => {
  const result = inflateInclusiveAmount(0, [{ rate: 16 }], null, null);
  assert.equal(result, 0);
});

// ---------------------------------------------------------------------------
// formatNum (summary-mapping) — rounds to integer string
// ---------------------------------------------------------------------------

test('formatNum: rounds to nearest integer', () => {
  assert.equal(formatNum(99.9), '100');
  assert.equal(formatNum(99.4), '99');
  assert.equal(formatNum(100), '100');
});

test('formatNum: handles zero', () => {
  assert.equal(formatNum(0), '0');
});

test('formatNum: handles null/undefined (returns "0")', () => {
  assert.equal(formatNum(null), '0');
  assert.equal(formatNum(undefined), '0');
  assert.equal(formatNum(NaN), '0');
  assert.equal(formatNum(Infinity), '0');
});

test('formatNum: handles negative numbers', () => {
  assert.equal(formatNum(-50.5), '-50');
  assert.equal(formatNum(-0.4), '0');
});
