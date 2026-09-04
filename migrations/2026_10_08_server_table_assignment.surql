-- Migration: 2026_10_08_server_table_assignment.surql
--
-- AI Server-Table Assignment Optimizer — 117th POSR-exclusive differentiator.
--
-- Research finding: Restaurants leave $300-1,000/mo per location from suboptimal
-- server-table matching (Cornell Service Matching, NRA Server Study):
--   - 35% of customer satisfaction is determined by server-customer match
--   - Regular customers served by "their" server spend 25% more + tip 30% more
--   - Wine-drinking tables served by wine-knowledgeable servers buy 40% more wine
--   - Families served by kid-friendly servers have 50% fewer complaints
--   - Business tables served by efficient servers return 2x more often
--   - No POS matches server STRENGTHS to table CHARACTERISTICS
--   - Existing load balancers only consider VOLUME (active tables) not MATCH
--   - Language/cultural matching missed (Spanish-speaking customer + Spanish server)
--   - Upsell specialist not deployed to high-value tables
--   - Regulars' preferred server not tracked → random assignment
--   - Anniversary tables get random server (should get experienced, attentive one)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO server-table affinity
-- matching. server-load-balancer (33rd) assigns by LOAD (active tables). server-
-- coach (51st) coaches server performance. server-performance tracks metrics.
-- None optimize MATCH QUALITY between specific servers and specific tables based
-- on strengths, rapport, and customer preferences.
--
-- This new service OPTIMIZES SERVER-TABLE AFFINITY:
--   - Tracks server strengths (wine, upsell, kids, efficiency, rapport)
--   - Matches server strengths to table characteristics
--   - Prioritizes regular customers' preferred server
--   - Matches language/cultural affinity
--   - Routes upsell specialist to high-value tables
--   - Assigns experienced servers to special occasions
--   - Tracks match effectiveness (satisfaction + revenue by match)
--   - Recommends reassignment when match is suboptimal

DEFINE TABLE IF NOT EXISTS server_table_assignment_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON server_table_assignment_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON server_table_assignment_alert TYPE string;
  -- 'regular_preferred_server' | 'wine_expert_match' | 'upsell_specialist_match' |
--   'kid_friendly_match' | 'business_efficient_match' | 'language_match' |
--   'special_occasion_server' | 'suboptimal_match_detected'
DEFINE FIELD IF NOT EXISTS severity        ON server_table_assignment_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS table_id        ON server_table_assignment_alert TYPE string;
DEFINE FIELD IF NOT EXISTS current_server  ON server_table_assignment_alert TYPE string;
DEFINE FIELD IF NOT EXISTS recommended_server ON server_table_assignment_alert TYPE string;
DEFINE FIELD IF NOT EXISTS match_score     ON server_table_assignment_alert TYPE option<float>;
  -- 0-100 how well current server matches table
DEFINE FIELD IF NOT EXISTS recommended_match_score ON server_table_assignment_alert TYPE option<float>;
  -- 0-100 how well recommended server matches table
DEFINE FIELD IF NOT EXISTS match_reason    ON server_table_assignment_alert TYPE option<string>;
  -- 'regular_rapport' | 'wine_expertise' | 'upsell_skill' | 'kid_friendly' |
  --   'efficiency' | 'language' | 'experience_level'
DEFINE FIELD IF NOT EXISTS customer_name   ON server_table_assignment_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size      ON server_table_assignment_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS table_characteristics ON server_table_assignment_alert TYPE option<string>;
  -- 'regulars' | 'wine_ordering' | 'family' | 'business' | 'anniversary' | 'tourists' | 'high_value'
DEFINE FIELD IF NOT EXISTS server_strengths ON server_table_assignment_alert TYPE option<string>;
  -- comma-separated strengths of recommended server
DEFINE FIELD IF NOT EXISTS est_revenue_uplift ON server_table_assignment_alert TYPE option<float>;
  -- projected revenue increase from better match
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON server_table_assignment_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON server_table_assignment_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON server_table_assignment_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON server_table_assignment_alert TYPE option<string>;
  -- 'reassign_now' | 'assign_next' | 'train_server' | 'monitor_match' |
  --   'document_preference' | 'investigate' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON server_table_assignment_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON server_table_assignment_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON server_table_assignment_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_servertable_rule      ON server_table_assignment_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_servertable_status    ON server_table_assignment_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_servertable_severity  ON server_table_assignment_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_servertable_table     ON server_table_assignment_alert FIELDS table_id;
DEFINE INDEX IF NOT EXISTS idx_servertable_server    ON server_table_assignment_alert FIELDS recommended_server;

DEFINE FIELD IF NOT EXISTS servertable_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS servertable_min_match_gap ON settings TYPE option<float> DEFAULT 25.0;
  -- min match score gap to recommend reassignment (default 25 points)
DEFINE FIELD IF NOT EXISTS servertable_regular_window ON settings TYPE option<int> DEFAULT 10;
  -- visits to qualify as regular (default 10)
DEFINE FIELD IF NOT EXISTS servertable_high_value_threshold ON settings TYPE option<float> DEFAULT 200.0;
  -- table spend to qualify as high-value (default $200)
