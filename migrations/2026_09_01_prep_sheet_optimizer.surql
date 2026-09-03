-- Migration: 2026_09_01_prep_sheet_optimizer.surql
--
-- AI Kitchen Prep Sheet Optimizer — 61st POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste $200-500/mo per location on incorrect
-- kitchen prep (NRA Kitchen Waste Report, FoodService Director):
--   - Over-prep: 15-25% of perishables wasted (prepped too much, expired)
--   - Under-prep: 5-10% stockouts during peak (lost sales + customer dissatisfaction)
--   - Manual prep sheets: 30-60 min/day manager time = $50-100/mo labor
--   - Inconsistent prep: different managers prep differently → quality variance
--
-- Classic restaurant POS systems (Toast, Square, Lightspeed) have STATIC prep
-- sheets or none at all. Modern kitchen display systems (KDS) like Toast KDS,
-- FreshKDS, Square KDS show ORDERS but DON'T optimize PREP. The gap between
-- demand forecasting (which POSR has) and actual kitchen prep is filled
-- manually by managers guessing.
--
-- POSR's existing services cover DIFFERENT operational aspects:
--   - demand-forecast.service = DEMAND prediction (revenue/covers per hour)
--     — NOT conversion to per-ingredient prep quantities
--   - waste-tracking.service = WASTE tracking (after-the-fact logging)
--     — NOT predictive prep optimization
--   - spoilage-prediction.service = ingredient SHELF-LIFE prediction
--     — NOT daily prep quantity optimization
--   - kitchen-bottleneck.service = BOTTLENECK detection during service
--     — NOT pre-service prep planning
--   - recipe-optimization.service = recipe ingredient cost optimization
--     — NOT prep quantity optimization
--   - forecast-accuracy.service = forecast vs actual accuracy tracking
--     — NOT prep sheet generation
--
-- This new service generates OPTIMIZED DAILY PREP SHEETS per ingredient:
--   - Converts demand forecast → per-ingredient prep quantities
--   - Adjusts for reservations, weather, events, seasonal patterns
--   - Reduces over-prep (waste) + under-prep (stockouts)
--   - Considers yesterday's waste + leftover stock
--   - Prioritizes high-impact items (top sellers, high-waste items)

DEFINE TABLE IF NOT EXISTS prep_sheet_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON prep_sheet_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON prep_sheet_recommendation TYPE string;
  -- 'demand_forecast_adjustment' | 'waste_pattern_reduction' | 'reservation_spike' |
  -- 'weather_event_adjustment' | 'seasonal_pattern' | 'menu_promo_spike' |
  -- 'lead_time_prep' | 'over_prep_correction'
DEFINE FIELD IF NOT EXISTS severity        ON prep_sheet_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS ingredient_id   ON prep_sheet_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ingredient_name ON prep_sheet_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON prep_sheet_recommendation TYPE option<string>;
  -- 'produce' | 'meat' | 'dairy' | 'dry_goods' | 'sauces' | 'dough' | 'other'
DEFINE FIELD IF NOT EXISTS current_prep_qty ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- what the manager would normally prep (manual baseline)
DEFINE FIELD IF NOT EXISTS suggested_prep_qty ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- AI-recommended prep quantity
DEFINE FIELD IF NOT EXISTS unit            ON prep_sheet_recommendation TYPE string;
  -- 'kg' | 'L' | 'units' | 'portions' | 'cups'
DEFINE FIELD IF NOT EXISTS prep_action     ON prep_sheet_recommendation TYPE string;
  -- 'chop' | 'slice' | 'marinate' | 'cook' | 'portion' | 'thaw' | 'mix' | 'assemble'
DEFINE FIELD IF NOT EXISTS forecast_demand  ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- predicted covers/orders for the day
DEFINE FIELD IF NOT EXISTS reservation_count ON prep_sheet_recommendation TYPE option<int>;
  -- reservations for the day
DEFINE FIELD IF NOT EXISTS weather_factor   ON prep_sheet_recommendation TYPE option<float>;
  -- weather demand multiplier (0.7 = rain, 1.2 = sunny weekend)
DEFINE FIELD IF NOT EXISTS leftover_stock   ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- usable stock from yesterday
DEFINE FIELD IF NOT EXISTS avg_waste_pct    ON prep_sheet_recommendation TYPE option<float>;
  -- avg % wasted historically (7-day)
DEFINE FIELD IF NOT EXISTS est_waste_savings ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- $ saved per day from reducing over-prep
DEFINE FIELD IF NOT EXISTS est_stockout_savings ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- $ saved per day from avoiding stockout
DEFINE FIELD IF NOT EXISTS est_savings_daily ON prep_sheet_recommendation TYPE float DEFAULT 0;
  -- total $ saved per day
DEFINE FIELD IF NOT EXISTS description      ON prep_sheet_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON prep_sheet_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON prep_sheet_recommendation TYPE option<string>;
  -- 'prep_now' | 'reduce_qty' | 'increase_qty' | 'hold_prep' | 'monitor'
DEFINE FIELD IF NOT EXISTS status           ON prep_sheet_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'prepped' | 'adjusted' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS shift            ON prep_sheet_recommendation TYPE string DEFAULT 'all_day';
  -- 'morning' | 'afternoon' | 'evening' | 'all_day'
DEFINE FIELD IF NOT EXISTS detected_at      ON prep_sheet_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON prep_sheet_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_prep_rule      ON prep_sheet_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_prep_status    ON prep_sheet_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_prep_severity  ON prep_sheet_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_prep_ingredient ON prep_sheet_recommendation FIELDS ingredient_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS prep_ai_enabled          ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS prep_waste_tolerance_pct ON settings TYPE option<float> DEFAULT 10.0;
  -- acceptable waste % before flagging over-prep
DEFINE FIELD IF NOT EXISTS prep_stockout_buffer_pct ON settings TYPE option<float> DEFAULT 15.0;
  -- buffer % above forecast to avoid stockout
DEFINE FIELD IF NOT EXISTS prep_leftover_max_pct    ON settings TYPE option<float> DEFAULT 30.0;
  -- max % of yesterday's prep reusable as leftover
