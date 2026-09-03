-- Migration: 2026_08_30_ad_targeting.surql
--
-- AI Social Media Ad Targeting Optimizer — 68th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste 40-60% of ad spend on poorly targeted
-- social media ads (HubSpot restaurant marketing report). Facebook/Instagram
-- ads cost $5-15 CPM, but without POS data integration, targeting is based on
-- generic demographics, not actual customer behavior. Restaurants with POS-
-- integrated ad targeting see 3-5x ROI improvement (Meta restaurant case studies).
--
-- Toast, Square, Lightspeed have NO ad targeting integration. Marketing
-- platforms (Mailchimp $75/mo, Constant Contact $50/mo) do email/SMS, not
-- social ad optimization. POSR's social-content.service generates ORGANIC
-- posts. marketing.service does email/SMS to EXISTING customers. Neither
-- optimizes PAID social media AD TARGETING using POS customer data.
--
-- Distinct from:
--   - social-content.service (generates ORGANIC posts — NOT paid ad targeting)
--   - marketing.service (email/SMS to EXISTING customers — NOT ad acquisition)
--   - segmentation.service (RFM segments for campaigns — NOT ad audience building)
--   - competitor-monitoring.service (tracks competitor prices — NOT ad optimization)
--   - milestone-campaign.service (birthday/anniversary emails — NOT ads)
--
-- This service builds AD AUDIENCES from POS data, optimizes ad spend per
-- platform, tracks ROI, and recommends lookalike audiences.

DEFINE TABLE IF NOT EXISTS ad_targeting TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON ad_targeting TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON ad_targeting TYPE string;
  -- 'lookalike_audience' | 'high_value_retarget' | 'lapsed_customer_winback' | 'demographic_optimize' | 'budget_optimize'
DEFINE FIELD IF NOT EXISTS severity       ON ad_targeting TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS platform        ON ad_targeting TYPE string;
  -- 'facebook' | 'instagram' | 'tiktok' | 'google_ads' | 'twitter'
DEFINE FIELD IF NOT EXISTS audience_name  ON ad_targeting TYPE option<string>;
DEFINE FIELD IF NOT EXISTS audience_type  ON ad_targeting TYPE option<string>;
  -- 'lookalike' | 'retarget' | 'interest' | 'demographic' | 'custom'
DEFINE FIELD IF NOT EXISTS audience_size  ON ad_targeting TYPE int DEFAULT 0;
  -- estimated audience reach
DEFINE FIELD IF NOT EXISTS suggested_budget ON ad_targeting TYPE float DEFAULT 0;
  -- recommended daily ad spend ($)
DEFINE FIELD IF NOT EXISTS est_reach       ON ad_targeting TYPE int DEFAULT 0;
  -- estimated impressions
DEFINE FIELD IF NOT EXISTS est_clicks      ON ad_targeting TYPE int DEFAULT 0;
  -- estimated clicks
DEFINE FIELD IF NOT EXISTS est_conversions ON ad_targeting TYPE int DEFAULT 0;
  -- estimated new customers
DEFINE FIELD IF NOT EXISTS est_revenue     ON ad_targeting TYPE float DEFAULT 0;
  -- projected revenue from conversions
DEFINE FIELD IF NOT EXISTS est_roas        ON ad_targeting TYPE float DEFAULT 0;
  -- return on ad spend (revenue / spend)
DEFINE FIELD IF NOT EXISTS targeting_criteria ON ad_targeting TYPE option<string>;
  -- JSON: {age_min, age_max, genders, interests, locations, radius_km}
DEFINE FIELD IF NOT EXISTS source_segment  ON ad_targeting TYPE option<string>;
  -- POS segment used to build audience (e.g. 'champions', 'at_risk')
DEFINE FIELD IF NOT EXISTS description     ON ad_targeting TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON ad_targeting TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON ad_targeting TYPE option<string>;
  -- 'launch_now' | 'increase_budget' | 'decrease_budget' | 'test_audience' | 'pause'
DEFINE FIELD IF NOT EXISTS status          ON ad_targeting TYPE string DEFAULT 'open';
  -- 'open' | 'launched' | 'paused' | 'completed' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON ad_targeting TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON ad_targeting TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_at_rule_id   ON ad_targeting FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_at_platform  ON ad_targeting FIELDS platform;
DEFINE INDEX IF NOT EXISTS idx_at_status    ON ad_targeting FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_at_audience  ON ad_targeting FIELDS audience_type;

-- Settings
DEFINE FIELD IF NOT EXISTS ad_targeting_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS ad_targeting_default_budget   ON settings TYPE option<float> DEFAULT 25;
  -- default daily budget $25
DEFINE FIELD IF NOT EXISTS ad_targeting_target_roas      ON settings TYPE option<float> DEFAULT 4.0;
  -- target 4x return on ad spend
DEFINE FIELD IF NOT EXISTS ad_targeting_lookalike_source ON settings TYPE option<string> DEFAULT 'champions';
  -- segment to use for lookalike audience base
