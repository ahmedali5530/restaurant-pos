-- Migration: 2026_09_16_predictive_ordering.surql
--
-- AI Predictive Ordering for Regular Customers — 95th POSR-exclusive differentiator.
--
-- Research finding: 60-70% of restaurant revenue comes from repeat customers
-- (NRA, Cornell hospitality). Regular customers order the same thing 65-80%
-- of the time (QSR Magazine). Predicting their order before they arrive:
--   - Saves 3-5 min per order (pre-prep started) → 20-30% throughput increase
--   - Improves customer experience ("the usual?" feels personalized)
--   - Reduces order errors (pre-filled order, customer just confirms)
--   - Increases loyalty (staff knows their preferences)
--   - Enables proactive upsell ("want your usual fries with that?")
--
-- Classic POS systems (Toast, Square, Lightspeed) show order HISTORY but
-- DON'T PREDICT next orders. Toast Quick Orders is manual — customer must
-- set up their own "usual." POSR auto-learns + predicts without customer
-- setup. Third-party personalization engines (Nosto, Dynamic Yield) cost
-- $500-2,000/mo and are for e-commerce, not restaurants.
--
-- POSR's existing services cover DIFFERENT customer aspects:
--   - guest-preference.service = LEARNS individual preferences (favorite
--     dishes, categories, order time) — NOT next-order prediction or pre-prep
--   - visit-cadence.service = PREDICTS WHEN customers return (timing) — NOT
--     WHAT they'll order
--   - demand-forecast.service = AGGREGATE demand prediction (covers/orders
--     per hour) — NOT individual customer orders
--   - cross-sell.service = SUGGESTS additional items during ordering — NOT
--     pre-predicting the main order
--   - upsell-analytics.service = SERVER upsell performance tracking — NOT
--     predictive ordering
--   - winback.service = targets CHURNED customers — NOT active regulars
--   - clv.service = CUSTOMER lifetime value — NOT order prediction
--   - segmentation.service = CUSTOMER segmentation — NOT individual prediction
--
-- This new service PREDICTS ORDERS for regular customers:
--   - Analyzes order history patterns per customer
--   - Predicts what they'll order next (confidence score)
--   - Predicts when they'll arrive (visit cadence integration)
--   - Triggers pre-preparation for high-confidence predictions
--   - Generates "the usual?" prompt for staff
--   - Tracks prediction accuracy + refines over time
--   - Identifies preference drift (order changing over time)
--   - Suggests personalized upsells based on predicted order

DEFINE TABLE IF NOT EXISTS predictive_order_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON predictive_order_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON predictive_order_alert TYPE string;
  -- 'usual_order_prediction' | 'visit_timing_prediction' | 'pre_prep_trigger' |
--   'order_variance_high' | 'loyalty_upsell_opportunity' | 'first_time_pattern' |
--   'abandonment_risk' | 'preference_drift'
DEFINE FIELD IF NOT EXISTS severity        ON predictive_order_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON predictive_order_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name   ON predictive_order_alert TYPE string;
DEFINE FIELD IF NOT EXISTS predicted_items ON predictive_order_alert TYPE option<string>;
  -- JSON array of predicted order items
DEFINE FIELD IF NOT EXISTS confidence_score ON predictive_order_alert TYPE option<float>;
  -- 0-100 confidence that prediction is correct
DEFINE FIELD NOT NULL predicted_arrival   ON predictive_order_alert TYPE option<string>;
  -- predicted arrival time window (e.g., '12:00-12:30')
DEFINE FIELD IF NOT EXISTS total_visits    ON predictive_order_alert TYPE option<int>;
  -- total visits in last 90 days
DEFINE FIELD IF NOT EXISTS order_consistency_pct ON predictive_order_alert TYPE option<float>;
  -- % of visits where customer ordered same thing (0-100)
DEFINE FIELD IF NOT EXISTS avg_order_value ON predictive_order_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_time_saved_min ON predictive_order_alert TYPE option<int>;
  -- estimated minutes saved by pre-prep
DEFINE FIELD IF NOT EXISTS est_revenue_uplift ON predictive_order_alert TYPE float DEFAULT 0;
  -- $ revenue uplift from faster service + upsell
DEFINE FIELD IF NOT EXISTS description     ON predictive_order_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON predictive_order_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON predictive_order_alert TYPE option<string>;
  -- 'start_prep' | 'prompt_usual' | 'offer_upsell' | 'confirm_arrival' |
--   'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON predictive_order_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON predictive_order_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON predictive_order_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_predict_rule      ON predictive_order_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_predict_status    ON predictive_order_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_predict_severity  ON predictive_order_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_predict_customer  ON predictive_order_alert FIELDS customer_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS predict_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS predict_min_visits       ON settings TYPE option<int> DEFAULT 5;
  -- minimum visits in 90 days to be considered a "regular" (default 5)
DEFINE FIELD IF NOT EXISTS predict_confidence_threshold ON settings TYPE option<float> DEFAULT 70.0;
  -- confidence % above which to trigger pre-prep (default 70%)
DEFINE FIELD IF NOT EXISTS predict_consistency_threshold ON settings TYPE option<float> DEFAULT 60.0;
  -- order consistency % above which to predict "usual" (default 60%)
DEFINE FIELD IF NOT EXISTS predict_lookback_days   ON settings TYPE option<int> DEFAULT 90;
  -- lookback period for order history (default 90 days)
