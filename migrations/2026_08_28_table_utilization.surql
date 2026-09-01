-- Migration: 2026_08_28_table_utilization.surql
--
-- AI Table Utilization Optimization — 40th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste 15-25% of seating capacity due to
-- poor table utilization (empty tables during peaks, large parties at small
-- tables, idle time between parties). Toast, Square show table status but
-- DON'T optimize utilization patterns. POSR analyzes occupancy patterns +
-- AI recommends table reallocation, capacity changes, and seating policies.
--
-- Distinct from:
--   - turnover.service (analyzes turnover rate per table, not utilization patterns)
--   - seating-optimization.service (real-time table assignment, not pattern analysis)
--   - revpash.service (revenue per seat hour, not physical utilization)
--
-- This service analyzes TABLE UTILIZATION PATTERNS over time + AI recommendations.

DEFINE TABLE IF NOT EXISTS table_utilization_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON table_utilization_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON table_utilization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS severity       ON table_utilization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS table_name     ON table_utilization_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS floor          ON table_utilization_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS capacity       ON table_utilization_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS utilization_pct  ON table_utilization_alert TYPE float;
  -- % of open hours table was occupied
DEFINE FIELD IF NOT EXISTS avg_idle_minutes  ON table_utilization_alert TYPE float;
  -- avg gap between parties
DEFINE FIELD IF NOT EXISTS avg_party_size   ON table_utilization_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS mismatch_score  ON table_utilization_alert TYPE float DEFAULT 0;
  -- 0-100 (100 = severe capacity mismatch)
DEFINE FIELD IF NOT EXISTS est_revenue_loss  ON table_utilization_alert TYPE float DEFAULT 0;
  -- $ lost to underutilization
DEFINE FIELD IF NOT EXISTS description   ON table_utilization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight     ON table_utilization_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON table_utilization_alert TYPE option<string>;
  -- 'reallocate_tables' | 'change_capacity' | 'combine_tables' | 'remove_table' | 'add_tables' | 'monitor'
DEFINE FIELD IF NOT EXISTS status        ON table_utilization_alert TYPE string DEFAULT 'open';
DEFINE FIELD IF NOT EXISTS detected_at   ON table_utilization_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_tua_rule_id   ON table_utilization_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_tua_severity  ON table_utilization_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_tua_status    ON table_utilization_alert FIELDS status;

-- Settings
DEFINE FIELD IF NOT EXISTS table_util_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS table_util_lookback_days ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS table_util_low_threshold ON settings TYPE option<float> DEFAULT 0.30;
  -- utilization < 30% = underutilized
DEFINE FIELD IF NOT EXISTS table_util_high_idle_min ON settings TYPE option<int>   DEFAULT 30;
  -- avg idle > 30 min = too much gap
