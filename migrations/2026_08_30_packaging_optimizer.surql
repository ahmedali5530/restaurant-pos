-- Migration: 2026_08_30_packaging_optimizer.surql
--
-- AI Takeout Packaging Optimizer — 59th POSR-exclusive differentiator.
--
-- Research finding: Takeout/delivery packaging costs restaurants $300-1,200/mo
-- per location (Restaurant Business, FoodService Director). 15-25% is wasted on
-- oversized containers, wrong materials, and missed consolidation. Types of
-- waste:
--   - Oversized containers (large box for 1 small item = 3x material cost)
--   - Wrong material for temperature (hot food in thin bag = complaint + remake)
--   - Spill/leak risk (soups/sauces in non-sealed = ruined order + refund)
--   - Split bundles (3 items in 3 boxes when 1 combo box works)
--   - Plastic overuse (eco liability + bans in 12+ US cities)
--   - Cost overrun (packaging > 8% of order value)
--   - Missed bulk discounts (frequent SKUs bought at retail)
--   - Damage history (items with prior damage complaints need sturdier packaging)
--
-- POSR's existing services cover DIFFERENT operational areas:
--   - waste-tracking.service = FOOD waste (kitchen prep overproduction)
--   - delivery-analytics.service = delivery PERFORMANCE metrics (time/accuracy)
--   - delivery-route.service = route/driver OPTIMIZATION (not packaging)
--   - spoilage-prediction.service = ingredient SHELF-LIFE prediction
--   - food-cost-trend.service = ingredient COST trends (not packaging)
--   - recipe-optimization.service = recipe ingredient optimization
--
-- This new service optimizes TAKEOUT PACKAGING selection per order: right-sizing,
-- material matching, spill prevention, consolidation, eco-upgrade, and bulk
-- procurement — a pure packaging-cost-and-quality optimizer.

DEFINE TABLE IF NOT EXISTS packaging_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON packaging_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON packaging_recommendation TYPE string;
  -- 'oversized_container' | 'wrong_material_temp' | 'spill_risk_mismatch' |
  -- 'bundle_split' | 'eco_upgrade' | 'cost_overrun' | 'bulk_discount_missed' |
  -- 'damaged_history'
DEFINE FIELD IF NOT EXISTS severity        ON packaging_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS order_id        ON packaging_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name       ON packaging_recommendation TYPE string;
  -- dish / item that triggered the recommendation
DEFINE FIELD IF NOT EXISTS current_packaging ON packaging_recommendation TYPE string;
  -- e.g. 'large_box', 'paper_bag', 'plastic_clamshell'
DEFINE FIELD IF NOT EXISTS suggested_packaging ON packaging_recommendation TYPE string;
  -- e.g. 'small_box', 'insulated_bag', 'leakproof_container'
DEFINE FIELD IF NOT EXISTS order_count_30d ON packaging_recommendation TYPE option<int>;
  -- how many similar orders in last 30 days (frequency for savings calc)
DEFINE FIELD IF NOT EXISTS current_unit_cost ON packaging_recommendation TYPE float DEFAULT 0;
  -- $ per current container
DEFINE FIELD IF NOT EXISTS suggested_unit_cost ON packaging_recommendation TYPE float DEFAULT 0;
  -- $ per suggested container
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON packaging_recommendation TYPE float DEFAULT 0;
  -- projected $ saved per month if recommendation adopted
DEFINE FIELD IF NOT EXISTS eco_score_delta ON packaging_recommendation TYPE option<int>;
  -- -100 to +100, positive = greener
DEFINE FIELD IF NOT EXISTS spill_risk      ON packaging_recommendation TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS temp_issue      ON packaging_recommendation TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS est_loss        ON packaging_recommendation TYPE float DEFAULT 0;
  -- monthly cost of NOT adopting (waste + remake + refund exposure)
DEFINE FIELD IF NOT EXISTS description     ON packaging_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON packaging_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON packaging_recommendation TYPE option<string>;
  -- 'adopt_now' | 'pilot_2_weeks' | 'bulk_purchase' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON packaging_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'adopted' | 'piloting' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON packaging_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON packaging_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_packaging_rule      ON packaging_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_packaging_status    ON packaging_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_packaging_severity  ON packaging_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_packaging_item      ON packaging_recommendation FIELDS item_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS packaging_ai_enabled            ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS packaging_cost_pct_threshold    ON settings TYPE option<float> DEFAULT 8.0;
  -- flag orders where packaging > 8% of order value
DEFINE FIELD IF NOT EXISTS packaging_bulk_threshold        ON settings TYPE option<int> DEFAULT 50;
  -- SKU bought >= 50 times/month qualifies for bulk contract
DEFINE FIELD IF NOT EXISTS packaging_eco_target_pct       ON settings TYPE option<float> DEFAULT 40.0;
  -- target % of compostable/recyclable packaging
