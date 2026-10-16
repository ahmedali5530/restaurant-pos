import { describe, expect, it } from 'vitest';
import {
  counterKeyForPolicy,
  formatInvoiceDisplay,
  normalizeNumberPolicy,
  padSeq,
  policyFromPreset,
  policyRequiresGapAck,
  policyUsesLocalInvoicePool,
  terminalCodeFallback,
} from './number-policy.ts';

describe('number-policy', () => {
  it('defaults to date_reset / gateway / day', () => {
    const policy = normalizeNumberPolicy(null);
    expect(policy.preset).toBe('date_reset');
    expect(policy.mint).toBe('gateway');
    expect(policy.reset).toBe('day');
    expect(policy.scope).toBe('restaurant');
    expect(policy.template).toBe('{seq}');
    expect(policy.pending).toEqual({ mode: 'random', minChars: 6, maxChars: 6 });
  });

  it('applies preset defaults for global and composite', () => {
    expect(policyFromPreset('global').startAt).toBe(1001);
    expect(policyFromPreset('global').reset).toBe('never');
    expect(policyFromPreset('composite').template).toBe('{branch}-{terminal}-{yyyy}-{seq}');
    expect(policyFromPreset('pool').mint).toBe('terminal');
    expect(policyUsesLocalInvoicePool(policyFromPreset('pool'))).toBe(true);
    expect(policyRequiresGapAck(policyFromPreset('hybrid'))).toBe(true);
  });

  it('pads sequences', () => {
    expect(padSeq(7, 0)).toBe('7');
    expect(padSeq(7, 4)).toBe('0007');
    expect(padSeq(125, 5)).toBe('00125');
  });

  it('formats golden vectors', () => {
    const day = '2026-09-19';
    expect(formatInvoiceDisplay(policyFromPreset('date_reset'), { seq: 7, day })).toBe('7');
    expect(formatInvoiceDisplay(policyFromPreset('global'), { seq: 1001, day })).toBe('1001');
    expect(formatInvoiceDisplay(policyFromPreset('period'), { seq: 1, day })).toBe('2026-000001');
    expect(formatInvoiceDisplay(
      { ...policyFromPreset('branch'), branchCode: 'LHR' },
      { seq: 1, day },
    )).toBe('LHR-001');
    expect(formatInvoiceDisplay(policyFromPreset('prefix'), { seq: 1, day })).toBe('INV-001');
    expect(formatInvoiceDisplay(
      { ...policyFromPreset('composite'), branchCode: 'LHR' },
      { seq: 125, day, terminal: 'T02' },
    )).toBe('LHR-T02-2026-00125');
    expect(formatInvoiceDisplay(
      policyFromPreset('date_reset'),
      { seq: 1, day, template: '{yyyy}{mm}{dd}-{seq}', pad: 3 },
    )).toBe('20260919-001');
  });

  it('builds counter keys by scope and reset', () => {
    const day = '2026-09-19';
    expect(counterKeyForPolicy(policyFromPreset('date_reset'), { day }))
      .toBe('invoice_restaurant_20260919');
    expect(counterKeyForPolicy(policyFromPreset('global'), { day }))
      .toBe('invoice_restaurant_forever');
    expect(counterKeyForPolicy(policyFromPreset('period'), { day }))
      .toBe('invoice_restaurant_2026');
    expect(counterKeyForPolicy(
      { ...policyFromPreset('period'), reset: 'month' },
      { day },
    )).toBe('invoice_restaurant_202609');
    expect(counterKeyForPolicy(
      { ...policyFromPreset('branch'), branchCode: 'LHR' },
      { day },
    )).toBe('invoice_branch_LHR_forever');
    expect(counterKeyForPolicy(policyFromPreset('terminal'), { day, terminalCode: 'T1' }))
      .toBe('invoice_term_T1_forever');
  });

  it('falls back terminal codes from terminalId', () => {
    expect(terminalCodeFallback('terminal-abcd1234')).toBe('ABCD');
    expect(terminalCodeFallback('')).toBe('TERM');
  });
});
