-- Migration: 2026_08_28_yield_variance.surql
--
-- AI Recipe Yield Variance Detection — 10th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 4-10% of food cost to yield variance
-- (over-portioning, inconsistent prep, equipment issues, theft). Toast and
-- Square have basic recipe tracking but NO yield variance AI. POSR analyzes
-- production batches vs theoretical yields to detect where money leaks.
--
-- Detection rules (7):
--   1. YIELD_VARIANCE          — actual yield_loss > 15% above recipe theoretical
--   2. COST_VARIANCE           — actual input cost > 10% above theoretical (over-portioning)
--   3. INCONSISTENT_BATCHES    — same recipe has > 20% variance across recent batches
--   4. HIGH_WASTE_RECIPE       — recipe consistently loses > 20% yield (recipe issue)
--   5. PORTION_DRIFT           — input quantities increasing over time (portion creep)
--   6. OUTPUT_VALUE_MISMATCH   — sum of output values < input cost (margin erosion)
--   7. STAFF_VARIANCE          — specific staff's batches have higher variance (training need)
--
-- Each alert gets AI insight + recommendation:
--   recalibrate_recipe | retrain_staff | repair_equipment | adjust_portion |
--   review_procurement | investigate_theft | dismiss

DEFINE TABLE IF NOT EXISTS yield_variance_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON yield_variance_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON yield_variance_alert TYPE string;
  -- 'yield_variance' | 'cost_variance' | 'inconsistent_batches' | 'high_waste_recipe' |
  -- 'portion_drift' | 'output_value_mismatch' | 'staff_variance'
DEFINE FIELD IF NOT EXISTS severity       ON yield_variance_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS recipe_id       ON yield_variance_alert TYPE option<record<recipe>>;
DEFINE FIELD IF NOT EXISTS recipe_name    ON yield_variance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS batch_id        ON yield_variance_alert TYPE option<record<production_batch>>;
DEFINE FIELD IF NOT EXISTS staff_id       ON yield_variance_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS staff_name     ON yield_variance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON yield_variance_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON yield_variance_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON yield_variance_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON yield_variance_alert TYPE float;
  -- estimated $ lost per year if pattern continues
DEFINE FIELD IF NOT EXISTS description   ON yield_variance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON yield_variance_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON yield_variance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON yield_variance_alert TYPE option<string>;
  -- 'recalibrate_recipe' | 'retrain_staff' | 'repair_equipment' | 'adjust_portion' |
  -- 'review_procurement' | 'investigate_theft' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON yield_variance_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON yield_variance_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON yield_variance_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_yva_rule_id   ON yield_variance_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_yva_severity  ON yield_variance_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_yva_status    ON yield_variance_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_yva_recipe     ON yield_variance_alert FIELDS recipe_id;
DEFINE INDEX IF NOT EXISTS idx_yva_staff      ON yield_variance_alert FIELDS staff_id;
DEFINE INDEX IF NOT EXISTS idx_yva_detected   ON yield_variance_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS yield_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS yield_lookback_days      ON settings TYPE option<int>   DEFAULT 30;
  -- how far back to scan batches
DEFINE FIELD IF NOT EXISTS yield_variance_threshold  ON settings TYPE option<float> DEFAULT 0.15;
  -- 15% above theoretical triggers YIELD_VARIANCE
DEFINE FIELD IF NOT EXISTS yield_cost_variance_pct   ON settings TYPE option<float> DEFAULT 0.10;
  -- 10% above theoretical triggers COST_VARIANCE
DEFINE FIELD IF NOT EXISTS yield_inconsistency_pct   ON settings TYPE option<float> DEFAULT 0.20;
  -- 20% variance across batches triggers INCONSISTENT_BATCHES
DEFINE FIELD IF NOT EXISTS yield_high_waste_threshold ON settings TYPE option<float> DEFAULT 0.20;
  -- recipe consistently losing > 20% yield triggers HIGH_WASTE_RECIPE
DEFINE FIELD IF NOT EXISTS yield_drift_window_days   ON settings TYPE option<int>   DEFAULT 30;
  -- PORTION_DRIFT compares last 30d vs previous 30d
