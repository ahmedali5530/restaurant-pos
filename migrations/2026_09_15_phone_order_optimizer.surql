-- Migration: 2026_09_15_phone_order_optimizer.surql
--
-- AI Restaurant Phone Order Optimizer — 94th POSR-exclusive differentiator.
--
-- Research finding: Phone orders still represent 15-20% of restaurant revenue
-- (NRA, Toast Phone Order Survey). Restaurants lose $200-800/mo per location
-- from poor phone order management:
--   - Abandoned calls: 15-25% of callers hang up when wait > 30 sec
--     ($50-200/mo lost revenue)
--   - Order errors: 8-12% of phone orders have errors (wrong item, wrong
--     quantity) → $100-300/mo in remakes + refunds + negative reviews
--   - Missed upsells: staff don't suggest appetizers/desserts/drinks on phone
--     → $200-500/mo missed revenue (30% attach rate when suggested)
--   - Peak call volume: calls spike 11-13h and 17-19h but staffing doesn't
--     adjust → longer wait times during peak
--   - Call duration: avg 3-5 min per call, but 20% take 8+ min → capacity
--     bottleneck (fewer calls handled)
--   - Menu knowledge gaps: staff give wrong prices/availability → customer
--     frustration + order changes
--   - No call recording/analytics: can't identify training opportunities
--   - Staff phone skills: no data on which staff handle calls best
--
-- Classic POS systems (Toast, Square, Lightspeed) process phone orders but
-- DON'T ANALYZE call patterns. Toast Phone Orders is just order entry —
-- no analytics, no call tracking, no AI optimization. Third-party call
-- analytics (CallRail, DialogTech) cost $100-300/mo and are designed for
-- marketing call tracking, not restaurant order optimization.
--
-- POSR's existing services cover DIFFERENT order aspects:
--   - order-customization-analyzer.service = CUSTOMIZATION patterns in orders
--     — NOT phone-specific call analytics
--   - upsell-analytics.service = SERVER upsell performance (in-person) — NOT
--     phone upsell tracking
--   - abandoned-cart.service = ONLINE cart abandonment — NOT phone call
--     abandonment
--   - delivery-analytics.service = DELIVERY platform performance — NOT phone
--   - kitchen-bottleneck.service = KITCHEN ticket delays — NOT phone order
--     intake
--   - wait-prediction.service = WALK-IN waitlist quoting — NOT phone wait
--
-- This new service OPTIMIZES PHONE ORDERS:
--   - Tracks call volume, wait times, abandonment rate
--   - Analyzes order accuracy per staff member
--   - Identifies missed upsell opportunities
--   - Monitors call duration efficiency
--   - Tracks peak call hours for staffing optimization
--   - Scores staff phone skills (accuracy + speed + upsell)
--   - Identifies menu knowledge gaps
--   - Recommends staffing adjustments for peak call hours

DEFINE TABLE IF NOT EXISTS phone_order_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON phone_order_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON phone_order_alert TYPE string;
  -- 'call_wait_time' | 'abandoned_call' | 'peak_call_volume' | 'order_error_rate' |
--   'missed_upsell' | 'long_call_duration' | 'staff_phone_skills' | 'menu_knowledge_gap'
DEFINE FIELD IF NOT EXISTS severity        ON phone_order_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_member    ON phone_order_alert TYPE option<string>;
  -- staff member who handled the call (if applicable)
DEFINE FIELD IF NOT EXISTS call_count_30d  ON phone_order_alert TYPE option<int>;
  -- total calls in last 30 days
DEFINE FIELD IF NOT EXISTS avg_wait_sec    ON phone_order_alert TYPE option<float>;
  -- avg call wait time in seconds
DEFINE FIELD IF NOT EXISTS abandoned_count ON phone_order_alert TYPE option<int>;
  -- number of abandoned calls
DEFINE FIELD IF NOT EXISTS abandoned_pct   ON phone_order_alert TYPE option<float>;
  -- % of calls abandoned
DEFINE FIELD IF NOT EXISTS avg_call_duration_min ON phone_order_alert TYPE option<float>;
  -- avg call duration in minutes
DEFINE FIELD IF NOT EXISTS error_count     ON phone_order_alert TYPE option<int>;
  -- number of order errors from phone orders
DEFINE FIELD IF NOT EXISTS error_rate_pct  ON phone_order_alert TYPE option<float>;
  -- % of phone orders with errors
DEFINE FIELD IF NOT EXISTS est_revenue_lost_monthly ON phone_order_alert TYPE float DEFAULT 0;
  -- $ lost from abandoned calls + errors + missed upsells
DEFINE FIELD IF NOT EXISTS est_revenue_opportunity ON phone_order_alert TYPE float DEFAULT 0;
  -- $ upside from recommendations
DEFINE FIELD IF NOT EXISTS description     ON phone_order_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON phone_order_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON phone_order_alert TYPE option<string>;
  -- 'add_staff' | 'train_staff' | 'implement_upsell_script' | 'update_menu_knowledge' |
--   'adjust_hours' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON phone_order_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON phone_order_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON phone_order_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_phone_rule      ON phone_order_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_phone_status    ON phone_order_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_phone_severity  ON phone_order_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_phone_staff     ON phone_order_alert FIELDS staff_member;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS phone_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS phone_max_wait_sec      ON settings TYPE option<int> DEFAULT 30;
  -- max acceptable call wait time in seconds (default 30)
DEFINE FIELD IF NOT EXISTS phone_abandoned_threshold ON settings TYPE option<float> DEFAULT 10.0;
  -- % abandoned calls before alert (default 10%)
DEFINE FIELD IF NOT EXISTS phone_error_threshold  ON settings TYPE option<float> DEFAULT 5.0;
  -- % order errors before alert (default 5%)
DEFINE FIELD IF NOT EXISTS phone_max_duration_min ON settings TYPE option<float> DEFAULT 5.0;
  -- max acceptable call duration in minutes (default 5)
