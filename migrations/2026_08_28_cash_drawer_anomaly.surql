-- Migration: 2026_08_28_cash_drawer_anomaly.surql
--
-- AI Cash Drawer Anomaly Detection — 35th POSR-exclusive differentiator.
--
-- Research finding: Cash theft costs restaurants $2-5k/year (skimming,
-- false voids, pocketed payments). Toast, Square, Lightspeed track cash
-- closings but DON'T detect anomalies in real-time. POSR analyzes cash
-- drawer patterns + flags discrepancies before they compound.
--
-- Detection rules (6):
--   1. DRAWER_SHORTAGE — closing balance < expected by > $10
--   2. EXCESSIVE_VOIDS — staff has > 5 voids per shift
--   3. NO_SALE_OPENS — drawer opened without sale > 3x per shift
--   4. CASH_MISMATCH — cash payments don't match order totals
--   5. LATE_SHIFT_CASH — cash activity after closing time
--   6. REPEATED_SHORTAGES — same staff has 3+ shortage events in 30d

DEFINE TABLE IF NOT EXISTS cash_drawer_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cash_drawer_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON cash_drawer_alert TYPE string;
DEFINE FIELD IF NOT EXISTS severity       ON cash_drawer_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS staff_name     ON cash_drawer_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_date      ON cash_drawer_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS metric_value   ON cash_drawer_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON cash_drawer_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss  ON cash_drawer_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description   ON cash_drawer_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON cash_drawer_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON cash_drawer_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cash_drawer_alert TYPE option<string>;
  -- 'investigate' | 'audit_cashier' | 'install_camera' | 'require_dual_count' | 'suspend_cash_access' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON cash_drawer_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON cash_drawer_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_cda_rule_id   ON cash_drawer_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_cda_severity  ON cash_drawer_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_cda_status    ON cash_drawer_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_cda_detected  ON cash_drawer_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS cash_drawer_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cash_drawer_lookback_days     ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS cash_drawer_shortage_threshold ON settings TYPE option<float> DEFAULT 10;
  -- shortage > $10 = alert
DEFINE FIELD IF NOT EXISTS cash_drawer_max_voids         ON settings TYPE option<int>   DEFAULT 5;
  -- > 5 voids per shift = alert
DEFINE FIELD IF NOT EXISTS cash_drawer_max_no_sale       ON settings TYPE option<int>   DEFAULT 3;
  -- > 3 no-sale opens per shift = alert
