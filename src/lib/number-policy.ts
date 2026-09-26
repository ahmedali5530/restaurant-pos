/**
 * Restaurant invoice number policy — one engine for scope, reset, format, mint,
 * and pending labels. See ADR 0001 v1.2.
 */

export const NUMBER_POLICY_KEY = 'number_policy';

export type NumberPolicyPreset =
  | 'date_reset'
  | 'global'
  | 'period'
  | 'branch'
  | 'terminal'
  | 'prefix'
  | 'composite'
  | 'pool'
  | 'hybrid'
  | 'fiscal_plus_posr'
  | 'provider_defined';

export type NumberPolicyMint = 'gateway' | 'terminal' | 'hybrid';
export type NumberPolicyReset = 'never' | 'day' | 'month' | 'year';
export type NumberPolicyScope = 'restaurant' | 'branch' | 'terminal';
export type NumberPolicyFiscal = 'same_int' | 'none';

export interface NumberPolicyPending {
  mode: 'random' | 'blank';
  minChars: number;
  maxChars: number;
}

export interface NumberPolicy {
  preset: NumberPolicyPreset;
  mint: NumberPolicyMint;
  reset: NumberPolicyReset;
  scope: NumberPolicyScope;
  startAt: number;
  pad: number;
  template: string;
  prefix: string;
  suffix: string;
  branchCode: string;
  pending: NumberPolicyPending;
  fiscal: NumberPolicyFiscal;
  /** Required to save terminal / pool / hybrid presets. */
  acknowledgeGaps?: boolean;
}

export interface FormatContext {
  seq: number;
  prefix?: string;
  suffix?: string;
  branch?: string;
  terminal?: string;
  /** Business day yyyy-MM-dd used for {yyyy}/{mm}/{dd}. */
  day?: string;
  pad?: number;
  template?: string;
}

export const DEFAULT_NUMBER_POLICY: NumberPolicy = {
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

/** Presets that create restaurant-wide holes — save requires acknowledgeGaps. */
export const GAP_RISK_PRESETS: ReadonlySet<NumberPolicyPreset> = new Set([
  'terminal',
  'pool',
  'hybrid',
]);

const PRESET_DEFAULTS: Record<NumberPolicyPreset, Partial<NumberPolicy>> = {
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

function asFiniteInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function clampChars(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Apply a named preset over defaults (does not clear acknowledgeGaps). */
export function policyFromPreset(preset: NumberPolicyPreset): NumberPolicy {
  const base = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.date_reset;
  return normalizeNumberPolicy({
    ...DEFAULT_NUMBER_POLICY,
    ...base,
    preset,
  });
}

/** Coerce raw setting.values into a safe NumberPolicy. */
export function normalizeNumberPolicy(raw: unknown): NumberPolicy {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const preset = (
    typeof src.preset === 'string' && src.preset in PRESET_DEFAULTS
      ? src.preset
      : DEFAULT_NUMBER_POLICY.preset
  ) as NumberPolicyPreset;

  const pendingRaw = src.pending && typeof src.pending === 'object'
    ? (src.pending as Record<string, unknown>)
    : {};
  let minChars = clampChars(asFiniteInt(pendingRaw.minChars, 6), 4, 12);
  let maxChars = clampChars(asFiniteInt(pendingRaw.maxChars, minChars), 4, 12);
  if (maxChars < minChars) maxChars = minChars;

  const mint = (['gateway', 'terminal', 'hybrid'].includes(String(src.mint))
    ? src.mint
    : DEFAULT_NUMBER_POLICY.mint) as NumberPolicyMint;
  const reset = (['never', 'day', 'month', 'year'].includes(String(src.reset))
    ? src.reset
    : DEFAULT_NUMBER_POLICY.reset) as NumberPolicyReset;
  const scope = (['restaurant', 'branch', 'terminal'].includes(String(src.scope))
    ? src.scope
    : DEFAULT_NUMBER_POLICY.scope) as NumberPolicyScope;
  const fiscal = (src.fiscal === 'none' ? 'none' : 'same_int') as NumberPolicyFiscal;

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

export function isGapRiskPreset(preset: NumberPolicyPreset): boolean {
  return GAP_RISK_PRESETS.has(preset);
}

export function policyRequiresGapAck(policy: NumberPolicy): boolean {
  return isGapRiskPreset(policy.preset) || policy.mint === 'terminal' || policy.mint === 'hybrid';
}

/** Whether the terminal should reserve/consume local invoice ints. */
export function policyUsesLocalInvoicePool(policy: NumberPolicy): boolean {
  return policy.mint === 'terminal' || policy.mint === 'hybrid';
}

function sanitizeCode(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16);
  return cleaned || fallback;
}

/**
 * Counter key for sync_number_counter (without table prefix).
 * Examples: invoice_restaurant_20260919, invoice_branch_LHR, invoice_term_T1_2026
 */
export function counterKeyForPolicy(
  policy: NumberPolicy,
  ctx: { day: string; terminalCode?: string; branchCode?: string },
): string {
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

export function padSeq(seq: number, pad: number): string {
  const n = Math.max(0, Math.floor(Number(seq) || 0));
  const width = Math.max(0, Math.floor(Number(pad) || 0));
  const raw = String(n);
  if (width <= 0) return raw;
  return raw.padStart(width, '0');
}

/** Render template tokens. Snapshot result onto order.invoice_display at mint. */
export function formatInvoiceDisplay(
  policy: Pick<NumberPolicy, 'template' | 'prefix' | 'suffix' | 'pad' | 'branchCode'>,
  ctx: FormatContext,
): string {
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
    .replaceAll('{prefix}', prefix)
    .replaceAll('{suffix}', suffix)
    .replaceAll('{yyyy}', yyyy)
    .replaceAll('{mm}', mm)
    .replaceAll('{dd}', dd)
    .replaceAll('{branch}', branch)
    .replaceAll('{terminal}', terminal)
    .replaceAll('{seq}', seq);
}

export function resolvePendingLength(policy: NumberPolicy): number {
  const { minChars, maxChars } = policy.pending;
  if (minChars === maxChars) return minChars;
  const span = maxChars - minChars + 1;
  return minChars + Math.floor(Math.random() * span);
}

export function terminalCodeFallback(terminalId: string): string {
  const raw = String(terminalId || '').replace(/^terminal-?/i, '');
  return sanitizeCode(raw.slice(0, 4), 'TERM');
}
