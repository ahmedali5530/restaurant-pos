-- Migration: 2026_08_29_allergen_risk.surql
--
-- AI Allergen Cross-Contamination Risk Detector — 46th POSR-exclusive differentiator.
--
-- Research finding: 32M Americans have food allergies; 200+ die annually from
-- anaphylaxis (FDA, AAAAI). Restaurants face $1M+ liability per allergen incident.
-- Toast, Square, Lightspeed tag allergens per dish but DO NOT detect cross-
-- contamination risk WHEN MULTIPLE DISHES share a table, prep station, or order.
--
-- Critical scenarios POSR detects (no competitor does):
--   1. MIXED-ORDER RISK — table orders both nut-free + nut-containing dishes
--      → kitchen must prepare on separate surfaces, change gloves
--   2. SHARED-UTENSIL RISK — dishes likely to share tongs/spatulas
--      (e.g. fried items with different coatings)
--   3. DEEP-FRYER CROSS-CONTAMINATION — breaded + unbattered items same fryer
--   4. UNKNOWN-ALLERGEN — customer allergy not recorded but dish contains it
--   5. REPEAT-OFFENDER — same dish triggers alerts repeatedly (recipe issue)
--
-- Distinct from:
--   - food-safety.service (HACCP temperature logs — NOT allergen-specific)
--   - recipe-substitution.service (ingredient substitutions — not allergen risk)
--   - food-cost-trend.service (price trends — not allergens)
--   - menu-optimization.service (BCG matrix — not allergen cross-contamination)
--   - recipe-optimization.service (recipe cost reduction — not safety)
--
-- This service detects ALLERGEN CROSS-CONTAMINATION risks per order/table.

DEFINE TABLE IF NOT EXISTS allergen_risk_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON allergen_risk_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON allergen_risk_alert TYPE string;
  -- 'mixed_order_risk' | 'shared_utensil_risk' | 'deep_fryer_risk' | 'unknown_allergen' | 'repeat_offender'
DEFINE FIELD IF NOT EXISTS severity       ON allergen_risk_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS order_id        ON allergen_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS table_name     ON allergen_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_name    ON allergen_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS allergens      ON allergen_risk_alert TYPE string;
  -- comma-separated allergen list (e.g. "peanut,tree_nut,dairy")
DEFINE FIELD IF NOT EXISTS affected_items ON allergen_risk_alert TYPE string;
  -- comma-separated dish names at risk
DEFINE FIELD IF NOT EXISTS risk_count     ON allergen_risk_alert TYPE int DEFAULT 1;
  -- number of dishes involved
DEFINE FIELD IF NOT EXISTS customer_allergy ON allergen_risk_alert TYPE option<string>;
  -- if known, customer's stated allergy
DEFINE FIELD IF NOT EXISTS preparation_note ON allergen_risk_alert TYPE option<string>;
  -- suggested prep note for kitchen (e.g. "separate prep surface")
DEFINE FIELD IF NOT EXISTS detected_at_order_time ON allergen_risk_alert TYPE option<bool>;
  -- true if detected at order placement (not post-hoc analysis)
DEFINE FIELD IF NOT EXISTS description     ON allergen_risk_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON allergen_risk_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON allergen_risk_alert TYPE option<string>;
  -- 'separate_prep' | 'change_gloves' | 'clean_fryer' | 'inform_customer' | 'decline_dish' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON allergen_risk_alert TYPE string DEFAULT 'open';
  -- 'open' | 'mitigated' | 'declined_dish' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON allergen_risk_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON allergen_risk_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ara_rule_id   ON allergen_risk_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ara_severity  ON allergen_risk_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ara_status    ON allergen_risk_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ara_order    ON allergen_risk_alert FIELDS order_id;

-- Settings
DEFINE FIELD IF NOT EXISTS allergen_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS allergen_lookback_days    ON settings TYPE option<int>   DEFAULT 7;
DEFINE FIELD IF NOT EXISTS allergen_repeat_threshold ON settings TYPE option<int>   DEFAULT 3;
  -- dish triggers 3+ alerts in window = repeat offender
DEFINE FIELD IF NOT EXISTS allergen_known_list      ON settings TYPE option<string> DEFAULT 'peanut,tree_nut,dairy,gluten,shellfish,egg,soy,sesame,fish';
  -- CSV list of allergens POSR detects
