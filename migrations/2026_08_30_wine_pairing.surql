-- Migration: 2026_08_30_wine_pairing.surql
--
-- AI Sommelier Wine Pairing Engine — 60th POSR-exclusive differentiator.
--
-- Research finding: Wine pairing increases avg ticket 18-25% (Wine & Spirit
-- Wholesalers of America). 67% of diners order wine when recommended (NRA).
-- Yet most restaurants have NO systematic wine pairing — rely on individual
-- server knowledge. Toast, Square, Lightspeed have NO sommelier AI.
-- Vivino ($0 consumer app) has basic pairing but not restaurant-integrated.
--
-- POSR's menu-pairing.service does FOOD-TO-FOOD co-purchase analysis (market
-- basket). It does NOT do FLAVOR-SCIENCE wine pairing. This new service:
--   1. Analyzes dish flavor profile (acid, fat, spice, sweet, umami)
--   2. Matches to wine characteristics (body, tannin, acidity, sweetness)
--   3. Considers price tier (budget $8-15, mid $15-30, premium $30-60, luxury $60+)
--   4. Suggests specific wines from inventory
--   5. Generates server pitch script + pairing story
--
-- Distinct from:
--   - menu-pairing.service (FOOD co-purchase analysis — NOT wine flavor science)
--   - menu-optimization.service (BCG matrix — NOT wine pairing)
--   - menu-rotation.service (fatigue detection — NOT wine)
--   - upsell-analytics.service (measures upsell effectiveness — doesn't generate wine recs)
--   - dynamic-pricing.service (price adjustments — NOT wine recommendations)

DEFINE TABLE IF NOT EXISTS wine_pairing TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON wine_pairing TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON wine_pairing TYPE string;
  -- 'classic_match' | 'contrast_pairing' | 'budget_friendly' | 'premium_upsell' | 'inventory_clearance'
DEFINE FIELD IF NOT EXISTS severity       ON wine_pairing TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS dish_id        ON wine_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dish_name      ON wine_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dish_category  ON wine_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dish_price     ON wine_pairing TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS dish_flavor_profile ON wine_pairing TYPE option<string>;
  -- JSON: {acid: 0-5, fat: 0-5, spice: 0-5, sweet: 0-5, umami: 0-5}
DEFINE FIELD IF NOT EXISTS recommended_wine ON wine_pairing TYPE option<string>;
  -- wine name
DEFINE FIELD IF NOT EXISTS wine_type      ON wine_pairing TYPE option<string>;
  -- 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified'
DEFINE FIELD IF NOT EXISTS wine_varietal  ON wine_pairing TYPE option<string>;
  -- 'cabernet_sauvignon' | 'chardonnay' | 'pinot_noir' | 'sauvignon_blanc' | etc.
DEFINE FIELD IF NOT EXISTS wine_price     ON wine_pairing TYPE option<float>;
DEFINE FIELD IF NOT EXISTS price_tier     ON wine_pairing TYPE option<string>;
  -- 'budget' | 'mid' | 'premium' | 'luxury'
DEFINE FIELD IF NOT EXISTS pairing_score  ON wine_pairing TYPE float DEFAULT 0;
  -- 0-100, how well wine matches dish
DEFINE FIELD IF NOT EXISTS pairing_logic  ON wine_pairing TYPE option<string>;
  -- explanation of why this pairing works
DEFINE FIELD IF NOT EXISTS server_pitch   ON wine_pairing TYPE option<string>;
  -- suggested script for server to pitch wine
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON wine_pairing TYPE float DEFAULT 0;
  -- projected $ from wine sales
DEFINE FIELD IF NOT EXISTS description     ON wine_pairing TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON wine_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON wine_pairing TYPE option<string>;
  -- 'add_to_menu' | 'train_staff' | 'feature_prominently' | 'monitor' | 'bundle_pricing'
DEFINE FIELD IF NOT EXISTS status          ON wine_pairing TYPE string DEFAULT 'open';
  -- 'open' | 'added' | 'trained' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON wine_pairing TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON wine_pairing TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_wp_rule_id   ON wine_pairing FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_wp_severity  ON wine_pairing FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_wp_status    ON wine_pairing FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_wp_dish      ON wine_pairing FIELDS dish_id;

-- Settings
DEFINE FIELD IF NOT EXISTS wine_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS wine_default_price_tier ON settings TYPE option<string> DEFAULT 'mid';
  -- 'budget' | 'mid' | 'premium' | 'luxury'
DEFINE FIELD IF NOT EXISTS wine_pairing_threshold ON settings TYPE option<float> DEFAULT 70;
  -- min pairing score to recommend (0-100)
DEFINE FIELD IF NOT EXISTS wine_upsell_target_pct ON settings TYPE option<float> DEFAULT 0.50;
  -- target wine price = 50% of dish price
