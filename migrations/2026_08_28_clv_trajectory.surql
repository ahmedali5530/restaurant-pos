-- Migration: 2026_08_28_clv_trajectory.surql
--
-- AI Customer Lifetime Value Trajectory — 19th POSR-exclusive differentiator.
--
-- Research finding: Restaurants don't know which customers are GROWING vs
-- DECLINING in value until they've already churned. Toast, Square, Lightspeed
-- have point-in-time CLV (snapshot) but NO trend analysis. POSR computes
-- CLV trajectory (direction + velocity) + AI intervention recommendations.
--
-- Distinct from:
--   - clv.service (computes current CLV snapshot)
--   - churn.service (predicts AT-RISK customers before they leave)
--   - winback.service (targets customers who ALREADY LEFT)
-- This service predicts the DIRECTION + VELOCITY of CLV change for active
-- customers — surfaces declining customers BEFORE they become at-risk.
--
-- Algorithm:
--   1. For each customer, compute CLV in 3 windows: 0-30d, 31-60d, 61-90d
--   2. Linear regression slope = velocity ($/month change)
--   3. Trajectory classification:
--      - 'accelerating': slope > +20%/month (growing fast)
--      - 'growing': slope > 0 (positive trend)
--      - 'stable': |slope| < 10% (steady)
--      - 'declining': slope < 0 (slipping)
--      - 'churning': slope < -30%/month (about to leave)
--   4. Projected CLV (next 90d) = current_clv + (slope × 3)
--   5. AI intervention: nurture | upsell | retain | investigate | reward

DEFINE TABLE IF NOT EXISTS clv_trajectory TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON clv_trajectory TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer        ON clv_trajectory TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON clv_trajectory TYPE string;
DEFINE FIELD IF NOT EXISTS current_clv     ON clv_trajectory TYPE float;
  -- CLV from last 90 days
DEFINE FIELD IF NOT EXISTS clv_30d        ON clv_trajectory TYPE float;
  -- CLV in last 30 days
DEFINE FIELD IF NOT EXISTS clv_31_60d      ON clv_trajectory TYPE float;
  -- CLV in 31-60 days ago
DEFINE FIELD IF NOT EXISTS clv_61_90d      ON clv_trajectory TYPE float;
  -- CLV in 61-90 days ago
DEFINE FIELD IF NOT EXISTS slope_per_month  ON clv_trajectory TYPE float;
  -- $/month velocity (linear regression)
DEFINE FIELD IF NOT EXISTS trajectory       ON clv_trajectory TYPE string;
  -- 'accelerating' | 'growing' | 'stable' | 'declining' | 'churning'
DEFINE FIELD IF NOT EXISTS projected_clv_90d ON clv_trajectory TYPE float;
  -- projected CLV in next 90 days
DEFINE FIELD IF NOT EXISTS projected_change_pct ON clv_trajectory TYPE float;
  -- % change projected
DEFINE FIELD IF NOT EXISTS visit_frequency_change_pct ON clv_trajectory TYPE float;
  -- % change in visit frequency (0-30d vs 31-60d)
DEFINE FIELD IF NOT EXISTS avg_check_change_pct ON clv_trajectory TYPE float;
  -- % change in avg check
DEFINE FIELD IF NOT EXISTS data_points      ON clv_trajectory TYPE int DEFAULT 0;
  -- # orders used for analysis
DEFINE FIELD IF NOT EXISTS ai_insight      ON clv_trajectory TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_intervention ON clv_trajectory TYPE option<string>;
  -- 'nurture' | 'upsell' | 'retain' | 'investigate' | 'reward'
DEFINE FIELD IF NOT EXISTS action_taken    ON clv_trajectory TYPE string DEFAULT 'none';
  -- 'none' | 'nurtured' | 'upsold' | 'retained' | 'investigated' | 'rewarded'
DEFINE FIELD IF NOT EXISTS analyzed_at      ON clv_trajectory TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id        ON clv_trajectory TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_ct_customer   ON clv_trajectory FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_ct_trajectory  ON clv_trajectory FIELDS trajectory;
DEFINE INDEX IF NOT EXISTS idx_ct_action     ON clv_trajectory FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_ct_analyzed    ON clv_trajectory FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS clvtraj_ai_enabled           ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS clvtraj_min_orders           ON settings TYPE option<int>   DEFAULT 3;
  -- need 3+ orders in 90d for analysis
DEFINE FIELD IF NOT EXISTS clvtraj_accelerating_threshold ON settings TYPE option<float> DEFAULT 0.20;
  -- slope > +20%/month = accelerating
DEFINE FIELD IF NOT EXISTS clvtraj_churning_threshold    ON settings TYPE option<float> DEFAULT -0.30;
  -- slope < -30%/month = churning
DEFINE FIELD IF NOT EXISTS clvtraj_stable_threshold     ON settings TYPE option<float> DEFAULT 0.10;
  -- |slope| < 10% = stable
DEFINE FIELD IF NOT EXISTS clvtraj_max_results          ON settings TYPE option<int>   DEFAULT 50;
  -- cap at 50 trajectories per analysis
