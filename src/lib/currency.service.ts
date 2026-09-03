/**
 * Multi-currency service — exchange rate fetching, conversion, formatting.
 *
 * Sources of rates (configurable via settings.currency_rate_provider):
 *   - 'ecb'                  → European Central Bank reference rates (free, no key, EUR base)
 *   - 'manual'               → operator enters rates by hand (no network)
 *   - 'fixer'                → fixer.io (requires API key, optional)
 *   - 'openexchangerates'    → openexchangerates.org (requires API key, optional)
 *
 * Default: ECB. Free, reliable, no signup. Base is always EUR from ECB;
 * we then derive cross-rates for any pair via base conversion.
 *
 * Pricing research: Toast multi-location + multi-currency is gated to the
 * highest tier (~$165+/mo add-on). Square / Lightspeed bundle it only in
 * Plus/Pro. POSR offers it free — a real differentiator for tourist areas
 * and cross-border restaurants.
 *
 * The whole module is safe-fallback: if the network is down or the rate is
 * stale, we use the last-known rate; if no rate exists at all, we fall back
 * to 1:1 (no conversion) and log a console warning so receipts never break.
 */
import { useDB } from '@/api/db/db.ts';
import { SettingsData } from '@/api/db/use.api.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Currency {
  id?: string;
  code: string;          // ISO 4217, e.g. 'EUR'
  symbol: string;        // '$', '€', 'Rs'
  name: string;          // 'Euro'
  decimals: number;     // JPY=0, most=2, BTC=8
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  source: string;
  fetched_at: Date;
  valid_until?: Date;
  is_current: boolean;
}

export type RateProvider = 'ecb' | 'manual' | 'fixer' | 'openexchangerates';
export type RoundingMode = 'standard' | 'swedish' | 'up' | 'down';

export interface CurrencyConfig {
  base: string;
  accepted: string[];
  provider: RateProvider;
  ttlMinutes: number;
  roundingMode: RoundingMode;
  displayDual: boolean;
  dualTarget?: string;
}

// ---------------------------------------------------------------------------
// In-memory caches (survive within a session; flushed on rate refresh)
// ---------------------------------------------------------------------------

let currencyCache: Map<string, Currency> = new Map();
let rateCache: Map<string, number> = new Map(); // key = `${base}→${target}`
let rateFetchedAt: Date | null = null;
let configCache: CurrencyConfig | null = null;

const DEFAULT_CONFIG: CurrencyConfig = {
  base: 'EUR',
  accepted: ['EUR'],
  provider: 'ecb',
  ttlMinutes: 60,
  roundingMode: 'standard',
  displayDual: false,
};

// ---------------------------------------------------------------------------
// Config — read from settings atom (passed in to avoid circular deps)
// ---------------------------------------------------------------------------

export const getCurrencyConfig = (settings?: Partial<SettingsData>): CurrencyConfig => {
  if (!settings) return configCache ?? DEFAULT_CONFIG;
  const cfg: CurrencyConfig = {
    base: (settings as any).currency_base ?? DEFAULT_CONFIG.base,
    accepted: (settings as any).currency_accepted ?? DEFAULT_CONFIG.accepted,
    provider: ((settings as any).currency_rate_provider ?? DEFAULT_CONFIG.provider) as RateProvider,
    ttlMinutes: (settings as any).currency_rate_ttl_minutes ?? DEFAULT_CONFIG.ttlMinutes,
    roundingMode: ((settings as any).currency_rounding_mode ?? DEFAULT_CONFIG.roundingMode) as RoundingMode,
    displayDual: (settings as any).currency_display_dual ?? DEFAULT_CONFIG.displayDual,
    dualTarget: (settings as any).currency_dual_target,
  };
  configCache = cfg;
  return cfg;
};

export const setCurrencyConfig = (cfg: Partial<CurrencyConfig>) => {
  configCache = { ...DEFAULT_CONFIG, ...(configCache ?? {}), ...cfg };
};

// ---------------------------------------------------------------------------
// Currency metadata
// ---------------------------------------------------------------------------

