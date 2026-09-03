-- Migration: 2026_08_30_retention_program.surql
--
-- AI Staff Retention Program Builder — 73rd POSR-exclusive differentiator.
--
-- Research finding: Restaurant industry has 75% annual turnover — highest of
-- any industry (BLS). Each lost employee costs $5,864 (Cornell CHR). Yet most
-- restaurants react to departures instead of proactively building retention
-- programs. 50% of employees who quit cite "lack of growth opportunity" and
-- "feeling undervalued" as top reasons (Gallup restaurant workforce study).
--
-- Toast, Square, Lightspeed have NO retention program features.
-- POSR's staff-turnover.service PREDICTS who will leave but doesn't BUILD
-- retention programs. gamification.service motivates via competition but
-- doesn't address individual retention needs. schedule-preference.service
-- learns preferences but doesn't create career development plans.
--
-- Distinct from:
--   - staff-turnover.service (PREDICTS departure risk — doesn't build programs)
--   - gamification.service (competition-based motivation — NOT individualized retention)
--   - schedule-preference.service (learns scheduling prefs — NOT career development)
--   - training-need.service (identifies skill gaps — NOT retention programs)
--   - server-coach.service (skill matrix + coaching — NOT retention strategy)
--
-- This service builds personalized retention programs per high-risk employee:
-- career path planning, compensation review, recognition programs, work-life
-- balance adjustments, and mentorship matching.

DEFINE TABLE IF NOT EXISTS retention_program TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON retention_program TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON retention_program TYPE string;
  -- 'career_path' | 'compensation_review' | 'recognition_gap' | 'worklife_balance' | 'mentorship_match'
DEFINE FIELD IF NOT EXISTS severity       ON retention_program TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_id        ON retention_program TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_name      ON retention_program TYPE option<string>;
DEFINE FIELD IF NOT EXISTS turnover_risk   ON retention_program TYPE float DEFAULT 0;
  -- 0-1, from staff-turnover.service
DEFINE FIELD IF NOT EXISTS tenure_months  ON retention_program TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS program_type    ON retention_program TYPE string;
  -- 'career_path' | 'compensation' | 'recognition' | 'worklife' | 'mentorship'
DEFINE FIELD IF NOT EXISTS program_actions ON retention_program TYPE option<string>;
  -- JSON: array of specific actions with timeline
DEFINE FIELD IF NOT EXISTS est_retention_probability ON retention_program TYPE float DEFAULT 0;
  -- 0-1, probability of retaining this employee if program is followed
DEFINE FIELD IF NOT EXISTS est_cost       ON retention_program TYPE float DEFAULT 0;
  -- cost of retention program (raises, training, etc.)
DEFINE FIELD IF NOT EXISTS est_replacement_cost ON retention_program TYPE float DEFAULT 0;
  -- cost if employee leaves ($5,864 industry avg per Cornell)
DEFINE FIELD IF NOT EXISTS est_roi        ON retention_program TYPE float DEFAULT 0;
  -- (replacement_cost - program_cost) / program_cost
DEFINE FIELD IF NOT EXISTS mentor_assigned ON retention_program TYPE option<string>;
  -- mentor staff name for mentorship programs
DEFINE FIELD IF NOT EXISTS review_date    ON retention_program TYPE option<datetime>;
  -- when to review retention progress
DEFINE FIELD IF NOT EXISTS description     ON retention_program TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON retention_program TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON retention_program TYPE option<string>;
  -- 'implement_now' | 'schedule_review' | 'escalate_to_owner' | 'monitor' | 'accept_departure'
DEFINE FIELD IF NOT EXISTS status          ON retention_program TYPE string DEFAULT 'open';
  -- 'open' | 'in_progress' | 'retained' | 'departed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON retention_program TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON retention_program TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rp_rule_id   ON retention_program FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_rp_severity  ON retention_program FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_rp_status    ON retention_program FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_rp_staff     ON retention_program FIELDS staff_id;

-- Settings
DEFINE FIELD IF NOT EXISTS retention_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS retention_risk_threshold   ON settings TYPE option<float> DEFAULT 0.60;
  -- trigger retention program when turnover risk > 60%
DEFINE FIELD IF NOT EXISTS retention_replacement_cost ON settings TYPE option<float> DEFAULT 5864;
  -- Cornell CHR average replacement cost
DEFINE FIELD IF NOT EXISTS retention_program_budget   ON settings TYPE option<float> DEFAULT 500;
  -- max budget per retention program
