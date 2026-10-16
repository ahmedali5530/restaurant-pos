'use strict';

/**
 * CJS twin of src/lib/number-policy.ts — keep format/scope-key logic in sync.
 * Gateway loads this so Surreal minting does not depend on the Vite bundle.
 */

const NUMBER_POLICY_KEY = 'number_policy';

const DEFAULT_NUMBER_POLICY = {
  preset: 'date_reset',
  mint: 'gateway',
  reset: 'day',
  scope: 'restaurant',
  startAt: 1,
  pad: 0,
  template: '{seq}',
  prefix: '',
  suffix: '',
  branchCode: '',
  pending: { mode: 'random', minChars: 6, maxChars: 6 },
  fiscal: 'same_int',
};

const GAP_RISK_PRESETS = new Set(['terminal', 'pool', 'hybrid']);

const PRESET_DEFAULTS = {
  date_reset: {
    mint: 'gateway',
    reset: 'day',
    scope: 'restaurant',
    template: '{seq}',
    fiscal: 'same_int',
  },
  global: {
    mint: 'gateway',
    reset: 'never',
    scope: 'restaurant',
    startAt: 1001,
    template: '{seq}',
    fiscal: 'same_int',
  },
  period: {
    mint: 'gateway',
    reset: 'year',
    scope: 'restaurant',
    pad: 6,
    template: '{yyyy}-{seq}',
    fiscal: 'same_int',
  },
  branch: {
    mint: 'gateway',
    reset: 'never',
    scope: 'branch',
    pad: 3,
    template: '{branch}-{seq}',
    fiscal: 'same_int',
  },
  terminal: {
    mint: 'gateway',
    reset: 'never',
    scope: 'terminal',
    pad: 3,
    template: '{terminal}-{seq}',
    fiscal: 'none',
  },
  prefix: {
    mint: 'gateway',
    reset: 'never',
    scope: 'restaurant',
    prefix: 'INV-',
    pad: 3,
    template: '{prefix}{seq}',
    fiscal: 'same_int',
  },
  composite: {
    mint: 'gateway',
    reset: 'year',
    scope: 'restaurant',
    pad: 5,
    template: '{branch}-{terminal}-{yyyy}-{seq}',
    fiscal: 'same_int',
  },
  pool: {
    mint: 'terminal',
    reset: 'day',
    scope: 'restaurant',
    template: '{seq}',
    fiscal: 'none',
  },
  hybrid: {
    mint: 'hybrid',
    reset: 'day',
    scope: 'restaurant',
    template: '{seq}',
    fiscal: 'none',
  },
  fiscal_plus_posr: {
    mint: 'gateway',
    reset: 'day',
    scope: 'restaurant',
    prefix: 'POS-',
    pad: 5,
    template: '{prefix}{seq}',
    fiscal: 'same_int',
  },
  provider_defined: {
    mint: 'gateway',
    reset: 'day',
    scope: 'restaurant',
    template: '{seq}',
    fiscal: 'same_int',
  },
};

function asFiniteInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function clampChars(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function policyFromPreset(preset) {
  const base = PRESET_DEFAULTS[preset] || PRESET_DEFAULTS.date_reset;
  return normalizeNumberPolicy({
    ...DEFAULT_NUMBER_POLICY,
    ...base,
    preset,
  });
}

function normalizeNumberPolicy(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const preset = typeof src.preset === 'string' && PRESET_DEFAULTS[src.preset]
    ? src.preset
    : DEFAULT_NUMBER_POLICY.preset;

  const pendingRaw = src.pending && typeof src.pending === 'object' ? src.pending : {};
  let minChars = clampChars(asFiniteInt(pendingRaw.minChars, 6), 4, 12);
  let maxChars = clampChars(asFiniteInt(pendingRaw.maxChars, minChars), 4, 12);
  if (maxChars < minChars) maxChars = minChars;

  const mint = ['gateway', 'terminal', 'hybrid'].includes(String(src.mint))
    ? src.mint
    : DEFAULT_NUMBER_POLICY.mint;
  const reset = ['never', 'day', 'month', 'year'].includes(String(src.reset))
    ? src.reset
    : DEFAULT_NUMBER_POLICY.reset;
  const scope = ['restaurant', 'branch', 'terminal'].includes(String(src.scope))
    ? src.scope
    : DEFAULT_NUMBER_POLICY.scope;
  const fiscal = src.fiscal === 'none' ? 'none' : 'same_int';

  return {
    preset,
    mint,
    reset,
    scope,
    startAt: Math.max(1, asFiniteInt(src.startAt, DEFAULT_NUMBER_POLICY.startAt)),
    pad: clampChars(asFiniteInt(src.pad, 0), 0, 12),
    template: String(src.template || DEFAULT_NUMBER_POLICY.template),
    prefix: String(src.prefix ?? ''),
    suffix: String(src.suffix ?? ''),
    branchCode: String(src.branchCode ?? '').trim().toUpperCase(),
    pending: {
      mode: pendingRaw.mode === 'blank' ? 'blank' : 'random',
      minChars,
      maxChars,
    },
    fiscal,
    acknowledgeGaps: Boolean(src.acknowledgeGaps),
  };
}

function isGapRiskPreset(preset) {
  return GAP_RISK_PRESETS.has(preset);
}

function policyRequiresGapAck(policy) {
  return isGapRiskPreset(policy.preset) || policy.mint === 'terminal' || policy.mint === 'hybrid';
}

function policyUsesLocalInvoicePool(policy) {
  return policy.mint === 'terminal' || policy.mint === 'hybrid';
}

function sanitizeCode(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16);
  return cleaned || fallback;
}

