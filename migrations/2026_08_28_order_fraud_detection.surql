-- Migration: 2026_08_28_order_fraud_detection.surql
--
-- AI Order Fraud Detection — 6th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 4-6% of annual revenue to internal fraud
-- (National Restaurant Association). Toast, Square, and Lightspeed have NO
-- order-level fraud detection — they only do basic void logging. POSR analyzes
-- orders + payments + discounts + refunds to detect fraud patterns that
-- indicate employee theft or collusion.
--
-- Detection rules (7):
--   1. EXCESSIVE_DISCOUNTS    — cashier discount_rate > 5% of their sales (comp abuse)
--   2. CASH_DISCOUNT_PATTERN  — orders paid cash + discounted (classic comp-to-pocket-cash)
--   3. AFTER_HOURS_ACTIVITY   — orders/refunds during 22:00-06:00 (low supervision)
--   4. DUPLICATE_ORDERS       — same total + items within 5 min (test fraud / mistake)
--   5. HIGH_REFUND_RATE       — cashier refund rate > 3x average (refund fraud)
--   6. SPLIT_TENDER_ANOMALY   — split orders where cash < 10% of total (under-reporting)
--   7. LARGE_CASH_NEAR_CLOSE  — cash orders > $200 within 30 min of close (pocketing)
--
-- Each alert gets AI insight + recommendation:
--   investigate | audit_employee | review_camera | require_pin | restrict_perms | dismiss

DEFINE TABLE IF NOT EXISTS order_fraud_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON order_fraud_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON order_fraud_alert TYPE string;
  -- 'excessive_discounts' | 'cash_discount_pattern' | 'after_hours_activity' |
  -- 'duplicate_orders' | 'high_refund_rate' | 'split_tender_anomaly' | 'large_cash_near_close'
DEFINE FIELD IF NOT EXISTS severity       ON order_fraud_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS user_id        ON order_fraud_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS user_name      ON order_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_id       ON order_fraud_alert TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS metric_value   ON order_fraud_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value ON order_fraud_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON order_fraud_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON order_fraud_alert TYPE float;
  -- estimated revenue lost to fraud
DEFINE FIELD IF NOT EXISTS description   ON order_fraud_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON order_fraud_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON order_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON order_fraud_alert TYPE option<string>;
  -- 'investigate' | 'audit_employee' | 'review_camera' | 'require_pin' | 'restrict_perms' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON order_fraud_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON order_fraud_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_ofa_rule_id   ON order_fraud_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ofa_severity  ON order_fraud_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ofa_status    ON order_fraud_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ofa_user      ON order_fraud_alert FIELDS user_id;
DEFINE INDEX IF NOT EXISTS idx_ofa_detected  ON order_fraud_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS fraud_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS fraud_lookback_days      ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS fraud_discount_threshold ON settings TYPE option<float> DEFAULT 0.05;
  -- cashier discount_rate > 5% triggers EXCESSIVE_DISCOUNTS
DEFINE FIELD IF NOT EXISTS fraud_refund_multiplier   ON settings TYPE option<float> DEFAULT 3;
  -- refund rate > 3x avg triggers HIGH_REFUND_RATE
DEFINE FIELD IF NOT EXISTS fraud_after_hours_start   ON settings TYPE option<int>   DEFAULT 22;
DEFINE FIELD IF NOT EXISTS fraud_after_hours_end     ON settings TYPE option<int>   DEFAULT 6;
DEFINE FIELD IF NOT EXISTS fraud_large_cash_threshold ON settings TYPE option<float> DEFAULT 200;
  -- cash order > $200 within 30 min of close triggers LARGE_CASH_NEAR_CLOSE
DEFINE FIELD IF NOT EXISTS fraud_close_minutes      ON settings TYPE option<int>   DEFAULT 30;
  -- minutes before close considered "near close"
