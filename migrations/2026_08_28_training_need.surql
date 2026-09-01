-- Migration: 2026_08_28_training_need.surql
--
-- AI Staff Training Need Prediction — 23rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend $1,500-3,000/employee on training
-- but target it REACTIVELY (after mistakes). No POS system PREDICTS which
-- staff need training BEFORE performance drops. Toast, Square, Lightspeed
-- have attendance tracking but NO skill-gap prediction. POSR predicts
-- training needs proactively based on performance trends + error patterns
-- + AI recommends specific training modules.
--
-- Distinct from:
--   - staff-turnover.service (predicts WHO will leave, not skill gaps)
--   - server-performance.service (rates servers, doesn't predict training)
--   - kitchen-bottleneck staff_variance (detects slower staff, doesn't recommend training)
--   - yield-variance staff_variance (identifies inconsistent batches, doesn't suggest training)
--
-- This service predicts TRAINING NEEDS for ACTIVE employees BEFORE mistakes happen.
--
-- Risk factors (8):
--   1. DECLINING_PERFORMANCE  — recent performance notes trending negative (+25)
--   2. HIGH_ERROR_RATE        — kitchen/production errors above team avg (+20)
--   3. SLOW_ITEM_PERFORMANCE   — consistently slow on specific items (+15)
--   4. NEW_POSITION           — recently promoted (transition risk, +15)
--   5. LOW_UTILIZATION        — < 60% scheduled shifts worked (disengaged, +12)
--   6. NO_RECENT_TRAINING      — no training notes in 180+ days (+10)
--   7. PEER_GAP              — performance significantly below team median (+18)
--   8. COMPLAINT_CORRELATION  — customer complaints correlate with this staff (+20)
--
-- AI recommendation: specific_training | cross_training | refresher | mentor_assignment |
--   performance_review | no_action

DEFINE TABLE IF NOT EXISTS training_need_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON training_need_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS employee        ON training_need_prediction TYPE option<record<employee>>;
DEFINE FIELD IF NOT EXISTS employee_name   ON training_need_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS position        ON training_need_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS department      ON training_need_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS tenure_days    ON training_need_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS need_score      ON training_need_prediction TYPE float;
  -- 0-100 (100 = urgent training need)
DEFINE FIELD IF NOT EXISTS need_level      ON training_need_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS risk_factors    ON training_need_prediction TYPE option<object>;
  -- { factor_id: { weight, detail } }
DEFINE FIELD IF NOT EXISTS est_cost_of_inaction ON training_need_prediction TYPE float DEFAULT 0;
  -- estimated $ lost if training not provided (errors + lost customers)
DEFINE FIELD IF NOT EXISTS ai_insight      ON training_need_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON training_need_prediction TYPE option<string>;
  -- 'specific_training' | 'cross_training' | 'refresher' | 'mentor_assignment' |
  -- 'performance_review' | 'no_action'
DEFINE FIELD IF NOT EXISTS action_taken    ON training_need_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'training_scheduled' | 'mentor_assigned' | 'reviewed' | 'trained' | 'dismissed'
DEFINE FIELD IF NOT EXISTS predicted_at    ON training_need_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON training_need_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_tn_employee  ON training_need_prediction FIELDS employee;
DEFINE INDEX IF NOT EXISTS idx_tn_level      ON training_need_prediction FIELDS need_level;
DEFINE INDEX IF NOT EXISTS idx_tn_action    ON training_need_prediction FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_tn_predicted  ON training_need_prediction FIELDS predicted_at;

-- Settings
DEFINE FIELD IF NOT EXISTS training_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS training_lookback_days      ON settings TYPE option<int>   DEFAULT 90;
  -- 90-day lookback for performance analysis
DEFINE FIELD IF NOT EXISTS training_no_training_days  ON settings TYPE option<int>   DEFAULT 180;
  -- no training notes in 180+ days = NO_RECENT_TRAINING
DEFINE FIELD IF NOT EXISTS training_high_need_threshold ON settings TYPE option<float> DEFAULT 65;
  -- need_score >= 65 = 'high'
DEFINE FIELD IF NOT EXISTS training_critical_threshold ON settings TYPE option<float> DEFAULT 85;
  -- need_score >= 85 = 'critical'
DEFINE FIELD IF NOT EXISTS training_peer_gap_pct      ON settings TYPE option<float> DEFAULT 0.25;
  -- performance > 25% below team median = PEER_GAP
