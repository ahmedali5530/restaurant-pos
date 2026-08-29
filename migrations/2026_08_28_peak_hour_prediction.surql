-- Migration: 2026_08_28_peak_hour_prediction.surql
--
-- AI Peak Hour Prediction — forecast busiest hours for staffing + stocking.
--
-- Research finding: Toast Peak Hour Analytics $25+/mo (higher tier), Square
-- Hourly Trends in Plus. POSR offers it free — analyzes historical order
-- patterns to predict peak hours for each day of week + AI recommendations
-- for staffing + prep scheduling.

DEFINE TABLE IF NOT EXISTS peak_hour_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON peak_hour_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS day_of_week     ON peak_hour_prediction TYPE int;
  -- 0=Sunday ... 6=Saturday
DEFINE FIELD IF NOT EXISTS predicted_peak_hour ON peak_hour_prediction TYPE int;
  -- Hour (0-23) predicted to be the busiest
DEFINE FIELD IF NOT EXISTS predicted_peak_orders ON peak_hour_prediction TYPE float;
  -- Predicted order count during peak hour
DEFINE FIELD IF NOT EXISTS predicted_peak_revenue ON peak_hour_prediction TYPE float;
  -- Predicted revenue during peak hour
DEFINE FIELD IF NOT EXISTS second_peak_hour ON peak_hour_prediction TYPE option<int>;
  -- Second busiest hour
DEFINE FIELD IF NOT EXISTS quietest_hour   ON peak_hour_prediction TYPE int;
  -- Least busy hour
DEFINE FIELD IF NOT EXISTS hourly_breakdown ON peak_hour_prediction TYPE option<array<object>>;
  -- [{hour, predicted_orders, predicted_revenue, staffing_needed}]
DEFINE FIELD IF NOT EXISTS recommended_staffing ON peak_hour_prediction TYPE option<array<object>>;
  -- [{hour, staff_count, role}]
DEFINE FIELD IF NOT EXISTS prep_schedule    ON peak_hour_prediction TYPE option<array<object>>;
  -- [{prep_start_hour, items_to_prep, target_completion_hour}]
DEFINE FIELD IF NOT EXISTS ai_insight      ON peak_hour_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS generated_at    ON peak_hour_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON peak_hour_prediction TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_php_day ON peak_hour_prediction FIELDS day_of_week;

DEFINE FIELD IF NOT EXISTS peak_hour_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS peak_hour_lookback_days ON settings TYPE option<int> DEFAULT 90;
DEFINE FIELD IF NOT EXISTS peak_hour_orders_per_staff ON settings TYPE option<int> DEFAULT 12;
