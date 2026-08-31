-- Migration: 2026_08_28_peak_pricing.surql
--
-- AI Peak Demand Pricing Engine — 39th POSR-exclusive differentiator.
--
-- Research finding: Restaurants leave 15-20% revenue on the table by not
-- adjusting prices during peak demand. Toast and Square have STATIC discount
-- rules but NO dynamic peak pricing. POSR generates demand-based price
-- adjustments (surge pricing during peaks, discount during lulls).
--
-- Distinct from:
--   - dynamic-pricing.service (creates discount rules by time-of-day, not
--     demand-responsive)
--   - price-elasticity.service (computes optimal price, not demand-based surge)
--   - peak-hour.service (predicts busiest hours, doesn't set prices)
--
-- This service generates DEMAND-RESPONSIVE pricing rules.

DEFINE TABLE IF NOT EXISTS peak_pricing_rule TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON peak_pricing_rule TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS day_of_week     ON peak_pricing_rule TYPE int;
DEFINE FIELD IF NOT EXISTS hour            ON peak_pricing_rule TYPE int;
DEFINE FIELD IF NOT EXISTS predicted_demand ON peak_pricing_rule TYPE int;
  -- predicted orders for this hour
DEFINE FIELD IF NOT EXISTS capacity         ON peak_pricing_rule TYPE int;
  -- max covers the restaurant can serve
DEFINE FIELD IF NOT EXISTS demand_ratio    ON peak_pricing_rule TYPE float;
  -- predicted_demand / capacity (>1 = over capacity)
DEFINE FIELD IF NOT EXISTS pricing_tier     ON peak_pricing_rule TYPE string;
  -- 'surge' | 'normal' | 'discount'
DEFINE FIELD IF NOT EXISTS price_adjustment_pct ON peak_pricing_rule TYPE float;
  -- +10% surge, 0% normal, -15% discount
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON peak_pricing_rule TYPE float DEFAULT 0;
  -- $ additional revenue from adjustment
DEFINE FIELD IF NOT EXISTS ai_insight       ON peak_pricing_rule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status          ON peak_pricing_rule TYPE string DEFAULT 'pending';
  -- 'pending' | 'active' | 'expired' | 'cancelled'
DEFINE FIELD IF NOT EXISTS created_at      ON peak_pricing_rule TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON peak_pricing_rule TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ppr_dow_hour  ON peak_pricing_rule FIELDS day_of_week, hour;
DEFINE INDEX IF NOT EXISTS idx_ppr_tier      ON peak_pricing_rule FIELDS pricing_tier;
DEFINE INDEX IF NOT EXISTS idx_ppr_status    ON peak_pricing_rule FIELDS status;

-- Settings
DEFINE FIELD IF NOT EXISTS peak_pricing_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS peak_pricing_surge_pct       ON settings TYPE option<float> DEFAULT 0.10;
  -- +10% during surge
DEFINE FIELD IF NOT EXISTS peak_pricing_discount_pct   ON settings TYPE option<float> DEFAULT 0.15;
  -- -15% during lull
DEFINE FIELD IF NOT EXISTS peak_pricing_demand_threshold ON settings TYPE option<float> DEFAULT 0.8;
  -- demand_ratio > 0.8 = surge
DEFINE FIELD IF NOT EXISTS peak_pricing_lull_threshold   ON settings TYPE option<float> DEFAULT 0.4;
  -- demand_ratio < 0.4 = discount
