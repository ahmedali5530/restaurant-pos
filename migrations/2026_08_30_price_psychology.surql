-- Migration: 2026_08_30_price_psychology.surql
--
-- AI Menu Price Psychology Optimizer — 70th POSR-exclusive differentiator.
--
-- Research finding: Behavioral economics drives 15-30% of menu order decisions
-- (Cornell School of Hotel Administration menu psychology studies). Specific
-- effects proven in restaurant settings:
--   - Charm pricing ($9.99 vs $10): 24% higher sales (MIT pricing study)
--   - Price anchoring (showing $50 steak makes $25 chicken seem reasonable)
--   - Decoy effect (adding a $40 medium makes $30 small look like a deal)
--   - Menu position: top-right quadrant items sell 30% more (eye-tracking studies)
--   - Removing $ signs: "10" sells more than "$10.00" (Cornell)
--   - Bracketing: 3 price tiers (good/better/best) shifts avg to middle
--
-- Toast, Square, Lightspeed have NO price psychology features.
-- POSR's price-elasticity.service computes demand response to price CHANGES.
-- dynamic-pricing.service creates time-based DISCOUNT rules.
-- Neither applies BEHAVIORAL ECONOMICS to existing prices without changing margins.
--
-- Distinct from:
--   - price-elasticity.service (computes elasticity COEFFICIENT — NOT psychology)
--   - dynamic-pricing.service (time-based DISCOUNTS — NOT behavioral pricing)
--   - peak-pricing.service (surge pricing by demand — NOT psychology)
--   - menu-optimization.service (BCG matrix classification — NOT pricing)
--   - dish-profitability.service (cost breakdown — NOT pricing psychology)

DEFINE TABLE IF NOT EXISTS price_psychology TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON price_psychology TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON price_psychology TYPE string;
  -- 'charm_pricing' | 'price_anchor' | 'decoy_effect' | 'position_optimize' | 'bracketing'
DEFINE FIELD IF NOT EXISTS severity       ON price_psychology TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS dish_id        ON price_psychology TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dish_name      ON price_psychology TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_price  ON price_psychology TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS suggested_price ON price_psychology TYPE option<float>;
DEFINE FIELD IF NOT EXISTS price_change_type ON price_psychology TYPE option<string>;
  -- 'charm_round_down' | 'anchor_high' | 'decoy_add' | 'reposition' | 'bracket_middle'
DEFINE FIELD IF NOT EXISTS psychology_effect ON price_psychology TYPE option<string>;
  -- explanation of the effect
DEFINE FIELD IF NOT EXISTS est_sales_lift_pct ON price_psychology TYPE float DEFAULT 0;
  -- projected % increase in orders
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON price_psychology TYPE float DEFAULT 0;
  -- projected $ increase
DEFINE FIELD IF NOT EXISTS margin_impact   ON price_psychology TYPE float DEFAULT 0;
  -- $ margin change (usually 0 or positive — charm pricing rounds DOWN but sells MORE)
DEFINE FIELD IF NOT EXISTS current_position ON price_psychology TYPE option<int>;
  -- menu position (1=top)
DEFINE FIELD IF NOT EXISTS suggested_position ON price_psychology TYPE option<int>;
DEFINE FIELD IF NOT EXISTS ab_test_suggested ON price_psychology TYPE option<bool>;
  -- true if A/B test recommended before full rollout
DEFINE FIELD IF NOT EXISTS description     ON price_psychology TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON price_psychology TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON price_psychology TYPE option<string>;
  -- 'apply_now' | 'ab_test_first' | 'monitor' | 'combine_with_anchor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON price_psychology TYPE string DEFAULT 'open';
  -- 'open' | 'applied' | 'testing' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON price_psychology TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON price_psychology TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pp_rule_id   ON price_psychology FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_pp_severity  ON price_psychology FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_pp_status    ON price_psychology FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_pp_dish      ON price_psychology FIELDS dish_id;

-- Settings
DEFINE FIELD IF NOT EXISTS price_psych_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS price_psych_charm_enabled    ON settings TYPE option<bool>  DEFAULT true;
  -- enable charm pricing ($X.99)
DEFINE FIELD IF NOT EXISTS price_psych_anchor_count     ON settings TYPE option<int>   DEFAULT 1;
  -- number of high-price anchor items to suggest
DEFINE FIELD IF NOT EXISTS price_psych_ab_test_duration ON settings TYPE option<int>   DEFAULT 7;
  -- A/B test duration in days
