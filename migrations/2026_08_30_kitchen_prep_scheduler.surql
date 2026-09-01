-- Migration: 2026_08_30_kitchen_prep_scheduler.surql
--
-- AI Kitchen Prep Scheduler — 62nd POSR-exclusive differentiator.
--
-- Research finding: Kitchen timing is the #1 driver of food quality and customer
-- satisfaction (CIA Culinary Institute). Starting prep too early → food sits,
-- loses quality. Starting too late → delays, cold food, complaints. Restaurants
-- lose 15-20% of satisfaction to timing issues (NRA operations study).
--
-- Toast KDS shows order tickets but DOESN'T predict WHEN to start prep.
-- Square Kitchen has basic ticket routing but no predictive scheduling.
-- Lightspeed Kitchen Display has no prep timing intelligence.
-- POSR's kitchen-bottleneck.service detects bottlenecks AFTER they happen.
-- demand-forecast.service predicts ORDER VOLUME but not PREP START TIMES.
--
-- This new service predicts optimal prep start times per dish per hour based on:
--   1. Historical order patterns (which dishes ordered when)
--   2. Dish complexity (prep time per dish)
--   3. Kitchen capacity (cooks × stations)
--   4. Holding time (how long dish stays fresh after prep)
--   5. Order forecast (predicted demand per slot)
--
-- Distinct from:
--   - kitchen-bottleneck.service (detects bottlenecks AFTER they happen — NOT
--     predictive prep scheduling)
--   - demand-forecast.service (predicts ORDER VOLUME — NOT prep start times)
--   - peak-hour.service (predicts peak hours — NOT dish-level prep timing)
--   - wait-prediction.service (predicts customer WAIT — NOT kitchen prep)
--   - scheduling.service (STAFF scheduling — NOT dish prep scheduling)

DEFINE TABLE IF NOT EXISTS kitchen_prep_schedule TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON kitchen_prep_schedule TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON kitchen_prep_schedule TYPE string;
  -- 'prep_now' | 'prep_ahead' | 'hold_alert' | 'capacity_warning' | 'batch_optimal'
DEFINE FIELD IF NOT EXISTS severity       ON kitchen_prep_schedule TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS dish_id        ON kitchen_prep_schedule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dish_name      ON kitchen_prep_schedule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS target_hour    ON kitchen_prep_schedule TYPE int;
  -- hour when dish is predicted to be ordered
DEFINE FIELD IF NOT EXISTS predicted_orders ON kitchen_prep_schedule TYPE int DEFAULT 0;
  -- predicted order count for this hour
DEFINE FIELD IF NOT EXISTS prep_time_minutes ON kitchen_prep_schedule TYPE int DEFAULT 0;
  -- dish prep time
DEFINE FIELD IF NOT EXISTS suggested_start_time ON kitchen_prep_schedule TYPE option<datetime>;
  -- when to start prep
DEFINE FIELD IF NOT EXISTS holding_time_minutes ON kitchen_prep_schedule TYPE int DEFAULT 0;
  -- max time dish can hold before quality degrades
DEFINE FIELD IF NOT EXISTS kitchen_capacity_pct ON kitchen_prep_schedule TYPE float DEFAULT 0;
  -- current kitchen utilization 0-100
DEFINE FIELD IF NOT EXISTS batch_size     ON kitchen_prep_schedule TYPE int DEFAULT 1;
  -- optimal batch size for this dish
DEFINE FIELD IF NOT EXISTS est_waste_risk ON kitchen_prep_schedule TYPE float DEFAULT 0;
  -- 0-1, risk of over-prepping
DEFINE FIELD IF NOT EXISTS est_delay_risk ON kitchen_prep_schedule TYPE float DEFAULT 0;
  -- 0-1, risk of under-prepping (delays)
DEFINE FIELD IF NOT EXISTS description     ON kitchen_prep_schedule TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON kitchen_prep_schedule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON kitchen_prep_schedule TYPE option<string>;
  -- 'start_prep_now' | 'prep_batch' | 'hold' | 'add_cook' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON kitchen_prep_schedule TYPE string DEFAULT 'open';
  -- 'open' | 'prepping' | 'completed' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON kitchen_prep_schedule TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON kitchen_prep_schedule TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_kps_rule_id   ON kitchen_prep_schedule FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_kps_severity  ON kitchen_prep_schedule FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_kps_status    ON kitchen_prep_schedule FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_kps_dish      ON kitchen_prep_schedule FIELDS dish_id;

-- Settings
DEFINE FIELD IF NOT EXISTS kitchen_prep_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS kitchen_prep_lookback_days   ON settings TYPE option<int>   DEFAULT 14;
  -- analyze last 14 days of orders for patterns
DEFINE FIELD IF NOT EXISTS kitchen_prep_capacity_threshold ON settings TYPE option<float> DEFAULT 0.80;
  -- kitchen at 80% capacity = warning
DEFINE FIELD IF NOT EXISTS kitchen_prep_holding_buffer_pct ON settings TYPE option<float> DEFAULT 0.20;
  -- start prep 20% earlier than minimum to allow buffer
