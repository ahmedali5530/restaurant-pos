-- Migration: 2026_08_28_kitchen_bottleneck.surql
--
-- AI Real-Time Kitchen Bottleneck Detection — 11th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 8-15% of revenue from kitchen bottlenecks
-- (long ticket times → customer complaints → lost repeat business). Toast Kitchen
-- Display System (KDS) has basic timer alerts, but NO AI bottleneck prediction.
-- Square has nothing. POSR predicts bottlenecks 10-30 min ahead + AI recs.
--
-- Detection rules (7):
--   1. STAGE_BOTTLENECK   — a specific stage has avg duration > 1.5x other stages
--   2. RUSH_HOUR_OVERFLOW — incoming tickets faster than completion rate during peak
--   3. TABLE_TICKET_DELAY — ticket time > 25 min for dine-in (FDA rec < 20min)
--   4. STATION_OVERLOAD   — single station has > capacity items in queue
--   5. STAFF_IDLE_WHILE_QUEUE — staff available but not picking up tickets
--   6. REROUTE_SUGGESTION — items waiting > 10 min could be rerouted to idle station
--   7. SLOW_ITEM          — specific menu_item consistently slower than similar items
--
-- Each alert gets AI insight + recommendation:
--   reroute_items | add_staff | redistribute_load | simplify_recipe |
--   train_staff | prep_ahead | dismiss

DEFINE TABLE IF NOT EXISTS kitchen_bottleneck_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON kitchen_bottleneck_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON kitchen_bottleneck_alert TYPE string;
  -- 'stage_bottleneck' | 'rush_hour_overflow' | 'table_ticket_delay' |
  -- 'station_overload' | 'staff_idle_while_queue' | 'reroute_suggestion' | 'slow_item'
DEFINE FIELD IF NOT EXISTS severity       ON kitchen_bottleneck_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS stage          ON kitchen_bottleneck_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS station_id     ON kitchen_bottleneck_alert TYPE option<record<kitchen>>;
DEFINE FIELD IF NOT EXISTS station_name   ON kitchen_bottleneck_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS menu_item_id   ON kitchen_bottleneck_alert TYPE option<record<menu_item>>;
DEFINE FIELD IF NOT EXISTS menu_item_name ON kitchen_bottleneck_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_item_id  ON kitchen_bottleneck_alert TYPE option<record<order_item>>;
DEFINE FIELD IF NOT EXISTS staff_id       ON kitchen_bottleneck_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS staff_name     ON kitchen_bottleneck_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metric_value   ON kitchen_bottleneck_alert TYPE float;
DEFINE FIELD IF NOT EXISTS expected_value  ON kitchen_bottleneck_alert TYPE float;
DEFINE FIELD IF NOT EXISTS deviation_pct  ON kitchen_bottleneck_alert TYPE float;
DEFINE FIELD IF NOT EXISTS estimated_loss ON kitchen_bottleneck_alert TYPE float;
  -- estimated $ lost per day if bottleneck continues
DEFINE FIELD IF NOT EXISTS queue_size     ON kitchen_bottleneck_alert TYPE option<int>;
  -- number of items waiting in queue at detection time
DEFINE FIELD IF NOT EXISTS description   ON kitchen_bottleneck_alert TYPE string;
DEFINE FIELD IF NOT EXISTS context        ON kitchen_bottleneck_alert TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ai_insight     ON kitchen_bottleneck_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON kitchen_bottleneck_alert TYPE option<string>;
  -- 'reroute_items' | 'add_staff' | 'redistribute_load' | 'simplify_recipe' |
  -- 'train_staff' | 'prep_ahead' | 'dismiss'
DEFINE FIELD IF NOT EXISTS status        ON kitchen_bottleneck_alert TYPE string DEFAULT 'open';
  -- 'open' | 'investigating' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS detected_at   ON kitchen_bottleneck_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON kitchen_bottleneck_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_kba_rule_id   ON kitchen_bottleneck_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_kba_severity  ON kitchen_bottleneck_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_kba_status    ON kitchen_bottleneck_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_kba_stage     ON kitchen_bottleneck_alert FIELDS stage;
DEFINE INDEX IF NOT EXISTS idx_kba_detected  ON kitchen_bottleneck_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS kitchen_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS kitchen_lookback_hours      ON settings TYPE option<int>   DEFAULT 4;
  -- real-time scan window (last 4 hours)
DEFINE FIELD IF NOT EXISTS kitchen_stage_bottleneck_multiplier ON settings TYPE option<float> DEFAULT 1.5;
  -- stage avg > 1.5x others triggers STAGE_BOTTLENECK
DEFINE FIELD IF NOT EXISTS kitchen_ticket_delay_min     ON settings TYPE option<int>   DEFAULT 25;
  -- dine-in ticket > 25 min triggers TABLE_TICKET_DELAY (FDA rec < 20)
DEFINE FIELD IF NOT EXISTS kitchen_station_capacity     ON settings TYPE option<int>   DEFAULT 8;
  -- station queue > 8 items triggers STATION_OVERLOAD
DEFINE FIELD IF NOT EXISTS kitchen_reroute_threshold_min ON settings TYPE option<int>   DEFAULT 10;
  -- items waiting > 10 min triggers REROUTE_SUGGESTION
DEFINE FIELD IF NOT EXISTS kitchen_slow_item_pct        ON settings TYPE option<float> DEFAULT 0.25;
  -- item takes > 25% longer than category avg triggers SLOW_ITEM
