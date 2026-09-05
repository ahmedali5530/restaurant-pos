-- Migration: 2026_10_19_shift_handover.surql
--
-- AI Staff Shift Handover Optimizer — 128th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,000/mo per location from poor
-- shift handover quality (NRA Operations, Cornell Staff Management):
--   - 45% of service errors occur within 30 min of shift change
--   - Incomplete task transfer: outgoing staff forget to mention pending orders
--   - Knowledge gaps: incoming staff unaware of VIP customers, allergies, issues
--   - Communication breakdown: no structured handover process → information lost
--   - No POS tracks handover quality or completeness
--   - Rushed handovers during peak: 2-min handover misses critical context
--   - Inconsistent handover: depends on individual staff diligence (varies wildly)
--   - Customer context lost: incoming server doesn't know table #5 is VIP
--   - Kitchen context lost: incoming cook doesn't know grill #3 has temp issue
--   - No handover checklist → critical items missed silently
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO shift handover
-- tracking. shift.utils is a utility. scheduling-optimization optimizes
-- schedules. schedule-preference learns preferences. break-compliance tracks
-- breaks. None analyze HANDOVER QUALITY between outgoing and incoming staff.
--
-- This new service OPTIMIZES SHIFT HANDOVER:
--   - Tracks handover completeness (checklist items covered)
--   - Detects knowledge gaps (incoming staff missing critical context)
--   - Monitors handover duration (too short = rushed, too long = inefficient)
--   - Tracks post-handover error spike (indicator of poor handover)
--   - Identifies best/worst handover pairs (who hands over well together)
--   - Recommends structured handover checklist per station/role
--   - Flags high-risk handovers (peak hour, complex situation, new staff)
--   - Calculates revenue impact of handover quality

DEFINE TABLE IF NOT EXISTS shift_handover_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON shift_handover_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON shift_handover_alert TYPE string;
  -- 'incomplete_handover' | 'knowledge_gap' | 'rushed_handover' | 'post_handover_error_spike' |
--   'best_handover_pair' | 'high_risk_handover' | 'missing_vip_context' | 'handover_checklist_gap'
DEFINE FIELD IF NOT EXISTS severity        ON shift_handover_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS outgoing_staff  ON shift_handover_alert TYPE string;
DEFINE FIELD IF NOT EXISTS incoming_staff   ON shift_handover_alert TYPE string;
DEFINE FIELD IF NOT EXISTS role            ON shift_handover_alert TYPE option<string>;
  -- 'server' | 'kitchen' | 'host' | 'bartender' | 'manager'
DEFINE FIELD IF NOT EXISTS handover_duration_minutes ON shift_handover_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS checklist_items_total ON shift_handover_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS checklist_items_covered ON shift_handover_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS completeness_pct ON shift_handover_alert TYPE option<float>;
  -- % of checklist items covered
DEFINE FIELD IF NOT EXISTS missing_items   ON shift_handover_alert TYPE option<string>;
  -- comma-separated missing checklist items
DEFINE FIELD IF NOT EXISTS post_handover_errors ON shift_handover_alert TYPE option<int>;
  -- errors in 30min post-handover
DEFINE FIELD IF NOT EXISTS is_peak_hour    ON shift_handover_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS has_vip_tables  ON shift_handover_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS has_pending_orders ON shift_handover_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS has_special_requests ON shift_handover_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON shift_handover_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON shift_handover_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON shift_handover_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON shift_handover_alert TYPE option<string>;
  -- 'structured_checklist' | 'extend_handover' | 'pair_training' | 'add_context' |
--   'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON shift_handover_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON shift_handover_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON shift_handover_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_shifthand_rule      ON shift_handover_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_shifthand_status    ON shift_handover_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_shifthand_severity  ON shift_handover_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_shifthand_outgoing  ON shift_handover_alert FIELDS outgoing_staff;
DEFINE INDEX IF NOT EXISTS idx_shifthand_role      ON shift_handover_alert FIELDS role;

DEFINE FIELD IF NOT EXISTS shifthand_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS shifthand_completeness_threshold ON settings TYPE option<float> DEFAULT 80.0;
  -- min completeness % to be acceptable (default 80%)
DEFINE FIELD IF NOT EXISTS shifthand_min_duration  ON settings TYPE option<float> DEFAULT 3.0;
  -- min handover duration in minutes (default 3 min)
DEFINE FIELD IF NOT EXISTS shifthand_error_threshold ON settings TYPE option<int> DEFAULT 3;
  -- post-handover errors to flag (default 3 in 30min)
