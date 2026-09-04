-- Migration: 2026_10_07_wait_experience_personalizer.surql
--
-- AI Customer Wait Experience Personalizer — 116th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from poor wait
-- experience management (Cornell Service Recovery, NRA Wait Psychology):
--   - Perceived wait time matters more than actual wait time
--   - 70% of customers who complain cite "the wait" not the food
--   - Unoccupied waits feel 2x longer than occupied waits (queue psychology)
--   - No POS personalizes wait experience based on customer profile
--   - Business lunch customers need fast wait (time-pressured)
--   - Families with kids need distraction (kids get restless)
--   - Anniversary/special occasion needs VIP wait handling
--   - Solo diners need engagement (feel awkward waiting alone)
--   - Regular customers expect recognition (skip wait or priority)
--   - No proactive complaint prevention — staff react AFTER complaint
--   - Wait compensation inconsistent (free drink vs nothing)
--   - No wait satisfaction tracking (can't measure what works)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO wait experience
-- personalization. wait-prediction.service predicts WAIT TIME. waitlist-optimizer
-- optimizes WAITLIST management. seating-optimization optimizes TABLE allocation.
-- table-turnover tracks table duration. None PERSONALIZE the wait experience
-- based on customer profile + context to reduce perceived wait + prevent
-- complaints.
--
-- This new service PERSONALIZES THE WAIT EXPERIENCE:
--   - Profiles customer (business, family, solo, regular, special occasion)
--   - Matches wait experience tactic to customer profile + predicted wait
--   - Business lunch → priority seating + quick appetizer
--   - Families → kids activity pack + high chair ready
--   - Anniversary → complimentary champagne + best table
--   - Solo diners → bar seating + engaging conversation
--   - Regulars → recognition + skip wait if possible
--   - Long waits → proactive compensation (free appetizer)
--   - Tracks wait satisfaction by tactic for continuous improvement

DEFINE TABLE IF NOT EXISTS wait_experience_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON wait_experience_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON wait_experience_alert TYPE string;
  -- 'business_lunch_priority' | 'family_with_kids' | 'special_occasion_vip' |
--   'solo_diner_engagement' | 'regular_recognition' | 'long_wait_compensation' |
--   'complaint_risk_prevention' | 'wait_satisfaction_tracking'
DEFINE FIELD IF NOT EXISTS severity        ON wait_experience_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON wait_experience_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON wait_experience_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_profile ON wait_experience_alert TYPE option<string>;
  -- 'business_lunch' | 'family' | 'solo' | 'regular' | 'special_occasion' | 'tourist' | 'elderly'
DEFINE FIELD IF NOT EXISTS party_size      ON wait_experience_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS predicted_wait_minutes ON wait_experience_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS actual_wait_minutes ON wait_experience_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS context_factors ON wait_experience_alert TYPE option<string>;
  -- 'time_pressured' | 'has_kids' | 'anniversary' | 'birthday' | 'business_meeting' | 'first_visit'
DEFINE FIELD IF NOT EXISTS recommended_tactic ON wait_experience_alert TYPE option<string>;
  -- 'priority_seating' | 'kids_activity' | 'complimentary_drink' | 'bar_seating' |
--   'recognition_greeting' | 'free_appetizer' | 'manager_checkin' | 'distraction'
DEFINE FIELD IF NOT EXISTS tactic_cost     ON wait_experience_alert TYPE option<float>;
  -- cost of the recommended tactic ($)
DEFINE FIELD IF NOT EXISTS complaint_risk_score ON wait_experience_alert TYPE option<float>;
  -- 0-100 risk of complaint if no intervention
DEFINE FIELD IF NOT EXISTS satisfaction_score ON wait_experience_alert TYPE option<float>;
  -- 0-100 post-wait satisfaction (for tracking)
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON wait_experience_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON wait_experience_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON wait_experience_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON wait_experience_alert TYPE option<string>;
  -- 'execute_tactic' | 'escalate_manager' | 'compensate' | 'engage_conversation' |
--   'offer_alternative' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON wait_experience_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON wait_experience_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON wait_experience_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_waitexp_rule      ON wait_experience_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_waitexp_status    ON wait_experience_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_waitexp_severity  ON wait_experience_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_waitexp_customer  ON wait_experience_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_waitexp_profile   ON wait_experience_alert FIELDS customer_profile;

DEFINE FIELD IF NOT EXISTS waitexp_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS waitexp_long_wait     ON settings TYPE option<int> DEFAULT 25;
  -- minutes to trigger long wait compensation (default 25)
DEFINE FIELD IF NOT EXISTS waitexp_complaint_threshold ON settings TYPE option<float> DEFAULT 60.0;
  -- complaint risk score to trigger prevention (default 60)
DEFINE FIELD IF NOT EXISTS waitexp_max_tactic_cost ON settings TYPE option<float> DEFAULT 15.0;
  -- max tactic cost per customer (default $15)
DEFINE FIELD IF NOT EXISTS waitexp_target_satisfaction ON settings TYPE option<float> DEFAULT 85.0;
  -- target satisfaction score (default 85)
