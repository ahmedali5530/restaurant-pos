-- Migration: 2026_08_30_waitlist_optimizer.surql
--
-- AI Real-Time Waitlist Optimizer — 79th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 15-25% of walk-in customers due to long
-- wait times (NRA). 40% of customers leave if wait exceeds 30 minutes
-- (Cornell hospitality operations). Yet most restaurants manage waitlists
-- manually — first-come-first-served with no optimization. Smart waitlist
-- management (reordering by party size, predicting bails, dynamic quotes)
-- reduces walk-aways by 30-50% (OpenTable waitlist study).
--
-- Toast Waitlist ($50/mo) is a basic list. Yelp Waitlist is a simple queue.
-- POSR's wait-prediction.service predicts wait TIME — doesn't optimize the
-- QUEUE. seating-optimization.service assigns tables — doesn't manage waitlist.
--
-- Distinct from:
--   - wait-prediction.service (predicts wait TIME — NOT queue optimization)
--   - seating-optimization.service (assigns TABLES — NOT waitlist management)
--   - reservation-cascade.service (reservation cascades — NOT walk-in waitlist)
--   - table-utilization.service (occupancy patterns — NOT real-time waitlist)
--   - overbooking.service (reservation overbooking — NOT walk-in optimization)

DEFINE TABLE IF NOT EXISTS waitlist_optimization TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON waitlist_optimization TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON waitlist_optimization TYPE string;
  -- 'large_party_priority' | 'bail_risk' | 'table_ready_mismatch' | 'capacity_accept' | 'walk_away_alert'
DEFINE FIELD IF NOT EXISTS severity       ON waitlist_optimization TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS party_name     ON waitlist_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size     ON waitlist_optimization TYPE int DEFAULT 2;
DEFINE FIELD IF NOT EXISTS waitlist_position ON waitlist_optimization TYPE int DEFAULT 1;
DEFINE FIELD IF NOT EXISTS quoted_wait    ON waitlist_optimization TYPE int DEFAULT 0;
  -- quoted wait in minutes
DEFINE FIELD IF NOT EXISTS actual_wait    ON waitlist_optimization TYPE option<int>;
  -- actual wait (if completed)
DEFINE FIELD IF NOT EXISTS bail_probability ON waitlist_optimization TYPE float DEFAULT 0;
  -- 0-1, probability party will leave before seated
DEFINE FIELD IF NOT EXISTS est_revenue    ON waitlist_optimization TYPE float DEFAULT 0;
  -- estimated revenue from this party
DEFINE FIELD IF NOT EXISTS recommended_action ON waitlist_optimization TYPE option<string>;
  -- 'seat_now' | 'reorder_up' | 'hold_position' | 'offer_bar' | 'quote_longer' | 'turn_away'
DEFINE FIELD IF NOT EXISTS suggested_table ON waitlist_optimization TYPE option<string>;
  -- suggested table to assign
DEFINE FIELD IF NOT EXISTS total_waitlist_size ON waitlist_optimization TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_wait_time  ON waitlist_optimization TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_walk_away_cost ON waitlist_optimization TYPE float DEFAULT 0;
  -- $ lost if party leaves
DEFINE FIELD IF NOT EXISTS description     ON waitlist_optimization TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON waitlist_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON waitlist_optimization TYPE option<string>;
  -- 'seat_now' | 'reorder' | 'offer_alternative' | 'quote_update' | 'turn_away_new'
DEFINE FIELD IF NOT EXISTS status          ON waitlist_optimization TYPE string DEFAULT 'open';
  -- 'open' | 'seated' | 'bailed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON waitlist_optimization TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_wo_rule_id   ON waitlist_optimization FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_wo_severity  ON waitlist_optimization FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_wo_status    ON waitlist_optimization FIELDS status;
