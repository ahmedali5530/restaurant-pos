-- Migration: 2026_09_21_hiring_predictor.surql
--
-- AI Restaurant Staff Hiring Predictor — 100th POSR-exclusive differentiator.
--
-- Research finding: Restaurants have 75% annual turnover (NRA) — highest of
-- any industry. Bad hires cost $3,000-5,000 each (recruiting + training +
-- lost productivity + replacement). 60% of new hires leave within 90 days
-- (Cornell hospitality). Hiring is the #1 pain point for restaurant operators.
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO hiring tools.
-- Third-party hiring platforms (Indeed, ZipRecruiter, Snagajob) charge
-- $200-500/mo per location and are generic — not restaurant-specific, don't
-- predict candidate success, don't learn from your existing top performers.
--
-- POSR's existing staff services:
--   - staff-turnover.service = PREDICTS who will leave (existing staff) — NOT
--     hiring prediction for new candidates
--   - retention-program.service = RETAINS existing staff — NOT hiring
--   - compensation-optimizer.service = OPTIMIZES pay for existing staff — NOT
--     hiring decisions
--   - training-need.service = IDENTIFIES training gaps — NOT hiring fit
--   - server-coach.service = COACHES existing staff — NOT candidate screening
--   - staff-gamification.service = MOTIVATES existing staff — NOT hiring
--
-- This new service PREDICTS HIRING SUCCESS:
--   - Analyzes profiles of current top performers (what makes them successful)
--   - Scores candidates against the "success profile" (0-100)
--   - Predicts 90-day retention probability
--   - Identifies skill gaps that need training investment
--   - Estimates training cost + time-to-productivity
--   - Flags salary expectation mismatches
--   - Checks availability during peak hours (critical for restaurants)
--   - Recommends hire/no-hire/monitor decisions

DEFINE TABLE IF NOT EXISTS hiring_prediction_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON hiring_prediction_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON hiring_prediction_alert TYPE string;
  -- 'success_profile_match' | 'retention_risk_high' | 'skill_gap_identified' |
--   'salary_mismatch' | 'peak_availability_gap' | 'training_cost_high' |
--   'cultural_fit_concern' | 'experience_overqualified'
DEFINE FIELD IF NOT EXISTS severity        ON hiring_prediction_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS candidate_name  ON hiring_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS role_applied    ON hiring_prediction_alert TYPE string;
  -- 'server' | 'cook' | 'bartender' | 'host' | 'manager' | 'dishwasher'
DEFINE FIELD IF NOT EXISTS success_score   ON hiring_prediction_alert TYPE option<int>;
  -- 0-100 match against top performer profile
DEFINE FIELD IF NOT EXISTS retention_probability ON hiring_prediction_alert TYPE option<float>;
  -- 0-100% probability of staying 90+ days
DEFINE FIELD IF NOT EXISTS experience_years ON hiring_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS requested_salary ON hiring_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS benchmark_salary ON hiring_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS peak_availability_pct ON hiring_prediction_alert TYPE option<float>;
  -- % of peak hours available (lunch 11-14, dinner 17-21)
DEFINE FIELD IF NOT EXISTS est_training_cost ON hiring_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_training_days ON hiring_prediction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_turnover_cost ON hiring_prediction_alert TYPE option<float>;
  -- $ cost if candidate leaves within 90 days
DEFINE FIELD IF NOT EXISTS description     ON hiring_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON hiring_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON hiring_prediction_alert TYPE option<string>;
  -- 'hire_now' | 'hire_with_training' | 'monitor' | 'reject' | 'negotiate_salary' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON hiring_prediction_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON hiring_prediction_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON hiring_prediction_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_hiring_rule      ON hiring_prediction_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_hiring_status    ON hiring_prediction_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_hiring_severity  ON hiring_prediction_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_hiring_candidate ON hiring_prediction_alert FIELDS candidate_name;

-- Settings
DEFINE FIELD IF NOT EXISTS hiring_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS hiring_min_success_score ON settings TYPE option<int> DEFAULT 65;
  -- minimum success score to recommend hiring (default 65)
DEFINE FIELD IF NOT EXISTS hiring_min_retention_pct ON settings TYPE option<float> DEFAULT 70.0;
  -- minimum 90-day retention probability (default 70%)
DEFINE FIELD IF NOT EXISTS hiring_turnover_cost   ON settings TYPE option<int> DEFAULT 3000;
  -- avg cost per bad hire (default $3,000)
DEFINE FIELD IF NOT EXISTS hiring_training_cost_daily ON settings TYPE option<float> DEFAULT 120.0;
  -- daily training cost per new hire (default $120/day)
