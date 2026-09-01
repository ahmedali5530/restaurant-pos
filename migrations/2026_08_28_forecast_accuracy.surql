-- Migration: 2026_08_28_forecast_accuracy.surql
--
-- AI Forecast Accuracy Tracking — measure prediction quality.
--
-- Research finding: Toast Predict + Square Forecast bundle accuracy
-- measurement in their AI tiers. POSR offers it free — persists hourly
-- predictions then compares against actuals once the day passes, computing
-- standard metrics (MAPE/MAE/bias) + per-hour + per-day accuracy.
--
-- Why it matters:
--   - Without measurement, AI is a black box — operators don't know if
--     they can trust the forecast for staffing/purchasing decisions
--   - Identifies which hours/days the AI gets wrong → can be retrained
--   - Shows trend: is accuracy improving or degrading over time?
--   - Builds trust: visible metrics → operators rely on AI more
--
-- Tables:
--   1. forecast_prediction — persisted per-hour predictions (created when
--      a demand forecast is generated, locked in so we can compare later)
--   2. forecast_accuracy — computed accuracy rollups per forecast run
--
-- Metrics:
--   - MAPE: Mean Absolute Percentage Error — avg % error (lower = better)
--       MAPE = avg( |actual - predicted| / actual ) × 100
--   - MAE:  Mean Absolute Error — avg absolute deviation (in orders)
--   - Bias: signed avg error — positive = over-predicting, negative = under
--       bias = avg( predicted - actual )
--   - Accuracy: 100 - MAPE (capped at 0)
--   - Coverage: % hours with actual data (excludes closed/missing hours)
--
-- Standard benchmarks (restaurant industry):
--   - MAPE < 15%: excellent (trust for staffing + purchasing)
--   - MAPE 15-25%: good (usable with buffer)
--   - MAPE 25-40%: fair (use cautiously, add safety margin)
--   - MAPE > 40%: poor (review model, check data quality)

-- ---------------------------------------------------------------------------
-- forecast_prediction — persisted per-hour predictions
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS forecast_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON forecast_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS forecast_batch_id ON forecast_prediction TYPE string;
  -- Groups predictions from the same forecast run
DEFINE FIELD IF NOT EXISTS target_date     ON forecast_prediction TYPE datetime;
  -- The day being predicted (date only, time=00:00)
DEFINE FIELD IF NOT EXISTS target_hour     ON forecast_prediction TYPE option<int>;
  -- 0-23, null = daily aggregate prediction
DEFINE FIELD IF NOT EXISTS day_of_week     ON forecast_prediction TYPE option<int>;
  -- 0=Sunday ... 6=Saturday
DEFINE FIELD IF NOT EXISTS predicted_orders ON forecast_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS predicted_revenue ON forecast_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS confidence      ON forecast_prediction TYPE float DEFAULT 0.7;
  -- 0-1, the forecast's self-reported confidence
DEFINE FIELD IF NOT EXISTS ai_enhanced     ON forecast_prediction TYPE bool DEFAULT false;
  -- Was AI used to generate this prediction?
DEFINE FIELD IF NOT EXISTS generated_at    ON forecast_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS evaluated       ON forecast_prediction TYPE bool DEFAULT false;
  -- True once compared with actuals
DEFINE FIELD IF NOT EXISTS actual_orders    ON forecast_prediction TYPE option<int>;
DEFINE FIELD IF NOT EXISTS actual_revenue   ON forecast_prediction TYPE option<float>;
DEFINE FIELD IF NOT EXISTS evaluated_at    ON forecast_prediction TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS error_orders     ON forecast_prediction TYPE option<int>;
  -- predicted - actual (signed)
DEFINE FIELD IF NOT EXISTS error_pct       ON forecast_prediction TYPE option<float>;
  -- |error| / actual × 100

DEFINE INDEX IF NOT EXISTS idx_fp_batch_id   ON forecast_prediction FIELDS forecast_batch_id;
DEFINE INDEX IF NOT EXISTS idx_fp_target_date ON forecast_prediction FIELDS target_date;
DEFINE INDEX IF NOT EXISTS idx_fp_evaluated   ON forecast_prediction FIELDS evaluated;
DEFINE INDEX IF NOT EXISTS idx_fp_ai_enhanced ON forecast_prediction FIELDS ai_enhanced;

-- ---------------------------------------------------------------------------
-- forecast_accuracy — computed accuracy rollups per forecast run
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS forecast_accuracy TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON forecast_accuracy TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS forecast_batch_id ON forecast_accuracy TYPE string;
DEFINE FIELD IF NOT EXISTS period_start     ON forecast_accuracy TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON forecast_accuracy TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_predictions ON forecast_accuracy TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS evaluated_count  ON forecast_accuracy TYPE int DEFAULT 0;
  -- How many predictions have actuals
DEFINE FIELD IF NOT EXISTS mape            ON forecast_accuracy TYPE float DEFAULT 0;
  -- Mean Absolute Percentage Error (lower = better)
DEFINE FIELD IF NOT EXISTS mae             ON forecast_accuracy TYPE float DEFAULT 0;
  -- Mean Absolute Error (in orders)
DEFINE FIELD IF NOT EXISTS bias            ON forecast_accuracy TYPE float DEFAULT 0;
  -- Signed avg error (positive = over-predicting)
DEFINE FIELD IF NOT EXISTS accuracy_pct     ON forecast_accuracy TYPE float DEFAULT 0;
  -- 100 - MAPE (capped at 0)
DEFINE FIELD IF NOT EXISTS coverage_pct    ON forecast_accuracy TYPE float DEFAULT 0;
  -- % predictions with actual data
DEFINE FIELD IF NOT EXISTS best_hour        ON forecast_accuracy TYPE option<int>;
  -- Hour with lowest error
DEFINE FIELD IF NOT EXISTS worst_hour       ON forecast_accuracy TYPE option<int>;
  -- Hour with highest error
DEFINE FIELD IF NOT EXISTS best_day         ON forecast_accuracy TYPE option<string>;
  -- Day name with lowest error
DEFINE FIELD IF NOT EXISTS worst_day        ON forecast_accuracy TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_enhanced       ON forecast_accuracy TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS ai_insights      ON forecast_accuracy TYPE option<string>;
  -- AI analysis of why errors occurred
DEFINE FIELD IF NOT EXISTS ai_recommendations ON forecast_accuracy TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS generated_at     ON forecast_accuracy TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS evaluated_at     ON forecast_accuracy TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_fa_batch_id   ON forecast_accuracy FIELDS forecast_batch_id;
DEFINE INDEX IF NOT EXISTS idx_fa_evaluated  ON forecast_accuracy FIELDS evaluated_at;
DEFINE INDEX IF NOT EXISTS idx_fa_ai_enhanced ON forecast_accuracy FIELDS ai_enhanced;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS forecast_accuracy_auto_evaluate ON settings TYPE option<bool> DEFAULT true;
  -- When true, predictions are auto-evaluated daily against actuals
DEFINE FIELD IF NOT EXISTS forecast_accuracy_lookback_days ON settings TYPE option<int> DEFAULT 30;
  -- How many past forecasts to evaluate (default: 30 days back)
DEFINE FIELD IF NOT EXISTS forecast_accuracy_ai_enabled ON settings TYPE option<bool> DEFAULT true;
  -- Enable AI insights on accuracy (why errors occurred)
DEFINE FIELD IF NOT EXISTS forecast_accuracy_min_evaluations ON settings TYPE option<int> DEFAULT 5;
  -- Min predictions evaluated before generating accuracy rollup
