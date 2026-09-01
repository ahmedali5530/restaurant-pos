-- Migration: 2026_08_28_giftcard_fraud.surql
--
-- AI Gift Card Fraud Detection — 29th POSR-exclusive differentiator.
--
-- Research finding: Gift card fraud costs restaurants $3-5k/year average
-- (balance manipulation, fake issuance, rapid drain, staff theft). Toast
-- and Square have basic gift card tracking but NO fraud pattern detection.
-- POSR analyzes gift_card_transaction patterns + AI flags suspicious activity.
--
-- Detection rules (6):
--   1. RAPID_DRAIN — card drained > 80% within 24h of issuance
--   2. BALANCE_MANIPULATION — balance increased without purchase (manual adjust)
--   3. MULTIPLE_CARDS_SAME_CUSTOMER — one customer has 5+ active cards
--   4. HIGH_VALUE_FIRST_USE — first transaction > $100 (often stolen cards)
--   5. AFTER_HOURS_REDEMPTION — redemptions at unusual hours (22:00-06:00)
--   6. STAFF_ISSUANCE_SPIKE — staff issuing unusually high number of cards
--
-- AI: per-alert insight + recommendation
--   freeze_card | investigate_staff | refund_customer | void_transaction | monitor | dismiss

DEFINE TABLE IF NOT EXISTS giftcard_fraud_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON giftcard_fraud_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON giftcard_fraud_alert TYPE string;
DEFINE FIELD IF NOT EXISTS severity       ON giftcard_fraud_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS gift_card_code ON giftcard_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name  ON giftcard_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_name     ON giftcard_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON giftcard_fraud_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value ON giftcard_fraud_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON giftcard_fraud_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description   ON giftcard_fraud_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON giftcard_fraud_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON giftcard_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON giftcard_fraud_alert TYPE option<string>;
  -- 'freeze_card' | 'investigate_staff' | 'refund_customer' | 'void_transaction' | 'monitor' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON giftcard_fraud_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON giftcard_fraud_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_gfa_rule_id   ON giftcard_fraud_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_gfa_severity  ON giftcard_fraud_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_gfa_status    ON giftcard_fraud_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_gfa_detected  ON giftcard_fraud_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS giftcard_fraud_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS giftcard_fraud_lookback_days ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS giftcard_fraud_rapid_drain_pct ON settings TYPE option<float> DEFAULT 0.80;
  -- > 80% drained within 24h = rapid drain
DEFINE FIELD IF NOT EXISTS giftcard_fraud_high_value_threshold ON settings TYPE option<float> DEFAULT 100;
  -- first use > $100 = suspicious
DEFINE FIELD IF NOT EXISTS giftcard_fraud_max_cards_per_customer ON settings TYPE option<int> DEFAULT 5;
  -- 5+ cards per customer = suspicious
