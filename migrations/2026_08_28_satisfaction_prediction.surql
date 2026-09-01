-- Migration: 2026_08_28_satisfaction_prediction.surql
--
-- AI Customer Satisfaction Prediction — 25th POSR-exclusive differentiator.
--
-- Research finding: Restaurants discover unhappy customers only AFTER they
-- leave bad reviews (or don't return). No POS system PREDICTS satisfaction
-- from order patterns BEFORE the review is written. Toast, Square, Lightspeed
-- analyze reviews reactively. POSR predicts satisfaction per order based on
-- ticket time, order modifications, wait time, party size, server load + AI.
--
-- Distinct from:
--   - sentiment.service (analyzes reviews AFTER they're written)
--   - churn.service (predicts IF customer will leave, not why)
--   - journey.service (maps lifecycle stages, doesn't predict satisfaction)
--   - guest-preference.service (profiles preferences, not satisfaction)
--
-- This service predicts SATISFACTION per order in real-time — enables
-- service recovery (comps, manager check-in) BEFORE customer leaves unhappy.
--
-- Algorithm:
--   For each recent paid order:
--   1. ticket_time_score: time from order to payment (faster = higher)
--   2. modification_score: # of item modifications (more mods = complexity = risk)
--   3. void_refund_score: any voids or refunds on the order (strong negative signal)
--   4. party_size_score: large parties have lower satisfaction (coordination issues)
--   5. server_load_score: server handling many tables simultaneously = slower service
--   6. peak_hour_score: orders during peak hours have lower satisfaction (rushed)
--   7. repeat_customer_score: returning customers have different expectations
--   8. discount_score: discounted orders may have different satisfaction patterns
--   Combined into 0-100 satisfaction score + AI recommendation

DEFINE TABLE IF NOT EXISTS satisfaction_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON satisfaction_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS order_id        ON satisfaction_prediction TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS customer        ON satisfaction_prediction TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON satisfaction_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_name     ON satisfaction_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_total     ON satisfaction_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS party_size      ON satisfaction_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS ticket_time_min  ON satisfaction_prediction TYPE float;
  -- minutes from order creation to payment
DEFINE FIELD IF NOT EXISTS satisfaction_score ON satisfaction_prediction TYPE float;
  -- 0-100 (100 = highly satisfied)
DEFINE FIELD IF NOT EXISTS satisfaction_level ON satisfaction_prediction TYPE string;
  -- 'critical' | 'at_risk' | 'neutral' | 'satisfied' | 'delighted'
DEFINE FIELD IF NOT EXISTS risk_factors    ON satisfaction_prediction TYPE option<object>;
  -- { factor_id: { weight, detail } }
DEFINE FIELD IF NOT EXISTS ai_insight      ON satisfaction_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON satisfaction_prediction TYPE option<string>;
  -- 'manager_checkin' | 'comp_offered' | 'apologize' | 'expedite_order' | 'thank_customer' | 'no_action'
DEFINE FIELD IF NOT EXISTS action_taken    ON satisfaction_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'manager_checked_in' | 'comp_offered' | 'apologized' | 'expedited' | 'thanked' | 'resolved'
DEFINE FIELD IF NOT EXISTS predicted_at    ON satisfaction_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON satisfaction_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_satp_order     ON satisfaction_prediction FIELDS order_id;
DEFINE FIELD IF NOT EXISTS idx_satp_level      ON satisfaction_prediction TYPE string DEFAULT 'neutral';
DEFINE INDEX IF NOT EXISTS idx_satp_level     ON satisfaction_prediction FIELDS satisfaction_level;
DEFINE INDEX IF NOT EXISTS idx_satp_action    ON satisfaction_prediction FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_satp_predicted ON satisfaction_prediction FIELDS predicted_at;

-- Settings
DEFINE FIELD IF NOT EXISTS satisfaction_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS satisfaction_lookback_hours    ON settings TYPE option<int>   DEFAULT 4;
  -- scan orders from last 4 hours
DEFINE FIELD IF NOT EXISTS satisfaction_critical_threshold ON settings TYPE option<float> DEFAULT 40;
  -- score < 40 = critical (likely to complain)
DEFINE FIELD IF NOT EXISTS satisfaction_at_risk_threshold ON settings TYPE option<float> DEFAULT 55;
  -- score < 55 = at_risk
DEFINE FIELD IF NOT EXISTS satisfaction_delighted_threshold ON settings TYPE option<float> DEFAULT 85;
  -- score >= 85 = delighted (likely to promote)
DEFINE FIELD IF NOT EXISTS satisfaction_max_orders        ON settings TYPE option<int>   DEFAULT 50;
  -- max orders to analyze per run
