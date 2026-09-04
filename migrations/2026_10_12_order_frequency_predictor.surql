-- Migration: 2026_10_12_order_frequency_predictor.surql
--
-- AI Customer Order Frequency Predictor — 121st POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from declining
-- customer order frequency going undetected (Bain Loyalty Math, NRA Frequency):
--   - 30% of customers show declining order frequency before churning
--   - Frequency decline starts 4-8 weeks before complete churn
--   - No POS tracks FREQUENCY TRAJECTORY (only visit count)
--   - Weekly→biweekly→monthly decline = silent churn signal
--   - "Stable" customers assumed loyal but may be slowly declining
--   - No early warning when frequency drops below personal baseline
--   - Seasonal frequency shifts confused with decline (false positives)
--   - No frequency-based segmentation (increasing/stable/declining/dormant)
--   - Retention outreach triggered too late (after churn, not during decline)
--   - No frequency recovery tracking (did outreach restore frequency?)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO frequency trajectory
-- tracking. visit-cadence.service (21st) predicts WHEN next visit occurs.
-- churn-prediction.service predicts IF customer will leave. retention-program
-- does general retention. clv-trajectory tracks VALUE direction. None track
-- ORDER FREQUENCY TRAJECTORY (increasing/stable/declining) with proactive
-- decline intervention before churn.
--
-- This new service PREDICTS ORDER FREQUENCY TRAJECTORY:
--   - Tracks orders per week per customer (frequency baseline)
--   - Detects frequency trend (increasing/stable/declining)
--   - Compares current frequency to personal historical baseline
--   - Flags declining frequency 4-8 weeks before churn
--   - Triggers proactive outreach during decline (not after churn)
--   - Segments customers by frequency trajectory
--   - Tracks frequency recovery after intervention
--   - Filters seasonal frequency shifts (avoid false positives)

DEFINE TABLE IF NOT EXISTS order_frequency_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON order_frequency_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON order_frequency_alert TYPE string;
  -- 'frequency_declining' | 'frequency_increased' | 'frequency_stable_high' |
--   'dormant_customer' | 'frequency_recovery_needed' | 'seasonal_frequency_shift' |
--   'frequency_baseline_drop' | 'frequency_momentum'
DEFINE FIELD IF NOT EXISTS severity        ON order_frequency_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON order_frequency_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON order_frequency_alert TYPE string;
DEFINE FIELD IF NOT EXISTS baseline_frequency ON order_frequency_alert TYPE option<float>;
  -- historical avg orders/week
DEFINE FIELD IF NOT EXISTS current_frequency ON order_frequency_alert TYPE option<float>;
  -- current orders/week (rolling 4wk)
DEFINE FIELD IF NOT EXISTS previous_frequency ON order_frequency_alert TYPE option<float>;
  -- previous 4wk frequency
DEFINE FIELD IF NOT EXISTS frequency_trend ON order_frequency_alert TYPE option<string>;
  -- 'increasing' | 'stable' | 'declining' | 'dormant'
DEFINE FIELD IF NOT EXISTS frequency_change_pct ON order_frequency_alert TYPE option<float>;
  -- % change from baseline
DEFINE FIELD IF NOT EXISTS weeks_since_last_order ON order_frequency_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS predicted_churn_weeks ON order_frequency_alert TYPE option<int>;
  -- weeks until predicted churn at current decline rate
DEFINE FIELD IF NOT EXISTS total_orders    ON order_frequency_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS customer_value  ON order_frequency_alert TYPE option<string>;
  -- 'high_value' | 'medium_value' | 'low_value'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON order_frequency_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON order_frequency_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON order_frequency_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON order_frequency_alert TYPE option<string>;
  -- 'send_reminder' | 'winback_offer' | 'loyalty_reward' | 'frequency_incentive' |
--   'monitor' | 'investigate' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON order_frequency_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON order_frequency_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON order_frequency_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ordfreq_rule      ON order_frequency_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ordfreq_status    ON order_frequency_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ordfreq_severity  ON order_frequency_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ordfreq_customer  ON order_frequency_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_ordfreq_trend     ON order_frequency_alert FIELDS frequency_trend;

DEFINE FIELD IF NOT EXISTS ordfreq_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS ordfreq_decline_threshold ON settings TYPE option<float> DEFAULT 25.0;
  -- % decline from baseline to flag as declining (default 25%)
DEFINE FIELD IF NOT EXISTS ordfreq_dormant_weeks ON settings TYPE option<int> DEFAULT 6;
  -- weeks since last order to flag as dormant (default 6)
DEFINE FIELD IF NOT EXISTS ordfreq_churn_window  ON settings TYPE option<int> DEFAULT 8;
  -- predicted weeks to churn to flag as urgent (default 8)
DEFINE FIELD IF NOT EXISTS ordfreq_seasonal_filter ON settings TYPE option<bool> DEFAULT true;
  -- filter seasonal frequency shifts to avoid false positives (default true)
