-- Migration: 2026_10_23_menu_photography_impact.surql
--
-- AI Menu Item Photography Impact Analyzer — 132nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from poor/no
-- food photography on digital menus (Cornell Digital Menu Study, NRA Online):
--   - Items with professional photos get 30-40% more orders than text-only
--   - Items with amateur photos get only 10-15% uplift (bad photo = bad impression)
--   - No photo = invisible: 50% of digital menu users skip text-only items
--   - Lighting, angle, background, garnish visibility all affect appeal
--   - High-margin items without photos lose the most revenue (invisible profit)
--   - Delivery app thumbnails: small photo quality matters even more
--   - No POS tracks how photography quality correlates with order rates
--   - Photos taken once at launch, never updated (food styling evolves)
--   - New items launched without photos → poor adoption → "flop"
--   - Seasonal items without photos → missed visual appeal window
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO photography impact
-- analysis. menu-description-impact analyzes TEXT. dish-popularity tracks
-- volume. menu-optimization does BCG matrix. None analyze how PHOTO QUALITY
-- affects ordering rates.
--
-- This new service ANALYZES PHOTOGRAPHY IMPACT:
--   - Tracks photo status per item (professional, amateur, none)
--   - Correlates photo quality with order rate
--   - Identifies high-margin items without photos (invisible profit)
--   - Detects photo age (stale photos losing impact)
--   - Recommends which items need professional photography first
--   - Calculates ROI of photography investment per item
--   - Tracks post-photo order rate uplift (validates investment)
--   - Identifies photo quality patterns (lighting, angle, background)

DEFINE TABLE IF NOT EXISTS menu_photography_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_photography_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON menu_photography_alert TYPE string;
  -- 'no_photo_high_margin' | 'amateur_photo_upgrade' | 'stale_photo' | 'photo_uplift_confirmed' |
--   'new_item_no_photo' | 'photo_quality_gap' | 'delivery_thumbnail_issue' | 'photo_inconsistency'
DEFINE FIELD IF NOT EXISTS severity        ON menu_photography_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON menu_photography_alert TYPE string;
DEFINE FIELD IF NOT EXISTS photo_status    ON menu_photography_alert TYPE option<string>;
  -- 'professional' | 'amateur' | 'none'
DEFINE FIELD IF NOT EXISTS photo_age_months ON menu_photography_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS order_rate_pct  ON menu_photography_alert TYPE option<float>;
  -- % of customers who order this item
DEFINE FIELD IF NOT EXISTS peer_avg_order_rate ON menu_photography_alert TYPE option<float>;
  -- avg for items with professional photos
DEFINE FIELD IF NOT EXISTS order_rate_gap  ON menu_photography_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS margin_per_unit ON menu_photography_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS monthly_volume  ON menu_photography_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_photo_cost  ON menu_photography_alert TYPE option<float>;
  -- estimated cost of professional photography
DEFINE FIELD IF NOT EXISTS predicted_uplift_pct ON menu_photography_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_monthly_uplift ON menu_photography_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS roi_months       ON menu_photography_alert TYPE option<int>;
  -- months to recover photo cost
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON menu_photography_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON menu_photography_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_photography_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_photography_alert TYPE option<string>;
  -- 'hire_photographer' | 'upgrade_photo' | 'refresh_photo' | 'add_photo' |
--   'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON menu_photography_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_photography_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_photography_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_menuphoto_rule      ON menu_photography_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_menuphoto_status    ON menu_photography_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_menuphoto_severity  ON menu_photography_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_menuphoto_item      ON menu_photography_alert FIELDS menu_item;
DEFINE FIELD IF NOT EXISTS menuphoto_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS menuphoto_gap_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % order rate gap to flag (default 15%)
DEFINE FIELD IF NOT EXISTS menuphoto_stale_months  ON settings TYPE option<int> DEFAULT 18;
  -- months after which photo is stale (default 18)
DEFINE FIELD IF NOT EXISTS menuphoto_pro_cost      ON settings TYPE option<float> DEFAULT 75.0;
  -- estimated cost per professional photo (default $75)
