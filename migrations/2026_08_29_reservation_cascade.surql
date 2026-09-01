-- Migration: 2026_08_29_reservation_cascade.surql
--
-- AI Reservation Cascade Predictor — 48th POSR-exclusive differentiator.
--
-- Research finding: When a no-show happens during peak slot, the impact
-- cascades — late-arriving walk-ins take the table, subsequent reservations
-- get delayed, kitchen gets bottlenecked, and the night's revenue drops
-- 15-30% (Cornell hospitality operations research). Existing POS systems
-- treat each reservation independently — none predicts CASCADE EFFECTS.
--
-- POSR predicts 5 cascade scenarios:
--   1. NO_SHOW_CASCADE — one no-show at peak triggers 3+ delayed seatings
--   2. WALK_IN_STORM — predicted 10+ walk-ins during peak (overcapacity)
--   3. TURNOVER_BOTTLENECK — slow table turnover cascades to next slot
--   4. KITCHEN_SPIKE — 8+ orders in 15 min window → kitchen delays cascade
--   5. DOUBLE_BOOKED_TABLE — table assigned to 2 reservations too close together
--
-- Distinct from:
--   - noshow-prediction.service (per-reservation risk — NOT cascade effects)
--   - overbooking.service (slot-level capacity — NOT downstream cascades)
--   - peak-hour.service (predicts demand — doesn't model cascade)
--   - wait-prediction.service (per-party wait — not multi-reservation cascade)
--   - kitchen-bottleneck.service (per-item delays — not reservation cascade)
--   - table-utilization.service (occupancy patterns — not booking cascades)
--
-- This service predicts MULTI-RESERVATION CASCADE EFFECTS — downstream impact
-- of a single event across the entire evening.

DEFINE TABLE IF NOT EXISTS reservation_cascade_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON reservation_cascade_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON reservation_cascade_alert TYPE string;
  -- 'no_show_cascade' | 'walk_in_storm' | 'turnover_bottleneck' | 'kitchen_spike' | 'double_booked_table'
DEFINE FIELD IF NOT EXISTS severity       ON reservation_cascade_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS trigger_date    ON reservation_cascade_alert TYPE option<datetime>;
  -- when the cascade is predicted to start
DEFINE FIELD IF NOT EXISTS trigger_description ON reservation_cascade_alert TYPE option<string>;
  -- what triggers the cascade (e.g. "8pm no-show at table 5")
DEFINE FIELD IF NOT EXISTS affected_reservations ON reservation_cascade_alert TYPE int DEFAULT 0;
  -- count of downstream reservations impacted
DEFINE FIELD IF NOT EXISTS affected_tables ON reservation_cascade_alert TYPE int DEFAULT 0;
  -- count of tables that will be delayed
DEFINE FIELD IF NOT EXISTS predicted_delay_minutes ON reservation_cascade_alert TYPE float DEFAULT 0;
  -- avg delay propagated to subsequent reservations
DEFINE FIELD IF NOT EXISTS cascade_depth   ON reservation_cascade_alert TYPE int DEFAULT 1;
  -- how many levels deep the cascade extends (1-5)
DEFINE FIELD IF NOT EXISTS est_revenue_loss ON reservation_cascade_alert TYPE float DEFAULT 0;
  -- projected $ lost from cascade (cancelled orders, walk-aways)
DEFINE FIELD IF NOT EXISTS mitigation_steps ON reservation_cascade_alert TYPE option<string>;
  -- JSON array of suggested actions
DEFINE FIELD IF NOT EXISTS description     ON reservation_cascade_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON reservation_cascade_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON reservation_cascade_alert TYPE option<string>;
  -- 'call_ahead' | 'overbook_slot' | 'add_staff' | 'extend_hours' | 'decline_late_bookings' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON reservation_cascade_alert TYPE string DEFAULT 'open';
  -- 'open' | 'mitigated' | 'occurred' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON reservation_cascade_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON reservation_cascade_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rca_rule_id   ON reservation_cascade_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_rca_severity  ON reservation_cascade_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_rca_status    ON reservation_cascade_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_rca_trigger   ON reservation_cascade_alert FIELDS trigger_date;

-- Settings
DEFINE FIELD IF NOT EXISTS cascade_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cascade_lookback_days   ON settings TYPE option<int>   DEFAULT 60;
DEFINE FIELD IF NOT EXISTS cascade_peak_threshold  ON settings TYPE option<int>   DEFAULT 8;
  -- 8+ reservations in slot = peak
DEFINE FIELD IF NOT EXISTS cascade_walk_in_storm_threshold ON settings TYPE option<int> DEFAULT 10;
  -- 10+ walk-ins in 1h = storm
