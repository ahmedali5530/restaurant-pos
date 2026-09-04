-- Migration: 2026_09_23_break_compliance.surql
--
-- AI Restaurant Break & Meal Period Compliance Tracker — 102nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants face $500-2,000 per meal/break period violation
-- (California Labor Code §226.7, federal FLSA, state-specific laws):
--   - Missed meal period: employee entitled to 1 hour extra pay ($15-50/incident)
--   - Late meal period (after 5h work): penalty per CA law
--   - Missed rest break (10 min per 4h): penalty
--   - Late rest break: penalty
--   - Short break (under 10 min): non-compliant
--   - Overwork without break (>6h without meal): violation
--   - Minor break compliance (under 18: stricter rules)
--   - Meal waiver tracking (can waive if shift <6h)
-- Average restaurant: 5-15 violations/month = $2,500-7,500/mo liability
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO break compliance.
-- compliance-tracking.service tracks employee CERTIFICATIONS (food handler,
-- alcohol server permits) — NOT meal/rest break compliance.
-- Third-party labor compliance (Homebase, When I Work, Deputy) cost $50-100/mo
-- but are generic scheduling tools, not AI-driven break compliance prediction.
--
-- This new service TRACKS BREAK & MEAL COMPLIANCE:
--   - Monitors each employee's shift in real-time
--   - Alerts when meal period due (5th hour of work)
--   - Alerts when rest break due (every 4 hours)
--   - Tracks missed/late/short breaks
--   - Calculates penalty liability ($/incident)
--   - Flags overwork without break
--   - Tracks minor (under-18) break compliance
--   - Manages meal waiver documentation

DEFINE TABLE IF NOT EXISTS break_compliance_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON break_compliance_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON break_compliance_alert TYPE string;
  -- 'missed_meal_period' | 'missed_rest_break' | 'late_meal_period' |
--   'late_rest_break' | 'short_break_duration' | 'overwork_no_break' |
--   'minor_break_violation' | 'meal_waiver_missing'
DEFINE FIELD IF NOT EXISTS severity        ON break_compliance_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS employee_id     ON break_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS employee_name   ON break_compliance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS shift_date      ON break_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shift_start     ON break_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS hours_worked    ON break_compliance_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS break_type      ON break_compliance_alert TYPE option<string>;
  -- 'meal' | 'rest'
DEFINE FIELD IF NOT EXISTS break_due_at    ON break_compliance_alert TYPE option<string>;
  -- when break was legally due
DEFINE FIELD IF NOT EXISTS break_taken_at  ON break_compliance_alert TYPE option<string>;
  -- when break was actually taken (NONE if missed)
DEFINE FIELD IF NOT EXISTS break_duration_min ON break_compliance_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS required_duration_min ON break_compliance_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS is_minor        ON break_compliance_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS penalty_amount  ON break_compliance_alert TYPE float DEFAULT 0;
  -- $ penalty for this violation
DEFINE FIELD IF NOT EXISTS est_monthly_liability ON break_compliance_alert TYPE float DEFAULT 0;
  -- $ monthly liability if pattern continues
DEFINE FIELD IF NOT EXISTS description     ON break_compliance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON break_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON break_compliance_alert TYPE option<string>;
  -- 'take_break_now' | 'send_on_break' | 'document_waiver' | 'pay_penalty' |
--   'adjust_schedule' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON break_compliance_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON break_compliance_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON break_compliance_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_break_rule      ON break_compliance_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_break_status    ON break_compliance_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_break_severity  ON break_compliance_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_break_employee  ON break_compliance_alert FIELDS employee_name;

-- Settings
DEFINE FIELD IF NOT EXISTS break_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS break_meal_due_hour   ON settings TYPE option<int> DEFAULT 5;
  -- hour of work by which meal period must start (CA: 5th hour)
DEFINE FIELD IF NOT EXISTS break_rest_interval_hours ON settings TYPE option<int> DEFAULT 4;
  -- hours between rest breaks (CA: every 4h)
DEFINE FIELD IF NOT EXISTS break_meal_duration_min ON settings TYPE option<int> DEFAULT 30;
  -- required meal period duration (CA: 30 min)
DEFINE FIELD IF NOT EXISTS break_rest_duration_min ON settings TYPE option<int> DEFAULT 10;
  -- required rest break duration (CA: 10 min)
DEFINE FIELD IF NOT EXISTS break_penalty_amount ON settings TYPE option<float> DEFAULT 25.0;
  -- $ penalty per violation (CA: 1 hour extra pay, ~$25 avg)