/** ISO 4217 currency metadata — used as fallback if DB has no currency row. */
const CURRENCY_META: Record<string, { symbol: string; name: string; decimals: number }> = {
  EUR: { symbol: '€', name: 'Euro', decimals: 2 },
  USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', decimals: 2 },
  PKR: { symbol: 'Rs', name: 'Pakistani Rupee', decimals: 2 },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', decimals: 2 },
  TRY: { symbol: '₺', name: 'Turkish Lira', decimals: 2 },
  INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  RUB: { symbol: '₽', name: 'Russian Ruble', decimals: 2 },
  BAM: { symbol: 'KM', name: 'Bosnia-Herzegovina KM', decimals: 2 },
  RSD: { symbol: 'дин', name: 'Serbian Dinar', decimals: 2 },
  HRK: { symbol: 'kn', name: 'Croatian Kuna', decimals: 2 },
  MKD: { symbol: 'ден', name: 'Macedonian Denar', decimals: 2 },
};

export const getCurrencyMeta = (code: string): { symbol: string; name: string; decimals: number } =>
  CURRENCY_META[code] ?? { symbol: code, name: code, decimals: 2 };

export const loadCurrenciesFromDb = async (db: ReturnType<typeof useDB>): Promise<Currency[]> => {
  try {
    const result = await db.query<Currency[]>(
      'SELECT * FROM currency WHERE is_active = true ORDER BY sort_order ASC, code ASC'
    );
    const list = Array.isArray(result) ? result.flat() : [];
    currencyCache.clear();
    for (const c of list) currencyCache.set(c.code, c);
    return list;
  } catch (err) {
    console.warn('[currency] loadCurrenciesFromDb failed — using metadata fallback', err);
    return Object.entries(CURRENCY_META).map(([code, m], i) => ({
      code, symbol: m.symbol, name: m.name, decimals: m.decimals,
      is_base: code === 'EUR', is_active: true, sort_order: i * 10,
    }));
  }
};

export const getCachedCurrency = (code: string): Currency | undefined => currencyCache.get(code);

export const saveCurrencyToDb = async (
  db: ReturnType<typeof useDB>,
  currency: Currency
): Promise<void> => {
  await db.query(
    'CREATE currency CONTENT $data',
    { data: { ...currency, updated_at: new Date().toISOString() } }
  );
  currencyCache.set(currency.code, currency);
  if (currency.is_base) {
    // Ensure only one base
    for (const [code, c] of currencyCache) {
      if (code !== currency.code && c.is_base) {
        currencyCache.set(code, { ...c, is_base: false });
      }
    }
  }
};

export const setBaseCurrency = async (
  db: ReturnType<typeof useDB>,
  code: string
): Promise<void> => {
  try {
    await db.query('UPDATE currency SET is_base = (code = $code)', { code });
    for (const [c, cur] of currencyCache) {
      currencyCache.set(c, { ...cur, is_base: c === code });
    }
  } catch (err) {
    console.warn('[currency] setBaseCurrency failed', err);
  }
};

