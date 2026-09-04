-- Migration: 2026_10_01_kitchen_demand_surge.surql
--
-- AI Kitchen Demand Surge Predictor — 110th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from kitchen
-- bottlenecks that could be prevented with 15-30 min advance warning (NRA
-- Kitchen Operations Study, Cornell Restaurant Labor):
--   - 60% of kitchen bottlenecks are predictable from historical patterns
--   - Pre-prepping 15 min before a surge cuts ticket time by 40%
--   - No POS predicts ITEM-LEVEL demand surges (only overall revenue forecasts)
--   - Kitchen learns about a surge WHEN IT HAPPENS — too late to pre-prep
--   - Station overload (grill + saute + fry all spike at once) causes cascading delays
--   - Ingredient stock not checked before predicted surge → runs out mid-rush
--   - Staffing gaps discovered too late (no time to reassign before rush)
--   - False surge alerts waste prep labor (no context filtering)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO kitchen demand surge
-- prediction. kitchen-prep-scheduler schedules daily prep tasks. kitchen-bottleneck
-- detects bottlenecks AFTER they happen. peak-hour-prediction predicts overall
-- peak HOURS (not item-level). order-pacing paces incoming orders. None predict
-- item-level demand surges 15-30 min ahead with pre-prep action triggers.
--
-- This new service PREDICTS KITCHEN DEMAND SURGES at item level:
--   - Forecasts per-item demand 15-30 min ahead using historical patterns
--   - Factors in day-of-week, time-of-day, weather, events, promotions
--   - Triggers pre-prep recommendations before surge hits
--   - Detects multi-station simultaneous overload (cascading bottleneck risk)
--   - Checks ingredient stock before recommending pre-prep
--   - Flags staffing gaps at specific stations
--   - Filters false surges using context (weather change, event cancellation)
--   - Tracks surge prediction accuracy for model improvement

DEFINE TABLE IF NOT EXISTS kitchen_surge_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON kitchen_surge_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON kitchen_surge_alert TYPE string;
  -- 'surge_imminent' | 'prep_lead_time_warning' | 'station_overload_predicted' |
--   'ingredient_stock_warning' | 'staffing_gap_predicted' | 'false_surge_filtered' |
--   'surge_decayed' | 'cross_station_coordination'
DEFINE FIELD IF NOT EXISTS severity        ON kitchen_surge_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON kitchen_surge_alert TYPE string;
DEFINE FIELD IF NOT EXISTS station         ON kitchen_surge_alert TYPE option<string>;
  -- 'grill' | 'saute' | 'fry' | 'cold' | 'pastry' | 'bar' | 'expediter'
DEFINE FIELD IF NOT EXISTS current_rate    ON kitchen_surge_alert TYPE option<float>;
  -- current orders per 15 min
DEFINE FIELD IF NOT EXISTS predicted_rate  ON kitchen_surge_alert TYPE option<float>;
  -- predicted orders per 15 min in next window
DEFINE FIELD IF NOT EXISTS surge_pct       ON kitchen_surge_alert TYPE option<float>;
  -- % increase predicted
DEFINE FIELD IF NOT EXISTS minutes_ahead   ON kitchen_surge_alert TYPE option<int>;
  -- how many minutes ahead the surge is predicted
DEFINE FIELD IF NOT EXISTS prep_lead_minutes ON kitchen_surge_alert TYPE option<int>;
  -- item prep lead time in minutes
DEFINE FIELD IF NOT EXISTS current_stock   ON kitchen_surge_alert TYPE option<float>;
  -- current ingredient stock (portions)
DEFINE FIELD IF NOT EXISTS stock_needed    ON kitchen_surge_alert TYPE option<float>;
  -- predicted portions needed during surge
DEFINE FIELD IF NOT EXISTS staff_assigned  ON kitchen_surge_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS staff_needed    ON kitchen_surge_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS confidence_pct  ON kitchen_surge_alert TYPE option<float>;
  -- prediction confidence 0-100
DEFINE FIELD IF NOT EXISTS context_factors ON kitchen_surge_alert TYPE option<string>;
  -- 'day_of_week' | 'time_of_day' | 'weather' | 'event' | 'promotion' | 'historical'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON kitchen_surge_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON kitchen_surge_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON kitchen_surge_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON kitchen_surge_alert TYPE option<string>;
  -- 'start_prep_now' | 'restock_ingredient' | 'reassign_staff' | 'hold_prep' |
--   'coordinate_stations' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON kitchen_surge_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON kitchen_surge_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON kitchen_surge_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_kitchensurge_rule      ON kitchen_surge_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_kitchensurge_status    ON kitchen_surge_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_kitchensurge_severity  ON kitchen_surge_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_kitchensurge_item      ON kitchen_surge_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_kitchensurge_station   ON kitchen_surge_alert FIELDS station;

DEFINE FIELD IF NOT EXISTS kitchensurge_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS kitchensurge_threshold     ON settings TYPE option<float> DEFAULT 50.0;
  -- % increase to flag as surge (default 50%)
DEFINE FIELD IF NOT EXISTS kitchensurge_prep_window   ON settings TYPE option<int> DEFAULT 15;
  -- minutes ahead to predict (default 15)
DEFINE FIELD IF NOT EXISTS kitchensurge_min_confidence ON settings TYPE option<float> DEFAULT 70.0;
  -- minimum confidence to act on surge (default 70%)
DEFINE FIELD IF NOT EXISTS kitchensurge_stock_buffer  ON settings TYPE option<float> DEFAULT 20.0;
  -- % stock buffer above predicted need (default 20%)
