-- Migration: 2026_08_28_cash_early_warning.surql
--
-- AI Cash Flow Early Warning — 36th POSR-exclusive differentiator.
--
-- Research finding: 60% of restaurant closures are due to cash flow problems
-- that could have been predicted. Toast, Square show current balance but
-- DON'T predict when cash will run out. POSR projects 7-day cash position
-- including known obligations (payroll, PO payments, rent) + AI alerts before
-- critical thresholds.
--
-- Distinct from:
--   - cash-flow.service (30-day forecast, broad — this is 7-day urgent)
--   - anomaly-detection.service (detects anomalies, doesn't project cash)
--   - alerts.service (operational alerts, not cash position)

DEFINE TABLE IF NOT EXISTS cash_early_warning TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cash_early_warning TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS current_balance ON cash_early_warning TYPE float;
DEFINE FIELD IF NOT EXISTS projected_date   ON cash_early_warning TYPE datetime;
  -- date when cash position is projected
DEFINE FIELD IF NOT EXISTS days_ahead      ON cash_early_warning TYPE int;
  -- 1-7 days from now
DEFINE FIELD IF NOT EXISTS projected_inflow ON cash_early_warning TYPE float;
DEFINE FIELD IF NOT EXISTS projected_outflow ON cash_early_warning TYPE float;
DEFINE FIELD IF NOT EXISTS projected_balance ON cash_early_warning TYPE float;
DEFINE FIELD IF NOT EXISTS min_projected_balance ON cash_early_warning TYPE float;
  -- lowest point in the 7-day window
DEFINE FIELD IF NOT EXISTS min_balance_date ON cash_early_warning TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS warning_level    ON cash_early_warning TYPE string;
  -- 'safe' | 'caution' | 'critical' | 'emergency'
DEFINE FIELD IF NOT EXISTS est_days_until_negative ON cash_early_warning TYPE int DEFAULT 999;
  -- days until cash runs out (999 = won't run out in 7d)
DEFINE FIELD IF NOT EXISTS known_obligations ON cash_early_warning TYPE option<object>;
  -- { payroll: float, po_payments: float, rent: float, other: float }
DEFINE FIELD IF NOT EXISTS ai_insight       ON cash_early_warning TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cash_early_warning TYPE option<string>;
  -- 'delay_payments' | 'accelerate_collections' | 'arrange_credit' | 'reduce_spending' | 'no_action'
DEFINE FIELD IF NOT EXISTS predicted_at     ON cash_early_warning TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_cew_predicted ON cash_early_warning FIELDS predicted_at;
DEFINE INDEX IF NOT EXISTS idx_cew_level      ON cash_early_warning FIELDS warning_level;

-- Settings
DEFINE FIELD IF NOT EXISTS cash_warning_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cash_warning_reserve_pct   ON settings TYPE option<float> DEFAULT 0.15;
  -- minimum reserve = 15% of avg monthly revenue
DEFINE FIELD IF NOT EXISTS cash_warning_critical_pct ON settings TYPE option<float> DEFAULT 0.05;
  -- critical = below 5% of avg monthly revenue
