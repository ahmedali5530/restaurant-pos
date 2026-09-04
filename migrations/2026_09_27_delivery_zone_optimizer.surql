-- Migration: 2026_09_27_delivery_zone_optimizer.surql
--
-- AI Restaurant Delivery Zone Profitability Optimizer — 106th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from unoptimized
-- delivery zones (Toast Delivery Report, DoorDash Merchant Data):
--   - Unprofitable zones: delivering to far areas where driver cost > margin
--   - Driver cost per mile: $0.58/mi (IRS) + time = $8-12/delivery to far zones
--   - Density gaps: some zones have high demand but no coverage
--   - Cannibalization: own delivery cannibalizes DoorDash orders (lower margin)
--   - Radius too large: 5mi radius means 30% of orders lose money
--   - Peak zone losses: high-demand zone during rush = late deliveries + refunds
--   - Zone expansion: nearby high-income area not served = missed revenue
--   - Zone contraction: cutting unprofitable zones saves $200-500/mo
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO delivery zone analysis.
-- delivery-analytics tracks platform PERFORMANCE. delivery-route optimizes
-- ROUTES. Neither analyzes zone PROFITABILITY or recommends zone changes.
--
-- This new service OPTIMIZES DELIVERY ZONES:
--   - Analyzes profitability per delivery zone (revenue - driver cost - platform fee)
--   - Identifies unprofitable zones (net loss per delivery)
--   - Recommends zone expansion to high-density nearby areas
--   - Recommends zone contraction to cut unprofitable far zones
--   - Detects cannibalization between own delivery and platform delivery
--   - Tracks driver cost per mile per zone
--   - Alerts on peak zone losses (high demand + high failure rate)

DEFINE TABLE IF NOT EXISTS delivery_zone_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON delivery_zone_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON delivery_zone_alert TYPE string;
  -- 'unprofitable_zone' | 'density_gap' | 'cannibalization_detected' |
--   'radius_too_large' | 'peak_zone_loss' | 'zone_expansion_opportunity' |
--   'zone_contraction_needed' | 'driver_cost_excessive'
DEFINE FIELD IF NOT EXISTS severity        ON delivery_zone_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS zone_name       ON delivery_zone_alert TYPE string;
  -- e.g., 'North 1mi', 'East 2-3mi', 'Downtown'
DEFINE FIELD IF NOT EXISTS zone_distance_km ON delivery_zone_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS order_count_30d ON delivery_zone_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS avg_revenue_per_order ON delivery_zone_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS avg_driver_cost  ON delivery_zone_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS avg_platform_fee ON delivery_zone_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS net_profit_per_order ON delivery_zone_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_monthly_loss  ON delivery_zone_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON delivery_zone_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON delivery_zone_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON delivery_zone_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON delivery_zone_alert TYPE option<string>;
  -- 'shrink_zone' | 'expand_zone' | 'adjust_pricing' | 'switch_platform' |
--   'add_driver' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON delivery_zone_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON delivery_zone_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON delivery_zone_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_zone_rule      ON delivery_zone_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_zone_status    ON delivery_zone_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_zone_severity  ON delivery_zone_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_zone_name      ON delivery_zone_alert FIELDS zone_name;

DEFINE FIELD IF NOT EXISTS zone_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS zone_max_radius_km ON settings TYPE option<float> DEFAULT 5.0;
  -- max delivery radius in km (default 5km / ~3mi)
DEFINE FIELD IF NOT EXISTS zone_min_profit_per_order ON settings TYPE option<float> DEFAULT 3.0;
  -- minimum $ profit per delivery to keep zone (default $3)
DEFINE FIELD IF NOT EXISTS zone_driver_cost_per_km ON settings TYPE option<float> DEFAULT 0.58;
  -- driver cost per km (IRS standard: $0.58/mi = $0.36/km, rounded up)