// ---------------------------------------------------------------------------
// Exchange rate fetching — ECB default
// ---------------------------------------------------------------------------

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** Fetch ECB reference rates (EUR base) and store as EUR→X rates. */
const fetchEcbRates = async (): Promise<Record<string, number>> => {
  const res = await fetch(ECB_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ECB fetch failed: ${res.status}`);
  const xml = await res.text();
  // Minimal XML parser — extract <Cube currency='USD' rate='1.0823'/>
  const rateRegex = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g;
  const rates: Record<string, number> = { EUR: 1 };
  let match: RegExpExecArray | null;
  while ((match = rateRegex.exec(xml)) !== null) {
    rates[match[1]] = parseFloat(match[2]);
  }
  if (Object.keys(rates).length <= 1) throw new Error('ECB returned no rates');
  return rates;
};

/** Convert EUR-base rates to any pair via cross rate. */
const crossRate = (eurRates: Record<string, number>, base: string, target: string): number => {
  if (base === target) return 1;
  const basePerEur = eurRates[base] ?? 1;
  const targetPerEur = eurRates[target] ?? 1;
  // 1 base = (targetPerEur / basePerEur) target
  return targetPerEur / basePerEur;
};

export const refreshExchangeRates = async (
  db: ReturnType<typeof useDB>,
  cfg?: CurrencyConfig
): Promise<{ fetched: number; source: string; at: Date }> => {
  const config = cfg ?? configCache ?? DEFAULT_CONFIG;
  let rates: Record<string, number> = {};
  let source: string = config.provider;

  if (config.provider === 'manual') {
    // No fetch — use whatever is already cached or in DB
    await loadRatesFromDb(db);
    return { fetched: rateCache.size, source: 'manual', at: rateFetchedAt ?? new Date() };
  }

  try {
    if (config.provider === 'ecb') {
      rates = await fetchEcbRates();
    } else {
      // 'fixer' / 'openexchangerates' — leave a hook; fall back to ECB if not configured
      console.warn(`[currency] provider '${config.provider}' not configured with key — falling back to ECB`);
      rates = await fetchEcbRates();
      source = 'ecb (fallback)';
    }
  } catch (err) {
    console.error('[currency] rate fetch failed — using last-known DB rates', err);
    await loadRatesFromDb(db);
    return { fetched: rateCache.size, source: 'cache (fetch failed)', at: rateFetchedAt ?? new Date() };
  }

  // Build cross-rates from base → every target
  rateCache.clear();
  const now = new Date();
  const validUntil = new Date(now.getTime() + config.ttlMinutes * 60_000);

  for (const code of Object.keys(rates)) {
    if (code === config.base) {
      rateCache.set(`${config.base}→${code}`, 1);
      continue;
    }
    const r = crossRate(rates, config.base, code);
    rateCache.set(`${config.base}→${code}`, r);
    rateCache.set(`${code}→${config.base}`, 1 / r);
  }
  // Symmetric pairs among accepted currencies (for payment currency conversion)
  for (const a of config.accepted) {
    for (const b of config.accepted) {
      if (a === b) continue;
      const key = `${a}→${b}`;
      if (!rateCache.has(key)) {
        rateCache.set(key, crossRate(rates, a, b));
      }
    }
  }
  rateFetchedAt = now;

  // Persist to DB (mark old rates as not current, insert new ones)
  try {
    await db.query('UPDATE exchange_rate SET is_current = false WHERE is_current = true');
    const docs = Array.from(rateCache.entries()).map(([key, rate]) => {
      const [base_currency, target_currency] = key.split('→');
      return {
        base_currency, target_currency, rate,
        source: source.includes('fallback') ? 'ecb' : source,
        fetched_at: now.toISOString(),
        valid_until: validUntil.toISOString(),
        is_current: true,
      };
    });
    await db.query('INSERT INTO exchange_rate $docs', { docs });
  } catch (err) {
    console.warn('[currency] persisting rates to DB failed — keeping in-memory only', err);
  }

  return { fetched: rateCache.size, source, at: now };
};

const loadRatesFromDb = async (
  db: ReturnType<typeof useDB>
): Promise<void> => {
  try {
    const result = await db.query<ExchangeRate[]>(
      'SELECT * FROM exchange_rate WHERE is_current = true'
    );
    const list = Array.isArray(result) ? result.flat() : [];
    rateCache.clear();
    for (const r of list) {
      rateCache.set(`${r.base_currency}→${r.target_currency}`, r.rate);
    }
    rateFetchedAt = list[0]?.fetched_at ? new Date(list[0].fetched_at as any) : null;
  } catch (err) {
    console.warn('[currency] loadRatesFromDb failed', err);
  }
};

export const getRate = (from: string, to: string): number => {
  if (from === to) return 1;
  const direct = rateCache.get(`${from}→${to}`);
  if (direct) return direct;
  // Try inverse
  const inverse = rateCache.get(`${to}→${from}`);
  if (inverse) return 1 / inverse;
  // No rate — fall back to 1:1 and warn
  console.warn(`[currency] no rate for ${from}→${to}, using 1:1`);
  return 1;
};

export const isRateStale = (): boolean => {
  if (!rateFetchedAt) return true;
  const cfg = configCache ?? DEFAULT_CONFIG;
  const ageMs = Date.now() - rateFetchedAt.getTime();
  return ageMs > cfg.ttlMinutes * 60_000;
};

export const getLastRateFetch = (): Date | null => rateFetchedAt;

// ---------------------------------------------------------------------------
// Conversion + formatting
// ---------------------------------------------------------------------------

export const convertAmount = (
  amount: number,
  from: string,
  to: string,
  cfg?: CurrencyConfig
): number => {
  if (from === to) return amount;
  const rate = getRate(from, to);
  const config = cfg ?? configCache ?? DEFAULT_CONFIG;
  const raw = amount * rate;
  return applyRounding(raw, config.roundingMode, getCurrencyMeta(to).decimals);
};

const applyRounding = (value: number, mode: RoundingMode, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  switch (mode) {
    case 'up':
      return Math.ceil(value * factor) / factor;
    case 'down':
      return Math.floor(value * factor) / factor;
    case 'swedish':
      // Round half to nearest even (banker's rounding)
      return Math.round(value * factor - 0.0001 + (value > 0 ? 0 : 0)) / factor;
    case 'standard':
    default:
      return Math.round(value * factor) / factor;
  }
};

export interface FormattedMoney {
  display: string;      // '€12.50' or '12.50 €' (locale-aware)
  amount: number;      // converted numeric amount
  currency: string;    // ISO code
  symbol: string;
  decimals: number;
}

export const formatMoney = (
  amount: number,
  currency: string,
  opts?: { withSymbol?: boolean; locale?: string }
): FormattedMoney => {
  const meta = getCurrencyMeta(currency);
  const cached = currencyCache.get(currency);
  const symbol = cached?.symbol ?? meta.symbol;
  const decimals = cached?.decimals ?? meta.decimals;
  const withSymbol = opts?.withSymbol ?? true;
  const locale = opts?.locale ?? 'en-US';

  const rounded = applyRounding(amount, 'standard', decimals);
  const numStr = rounded.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const display = withSymbol ? `${symbol}${numStr}` : numStr;
  return { display, amount: rounded, currency, symbol, decimals };
};

/**
 * Format an amount in the base currency — the canonical formatting used
 * throughout POSR. Honors the `showCurrencySymbolInUi` setting.
 */
export const formatBase = (
  amount: number,
  cfg?: CurrencyConfig,
  opts?: { withSymbol?: boolean; locale?: string }
): FormattedMoney => {
  const config = cfg ?? configCache ?? DEFAULT_CONFIG;
  return formatMoney(amount, config.base, opts);
};

/**
 * Dual-currency display — returns base + secondary (e.g. EUR + USD).
 * Returns null when dual display is off or no target configured.
 */
export const formatDual = (
  baseAmount: number,
  cfg?: CurrencyConfig
): { primary: FormattedMoney; secondary: FormattedMoney } | null => {
  const config = cfg ?? configCache ?? DEFAULT_CONFIG;
  if (!config.displayDual || !config.dualTarget) return null;
  const primary = formatMoney(baseAmount, config.base);
  const converted = convertAmount(baseAmount, config.base, config.dualTarget, config);
  const secondary = formatMoney(converted, config.dualTarget);
  return { primary, secondary };
};

// ---------------------------------------------------------------------------
// Init helper — call once on app startup to warm the cache
// ---------------------------------------------------------------------------

export const initCurrencyModule = async (
  db: ReturnType<typeof useDB>,
  settings?: Partial<SettingsData>
): Promise<void> => {
  const cfg = getCurrencyConfig(settings);
  await loadCurrenciesFromDb(db);
  await loadRatesFromDb(db);
  if (isRateStale()) {
    try {
      await refreshExchangeRates(db, cfg);
    } catch (err) {
      console.warn('[currency] initial rate refresh failed — will retry later', err);
    }
  }
};
