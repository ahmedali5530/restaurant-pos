-- Migration: 2026_08_28_delivery_route.surql
--
-- AI Delivery Route Optimization — 32nd POSR-exclusive differentiator.
--
-- Research finding: Delivery drivers waste 20-30% of driving time on
-- inefficient routes. Toast, Square, Lightspeed have NO delivery route
-- optimization. Third-party route planners (Route4Me, OptimoRoute) charge
-- $50-100+/mo. POSR groups nearby delivery orders + optimizes stop order
-- using nearest-neighbor + AI insights.
--
-- Distinct from:
--   - delivery-analytics.service (analyzes platform performance, not routes)
--   - wait-prediction.service (predicts waitlist timing, not delivery)
--   - demand-forecast.service (forecasts orders, not routes)
--
-- This service OPTIMIZES DELIVERY ROUTES — groups nearby orders + suggests
-- optimal stop sequence to minimize distance + time.

DEFINE TABLE IF NOT EXISTS delivery_route_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON delivery_route_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS route_id        ON delivery_route_suggestion TYPE string;
  -- unique route identifier
DEFINE FIELD IF NOT EXISTS order_count     ON delivery_route_suggestion TYPE int;
  -- number of orders in this route
DEFINE FIELD IF NOT EXISTS total_distance_km ON delivery_route_suggestion TYPE float;
  -- optimized total distance
DEFINE FIELD IF NOT EXISTS est_total_minutes ON delivery_route_suggestion TYPE float;
  -- estimated total delivery time
DEFINE FIELD IF NOT EXISTS savings_km      ON delivery_route_suggestion TYPE float DEFAULT 0;
  -- km saved vs naive (one-by-one) routing
DEFINE FIELD IF NOT EXISTS savings_minutes  ON delivery_route_suggestion TYPE float DEFAULT 0;
  -- minutes saved
DEFINE FIELD IF NOT EXISTS est_fuel_savings ON delivery_route_suggestion TYPE float DEFAULT 0;
  -- $ fuel saved
DEFINE FIELD IF NOT EXISTS stop_sequence   ON delivery_route_suggestion TYPE option<object>;
  -- ordered array of stops with { order_id, customer_name, lat, lng, address, stop_number }
DEFINE FIELD IF NOT EXISTS ai_insight      ON delivery_route_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status         ON delivery_route_suggestion TYPE string DEFAULT 'pending';
  -- 'pending' | 'dispatched' | 'completed' | 'cancelled'
DEFINE FIELD IF NOT EXISTS created_at      ON delivery_route_suggestion TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON delivery_route_suggestion TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_drs_route    ON delivery_route_suggestion FIELDS route_id;
DEFINE INDEX IF NOT EXISTS idx_drs_status   ON delivery_route_suggestion FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_drs_created ON delivery_route_suggestion FIELDS created_at;

-- Settings
DEFINE FIELD IF NOT EXISTS delivery_route_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS delivery_route_max_stops     ON settings TYPE option<int>   DEFAULT 8;
  -- max stops per route (beyond 8, split into multiple routes)
DEFINE FIELD IF NOT EXISTS delivery_route_cluster_km    ON settings TYPE option<float> DEFAULT 5;
  -- orders within 5km of each other can be grouped
DEFINE FIELD IF NOT EXISTS delivery_route_fuel_per_km   ON settings TYPE option<float> DEFAULT 0.12;
  -- fuel cost per km ($0.12/km average)
DEFINE FIELD IF NOT EXISTS delivery_route_avg_speed_kmh ON settings TYPE option<float> DEFAULT 30;
  -- average driving speed in city (30 km/h)
