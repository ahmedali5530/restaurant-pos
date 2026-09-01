-- Migration: 2026_08_30_event_menu.surql
--
-- AI Event-Driven Menu Optimizer — 72nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants near event venues (stadiums, convention centers,
-- concert halls) see 50-300% revenue spikes on event days (NRA event dining
-- study). Yet most restaurants don't proactively adjust menus for events — they
-- miss the opportunity to feature event-appropriate items, prep extra inventory,
-- or create event-specific promotions. 73% of event attendees dine out before
-- or after events (Eventbrite dining survey).
--
-- Toast, Square, Lightspeed have NO event-driven menu optimization.
-- POSR's seasonal.service analyzes MONTHLY patterns — not specific events.
-- weather-impact.service correlates WEATHER — not events.
-- demand-forecast.service predicts GENERAL demand — not event-specific.
-- peak-hour.service predicts hourly PEAKS — not external events.
--
-- Distinct from:
--   - seasonal.service (monthly SEASONAL trends — NOT specific events)
--   - weather-impact.service (WEATHER correlation — NOT events)
--   - demand-forecast.service (general demand — NOT event-driven)
--   - peak-hour.service (hourly peaks — NOT external events)
--   - promo-analytics.service (promo performance — NOT event-specific menus)
--
-- This service detects upcoming events (holidays, sports, local events),
-- recommends menu adjustments, inventory prep, staffing, and promotions.

DEFINE TABLE IF NOT EXISTS event_menu_optimization TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON event_menu_optimization TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON event_menu_optimization TYPE string;
  -- 'holiday_menu' | 'sports_event' | 'local_festival' | 'weather_event' | 'cultural_event'
DEFINE FIELD IF NOT EXISTS severity       ON event_menu_optimization TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS event_name     ON event_menu_optimization TYPE string;
DEFINE FIELD IF NOT EXISTS event_date     ON event_menu_optimization TYPE datetime;
DEFINE FIELD IF NOT EXISTS days_until_event ON event_menu_optimization TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS event_type     ON event_menu_optimization TYPE string;
  -- 'holiday' | 'sports' | 'festival' | 'weather' | 'cultural'
DEFINE FIELD IF NOT EXISTS est_traffic_multiplier ON event_menu_optimization TYPE float DEFAULT 1.0;
  -- expected traffic multiplier (e.g. 2.5 = 250% of normal)
DEFINE FIELD IF NOT EXISTS suggested_dishes ON event_menu_optimization TYPE option<string>;
  -- JSON: array of {dish_name, reason, prep_multiplier}
DEFINE FIELD IF NOT EXISTS suggested_promotions ON event_menu_optimization TYPE option<string>;
  -- JSON: array of promo ideas
DEFINE FIELD IF NOT EXISTS staffing_recommendation ON event_menu_optimization TYPE option<string>;
  -- suggested staffing adjustments
DEFINE FIELD IF NOT EXISTS inventory_prep   ON event_menu_optimization TYPE option<string>;
  -- JSON: array of {item, extra_qty}
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON event_menu_optimization TYPE float DEFAULT 0;
  -- projected $ revenue increase from event optimization
DEFINE FIELD IF NOT EXISTS est_extra_cost  ON event_menu_optimization TYPE float DEFAULT 0;
  -- projected extra cost (inventory + staffing)
DEFINE FIELD IF NOT EXISTS net_profit      ON event_menu_optimization TYPE float DEFAULT 0;
  -- est_revenue_lift - est_extra_cost
DEFINE FIELD IF NOT EXISTS description     ON event_menu_optimization TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON event_menu_optimization TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON event_menu_optimization TYPE option<string>;
  -- 'prepare_now' | 'adjust_menu' | 'add_staff' | 'order_inventory' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON event_menu_optimization TYPE string DEFAULT 'open';
  -- 'open' | 'prepared' | 'executed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON event_menu_optimization TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON event_menu_optimization TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_emo_rule_id   ON event_menu_optimization FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_emo_severity  ON event_menu_optimization FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_emo_status    ON event_menu_optimization FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_emo_event_date ON event_menu_optimization FIELDS event_date;

-- Settings
DEFINE FIELD IF NOT EXISTS event_menu_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS event_menu_lookahead_days   ON settings TYPE option<int>   DEFAULT 14;
  -- look ahead 14 days for upcoming events
DEFINE FIELD IF NOT EXISTS event_menu_min_multiplier   ON settings TYPE option<float> DEFAULT 1.5;
  -- only alert if traffic multiplier >= 1.5x
DEFINE FIELD IF NOT EXISTS event_menu_avg_daily_revenue ON settings TYPE option<float> DEFAULT 3000;
  -- avg daily revenue for impact calculation
