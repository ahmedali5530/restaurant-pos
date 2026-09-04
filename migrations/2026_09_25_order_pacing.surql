-- Migration: 2026_09_25_order_pacing.surql
--
-- AI Order Pacing & Batching Optimizer — 104th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from poor
-- order pacing (NRA Kitchen Operations Report, Toast KDS Survey):
--   - Kitchen overload: 20+ tickets simultaneously → prep time doubles →
--     customer wait increases 50% → complaints + walk-aways
--   - Online order flood: DoorDash/UberEats dump 10 orders in 2 min →
--     kitchen crashes → all orders late → platform penalties
--   - No batching: individual orders fired sequentially → 30% more station
--     switches → 15% slower throughput
--   - Reservation surge: 15 reservations arrive at 7PM → kitchen can't handle
--     → 45+ min ticket times → bad experience
--   - Rush detection failure: kitchen doesn't know rush is coming until
--     overwhelmed → reactive not proactive
--   - Staff unaware: cook doesn't know 8 orders are queued → starts prep
--     late → all tickets delayed
--   - No priority: VIP/regular/allergy orders mixed with regular → no
--     prioritization → key customers get poor experience
--   - Prep lead time ignored: items needing 30min prep fired as "ASAP" →
--     can't meet promised time → customer angry
--
-- Classic POS systems (Toast KDS, Square KDS, Lightspeed KDS) show ticket
-- queue but DON'T PACE orders. They're reactive — show what's already in the
-- queue, don't proactively throttle or batch. kitchen-bottleneck detects
-- bottlenecks AFTER they form. This service PREVENTS them.
--
-- This new service PACES & BATCHES ORDERS:
--   - Monitors kitchen capacity in real-time (stations, cooks, tickets)
--   - Throttles online order acceptance when kitchen at capacity
--   - Paces reservation seating to match kitchen throughput
--   - Batches similar orders for efficiency (same dish = batch cook)
--   - Detects incoming rush 15-30 min ahead
--   - Tracks staff availability + station assignments
--   - Prioritizes VIP/regular/allergy orders
--   - Calculates prep lead times for accurate quoting

DEFINE TABLE IF NOT EXISTS order_pacing_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON order_pacing_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON order_pacing_alert TYPE string;
  -- 'kitchen_capacity_warning' | 'online_order_throttle' | 'reservation_pace_mismatch' |
--   'batch_opportunity' | 'rush_incoming' | 'staff_coverage_gap' |
--   'ticket_priority_needed' | 'prep_lead_time_violation'
DEFINE FIELD IF NOT EXISTS severity        ON order_pacing_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS current_tickets ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS max_capacity    ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS avg_ticket_time_min ON order_pacing_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS online_orders_pending ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS reservations_next_hour ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS batch_group_count ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_revenue_at_risk ON order_pacing_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_time_savings_min ON order_pacing_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS description     ON order_pacing_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON order_pacing_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON order_pacing_alert TYPE option<string>;
  -- 'throttle_now' | 'pace_reservations' | 'batch_now' | 'add_staff' | 'reprioritize' |
--   'adjust_quote' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON order_pacing_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON order_pacing_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON order_pacing_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pacing_rule      ON order_pacing_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_pacing_status    ON order_pacing_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_pacing_severity  ON order_pacing_alert FIELDS severity;

DEFINE FIELD IF NOT EXISTS pacing_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS pacing_max_tickets     ON settings TYPE option<int> DEFAULT 15;
  -- max simultaneous tickets before throttle (default 15)
DEFINE FIELD IF NOT EXISTS pacing_max_online_pending ON settings TYPE option<int> DEFAULT 8;
  -- max online orders pending before throttle (default 8)
DEFINE FIELD IF NOT EXISTS pacing_rush_lookahead_min ON settings TYPE option<int> DEFAULT 20;
  -- minutes ahead to detect rush (default 20)
DEFINE FIELD IF NOT EXISTS pacing_target_ticket_time ON settings TYPE option<int> DEFAULT 15;
  -- target avg ticket time in minutes (default 15)
