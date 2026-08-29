-- Migration: 2026_08_28_recipe_optimization.surql
--
-- AI Recipe Cost Optimization — per-dish cost breakdown + margin analysis.
--
-- Research finding: Toast Recipe Engineering $40+/mo (higher tier), Square
-- Recipe Costing in Plus. POSR offers it free — analyzes each dish's recipe
-- cost breakdown (ingredient costs), computes food cost %, margin, + AI
-- recommendations (substitute/reportion/reprice/redesign/keep).

DEFINE TABLE IF NOT EXISTS recipe_cost_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON recipe_cost_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS dish_id         ON recipe_cost_analysis TYPE string;
DEFINE FIELD IF NOT EXISTS dish_name      ON recipe_cost_analysis TYPE string;
DEFINE FIELD IF NOT EXISTS dish_price      ON recipe_cost_analysis TYPE float;
DEFINE FIELD IF NOT EXISTS total_recipe_cost ON recipe_cost_analysis TYPE float;
DEFINE FIELD IF NOT EXISTS food_cost_pct   ON recipe_cost_analysis TYPE float;
  -- recipe_cost / price × 100
DEFINE FIELD IF NOT EXISTS margin_pct      ON recipe_cost_analysis TYPE float;
  -- 100 - food_cost_pct
DEFINE FIELD IF NOT EXISTS margin_amount   ON recipe_cost_analysis TYPE float;
  -- price - recipe_cost
DEFINE FIELD IF NOT EXISTS ingredient_count ON recipe_cost_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS top_cost_ingredients ON recipe_cost_analysis TYPE option<array<object>>;
  -- [{name, cost, pct_of_total}]
DEFINE FIELD IF NOT EXISTS grade           ON recipe_cost_analysis TYPE string DEFAULT 'C';
  -- A (food_cost < 25%) / B (25-30%) / C (30-35%) / D (35-40%) / F (>40%)
DEFINE FIELD IF NOT EXISTS ai_recommendation ON recipe_cost_analysis TYPE option<string>;
  -- 'substitute' | 'reportion' | 'reprice' | 'redesign' | 'keep'
DEFINE FIELD IF NOT EXISTS ai_insight      ON recipe_cost_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS potential_savings ON recipe_cost_analysis TYPE option<float>;
  -- Estimated monthly savings if recommendation followed
DEFINE FIELD IF NOT EXISTS generated_at    ON recipe_cost_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON recipe_cost_analysis TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rca_dish_id  ON recipe_cost_analysis FIELDS dish_id;
DEFINE INDEX IF NOT EXISTS idx_rca_grade     ON recipe_cost_analysis FIELDS grade;
DEFINE INDEX IF NOT EXISTS idx_rca_food_cost ON recipe_cost_analysis FIELDS food_cost_pct;

DEFINE FIELD IF NOT EXISTS recipe_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS recipe_target_food_cost_pct ON settings TYPE option<float> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS recipe_critical_food_cost_pct ON settings TYPE option<float> DEFAULT 40;
