-- Migration: 2026_08_28_revenue_forecast.surql
--
-- AI Revenue Forecasting Enhancement — 90-day revenue projection.
--
-- Combines demand forecast + seasonal trends + day-of-week patterns
-- for a comprehensive 90-day revenue projection with AI insights.
-- More detailed than the existing demand-forecast.service (7-day only).

DEFINE TABLE IF NOT EXISTS revenue_forecast TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON revenue_forecast TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS forecast_date    ON revenue_forecast TYPE datetime;
DEFINE FIELD IF NOT EXISTS forecast_days    ON revenue_forecast TYPE int DEFAULT 90;
DEFINE FIELD IF NOT EXISTS total_projected_revenue ON revenue_forecast TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_projected_orders ON revenue_forecast TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_daily_revenue  ON revenue_forecast TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS projected_peak_day ON revenue_forecast TYPE option<string>;
DEFINE FIELD IF NOT EXISTS projected_peak_revenue ON revenue_forecast TYPE option<float>;
DEFINE FIELD IF NOT EXISTS projected_quiet_day ON revenue_forecast TYPE option<string>;
DEFINE FIELD IF NOT EXISTS confidence_score  ON revenue_forecast TYPE float DEFAULT 0.7;
DEFINE FIELD IF NOT EXISTS daily_breakdown   ON revenue_forecast TYPE option<array<object>>;
  -- [{date, day_of_week, projected_revenue, projected_orders, is_weekend, is_peak}]
DEFINE FIELD IF NOT EXISTS weekly_breakdown  ON revenue_forecast TYPE option<array<object>>;
  -- [{week, revenue, orders, growth_pct}]
DEFINE FIELD IF NOT EXISTS monthly_breakdown  ON revenue_forecast TYPE option<array<object>>;
  -- [{month, revenue, orders, season}]
DEFINE FIELD IF NOT EXISTS ai_insight       ON revenue_forecast TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendations ON revenue_forecast TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS generated_at     ON revenue_forecast TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON revenue_forecast TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rf_date ON revenue_forecast FIELDS forecast_date;

DEFINE FIELD IF NOT EXISTS rev_forecast_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS rev_forecast_days ON settings TYPE option<int> DEFAULT 90;
