-- Migration: 2026_10_16_journey_friction.surql
--
-- AI Customer Journey Friction Point Detector — 125th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-2,000/mo per location from customer
-- journey friction points going undetected (Cornell Service Design, NRA CX):
--   - 80% of customer complaints trace to journey friction, not food quality
--   - Friction at any stage taints the ENTIRE experience (peak-end rule)
--   - Arrival friction: long wait to be greeted → sets negative tone
--   - Seating friction: table not ready despite reservation → broken promise
--   - Ordering friction: menu too complex, no server available → frustration
--   - Eating friction: food delayed, wrong order, cold food → core failure
--   - Payment friction: waiting for check, terminal issues → bad last impression
--   - Departure friction: slow goodbye, no farewell → experience ends cold
--   - No POS maps the in-restaurant journey stage-by-stage for friction
--   - Friction hidden in aggregate "satisfaction" scores (which stage?)
--   - Stage-specific interventions unknown (can't fix what you can't locate)
--   - Friction compounds: arrival delay → rushed ordering → wrong order
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO in-restaurant journey
-- friction analysis. journey.service (existing) tracks LIFECYCLE stages
-- (awareness→repeat→loyal). wait-experience-personalizer personalizes wait.
-- table-turnover-velocity decomposes turnover into phases. None detect FRICTION
-- POINTS across the full in-restaurant journey with stage-specific intervention
-- recommendations.
--
-- This new service DETECTS CUSTOMER JOURNEY FRICTION POINTS:
--   - Maps 6 in-restaurant journey stages (arrival→seating→ordering→eating→payment→departure)
--   - Measures friction score per stage (delays, errors, complaints)
--   - Identifies highest-friction stage (the bottleneck experience)
--   - Detects friction chains (friction at one stage cascading to next)
--   - Tracks friction by time-of-day and party characteristics
--   - Recommends stage-specific process improvements
--   - Calculates revenue impact per friction point
--   - Tracks friction resolution effectiveness

DEFINE TABLE IF NOT EXISTS journey_friction_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON journey_friction_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON journey_friction_alert TYPE string;
  -- 'arrival_friction' | 'seating_friction' | 'ordering_friction' |
--   'eating_friction' | 'payment_friction' | 'departure_friction' |
--   'friction_chain' | 'peak_friction_stage'
DEFINE FIELD IF NOT EXISTS severity        ON journey_friction_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS journey_stage   ON journey_friction_alert TYPE string;
  -- 'arrival' | 'seating' | 'ordering' | 'eating' | 'payment' | 'departure'
DEFINE FIELD IF NOT EXISTS friction_score  ON journey_friction_alert TYPE option<float>;
  -- 0-100 (higher = more friction)
DEFINE FIELD IF NOT EXISTS stage_benchmark ON journey_friction_alert TYPE option<float>;
  -- expected friction score for this stage
DEFINE FIELD IF NOT EXISTS friction_gap     ON journey_friction_alert TYPE option<float>;
  -- actual - benchmark (positive = excessive friction)
DEFINE FIELD IF NOT EXISTS avg_stage_time  ON journey_friction_alert TYPE option<float>;
  -- avg minutes spent in this stage
DEFINE FIELD IF NOT EXISTS optimal_stage_time ON journey_friction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS complaint_count ON journey_friction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS error_count     ON journey_friction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS customers_affected ON journey_friction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS time_of_day     ON journey_friction_alert TYPE option<string>;
  -- 'breakfast' | 'lunch' | 'dinner' | 'late_night'
DEFINE FIELD IF NOT EXISTS is_peak_hour    ON journey_friction_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS friction_type   ON journey_friction_alert TYPE option<string>;
  -- 'delay' | 'error' | 'confusion' | 'rudeness' | 'equipment' | 'staffing'
DEFINE FIELD IF NOT EXISTS chained_from_stage ON journey_friction_alert TYPE option<string>;
  -- if friction cascaded from a previous stage
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON journey_friction_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON journey_friction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON journey_friction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON journey_friction_alert TYPE option<string>;
  -- 'streamline_process' | 'add_staff' | 'add_equipment' | 'simplify_menu' |
--   'mobile_payment' | 'staff_training' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON journey_friction_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON journey_friction_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON journey_friction_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_journeyfriction_rule      ON journey_friction_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_journeyfriction_status    ON journey_friction_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_journeyfriction_severity  ON journey_friction_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_journeyfriction_stage     ON journey_friction_alert FIELDS journey_stage;
DEFINE INDEX IF NOT EXISTS idx_journeyfriction_time      ON journey_friction_alert FIELDS time_of_day;

DEFINE FIELD IF NOT EXISTS journeyfriction_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS journeyfriction_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- friction gap to flag as significant (default 30 points above benchmark)
DEFINE FIELD IF NOT EXISTS journeyfriction_chain_threshold ON settings TYPE option<int> DEFAULT 2;
  -- min chained stages to flag friction chain (default 2)
DEFINE FIELD IF NOT EXISTS journeyfriction_peak_multiplier ON settings TYPE option<float> DEFAULT 2.0;
  -- revenue multiplier for peak-hour friction (default 2x)
