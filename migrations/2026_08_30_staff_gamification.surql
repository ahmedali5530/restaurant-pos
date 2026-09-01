-- Migration: 2026_08_30_staff_gamification.surql
--
-- AI Staff Performance Gamification Engine — 61st POSR-exclusive differentiator.
--
-- Research finding: Gamification in workplace increases engagement 48% and
-- productivity 22% (Gallup, Harvard Business Review). Restaurant industry has
-- 75% annual turnover — gamification reduces this by 20-30% (Cornell
-- hospitality workforce study). Yet NO POS system has built-in gamification.
-- Toast, Square, Lightspeed track metrics but don't gamify them.
-- 7shifts ($30/mo) has basic scheduling but no gamification. Homebase has
-- simple leaderboards but no AI-driven challenges or badges.
--
-- POSR's existing services:
--   - server-performance.service: tracks metrics, gives single coaching label
--   - server-coach.service: 5-dim skill matrix + development plans
--   - tip-analytics.service: tip equity analysis
--   - staff-turnover.service: predicts departure risk
--   - training-need.service: predicts skill gaps
--   - schedule-preference.service: learns individual preferences
--
-- None of these GAMIFY performance. This new service:
--   1. Creates competitive leaderboards (daily/weekly/monthly)
--   2. Awards achievement badges (milestones, streaks, records)
--   3. Generates team challenges (collaborative goals)
--   4. Recommends performance-based rewards
--   5. Tracks engagement and predicts gamification ROI

DEFINE TABLE IF NOT EXISTS staff_gamification TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON staff_gamification TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON staff_gamification TYPE string;
  -- 'leaderboard_rank' | 'achievement_badge' | 'team_challenge' | 'reward_unlocked' | 'engagement_alert'
DEFINE FIELD IF NOT EXISTS severity       ON staff_gamification TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_id        ON staff_gamification TYPE option<string>;
DEFINE FIELD IF NOT EXISTS staff_name      ON staff_gamification TYPE option<string>;
DEFINE FIELD IF NOT EXISTS period          ON staff_gamification TYPE string;
  -- 'daily' | 'weekly' | 'monthly'
DEFINE FIELD IF NOT EXISTS metric_type    ON staff_gamification TYPE string;
  -- 'revenue' | 'orders' | 'avg_ticket' | 'upsell_rate' | 'accuracy' | 'satisfaction' | 'tips'
DEFINE FIELD IF NOT EXISTS metric_value   ON staff_gamification TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS rank           ON staff_gamification TYPE option<int>;
  -- leaderboard position
DEFINE FIELD IF NOT EXISTS total_staff    ON staff_gamification TYPE option<int>;
DEFINE FIELD IF NOT EXISTS badge_name     ON staff_gamification TYPE option<string>;
  -- 'top_seller' | 'accuracy_master' | 'upsell_king' | 'speed_demon' | 'tip_champion' | 'streak_7' | 'streak_30' | 'milestone_100' | 'milestone_500'
DEFINE FIELD IF NOT EXISTS badge_description ON staff_gamification TYPE option<string>;
DEFINE FIELD IF NOT EXISTS challenge_name ON staff_gamification TYPE option<string>;
  -- team challenge name
DEFINE FIELD IF NOT EXISTS challenge_progress ON staff_gamification TYPE float DEFAULT 0;
  -- 0-100 % complete
DEFINE FIELD IF NOT EXISTS challenge_target ON staff_gamification TYPE float DEFAULT 0;
  -- target value
DEFINE FIELD IF NOT EXISTS reward_type    ON staff_gamification TYPE option<string>;
  -- 'cash_bonus' | 'shift_preference' | 'extra_break' | 'public_recognition' | 'gift_card'
DEFINE FIELD IF NOT EXISTS reward_value   ON staff_gamification TYPE option<float>;
  -- $ value if applicable
DEFINE FIELD IF NOT EXISTS est_engagement_boost ON staff_gamification TYPE float DEFAULT 0;
  -- 0-1, predicted engagement increase
DEFINE FIELD IF NOT EXISTS description     ON staff_gamification TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON staff_gamification TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON staff_gamification TYPE option<string>;
  -- 'announce_publicly' | 'private_recognition' | 'escalate_reward' | 'adjust_challenge' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON staff_gamification TYPE string DEFAULT 'open';
  -- 'open' | 'announced' | 'rewarded' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON staff_gamification TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON staff_gamification TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_sg_rule_id   ON staff_gamification FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_sg_severity  ON staff_gamification FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_sg_status    ON staff_gamification FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_sg_staff     ON staff_gamification FIELDS staff_id;

-- Settings
DEFINE FIELD IF NOT EXISTS gamification_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS gamification_leaderboard_size ON settings TYPE option<int>   DEFAULT 5;
  -- top 5 shown on leaderboard
DEFINE FIELD IF NOT EXISTS gamification_reward_budget    ON settings TYPE option<float> DEFAULT 200;
  -- monthly reward budget ($)
DEFINE FIELD IF NOT EXISTS gamification_min_staff_for_challenge ON settings TYPE option<int> DEFAULT 3;
  -- need 3+ staff for team challenges
