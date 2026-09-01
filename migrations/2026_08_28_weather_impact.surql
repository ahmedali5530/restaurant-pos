-- Migration: 2026_08_28_weather_impact.surql
--
-- AI Weather Impact Analysis — 38th POSR-exclusive differentiator.
--
-- Research finding: Weather affects restaurant revenue by 20-30% but no POS
-- system correlates weather data with sales. Toast, Square, Lightspeed have
-- NO weather integration. POSR analyzes how temperature, rain, wind affect
-- revenue + generates weather-aware operational recommendations.
--
-- Distinct from:
--   - demand-forecast.service (uses historical patterns, not weather data)
--   - seasonal.service (monthly trends, not daily weather)
--   - peak-hour.service (hour patterns, not weather correlation)
--
-- This service correlates WEATHER DATA with sales to predict weather impact.

DEFINE TABLE IF NOT EXISTS weather_impact TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON weather_impact TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS analysis_date    ON weather_impact TYPE datetime;
DEFINE FIELD IF NOT EXISTS avg_temp         ON weather_impact TYPE option<float>;
DEFINE FIELD IF NOT EXISTS condition        ON weather_impact TYPE option<string>;
  -- 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy'
DEFINE FIELD IF NOT EXISTS precipitation_mm  ON weather_impact TYPE option<float>;
DEFINE FIELD IF NOT EXISTS wind_kmh         ON weather_impact TYPE option<float>;
DEFINE FIELD IF NOT EXISTS actual_revenue   ON weather_impact TYPE option<float>;
DEFINE FIELD IF NOT EXISTS expected_revenue  ON weather_impact TYPE float;
  -- baseline revenue for this DOW
DEFINE FIELD IF NOT EXISTS revenue_delta     ON weather_impact TYPE float;
  -- actual - expected
DEFINE FIELD IF NOT EXISTS revenue_delta_pct ON weather_impact TYPE float;
DEFINE FIELD IF NOT EXISTS temp_correlation  ON weather_impact TYPE option<float>;
  -- -1 to 1 (correlation between temp and revenue)
DEFINE FIELD IF NOT EXISTS rain_impact_pct  ON weather_impact TYPE option<float>;
  -- % revenue change on rainy days vs dry days
DEFINE FIELD IF NOT EXISTS sunny_boost_pct   ON weather_impact TYPE option<float>;
  -- % revenue change on sunny days vs average
DEFINE FIELD IF NOT EXISTS optimal_temp_range ON weather_impact TYPE option<string>;
  -- e.g. "15-25°C" — temp range with highest revenue
DEFINE FIELD IF NOT EXISTS ai_insight       ON weather_impact TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON weather_impact TYPE option<string>;
  -- 'adjust_staffing' | 'prepare_promo' | 'reduce_inventory' | 'increase_staffing' | 'no_action'
DEFINE FIELD IF NOT EXISTS analyzed_at      ON weather_impact TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_wi_date ON weather_impact FIELDS analysis_date;
DEFINE INDEX IF NOT EXISTS idx_wi_analyzed ON weather_impact FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS weather_ai_enabled      ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS weather_lookback_days     ON settings TYPE option<int>   DEFAULT 90;
DEFINE FIELD IF NOT EXISTS weather_temp_buckets      ON settings TYPE option<int>   DEFAULT 5;
  -- number of temperature buckets for correlation
