-- Migration: 2026_08_28_food_safety_compliance.surql
--
-- AI Food Safety Compliance Monitoring — 7th POSR-exclusive differentiator.
--
-- Research finding: Restaurants face $10k-$50k+ fines for HACCP violations
-- (FDA Food Code). A single critical violation can shut down a location.
-- Toast and Square have basic manual temperature logging but NO AI — they
-- don't detect patterns, predict equipment failures, or auto-generate
-- corrective-action reports. POSR offers full HACCP automation free.
--
-- Architecture:
--   1. temperature_log — manual/IoT temperature readings from fridges,
--      freezers, hot-hold stations, prep areas (each tagged with zone + item)
--   2. foodsafety_alert — AI-detected violations + predictive warnings:
--      a. CRITICAL_TEMP_BREACH — fridge > 5°C / freezer > -18°C / hot-hold < 60°C
--      b. PROLONGED_BREACH — breach lasting > 30 min (food spoilage risk)
--      c. EQUIPMENT_DRIFT — gradual temp increase over 24h (predictive maintenance)
--      d. MISSED_CHECK — required temp check not logged within window
--      e. REPEATED_BREACH — same zone breached 3+ times in 7 days
--      f. AFTER_HOURS_BREACH — breach when staff not on-site
--      g. EXPIRED_STOCK — inventory_item past expiry still in stock
--   3. AI enhancement: per-alert insight + corrective-action recommendation

-- ---------------------------------------------------------------------------
-- temperature_log — raw temperature readings
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS temperature_log TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON temperature_log TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS zone          ON temperature_log TYPE string;
  -- 'fridge' | 'freezer' | 'hot_hold' | 'prep_area' | 'cold_display' | 'delivery'
DEFINE FIELD IF NOT EXISTS zone_name     ON temperature_log TYPE option<string>;
  -- e.g. "Walk-in Fridge A", "Line Prep Table"
DEFINE FIELD IF NOT EXISTS item          ON temperature_log TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS temperature   ON temperature_log TYPE float;
  -- in °C
DEFINE FIELD IF NOT EXISTS min_safe     ON temperature_log TYPE option<float>;
  -- per-reading safe range (overrides default for zone)
DEFINE FIELD IF NOT EXISTS max_safe     ON temperature_log TYPE option<float>;
DEFINE FIELD IF NOT EXISTS is_breach    ON temperature_log TYPE bool DEFAULT false;
  -- true if outside safe range
DEFINE FIELD IF NOT EXISTS breach_duration_min ON temperature_log TYPE option<int>;
  -- for continuous breaches, duration so far
DEFINE FIELD IF NOT EXISTS logged_by     ON temperature_log TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS logged_at     ON temperature_log TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS notes         ON temperature_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS branch_id     ON temperature_log TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_tl_zone      ON temperature_log FIELDS zone;
DEFINE INDEX IF NOT EXISTS idx_tl_logged_at  ON temperature_log FIELDS logged_at;
DEFINE INDEX IF NOT EXISTS idx_tl_breach    ON temperature_log FIELDS is_breach;
DEFINE INDEX IF NOT EXISTS idx_tl_branch    ON temperature_log FIELDS branch_id;

-- ---------------------------------------------------------------------------
-- foodsafety_alert — AI-detected violations + predictive warnings
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS foodsafety_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON foodsafety_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON foodsafety_alert TYPE string;
  -- 'critical_temp_breach' | 'prolonged_breach' | 'equipment_drift' |
  -- 'missed_check' | 'repeated_breach' | 'after_hours_breach' | 'expired_stock'
DEFINE FIELD IF NOT EXISTS severity       ON foodsafety_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS zone           ON foodsafety_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS zone_name     ON foodsafety_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_id        ON foodsafety_alert TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS item_name      ON foodsafety_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON foodsafety_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON foodsafety_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON foodsafety_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_risk  ON foodsafety_alert TYPE float;
  -- 0-100 risk score (food spoilage + fine + reputation)
DEFINE FIELD IF NOT EXISTS description   ON foodsafety_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON foodsafety_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON foodsafety_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON foodsafety_alert TYPE option<string>;
  -- 'discard_food' | 'repair_equipment' | 'recheck_in_30min' | 'call_maintenance' |
  -- 'retrain_staff' | 'document_haccp' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON foodsafety_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON foodsafety_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON foodsafety_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_fsa_rule_id  ON foodsafety_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_fsa_severity ON foodsafety_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_fsa_status   ON foodsafety_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_fsa_zone     ON foodsafety_alert FIELDS zone;
DEFINE INDEX IF NOT EXISTS idx_fsa_detected ON foodsafety_alert FIELDS detected_at;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

DEFINE FIELD IF NOT EXISTS foodsafety_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS foodsafety_lookback_days   ON settings TYPE option<int>   DEFAULT 7;
  -- how far back to scan for breach patterns
DEFINE FIELD IF NOT EXISTS foodsafety_check_interval_min ON settings TYPE option<int> DEFAULT 240;
  -- required temp check every 4 hours (240 min) — MISSED_CHECK triggers
DEFINE FIELD IF NOT EXISTS foodsafety_prolonged_threshold_min ON settings TYPE option<int> DEFAULT 30;
  -- breaches > 30 min trigger PROLONGED_BREACH
DEFINE FIELD IF NOT EXISTS foodsafety_repeated_threshold ON settings TYPE option<int> DEFAULT 3;
  -- 3+ breaches in 7 days triggers REPEATED_BREACH
DEFINE FIELD IF NOT EXISTS foodsafety_drift_days       ON settings TYPE option<int>   DEFAULT 1;
  -- check for gradual temp drift over 24h
DEFINE FIELD IF NOT EXISTS foodsafety_fridge_max      ON settings TYPE option<float> DEFAULT 5;
  -- fridge must be ≤ 5°C (FDA)
DEFINE FIELD IF NOT EXISTS foodsafety_freezer_max      ON settings TYPE option<float> DEFAULT -18;
  -- freezer must be ≤ -18°C
DEFINE FIELD IF NOT EXISTS foodsafety_hot_hold_min     ON settings TYPE option<float> DEFAULT 60;
  -- hot-hold must be ≥ 60°C (FDA)
DEFINE FIELD IF NOT EXISTS foodsafety_prep_max         ON settings TYPE option<float> DEFAULT 8;
  -- prep area ≤ 8°C (cold display)
