-- Migration: 2026_08_28_seasonal_trends.surql
--
-- AI Seasonal Trend Analysis — month-over-month + year-over-year patterns.
--
-- Research finding: Toast Seasonal Insights $25+/mo (higher tier), Square
-- doesn't have this. POSR offers it free — analyzes seasonal revenue,
-- order volume, avg ticket, popular items, staffing needs, + AI predictions
-- for upcoming seasonal shifts.

DEFINE TABLE IF NOT EXISTS seasonal_trend TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON seasonal_trend TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS month           ON seasonal_trend TYPE int;
  -- 1-12 (January = 1)
DEFINE FIELD IF NOT EXISTS month_name     ON seasonal_trend TYPE string;
DEFINE FIELD IF NOT EXISTS total_revenue    ON seasonal_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_orders    ON seasonal_trend TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_order_value  ON seasonal_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS unique_customers ON seasonal_trend TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_daily_revenue ON seasonal_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS peak_day         ON seasonal_trend TYPE option<string>;
DEFINE FIELD IF NOT EXISTS peak_day_revenue ON seasonal_trend TYPE option<float>;
DEFINE FIELD IF NOT EXISTS top_items       ON seasonal_trend TYPE option<array<object>>;
  -- [{name, quantity, revenue}]
DEFINE FIELD IF NOT EXISTS yoy_revenue_change ON seasonal_trend TYPE option<float>;
  -- Year-over-year % change
DEFINE FIELD IF NOT EXISTS yoy_orders_change ON seasonal_trend TYPE option<float>;
DEFINE FIELD IF NOT EXISTS mom_revenue_change ON seasonal_trend TYPE option<float>;
  -- Month-over-month % change
DEFINE FIELD IF NOT EXISTS season          ON seasonal_trend TYPE string;
  -- 'winter' | 'spring' | 'summer' | 'fall'
DEFINE FIELD IF NOT EXISTS is_peak_season  ON seasonal_trend TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS ai_insight      ON seasonal_trend TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendations ON seasonal_trend TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS generated_at    ON seasonal_trend TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON seasonal_trend TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_st_month ON seasonal_trend FIELDS month;

DEFINE FIELD IF NOT EXISTS seasonal_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS seasonal_lookback_years ON settings TYPE option<int> DEFAULT 2;
