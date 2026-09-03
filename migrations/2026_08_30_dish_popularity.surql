-- Migration: 2026_08_30_dish_popularity.surql
--
-- AI Dish Popularity Predictor — 78th POSR-exclusive differentiator.
--
-- Research finding: 60% of new menu items fail within 90 days (Menu Engineering
-- Institute). Launching a new dish costs $500-$2,000 (recipe development,
-- ingredient sourcing, staff training, marketing). Yet most restaurants guess
-- what will sell — they don't predict popularity before launch. Data-driven
-- prediction reduces new-dish failure rate by 40-50% (Cornell menu research).
--
-- Toast, Square, Lightspeed have NO new-dish popularity prediction.
-- POSR's menu-optimization.service classifies EXISTING dishes (BCG matrix).
-- menu-rotation.service detects fatigue in EXISTING items.
-- Neither predicts how well a NEW dish will perform before it's added.
--
-- Distinct from:
--   - menu-optimization.service (BCG matrix for EXISTING items — NOT new dishes)
--   - menu-rotation.service (fatigue detection for EXISTING items — NOT new)
--   - menu-pairing.service (co-purchase patterns — NOT new dish prediction)
--   - seasonal.service (monthly trends — NOT new item prediction)
--   - dish-profitability.service (cost breakdown — NOT popularity prediction)

DEFINE TABLE IF NOT EXISTS dish_popularity_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON dish_popularity_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON dish_popularity_prediction TYPE string;
  -- 'similar_to_bestseller' | 'price_point_optimal' | 'category_trending' | 'ingredient_overlap' | 'seasonal_fit'
DEFINE FIELD IF NOT EXISTS severity       ON dish_popularity_prediction TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS proposed_dish_name ON dish_popularity_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS proposed_category ON dish_popularity_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS proposed_price  ON dish_popularity_prediction TYPE option<float>;
DEFINE FIELD IF NOT EXISTS proposed_ingredients ON dish_popularity_prediction TYPE option<string>;
  -- JSON: array of ingredient names
DEFINE FIELD IF NOT EXISTS predicted_popularity ON dish_popularity_prediction TYPE float DEFAULT 0;
  -- 0-100, predicted popularity score
DEFINE FIELD IF NOT EXISTS predicted_orders_week ON dish_popularity_prediction TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS predicted_revenue_week ON dish_popularity_prediction TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS confidence     ON dish_popularity_prediction TYPE float DEFAULT 0;
  -- 0-1, confidence in prediction
DEFINE FIELD IF NOT EXISTS similar_dish   ON dish_popularity_prediction TYPE option<string>;
  -- most similar existing dish
DEFINE FIELD IF NOT EXISTS similarity_score ON dish_popularity_prediction TYPE float DEFAULT 0;
  -- 0-1, similarity to best existing dish
DEFINE FIELD IF NOT EXISTS price_comparator ON dish_popularity_prediction TYPE option<string>;
  -- comparison: 'above_avg' | 'below_avg' | 'at_avg'
DEFINE FIELD IF NOT EXISTS category_avg_price ON dish_popularity_prediction TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_margin_pct  ON dish_popularity_prediction TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_food_cost   ON dish_popularity_prediction TYPE option<float>;
DEFINE FIELD IF NOT EXISTS launch_recommendation ON dish_popularity_prediction TYPE option<string>;
  -- 'launch_now' | 'adjust_price' | 'adjust_recipe' | 'test_limited' | 'skip'
DEFINE FIELD IF NOT EXISTS description     ON dish_popularity_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON dish_popularity_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON dish_popularity_prediction TYPE option<string>;
  -- 'launch' | 'adjust_price' | 'test_first' | 'modify_recipe' | 'do_not_launch'
DEFINE FIELD IF NOT EXISTS status          ON dish_popularity_prediction TYPE string DEFAULT 'open';
  -- 'open' | 'launched' | 'tested' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON dish_popularity_prediction TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_dpp_rule_id   ON dish_popularity_prediction FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_dpp_severity  ON dish_popularity_prediction FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_dpp_status    ON dish_popularity_prediction FIELDS status;
