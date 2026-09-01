-- Migration: 2026_08_28_menu_optimization.surql
--
-- AI Menu Optimization — menu engineering matrix + pricing recommendations.
--
-- Research finding: Toast Menu Intelligence is $100+/mo (higher tier add-on).
-- Square Menu Insights gated to Plus/Pro. Lightspeed Menu Engineering is an
-- add-on. POSR offers it free — analyzes dish popularity + profitability +
-- cost margins and generates BCG-style recommendations.
--
-- Tables:
--   1. menu_insight — cached AI-generated insights per dish (24h TTL)
--
-- Menu engineering matrix (Boston Consulting Group adapted for restaurants):
--   STARS       — high popularity + high margin (promote, feature, protect)
--   PLOWHORSES  — high popularity + low margin (raise price or cut cost)
--   PUZZLES     — low popularity + high margin (reposition, rename, photo)
--   DOGS        — low popularity + low margin (remove or reprice)
--
-- Pricing recommendations:
--   - UNDERPRICED: price < cost × 3 (food cost > 33%) — suggest increase
--   - OVERPRICED:  price > competitor avg × 1.5 — suggest decrease
--   - OPTIMAL:    within target food cost % range
--
-- Settings fields:
--   - menu_opt_target_food_cost_pct   — target food cost % (default 30)
--   - menu_opt_lookback_days          — sales history window (default 30)
--   - menu_opt_min_sales_for_popular  — min units sold to be 'popular' (default 20)
--   - menu_opt_ai_enabled             — enable AI insights (default true)

-- ---------------------------------------------------------------------------
-- menu_insight — cached AI insights per dish
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS menu_insight TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id                ON menu_insight TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS dish              ON menu_insight TYPE option<record<dish>>;
DEFINE FIELD IF NOT EXISTS dish_id            ON menu_insight TYPE string;
DEFINE FIELD IF NOT EXISTS dish_name          ON menu_insight TYPE string;
DEFINE FIELD IF NOT EXISTS category           ON menu_insight TYPE option<string>;
  -- Menu engineering classification
DEFINE FIELD IF NOT EXISTS classification     ON menu_insight TYPE string;
  -- 'star' | 'plowhorse' | 'puzzle' | 'dog'
DEFINE FIELD IF NOT EXISTS units_sold         ON menu_insight TYPE int;
DEFINE FIELD IF NOT EXISTS revenue            ON menu_insight TYPE float;
DEFINE FIELD IF NOT EXISTS cost_total         ON menu_insight TYPE float;
DEFINE FIELD IF NOT EXISTS profit             ON menu_insight TYPE float;
DEFINE FIELD IF NOT EXISTS margin_pct         ON menu_insight TYPE float;
  -- profit / revenue × 100
DEFINE FIELD IF NOT EXISTS food_cost_pct      ON menu_insight TYPE float;
  -- cost / price × 100
DEFINE FIELD IF NOT EXISTS popularity_rank    ON menu_insight TYPE int;
  -- 1 = most popular
DEFINE FIELD IF NOT EXISTS profitability_rank  ON menu_insight TYPE int;
  -- 1 = most profitable
DEFINE FIELD IF NOT EXISTS pricing_recommendation ON menu_insight TYPE string;
  -- 'underpriced' | 'overpriced' | 'optimal' | 'no_data'
DEFINE FIELD IF NOT EXISTS suggested_price    ON menu_insight TYPE option<float>;
DEFINE FIELD IF NOT EXISTS price_change_pct   ON menu_insight TYPE option<float>;
  -- % change suggested (positive = increase, negative = decrease)
DEFINE FIELD IF NOT EXISTS ai_insight          ON menu_insight TYPE option<string>;
  -- Free-text AI-generated insight (max 200 chars)
DEFINE FIELD IF NOT EXISTS ai_action          ON menu_insight TYPE option<string>;
  -- Concrete recommended action ('promote' | 'reprice' | 'reposition' | 'remove' | 'keep')
DEFINE FIELD IF NOT EXISTS generated_at       ON menu_insight TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at          ON menu_insight TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_mi_dish_id       ON menu_insight FIELDS dish_id;
DEFINE INDEX IF NOT EXISTS idx_mi_classification ON menu_insight FIELDS classification;
DEFINE FIELD IF NOT EXISTS expires_at ON menu_insight TYPE option<datetime>;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS menu_opt_target_food_cost_pct  ON settings TYPE option<float> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS menu_opt_lookback_days         ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS menu_opt_min_sales_for_popular  ON settings TYPE option<int> DEFAULT 20;
DEFINE FIELD IF NOT EXISTS menu_opt_ai_enabled             ON settings TYPE option<bool> DEFAULT true;
