-- Migration: 2026_08_28_refund_abuse.surql
--
-- AI Refund Abuse Detection — 30th POSR-exclusive differentiator.
--
-- Research finding: Refund abuse costs restaurants $1-3k/year (customers
-- getting free food via fake complaints, staff voiding orders and pocketing
-- cash). Toast, Square, Lightspeed track refunds but DON'T detect abuse
-- patterns. POSR analyzes order_refund + order_item.is_refunded patterns
-- + AI flags suspicious activity.
--
-- Detection rules (6):
--   1. EXCESSIVE_REFUNDS_CUSTOMER — customer has 3+ refunds in 30d
--   2. HIGH_REFUND_VALUE — single refund > $50 (unusual)
--   3. REFUND_AFTER_COMPLETION — refunded item on already-completed order
--   4. STAFF_REFUND_SPIKE — staff processing 3× team avg refunds
--   5. CASH_REFUND_NO_RECEIPT — cash refund without corresponding void
--   6. REPEATED_SAME_ITEM_REFUND — same item refunded 3+ times by same customer
--
-- AI: freeze_refunds | investigate_staff | warn_customer | block_customer | monitor | dismiss

DEFINE TABLE IF NOT EXISTS refund_abuse_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON refund_abuse_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON refund_abuse_alert TYPE string;
DEFINE FIELD IF NOT EXISTS severity       ON refund_abuse_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS customer        ON refund_abuse_alert TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON refund_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_id       ON refund_abuse_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS staff_name     ON refund_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_id        ON refund_abuse_alert TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS metric_value   ON refund_abuse_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON refund_abuse_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss  ON refund_abuse_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description   ON refund_abuse_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON refund_abuse_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON refund_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON refund_abuse_alert TYPE option<string>;
  -- 'freeze_refunds' | 'investigate_staff' | 'warn_customer' | 'block_customer' | 'monitor' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON refund_abuse_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON refund_abuse_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_raa_rule_id   ON refund_abuse_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_raa_severity  ON refund_abuse_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_raa_status    ON refund_abuse_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_raa_detected  ON refund_abuse_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS refund_abuse_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS refund_abuse_lookback_days     ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS refund_abuse_customer_threshold ON settings TYPE option<int>  DEFAULT 3;
  -- 3+ refunds in 30d = excessive
DEFINE FIELD IF NOT EXISTS refund_abuse_high_value         ON settings TYPE option<float> DEFAULT 50;
  -- single refund > $50 = suspicious
DEFINE FIELD IF NOT EXISTS refund_abuse_staff_multiplier   ON settings TYPE option<float> DEFAULT 3;
  -- staff refunds > 3× team avg = spike
