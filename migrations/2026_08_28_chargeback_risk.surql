-- Migration: 2026_08_28_chargeback_risk.surql
--
-- AI Payment Chargeback Risk Detection — 13th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $1-3k/year to chargebacks (avg $190 per
-- chargeback, 0.5% rate per Statista). Toast and Square have REACTIVE chargeback
-- management (respond after dispute filed) but NO PREDICTIVE AI. POSR scores
-- each transaction in real-time for chargeback risk + AI prevention recs.
--
-- Risk factors (7):
--   1. LARGE_FIRST_ORDER    — first order from customer > $200 (no history)
--   2. LATE_NIGHT_HIGH_VALUE — orders > $150 between 22:00-04:00 (impaired judgment)
--   3. SPLIT_PAYMENT_HIGH    — split into 3+ payments (confusion disputes)
--   4. RUSH_DELIVERY         — delivery with expedited/rush flag
--   5. NEW_DEVICE_OR_ADDRESS — first delivery to this address
--   6. PRIOR_CHARGEBACK     — customer has chargeback history (chronic disputer)
--   7. CASH_REFUND_PATTERN  — orders with cash refunds in last 30 days (dispute pattern)
--
-- Each alert: risk score 0-100 + AI prevention recommendation:
--   require_signature | verify_id | call_confirm | photo_on_delivery |
--   decline_transaction | review_manually | accept

DEFINE TABLE IF NOT EXISTS chargeback_risk_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON chargeback_risk_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS order_id        ON chargeback_risk_alert TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS order_number   ON chargeback_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer        ON chargeback_risk_alert TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON chargeback_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS cashier         ON chargeback_risk_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS cashier_name   ON chargeback_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_total     ON chargeback_risk_alert TYPE float;
DEFINE FIELD IF NOT EXISTS payment_method  ON chargeback_risk_alert TYPE option<string>;
  -- 'card' | 'cash' | 'mobile' | 'split'
DEFINE FIELD IF NOT EXISTS risk_score      ON chargeback_risk_alert TYPE float;
  -- 0-100 (100 = near-certain chargeback)
DEFINE FIELD IF NOT EXISTS risk_level      ON chargeback_risk_alert TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS risk_factors    ON chargeback_risk_alert TYPE option<object>;
  -- { factor_id: { weight, detail } }
DEFINE FIELD IF NOT EXISTS est_chargeback_cost ON chargeback_risk_alert TYPE float DEFAULT 0;
  -- estimated $190 per chargeback (avg)
DEFINE FIELD IF NOT EXISTS ai_insight     ON chargeback_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON chargeback_risk_alert TYPE option<string>;
  -- 'require_signature' | 'verify_id' | 'call_confirm' | 'photo_on_delivery' |
  -- 'decline_transaction' | 'review_manually' | 'accept'
DEFINE FIELD IF NOT EXISTS action_taken   ON chargeback_risk_alert TYPE string DEFAULT 'none';
  -- 'none' | 'signature_required' | 'id_verified' | 'call_confirmed' | 'photo_taken' |
  -- 'declined' | 'reviewed' | 'accepted' | 'charged_back' | 'won'
DEFINE FIELD IF NOT EXISTS detected_at    ON chargeback_risk_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at      ON chargeback_risk_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS branch_id      ON chargeback_risk_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_cra_order     ON chargeback_risk_alert FIELDS order_id;
DEFINE INDEX IF NOT EXISTS idx_cra_customer   ON chargeback_risk_alert FIELDS customer;
DEFINE FIELD IF NOT EXISTS idx_cra_risk_level ON chargeback_risk_alert TYPE string DEFAULT 'low';
DEFINE INDEX IF NOT EXISTS idx_cra_level      ON chargeback_risk_alert FIELDS risk_level;
DEFINE INDEX IF NOT EXISTS idx_cra_detected  ON chargeback_risk_alert FIELDS detected_at;
DEFINE INDEX IF NOT EXISTS idx_cra_branch    ON chargeback_risk_alert FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS chargeback_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS chargeback_lookback_days       ON settings TYPE option<int>   DEFAULT 30;
  -- scan window for prior chargeback history
DEFINE FIELD IF NOT EXISTS chargeback_large_order_threshold ON settings TYPE option<float> DEFAULT 200;
  -- LARGE_FIRST_ORDER: orders > $200 from new customers
DEFINE FIELD IF NOT EXISTS chargeback_late_night_threshold ON settings TYPE option<float> DEFAULT 150;
  -- LATE_NIGHT_HIGH_VALUE: orders > $150 between 22:00-04:00
DEFINE FIELD IF NOT EXISTS chargeback_split_count_threshold ON settings TYPE option<int>   DEFAULT 3;
  -- SPLIT_PAYMENT_HIGH: 3+ payments on one order
DEFINE FIELD IF NOT EXISTS chargeback_high_risk_threshold  ON settings TYPE option<float> DEFAULT 65;
  -- risk_score >= 65 => 'high' level
DEFINE FIELD IF NOT EXISTS chargeback_critical_threshold  ON settings TYPE option<float> DEFAULT 85;
  -- risk_score >= 85 => 'critical' level
DEFINE FIELD IF NOT EXISTS chargeback_avg_cost             ON settings TYPE option<float> DEFAULT 190;
  -- average chargeback cost ($190 per Statista)
