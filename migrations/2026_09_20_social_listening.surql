-- Migration: 2026_09_20_social_listening.surql
--
-- AI Restaurant Social Listening Monitor — 99th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-1,000/mo from not monitoring social
-- media mentions (Sprout Social, BrightLocal):
--   - Unanswered complaints: 30% of social complaints become 1-star reviews
--     if not addressed within 1 hour → $200-500/mo lost revenue per bad review
--   - Missed viral moments: customer posts photo that gets 10k+ likes →
--     restaurant doesn't capitalize → $500-2,000/mo missed revenue
--   - Competitor mentions: customers comparing you to competitor on social →
--     you don't know → lose customers without fighting back
--   - Influencer visits: micro-influencer (10k-100k followers) posts about
--     you → not engaging = missed 5-20% follower conversion
--   - Check-in spikes: sudden increase in Foursquare/FB check-ins → demand
--     spike you should prepare for
--   - Hashtag trends: #FoodTok #RestaurantTok trending → not posting = miss
--     organic reach worth $200-500 in ad spend
--   - Negative sentiment spike: multiple negative posts in short window →
--     reputation crisis if not addressed
--   - Brand mention gap: competitor gets 5x more mentions → losing mindshare
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO social listening.
-- sentiment.service analyzes reviews (post-facto). social-content.service
-- generates posts (outbound). review-response.service responds to reviews.
-- None MONITOR real-time social mentions.
--
-- Third-party social listening (Sprout Social $99-249/mo, Hootsuite $99/mo,
-- Mention $29-99/mo) are general-purpose — not restaurant-specific, don't
-- integrate with POS data (check-ins, orders, reservations).
--
-- This new service MONITORS SOCIAL MEDIA in real-time:
--   - Tracks brand mentions across platforms (Twitter/X, Instagram, TikTok,
--     Facebook, Google Maps, Yelp, Reddit)
--   - Detects complaints before they become reviews
--   - Identifies viral moments for amplification
--   - Monitors competitor social activity
--   - Tracks influencer visits + engagement opportunities
--   - Alerts on check-in volume spikes
--   - Monitors hashtag trends for content opportunities
--   - Detects negative sentiment spikes for crisis management

DEFINE TABLE IF NOT EXISTS social_listening_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON social_listening_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON social_listening_alert TYPE string;
  -- 'complaint_detected' | 'viral_moment' | 'competitor_mention' |
--   'influencer_visit' | 'check_in_spike' | 'hashtag_trend' |
--   'negative_sentiment_spike' | 'brand_mention_gap'
DEFINE FIELD IF NOT EXISTS severity        ON social_listening_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS platform        ON social_listening_alert TYPE string;
  -- 'twitter' | 'instagram' | 'tiktok' | 'facebook' | 'google' | 'yelp' | 'reddit'
DEFINE FIELD IF NOT EXISTS mention_count   ON social_listening_alert TYPE option<int>;
  -- number of mentions in detection window
DEFINE FIELD IF NOT EXISTS sentiment_score ON social_listening_alert TYPE option<float>;
  -- -1.0 to 1.0 (negative to positive)
DEFINE FIELD IF NOT EXISTS reach           ON social_listening_alert TYPE option<int>;
  -- estimated total reach of mentions
DEFINE FIELD IF NOT EXISTS influencer_followers ON social_listening_alert TYPE option<int>;
  -- follower count if influencer mention
DEFINE FIELD IF NOT EXISTS competitor_name ON social_listening_alert TYPE option<string>;
  -- competitor being mentioned (if applicable)
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON social_listening_alert TYPE float DEFAULT 0;
  -- $ revenue at risk or opportunity
DEFINE FIELD IF NOT EXISTS impact_type     ON social_listening_alert TYPE option<string>;
  -- 'risk' | 'opportunity'
DEFINE FIELD IF NOT EXISTS description     ON social_listening_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON social_listening_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON social_listening_alert TYPE option<string>;
  -- 'respond_now' | 'amplify' | 'engage_influencer' | 'create_content' |
--   'crisis_management' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON social_listening_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON social_listening_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON social_listening_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_social_rule      ON social_listening_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_social_status    ON social_listening_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_social_severity  ON social_listening_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_social_platform  ON social_listening_alert FIELDS platform;

-- Settings
DEFINE FIELD IF NOT EXISTS social_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS social_scan_interval_min ON settings TYPE option<int> DEFAULT 15;
  -- scan interval in minutes (default 15 min for real-time monitoring)
DEFINE FIELD IF NOT EXISTS social_complaint_response_max_min ON settings TYPE option<int> DEFAULT 60;
  -- max minutes to respond to complaint before it becomes a review (default 60)
DEFINE FIELD IF NOT EXISTS social_viral_threshold ON settings TYPE option<int> DEFAULT 5000;
  -- reach threshold for viral alert (default 5,000 reach)
