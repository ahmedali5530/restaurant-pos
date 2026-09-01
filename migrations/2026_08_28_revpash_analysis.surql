-- Migration: 2026_08_28_revpash_analysis.surql
--
-- AI Revenue Per Available Seat Hour (RevPASH) — restaurant efficiency metric.
--
-- Unique to POSR — Toast and Square don't have this hotel-industry metric
-- adapted for restaurants. RevPASH = total_revenue / (total_seats × open_hours).
-- It measures how efficiently the restaurant monetizes its seating capacity
-- per hour — the single most important metric for restaurant profitability.
--
-- Metrics:
--   - RevPASH: revenue / (seats × hours)
--   - Seat utilization: occupied seats / available seats
--   - Revenue per occupied seat
--   - Hourly RevPASH breakdown (peak vs off-peak efficiency)
--   - Day-of-week RevPASH comparison
--   - Benchmarks: <$5/hr = poor, $5-10 = average, $10-20 = good, >$20 = excellent

DEFINE TABLE IF NOT EXISTS revpash_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON revpash_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS analysis_date    ON revpash_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_start    ON revpash_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON revpash_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_revenue    ON revpash_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_seats      ON revpash_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS open_hours_per_day ON revpash_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_operating_hours ON revpash_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS revpash         ON revpash_analysis TYPE float DEFAULT 0;
  -- revenue / (seats × operating_hours)
DEFINE FIELD IF NOT EXISTS avg_seat_utilization ON revpash_analysis TYPE float DEFAULT 0;
  -- avg occupied seats / total seats (0-1)
DEFINE FIELD IF NOT EXISTS revenue_per_occupied_seat ON revpash_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_orders    ON revpash_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_order_value  ON revpash_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS hourly_breakdown ON revpash_analysis TYPE option<array<object>>;
  -- [{hour, revenue, seats_occupied, revpash, utilization}]
DEFINE FIELD IF NOT EXISTS daily_breakdown  ON revpash_analysis TYPE option<array<object>>;
  -- [{day_of_week, revenue, revpash, utilization}]
DEFINE FIELD IF NOT EXISTS benchmark_grade  ON revpash_analysis TYPE string DEFAULT 'C';
  -- A (>20) / B (10-20) / C (5-10) / D (2-5) / F (<2)
DEFINE FIELD IF NOT EXISTS ai_insight       ON revpash_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendations ON revpash_analysis TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS projected_revenue_uplift ON revpash_analysis TYPE option<float>;
DEFINE FIELD IF NOT EXISTS generated_at     ON revpash_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON revpash_analysis TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ra_date ON revpash_analysis FIELDS analysis_date;

DEFINE FIELD IF NOT EXISTS revpash_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS revpash_lookback_days ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS revpash_open_hours_per_day ON settings TYPE option<float> DEFAULT 15;
DEFINE FIELD IF NOT EXISTS revpash_target_revpash ON settings TYPE option<float> DEFAULT 10;
