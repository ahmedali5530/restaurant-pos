-- Migration: 2026_08_28_wait_prediction.surql
--
-- AI Wait Time Prediction — 17th POSR-exclusive differentiator.
--
-- Research finding: Restaurants quote inaccurate wait times 40% of the time,
-- leading to walk-aways (15-25% abandonment when quote exceeded by 5+ min).
-- OpenTable has basic waitlist but NO predictive modeling — only manager
-- guesswork. Toast Waitlist $50/mo has static quoting. POSR predicts
-- wait time from historical patterns + real-time occupancy + AI reasoning.
--
-- Distinct from no-show-prediction.service (which predicts reservation
-- attendance). This service predicts WAIT TIME for walk-in waitlist entries.
--
-- Algorithm:
--   1. Historical baseline: avg actual_wait by day-of-week × hour-of-day
--   2. Real-time load multiplier: current_occupancy / typical_occupancy
--   3. Party size adjustment: +20% per seat above 2
--   4. DOW + seasonal adjustments
--   5. AI confidence score (0-1) based on data points + variance
--   6. Continuous learning: compare predicted vs actual, refine baseline
--
-- Outputs:
--   - predicted_wait_min: predicted wait in minutes
--   - confidence: 0-1 (data quality + variance)
--   - ai_reasoning: why this wait time (current load, day pattern, party size)
--   - est_walkaway_risk: probability customer leaves if quoted this wait

DEFINE TABLE IF NOT EXISTS wait_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON wait_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS waitlist_entry   ON wait_prediction TYPE option<record<waitlist_entry>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON wait_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS party_size      ON wait_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS day_of_week     ON wait_prediction TYPE int;
  -- 0=Sun .. 6=Sat
DEFINE FIELD IF NOT EXISTS hour_of_day     ON wait_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS current_occupancy ON wait_prediction TYPE int;
  -- tables occupied at prediction time
DEFINE FIELD IF NOT EXISTS typical_occupancy ON wait_prediction TYPE int;
  -- avg occupancy for this DOW + hour
DEFINE FIELD IF NOT EXISTS load_multiplier  ON wait_prediction TYPE float;
  -- current / typical (1.0 = normal, 1.5 = 50% busier)
DEFINE FIELD IF NOT EXISTS historical_baseline_min ON wait_prediction TYPE float;
  -- avg actual_wait for this DOW + hour
DEFINE FIELD IF NOT EXISTS predicted_wait_min ON wait_prediction TYPE float;
  -- final prediction
DEFINE FIELD IF NOT EXISTS confidence      ON wait_prediction TYPE float;
  -- 0-1
DEFINE FIELD IF NOT EXISTS est_walkaway_risk ON wait_prediction TYPE float;
  -- 0-1 probability customer leaves
DEFINE FIELD IF NOT EXISTS ai_reasoning    ON wait_prediction TYPE option<string>;
  -- max 200 chars — why this wait time
DEFINE FIELD IF NOT EXISTS actual_wait_min ON wait_prediction TYPE option<float>;
  -- filled in after entry is seated (for accuracy tracking)
DEFINE FIELD IF NOT EXISTS prediction_error_min ON wait_prediction TYPE option<float>;
  -- actual - predicted (for accuracy tracking)
DEFINE FIELD IF NOT EXISTS predicted_at    ON wait_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON wait_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_wp_waitlist  ON wait_prediction FIELDS waitlist_entry;
DEFINE INDEX IF NOT EXISTS idx_wp_dow_hour   ON wait_prediction FIELDS day_of_week, hour_of_day;
DEFINE INDEX IF NOT EXISTS idx_wp_predicted  ON wait_prediction FIELDS predicted_at;
DEFINE INDEX IF NOT EXISTS idx_wp_branch    ON wait_prediction FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS waitpred_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS waitpred_lookback_days      ON settings TYPE option<int>   DEFAULT 90;
  -- 3 months of historical waitlist data
DEFINE FIELD IF NOT EXISTS waitpred_party_size_adjust  ON settings TYPE option<float> DEFAULT 0.20;
  -- +20% per seat above 2 (party of 4 = +40%)
DEFINE FIELD IF NOT EXISTS waitpred_min_confidence     ON settings TYPE option<float> DEFAULT 0.30;
  -- below 30% confidence, fall back to simple avg
DEFINE FIELD IF NOT EXISTS waitpred_walkaway_threshold_min ON settings TYPE option<int>   DEFAULT 45;
  -- wait > 45 min = high walkaway risk
