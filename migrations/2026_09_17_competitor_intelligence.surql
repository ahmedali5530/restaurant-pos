-- Migration: 2026_09_17_competitor_intelligence.surql
--
-- AI Restaurant Competitor Intelligence Dashboard — 96th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-2,000/mo per location from not
-- tracking competitor activity (NRA Competitive Intelligence Report):
--   - Missed promo responses: competitor launches 20% off → 15-25% customer
--     shift for 1-2 weeks → $300-800 lost revenue
--   - New menu items: competitor adds trending item (plant-based, poke bowl)
--     → customers flock there → $200-500/mo until you catch up
--   - Hours changes: competitor opens earlier/closes later → captures your
--     early morning/late night customers → $100-300/mo
--   - Review shifts: competitor gets 4.8→4.2 rating drop → opportunity to
--     capture dissatisfied customers → $200-500/mo gain
--   - Price undercutting: competitor drops price 10% on popular items →
--     customers switch → $200-400/mo
--   - Event announcements: competitor hosts trivia night/live music → draws
--     weekend crowd → $300-700/event lost
--   - Rating decline: your rating drops vs competitor → SEO/review platform
--     ranking drops → $200-500/mo lost visibility
--   - Closing risk: competitor may close → opportunity to capture their
--     customers → $1,000-3,000/mo revenue gain
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO competitor
-- intelligence. competitor-monitoring.service tracks competitor PRICES only.
-- Third-party competitive intelligence (Gravy Analytics, Sensor Tower,
-- Adbeat) cost $500-2,000/mo and are for tech/retail, not restaurants.
--
-- POSR's existing competitor-monitoring.service = PRICE tracking only
-- (competitor menu prices vs our prices + MATCH/UNDERCUT/PREMIUM recs).
-- It does NOT track promos, new items, hours, reviews, events, or closing.
--
-- This new service provides COMPREHENSIVE competitor intelligence:
--   - Tracks competitor promotions (discounts, coupons, special offers)
--   - Monitors new menu items + trending additions
--   - Alerts on competitor hours changes
--   - Tracks competitor review ratings over time
--   - Detects price undercutting on popular items
--   - Monitors competitor events (trivia, live music, special nights)
--   - Flags competitor rating shifts (up or down)
--   - Identifies closing-risk competitors (revenue capture opportunity)

DEFINE TABLE IF NOT EXISTS competitor_intel_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON competitor_intel_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON competitor_intel_alert TYPE string;
  -- 'promo_detected' | 'new_menu_item' | 'hours_change' | 'review_shift' |
--   'price_undercut' | 'event_announcement' | 'rating_decline' | 'closing_risk'
DEFINE FIELD IF NOT EXISTS severity        ON competitor_intel_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS competitor_name ON competitor_intel_alert TYPE string;
DEFINE FIELD IF NOT EXISTS competitor_distance_km ON competitor_intel_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS change_type     ON competitor_intel_alert TYPE option<string>;
  -- 'promo' | 'menu' | 'hours' | 'review' | 'price' | 'event' | 'rating' | 'closing'
DEFINE FIELD IF NOT EXISTS previous_value  ON competitor_intel_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_value   ON competitor_intel_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS competitor_rating ON competitor_intel_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS our_rating      ON competitor_intel_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON competitor_intel_alert TYPE float DEFAULT 0;
  -- $ revenue at risk or opportunity
DEFINE FIELD IF NOT EXISTS impact_type     ON competitor_intel_alert TYPE option<string>;
  -- 'risk' | 'opportunity'
DEFINE FIELD IF NOT EXISTS recommended_action ON competitor_intel_alert TYPE option<string>;
  -- specific action to take
DEFINE FIELD IF NOT EXISTS description     ON competitor_intel_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON competitor_intel_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON competitor_intel_alert TYPE option<string>;
  -- 'respond_now' | 'monitor' | 'capitalize' | 'adjust_pricing' | 'launch_counter' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON competitor_intel_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON competitor_intel_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON competitor_intel_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_intel_rule      ON competitor_intel_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_intel_status    ON competitor_intel_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_intel_severity  ON competitor_intel_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_intel_competitor ON competitor_intel_alert FIELDS competitor_name;

-- Settings
DEFINE FIELD IF NOT EXISTS intel_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS intel_radius_km       ON settings TYPE option<float> DEFAULT 5.0;
  -- competitor tracking radius in km (default 5km)
DEFINE FIELD IF NOT EXISTS intel_scan_frequency  ON settings TYPE option<int> DEFAULT 7;
  -- scan frequency in days (default weekly)
DEFINE FIELD IF NOT EXISTS intel_max_competitors ON settings TYPE option<int> DEFAULT 10;
  -- max competitors to track (default 10)
