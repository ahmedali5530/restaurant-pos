-- Migration: 2026_08_28_price_elasticity.surql
--
-- AI Price Elasticity Analysis — 14th POSR-exclusive differentiator.
--
-- Research finding: Restaurants don't know how price changes affect demand.
-- Dynamic Pricing (existing) creates discount RULES by time-of-day. Price
-- Elasticity is different — it computes the elasticity COEFFICIENT per item
-- (how many % demand drops for 1% price increase), then AI recommends the
-- OPTIMAL price point for maximum revenue or profit.
--
-- Toast and Square have NO price elasticity analysis. Enterprise analytics
-- tools (Aptech, Revenue Management Solutions) charge $500+/mo. POSR free.
--
-- Algorithm:
--   1. For each menu_item, find periods with different prices
--   2. Compute elasticity = %Δ quantity / %Δ price (midpoint method)
--   3. Classification:
--      - elastic (|e| > 1): price-sensitive — lower price increases revenue
--      - inelastic (|e| < 1): price-insensitive — raise price increases revenue
--      - unitary (|e| = 1): balanced
--   4. AI recommendation: optimal price for max revenue OR max profit
--      (respects margin floor: never below food_cost × 1.5)
--   5. Estimated revenue impact of adopting recommended price

DEFINE TABLE IF NOT EXISTS price_elasticity_result TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON price_elasticity_result TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS menu_item       ON price_elasticity_result TYPE option<record<menu_item>>;
DEFINE FIELD IF NOT EXISTS menu_item_name  ON price_elasticity_result TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON price_elasticity_result TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_price   ON price_elasticity_result TYPE float;
DEFINE FIELD IF NOT EXISTS food_cost       ON price_elasticity_result TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS current_margin_pct ON price_elasticity_result TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS elasticity_coef  ON price_elasticity_result TYPE float;
  -- negative value; |e| > 1 = elastic, |e| < 1 = inelastic
DEFINE FIELD IF NOT EXISTS elasticity_type ON price_elasticity_result TYPE string;
  -- 'elastic' | 'inelastic' | 'unitary' | 'insufficient_data'
DEFINE FIELD IF NOT EXISTS avg_weekly_qty   ON price_elasticity_result TYPE float;
  -- current avg weekly units sold
DEFINE FIELD IF NOT EXISTS avg_weekly_revenue ON price_elasticity_result TYPE float;
  -- current avg weekly revenue
DEFINE FIELD IF NOT EXISTS recommended_price ON price_elasticity_result TYPE float;
  -- AI-recommended optimal price
DEFINE FIELD IF NOT EXISTS recommended_action ON price_elasticity_result TYPE string;
  -- 'raise_price' | 'lower_price' | 'keep_price' | 'insufficient_data'
DEFINE FIELD IF NOT EXISTS est_revenue_impact_pct ON price_elasticity_result TYPE float DEFAULT 0;
  -- % revenue change if recommended price adopted (weekly)
DEFINE FIELD IF NOT EXISTS est_weekly_revenue_change ON price_elasticity_result TYPE float DEFAULT 0;
  -- $ weekly revenue change
DEFINE FIELD IF NOT EXISTS confidence_score ON price_elasticity_result TYPE float;
  -- 0-1, based on data points + variance
DEFINE FIELD IF NOT EXISTS ai_insight     ON price_elasticity_result TYPE option<string>;
DEFINE FIELD IF NOT EXISTS analysis_period_start ON price_elasticity_result TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS analysis_period_end   ON price_elasticity_result TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS data_points    ON price_elasticity_result TYPE int DEFAULT 0;
  -- number of price-period observations
DEFINE FIELD IF NOT EXISTS action_taken   ON price_elasticity_result TYPE string DEFAULT 'none';
  -- 'none' | 'price_adjusted' | 'reviewed' | 'dismissed' | 'monitoring'
DEFINE FIELD IF NOT EXISTS analyzed_at    ON price_elasticity_result TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id      ON price_elasticity_result TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_pe_menu_item   ON price_elasticity_result FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_pe_type        ON price_elasticity_result FIELDS elasticity_type;
DEFINE INDEX IF NOT EXISTS idx_pe_action      ON price_elasticity_result FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_pe_analyzed    ON price_elasticity_result FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS elasticity_ai_enabled         ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS elasticity_lookback_days      ON settings TYPE option<int>   DEFAULT 180;
  -- 6 months of price history
DEFINE FIELD IF NOT EXISTS elasticity_min_data_points    ON settings TYPE option<int>   DEFAULT 3;
  -- need 3+ price periods to compute elasticity
DEFINE FIELD IF NOT EXISTS elasticity_min_weekly_qty      ON settings TYPE option<int>   DEFAULT 5;
  -- skip items selling < 5/week (not enough signal)
DEFINE FIELD IF NOT EXISTS elasticity_margin_floor_multiplier ON settings TYPE option<float> DEFAULT 1.5;
  -- never recommend below food_cost × 1.5
DEFINE FIELD IF NOT EXISTS elasticity_max_price_increase_pct ON settings TYPE option<float> DEFAULT 0.20;
  -- cap AI recommendations at +20% to avoid sticker shock
DEFINE FIELD IF NOT EXISTS elasticity_max_price_decrease_pct ON settings TYPE option<float> DEFAULT 0.15;
  -- cap AI recommendations at -15% to protect margin
