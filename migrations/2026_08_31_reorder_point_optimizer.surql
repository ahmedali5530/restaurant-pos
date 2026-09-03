-- Migration: 2026_08_31_reorder_point_optimizer.surql
--
-- AI Inventory Reorder Point Optimizer — 60th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from inventory
-- mismanagement (NRA, Restaurant Supply Chain Report):
--   - Stockouts: 3-5% of menu items unavailable daily = $150-400/mo lost sales
--   - Overstock spoilage: 10-15% of perishables wasted = $80-300/mo
--   - Emergency reorder premiums: rush delivery fees = $50-100/mo
--   - Cash tied up in excess inventory: $2-5k working capital locked
--
-- Classic supply chain theory (EOQ, safety stock, reorder points) is standard
-- in manufacturing/retail (SAP, Oracle) but MISSING from restaurant POS systems.
-- Toast Inventory, Square Inventory, Lightspeed Inventory all use STATIC reorder
-- points set manually — they do NOT auto-adjust based on demand trends, lead
-- time variability, or spoilage thresholds.
--
-- POSR's existing services cover DIFFERENT supply chain aspects:
--   - procurement.service = PRICE forecasting (buy-now vs wait-for-price-drop)
--   - spoilage-prediction.service = ingredient SHELF-LIFE prediction
--   - food-cost-trend.service = ingredient COST trend tracking
--   - demand-forecast.service = demand PREDICTION (not inventory policy)
--   - vendor-performance.service = supplier SCORECARDS (on-time/quality)
--   - recipe-substitution.service = recipe ingredient SWAPS
--
-- This new service optimizes REORDER POINTS + SAFETY STOCK + ORDER QUANTITY:
-- dynamic inventory policy that auto-adjusts per SKU based on consumption rate,
-- lead time variability, shelf-life, and seasonal demand shifts.

DEFINE TABLE IF NOT EXISTS reorder_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON reorder_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON reorder_recommendation TYPE string;
  -- 'understock_risk' | 'overstock_risk' | 'lead_time_variability' |
  -- 'seasonal_demand_shift' | 'bulk_eoq_opportunity' | 'spoilage_threshold' |
  -- 'vendor_minimum_optimization' | 'emergency_reorder'
DEFINE FIELD IF NOT EXISTS severity        ON reorder_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS ingredient_id    ON reorder_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ingredient_name  ON reorder_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS category         ON reorder_recommendation TYPE option<string>;
  -- 'produce' | 'meat' | 'dairy' | 'dry_goods' | 'frozen' | 'beverage' | 'other'
DEFINE FIELD IF NOT EXISTS current_stock    ON reorder_recommendation TYPE float DEFAULT 0;
  -- current on-hand quantity
DEFINE FIELD IF NOT EXISTS current_reorder_point ON reorder_recommendation TYPE float DEFAULT 0;
  -- existing ROP (manual setting)
DEFINE FIELD IF NOT EXISTS suggested_reorder_point ON reorder_recommendation TYPE float DEFAULT 0;
  -- AI-recommended ROP
DEFINE FIELD IF NOT EXISTS current_safety_stock ON reorder_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS suggested_safety_stock ON reorder_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_daily_usage  ON reorder_recommendation TYPE float DEFAULT 0;
  -- units consumed per day (30-day average)
DEFINE FIELD IF NOT EXISTS lead_time_days   ON reorder_recommendation TYPE float DEFAULT 0;
  -- supplier lead time in days
DEFINE FIELD IF NOT EXISTS lead_time_stddev ON reorder_recommendation TYPE option<float>;
  -- lead time variability (stddev in days)
DEFINE FIELD IF NOT EXISTS shelf_life_days  ON reorder_recommendation TYPE option<float>;
  -- perishable shelf-life (NONE for non-perishable)
DEFINE FIELD IF NOT EXISTS current_eoq      ON reorder_recommendation TYPE option<float>;
  -- current order quantity
DEFINE FIELD IF NOT EXISTS suggested_eoq    ON reorder_recommendation TYPE option<float>;
  -- Economic Order Quantity
DEFINE FIELD IF NOT EXISTS days_until_stockout ON reorder_recommendation TYPE option<float>;
  -- projected days until stock hits zero at current usage
DEFINE FIELD IF NOT EXISTS est_loss_monthly ON reorder_recommendation TYPE float DEFAULT 0;
  -- $ lost per month if recommendation not adopted (stockout or spoilage)
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON reorder_recommendation TYPE float DEFAULT 0;
  -- $ saved per month if adopted
DEFINE FIELD IF NOT EXISTS description      ON reorder_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON reorder_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON reorder_recommendation TYPE option<string>;
  -- 'adopt_now' | 'pilot_2_weeks' | 'emergency_order' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON reorder_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'adopted' | 'piloting' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON reorder_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON reorder_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_reorder_rule      ON reorder_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_reorder_status    ON reorder_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_reorder_severity  ON reorder_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_reorder_ingredient ON reorder_recommendation FIELDS ingredient_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS reorder_ai_enabled            ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS reorder_service_level         ON settings TYPE option<float> DEFAULT 95.0;
  -- target service level % (95% = stockout risk 5%)
DEFINE FIELD IF NOT EXISTS reorder_review_window_days    ON settings TYPE option<int> DEFAULT 30;
  -- usage averaging window
DEFINE FIELD IF NOT EXISTS reorder_stockout_alert_days   ON settings TYPE option<int> DEFAULT 3;
  -- alert if < N days until stockout
