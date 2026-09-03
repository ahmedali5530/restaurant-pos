-- Migration: 2026_09_07_recipe_nutrition_generator.surql
--
-- AI Recipe Nutrition & Dietary Label Generator — 86th POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend $200-500/mo on third-party nutrition
-- analysis (NutriSlice, MenuCalc, Healthy Dining) + 4-8 hours/week manual
-- data entry. FDA menu labeling law (2018) requires chains 20+ locations to
-- post calorie counts — non-compliance = $500-1,000 per item per day.
-- Independent restaurants voluntarily label for: health-conscious customers
-- (35% of diners), dietary restrictions (15% have food allergies/intolerances),
-- delivery platform requirements (UberEats/DoorDash require dietary tags).
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO nutrition calculation.
-- Toast has manual allergen tagging only. Square has none. Lightspeed has none.
-- Third-party nutrition services cost $200-500/mo and require manual ingredient
-- entry + USDA database lookup — no AI, no auto-generation.
--
-- POSR's existing services cover DIFFERENT aspects:
--   - allergen-risk.service = ALLERGEN cross-contamination RISK in kitchen
--     — NOT nutrition calculation or dietary label generation
--   - recipe-optimization.service = recipe COST optimization (ingredient costs)
--     — NOT nutrition
--   - recipe-substitution.service = ingredient SWAP suggestions — NOT nutrition
--   - recipe-scaling.service = BATCH scaling for events — NOT nutrition
--   - dish-profitability.service = dish PROFITABILITY (cost vs price) — NOT
--     nutrition
--   - menu-optimization.service = BCG matrix (popularity vs margin) — NOT nutrition
--
-- This new service GENERATES NUTRITION DATA from recipe ingredients:
--   - Auto-calculates calories, macros (protein/carbs/fat/fiber/sugar/sodium)
--   - Detects 14 major allergens (milk, eggs, fish, shellfish, tree nuts, peanuts,
--     wheat, soybeans, sesame, gluten, sulfites, mustard, celery, lupin)
--   - Generates dietary labels (vegan, vegetarian, gluten-free, dairy-free,
--     keto, paleo, halal, kosher-compatible)
--   - Calculates per-serving nutrition from total recipe ÷ servings
--   - Scores healthfulness (0-100) based on calorie density + macro balance
--   - Generates FDA-compliant menu labels
--   - Flags high-sodium/high-sugar items for reformulation

DEFINE TABLE IF NOT EXISTS recipe_nutrition_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON recipe_nutrition_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON recipe_nutrition_alert TYPE string;
  -- 'high_sodium' | 'high_sugar' | 'high_calorie_density' | 'low_protein' |
  -- 'missing_allergen_tag' | 'dietary_label_conflict' | 'serving_size_mismatch' |
  -- 'reformulation_opportunity'
DEFINE FIELD IF NOT EXISTS severity        ON recipe_nutrition_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS recipe_id       ON recipe_nutrition_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS recipe_name     ON recipe_nutrition_alert TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON recipe_nutrition_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS calories_per_serving ON recipe_nutrition_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS protein_g        ON recipe_nutrition_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS carbs_g          ON recipe_nutrition_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS fat_g            ON recipe_nutrition_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS fiber_g          ON recipe_nutrition_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS sugar_g          ON recipe_nutrition_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS sodium_mg        ON recipe_nutrition_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS health_score     ON recipe_nutrition_alert TYPE option<int>;
  -- 0-100, higher = healthier
DEFINE FIELD IF NOT EXISTS allergens_detected ON recipe_nutrition_alert TYPE option<string>;
  -- JSON array of allergen codes
DEFINE FIELD IF NOT EXISTS dietary_labels   ON recipe_nutrition_alert TYPE option<string>;
  -- JSON array: 'vegan' | 'vegetarian' | 'gluten_free' | 'dairy_free' | 'keto' | 'paleo'
DEFINE FIELD IF NOT EXISTS current_price    ON recipe_nutrition_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_reformulation_savings ON recipe_nutrition_alert TYPE float DEFAULT 0;
  -- $ saved by reformulating (cheaper ingredients, smaller portions)
DEFINE FIELD IF NOT EXISTS est_compliance_risk ON recipe_nutrition_alert TYPE float DEFAULT 0;
  -- $ FDA fine risk if non-compliant (chain 20+ locations)
DEFINE FIELD IF NOT EXISTS description      ON recipe_nutrition_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON recipe_nutrition_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON recipe_nutrition_alert TYPE option<string>;
  -- 'reformulate' | 'add_label' | 'adjust_portion' | 'feature_healthy' |
  -- 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON recipe_nutrition_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON recipe_nutrition_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON recipe_nutrition_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_nutrition_rule     ON recipe_nutrition_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_nutrition_status   ON recipe_nutrition_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_nutrition_severity ON recipe_nutrition_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_nutrition_recipe   ON recipe_nutrition_alert FIELDS recipe_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS nutrition_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS nutrition_sodium_max_mg    ON settings TYPE option<int> DEFAULT 800;
  -- max sodium per serving (mg) before high-sodium alert
DEFINE FIELD IF NOT EXISTS nutrition_sugar_max_g      ON settings TYPE option<float> DEFAULT 25.0;
  -- max added sugar per serving (g) before high-sugar alert
DEFINE FIELD IF NOT EXISTS nutrition_calorie_max      ON settings TYPE option<int> DEFAULT 800;
  -- max calories per serving before high-calorie alert
DEFINE FIELD IF NOT EXISTS nutrition_health_score_min ON settings TYPE option<int> DEFAULT 60;
  -- min health score before reformulation alert
DEFINE FIELD IF NOT EXISTS nutrition_chain_locations  ON settings TYPE option<int> DEFAULT 1;
  -- number of locations (20+ triggers FDA menu labeling compliance)
