-- Migration: 2026_08_30_driver_coach.surql
--
-- AI Delivery Driver Performance Coach — 66th POSR-exclusive differentiator.
--
-- Research finding: Delivery driver performance varies 40-60% between best and
-- worst performers (McKinsey last-mile delivery study). Slow drivers cost
-- restaurants $2-5/order in cold food complaints. Bad ratings reduce repeat
-- delivery orders by 25% (DoorDash driver impact study). Yet NO POS system
-- coaches individual drivers — they just track aggregate delivery metrics.
--
-- Toast, Square, Lightspeed have NO driver performance coaching.
-- delivery-analytics.service analyzes PLATFORM performance (DoorDash/UberEats)
-- but NOT individual driver coaching. delivery-route.service optimizes ROUTES
-- but doesn't coach drivers. server-coach.service coaches WAITSTAFF, not
-- delivery drivers.
--
-- Distinct from:
--   - delivery-analytics.service (PLATFORM metrics — NOT individual driver coaching)
--   - delivery-route.service (ROUTE optimization — NOT driver skill development)
--   - server-coach.service (WAITSTAFF coaching — NOT delivery drivers)
--   - server-performance.service (SERVER ranking — NOT driver metrics)
--   - delivery (operational delivery management — NOT AI coaching)

DEFINE TABLE IF NOT EXISTS driver_coach TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON driver_coach TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON driver_coach TYPE string;
  -- 'speed_coaching' | 'accuracy_coaching' | 'rating_improvement' | 'route_efficiency' | 'top_performer'
DEFINE FIELD IF NOT EXISTS severity       ON driver_coach TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS driver_id      ON driver_coach TYPE option<string>;
DEFINE FIELD IF NOT EXISTS driver_name    ON driver_coach TYPE option<string>;
DEFINE FIELD IF NOT EXISTS total_deliveries ON driver_coach TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_delivery_time ON driver_coach TYPE float DEFAULT 0;
  -- avg minutes per delivery
DEFINE FIELD IF NOT EXISTS on_time_rate   ON driver_coach TYPE float DEFAULT 0;
  -- 0-1, % delivered on time
DEFINE FIELD IF NOT EXISTS avg_rating     ON driver_coach TYPE float DEFAULT 0;
  -- 1-5 stars from customers
DEFINE FIELD IF NOT EXISTS complaint_rate ON driver_coach TYPE float DEFAULT 0;
  -- 0-1, % deliveries with complaints
DEFINE FIELD IF NOT EXISTS fuel_efficiency ON driver_coach TYPE float DEFAULT 0;
  -- km per delivery (lower = more efficient)
DEFINE FIELD IF NOT EXISTS overall_score  ON driver_coach TYPE float DEFAULT 0;
  -- 0-100 composite score
DEFINE FIELD IF NOT EXISTS top_strength   ON driver_coach TYPE option<string>;
DEFINE FIELD IF NOT EXISTS improvement_area ON driver_coach TYPE option<string>;
DEFINE FIELD IF NOT EXISTS coaching_actions ON driver_coach TYPE option<string>;
  -- JSON array of specific actions
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON driver_coach TYPE float DEFAULT 0;
  -- projected $ from improving this driver
DEFINE FIELD IF NOT EXISTS description     ON driver_coach TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON driver_coach TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON driver_coach TYPE option<string>;
  -- 'mentor_assignment' | 'route_retraining' | 'performance_review' | 'recognize' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON driver_coach TYPE string DEFAULT 'open';
  -- 'open' | 'coaching_applied' | 'reviewed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON driver_coach TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON driver_coach TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_dc_rule_id   ON driver_coach FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_dc_severity  ON driver_coach FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_dc_status    ON driver_coach FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_dc_driver    ON driver_coach FIELDS driver_id;

-- Settings
DEFINE FIELD IF NOT EXISTS driver_coach_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS driver_coach_lookback_days   ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS driver_coach_min_deliveries  ON settings TYPE option<int>   DEFAULT 5;
  -- need 5+ deliveries to assess
DEFINE FIELD IF NOT EXISTS driver_coach_target_time_min ON settings TYPE option<int>   DEFAULT 30;
  -- target delivery time 30min
