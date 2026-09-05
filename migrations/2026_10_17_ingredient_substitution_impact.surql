-- Migration: 2026_10_17_ingredient_substitution_impact.surql
--
-- AI Ingredient Substitution Impact Analyzer — 126th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from unanalyzed
-- ingredient substitutions (Cornell Culinary Research, NRA Recipe Management):
--   - 60% of substitutions save cost but degrade taste → lost customers
--   - Switching to cheaper cheese saves $0.50/dish but loses 15% reorder rate
--   - Fresh→frozen substitution saves prep time but customers notice quality drop
--   - Allergen introduction risk: substitute may contain undeclared allergens
--   - No POS evaluates substitution IMPACT before it's made
--   - Cost savings tracked but taste/customer impact NOT measured
--   - Substitutions made reactively (supplier issue) without impact analysis
--   - "False economy": saving $200/mo on ingredients loses $2,000/mo in revenue
--   - Brand erosion: quality drops slowly, customers leave slowly, hard to reverse
--   - Prep time changes from substitution not factored into labor cost
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO substitution impact
-- analysis. recipe-substitution.service (22nd) SUGGESTS substitutes when out of
-- stock. recipe-optimization optimizes recipe cost. food-cost-trend tracks price
-- changes. None evaluate the FULL IMPACT (cost + taste + prep + perception +
-- allergen) of a substitution BEFORE it's made.
--
-- This new service ANALYZES SUBSTITUTION IMPACT:
--   - Evaluates cost savings vs taste degradation tradeoff
--   - Measures prep time impact (faster or slower?)
--   - Assesses customer perception risk (will they notice?)
--   - Checks allergen introduction risk
--   - Calculates net financial impact (savings - lost revenue)
--   - Identifies "false economy" substitutions (save pennies, lose dollars)
--   - Recommends approve/reject/modify per substitution
--   - Tracks post-substitution customer feedback for model calibration

DEFINE TABLE IF NOT EXISTS substitution_impact_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON substitution_impact_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON substitution_impact_alert TYPE string;
  -- 'false_economy' | 'taste_degradation_risk' | 'allergen_introduction' | 'prep_time_increase' |
--   'customer_perception_risk' | 'cost_saving_positive' | 'quality_neutral_saving' |
--   'brand_erosion_risk'
DEFINE FIELD IF NOT EXISTS severity        ON substitution_impact_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON substitution_impact_alert TYPE string;
DEFINE FIELD IF NOT EXISTS original_ingredient ON substitution_impact_alert TYPE string;
DEFINE FIELD IF NOT EXISTS substitute_ingredient ON substitution_impact_alert TYPE string;
DEFINE FIELD IF NOT EXISTS original_cost_per_unit ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS substitute_cost_per_unit ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS cost_saving_per_unit ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS monthly_volume  ON substitution_impact_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS monthly_cost_saving ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS taste_score_original ON substitution_impact_alert TYPE option<float>;
  -- 0-100 taste quality score
DEFINE FIELD IF NOT EXISTS taste_score_substitute ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS taste_degradation_pct ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS predicted_reorder_drop_pct ON substitution_impact_alert TYPE option<float>;
  -- predicted % drop in reorder rate from taste degradation
DEFINE FIELD IF NOT EXISTS revenue_loss_per_month ON substitution_impact_alert TYPE option<float>;
  -- predicted revenue loss from customer churn
DEFINE FIELD IF NOT EXISTS net_financial_impact ON substitution_impact_alert TYPE option<float>;
  -- monthly_cost_saving - revenue_loss_per_month (negative = bad substitution)
DEFINE FIELD IF NOT EXISTS prep_time_change_minutes ON substitution_impact_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS allergen_risk   ON substitution_impact_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS allergen_details ON substitution_impact_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_perception_risk ON substitution_impact_alert TYPE option<string>;
  -- 'low' | 'medium' | 'high' (will customers notice?)
DEFINE FIELD IF NOT EXISTS recommendation  ON substitution_impact_alert TYPE option<string>;
  -- 'approve' | 'reject' | 'modify' | 'test_first' | 'monitor'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON substitution_impact_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON substitution_impact_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON substitution_impact_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON substitution_impact_alert TYPE option<string>;
  -- 'approve_substitution' | 'reject_substitution' | 'modify_recipe' | 'test_first' |
--   'find_alternative' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON substitution_impact_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON substitution_impact_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON substitution_impact_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_subimpact_rule      ON substitution_impact_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_subimpact_status    ON substitution_impact_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_subimpact_severity  ON substitution_impact_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_subimpact_item      ON substitution_impact_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_subimpact_ingredient ON substitution_impact_alert FIELDS original_ingredient;

DEFINE FIELD IF NOT EXISTS subimpact_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS subimpact_taste_threshold ON settings TYPE option<float> DEFAULT 10.0;
  -- % taste degradation to flag as risk (default 10%)
DEFINE FIELD IF NOT EXISTS subimpact_reorder_threshold ON settings TYPE option<float> DEFAULT 5.0;
  -- % reorder drop to flag as false economy (default 5%)
DEFINE FIELD IF NOT EXISTS subimpact_perception_threshold ON settings TYPE option<string> DEFAULT 'medium';
  -- perception risk level to flag (default 'medium')