function counterKeyForPolicy(policy, ctx) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(ctx.day)
    ? ctx.day
    : new Date().toISOString().slice(0, 10);
  const year = day.slice(0, 4);
  const month = day.slice(0, 7).replace('-', '');

  let resetPart = 'forever';
  if (policy.reset === 'day') resetPart = day.replace(/-/g, '');
  else if (policy.reset === 'month') resetPart = month;
  else if (policy.reset === 'year') resetPart = year;

  const branch = sanitizeCode(ctx.branchCode || policy.branchCode, 'BRANCH');
  const terminal = sanitizeCode(ctx.terminalCode || '', 'TERM');

  if (policy.scope === 'branch') {
    return `invoice_branch_${branch}_${resetPart}`;
  }
  if (policy.scope === 'terminal') {
    return `invoice_term_${terminal}_${resetPart}`;
  }
  return `invoice_restaurant_${resetPart}`;
}

function padSeq(seq, pad) {
  const n = Math.max(0, Math.floor(Number(seq) || 0));
  const width = Math.max(0, Math.floor(Number(pad) || 0));
  const raw = String(n);
  if (width <= 0) return raw;
  return raw.padStart(width, '0');
}

function formatInvoiceDisplay(policy, ctx) {
  const day = ctx.day && /^\d{4}-\d{2}-\d{2}$/.test(ctx.day)
    ? ctx.day
    : new Date().toISOString().slice(0, 10);
  const yyyy = day.slice(0, 4);
  const mm = day.slice(5, 7);
  const dd = day.slice(8, 10);
  const pad = ctx.pad ?? policy.pad;
  const prefix = ctx.prefix ?? policy.prefix ?? '';
  const suffix = ctx.suffix ?? policy.suffix ?? '';
  const branch = sanitizeCode(ctx.branch || policy.branchCode, '');
  const terminal = sanitizeCode(ctx.terminal || '', '');
  const seq = padSeq(ctx.seq, pad);
  const template = ctx.template || policy.template || '{seq}';

  return template
    .split('{prefix}').join(prefix)
    .split('{suffix}').join(suffix)
    .split('{yyyy}').join(yyyy)
    .split('{mm}').join(mm)
    .split('{dd}').join(dd)
    .split('{branch}').join(branch)
    .split('{terminal}').join(terminal)
    .split('{seq}').join(seq);
}

function resolvePendingLength(policy) {
  const { minChars, maxChars } = policy.pending;
  if (minChars === maxChars) return minChars;
  const span = maxChars - minChars + 1;
  return minChars + Math.floor(Math.random() * span);
}

function terminalCodeFallback(terminalId) {
  const raw = String(terminalId || '').replace(/^terminal-?/i, '');
  return sanitizeCode(raw.slice(0, 4), 'TERM');
}

module.exports = {
  NUMBER_POLICY_KEY,
  DEFAULT_NUMBER_POLICY,
  GAP_RISK_PRESETS,
  policyFromPreset,
  normalizeNumberPolicy,
  isGapRiskPreset,
  policyRequiresGapAck,
  policyUsesLocalInvoicePool,
  counterKeyForPolicy,
  padSeq,
  formatInvoiceDisplay,
  resolvePendingLength,
  terminalCodeFallback,
};
