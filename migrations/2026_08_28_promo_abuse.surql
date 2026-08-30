-- Migration: 2026_08_28_promo_abuse.surql
--
-- AI Promotion & Loyalty Abuse Detection — 15th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $2-5k/year to promotion/loyalty abuse
-- (coupon stacking, fake accounts, points farming, gift card recycling).
-- Toast and Square have basic redemption limits but NO abuse-pattern AI.
-- POSR analyzes redemption patterns + AI flags suspicious activity.
--
-- Detection rules (7):
--   1. RAPID_REDEMPTION    — customer redeems 3+ coupons in 24h
--   2. SELF_REFERRAL       — customer refers self via multiple emails
--   3. POINTS_FARMING      — earn + immediate redeem in pattern (no real spend)
--   4. GIFT_CARD_RECYCLING — gift card redeemed, refunded, re-issued (loop)
--   5. COUPON_STACKING     — multiple discounts on one order exceeding limits
--   6. FAKE_ACCOUNT_FARM   — multiple customers from same device/IP redeeming
--   7. STAFF_DISCOUNT_ABUSE — staff using employee discount for non-staff orders
--
-- Each alert: AI insight + recommendation:
--   block_customer | freeze_points | void_redemption | require_verification |
--   review_manually | dismiss

DEFINE TABLE IF NOT EXISTS promo_abuse_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON promo_abuse_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON promo_abuse_alert TYPE string;
  -- 'rapid_redemption' | 'self_referral' | 'points_farming' | 'gift_card_recycling' |
  -- 'coupon_stacking' | 'fake_account_farm' | 'staff_discount_abuse'
DEFINE FIELD IF NOT EXISTS severity       ON promo_abuse_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS customer        ON promo_abuse_alert TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON promo_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_id       ON promo_abuse_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS staff_name     ON promo_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_id        ON promo_abuse_alert TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS coupon_code    ON promo_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS gift_card_code ON promo_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON promo_abuse_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON promo_abuse_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON promo_abuse_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON promo_abuse_alert TYPE float;
  -- estimated $ lost to abuse
DEFINE FIELD IF NOT EXISTS description   ON promo_abuse_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON promo_abuse_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON promo_abuse_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON promo_abuse_alert TYPE option<string>;
  -- 'block_customer' | 'freeze_points' | 'void_redemption' | 'require_verification' |
  -- 'review_manually' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON promo_abuse_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON promo_abuse_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON promo_abuse_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_paa_rule_id   ON promo_abuse_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_paa_severity  ON promo_abuse_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_paa_status    ON promo_abuse_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_paa_customer   ON promo_abuse_alert FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_paa_detected  ON promo_abuse_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS promo_abuse_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS promo_abuse_lookback_days      ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS promo_abuse_rapid_redeem_threshold ON settings TYPE option<int>   DEFAULT 3;
  -- 3+ redemptions in 24h triggers RAPID_REDEMPTION
DEFINE FIELD IF NOT EXISTS promo_abuse_points_farm_window_h ON settings TYPE option<int>   DEFAULT 2;
  -- earn+redeem within 2h suggests farming
DEFINE FIELD IF NOT EXISTS promo_abuse_stacking_pct      ON settings TYPE option<float> DEFAULT 0.30;
  -- discounts > 30% of order total triggers COUPON_STACKING
DEFINE FIELD IF NOT EXISTS promo_abuse_high_risk_threshold ON settings TYPE option<float> DEFAULT 65;
  -- risk_score >= 65 => 'high' level
