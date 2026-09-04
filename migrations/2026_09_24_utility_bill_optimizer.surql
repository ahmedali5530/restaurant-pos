-- Migration: 2026_09_24_utility_bill_optimizer.surql
--
-- AI Restaurant Utility Bill Optimizer — 103rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend $2,000-5,000/mo per location on utilities
-- (EPA Energy Star, NRA). 15-25% is wasted on:
--   - Wrong rate plan: paying commercial standard instead of time-of-use (10-20% savings)
--   - Demand charge spikes: peak kW demand triggers $200-500/mo extra charges
--   - Meter errors: faulty meters over-read by 5-15% ($500-2,000/mo)
--   - Power factor penalties: low PF triggers $100-300/mo penalties
--   - Hidden fees: late payment, reconnection, "convenience" charges
--   - Tariff optimization: better tariff plan available but not enrolled
--   - Seasonal adjustments: utility didn't apply seasonal rate decrease
--   - Water leak suspicion: usage spike indicates undetected leak
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO utility bill analysis.
-- energy-optimization detects after-hours ENERGY waste. energy-vampire detects
-- phantom loads. Neither audits UTILITY BILLS for billing errors or rate plans.
-- Third-party utility auditors (Uplight, Arcadia, EnergySage) charge $200-500/mo
-- and are for residential/general commercial, not restaurant-specific.
--
-- This new service OPTIMIZES UTILITY BILLS:
--   - Audits electricity, gas, water bills for errors
--   - Identifies wrong rate plans (standard vs time-of-use)
--   - Detects demand charge spikes + recommends peak shaving
--   - Flags meter reading anomalies (possible over-billing)
--   - Identifies power factor penalty opportunities
--   - Spots hidden/recurring fees
--   - Recommends tariff plan changes
--   - Flags seasonal rate adjustment failures
--   - Detects water usage anomalies (possible leak)

DEFINE TABLE IF NOT EXISTS utility_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON utility_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON utility_alert TYPE string;
  -- 'rate_plan_mismatch' | 'demand_charge_spike' | 'meter_error_suspected' |
--   'power_factor_penalty' | 'hidden_fees' | 'tariff_optimization' |
--   'seasonal_adjustment_missing' | 'water_leak_suspicion'
DEFINE FIELD IF NOT EXISTS severity        ON utility_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS utility_type    ON utility_alert TYPE string;
  -- 'electricity' | 'gas' | 'water'
DEFINE FIELD IF NOT EXISTS current_monthly_bill ON utility_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS benchmark_monthly_bill ON utility_alert TYPE option<float>;
  -- what similar restaurants pay
DEFINE FIELD IF NOT EXISTS overcharge_amount ON utility_alert TYPE float DEFAULT 0;
  -- $ overcharged this month
DEFINE FIELD IF NOT EXISTS est_annual_savings ON utility_alert TYPE float DEFAULT 0;
  -- $ annual savings if recommendation adopted
DEFINE FIELD IF NOT EXISTS current_rate_plan ON utility_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_rate_plan ON utility_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS description     ON utility_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON utility_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON utility_alert TYPE option<string>;
  -- 'switch_plan' | 'install_capacitor' | 'request_meter_test' | 'dispute_fees' |
--   'enroll_tariff' | 'request_adjustment' | 'fix_leak' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON utility_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON utility_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON utility_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_utility_rule      ON utility_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_utility_status    ON utility_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_utility_severity  ON utility_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_utility_type      ON utility_alert FIELDS utility_type;

-- Settings
DEFINE FIELD IF NOT EXISTS utility_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS utility_benchmark_elec ON settings TYPE option<float> DEFAULT 1800.0;
  -- benchmark monthly electricity bill for similar restaurants
DEFINE FIELD IF NOT EXISTS utility_benchmark_gas ON settings TYPE option<float> DEFAULT 600.0;
  -- benchmark monthly gas bill
DEFINE FIELD IF NOT EXISTS utility_benchmark_water ON settings TYPE option<float> DEFAULT 350.0;
  -- benchmark monthly water bill
DEFINE FIELD IF NOT EXISTS utility_tolerance_pct ON settings TYPE option<float> DEFAULT 15.0;
  -- % above benchmark before alert (default 15%)
