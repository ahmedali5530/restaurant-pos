-- Migration: 2026_08_29_overbooking.surql
--
-- AI Reservation Overbooking Optimizer — 47th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $4-6k/year average to no-shows (up to 20%
-- industry-wide no-show rate per NRA). Airlines overbook +95% capacity safely
-- using predictive models; restaurants don't. OpenTable ($300+/mo) shows
-- no-show probability per reservation but DOESN'T compute optimal overbooking
-- level per slot. Resy ($249/mo) has manual overbooking. Toast Waitlist has
-- zero overbooking intelligence.
--
-- POSR computes the OPTIMAL number of additional bookings per slot using:
--   - Historical no-show rate per slot (DOW × hour)
--   - Walk-in probability (offsets no-shows)
--   - Party size mix (small parties easier to seat late)
--   - Table turnover time per slot
--   - Capacity (floor tables × seats)
--   - Service level target (wait time < threshold)
--
-- Distinct from:
--   - noshow-prediction.service (predicts per-reservation no-show risk, NOT
--     aggregate slot overbooking capacity)
--   - reservation.service (operational booking — doesn't optimize)
--   - peak-hour.service (predicts peak demand — doesn't compute overbooking)
--   - peak-pricing.service (price adjustments — not seat count)
--   - table-utilization.service (occupancy patterns — not booking strategy)
--   - seating-optimization.service (real-time table assignment — not overbooking)
--
-- This service computes the optimal OVERBOOKING LEVEL per slot + revenue impact.

DEFINE TABLE IF NOT EXISTS overbooking_plan TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON overbooking_plan TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON overbooking_plan TYPE string;
  -- 'slot_overbook' | 'slot_conservative' | 'slot_walk_in_friendly' | 'slot_at_risk'
DEFINE FIELD IF NOT EXISTS severity       ON overbooking_plan TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS day_of_week    ON overbooking_plan TYPE int;
  -- 0=Sun, 1=Mon, ..., 6=Sat
DEFINE FIELD IF NOT EXISTS hour           ON overbooking_plan TYPE int;
DEFINE FIELD IF NOT EXISTS capacity_seats ON overbooking_plan TYPE int;
  -- total seats available in this slot
DEFINE FIELD IF NOT EXISTS current_bookings ON overbooking_plan TYPE int;
  -- current confirmed reservations (seat count)
DEFINE FIELD IF NOT EXISTS predicted_no_shows ON overbooking_plan TYPE float;
  -- expected no-shows based on historical rate
DEFINE FIELD IF NOT EXISTS predicted_walk_ins ON overbooking_plan TYPE float;
  -- expected walk-in parties (offsets no-shows)
DEFINE FIELD IF NOT EXISTS optimal_overbook_count ON overbooking_plan TYPE int;
  -- recommended additional bookings to accept
DEFINE FIELD IF NOT EXISTS historical_no_show_rate ON overbooking_plan TYPE float;
  -- 0-1, historical no-show % for this slot
DEFINE FIELD IF NOT EXISTS expected_fill_rate ON overbooking_plan TYPE float;
  -- predicted % of capacity filled
DEFINE FIELD IF NOT EXISTS est_revenue_gain ON overbooking_plan TYPE float DEFAULT 0;
  -- projected $ gain from accepting overbooking
DEFINE FIELD IF NOT EXISTS service_risk    ON overbooking_plan TYPE float DEFAULT 0;
  -- 0-100 risk of wait time exceeding threshold
DEFINE FIELD IF NOT EXISTS description     ON overbooking_plan TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON overbooking_plan TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON overbooking_plan TYPE option<string>;
  -- 'accept_N_extra' | 'accept_walk_ins' | 'hold_capacity' | 'reduce_bookings' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON overbooking_plan TYPE string DEFAULT 'open';
  -- 'open' | 'applied' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON overbooking_plan TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON overbooking_plan TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_obp_rule_id   ON overbooking_plan FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_obp_severity  ON overbooking_plan FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_obp_status    ON overbooking_plan FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_obp_slot      ON overbooking_plan FIELDS day_of_week, hour;

-- Settings
DEFINE FIELD IF NOT EXISTS overbooking_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS overbooking_lookback_days   ON settings TYPE option<int>   DEFAULT 90;
DEFINE FIELD IF NOT EXISTS overbooking_service_wait_threshold ON settings TYPE option<int> DEFAULT 15;
  -- max acceptable wait time (minutes)
DEFINE FIELD IF NOT EXISTS overbooking_max_overbook_pct ON settings TYPE option<float> DEFAULT 0.30;
  -- max 30% overbook above capacity
