-- Migration: 2026_09_04_schedule_conflict_resolver.surql
--
-- AI Staff Schedule Conflict Resolver — 64th POSR-exclusive differentiator.
--
-- Research finding: Restaurant managers spend 2-4 hours/week manually
-- resolving schedule conflicts (NRA Restaurant Workforce Report, Toast
-- scheduling survey). Schedule conflicts cause:
--   - Double-booking: same staff scheduled for 2 shifts simultaneously
--   - Shift overlap: back-to-back shifts with < 8h rest between (labor law
--     violation in 12+ US states, $500-2,000 fines per occurrence)
--   - Overtime violations: > 40h/week without overtime pay (FLSA, $1k-5k fine)
--   - Understaffing: too few staff during peak → lost sales + slow service
--   - Role mismatch: cook scheduled as server (untrained, quality risk)
--   - Preference conflicts: scheduled when unavailable (school, second job)
--   - Uncovered shifts: shift with no assigned staff → emergency call-ins
--   - Minor labor law: under-18 scheduled past 22:00 (federal violation)
--
-- Classic POS systems (Toast Team Schedule $60/mo, Lightspeed Team Schedule,
-- 7shifts, HotSchedules) generate schedules but DON'T auto-detect conflicts.
-- Managers find conflicts by eye on the schedule grid — error-prone and
-- time-consuming. AI conflict resolution is a $100-200/mo add-on in enterprise
-- workforce management suites (Deputy, When I Work Pro).
--
-- POSR's existing services cover DIFFERENT scheduling aspects:
--   - scheduling.service = SHIFT GENERATION (demand-driven greedy assignment)
--     — NOT conflict detection/resolution
--   - schedule-preference.service = PREFERENCE LEARNING (individual
--     availability patterns) — NOT real-time conflict detection
--   - overtime-prediction.service = OVERTIME PREDICTION (forecast who will
--     hit OT) — NOT conflict resolution
--   - labor-optimization.service = LABOR COST optimization (staff-to-demand
--     matching) — NOT conflict detection
--   - training-need.service = TRAINING gap analysis — NOT scheduling
--
-- This new service DETECTS + RESOLVES schedule conflicts:
--   - Scans all shifts for 8 conflict types
--   - Auto-suggests resolution (swap, reassign, add staff, adjust hours)
--   - Calculates compliance risk (labor law violation fines)
--   - Prioritizes by severity (legal > operational > preference)

DEFINE TABLE IF NOT EXISTS schedule_conflict_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON schedule_conflict_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON schedule_conflict_alert TYPE string;
  -- 'double_booking' | 'shift_overlap' | 'short_rest_period' |
  -- 'max_hours_exceeded' | 'understaffing' | 'role_mismatch' |
  -- 'preference_conflict' | 'uncovered_shift'
DEFINE FIELD IF NOT EXISTS severity        ON schedule_conflict_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS compliance_risk ON schedule_conflict_alert TYPE string DEFAULT 'none';
  -- 'none' | 'minor' | 'major' | 'critical' (labor law violation severity)
DEFINE FIELD IF NOT EXISTS employee_id     ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS employee_name   ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_id_1      ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_id_2      ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_date      ON schedule_conflict_alert TYPE option<string>;
  -- YYYY-MM-DD of the conflict
DEFINE FIELD IF NOT EXISTS shift_start_1   ON schedule_conflict_alert TYPE option<string>;
  -- ISO datetime of first shift start
DEFINE FIELD IF NOT EXISTS shift_end_1     ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_start_2   ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_end_2     ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS rest_hours      ON schedule_conflict_alert TYPE option<float>;
  -- hours between shifts (for short_rest_period rule)
DEFINE FIELD IF NOT EXISTS weekly_hours    ON schedule_conflict_alert TYPE option<float>;
  -- total scheduled hours this week (for max_hours_exceeded)
DEFINE FIELD IF NOT EXISTS role_assigned   ON schedule_conflict_alert TYPE option<string>;
  -- role the employee was assigned
DEFINE FIELD IF NOT EXISTS role_qualified  ON schedule_conflict_alert TYPE option<string>;
  -- role the employee is qualified for
DEFINE FIELD IF NOT EXISTS zone            ON schedule_conflict_alert TYPE option<string>;
  -- 'kitchen' | 'front_of_house' | 'bar' | 'all'
DEFINE FIELD IF NOT EXISTS est_fine        ON schedule_conflict_alert TYPE float DEFAULT 0;
  -- $ fine if labor law violation (compliance risk)
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON schedule_conflict_alert TYPE float DEFAULT 0;
  -- $ revenue lost if understaffed or unresolved
DEFINE FIELD IF NOT EXISTS resolution_action ON schedule_conflict_alert TYPE string;
  -- suggested fix (e.g., 'swap_with_john', 'reduce_hours', 'add_staff')
DEFINE FIELD IF NOT EXISTS description     ON schedule_conflict_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON schedule_conflict_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON schedule_conflict_alert TYPE option<string>;
  -- 'resolve_now' | 'swap_shift' | 'reassign' | 'add_staff' | 'reduce_hours' |
  -- 'notify_employee' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON schedule_conflict_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON schedule_conflict_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON schedule_conflict_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_schedconf_rule      ON schedule_conflict_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_schedconf_status    ON schedule_conflict_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_schedconf_severity  ON schedule_conflict_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_schedconf_employee  ON schedule_conflict_alert FIELDS employee_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS schedconf_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS schedconf_min_rest_hours   ON settings TYPE option<float> DEFAULT 8.0;
  -- minimum hours between shifts (labor law in 12+ states)
DEFINE FIELD IF NOT EXISTS schedconf_max_weekly_hours ON settings TYPE option<int> DEFAULT 40;
  -- max weekly hours before overtime (FLSA)
DEFINE FIELD IF NOT EXISTS schedconf_minor_cutoff_hour ON settings TYPE option<int> DEFAULT 22;
  -- under-18 cannot work past this hour (federal law)
DEFINE FIELD IF NOT EXISTS schedconf_target_coverage_pct ON settings TYPE option<float> DEFAULT 90.0;
  -- target shift coverage % (under this = understaffing alert)
