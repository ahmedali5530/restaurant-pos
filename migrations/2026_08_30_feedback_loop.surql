-- Migration: 2026_08_30_feedback_loop.surql
--
-- AI Customer Feedback Loop Tracker — 76th POSR-exclusive differentiator.
--
-- Research finding: Restaurants collect feedback but 85% never act on it
-- (BrightLocal). The "feedback loop" — collect → analyze → act → verify — is
-- broken at the "act" stage. Customers who see their feedback implemented are
-- 3x more likely to return (Harvard Business Review feedback study). Yet most
-- restaurants have no systematic way to track feedback from collection through
-- implementation to impact verification.
--
-- Toast, Square, Lightspeed collect reviews but don't track the FEEDBACK LOOP.
-- POSR's sentiment.service ANALYZES reviews. complaint-pattern.service finds
-- RECURRING themes. review-response.service RESPONDS to reviews. None tracks
-- the full cycle: feedback → action → impact → close the loop with customer.
--
-- Distinct from:
--   - sentiment.service (analyzes review SENTIMENT — NOT action tracking)
--   - complaint-pattern.service (finds RECURRING themes — NOT implementation)
--   - review-response.service (generates RESPONSES — NOT action items)
--   - satisfaction-prediction.service (predicts per-order — NOT feedback loop)
--   - sentiment-trend.service (tracks TRENDS — NOT individual feedback lifecycle)

DEFINE TABLE IF NOT EXISTS feedback_loop TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON feedback_loop TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON feedback_loop TYPE string;
  -- 'new_feedback' | 'recurring_theme' | 'action_needed' | 'impact_verified' | 'loop_closed'
DEFINE FIELD IF NOT EXISTS severity       ON feedback_loop TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS feedback_id    ON feedback_loop TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name  ON feedback_loop TYPE option<string>;
DEFINE FIELD IF NOT EXISTS feedback_text  ON feedback_loop TYPE option<string>;
DEFINE FIELD IF NOT EXISTS feedback_source ON feedback_loop TYPE option<string>;
  -- 'google' | 'yelp' | 'internal' | 'social' | 'delivery_platform' | 'verbal'
DEFINE FIELD IF NOT EXISTS category       ON feedback_loop TYPE option<string>;
  -- 'food_quality' | 'service' | 'price' | 'ambiance' | 'cleanliness' | 'wait_time' | 'other'
DEFINE FIELD IF NOT EXISTS sentiment      ON feedback_loop TYPE option<string>;
  -- 'positive' | 'neutral' | 'negative' | 'mixed'
DEFINE FIELD IF NOT EXISTS stage          ON feedback_loop TYPE string;
  -- 'collected' | 'analyzed' | 'action_assigned' | 'implementing' | 'implemented' | 'impact_verified' | 'closed'
DEFINE FIELD IF NOT EXISTS assigned_to    ON feedback_loop TYPE option<string>;
  -- staff member assigned to resolve
DEFINE FIELD IF NOT EXISTS action_taken   ON feedback_loop TYPE option<string>;
  -- description of action implemented
DEFINE FIELD IF NOT EXISTS impact_score   ON feedback_loop TYPE float DEFAULT 0;
  -- 0-100, measured improvement after action
DEFINE FIELD IF NOT EXISTS days_open      ON feedback_loop TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON feedback_loop TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON feedback_loop TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON feedback_loop TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON feedback_loop TYPE option<string>;
  -- 'assign_now' | 'implement_action' | 'verify_impact' | 'close_loop' | 'escalate'
DEFINE FIELD IF NOT EXISTS status          ON feedback_loop TYPE string DEFAULT 'open';
  -- 'open' | 'assigned' | 'implementing' | 'implemented' | 'verified' | 'closed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON feedback_loop TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON feedback_loop TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_fl_rule_id   ON feedback_loop FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_fl_severity  ON feedback_loop FIELDS severity;
DEFINE FIELD IF NOT EXISTS idx_fl_status    ON feedback_loop TYPE string DEFAULT 'open';
DEFINE INDEX IF NOT EXISTS idx_fl_category  ON feedback_loop FIELDS category;

-- Settings
DEFINE FIELD IF NOT EXISTS feedback_loop_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS feedback_loop_max_days         ON settings TYPE option<int>   DEFAULT 7;
  -- max days to resolve feedback before escalation
DEFINE FIELD IF NOT EXISTS feedback_loop_min_impact_score ON settings TYPE option<float> DEFAULT 50;
  -- min impact score to close loop as "verified"
DEFINE FIELD IF NOT EXISTS feedback_loop_auto_assign      ON settings TYPE option<bool>  DEFAULT true;
  -- auto-assign feedback to staff based on category
