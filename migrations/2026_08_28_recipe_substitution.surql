-- Migration: 2026_08_28_recipe_substitution.surql
--
-- AI Recipe Substitution Intelligence — 22nd POSR-exclusive differentiator.
--
-- Research finding: When an ingredient is out of stock, expensive, or about
-- to spoil, chefs improvise substitutes based on experience. No POS system
-- suggests intelligent substitutions. Toast and Square have recipe tracking
-- but NO substitution intelligence. POSR analyzes flavor profile, cost,
-- category match, supplier availability + AI recommends best substitute.
--
-- Distinct from:
--   - recipe-optimization.service (optimizes recipe cost/yield, doesn't suggest substitutes)
--   - yield-variance.service (detects production waste, doesn't suggest alternatives)
--   - food-cost-trend.service (tracks price changes, doesn't suggest cheaper alternatives)
--   - spoilage-prediction.service (predicts waste, doesn't suggest what to use instead)
--
-- This service SUGGESTS SUBSTITUTE ingredients when:
--   1. Current ingredient is out of stock (stockout)
--   2. Current ingredient price spiked (>20% above category median)
--   3. Current ingredient is about to spoil (spoilage-prediction flagged)
--   4. Dietary restriction requires alternative (gluten-free, vegan, dairy-free)
--
-- Algorithm:
--   1. Identify ingredients needing substitution (stockout / price spike / spoilage)
--   2. For each, find candidates in same inventory_category
--   3. Score candidates by:
--      - category_match (same category = highest, adjacent = partial)
--      - cost_efficiency (cheaper = better, within ±15% = acceptable)
--      - stock_availability (in stock = highest)
--   4. AI enhancement: flavor_profile compatibility + substitution ratio
--      (how much of substitute to use vs original)
--   5. Recommendation: use_substitute | order_more | reformulate | keep_original

DEFINE TABLE IF NOT EXISTS substitution_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON substitution_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS original_item   ON substitution_suggestion TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS original_item_name ON substitution_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS original_category ON substitution_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS substitute_item ON substitution_suggestion TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS substitute_item_name ON substitution_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS substitute_category ON substitution_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS trigger_reason  ON substitution_suggestion TYPE string;
  -- 'stockout' | 'price_spike' | 'spoilage_risk' | 'dietary_restriction'
DEFINE FIELD IF NOT EXISTS category_match_score ON substitution_suggestion TYPE float;
  -- 0-1 (1 = same category, 0.5 = adjacent, 0 = unrelated)
DEFINE FIELD IF NOT EXISTS cost_score      ON substitution_suggestion TYPE float;
  -- 0-1 (1 = cheaper, 0.5 = within ±15%, 0 = much more expensive)
DEFINE FIELD IF NOT EXISTS availability_score ON substitution_suggestion TYPE float;
  -- 0-1 (1 = in stock, 0 = out of stock)
DEFINE FIELD IF NOT EXISTS overall_score    ON substitution_suggestion TYPE float;
  -- weighted: category 40% + cost 30% + availability 30%
DEFINE FIELD IF NOT EXISTS original_price   ON substitution_suggestion TYPE float;
DEFINE FIELD IF NOT EXISTS substitute_price  ON substitution_suggestion TYPE float;
DEFINE FIELD IF NOT EXISTS price_difference  ON substitution_suggestion TYPE float;
  -- substitute - original (negative = cheaper)
DEFINE FIELD IF NOT EXISTS substitution_ratio ON substitution_suggestion TYPE float DEFAULT 1.0;
  -- how much substitute to use vs original (e.g. 0.8 = use 80% of original qty)
DEFINE FIELD IF NOT EXISTS affected_recipes ON substitution_suggestion TYPE int DEFAULT 0;
  -- number of recipes using this ingredient
DEFINE FIELD IF NOT EXISTS est_monthly_savings ON substitution_suggestion TYPE float DEFAULT 0;
  -- $ saved per month if substitute adopted
DEFINE FIELD IF NOT EXISTS ai_insight      ON substitution_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON substitution_suggestion TYPE option<string>;
  -- 'use_substitute' | 'order_more' | 'reformulate' | 'keep_original'
DEFINE FIELD IF NOT EXISTS action_taken    ON substitution_suggestion TYPE string DEFAULT 'none';
  -- 'none' | 'substituted' | 'ordered' | 'reformulated' | 'kept' | 'dismissed'
DEFINE FIELD IF NOT EXISTS suggested_at     ON substitution_suggestion TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON substitution_suggestion TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_ss_original   ON substitution_suggestion FIELDS original_item;
DEFINE INDEX IF NOT EXISTS idx_ss_substitute ON substitution_suggestion FIELDS substitute_item;
DEFINE FIELD IF NOT EXISTS idx_ss_trigger    ON substitution_suggestion TYPE string DEFAULT 'stockout';
DEFINE INDEX IF NOT EXISTS idx_ss_trigger    ON substitution_suggestion FIELDS trigger_reason;
DEFINE INDEX IF NOT EXISTS idx_ss_action     ON substitution_suggestion FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_ss_score      ON substitution_suggestion FIELDS overall_score;

-- Settings
DEFINE FIELD IF NOT EXISTS substitution_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS substitution_price_spike_pct   ON settings TYPE option<float> DEFAULT 0.20;
  -- > 20% above category median = price_spike trigger
DEFINE FIELD IF NOT EXISTS substitution_cost_tolerance_pct ON settings TYPE option<float> DEFAULT 0.15;
  -- within ±15% of original price = acceptable cost
DEFINE FIELD IF NOT EXISTS substitution_min_score        ON settings TYPE option<float> DEFAULT 0.5;
  -- minimum overall_score to suggest a substitute
DEFINE FIELD IF NOT EXISTS substitution_max_candidates  ON settings TYPE option<int>   DEFAULT 5;
  -- max substitute candidates per ingredient
