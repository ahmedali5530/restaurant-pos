-- Migration: 2026_08_28_dish_profitability.surql
--
-- AI Dish Profitability Analysis — 34th POSR-exclusive differentiator.
--
-- Research finding: Restaurants only track food cost margin, missing labor
-- cost which can be 30-40% of a dish's true cost. Toast, Square, Lightspeed
-- show food cost % but DON'T compute total profitability (food + labor +
-- overhead). POSR computes true profitability per dish by combining kitchen
-- prep time × hourly rate + food cost + overhead allocation.
--
-- Distinct from:
--   - menu-optimization (BCG matrix using food cost only, not labor)
--   - recipe-optimization (optimizes recipe cost/yield)
--   - food-cost-trend (tracks ingredient prices)
--   - yield-variance (detects production waste)
--
-- This service adds LABOR COST to the profitability equation — the missing
-- piece that shows which dishes are less profitable than they appear.

DEFINE TABLE IF NOT EXISTS dish_profitability TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON dish_profitability TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS menu_item        ON dish_profitability TYPE option<record<menu_item>>;
DEFINE FIELD IF NOT EXISTS menu_item_name   ON dish_profitability TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON dish_profitability TYPE option<string>;
DEFINE FIELD IF NOT EXISTS selling_price    ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS food_cost       ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS labor_cost       ON dish_profitability TYPE float;
  -- avg prep time × hourly labor rate
DEFINE FIELD IF NOT EXISTS overhead_cost    ON dish_profitability TYPE float DEFAULT 0;
  -- allocated overhead (rent + utilities per dish)
DEFINE FIELD IF NOT EXISTS total_cost       ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS gross_profit     ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS gross_margin_pct ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS net_profit       ON dish_profitability TYPE float;
  -- selling - total_cost (true profitability)
DEFINE FIELD IF NOT EXISTS net_margin_pct  ON dish_profitability TYPE float;
  -- net_profit / selling_price × 100
DEFINE FIELD IF NOT EXISTS avg_prep_minutes  ON dish_profitability TYPE float;
  -- average kitchen prep time from order_item_kitchen
DEFINE FIELD IF NOT EXISTS order_count     ON dish_profitability TYPE int;
  -- total orders in lookback period
DEFINE FIELD IF NOT EXISTS total_revenue    ON dish_profitability TYPE float;
DEFINE FIELD IF NOT EXISTS total_net_profit  ON dish_profitability TYPE float;
  -- total profit contribution
DEFINE FIELD IF NOT EXISTS profitability_grade ON dish_profitability TYPE string;
  -- 'A' | 'B' | 'C' | 'D' | 'F'
DEFINE FIELD IF NOT EXISTS hidden_loss      ON dish_profitability TYPE float DEFAULT 0;
  -- $ lost by not accounting for labor (gross_profit - net_profit × orders)
DEFINE FIELD IF NOT EXISTS ai_insight       ON dish_profitability TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON dish_profitability TYPE option<string>;
  -- 'increase_price' | 'reduce_labor' | 'simplify_recipe' | 'remove' | 'promote' | 'keep'
DEFINE FIELD IF NOT EXISTS analyzed_at      ON dish_profitability TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_dp_menu_item ON dish_profitability FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_dp_grade      ON dish_profitability FIELDS profitability_grade;
DEFINE INDEX IF NOT EXISTS idx_dp_analyzed  ON dish_profitability FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS dish_profit_ai_enabled      ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS dish_profit_lookback_days    ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS dish_profit_avg_labor_rate    ON settings TYPE option<float> DEFAULT 18;
  -- avg hourly labor rate ($18/hr)
DEFINE FIELD IF NOT EXISTS dish_profit_overhead_pct      ON settings TYPE option<float> DEFAULT 0.10;
  -- overhead as 10% of selling price
DEFINE FIELD IF NOT EXISTS dish_profit_min_orders       ON settings TYPE option<int>   DEFAULT 5;
  -- min orders to analyze (skip rare items)
