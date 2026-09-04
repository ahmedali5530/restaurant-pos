-- Migration: 2026_10_11_profitability_decay.surql
--
-- AI Menu Item Profitability Decay Tracker — 120th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-2,000/mo per location from undetected
-- profitability decay (Cornell Menu Economics, NRA Cost Management):
--   - 70% of menu items experience profitability decay within 6 months of launch
--   - Ingredient cost inflation erodes margin 2-5% per quarter
--   - Portion creep: servers/hefty-handed prep add 10-15% extra over time
--   - Waste accumulation: trim/waste increases as recipe familiarity drops
--   - Discount creep: promotional discounts never fully removed
--   - No POS tracks profitability TRAJECTORY (only snapshot at launch)
--   - Items profitable at launch silently become loss leaders
--   - "Set and forget" pricing means margins erode without intervention
--   - Compounding decay: multiple small erosions compound into major loss
--   - No early warning system for items approaching unprofitability
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO profitability decay
-- tracking. dish-profitability.service (34th) computes current profitability
-- SNAPSHOT. food-cost-trend.service tracks ingredient cost trends. yield-variance
-- tracks recipe yield. None track the COMPOUND DECAY of per-item profitability
-- from multiple erosion sources over time.
--
-- This new service TRACKS PROFITABILITY DECAY:
--   - Monitors margin trajectory per item (launch → current)
--   - Isolates decay sources (cost inflation, portion creep, waste, discounts)
--   - Alerts when item crosses profitability threshold (A→B→C→D→F)
--   - Projects when item will become unprofitable (decay velocity)
--   - Recommends targeted intervention per decay source
--   - Tracks decay rate trend (accelerating/stable/decelerating)
--   - Identifies items needing price adjustment vs recipe simplification
--   - Flags compounding decay (multiple sources eroding simultaneously)

DEFINE TABLE IF NOT EXISTS profitability_decay_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON profitability_decay_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON profitability_decay_alert TYPE string;
  -- 'margin_erosion' | 'cost_inflation_decay' | 'portion_creep' | 'waste_accumulation' |
--   'discount_creep' | 'threshold_crossing' | 'decay_acceleration' | 'compounding_decay'
DEFINE FIELD IF NOT EXISTS severity        ON profitability_decay_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON profitability_decay_alert TYPE string;
DEFINE FIELD IF NOT EXISTS launch_margin_pct ON profitability_decay_alert TYPE option<float>;
  -- margin % at item launch
DEFINE FIELD IF NOT EXISTS current_margin_pct ON profitability_decay_alert TYPE option<float>;
  -- current margin %
DEFINE FIELD IF NOT EXISTS margin_decay_pct ON profitability_decay_alert TYPE option<float>;
  -- total decay (launch - current)
DEFINE FIELD IF NOT EXISTS decay_sources   ON profitability_decay_alert TYPE option<string>;
  -- comma-separated: 'cost_inflation,portion_creep,waste,discount_creep'
DEFINE FIELD IF NOT EXISTS cost_inflation_pct ON profitability_decay_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS portion_creep_pct ON profitability_decay_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS waste_pct       ON profitability_decay_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS discount_creep_pct ON profitability_decay_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS current_grade   ON profitability_decay_alert TYPE option<string>;
  -- 'A' | 'B' | 'C' | 'D' | 'F'
DEFINE FIELD IF NOT EXISTS previous_grade  ON profitability_decay_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS months_to_unprofitable ON profitability_decay_alert TYPE option<int>;
  -- projected months until margin hits 0
DEFINE FIELD IF NOT EXISTS decay_velocity  ON profitability_decay_alert TYPE option<string>;
  -- 'accelerating' | 'stable' | 'decelerating'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON profitability_decay_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON profitability_decay_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON profitability_decay_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON profitability_decay_alert TYPE option<string>;
  -- 'raise_price' | 'reduce_portion' | 'renegotiate_supplier' | 'simplify_recipe' |
--   'remove_discount' | 'remove_item' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON profitability_decay_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON profitability_decay_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON profitability_decay_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_profdecay_rule      ON profitability_decay_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_profdecay_status    ON profitability_decay_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_profdecay_severity  ON profitability_decay_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_profdecay_item      ON profitability_decay_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_profdecay_grade     ON profitability_decay_alert FIELDS current_grade;

DEFINE FIELD IF NOT EXISTS profdecay_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS profdecay_erosion_threshold ON settings TYPE option<float> DEFAULT 5.0;
  -- % margin decay to flag as significant (default 5%)
DEFINE FIELD IF NOT EXISTS profdecay_critical_grade ON settings TYPE option<string> DEFAULT 'D';
  -- grade at which to flag as critical (default D)
DEFINE FIELD IF NOT EXISTS profdecay_unprofitable_window ON settings TYPE option<int> DEFAULT 6;
  -- months to unprofitable to flag as urgent (default 6)
