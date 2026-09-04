-- Migration: 2026_10_13_order_pattern_anomaly.surql
--
-- AI Customer Order Pattern Anomaly Detector — 122nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants miss $300-1,000/mo per location from undetected
-- customer order pattern anomalies (Cornell Customer Behavior, NRA Personalization):
--   - 25% of customers show order pattern anomalies signaling life events or shifts
--   - Customer who always orders beef suddenly orders vegan → diet change (opportunity)
--   - Order size suddenly doubles → hosting event, family visit (catering opportunity)
--   - Regular lunch customer starts ordering dinner → schedule change (new segment)
--   - Customer who never orders dessert suddenly orders 3 → celebration (loyalty moment)
--   - No POS detects per-customer order pattern anomalies
--   - Life events (new job, moving, health change) hidden in order pattern shifts
--   - Category migration (mains→starters) signals taste evolution
--   - Price tier shift (premium→budget or vice versa) signals income change
--   - Anomalies = opportunities for personalization, catering upsell, loyalty
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO per-customer order
-- pattern anomaly detection. anomaly-detection.service (existing) monitors BUSINESS
-- METRICS (sales drops, revenue spikes). order-modification-pattern detects
-- modification PATTERNS across customers. customer-segmentation groups customers.
-- None detect INDIVIDUAL customer order pattern anomalies vs their own baseline.
--
-- This new service DETECTS CUSTOMER ORDER PATTERN ANOMALIES:
--   - Builds per-customer order baseline (favorite items, categories, sizes, timing)
--   - Detects item deviation (ordered something completely different)
--   - Detects order size anomaly (unusually large/small order)
--   - Detects category migration (shifted to different menu category)
--   - Detects timing anomaly (different time-of-day than usual)
--   - Detects price tier shift (moved up/down price range)
--   - Detects occasion signal (celebration pattern: dessert + large party)
--   - Recommends personalized response per anomaly type

DEFINE TABLE IF NOT EXISTS order_pattern_anomaly_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON order_pattern_anomaly_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON order_pattern_anomaly_alert TYPE string;
  -- 'item_deviation' | 'order_size_anomaly' | 'category_migration' | 'timing_shift' |
--   'price_tier_shift' | 'occasion_signal' | 'dietary_change' | 'spending_spike'
DEFINE FIELD IF NOT EXISTS severity        ON order_pattern_anomaly_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON order_pattern_anomaly_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON order_pattern_anomaly_alert TYPE string;
DEFINE FIELD IF NOT EXISTS anomaly_type    ON order_pattern_anomaly_alert TYPE option<string>;
  -- 'new_item' | 'larger_order' | 'smaller_order' | 'new_category' | 'new_timing' |
  --   'premium_shift' | 'budget_shift' | 'celebration' | 'dietary'
DEFINE FIELD IF NOT EXISTS baseline_value ON order_pattern_anomaly_alert TYPE option<string>;
  -- customer's typical pattern (e.g., 'Beef Burger', 'lunch', 'mains')
DEFINE FIELD IF NOT EXISTS anomaly_value   ON order_pattern_anomaly_alert TYPE option<string>;
  -- the anomalous pattern (e.g., 'Vegan Bowl', 'dinner', 'starters')
DEFINE FIELD IF NOT EXISTS baseline_order_size ON order_pattern_anomaly_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS anomaly_order_size  ON order_pattern_anomaly_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS baseline_avg_spend   ON order_pattern_anomaly_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS anomaly_spend    ON order_pattern_anomaly_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS deviation_score  ON order_pattern_anomaly_alert TYPE option<float>;
  -- 0-100 how far from baseline (higher = more anomalous)
DEFINE FIELD IF NOT EXISTS customer_orders_count ON order_pattern_anomaly_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON order_pattern_anomaly_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON order_pattern_anomaly_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON order_pattern_anomaly_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON order_pattern_anomaly_alert TYPE option<string>;
  -- 'personalize_recommendation' | 'catering_upsell' | 'loyalty_reward' | 'acknowledge_occasion' |
--   'update_preferences' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON order_pattern_anomaly_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON order_pattern_anomaly_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON order_pattern_anomaly_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ordpatanom_rule      ON order_pattern_anomaly_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ordpatanom_status    ON order_pattern_anomaly_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ordpatanom_severity  ON order_pattern_anomaly_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ordpatanom_customer  ON order_pattern_anomaly_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_ordpatanom_type      ON order_pattern_anomaly_alert FIELDS anomaly_type;

DEFINE FIELD IF NOT EXISTS ordpatanom_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS ordpatanom_min_orders    ON settings TYPE option<int> DEFAULT 5;
  -- min orders to establish baseline (default 5)
DEFINE FIELD IF NOT EXISTS ordpatanom_deviation_threshold ON settings TYPE option<float> DEFAULT 70.0;
  -- deviation score to flag as anomaly (default 70/100)
DEFINE FIELD IF NOT EXISTS ordpatanom_size_multiplier ON settings TYPE option<float> DEFAULT 2.0;
  -- order size multiplier to flag as anomaly (default 2x)
