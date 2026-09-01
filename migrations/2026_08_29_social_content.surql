-- Migration: 2026_08_29_social_content.surql
--
-- AI Social Media Content Generator — 52nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend $200-$500/mo on social media management
-- (Hootsuite $99/mo, Buffer $60/mo, Sprout Social $249/mo) + $50-150/mo on
-- content creation (freelance writers). 73% of restaurants say social media is
-- their #1 marketing channel but 68% struggle with consistent content
-- (National Restaurant Association).
--
-- Toast, Square, Lightspeed have ZERO social media content generation.
-- Marketing.service in POSR handles email/SMS campaigns to existing customers
-- but DOES NOT generate social media posts for acquisition.
--
-- POSR auto-generates platform-specific social content from restaurant data:
--   - Menu highlights (new dishes, bestsellers, seasonal specials)
--   - Customer reviews (turn 5★ reviews into promotional posts)
--   - Events/promotions (happy hour, live music, holiday menus)
--   - Behind-the-scenes (kitchen prep, staff spotlights)
--   - Engagement posts (polls, questions, food facts)
--
-- Distinct from:
--   - marketing.service (email/SMS campaigns to existing customers — NOT
--     social media content generation for acquisition)
--   - sentiment.service (analyzes reviews — doesn't create social posts)
--   - review-response.service (responds to reviews — doesn't generate
--     promotional social content)
--   - menu-optimization.service (BCG matrix — not social media)
--   - promo-analytics.service (tracks promo performance — doesn't create content)

DEFINE TABLE IF NOT EXISTS social_post TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON social_post TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON social_post TYPE string;
  -- 'menu_highlight' | 'review_showcase' | 'event_promotion' | 'behind_scenes' | 'engagement_poll'
DEFINE FIELD IF NOT EXISTS severity       ON social_post TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low' (priority for scheduling)
DEFINE FIELD IF NOT EXISTS platform        ON social_post TYPE string;
  -- 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'linkedin'
DEFINE FIELD IF NOT EXISTS content_type    ON social_post TYPE string;
  -- 'image_post' | 'carousel' | 'story' | 'reel' | 'text_only'
DEFINE FIELD IF NOT EXISTS caption         ON social_post TYPE option<string>;
  -- generated caption text
DEFINE FIELD IF NOT EXISTS hashtags        ON social_post TYPE option<string>;
  -- comma-separated hashtags
DEFINE FIELD IF NOT EXISTS suggested_image_prompt ON social_post TYPE option<string>;
  -- AI prompt for image generation (or stock photo search terms)
DEFINE FIELD IF NOT EXISTS best_post_time  ON social_post TYPE option<datetime>;
  -- optimal posting time based on audience engagement
DEFINE FIELD IF NOT EXISTS source_data     ON social_post TYPE option<string>;
  -- JSON: what triggered this post (dish name, review ID, event name)
DEFINE FIELD IF NOT EXISTS est_reach       ON social_post TYPE int DEFAULT 0;
  -- predicted reach based on platform + content type
DEFINE FIELD IF NOT EXISTS est_engagement_rate ON social_post TYPE float DEFAULT 0;
  -- predicted engagement rate (0-1)
DEFINE FIELD IF NOT EXISTS description     ON social_post TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON social_post TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON social_post TYPE option<string>;
  -- 'post_now' | 'schedule_optimal' | 'edit_image_first' | 'hold_for_event' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON social_post TYPE string DEFAULT 'open';
  -- 'open' | 'scheduled' | 'posted' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS posted_at       ON social_post TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS detected_at     ON social_post TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON social_post TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_sp_rule_id   ON social_post FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_sp_platform  ON social_post FIELDS platform;
DEFINE INDEX IF NOT EXISTS idx_sp_status    ON social_post FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_sp_post_time ON social_post FIELDS best_post_time;

-- Settings
DEFINE FIELD IF NOT EXISTS social_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS social_brand_voice      ON settings TYPE option<string> DEFAULT 'casual';
  -- 'formal' | 'casual' | 'playful'
DEFINE FIELD IF NOT EXISTS social_hashtag_count    ON settings TYPE option<int>   DEFAULT 8;
  -- max hashtags per post (Instagram allows 30, but 7-9 optimal)
DEFINE FIELD IF NOT EXISTS social_max_caption_chars ON settings TYPE option<int>  DEFAULT 2200;
  -- Instagram limit 2200, Twitter 280, Facebook 63206
