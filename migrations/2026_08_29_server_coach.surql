-- Migration: 2026_08_29_server_coach.surql
--
-- AI Server Skill Matrix & Coaching Path — 45th POSR-exclusive differentiator.
--
-- Research finding: 73% of restaurant servers say they want more coaching,
-- but managers lack time (NRA workforce research). Toast Server Performance
-- reports ($35+/mo) give a SINGLE coaching label per server (e.g. "coach
-- accuracy"). Square Team Performance shows metrics but no skill matrix.
-- Lightspeed has no coaching. POSR goes deeper: multi-dimensional SKILL
-- MATRIX per server + personalized development path + peer mentor matching +
-- trajectory prediction + coaching impact verification.
--
-- Distinct from:
--   - server-performance.service (single coaching label + overall ranking —
--     NOT multi-dimensional skill matrix or development path)
--   - training-need.service (general staff training needs based on
--     notes/errors — NOT server-specific skill matrix)
--   - server-load-balancer.service (real-time table assignment — not coaching)
--   - tip-analytics.service (tip equity — not individual coaching)
--   - upsell-analytics.service (upsell success rates — not personalized plan)
--
-- This service analyzes server skills across MULTIPLE dimensions and generates
-- a personalized development roadmap per server.

DEFINE TABLE IF NOT EXISTS server_coaching_plan TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON server_coaching_plan TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON server_coaching_plan TYPE string;
  -- 'skill_gap' | 'top_strength' | 'mentor_match' | 'trajectory_warning' | 'coaching_impact'
DEFINE FIELD IF NOT EXISTS severity       ON server_coaching_plan TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS server_id      ON server_coaching_plan TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_name    ON server_coaching_plan TYPE option<string>;
  -- Skill matrix (0-100 per dimension)
DEFINE FIELD IF NOT EXISTS upsell_score   ON server_coaching_plan TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS accuracy_score ON server_coaching_plan TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS speed_score     ON server_coaching_plan TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS tip_score       ON server_coaching_plan TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS satisfaction_score ON server_coaching_plan TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overall_score   ON server_coaching_plan TYPE float DEFAULT 0;
  -- avg of 5 dimensions
DEFINE FIELD IF NOT EXISTS top_strength   ON server_coaching_plan TYPE option<string>;
  -- dimension name where server scores highest
DEFINE FIELD IF NOT EXISTS bottom_gap     ON server_coaching_plan TYPE option<string>;
  -- dimension name where server scores lowest
DEFINE FIELD IF NOT EXISTS trajectory     ON server_coaching_plan TYPE option<string>;
  -- 'improving' | 'declining' | 'stable' | 'new'
DEFINE FIELD IF NOT EXISTS suggested_mentor ON server_coaching_plan TYPE option<string>;
  -- name of peer top performer to pair with
DEFINE FIELD IF NOT EXISTS development_actions ON server_coaching_plan TYPE option<string>;
  -- JSON array of 3-4 specific actions
DEFINE FIELD IF NOT EXISTS prev_coaching_applied ON server_coaching_plan TYPE option<bool>;
  -- true if previous coaching was applied (for impact verification)
DEFINE FIELD IF NOT EXISTS impact_score   ON server_coaching_plan TYPE option<float>;
  -- % change since previous coaching (-ve = declined, +ve = improved)
DEFINE FIELD IF NOT EXISTS description     ON server_coaching_plan TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON server_coaching_plan TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON server_coaching_plan TYPE option<string>;
  -- 'assign_mentor' | 'targeted_training' | 'performance_review' | 'recognize' | 'monitor_2w'
DEFINE FIELD IF NOT EXISTS status          ON server_coaching_plan TYPE string DEFAULT 'open';
  -- 'open' | 'coaching_applied' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON server_coaching_plan TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON server_coaching_plan TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_scp_rule_id   ON server_coaching_plan FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_scp_severity  ON server_coaching_plan FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_scp_status    ON server_coaching_plan FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_scp_server   ON server_coaching_plan FIELDS server_id;

-- Settings
DEFINE FIELD IF NOT EXISTS server_coach_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS server_coach_lookback_days   ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS server_coach_gap_threshold   ON settings TYPE option<float> DEFAULT 50;
  -- score below 50 = skill gap
DEFINE FIELD IF NOT EXISTS server_coach_top_threshold   ON settings TYPE option<float> DEFAULT 85;
  -- score above 85 = top strength
DEFINE FIELD IF NOT EXISTS server_coach_trajectory_window ON settings TYPE option<int> DEFAULT 14;
  -- compare last 14d vs prior 14d for trajectory
