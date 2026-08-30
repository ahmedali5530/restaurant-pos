-- Migration: 2026_08_28_visit_cadence.surql
--
-- AI Customer Visit Cadence Prediction — 21st POSR-exclusive differentiator.
--
-- Research finding: Restaurants don't know WHEN customers will return.
-- Toast, Square, Lightspeed have visit FREQUENCY (count) but NO cadence
-- TIMING prediction. Sending a re-engagement message too early wastes
-- spend; too late loses the customer. POSR predicts the expected return
-- date per customer based on historical inter-visit intervals + AI recs.
--
-- Distinct from:
--   - churn.service (predicts IF customer will leave)
--   - clv-trajectory.service (predicts VALUE direction)
--   - winback.service (targets already-left customers)
--   - noshow-prediction.service (predicts reservation attendance)
-- This service predicts the TIMING of next visit — when will they return?
--
-- Algorithm:
--   1. For each customer with 3+ orders:
--      - Compute inter-visit intervals (days between consecutive orders)
--      - median_interval = median of intervals (robust to outliers)
--      - mean_interval = average
--      - last_visit = most recent order date
--      - days_since_last = today - last_visit
--      - expected_return = last_visit + median_interval
--      - overdue_days = today - expected_return
--   2. Cadence classification:
--      - 'regular' (median interval 3-7 days)
--      - 'occasional' (8-21 days)
--      - 'infrequent' (22-60 days)
--      - 'one_time' (< 3 orders, can't predict)
--   3. Overdue status:
--      - 'on_track' (within normal interval)
--      - 'due_soon' (within 2 days of expected return)
--      - 'overdue' (past expected return, < 1.5× interval)
--      - 'significantly_overdue' (> 1.5× interval → at-risk)
--   4. AI recommendation: send_reminder | loyalty_nudge | win_back_campaign |
--      no_action | schedule_staff

DEFINE TABLE IF NOT EXISTS visit_cadence TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON visit_cadence TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer        ON visit_cadence TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON visit_cadence TYPE string;
DEFINE FIELD IF NOT EXISTS total_visits    ON visit_cadence TYPE int;
DEFINE FIELD IF NOT EXISTS median_interval_days ON visit_cadence TYPE float;
  -- median days between visits (robust central tendency)
DEFINE FIELD IF NOT EXISTS mean_interval_days ON visit_cadence TYPE float;
  -- average days between visits
DEFINE FIELD IF NOT EXISTS interval_stddev ON visit_cadence TYPE float;
  -- std dev of intervals (consistency measure)
DEFINE FIELD IF NOT EXISTS last_visit_date  ON visit_cadence TYPE datetime;
DEFINE FIELD IF NOT EXISTS days_since_last_visit ON visit_cadence TYPE int;
DEFINE FIELD IF NOT EXISTS expected_return_date ON visit_cadence TYPE datetime;
  -- last_visit + median_interval
DEFINE FIELD IF NOT EXISTS overdue_days     ON visit_cadence TYPE int;
  -- today - expected_return (positive = overdue)
DEFINE FIELD IF NOT EXISTS overdue_pct     ON visit_cadence TYPE float;
  -- overdue_days / median_interval × 100
DEFINE FIELD IF NOT EXISTS cadence_type    ON visit_cadence TYPE string;
  -- 'regular' | 'occasional' | 'infrequent' | 'one_time'
DEFINE FIELD IF NOT EXISTS overdue_status  ON visit_cadence TYPE string;
  -- 'on_track' | 'due_soon' | 'overdue' | 'significantly_overdue'
DEFINE FIELD IF NOT EXISTS consistency_score ON visit_cadence TYPE float;
  -- 0-1 (1 = perfectly regular visits, 0 = chaotic)
DEFINE FIELD IF NOT EXISTS est_return_probability ON visit_cadence TYPE float;
  -- 0-1 probability customer returns within next 7 days
DEFINE FIELD IF NOT EXISTS est_next_visit_value ON visit_cadence TYPE float DEFAULT 0;
  -- expected $ value of next visit (avg_check × return_probability)
DEFINE FIELD IF NOT EXISTS ai_insight      ON visit_cadence TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON visit_cadence TYPE option<string>;
  -- 'send_reminder' | 'loyalty_nudge' | 'win_back_campaign' | 'no_action' | 'schedule_staff'
DEFINE FIELD IF NOT EXISTS action_taken    ON visit_cadence TYPE string DEFAULT 'none';
  -- 'none' | 'reminder_sent' | 'nudged' | 'campaign_sent' | 'staffed' | 'returned' | 'dismissed'
DEFINE FIELD IF NOT EXISTS analyzed_at      ON visit_cadence TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id        ON visit_cadence TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_vc_customer     ON visit_cadence FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_vc_cadence_type ON visit_cadence FIELDS cadence_type;
DEFINE INDEX IF NOT EXISTS idx_vc_overdue      ON visit_cadence FIELDS overdue_status;
DEFINE INDEX IF NOT EXISTS idx_vc_analyzed      ON visit_cadence FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS cadence_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cadence_lookback_days      ON settings TYPE option<int>   DEFAULT 365;
  -- 1 year of order history
DEFINE FIELD IF NOT EXISTS cadence_min_visits        ON settings TYPE option<int>   DEFAULT 3;
  -- need 3+ visits to predict cadence
DEFINE FIELD IF NOT EXISTS cadence_regular_max_days  ON settings TYPE option<int>   DEFAULT 7;
  -- median ≤ 7 days = 'regular'
DEFINE FIELD IF NOT EXISTS cadence_occasional_max_days ON settings TYPE option<int> DEFAULT 21;
  -- median ≤ 21 days = 'occasional'
DEFINE FIELD IF NOT EXISTS cadence_significant_overdue_multiplier ON settings TYPE option<float> DEFAULT 1.5;
  -- overdue > 1.5× interval = significantly_overdue
