'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  counterKeyForPolicy,
  formatInvoiceDisplay,
  normalizeNumberPolicy,
  policyFromPreset,
} = require('./number-policy');

test('CJS twin matches TS golden format vectors', () => {
  const day = '2026-09-19';
  assert.equal(formatInvoiceDisplay(policyFromPreset('date_reset'), { seq: 7, day }), '7');
  assert.equal(formatInvoiceDisplay(policyFromPreset('period'), { seq: 1, day }), '2026-000001');
  assert.equal(
    formatInvoiceDisplay(
      { ...policyFromPreset('composite'), branchCode: 'LHR' },
      { seq: 125, day, terminal: 'T02' },
    ),
    'LHR-T02-2026-00125',
  );
  assert.equal(
    counterKeyForPolicy(policyFromPreset('date_reset'), { day }),
    'invoice_restaurant_20260919',
  );
  assert.equal(
    counterKeyForPolicy(policyFromPreset('terminal'), { day, terminalCode: 'T1' }),
    'invoice_term_T1_forever',
  );
  const policy = normalizeNumberPolicy({ preset: 'bogus' });
  assert.equal(policy.preset, 'date_reset');
});
