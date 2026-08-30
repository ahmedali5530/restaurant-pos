-- Migration: 2026_08_28_shrinkage_detection.surql
--
-- AI Inventory Theft/Shrinkage Detection — anomaly detection for inventory loss.
--
-- Unique to POSR — Toast and Square only have basic waste tracking, not
-- theft/shrinkage detection. POSR analyzes inventory ledger + waste +
-- purchases to detect anomalies that indicate theft or unexplained loss.
--
-- Detection rules:
--   1. NEGATIVE_STOCK — item stock went negative (sold more than received)
--   2. EXCESSIVE_WASTE — waste rate > 2x normal for an item
--   3. AFTER_HOURS_ADJUSTMENT — inventory adjustments at unusual hours
--   4. REPEATED_ADJUSTMENTS — same item adjusted 3+ times in a week
--   5. STOCK_VS_SALES_MISMATCH — stock decreased faster than sales justify
--   6. HIGH_VALUE_LOSS — shrinkage cost > $100 for an item
--   7. MISSING_PURCHASES — items received but no PO trace

DEFINE TABLE IF NOT EXISTS shrinkage_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON shrinkage_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON shrinkage_alert TYPE string;
  -- 'negative_stock' | 'excessive_waste' | 'after_hours_adjustment' |
  -- 'repeated_adjustments' | 'stock_vs_sales_mismatch' | 'high_value_loss' | 'missing_purchases'
DEFINE FIELD IF NOT EXISTS severity       ON shrinkage_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS item_id        ON shrinkage_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name      ON shrinkage_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON shrinkage_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value ON shrinkage_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON shrinkage_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON shrinkage_alert TYPE float;
DEFINE FIELD IF NOT EXISTS description    ON shrinkage_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON shrinkage_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON shrinkage_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON shrinkage_alert TYPE option<string>;
  -- 'investigate' | 'audit_employee' | 'install_camera' | 'review_process' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON shrinkage_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at    ON shrinkage_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_sa_rule_id ON shrinkage_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_sa_severity ON shrinkage_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_sa_status   ON shrinkage_alert FIELDS status;

DEFINE FIELD IF NOT EXISTS shrinkage_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS shrinkage_lookback_days ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS shrinkage_waste_multiplier ON settings TYPE option<float> DEFAULT 2;
DEFINE FIELD IF NOT EXISTS shrinkage_high_value_threshold ON settings TYPE option<float> DEFAULT 100;
DEFINE FIELD IF NOT EXISTS shrinkage_after_hours_start ON settings TYPE option<int> DEFAULT 22;
DEFINE FIELD IF NOT EXISTS shrinkage_after_hours_end ON settings TYPE option<int> DEFAULT 6;
