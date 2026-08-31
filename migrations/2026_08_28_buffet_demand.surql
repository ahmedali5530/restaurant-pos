-- Migration: 2026_08_28_buffet_demand.surql
--
-- AI Buffet Demand Prediction — 31st POSR-exclusive differentiator.
--
-- Research finding: Buffet restaurants waste 15-25% of food due to inaccurate
-- guest forecasting. Toast, Square, Lightspeed have NO buffet demand
-- prediction — chefs guess based on experience. POSR predicts guest count
-- per buffet session from historical patterns + DOW + seasonality + AI.
--
-- Distinct from:
--   - waste-tracking.service (analyzes waste AFTER, doesn't predict demand)
--   - spoilage-prediction.service (predicts ingredient expiry, not buffet demand)
--   - demand-forecast.service (forecasts orders, not buffet guests)
--
-- This service predicts BUFFET GUEST COUNT per session — enables right-size
-- production to minimize waste while avoiding stockouts.
--
-- Algorithm:
--   1. Historical avg guests per DOW × session_type (breakfast/lunch/dinner)
--   2. Seasonal adjustment (holiday seasons, weather proxy)
--   3. Recent trend (growing/declining attendance)
--   4. Special event multiplier (holidays, local events)
--   5. AI: confidence score + recommended production qty

DEFINE TABLE IF NOT EXISTS buffet_demand_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON buffet_demand_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS session_id       ON buffet_demand_prediction TYPE option<record<buffet_session>>;
DEFINE FIELD IF NOT EXISTS session_number   ON buffet_demand_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS session_type     ON buffet_demand_prediction TYPE string;
  -- 'breakfast' | 'lunch' | 'dinner' | 'brunch' | 'special'
DEFINE FIELD IF NOT EXISTS business_date     ON buffet_demand_prediction TYPE datetime;
DEFINE FIELD IF NOT EXISTS day_of_week      ON buffet_demand_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS predicted_guests  ON buffet_demand_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS expected_guests   ON buffet_demand_prediction TYPE int;
  -- manager's manual estimate (for comparison)
DEFINE FIELD IF NOT EXISTS historical_avg    ON buffet_demand_prediction TYPE float;
  -- avg actual guests for this DOW × session_type
DEFINE FIELD IF NOT EXISTS trend_pct        ON buffet_demand_prediction TYPE float DEFAULT 0;
  -- recent trend (growing/declining attendance %)
DEFINE FIELD IF NOT EXISTS confidence        ON buffet_demand_prediction TYPE float;
  -- 0-1
DEFINE FIELD IF NOT EXISTS recommended_qty   ON buffet_demand_prediction TYPE float;
  -- recommended production quantity based on predicted guests
DEFINE FIELD IF NOT EXISTS est_waste_prevention ON buffet_demand_prediction TYPE float DEFAULT 0;
  -- estimated $ waste prevented by accurate prediction
DEFINE FIELD IF NOT EXISTS est_stockout_risk ON buffet_demand_prediction TYPE float DEFAULT 0;
  -- 0-1 probability of running out of food
DEFINE FIELD IF NOT EXISTS ai_insight       ON buffet_demand_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actual_guests    ON buffet_demand_prediction TYPE option<int>;
  -- filled after session (for accuracy tracking)
DEFINE FIELD IF NOT EXISTS prediction_error  ON buffet_demand_prediction TYPE option<int>;
  -- actual - predicted (for accuracy tracking)
DEFINE FIELD IF NOT EXISTS predicted_at      ON buffet_demand_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id         ON buffet_demand_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_bdp_session   ON buffet_demand_prediction FIELDS session_id;
DEFINE INDEX IF NOT EXISTS idx_bdp_date       ON buffet_demand_prediction FIELDS business_date;
DEFINE INDEX IF NOT EXISTS idx_bdp_predicted ON buffet_demand_prediction FIELDS predicted_at;

-- Settings
DEFINE FIELD IF NOT EXISTS buffet_demand_ai_enabled  ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS buffet_demand_lookback_days ON settings TYPE option<int>   DEFAULT 90;
DEFINE FIELD IF NOT EXISTS buffet_demand_portion_per_guest ON settings TYPE option<float> DEFAULT 0.5;
  -- kg of food per guest (for production qty calculation)
DEFINE FIELD IF NOT EXISTS buffet_demand_waste_cost_per_kg ON settings TYPE option<float> DEFAULT 8;
  -- avg cost per kg of buffet food wasted
