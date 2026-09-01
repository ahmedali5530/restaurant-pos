-- Migration: 2026_08_28_energy_optimization.surql
--
-- AI Energy Optimization — 8th POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend $3-5k/year on energy, ~30% wasted
-- (EPA Energy Star). Toast, Square, Lightspeed have ZERO energy tracking.
-- POSR automates energy monitoring with 7 detection rules + AI recommendations
-- that surface savings opportunities managers would miss.
--
-- Architecture:
--   1. energy_log — hourly/daily meter readings (kWh consumed + cost)
--      Tagged with: zone (kitchen/dining/hvac/lighting/refrigeration/whole_site),
--      tariff (peak/off_peak/shoulder), source (utility_api/manual/iot_meter)
--   2. energy_alert — AI-detected inefficiencies:
--      a. AFTER_HOURS_CONSUMPTION — high usage 22:00-08:00 (equipment left on)
--      b. PEAK_RATE_OVERSPEND — usage during peak tariff (shift to off-peak)
--      c. WEEKEND_ANOMALY — weekend usage > 1.5x weekday avg (HVAC left on)
--      d. BASELINE_DEVIATION — daily usage > 20% above 30-day rolling avg
--      e. HVAC_DRIFT — gradual consumption increase over 14 days (equipment aging)
--      f. EQUIPMENT_LEFT_ON — usage spikes when no orders/cashier activity
--      g. TARIFF_MISMATCH — cost higher than expected for kWh used (wrong plan)
--   3. AI enhancement: per-alert insight + savings recommendation
--      adjust_thermostat | install_occupancy_sensor | repair_hvac |
--      shift_to_off_peak | power_down_equipment | review_tariff_plan | dismiss

-- ---------------------------------------------------------------------------
-- energy_log — raw meter readings
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS energy_log TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON energy_log TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS zone          ON energy_log TYPE string;
  -- 'kitchen' | 'dining' | 'hvac' | 'lighting' | 'refrigeration' | 'whole_site'
DEFINE FIELD IF NOT EXISTS kwh_consumed  ON energy_log TYPE float;
  -- kilowatt-hours consumed in this period
DEFINE FIELD IF NOT EXISTS cost          ON energy_log TYPE float;
  -- currency cost for the period
DEFINE FIELD IF NOT EXISTS tariff        ON energy_log TYPE string DEFAULT 'standard';
  -- 'peak' | 'off_peak' | 'shoulder' | 'standard'
DEFINE FIELD IF NOT EXISTS rate_per_kwh  ON energy_log TYPE option<float>;
  -- unit price (for tariff mismatch detection)
DEFINE FIELD IF NOT EXISTS period_start  ON energy_log TYPE datetime;
  -- start of measurement period
DEFINE FIELD IF NOT EXISTS period_end    ON energy_log TYPE datetime;
  -- end of measurement period
DEFINE FIELD IF NOT EXISTS is_after_hours ON energy_log TYPE bool DEFAULT false;
  -- true if period_start hour >= 22 or < 8
DEFINE FIELD IF NOT EXISTS logged_by     ON energy_log TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS source         ON energy_log TYPE string DEFAULT 'manual';
  -- 'utility_api' | 'manual' | 'iot_meter' | 'estimated'
DEFINE FIELD IF NOT EXISTS branch_id     ON energy_log TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS created_at    ON energy_log TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_el_zone       ON energy_log FIELDS zone;
DEFINE INDEX IF NOT EXISTS idx_el_period     ON energy_log FIELDS period_start;
DEFINE INDEX IF NOT EXISTS idx_el_tariff     ON energy_log FIELDS tariff;
DEFINE INDEX IF NOT EXISTS idx_el_branch    ON energy_log FIELDS branch_id;
DEFINE INDEX IF NOT EXISTS idx_el_after_hours ON energy_log FIELDS is_after_hours;

-- ---------------------------------------------------------------------------
-- energy_alert — AI-detected inefficiencies
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS energy_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON energy_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON energy_alert TYPE string;
  -- 'after_hours_consumption' | 'peak_rate_overspend' | 'weekend_anomaly' |
  -- 'baseline_deviation' | 'hvac_drift' | 'equipment_left_on' | 'tariff_mismatch'
DEFINE FIELD IF NOT EXISTS severity       ON energy_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS zone           ON energy_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON energy_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON energy_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON energy_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_waste ON energy_alert TYPE float;
  -- estimated $ wasted per year if pattern continues
DEFINE FIELD IF NOT EXISTS description   ON energy_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON energy_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON energy_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON energy_alert TYPE option<string>;
  -- 'adjust_thermostat' | 'install_occupancy_sensor' | 'repair_hvac' |
  -- 'shift_to_off_peak' | 'power_down_equipment' | 'review_tariff_plan' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON energy_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON energy_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON energy_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_ea_rule_id  ON energy_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ea_severity ON energy_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ea_status   ON energy_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ea_zone     ON energy_alert FIELDS zone;
DEFINE INDEX IF NOT EXISTS idx_ea_detected ON energy_alert FIELDS detected_at;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

DEFINE FIELD IF NOT EXISTS energy_ai_enabled         ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS energy_lookback_days     ON settings TYPE option<int>   DEFAULT 30;
  -- rolling baseline window
DEFINE FIELD IF NOT EXISTS energy_after_hours_start ON settings TYPE option<int>   DEFAULT 22;
  -- 22:00
DEFINE FIELD IF NOT EXISTS energy_after_hours_end   ON settings TYPE option<int>   DEFAULT 8;
  -- 08:00
DEFINE FIELD IF NOT EXISTS energy_baseline_deviation_pct ON settings TYPE option<float> DEFAULT 0.20;
  -- 20% above baseline triggers BASELINE_DEVIATION
DEFINE FIELD IF NOT EXISTS energy_weekend_multiplier ON settings TYPE option<float> DEFAULT 1.5;
  -- weekend > 1.5x weekday avg triggers WEEKEND_ANOMALY
DEFINE FIELD IF NOT EXISTS energy_drift_days        ON settings TYPE option<int>   DEFAULT 14;
  -- HVAC drift detection window
DEFINE FIELD IF NOT EXISTS energy_peak_rate_threshold ON settings TYPE option<float> DEFAULT 0.15;
  -- if >15% of consumption is during peak tariff, alert
DEFINE FIELD IF NOT EXISTS energy_avg_rate_per_kwh  ON settings TYPE option<float> DEFAULT 0.12;
  -- baseline rate ($/kWh) for TARIFF_MISMATCH detection
