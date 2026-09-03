-- Migration: 2026_08_28_food_cost_trend.surql
--
-- AI Food Cost Trend Analysis — track ingredient price changes + margin impact.
--
-- Research finding: Toast Food Cost Variance $35+/mo (higher tier), Square
-- COGS tracking in Plus. POSR offers it free — analyzes purchase history to
-- identify items with rising/falling costs, computes impact on dish margins,
-- + AI recommendations (renegotiate / substitute / reprice / absorb).

DEFINE TABLE IF NOT EXISTS food_cost_trend TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON food_cost_trend TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS item_id         ON food_cost_trend TYPE string;
DEFINE FIELD IF NOT EXISTS item_name      ON food_cost_trend TYPE string;
DEFINE FIELD IF NOT EXISTS uom            ON food_cost_trend TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_price   ON food_cost_trend TYPE float;
DEFINE FIELD IF NOT EXISTS previous_price  ON food_cost_trend TYPE float;
DEFINE FIELD IF NOT EXISTS price_30d_ago   ON food_cost_trend TYPE float;
DEFINE FIELD IF NOT EXISTS price_90d_ago   ON food_cost_trend TYPE float;
DEFINE FIELD IF NOT EXISTS price_change_pct_30d ON food_cost_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS price_change_pct_90d ON food_cost_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS trend_direction ON food_cost_trend TYPE string DEFAULT 'stable';
  -- 'rising' | 'falling' | 'stable'
DEFINE FIELD IF NOT EXISTS avg_monthly_consumption ON food_cost_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS monthly_cost_impact ON food_cost_trend TYPE float DEFAULT 0;
  -- monthly_consumption × (current - 30d_ago) = $ impact of price change
DEFINE FIELD IF NOT EXISTS annual_cost_impact ON food_cost_trend TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS affected_dishes ON food_cost_trend TYPE option<array<string>>;
  -- Dish names that use this ingredient (from recipe items)
DEFINE FIELD IF NOT EXISTS margin_impact_pct ON food_cost_trend TYPE float DEFAULT 0;
  -- How much dish margins are affected by this price change
DEFINE FIELD IF NOT EXISTS severity        ON food_cost_trend TYPE string DEFAULT 'low';
  -- 'low' (<5% change) | 'medium' (5-15%) | 'high' (15-30%) | 'critical' (>30%)
DEFINE FIELD IF NOT EXISTS ai_recommendation ON food_cost_trend TYPE option<string>;
  -- 'renegotiate' | 'substitute' | 'reprice_menu' | 'absorb' | 'monitor'
DEFINE FIELD IF NOT EXISTS ai_insight      ON food_cost_trend TYPE option<string>;
DEFINE FIELD IF NOT EXISTS generated_at    ON food_cost_trend TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON food_cost_trend TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_fct_item_id    ON food_cost_trend FIELDS item_id;
DEFINE INDEX IF NOT EXISTS idx_fct_severity    ON food_cost_trend FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_fct_trend       ON food_cost_trend FIELDS trend_direction;

DEFINE FIELD IF NOT EXISTS food_cost_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS food_cost_lookback_days ON settings TYPE option<int> DEFAULT 90;
DEFINE FIELD IF NOT EXISTS food_cost_rising_threshold ON settings TYPE option<float> DEFAULT 5;
  -- % change above which is flagged as 'rising' (default: 5%)
