-- Migration: 2026_08_29_equipment_maintenance.surql
--
-- AI Equipment Maintenance Predictor — 54th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $15k-$30k/year to unexpected equipment
-- failures (National Restaurant Association). A single fridge failure can
-- destroy $5k-$20k of inventory. Reactive repairs cost 3-5x more than
-- scheduled maintenance (Food Service Equipment Reports).
--
-- Toast, Square, Lightspeed have ZERO equipment maintenance tracking.
-- Existing CMMS tools (UpKeep $60/mo, Fiix $45/mo) are generic, not
-- restaurant-specific, and don't predict failures.
--
-- POSR's food-safety.service has EQUIPMENT_DRIFT (gradual temp increase
-- over 24h) but that's a TEMPERATURE BREACH alert — NOT predictive
-- maintenance. It tells you the fridge is too warm NOW, not that it will
-- fail in 2 weeks.
--
-- This service predicts EQUIPMENT FAILURES before they happen based on:
--   - Equipment age (lifespan benchmarks per type)
--   - Usage intensity (cycles per day)
--   - Performance drift (temp trend, energy consumption trend)
--   - Maintenance history (last service date, frequency)
--   - Failure pattern correlations (e.g. compressor cycling more often)
--
-- Distinct from:
--   - food-safety.service (EQUIPMENT_DRIFT = temperature breach NOW — NOT
--     predictive failure forecast)
--   - energy-vampire.service (phantom standby load — NOT maintenance prediction)
--   - energy-optimization.service (after-hours consumption — NOT equipment health)
--   - vendor-performance.service (supplier performance — NOT equipment)

DEFINE TABLE IF NOT EXISTS equipment_maintenance_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON equipment_maintenance_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON equipment_maintenance_alert TYPE string;
  -- 'end_of_life' | 'performance_drift' | 'overdue_maintenance' | 'high_usage_wear' | 'failure_pattern'
DEFINE FIELD IF NOT EXISTS severity       ON equipment_maintenance_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS equipment_name ON equipment_maintenance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS equipment_type ON equipment_maintenance_alert TYPE option<string>;
  -- 'fridge' | 'freezer' | 'oven' | 'fryer' | 'dishwasher' | 'ice_maker' | 'pos_terminal' | 'printer' | 'coffee_machine' | 'hvac' | 'other'
DEFINE FIELD IF NOT EXISTS location        ON equipment_maintenance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS age_months     ON equipment_maintenance_alert TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS expected_lifespan_months ON equipment_maintenance_alert TYPE int DEFAULT 0;
  -- industry benchmark lifespan
DEFINE FIELD IF NOT EXISTS lifespan_pct   ON equipment_maintenance_alert TYPE float DEFAULT 0;
  -- 0-1, current age / expected lifespan
DEFINE FIELD IF NOT EXISTS days_until_failure ON equipment_maintenance_alert TYPE option<int>;
  -- predicted days until failure (null = unknown)
DEFINE FIELD IF NOT EXISTS failure_probability ON equipment_maintenance_alert TYPE float DEFAULT 0;
  -- 0-1, probability of failure in next 30 days
DEFINE FIELD IF NOT EXISTS last_maintenance_date ON equipment_maintenance_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS days_since_maintenance ON equipment_maintenance_alert TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_repair_cost ON equipment_maintenance_alert TYPE float DEFAULT 0;
  -- estimated cost if failure occurs
DEFINE FIELD IF NOT EXISTS est_preventive_cost ON equipment_maintenance_alert TYPE float DEFAULT 0;
  -- cost of scheduled maintenance
DEFINE FIELD IF NOT EXISTS est_savings     ON equipment_maintenance_alert TYPE float DEFAULT 0;
  -- savings = repair_cost - preventive_cost
DEFINE FIELD IF NOT EXISTS description     ON equipment_maintenance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON equipment_maintenance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON equipment_maintenance_alert TYPE option<string>;
  -- 'schedule_maintenance' | 'replace_now' | 'monitor' | 'reduce_usage' | 'emergency_service'
DEFINE FIELD IF NOT EXISTS status          ON equipment_maintenance_alert TYPE string DEFAULT 'open';
  -- 'open' | 'scheduled' | 'serviced' | 'failed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON equipment_maintenance_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON equipment_maintenance_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ema_rule_id   ON equipment_maintenance_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ema_severity  ON equipment_maintenance_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ema_status    ON equipment_maintenance_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ema_equipment ON equipment_maintenance_alert FIELDS equipment_name;

-- Settings
DEFINE FIELD IF NOT EXISTS equip_maint_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS equip_maint_critical_threshold ON settings TYPE option<float> DEFAULT 0.90;
  -- lifespan_pct > 90% = critical
DEFINE FIELD IF NOT EXISTS equip_maint_overdue_days      ON settings TYPE option<int>   DEFAULT 180;
  -- maintenance overdue if > 180 days since last service
DEFINE FIELD IF NOT EXISTS equip_maint_failure_threshold ON settings TYPE option<float> DEFAULT 0.30;
  -- failure_probability > 30% = high severity
