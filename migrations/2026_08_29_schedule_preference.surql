-- Migration: 2026_08_29_schedule_preference.surql
--
-- AI Staff Schedule Preference Learning — 56th POSR-exclusive differentiator.
--
-- Research finding: 45% of restaurant employees cite inflexible scheduling as
-- top frustration (Harvard Business Review). Restaurants with preference-aware
-- scheduling see 23% lower turnover and 18% higher satisfaction (Cornell
-- hospitality workforce study). Yet most POS systems treat staff as
-- interchangeable slots, not individuals with preferences.
--
-- Toast Team Schedule ($60/mo) generates demand-based schedules but does NOT
-- learn individual preferences. 7shifts ($30/mo) has manual availability
-- entry but no AI learning. POSR's scheduling.service generates optimal
-- schedules by DEMAND but does NOT learn what each staff member PREFERS.
--
-- Distinct from:
--   - scheduling.service (demand-driven shift generation — does NOT learn
--     individual staff preferences or swap patterns)
--   - labor-optimization.service (labor cost % analysis — not preferences)
--   - overtime-prediction.service (predicts OT — not preferences)
--   - staff-turnover.service (predicts departure — not schedule satisfaction)
--   - training-need.service (skill gaps — not scheduling preferences)
--
-- This service LEARNS from historical schedules + swap requests + performance
-- to build a preference profile per staff member, then recommends schedule
-- adjustments that improve satisfaction without sacrificing coverage.

DEFINE TABLE IF NOT EXISTS schedule_preference TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON schedule_preference TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON schedule_preference TYPE string;
  -- 'preferred_shift' | 'avoided_shift' | 'swap_pattern' | 'team_affinity' | 'preference_conflict'
DEFINE FIELD IF NOT EXISTS severity       ON schedule_preference TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_id        ON schedule_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_name      ON schedule_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS preferred_day_of_week ON schedule_preference TYPE option<int>;
  -- 0=Sun...6=Sat (null = no day preference)
DEFINE FIELD IF NOT EXISTS preferred_start_hour ON schedule_preference TYPE option<int>;
  -- preferred shift start hour (0-23)
DEFINE FIELD IF NOT EXISTS preferred_shift_length ON schedule_preference TYPE option<int>;
  -- preferred shift duration in hours
DEFINE FIELD IF NOT EXISTS avoided_day_of_week ON schedule_preference TYPE option<int>;
  -- day staff consistently tries to avoid
DEFINE FIELD IF NOT EXISTS avoided_start_hour ON schedule_preference TYPE option<int>;
  -- start hour staff consistently tries to avoid
DEFINE FIELD IF NOT EXISTS preference_confidence ON schedule_preference TYPE float DEFAULT 0;
  -- 0-1, how confident we are in this preference (based on data volume)
DEFINE FIELD IF NOT EXISTS historical_swaps_initiated ON schedule_preference TYPE int DEFAULT 0;
  -- how many times staff swapped OUT of this slot
DEFINE FIELD IF NOT EXISTS historical_swaps_accepted ON schedule_preference TYPE int DEFAULT 0;
  -- how many times staff swapped INTO this slot
DEFINE FIELD IF NOT EXISTS satisfaction_score ON schedule_preference TYPE float DEFAULT 0;
  -- 0-100, predicted satisfaction if scheduled in preferred slot
DEFINE FIELD IF NOT EXISTS team_affinity   ON schedule_preference TYPE option<string>;
  -- JSON: staff IDs this person works well with (based on performance correlation)
DEFINE FIELD IF NOT EXISTS team_conflict   ON schedule_preference TYPE option<string>;
  -- JSON: staff IDs this person has friction with (based on error correlation)
DEFINE FIELD IF NOT EXISTS est_retention_impact ON schedule_preference TYPE float DEFAULT 0;
  -- 0-1, how much honoring this preference reduces turnover risk
DEFINE FIELD IF NOT EXISTS description     ON schedule_preference TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON schedule_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON schedule_preference TYPE option<string>;
  -- 'honor_preference' | 'partial_accommodation' | 'explain_constraint' | 'offer_swap' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON schedule_preference TYPE string DEFAULT 'open';
  -- 'open' | 'honored' | 'partial' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON schedule_preference TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON schedule_preference TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_sp_rule_id   ON schedule_preference FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_sp_severity  ON schedule_preference FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_sp_status    ON schedule_preference FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_sp_staff     ON schedule_preference FIELDS staff_id;

-- Settings
DEFINE FIELD IF NOT EXISTS sched_pref_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS sched_pref_lookback_days   ON settings TYPE option<int>   DEFAULT 90;
  -- learn from last 90 days of schedules
DEFINE FIELD IF NOT EXISTS sched_pref_min_data_points ON settings TYPE option<int>   DEFAULT 5;
  -- need at least 5 data points to infer preference
DEFINE FIELD IF NOT EXISTS sched_pref_confidence_threshold ON settings TYPE option<float> DEFAULT 0.60;
  -- 60% confidence to flag as preference
