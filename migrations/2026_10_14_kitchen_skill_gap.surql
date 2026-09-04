-- Migration: 2026_10_14_kitchen_skill_gap.surql
--
-- AI Kitchen Staff Skill Gap Analyzer — 123rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-1,500/mo per location from kitchen
-- staff skill gaps going undetected (NRA Workforce, Cornell Kitchen Training):
--   - 60% of kitchen errors stem from specific technique skill gaps
--   - Grill temp control errors cause 30% of meat overcooking complaints
--   - Sauté timing gaps cause inconsistent sauce quality
--   - Plating precision gaps reduce perceived value (Instagram factor)
--   - Knife skill gaps slow prep + increase waste
--   - Fryer management gaps cause inconsistent crispiness
--   - No POS tracks per-technique skill levels for kitchen staff
--   - Training is generic (all-staff) not targeted to specific gaps
--   - Skill gaps hidden in aggregate "performance" metrics
--   - Best technique performers never identified for peer mentoring
--   - Cross-training opportunities (multi-station) not identified
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO kitchen skill gap
-- analysis. training-need.service (23rd) predicts WHO needs training across all
-- staff. server-coach.service (45th) does 5-dimension skill matrix for SERVERS.
-- driver-coach is for delivery drivers. None analyze KITCHEN STAFF technique-
-- level skill gaps with station benchmarking and targeted culinary training.
--
-- This new service ANALYZES KITCHEN STAFF SKILL GAPS:
--   - Tracks per-technique performance (grill temp, sauté timing, plating, knife, fryer)
--   - Benchmarks each staff member against station standards
--   - Identifies specific technique gaps (not just "needs training")
--   - Detects skill deterioration (was good, now declining)
--   - Identifies top performers per technique for peer mentoring
--   - Recommends cross-training opportunities (multi-station potential)
--   - Calculates training ROI per technique gap
--   - Tracks training effectiveness post-intervention

DEFINE TABLE IF NOT EXISTS kitchen_skill_gap_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON kitchen_skill_gap_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON kitchen_skill_gap_alert TYPE string;
  -- 'technique_gap' | 'skill_deterioration' | 'top_performer' | 'cross_training_opportunity' |
--   'station_mismatch' | 'training_roi_positive' | 'peer_mentor_match' | 'skill_stagnation'
DEFINE FIELD IF NOT EXISTS severity        ON kitchen_skill_gap_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_id        ON kitchen_skill_gap_alert TYPE string;
DEFINE FIELD IF NOT EXISTS staff_name      ON kitchen_skill_gap_alert TYPE string;
DEFINE FIELD IF NOT EXISTS station         ON kitchen_skill_gap_alert TYPE string;
  -- 'grill' | 'saute' | 'fry' | 'cold' | 'pastry' | 'expediter'
DEFINE FIELD IF NOT EXISTS technique       ON kitchen_skill_gap_alert TYPE string;
  -- 'temp_control' | 'timing' | 'plating' | 'knife_skills' | 'fryer_mgmt' | 'sauce_emulsification'
DEFINE FIELD IF NOT EXISTS current_skill_score ON kitchen_skill_gap_alert TYPE option<float>;
  -- 0-100 technique score
DEFINE FIELD IF NOT EXISTS benchmark_score ON kitchen_skill_gap_alert TYPE option<float>;
  -- station benchmark for this technique
DEFINE FIELD IF NOT EXISTS skill_gap       ON kitchen_skill_gap_alert TYPE option<float>;
  -- benchmark - current (positive = gap)
DEFINE FIELD IF NOT EXISTS previous_skill_score ON kitchen_skill_gap_alert TYPE option<float>;
  -- for deterioration detection
DEFINE FIELD IF NOT EXISTS error_rate_pct  ON kitchen_skill_gap_alert TYPE option<float>;
  -- % of tasks with errors related to this technique
DEFINE FIELD IF NOT EXISTS tasks_completed ON kitchen_skill_gap_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS avg_task_time   ON kitchen_skill_gap_alert TYPE option<float>;
  -- avg minutes per task
DEFINE FIELD IF NOT EXISTS recommended_training ON kitchen_skill_gap_alert TYPE option<string>;
  -- specific training module recommended
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON kitchen_skill_gap_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON kitchen_skill_gap_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON kitchen_skill_gap_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON kitchen_skill_gap_alert TYPE option<string>;
  -- 'targeted_training' | 'peer_mentoring' | 'cross_train' | 'reassign_station' |
--   'verify_training' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON kitchen_skill_gap_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON kitchen_skill_gap_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON kitchen_skill_gap_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_kitchenskill_rule      ON kitchen_skill_gap_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_kitchenskill_status    ON kitchen_skill_gap_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_kitchenskill_severity  ON kitchen_skill_gap_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_kitchenskill_staff     ON kitchen_skill_gap_alert FIELDS staff_id;
DEFINE INDEX IF NOT EXISTS idx_kitchenskill_station   ON kitchen_skill_gap_alert FIELDS station;
DEFINE INDEX IF NOT EXISTS idx_kitchenskill_technique ON kitchen_skill_gap_alert FIELDS technique;

DEFINE FIELD IF NOT EXISTS kitchenskill_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS kitchenskill_gap_threshold ON settings TYPE option<float> DEFAULT 20.0;
  -- min skill gap (benchmark - current) to flag (default 20 points)
DEFINE FIELD IF NOT EXISTS kitchenskill_deterioration_drop ON settings TYPE option<float> DEFAULT 15.0;
  -- skill score drop to flag deterioration (default 15 points)
DEFINE FIELD IF NOT EXISTS kitchenskill_top_threshold ON settings TYPE option<float> DEFAULT 85.0;
  -- score above which to flag as top performer (default 85)
