-- Migration: 2026_08_30_local_seo.surql
--
-- AI Local SEO Optimizer — 69th POSR-exclusive differentiator.
--
-- Research finding: 46% of all Google searches are for local businesses
-- (Google). 88% of consumers trust online reviews as much as personal
-- recommendations (BrightLocal). Restaurants appearing in Google "Local Pack"
-- (top 3 map results) get 4x more calls and 2x more website visits (Moz local
-- search ranking factors). Yet most restaurants don't actively manage their
-- local SEO — incomplete Google Business Profiles, missing photos, unresponded
-- reviews, inconsistent NAP (name/address/phone) citations.
--
-- Toast, Square, Lightspeed have NO local SEO features. ReviewTrackers ($90/mo),
-- BrightLocal ($39/mo), Yext ($249/mo) handle listings but don't integrate with
-- POS data for content optimization. POSR's review-response.service responds to
-- reviews but doesn't optimize overall local SEO strategy.
--
-- Distinct from:
--   - review-response.service (generates review RESPONSES — NOT SEO optimization)
--   - competitor-monitoring.service (tracks competitor PRICES — NOT search rankings)
--   - social-content.service (generates social POSTS — NOT Google Business Profile)
--   - sentiment.service (analyzes reviews — NOT SEO ranking factors)
--   - marketing.service (email/SMS — NOT search engine optimization)
--
-- This service optimizes local SEO: Google Business Profile completeness,
-- review velocity, photo freshness, citation consistency, keyword optimization,
-- and ranking factor analysis.

DEFINE TABLE IF NOT EXISTS local_seo TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON local_seo TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON local_seo TYPE string;
  -- 'profile_incomplete' | 'review_velocity' | 'photo_stale' | 'citation_inconsistent' | 'keyword_optimize'
DEFINE FIELD IF NOT EXISTS severity       ON local_seo TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS seo_score      ON local_seo TYPE float DEFAULT 0;
  -- 0-100, overall local SEO score
DEFINE FIELD IF NOT EXISTS category       ON local_seo TYPE string;
  -- 'google_business_profile' | 'reviews' | 'photos' | 'citations' | 'keywords' | 'posts'
DEFINE FIELD IF NOT EXISTS current_state  ON local_seo TYPE option<string>;
  -- description of current state
DEFINE FIELD IF NOT EXISTS suggested_action ON local_seo TYPE option<string>;
  -- specific action to improve
DEFINE FIELD IF NOT EXISTS est_impact      ON local_seo TYPE float DEFAULT 0;
  -- 0-100, estimated ranking improvement if action taken
DEFINE FIELD IF NOT EXISTS google_ranking ON local_seo TYPE option<int>;
  -- current position in local pack (1-3 = local pack, 4+ = below)
DEFINE FIELD IF NOT EXISTS review_count   ON local_seo TYPE option<int>;
DEFINE FIELD IF NOT EXISTS avg_rating     ON local_seo TYPE option<float>;
DEFINE FIELD IF NOT EXISTS review_velocity ON local_seo TYPE option<float>;
  -- reviews per week
DEFINE FIELD IF NOT EXISTS photo_count    ON local_seo TYPE option<int>;
DEFINE FIELD IF NOT EXISTS days_since_photo ON local_seo TYPE option<int>;
DEFINE FIELD IF NOT EXISTS keyword_suggestions ON local_seo TYPE option<string>;
  -- JSON: array of suggested keywords
DEFINE FIELD IF NOT EXISTS description     ON local_seo TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON local_seo TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON local_seo TYPE option<string>;
  -- 'fix_now' | 'schedule_weekly' | 'monitor' | 'hire_specialist' | 'automate'
DEFINE FIELD IF NOT EXISTS status          ON local_seo TYPE string DEFAULT 'open';
  -- 'open' | 'fixed' | 'scheduled' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON local_seo TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON local_seo TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ls_rule_id   ON local_seo FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ls_severity  ON local_seo FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ls_status    ON local_seo FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ls_category  ON local_seo FIELDS category;

-- Settings
DEFINE FIELD IF NOT EXISTS local_seo_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS local_seo_target_review_velocity ON settings TYPE option<float> DEFAULT 2.0;
  -- target 2 reviews per week
DEFINE FIELD IF NOT EXISTS local_seo_photo_freshness_days ON settings TYPE option<int> DEFAULT 7;
  -- photos should be updated every 7 days
DEFINE FIELD IF NOT EXISTS local_seo_target_ranking  ON settings TYPE option<int> DEFAULT 3;
  -- target top 3 (local pack)
