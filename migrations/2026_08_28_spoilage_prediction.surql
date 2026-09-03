-- Migration: 2026_08_28_spoilage_prediction.surql
--
-- AI Inventory Spoilage Prediction — 20th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste 4-10% of food inventory to spoilage
-- (NRRA). Existing services detect waste AFTER it happens (waste-tracking) or
-- find items ALREADY expired (food-safety expired_stock rule). NO service
-- PREDICTS which items will spoil BEFORE it happens. POSR predicts spoilage
-- based on consumption rate × expiry date × current stock, then recommends
-- preventive actions (use in special, mark down, redistribute, reorder less).
--
-- Distinct from:
--   - food-safety.service (temperature monitoring + HACCP, has expired_stock
--     check but only finds items ALREADY expired — reactive)
--   - shrinkage-detection (detects theft/loss patterns)
--   - waste-tracking (analyzes waste AFTER it happens)
--   - reorder.service (suggests when to reorder, doesn't predict spoilage)
-- This service PREDICTS waste BEFORE it happens — preventive, not reactive.
--
-- Algorithm:
--   1. For each inventory_item with expiry_date (from inventory_purchase_item):
--      - current_stock (from inventory_ledger sum of quantity_change)
--      - avg_daily_consumption (from order_item sales × recipe quantities)
--      - days_until_expiry = (expiry_date - today) / 1d
--      - days_of_stock = current_stock / avg_daily_consumption
--   2. Spoilage risk: if days_until_expiry < days_of_stock → will spoil
--      - risk_score = max(0, 1 - (days_until_expiry / days_of_stock)) × 100
--   3. Classification:
--      - 'critical': days_until_expiry < 3 AND will_spoil
--      - 'high': days_until_expiry < 7 AND will_spoil
--      - 'medium': days_until_expiry < 14 AND will_spoil
--      - 'low': will_not_spoil or no expiry
--   4. est_spoilage_cost = (stock_at_expiry × unit_cost)
--   5. AI recommendation: use_in_special | mark_down | redistribute |
--      reduce_reorder | donate | discard_now | monitor

DEFINE TABLE IF NOT EXISTS spoilage_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON spoilage_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS inventory_item   ON spoilage_prediction TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS item_name       ON spoilage_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON spoilage_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_stock   ON spoilage_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS unit_cost       ON spoilage_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS avg_daily_consumption ON spoilage_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS days_of_stock    ON spoilage_prediction TYPE float;
  -- how many days current stock will last at current consumption rate
DEFINE FIELD IF NOT EXISTS expiry_date      ON spoilage_prediction TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS days_until_expiry ON spoilage_prediction TYPE float;
DEFINE FIELD IF NOT EXISTS will_spoil      ON spoilage_prediction TYPE bool DEFAULT false;
  -- true if days_until_expiry < days_of_stock
DEFINE FIELD IF NOT EXISTS risk_score      ON spoilage_prediction TYPE float;
  -- 0-100 (100 = near-certain spoilage)
DEFINE FIELD IF NOT EXISTS risk_level      ON spoilage_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS est_spoilage_cost ON spoilage_prediction TYPE float DEFAULT 0;
  -- $ value of stock that will spoil if no action taken
DEFINE FIELD IF NOT EXISTS est_spoilage_qty ON spoilage_prediction TYPE float DEFAULT 0;
  -- quantity that will spoil
DEFINE FIELD IF NOT EXISTS ai_insight      ON spoilage_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON spoilage_prediction TYPE option<string>;
  -- 'use_in_special' | 'mark_down' | 'redistribute' | 'reduce_reorder' |
  -- 'donate' | 'discard_now' | 'monitor'
DEFINE FIELD IF NOT EXISTS action_taken    ON spoilage_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'used_in_special' | 'marked_down' | 'redistributed' | 'reorder_reduced' |
  -- 'donated' | 'discarded' | 'monitored' | 'consumed_normally'
DEFINE FIELD IF NOT EXISTS predicted_at    ON spoilage_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON spoilage_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_sp_item      ON spoilage_prediction FIELDS inventory_item;
DEFINE INDEX IF NOT EXISTS idx_sp_risk_level ON spoilage_prediction FIELDS risk_level;
DEFINE INDEX IF NOT EXISTS idx_sp_action    ON spoilage_prediction FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_sp_predicted  ON spoilage_prediction FIELDS predicted_at;
DEFINE INDEX IF NOT EXISTS idx_sp_expiry    ON spoilage_prediction FIELDS expiry_date;

-- Settings
DEFINE FIELD IF NOT EXISTS spoilage_ai_enabled         ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS spoilage_consumption_lookback_days ON settings TYPE option<int>   DEFAULT 30;
  -- 30-day consumption history for avg daily rate
DEFINE FIELD IF NOT EXISTS spoilage_critical_days       ON settings TYPE option<int>   DEFAULT 3;
  -- < 3 days to expiry + will_spoil = critical
DEFINE FIELD IF NOT EXISTS spoilage_high_days           ON settings TYPE option<int>   DEFAULT 7;
  -- < 7 days to expiry + will_spoil = high
DEFINE FIELD IF NOT EXISTS spoilage_medium_days        ON settings TYPE option<int>   DEFAULT 14;
  -- < 14 days to expiry + will_spoil = medium
DEFINE FIELD IF NOT EXISTS spoilage_min_stock_value     ON settings TYPE option<float> DEFAULT 5;
  -- skip items worth < $5 (not worth analyzing)
