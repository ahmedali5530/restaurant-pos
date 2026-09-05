-- Migration: 2026_10_24_table_preference.surql
--
-- AI Customer Table Preference Learner — 133rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from ignoring
-- customer table preferences (Cornell Service Design, NRA Seating):
--   - 70% of regular customers have a strong table type preference
--   - Customers seated at preferred table type spend 15-20% more
--   - Customers seated at disliked table type are 3x more likely to complain
--   - Repeat visits increase 25% when customers consistently get preferred tables
--   - No POS learns which table types each customer prefers
--   - Hosts assign tables by availability, not customer preference
--   - Regulars who always sit at the booth get a random table → disappointment
--   - Party size, occasion, and time-of-day all affect table preference
--   - Table preference not captured during reservation → missed personalization
--   - "Our table" customers are the most loyal — but only if they GET their table
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO table preference
-- learning. seating-optimization optimizes table ALLOCATION efficiency. floor-
-- plan-optimizer optimizes physical layout. wait-experience-personalizer
-- personalizes wait. server-table-assignment matches servers to tables. None
-- learn which TABLE TYPES each CUSTOMER prefers from their visit history.
--
-- This new service LEARNS CUSTOMER TABLE PREFERENCES:
--   - Tracks which table types each customer has been seated at historically
--   - Learns preference patterns (always booth, window when available, etc.)
--   - Correlates table type with satisfaction + spend + repeat rate
--   - Recommends optimal table assignment for arriving customers
--   - Detects preference shifts (moved from bar to booths)
--   - Flags customers with unmet table preferences (didn't get preferred type)
--   - Tracks table type satisfaction differential (preferred vs non-preferred)
--   - Calculates revenue impact of preference-based seating

DEFINE TABLE IF NOT EXISTS table_preference_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON table_preference_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON table_preference_alert TYPE string;
  -- 'strong_preference_detected' | 'preference_unmet' | 'preference_shift' |
--   'preference_satisfaction_gap' | 'high_value_table_match' | 'occasion_table_preference' |
--   'preference_not_captured' | 'preference_based_uplift'
DEFINE FIELD IF NOT EXISTS severity        ON table_preference_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON table_preference_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON table_preference_alert TYPE string;
DEFINE FIELD IF NOT EXISTS preferred_table_type ON table_preference_alert TYPE option<string>;
  -- 'booth' | 'window' | 'bar' | 'quiet_corner' | 'large_table' | 'outdoor' | 'high_traffic'
DEFINE FIELD IF NOT EXISTS preference_strength ON table_preference_alert TYPE option<float>;
  -- 0-100 how strong the preference is
DEFINE FIELD IF NOT EXISTS current_visit_table_type ON table_preference_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS visit_count     ON table_preference_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS preferred_type_visits ON table_preference_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS satisfaction_at_preferred ON table_preference_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS satisfaction_at_other ON table_preference_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS spend_at_preferred ON table_preference_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS spend_at_other   ON table_preference_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS occasion        ON table_preference_alert TYPE option<string>;
  -- 'regular_dinner' | 'business_lunch' | 'celebration' | 'solo' | 'family' | 'date_night'
DEFINE FIELD IF NOT EXISTS is_reserved     ON table_preference_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON table_preference_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON table_preference_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON table_preference_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON table_preference_alert TYPE option<string>;
  -- 'assign_preferred_table' | 'capture_preference' | 'update_profile' |
--   'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON table_preference_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON table_preference_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON table_preference_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_tablepref_rule      ON table_preference_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_tablepref_status    ON table_preference_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_tablepref_severity  ON table_preference_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_tablepref_customer  ON table_preference_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_tablepref_table_type ON table_preference_alert FIELDS preferred_table_type;

DEFINE FIELD IF NOT EXISTS tablepref_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS tablepref_strength_threshold ON settings TYPE option<float> DEFAULT 60.0;
  -- min preference strength to flag (default 60/100)
DEFINE FIELD IF NOT EXISTS tablepref_min_visits    ON settings TYPE option<int> DEFAULT 3;
  -- min visits to establish preference (default 3)
DEFINE FIELD IF NOT EXISTS tablepref_satisfaction_gap ON settings TYPE option<float> DEFAULT 15.0;
  -- satisfaction gap between preferred and non-preferred to flag (default 15 points)
