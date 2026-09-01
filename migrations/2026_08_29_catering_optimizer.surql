-- Migration: 2026_08_29_catering_optimizer.surql
--
-- AI Catering Order Optimizer — 53rd POSR-exclusive differentiator.
--
-- Research finding: Catering is a $60B+ US market (Catering Insights 2024).
-- Restaurants struggle with catering orders because:
--   1. Scaling recipes (1 serving → 100 servings) is error-prone — 20% of
--      catering orders have portion miscalculations (CaterSource research)
--   2. Bulk pricing — many restaurants don't offer bulk discounts, losing
--      competitive bids ($2k-$10k per event)
--   3. Waste prediction — over-ordering food for large events wastes 10-15%
--      (Restaurant Business magazine)
--   4. Menu optimization — not all dishes travel well or scale well
--   5. Equipment/staffing — large orders need extra prep time, equipment
--
-- Toast, Square, Lightspeed have NO catering optimization. ezCater charges
-- $99/mo + 7% commission. Caterfox $50/mo. POSR offers it free.
--
-- Distinct from:
--   - buffet-demand.service (predicts guest count for buffets — NOT off-site
--     catering orders with fixed guest counts)
--   - recipe-optimization.service (per-dish cost — NOT bulk scaling)
--   - yield-variance.service (production waste — NOT catering-specific)
--   - menu-optimization.service (BCG matrix — NOT catering menu mix)
--   - demand-forecast.service (overall demand — NOT per-event catering)
--   - procurement.service (ingredient prices — NOT bulk event ordering)
--
-- This service optimizes CATERING ORDERS specifically: recipe scaling,
-- bulk pricing, waste prediction, menu travel-friendliness, staffing needs.

DEFINE TABLE IF NOT EXISTS catering_optimization TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON catering_optimization TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON catering_optimization TYPE string;
  -- 'bulk_pricing' | 'waste_prediction' | 'travel_suitability' | 'staffing_alert' | 'menu_mix_optimal'
DEFINE FIELD IF NOT EXISTS severity       ON catering_optimization TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS order_id        ON catering_optimization TYPE option<string>;
  -- link to source catering order (if exists)
DEFINE FIELD IF NOT EXISTS event_name     ON catering_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS guest_count    ON catering_optimization TYPE int;
  -- number of guests for the event
DEFINE FIELD IF NOT EXISTS event_date     ON catering_optimization TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS event_type     ON catering_optimization TYPE option<string>;
  -- 'corporate' | 'wedding' | 'birthday' | 'conference' | 'holiday' | 'other'
DEFINE FIELD IF NOT EXISTS suggested_dishes ON catering_optimization TYPE option<string>;
  -- JSON array of recommended dishes with quantities
DEFINE FIELD IF NOT EXISTS total_est_cost  ON catering_optimization TYPE float DEFAULT 0;
  -- estimated ingredient cost
DEFINE FIELD IF NOT EXISTS suggested_price ON catering_optimization TYPE float DEFAULT 0;
  -- recommended customer price (with margin)
DEFINE FIELD IF NOT EXISTS bulk_discount_pct ON catering_optimization TYPE float DEFAULT 0;
  -- suggested bulk discount (0-1)
DEFINE FIELD IF NOT EXISTS predicted_waste_pct ON catering_optimization TYPE float DEFAULT 0;
  -- predicted food waste (0-1)
DEFINE FIELD IF NOT EXISTS est_waste_cost  ON catering_optimization TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS travel_suitability_score ON catering_optimization TYPE float DEFAULT 0;
  -- 0-100, higher = dishes travel better
DEFINE FIELD IF NOT EXISTS prep_hours_needed ON catering_optimization TYPE float DEFAULT 0;
  -- estimated kitchen prep time
DEFINE FIELD IF NOT EXISTS staff_needed   ON catering_optimization TYPE int DEFAULT 0;
  -- recommended staff count for event
DEFINE FIELD IF NOT EXISTS description     ON catering_optimization TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON catering_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON catering_optimization TYPE option<string>;
  -- 'accept_order' | 'negotiate_price' | 'adjust_menu' | 'add_staff' | 'decline' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON catering_optimization TYPE string DEFAULT 'open';
  -- 'open' | 'accepted' | 'adjusted' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON catering_optimization TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON catering_optimization TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_co_rule_id   ON catering_optimization FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_co_severity  ON catering_optimization FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_co_status    ON catering_optimization FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_co_event_date ON catering_optimization FIELDS event_date;

-- Settings
DEFINE FIELD IF NOT EXISTS catering_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS catering_target_margin_pct ON settings TYPE option<float> DEFAULT 0.65;
  -- target margin for catering (65% — higher than dine-in due to bulk)
DEFINE FIELD IF NOT EXISTS catering_bulk_discount_threshold ON settings TYPE option<int> DEFAULT 25;
  -- guest count threshold for bulk discount (25+ guests)
DEFINE FIELD IF NOT EXISTS catering_waste_benchmark_pct ON settings TYPE option<float> DEFAULT 0.10;
  -- 10% waste is industry avg for catering
