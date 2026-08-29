-- Migration: 2026_08_28_multi_currency.surql
--
-- Multi-currency support — international expansion enabler.
--
-- Research finding: Toast charges for multi-location/multi-currency in its
-- higher tiers; Square and Lightspeed bundle multi-currency only in Plus/Pro.
-- POSR offers it free — enables restaurants in tourist areas + cross-border.
--
-- Tables:
--   1. currency — registered currencies (code, symbol, name, decimals, is_base)
--   2. exchange_rate — historical + current FX rates (base→target, source, fetched_at)
--
-- Settings fields (added via DEFINE FIELD on settings table):
--   - currency_base — ISO 4217 code of the accounting/reporting currency
--   - currency_accepted — array of accepted payment currencies
--   - currency_rate_provider — 'ecb' | 'manual' | 'fixer' | 'openexchangerates'
--   - currency_rate_ttl_minutes — cache TTL for exchange rates
--   - currency_rounding_mode — 'standard' | 'swedish' | 'up' | 'down'

-- ---------------------------------------------------------------------------
-- currency — registered currencies
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS currency TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id          ON currency TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS code        ON currency TYPE string;
  -- ISO 4217 code, e.g. 'USD', 'EUR', 'PKR', 'GBP', 'AED'
DEFINE FIELD IF NOT EXISTS symbol      ON currency TYPE string;
  -- Display symbol, e.g. '$', '€', 'Rs', '£', 'د.إ'
DEFINE FIELD IF NOT EXISTS name        ON currency TYPE string;
  -- Full name, e.g. 'US Dollar', 'Euro'
DEFINE FIELD IF NOT EXISTS decimals    ON currency TYPE int DEFAULT 2;
  -- Number of decimal places (JPY = 0, BTC = 8, most = 2)
DEFINE FIELD IF NOT EXISTS is_base     ON currency TYPE bool DEFAULT false;
  -- Only one currency should be base at a time (enforced in service)
DEFINE FIELD IF NOT EXISTS is_active   ON currency TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS sort_order  ON currency TYPE int DEFAULT 100;
DEFINE FIELD IF NOT EXISTS created_at   ON currency TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at   ON currency TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_currency_code       ON currency FIELDS code UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_currency_is_base    ON currency FIELDS is_base;
DEFINE INDEX IF NOT EXISTS idx_currency_is_active  ON currency FIELDS is_active;

-- ---------------------------------------------------------------------------
-- exchange_rate — FX rate history (base → target)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS exchange_rate TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON exchange_rate TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS base_currency ON exchange_rate TYPE string;
  -- ISO 4217 base code (e.g. 'EUR' for ECB rates)
DEFINE FIELD IF NOT EXISTS target_currency ON exchange_rate TYPE string;
  -- ISO 4217 target code (e.g. 'USD')
DEFINE FIELD IF NOT EXISTS rate          ON exchange_rate TYPE float;
  -- 1 base = rate target  (e.g. 1 EUR = 1.08 USD)
DEFINE FIELD IF NOT EXISTS source        ON exchange_rate TYPE string DEFAULT 'ecb';
  -- 'ecb' | 'manual' | 'fixer' | 'openexchangerates'
DEFINE FIELD IF NOT EXISTS fetched_at    ON exchange_rate TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS valid_until    ON exchange_rate TYPE option<datetime>;
  -- TTL expiry — if past, rate is considered stale
DEFINE FIELD IF NOT EXISTS is_current     ON exchange_rate TYPE bool DEFAULT true;
  -- Marks the latest rate for a (base,target) pair

DEFINE INDEX IF NOT EXISTS idx_exchange_base_target
  ON exchange_rate FIELDS base_currency, target_currency, is_current;
DEFINE INDEX IF NOT EXISTS idx_exchange_fetched_at
  ON exchange_rate FIELDS fetched_at;

-- ---------------------------------------------------------------------------
-- Seed common currencies (EUR as default base — change via settings)
-- ---------------------------------------------------------------------------
INSERT INTO currency (code, symbol, name, decimals, is_base, is_active, sort_order) VALUES
  ('EUR', '€',    'Euro',                  2, true,  true, 10),
  ('USD', '$',    'US Dollar',             2, false, true, 20),
  ('GBP', '£',    'British Pound',         2, false, true, 30),
  ('PKR', 'Rs',   'Pakistani Rupee',        2, false, true, 40),
  ('AED', 'د.إ',  'UAE Dirham',            2, false, true, 50),
  ('SAR', '﷼',   'Saudi Riyal',           2, false, true, 60),
  ('TRY', '₺',    'Turkish Lira',          2, false, true, 70),
  ('INR', '₹',    'Indian Rupee',          2, false, true, 80),
  ('JPY', '¥',    'Japanese Yen',          0, false, true, 90),
  ('CHF', 'Fr',   'Swiss Franc',           2, false, true, 100),
  ('CAD', 'C$',   'Canadian Dollar',       2, false, true, 110),
  ('AUD', 'A$',   'Australian Dollar',     2, false, true, 120),
  ('CNY', '¥',    'Chinese Yuan',          2, false, true, 130),
  ('RUB', '₽',    'Russian Ruble',         2, false, true, 140),
  ('BAM', 'KM',   'Bosnia-Herzegovina KM', 2, false, true, 150),
  ('RSD', 'дин',  'Serbian Dinar',         2, false, true, 160),
  ('HRK', 'kn',   'Croatian Kuna',         2, false, true, 170),
  ('MKD', 'ден',  'Macedonian Denar',      2, false, true, 180)
ON DUPLICATE KEY UPDATE updated_at = time::now();

-- ---------------------------------------------------------------------------
-- Settings fields (added defensively — ignored if settings table differs)
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS currency_base              ON settings TYPE option<string>;
DEFINE FIELD IF NOT EXISTS currency_accepted           ON settings TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS currency_rate_provider      ON settings TYPE option<string> DEFAULT 'ecb';
DEFINE FIELD IF NOT EXISTS currency_rate_ttl_minutes   ON settings TYPE option<int> DEFAULT 60;
DEFINE FIELD IF NOT EXISTS currency_rounding_mode      ON settings TYPE option<string> DEFAULT 'standard';
DEFINE FIELD IF NOT EXISTS currency_display_dual       ON settings TYPE option<bool> DEFAULT false;
  -- Show secondary currency alongside base on receipts + displays
DEFINE FIELD IF NOT EXISTS currency_dual_target        ON settings TYPE option<string>;
  -- Which currency to show as the "dual" (e.g. 'USD' for EUR-base tourist venues)
