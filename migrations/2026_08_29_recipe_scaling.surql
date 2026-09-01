-- Migration: 2026_08_29_recipe_scaling.surql
--
-- AI Recipe Scaling Optimizer — 59th POSR-exclusive differentiator.
--
-- Research finding: Recipe scaling is NOT linear — scaling 1 serving to 100
-- servings requires adjustments (CIA Culinary Institute research):
--   - Spices: sub-linear (2x servings → 1.5x spice, not 2x — bitterness)
--   - Salt: sub-linear (2x servings → 1.7x salt)
--   - Leavening (baking soda/powder): sub-linear (2x → 1.5x)
--   - Liquids: sub-linear (evaporation is constant, not proportional)
--   - Cooking time: sub-linear (thicker batch cooks differently)
--   - Garnish: super-linear (more visible, more needed)
--   - Heat: constant (oven temp doesn't scale with quantity)
--
-- 20-30% of catering orders have portion miscalculations (CaterSource).
-- Restaurants lose $500-2k/event to over/under-scaling.
--
-- Toast, Square, Lightspeed have recipe tracking but NO scaling intelligence.
-- Recipe-optimization.service does per-dish COST analysis. Yield-variance
-- detects PRODUCTION waste. Catering-optimizer does bulk PRICING. None
-- scale actual INGREDIENT quantities with culinary science.
--
-- Distinct from:
--   - recipe-optimization.service (per-dish cost breakdown — NOT scaling)
--   - yield-variance.service (production waste detection — NOT scaling math)
--   - catering-optimizer.service (bulk pricing + menu mix — NOT ingredient scaling)
--   - recipe-substitution.service (ingredient substitution — NOT scaling)
--   - menu-optimization.service (BCG matrix — NOT scaling)

DEFINE TABLE IF NOT EXISTS recipe_scaling TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON recipe_scaling TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON recipe_scaling TYPE string;
  -- 'bulk_scaling' | 'spice_adjustment' | 'liquid_adjustment' | 'cooking_time' | 'cost_per_portion'
DEFINE FIELD IF NOT EXISTS severity       ON recipe_scaling TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS recipe_id      ON recipe_scaling TYPE option<string>;
DEFINE FIELD IF NOT EXISTS recipe_name    ON recipe_scaling TYPE option<string>;
DEFINE FIELD IF NOT EXISTS base_servings  ON recipe_scaling TYPE int DEFAULT 1;
  -- original recipe servings
DEFINE FIELD IF NOT EXISTS target_servings ON recipe_scaling TYPE int DEFAULT 50;
  -- desired servings
DEFINE FIELD IF NOT EXISTS scale_factor   ON recipe_scaling TYPE float DEFAULT 1;
  -- target / base
DEFINE FIELD IF NOT EXISTS adjusted_ingredients ON recipe_scaling TYPE option<string>;
  -- JSON: array of {name, base_qty, scaled_qty, adjustment_factor, unit}
DEFINE FIELD IF NOT EXISTS total_cost     ON recipe_scaling TYPE float DEFAULT 0;
  -- scaled total cost
DEFINE FIELD IF NOT EXISTS cost_per_portion ON recipe_scaling TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_waste_pct  ON recipe_scaling TYPE float DEFAULT 0;
  -- predicted waste at scale
DEFINE FIELD IF NOT EXISTS cooking_time_minutes ON recipe_scaling TYPE option<int>;
  -- adjusted cooking time
DEFINE FIELD IF NOT EXISTS equipment_needed ON recipe_scaling TYPE option<string>;
  -- JSON: suggested equipment (stock pot size, sheet pan count)
DEFINE FIELD IF NOT EXISTS est_savings     ON recipe_scaling TYPE float DEFAULT 0;
  -- savings from bulk scaling vs per-serving
DEFINE FIELD IF NOT EXISTS description     ON recipe_scaling TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON recipe_scaling TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON recipe_scaling TYPE option<string>;
  -- 'use_scaled_recipe' | 'verify_with_chef' | 'batch_split' | 'adjust_equipment' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON recipe_scaling TYPE string DEFAULT 'open';
  -- 'open' | 'applied' | 'adjusted' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON recipe_scaling TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON recipe_scaling TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rs_rule_id   ON recipe_scaling FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_rs_severity  ON recipe_scaling FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_rs_status    ON recipe_scaling FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_rs_recipe    ON recipe_scaling FIELDS recipe_id;

-- Settings
DEFINE FIELD IF NOT EXISTS recipe_scale_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS recipe_scale_default_target   ON settings TYPE option<int>   DEFAULT 50;
  -- default target servings
DEFINE FIELD IF NOT EXISTS recipe_scale_bulk_discount_threshold ON settings TYPE option<int> DEFAULT 25;
  -- 25+ servings = bulk (triggers bulk ingredient pricing)
DEFINE FIELD IF NOT EXISTS recipe_scale_waste_benchmark_pct ON settings TYPE option<float> DEFAULT 0.08;
  -- 8% waste benchmark at scale
