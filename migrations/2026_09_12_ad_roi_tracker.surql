-- Migration: 2026_09_12_ad_roi_tracker.surql
--
-- AI Social Media Ad ROI Tracker — 91st POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste $200-1,000/mo per location on social
-- media ads that don't convert (NRA Marketing Report, Toast Marketing Survey):
--   - Clicks don't convert: 60-80% of ad clicks never become orders
--   - Wrong platform: spending on Facebook when audience is on TikTok
--   - Creative fatigue: same ad shown 100+ times, CTR drops 40%
--   - Audience mismatch: targeting 25-34 but customers are 35-54
--   - Budget overspend: $500/mo on platform returning $200 in orders
--   - Conversion lag: customer clicks ad but orders 7 days later — ad gets
--     no credit
--   - No attribution: can't link specific order to specific ad
--   - Platform reallocation: Instagram 3x ROI of Facebook but budget split 50/50
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO ad ROI tracking.
-- Toast Marketing ($185/mo) sends campaigns but doesn't track ROI. Third-party
-- attribution tools (Triple Whale, Northbeam, Hyros) cost $300-1,000/mo and
-- are designed for e-commerce, not restaurants.
--
-- POSR's existing services cover DIFFERENT marketing aspects:
--   - marketing.service = CAMPAIGN creation + sending (email/SMS) — NOT
--     social media ad ROI tracking
--   - social-content.service = CONTENT generation for social posts — NOT
--     ad performance tracking
--   - ad-targeting.service = AUDIENCE targeting optimization — NOT ROI
--     tracking per platform/campaign
--   - promo-analytics.service = PROMO code performance — NOT social ad ROI
--   - segmentation.service = CUSTOMER segmentation — NOT ad attribution
--   - review-response.service = REVIEW response generation — NOT ad ROI
--
-- This new service TRACKS SOCIAL MEDIA AD ROI:
--   - Tracks ad spend per platform (Facebook, Instagram, TikTok, Google)
--   - Attributes orders to specific ads (promo codes, UTM links, landing pages)
--   - Calculates ROI per platform, campaign, creative
--   - Identifies low-ROI platforms for budget reallocation
--   - Detects creative fatigue (CTR declining)
--   - Flags audience mismatches
--   - Tracks conversion lag (click-to-order time)
--   - Recommends budget reallocation to high-ROI platforms

DEFINE TABLE IF NOT EXISTS ad_roi_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON ad_roi_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON ad_roi_alert TYPE string;
  -- 'low_roi_platform' | 'high_roi_campaign' | 'click_no_order' |
--   'audience_mismatch' | 'budget_overspend' | 'creative_fatigue' |
--   'conversion_lag' | 'platform_reallocation'
DEFINE FIELD IF NOT EXISTS severity        ON ad_roi_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS platform        ON ad_roi_alert TYPE string;
  -- 'facebook' | 'instagram' | 'tiktok' | 'google' | 'youtube'
DEFINE FIELD IF NOT EXISTS campaign_name   ON ad_roi_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ad_spend        ON ad_roi_alert TYPE float DEFAULT 0;
  -- $ spent this month on this platform/campaign
DEFINE FIELD IF NOT EXISTS orders_attributed ON ad_roi_alert TYPE option<int>;
  -- number of orders attributed to this ad
DEFINE FIELD IF NOT EXISTS revenue_attributed ON ad_roi_alert TYPE float DEFAULT 0;
  -- $ revenue from attributed orders
DEFINE FIELD IF NOT EXISTS roi_pct         ON ad_roi_alert TYPE float DEFAULT 0;
  -- ROI % = (revenue - spend) / spend × 100
DEFINE FIELD IF NOT EXISTS ctr_pct         ON ad_roi_alert TYPE option<float>;
  -- click-through rate %
DEFINE FIELD IF NOT EXISTS conversion_rate_pct ON ad_roi_alert TYPE option<float>;
  -- order conversion rate % (orders / clicks)
DEFINE FIELD IF NOT EXISTS avg_click_to_order_hours ON ad_roi_alert TYPE option<float>;
  -- avg hours between ad click and order
DEFINE FIELD IF NOT EXISTS est_wasted_spend ON ad_roi_alert TYPE float DEFAULT 0;
  -- $ wasted on low-ROI ads
DEFINE FIELD IF NOT EXISTS est_revenue_opportunity ON ad_roi_alert TYPE float DEFAULT 0;
  -- $ upside if budget reallocated
DEFINE FIELD IF NOT EXISTS description     ON ad_roi_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON ad_roi_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON ad_roi_alert TYPE option<string>;
  -- 'reallocate_budget' | 'pause_campaign' | 'refresh_creative' | 'adjust_audience' |
--   'scale_winner' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON ad_roi_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON ad_roi_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON ad_roi_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_adroi_rule      ON ad_roi_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_adroi_status    ON ad_roi_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_adroi_severity  ON ad_roi_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_adroi_platform  ON ad_roi_alert FIELDS platform;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS adroi_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS adroi_min_roi_pct      ON settings TYPE option<float> DEFAULT 100.0;
  -- minimum ROI % (100 = breakeven, below = losing money)
DEFINE FIELD IF NOT EXISTS adroi_max_click_no_order_pct ON settings TYPE option<float> DEFAULT 80.0;
  -- max % of clicks with no order before alert (default 80%)
DEFINE FIELD IF NOT EXISTS adroi_creative_fatigue_impressions ON settings TYPE option<int> DEFAULT 5000;
  -- impressions before creative fatigue check (default 5000)
DEFINE FIELD IF NOT EXISTS adroi_conversion_lag_hours ON settings TYPE option<float> DEFAULT 72.0;
  -- hours after which conversion lag is concerning (default 72h = 3 days)
