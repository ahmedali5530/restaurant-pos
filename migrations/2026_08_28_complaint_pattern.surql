-- Migration: 2026_08_28_complaint_pattern.surql
--
-- AI Complaint Pattern Detection — 37th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 15-20% of repeat customers to unresolved
-- recurring complaints. Toast, Square analyze individual reviews but DON'T
-- detect cross-review patterns. POSR finds recurring complaint themes, item-
-- specific issues, time-correlated complaints + AI recommendations.
--
-- Distinct from:
--   - sentiment.service (analyzes individual reviews, not patterns)
--   - satisfaction-prediction.service (predicts per-order satisfaction)
--   - churn.service (predicts customer departure, not complaint causes)
--
-- Detection rules (6):
--   1. RECURRING_THEME — same theme in 3+ negative reviews in 30d
--   2. ITEM_COMPLAINT — same dish mentioned in 3+ negative reviews
--   3. TIME_CORRELATED — complaints cluster at specific hours
--   4. STAFF_CORRELATED — complaints correlate with specific server
--   5. DECLINING_TREND — complaint rate increasing week-over-week
--   6. UNRESPONDED_CRITICAL — 1-star reviews not responded to in 48h

DEFINE TABLE IF NOT EXISTS complaint_pattern_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON complaint_pattern_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON complaint_pattern_alert TYPE string;
DEFINE FIELD IF NOT EXISTS severity       ON complaint_pattern_alert TYPE string;
DEFINE FIELD IF NOT EXISTS theme          ON complaint_pattern_alert TYPE option<string>;
  -- e.g. 'wait_time' | 'food_quality' | 'service' | 'price' | 'cleanliness'
DEFINE FIELD IF NOT EXISTS item_name      ON complaint_pattern_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_name     ON complaint_pattern_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS hour_of_day     ON complaint_pattern_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS complaint_count  ON complaint_pattern_alert TYPE int;
DEFINE FIELD IF NOT EXISTS avg_rating      ON complaint_pattern_alert TYPE float;
DEFINE FIELD IF NOT EXISTS trend_pct       ON complaint_pattern_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description    ON complaint_pattern_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context         ON complaint_pattern_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON complaint_pattern_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON complaint_pattern_alert TYPE option<string>;
  -- 'address_root_cause' | 'retrain_staff' | 'adjust_recipe' | 'add_staffing' | 'respond_now' | 'monitor'
DEFINE FIELD IF NOT EXISTS status        ON complaint_pattern_alert TYPE string DEFAULT 'open';
DEFINE FIELD IF NOT EXISTS detected_at    ON complaint_pattern_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_cpa_rule_id   ON complaint_pattern_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_cpa_severity  ON complaint_pattern_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_cpa_status    ON complaint_pattern_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_cpa_detected  ON complaint_pattern_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS complaint_pattern_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS complaint_pattern_lookback_days ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS complaint_pattern_min_count      ON settings TYPE option<int>   DEFAULT 3;
  -- 3+ complaints with same theme = pattern
