-- Migration: 2026_08_29_online_fraud_detector.surql
--
-- AI Online Order Fraud Detector — 58th POSR-exclusive differentiator.
--
-- Research finding: Online food order fraud costs restaurants $2-5k/year per
-- location (Statista, Radial). 1-2% of online orders are fraudulent. Types:
--   - Stolen credit cards (card-not-present fraud, $190 avg loss)
--   - Fake delivery addresses (orders shipped to vacant lots, hotels, warehouses)
--   - Multi-account promo abuse (same person creating accounts for free meals)
--   - VPN/proxy orders (anonymizing fraudster location)
--   - Velocity fraud (multiple orders from same device in short window)
--   - Address mismatch (billing ≠ shipping, classic CNP fraud signal)
--   - Refund-then-reorder (get refund, reorder with new account)
--
-- POSR's existing services cover DIFFERENT fraud:
--   - order-fraud-detection.service = INTERNAL employee theft/collusion
--   - chargeback-risk.service = PAYMENT chargeback probability scoring
--   - promo-abuse.service = promo code redemption abuse
--   - refund-abuse.service = refund pattern abuse
--   - giftcard-fraud.service = gift card redemption fraud
--
-- This new service covers EXTERNAL customer-side online order fraud:
-- device fingerprinting, IP analysis, address verification, velocity checks,
-- cross-account correlation.

DEFINE TABLE IF NOT EXISTS online_fraud_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON online_fraud_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON online_fraud_alert TYPE string;
  -- 'stolen_card_pattern' | 'fake_address' | 'multi_account_abuse' | 'velocity_fraud' | 'vpn_proxy_detected'
DEFINE FIELD IF NOT EXISTS severity       ON online_fraud_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS order_id        ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_id    ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name   ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS risk_score     ON online_fraud_alert TYPE float DEFAULT 0;
  -- 0-100, higher = more likely fraud
DEFINE FIELD IF NOT EXISTS order_value     ON online_fraud_alert TYPE float DEFAULT 0;
  -- $ amount at risk
DEFINE FIELD IF NOT EXISTS device_fingerprint ON online_fraud_alert TYPE option<string>;
  -- device hash (if available)
DEFINE FIELD IF NOT EXISTS ip_address      ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS billing_address ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS delivery_address ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS address_mismatch ON online_fraud_alert TYPE option<bool>;
  -- billing ≠ delivery
DEFINE FIELD IF NOT EXISTS is_vpn_proxy    ON online_fraud_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS linked_accounts ON online_fraud_alert TYPE option<string>;
  -- JSON: other accounts sharing same device/IP
DEFINE FIELD IF NOT EXISTS order_count_24h ON online_fraud_alert TYPE option<int>;
  -- orders from this device/IP in last 24h
DEFINE FIELD IF NOT EXISTS est_loss        ON online_fraud_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON online_fraud_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON online_fraud_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON online_fraud_alert TYPE option<string>;
  -- 'block_order' | 'require_verification' | 'manual_review' | 'flag_customer' | 'allow_with_monitoring'
DEFINE FIELD IF NOT EXISTS status          ON online_fraud_alert TYPE string DEFAULT 'open';
  -- 'open' | 'blocked' | 'verified' | 'allowed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON online_fraud_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON online_fraud_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ofa_rule_id   ON online_fraud_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ofa_severity  ON online_fraud_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ofa_status    ON online_fraud_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ofa_customer  ON online_fraud_alert FIELDS customer_id;

-- Settings
DEFINE FIELD IF NOT EXISTS online_fraud_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS online_fraud_velocity_threshold ON settings TYPE option<int>   DEFAULT 3;
  -- 3+ orders from same device in 24h = velocity fraud
DEFINE FIELD IF NOT EXISTS online_fraud_high_value_threshold ON settings TYPE option<float> DEFAULT 200;
  -- orders > $200 trigger extra scrutiny
DEFINE FIELD IF NOT EXISTS online_fraud_block_threshold  ON settings TYPE option<float> DEFAULT 75;
  -- risk_score > 75 = auto-block recommendation
