-- Migration: 2026_08_29_floor_plan_optimizer.surql
--
-- AI Floor Plan Optimizer — 57th POSR-exclusive differentiator.
--
-- Research finding: Restaurant floor plan layout affects revenue by 15-25%
-- (Cornell hospitality design research). Poor layout causes:
--   - Bottlenecks (servers can't navigate when busy)
--   - Dead zones (tables nobody wants to sit at)
--   - Capacity mismatch (too many 2-tops when demand is 4-tops)
--   - Aisle congestion (slows service, reduces table turns)
--   - Poor sightlines (customers feel exposed/hidden)
--
-- Toast, Square, Lightspeed have table management UIs but NO floor plan
-- OPTIMIZATION. OpenTable has table status but doesn't suggest layout changes.
-- Hostme, Resy, Tock — all just display floor plans, none optimize them.
--
-- POSR's seating-optimization.service does REAL-TIME table assignment per
-- incoming party. table-utilization.service analyzes occupancy PATTERNS.
-- This new service does STRUCTURAL floor plan analysis:
--   1. Capacity mix analysis (2-top vs 4-top vs 6-top ratio vs demand mix)
--   2. Dead zone detection (tables with consistently low utilization)
--   3. Bottleneck detection (tables that block server traffic)
--   4. Aisle width analysis (congestion risk)
--   5. Density optimization (can we fit more tables without crowding?)
--
-- Distinct from:
--   - seating-optimization.service (REAL-TIME assignment per party — NOT
--     structural layout analysis)
--   - table-utilization.service (occupancy PATTERNS over time — NOT physical
--     layout recommendations)
--   - turnover.service (table turnover RATE — not layout)
--   - revpash.service (revenue per seat hour — not physical layout)
--   - reservation.service (booking management — not floor plan)

DEFINE TABLE IF NOT EXISTS floor_plan_optimization TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON floor_plan_optimization TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON floor_plan_optimization TYPE string;
  -- 'capacity_mismatch' | 'dead_zone' | 'bottleneck_table' | 'aisle_congestion' | 'density_opportunity'
DEFINE FIELD IF NOT EXISTS severity       ON floor_plan_optimization TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS table_id        ON floor_plan_optimization TYPE option<string>;
  -- specific table affected (if applicable)
DEFINE FIELD IF NOT EXISTS table_name      ON floor_plan_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS zone            ON floor_plan_optimization TYPE option<string>;
  -- floor zone (e.g. 'main', 'patio', 'bar', 'private')
DEFINE FIELD IF NOT EXISTS current_capacity ON floor_plan_optimization TYPE option<int>;
  -- current seats at this table/zone
DEFINE FIELD IF NOT EXISTS suggested_capacity ON floor_plan_optimization TYPE option<int>;
  -- recommended seats
DEFINE FIELD IF NOT EXISTS utilization_pct ON floor_plan_optimization TYPE float DEFAULT 0;
  -- current utilization 0-100
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON floor_plan_optimization TYPE float DEFAULT 0;
  -- projected $ impact of change
DEFINE FIELD IF NOT EXISTS action_type    ON floor_plan_optimization TYPE option<string>;
  -- 'add_table' | 'remove_table' | 'change_capacity' | 'relocate' | 'widen_aisle' | 'split_table' | 'merge_tables'
DEFINE FIELD IF NOT EXISTS affected_tables ON floor_plan_optimization TYPE int DEFAULT 1;
  -- how many tables involved in this recommendation
DEFINE FIELD IF NOT EXISTS description     ON floor_plan_optimization TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON floor_plan_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON floor_plan_optimization TYPE option<string>;
  -- 'implement_now' | 'test_30d' | 'pilot_zone' | 'renovation_queue' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON floor_plan_optimization TYPE string DEFAULT 'open';
  -- 'open' | 'implemented' | 'testing' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON floor_plan_optimization TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON floor_plan_optimization TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_fpo_rule_id   ON floor_plan_optimization FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_fpo_severity  ON floor_plan_optimization FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_fpo_status    ON floor_plan_optimization FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_fpo_zone      ON floor_plan_optimization FIELDS zone;

-- Settings
DEFINE FIELD IF NOT EXISTS floor_plan_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS floor_plan_lookback_days   ON settings TYPE option<int>   DEFAULT 30;
  -- analyze last 30 days of table usage
DEFINE FIELD IF NOT EXISTS floor_plan_dead_zone_threshold ON settings TYPE option<float> DEFAULT 0.30;
  -- utilization < 30% = dead zone
DEFINE FIELD IF NOT EXISTS floor_plan_min_aisle_width_cm ON settings TYPE option<int>   DEFAULT 90;
  -- minimum aisle width 90cm for wheelchair access
DEFINE FIELD IF NOT EXISTS floor_plan_target_density_pct ON settings TYPE option<float> DEFAULT 0.75;
  -- target 75% utilization before adding tables
