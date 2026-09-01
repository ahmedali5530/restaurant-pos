-- Migration: 2026_08_28_winback.surql
--
-- AI Customer Win-Back Prediction — 12th POSR-exclusive differentiator.
--
-- Research finding: Acquiring a new customer costs 5-7x more than winning back
-- a churned one (Bain & Company). Win-back campaigns have 20-40% success rate
-- with right offer. Toast, Square, Lightspeed have NO win-back AI — they only
-- do generic "we miss you" blasts. POSR predicts which churned customers are
-- most likely to return + generates personalized offers per customer.
--
-- Distinct from churn.service (which predicts customers AT RISK of leaving).
-- This service targets customers who ALREADY LEFT — scores their win-back
-- probability + AI offer recommendation.
--
-- Win-back factors (7):
--   1. HIGH_LIFETIME_VALUE  — customer had high CLV (worth pursuing)
--   2. RECENT_DEPARTURE     — churned < 60 days ago (memory of brand still fresh)
--   3. POSITIVE_SENTIMENT  — had positive reviews/feedback (good experience)
--   4. LOYALTY_MEMBER      — was in loyalty program (had emotional investment)
--   5. FREQUENT_VISITOR    — visited 3+ times/month before leaving (habit pattern)
--   6. SPECIAL_OCCASIONS   — has birthday/anniversary coming up (natural hook)
--   7. NEGATIVE_LAST_VISIT — last order had issue (addressable with apology offer)
--
-- Each prediction: win-back score 0-100 + AI offer recommendation:
--   discount_15pct | free_appetizer | loyalty_reactivation | birthday_offer |
--   apology_credit | vip_invitation | dismiss

DEFINE TABLE IF NOT EXISTS winback_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON winback_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer        ON winback_prediction TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON winback_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS customer_email  ON winback_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_phone  ON winback_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS lifetime_value  ON winback_prediction TYPE float;
  -- total revenue from this customer before churn
DEFINE FIELD IF NOT EXISTS last_visit_date ON winback_prediction TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS days_since_last_visit ON winback_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS visit_count_before_churn ON winback_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS winback_score   ON winback_prediction TYPE float;
  -- 0-100 (100 = most likely to return)
DEFINE FIELD IF NOT EXISTS winback_level   ON winback_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS winback_factors  ON winback_prediction TYPE option<object>;
  -- { factor_id: { weight, detail } }
DEFINE FIELD IF NOT EXISTS est_clv_recovered ON winback_prediction TYPE float DEFAULT 0;
  -- estimated CLV if won back (avg check × projected visits)
DEFINE FIELD IF NOT EXISTS ai_insight      ON winback_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_offer        ON winback_prediction TYPE option<string>;
  -- 'discount_15pct' | 'free_appetizer' | 'loyalty_reactivation' | 'birthday_offer' |
  -- 'apology_credit' | 'vip_invitation' | 'dismiss'
DEFINE FIELD IF NOT EXISTS ai_offer_text    ON winback_prediction TYPE option<string>;
  -- ready-to-send offer message
DEFINE FIELD IF NOT EXISTS action_taken     ON winback_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'offer_sent' | 'offer_accepted' | 'won_back' | 'declined' | 'no_response'
DEFINE FIELD IF NOT EXISTS predicted_at    ON winback_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at      ON winback_prediction TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS branch_id       ON winback_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_wb_customer   ON winback_prediction FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_wb_level       ON winback_prediction FIELDS winback_level;
DEFINE INDEX IF NOT EXISTS idx_wb_predicted  ON winback_prediction FIELDS predicted_at;
DEFINE INDEX IF NOT EXISTS idx_wb_branch      ON winback_prediction FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS winback_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS winback_lookback_days       ON settings TYPE option<int>   DEFAULT 365;
  -- scan customers who churned within last 365 days
DEFINE FIELD IF NOT EXISTS winback_inactivity_days      ON settings TYPE option<int>   DEFAULT 90;
  -- considered churned if no visit in 90 days
DEFINE FIELD IF NOT EXISTS winback_recent_departure_days ON settings TYPE option<int>  DEFAULT 60;
  -- RECENT_DEPARTURE factor: churned < 60 days ago
DEFINE FIELD IF NOT EXISTS winback_high_clv_threshold  ON settings TYPE option<float> DEFAULT 500;
  -- HIGH_LIFETIME_VALUE factor: CLV > $500
DEFINE FIELD IF NOT EXISTS winback_frequent_threshold   ON settings TYPE option<int>   DEFAULT 3;
  -- FREQUENT_VISITOR factor: 3+ visits/month before churn
DEFINE FIELD IF NOT EXISTS winback_high_score_threshold ON settings TYPE option<float> DEFAULT 65;
  -- winback_score >= 65 => 'high' level
DEFINE FIELD IF NOT EXISTS winback_critical_threshold  ON settings TYPE option<float> DEFAULT 85;
  -- winback_score >= 85 => 'critical' level
