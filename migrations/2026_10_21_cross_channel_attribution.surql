-- Migration: 2026_10_21_cross_channel_attribution.surql
--
-- AI Cross-Channel Customer Attribution Tracker — 130th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste $500-2,000/mo per location on marketing
-- with no attribution tracking (NRA Marketing, Cornell Attribution Study):
--   - 70% of restaurants don't know which channel drives the most customers
--   - Social media ads, email campaigns, walk-ins, referrals, delivery apps all
--     compete for credit but no POS tracks which ACTUALLY drove the order
--   - Marketing budget allocated by gut feel, not data
--   - Walk-in customers assumed "organic" but may be driven by social visibility
--   - Delivery app orders attributed to app, not to the social ad that drove
--     the customer to the app
--   - Referral customers not tracked → referral programs underfunded
--   - Email campaigns have no order attribution → ROI unknown
--   - Multi-touch journeys: customer sees social ad → visits website →
--     walks in 3 days later → which channel gets credit?
--   - No POS connects marketing touchpoints to actual orders
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO cross-channel
-- attribution. ad-roi-tracker tracks ad spend ROI. ad-targeting optimizes
-- targeting. marketing-automation automates campaigns. local-seo tracks SEO.
-- social-listening monitors social. None CONNECT marketing channels to
-- actual order attribution per customer.
--
-- This new service TRACKS CROSS-CHANNEL ATTRIBUTION:
--   - Identifies which channel drove each customer's first + repeat orders
--   - Tracks multi-touch journeys (social → email → walk-in)
--   - Measures CAC (customer acquisition cost) per channel
--   - Calculates LTV:CAC ratio per channel
--   - Detects underperforming channels (high spend, low attribution)
--   - Identifies high-ROI channels (low spend, high attribution)
--   - Recommends budget reallocation across channels
--   - Tracks channel attribution decay (channel losing effectiveness)

DEFINE TABLE IF NOT EXISTS cross_channel_attribution_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cross_channel_attribution_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON cross_channel_attribution_alert TYPE string;
  -- 'channel_underperforming' | 'channel_overperforming' | 'high_cac_channel' |
--   'multi_touch_journey' | 'referral_undervalued' | 'channel_attribution_decay' |
--   'budget_misallocation' | 'emerging_channel'
DEFINE FIELD IF NOT EXISTS severity        ON cross_channel_attribution_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS channel         ON cross_channel_attribution_alert TYPE string;
  -- 'social_media' | 'email' | 'walk_in' | 'referral' | 'delivery_app' | 'website' | 'google_search'
DEFINE FIELD IF NOT EXISTS monthly_spend   ON cross_channel_attribution_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS attributed_orders ON cross_channel_attribution_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS attributed_revenue ON cross_channel_attribution_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS cac_per_customer ON cross_channel_attribution_alert TYPE option<float>;
  -- customer acquisition cost for this channel
DEFINE FIELD IF NOT EXISTS avg_ltv         ON cross_channel_attribution_alert TYPE option<float>;
  -- avg lifetime value of customers from this channel
DEFINE FIELD IF NOT EXISTS ltv_cac_ratio   ON cross_channel_attribution_alert TYPE option<float>;
  -- LTV:CAC ratio (3+ = healthy, <1 = losing money)
DEFINE FIELD IF NOT EXISTS roi_pct         ON cross_channel_attribution_alert TYPE option<float>;
  -- return on investment %
DEFINE FIELD IF NOT EXISTS attribution_share_pct ON cross_channel_attribution_alert TYPE option<float>;
  -- % of total orders attributed to this channel
DEFINE FIELD IF NOT EXISTS spend_share_pct ON cross_channel_attribution_alert TYPE option<float>;
  -- % of total marketing spend on this channel
DEFINE FIELD IF NOT EXISTS misalignment_pct ON cross_channel_attribution_alert TYPE option<float>;
  -- spend_share - attribution_share (positive = overspending)
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON cross_channel_attribution_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON cross_channel_attribution_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON cross_channel_attribution_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cross_channel_attribution_alert TYPE option<string>;
  -- 'reallocate_budget' | 'increase_spend' | 'decrease_spend' | 'optimize_campaign' |
--   'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON cross_channel_attribution_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON cross_channel_attribution_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON cross_channel_attribution_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_attrack_rule      ON cross_channel_attribution_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_attrack_status    ON cross_channel_attribution_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_attrack_severity  ON cross_channel_attribution_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_attrack_channel   ON cross_channel_attribution_alert FIELDS channel;

DEFINE FIELD IF NOT EXISTS attrack_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS attrack_misalignment_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % misalignment to flag budget misallocation (default 15%)
DEFINE FIELD IF NOT EXISTS attrack_cac_warning   ON settings TYPE option<float> DEFAULT 50.0;
  -- CAC above this to flag as high (default $50)
DEFINE FIELD IF NOT EXISTS attrack_ltv_cac_min   ON settings TYPE option<float> DEFAULT 3.0;
  -- min healthy LTV:CAC ratio (default 3x)
